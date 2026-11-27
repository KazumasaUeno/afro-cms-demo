// お客様ポータルのスケジュール（U4。src/live/portalSchedule.ts）と承認の履歴の CSV（src/features/projects/approvalCsv.ts）。React・Firebase を import しない。
// 実行: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clientApprovalShown, clientScheduleNotice, clientScheduleState, clientWbsCurrent, isPermissionDenied } from '../../src/live/portalSchedule.ts';
import { clientScheduleView } from '../../src/live/schedule.ts';
import { approvalCsvRows } from '../../src/features/projects/approvalCsv.ts';
import { approvalLogFrom } from '../../src/live/model.ts';

const dates = { buildDue: '2027-01-10', deliveryDate: '2027-01-20', releaseDate: '2027-01-31' };
const wbs = [
  { id: 'sitemap', start: '2026-12-01', end: '2026-12-05', doneAt: '2026-12-04T00:00:00.000Z' },
  { id: 'build', start: '2026-12-06', end: '2027-01-10' },
];
const current = (over = {}) => ({ revision: 1, editSeq: 4, dates, wbs, updatedBy: 'devA', copy: { ...dates }, ...over });
const summary = (over = {}) => ({ status: 'requested', revision: 1, requestedAt: '2026-12-01T01:00:00.000Z', releaseDate: dates.releaseDate, ...over });

test('clientScheduleState: 未作成は null・依頼中は requestedAt・承認済みは approvedAt。WBS は日付だけ（担当・完了印の日時を持たない）', () => {
  assert.equal(clientScheduleState({ kind: 'none' }, null), null);
  const req = clientScheduleState(clientScheduleView(summary(), current()), summary());
  assert.equal(req.requestedAt, '2026-12-01T01:00:00.000Z');
  assert.equal(req.schedule.approvedAt, undefined);
  assert.deepEqual(req.schedule.wbs, [{ id: 'sitemap', start: '2026-12-01', end: '2026-12-05' }, { id: 'build', start: '2026-12-06', end: '2027-01-10' }]);
  assert.equal(req.schedule.note, undefined);
  assert.equal(req.schedule.savedBy, '');
  const ap = summary({ status: 'approved', approvedRevision: 1, approvedAt: '2026-12-02T00:00:00.000Z' });
  const st = clientScheduleState(clientScheduleView(ap, current()), ap);
  assert.equal(st.schedule.approvedAt, '2026-12-02T00:00:00.000Z');
  assert.equal(st.requestedAt, undefined);
});

test('clientScheduleState: 差し戻し後（下書き・承認歴なし）は current に版が残っていても null（S-1・§6.2）', () => {
  const s = summary({ status: 'draft' });
  assert.equal(clientScheduleState(clientScheduleView(s, current()), s), null);
});

test('再計画中: 承認の写しの予定日と「調整中」の案内。承認のボタンの版は出さない', () => {
  const s = summary({ status: 'draft', revision: 2, approvedRevision: 1, approvedAt: '2026-12-02T00:00:00.000Z' });
  const copy = { revision: 1, dates: { deliveryDate: '2027-02-01', releaseDate: '2027-02-10' }, wbs };
  const cv = clientScheduleView(s, current({ revision: 2 }), copy);
  const st = clientScheduleState(cv, s);
  assert.equal(st.schedule.deliveryDate, '2027-02-01');
  assert.equal(st.schedule.approvedAt, undefined);
  assert.match(clientScheduleNotice(cv), /調整しています/);
  assert.equal(clientScheduleNotice(clientScheduleView(summary(), current())), undefined);
  assert.equal(clientApprovalShown(s, current({ revision: 2 })), null);
});

test('clientWbsCurrent: 見せる版の WBS（完了印の doneAt つき）だけ。copy は空・未作成は null', () => {
  assert.equal(clientWbsCurrent({ kind: 'none' }, current()), null);
  const c = clientWbsCurrent(clientScheduleView(summary(), current()), current());
  assert.deepEqual(c.wbs, wbs);
  assert.equal(c.editSeq, 4);
  assert.deepEqual(c.copy, {});
});

test('clientApprovalShown（L-18）: 依頼中でその版の current だけ（editSeq と写しを含む表示した値をそのまま返す）', () => {
  const c = current();
  assert.equal(clientApprovalShown(summary(), c), c);
  assert.equal(clientApprovalShown(summary({ revision: 2 }), c), null);
  assert.equal(clientApprovalShown(summary({ status: 'approved' }), c), null);
  assert.equal(clientApprovalShown(null, c), null);
  assert.equal(clientApprovalShown(summary(), null), null);
});

test('isPermissionDenied: Firestore の拒否だけ true', () => {
  assert.ok(isPermissionDenied({ code: 'permission-denied' }));
  assert.ok(isPermissionDenied({ code: 'firestore/permission-denied' }));
  assert.ok(!isPermissionDenied({ code: 'unavailable' }));
  assert.ok(!isPermissionDenied(null));
});

test('承認の履歴の CSV: 取り下げ・再計画の理由と代理承認の理由を操作の欄に出す（OQ-D1・L-8）。要件定義書の withdraw の note は出さない', () => {
  const base = { actorName: '社内 開発A', at: undefined, revision: 1, side: 'afro' };
  const logs = [
    approvalLogFrom('p1', 'schedule-r1-withdraw', { ...base, kind: 'schedule', action: 'withdraw', note: '日程を見直します' }),
    approvalLogFrom('p1', 'schedule-r1-reopen', { ...base, kind: 'schedule', action: 'reopen', note: '公開日を1週間後ろへ' }),
    approvalLogFrom('p1', 'schedule-r1-approve', { ...base, kind: 'schedule', action: 'approve', proxy: true, note: '電話で確認' }),
    approvalLogFrom('p1', 'requirements-r1-withdraw', { ...base, action: 'withdraw', note: '社内メモ' }),
  ];
  const rows = approvalCsvRows(logs);
  assert.deepEqual(rows[0], ['日時（日本時間）', '立場', '操作した人', '操作', '対象']);
  assert.equal(rows.length, 5);
  assert.match(rows[1][3], /（理由：日程を見直します）$/);
  assert.match(rows[2][3], /（理由：公開日を1週間後ろへ）$/);
  assert.match(rows[3][3], /（代理の理由：電話で確認）$/);
  assert.doesNotMatch(rows[4][3], /理由/);
  assert.equal(rows[1][4], 'スケジュール（第1版）');
  assert.equal(rows[1][1], 'アフロ');
});
