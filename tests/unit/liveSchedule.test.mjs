// live のスケジュールの純関数（docs/design/LIVE_SCHEDULE_PLAN.md §10.3 SU-03〜SU-10、LIVE_SCHEDULE_WBS_DATA.md §7.2）。
// React・Firebase を import しない。権限は tests/rules/schedule.test.mjs。実行: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clientNeedsApprovedCopy, clientScheduleView, CLIENT_WBS_STATUS_LABEL, jstYmd, liveScheduleState, releaseYmdOf, scheduleApprovedCopyOf, scheduleConflict,
  scheduleApprovalIdOf, scheduleApproveReplay, scheduleDoc, scheduleForSave, scheduleInternalDoc, scheduleSummaryOf, scheduleYmdOk, validateScheduleInput, validateWbsInput, wbsForSave, wbsProgressLive, wbsWriteChanged,
} from '../../src/live/schedule.ts';
import { statusOf } from '../../src/data/schedule.ts';
import { toProject } from '../../src/live/model.ts';
import { liveProjectView } from '../../src/live/projectView.ts';

const ts = (iso) => ({ toDate: () => new Date(iso), iso });
const IDS = ['sitemap', 'design', 'build', 'buildApproval', 'quality', 'release'];
const wbsMap = (extra = {}) => Object.fromEntries(IDS.map((id, i) => [id, { start: `2027-01-0${i + 1}`, end: `2027-01-0${i + 2}`, ...(extra[id] ?? {}) }]));
const items = (over = {}) => IDS.map((id, i) => ({ id, start: `2027-01-0${i + 1}`, end: `2027-01-0${i + 2}`, ...(over[id] ?? {}) }));
const dates = { buildDue: '2027-01-10', deliveryDate: '2027-01-20', releaseDate: '2027-01-31' };

test('SU-03 scheduleSummaryOf: 無い・壊れた値は null、項目を読む', () => {
  assert.equal(scheduleSummaryOf(undefined), null);
  assert.equal(scheduleSummaryOf({ status: 'x', revision: 0 }), null);
  assert.equal(scheduleSummaryOf({ status: 'draft', revision: -1 }), null);
  assert.deepEqual(scheduleSummaryOf({ status: 'draft', revision: 0 }), { status: 'draft', revision: 0 });
  const s = scheduleSummaryOf({ status: 'approved', revision: 2, releaseDate: '2027-01-31', requestedAt: ts('2026-12-01T00:00:00.000Z'), approvedRevision: 2, approvedVia: 'proxy', approvalId: 'schedule-r2-approve' });
  assert.equal(s.releaseDate, '2027-01-31');
  assert.equal(s.requestedAt, '2026-12-01T00:00:00.000Z');
  assert.equal(s.approvedVia, 'proxy');
});

test('SU-03 scheduleDoc: 文書なし → null、wbs マップ → WBS_ITEMS の順の行、壊れた行と build の doneAt は捨てる、copy は読んだまま', () => {
  assert.equal(scheduleDoc(null), null);
  assert.equal(scheduleDoc({ revision: 0 }), null);
  const done = ts('2026-12-02T00:00:00.000Z');
  const raw = { revision: 1, editSeq: 3, ...dates, wbs: { ...wbsMap({ design: { doneAt: done }, build: { doneAt: done } }), quality: { start: '2027-02-30', end: '2027-03-01' } }, updatedBy: 'u1' };
  const c = scheduleDoc(raw);
  assert.deepEqual(c.wbs.map((w) => w.id), ['sitemap', 'design', 'build', 'buildApproval', 'release']);
  assert.equal(c.wbs[1].doneAt, '2026-12-02T00:00:00.000Z');
  assert.equal('doneAt' in c.wbs[2], false);
  assert.deepEqual(c.dates, dates);
  assert.equal(c.copy.wbs, raw.wbs, 'Timestamp を変換しない（Rules はマップの等式）');
  assert.equal(scheduleDoc({ revision: 1, editSeq: 0, deliveryDate: '2027-02-01', releaseDate: '2027-01-01' }).dates, undefined, '順序逆転は捨てる');
});

test('SU-03 scheduleInternalDoc / scheduleApprovedCopyOf', () => {
  assert.equal(scheduleInternalDoc(undefined), null);
  const i = scheduleInternalDoc({ editSeq: 1, draft: dates, note: 'メモ', assignees: { sitemap: '山田', x: 'y' }, marks: { design: { state: 'done', at: ts('2026-12-02T00:00:00.000Z'), by: 'u1' }, build: { state: 'done' } }, savedByName: '山田' });
  assert.deepEqual(i.draft, dates);
  assert.deepEqual(i.assignees, { sitemap: '山田' });
  assert.deepEqual(Object.keys(i.marks), ['design']);
  assert.equal(scheduleApprovedCopyOf({ kind: 'requirements', action: 'approve', revision: 1, ...dates }), null);
  assert.equal(scheduleApprovedCopyOf({ kind: 'schedule', action: 'approve', revision: 1, ...dates }).revision, 1);
});

const cur = (o = {}) => scheduleDoc({ revision: 2, editSeq: 5, ...dates, wbs: wbsMap(), ...o });

test('SU-04 clientScheduleView: 未作成／依頼中／承認済み／再計画中（同じ版）／差し戻し後で承認歴あり（写し）／承認歴なし', () => {
  assert.equal(clientScheduleView(null, null).kind, 'none');
  assert.equal(clientScheduleView({ status: 'draft', revision: 0 }, null).kind, 'none');
  assert.equal(clientScheduleView({ status: 'requested', revision: 2 }, cur()).status, 'requested');
  assert.equal(clientScheduleView({ status: 'approved', revision: 2, approvedRevision: 2 }, cur()).status, 'approved');
  const same = clientScheduleView({ status: 'draft', revision: 2, approvedRevision: 2 }, cur());
  assert.equal(same.status, 'adjusting');
  assert.equal(same.dates.releaseDate, '2027-01-31');
  const copy = scheduleApprovedCopyOf({ kind: 'schedule', action: 'approve', revision: 1, deliveryDate: '2027-01-15', releaseDate: '2027-01-20' });
  const sum = { status: 'draft', revision: 2, approvedRevision: 1 };
  assert.equal(clientNeedsApprovedCopy(sum, cur()), 1);
  const old = clientScheduleView(sum, cur(), copy);
  assert.deepEqual([old.status, old.revision, old.dates.releaseDate], ['adjusting', 1, '2027-01-20']);
  assert.equal(clientScheduleView({ status: 'draft', revision: 2 }, cur()).kind, 'none', '差し戻された版は出さない');
  assert.equal(clientNeedsApprovedCopy({ status: 'requested', revision: 2, approvedRevision: 1 }, cur()), null);
});

test('SU-05 toProject: 段階と公開予定（launchDate を上書きしない。L-21）・JST 暦日の境界', () => {
  const base = { id: 'p', clientName: '', siteName: '', siteUrl: '', industry: '', accent: '', ownerUid: 'u', memberUids: [], archived: false, updatedAt: '' };
  const launch = '2027-03-01T15:00:00.000Z';
  const p0 = toProject({ ...base, launchDate: launch, requirements: { status: 'approved', revision: 1 } });
  assert.deepEqual([p0.stage, p0.nextAction, p0.launchDate, p0.releaseYmd], ['schedule', 'スケジュールを入力する', launch, '2027-03-02']);
  const p1 = toProject({ ...base, launchDate: launch, requirements: { status: 'approved', revision: 1 }, schedule: { status: 'requested', revision: 1, releaseDate: '2027-04-10' } });
  assert.deepEqual([p1.nextAction, p1.pendingApprovals, p1.launchDate, p1.releaseYmd], ['お客様のスケジュール承認を待つ', 1, launch, '2027-04-10']);
  assert.equal(toProject({ ...base, requirements: { status: 'analyzed', revision: 1 }, schedule: { status: 'draft', revision: 0 } }).stage, 'requirements');
  assert.equal(jstYmd('2027-03-01T14:59:59.000Z'), '2027-03-01');
  assert.equal(jstYmd('2027-03-01T15:00:00.000Z'), '2027-03-02');
  assert.equal(releaseYmdOf(null, undefined), undefined);
});

test('SU-06 検査: demo の検査＋2000〜2099 年、Rules の ymd と同じ形＋暦にない日（2/30）は画面で拒否', () => {
  for (const [v, ok] of [['2027-01-31', true], ['2028-02-29', true], ['2027-02-29', false], ['2027-02-30', false], ['1999-12-31', false], ['2100-01-01', false], ['2027-13-01', false], ['2027-1-01', false]]) {
    assert.equal(scheduleYmdOk(v), ok, v);
  }
  assert.deepEqual(validateScheduleInput({ ...dates, note: '' }), {});
  assert.ok(validateScheduleInput({ buildDue: '', deliveryDate: '2100-01-01', releaseDate: '2100-01-02', note: '' }).deliveryDate);
  assert.ok(validateScheduleInput({ buildDue: '', deliveryDate: '2027-02-30', releaseDate: '2027-03-02', note: '' }).deliveryDate);
  assert.ok(validateWbsInput(items({ sitemap: { start: '1999-01-01' } })).sitemap.start);
  assert.ok(validateWbsInput(items({ design: { assignee: 'あ'.repeat(31) } })).design.assignee);
  assert.deepEqual(validateWbsInput(items()), {});
});

test('SU-07 scheduleForSave / wbsForSave: Rules が受けるキーだけ・note の整え・完了印と marks・build に doneAt を付けない', () => {
  const s = scheduleForSave({ buildDue: ' ', deliveryDate: '2027-01-20', releaseDate: '2027-01-31', note: ' a\r\nb‮c\u0001 ' });
  assert.deepEqual(s, { draft: { deliveryDate: '2027-01-20', releaseDate: '2027-01-31' }, note: 'a\nbc' });
  const NOW = { now: true };
  const had = ts('2026-12-01T00:00:00.000Z');
  const before = wbsMap({ quality: { doneAt: had }, release: { doneAt: had } });
  const w = wbsForSave(items({ sitemap: { assignee: ' 山田\n' }, design: { assignee: '' } }), before, { design: true, build: true, release: false }, NOW, 'u1');
  assert.equal(w.wbs.design.doneAt, NOW);
  assert.equal('doneAt' in w.wbs.build, false);
  assert.equal(w.wbs.quality.doneAt, had, '変えない行は読んだまま');
  assert.equal('doneAt' in w.wbs.release, false);
  assert.deepEqual(w.marks, { design: { state: 'done', at: NOW, by: 'u1' }, release: { state: 'undone', at: NOW, by: 'u1' } });
  assert.deepEqual(w.assignees, { sitemap: '山田' });
  assert.deepEqual(Object.keys(w.wbs), IDS);
  assert.equal(wbsWriteChanged(wbsForSave(items(), before, {}, NOW, 'u1').wbs, before, {}), false);
  assert.equal(wbsWriteChanged(w.wbs, undefined, {}), true, 'WBS が無い（init 直後）なら書く');
  assert.throws(() => wbsForSave(items().slice(0, 5), before, {}, NOW, 'u1'));
});

test('SU-08 wbsProgressLive: 構築は tasks、他は doneAt、状態は demo と同じ、お客様は「遅れ」→「調整中」', () => {
  const ws = scheduleDoc({ revision: 1, editSeq: 0, wbs: wbsMap({ sitemap: { doneAt: ts('2027-01-02T00:00:00.000Z') } }) }).wbs;
  const rows = wbsProgressLive(ws, [{ status: 'done' }, { status: 'todo' }], '2027-01-05');
  assert.deepEqual(rows.map((r) => r.status), ['done', 'late', 'late', 'doing', 'doing', 'todo']);
  assert.deepEqual(rows[2].tasks, { done: 1, total: 2, limited: false });
  assert.equal(rows[2].percent, 50);
  const none = wbsProgressLive(ws, [], '2027-01-01');
  assert.deepEqual([none[2].done, none[2].percent], [false, 0]);
  assert.equal(wbsProgressLive(ws, null, '2027-01-01')[2].tasks, undefined, 'お客様には構築タスクを出さない');
  assert.equal(wbsProgressLive(ws, Array.from({ length: 300 }, () => ({ status: 'done' })), '2027-01-01')[2].tasks.limited, true);
  assert.equal(CLIENT_WBS_STATUS_LABEL.late, '調整中');
});

test('SU-08 wbsProgressLive（構築タスクが読めない）: 割合を出さない・後の行に完了印があれば構築は完了 100%（CR Major 1 回帰）', () => {
  const base = scheduleDoc({ revision: 1, editSeq: 0, wbs: wbsMap() }).wbs;
  // 後の行に完了印なし: 「進行中 0%」にしない（％不明）。状態は日付だけ
  const unknown = wbsProgressLive(base, null, '2027-01-03')[2];
  assert.deepEqual([unknown.done, unknown.percent, unknown.percentUnknown, unknown.status, unknown.tasks], [false, 0, true, 'doing', undefined]);
  assert.equal(wbsProgressLive(base, null, '2027-01-01')[2].status, 'todo');
  assert.equal(wbsProgressLive(base, null, '2027-01-10')[2].status, 'late');
  // 後の行（制作の完了の承認・品質・公開）のどれかに完了印 → 構築は完了
  for (const id of ['buildApproval', 'quality', 'release']) {
    const ws = scheduleDoc({ revision: 1, editSeq: 0, wbs: wbsMap({ [id]: { doneAt: ts('2027-01-06T00:00:00.000Z') } }) }).wbs;
    const b = wbsProgressLive(ws, null, '2027-01-10')[2];
    assert.deepEqual([b.done, b.percent, b.status, b.percentUnknown, b.tasks], [true, 100, 'done', undefined, undefined], id);
  }
  // 前の行（サイトマップ・デザイン）の完了印では構築を完了にしない
  const before = scheduleDoc({ revision: 1, editSeq: 0, wbs: wbsMap({ design: { doneAt: ts('2027-01-02T00:00:00.000Z') } }) }).wbs;
  assert.equal(wbsProgressLive(before, null, '2027-01-03')[2].percentUnknown, true);
  // 構築タスクが読める（アフロ側）ときは従来どおり％を出す
  assert.equal(wbsProgressLive(base, [], '2027-01-03')[2].percentUnknown, undefined);
});

test('statusOf（@/data/schedule。demo と live で共用。CR Minor 3）: 完了 > 遅れ > 進行中 > 未着手', () => {
  const w = { start: '2027-01-05', end: '2027-01-10' };
  assert.equal(statusOf(w, { done: true, percent: 100 }, '2027-02-01'), 'done');
  assert.equal(statusOf(w, { done: false, percent: 50 }, '2027-01-11'), 'late');
  assert.equal(statusOf(w, { done: false, percent: 0 }, '2027-01-05'), 'doing');
  assert.equal(statusOf(w, { done: false, percent: 10 }, '2027-01-01'), 'doing');
  assert.equal(statusOf(w, { done: false, percent: 0 }, '2027-01-04'), 'todo');
});

test('scheduleApproveReplay: 承認済みの同じ版への再送は同じ種類なら same、違えば other、それ以外は null（CR Minor 2）', () => {
  const sum = { status: 'approved', revision: 2, approvalId: scheduleApprovalIdOf(2) };
  const client = { kind: 'schedule', action: 'approve', revision: 2, side: 'client' };
  const proxy = { ...client, side: 'afro', proxy: true, note: 'x' };
  assert.equal(scheduleApprovalIdOf(2), 'schedule-r2-approve');
  assert.equal(scheduleApproveReplay(sum, 2, client, false), 'same');
  assert.equal(scheduleApproveReplay(sum, 2, proxy, true), 'same');
  assert.equal(scheduleApproveReplay(sum, 2, proxy, false), 'other', 'お客様が押したが代理で承認済み');
  assert.equal(scheduleApproveReplay(sum, 2, client, true), 'other', '代理で押したがお客様が承認済み');
  assert.equal(scheduleApproveReplay({ ...sum, status: 'requested' }, 2, client, false), null);
  assert.equal(scheduleApproveReplay({ ...sum, approvalId: 'schedule-r1-approve' }, 2, client, false), null, '承認の ID が版と合わない');
  assert.equal(scheduleApproveReplay(sum, 1, client, false), null, '押した版が違う');
  assert.equal(scheduleApproveReplay(sum, 2, null, false), null, '記録が無い');
  assert.equal(scheduleApproveReplay(sum, 2, { ...client, revision: 1 }, false), null);
  assert.equal(scheduleApproveReplay(null, 2, client, false), null);
});

test('SU-09 scheduleConflict: 保存の editSeq・承認の版と editSeq（WBS だけ変わっても承認しない。L-18）', () => {
  assert.equal(scheduleConflict({ editSeq: 3 }, { editSeq: 3 }), null);
  assert.equal(scheduleConflict({ editSeq: 3 }, { editSeq: 4 }), 'changed');
  assert.equal(scheduleConflict({ editSeq: null }, { editSeq: null }), null, '未作成どうし（init）');
  assert.equal(scheduleConflict({ editSeq: null }, { editSeq: 0 }), 'changed', 'ほかの人が先に作った');
  // お客様・代理とも: 表示した current（revision 2・editSeq 5）の後に WBS だけ保存された（editSeq 6）
  const shown = cur();
  assert.equal(scheduleConflict(shown, { revision: 2, editSeq: 6 }), 'changed');
  assert.equal(scheduleConflict(shown, { revision: 3, editSeq: 5 }), 'revision');
  assert.equal(scheduleConflict(shown, { revision: 2, editSeq: 5 }), null);
  assert.deepEqual(Object.keys(shown.copy).sort(), ['buildDue', 'deliveryDate', 'releaseDate', 'wbs'], '写しは表示した値');
});

test('SU-10 承認状態の表示は履歴の件数に依存しない（L-7）', () => {
  const sum = { status: 'approved', revision: 2, approvedRevision: 2, approvedAt: '2026-12-03T00:00:00.000Z' };
  const a = liveScheduleState(sum, cur(), null);
  // 状態の正は案件の要約。承認の記録（履歴）が 0 件でも上限の 500 件でも同じ表示（liveProjectView は履歴を写すだけ）
  const log = (i) => ({ id: `l${i}`, at: '2026-12-01T00:00:00.000Z', actor: 'x', side: 'afro', action: 'a', target: 't', kind: 'schedule' });
  const work = { sitemap: { pages: [] }, design: {}, qualityChecks: {}, pages: [], diagnoses: [], signage: {} };
  const req = { projectId: 'p', answers: {}, competitors: [], status: 'approved' };
  const views = [0, 500].map((n) => liveProjectView({ id: 'p' }, req, Array.from({ length: n }, (_, i) => log(i)), work, a));
  assert.deepEqual(views[0].schedule, views[1].schedule);
  assert.equal(views[1].approvalLogs.length, 500);
  assert.equal(clientScheduleView(sum, cur()).status, 'approved');
  assert.equal(a.schedule.approvedAt, '2026-12-03T00:00:00.000Z');
  assert.equal(liveScheduleState({ ...sum, status: 'draft' }, cur(), null).schedule.approvedAt, undefined, '再計画中は承認済みにしない');
  const rq = liveScheduleState({ status: 'requested', revision: 2, requestedAt: '2026-12-01T00:00:00.000Z' }, cur(), scheduleInternalDoc({ editSeq: 1, draft: dates, assignees: { build: '佐藤' }, savedByName: '佐藤' }));
  assert.equal(rq.requestedAt, '2026-12-01T00:00:00.000Z');
  assert.equal(rq.schedule.wbs.find((w) => w.id === 'build').assignee, '佐藤');
  assert.equal(liveScheduleState(null, null, null), null);
});
