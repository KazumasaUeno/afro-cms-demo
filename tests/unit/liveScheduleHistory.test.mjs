// スケジュールの承認の記録を履歴に出す（docs/design/LIVE_SCHEDULE_PLAN.md U2-0・§10.3 SU-01・SU-02、C-04・AC-11・L-19）。
// 純粋関数だけ（React・Firebase を import しない）。権限は tests/rules/。
// 実行: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { approvalKindOf, approvalLogFrom, approvalLogsFrom, countsAsLastCheck } from '../../src/live/model.ts';

const ts = (iso) => ({ toDate: () => new Date(iso) });
const rec = (over = {}) => ({
  schemaVersion: 1, kind: 'schedule', action: 'submit', revision: 1, side: 'afro', actorUid: 'devB', actorName: '開発 B', actorEmail: 'b@x', at: ts('2026-11-27T01:00:00.000Z'), ...over,
});

test('SU-01 approvalLogFrom: kind schedule の各操作の文と対象「スケジュール（第N版）」', () => {
  const t = (action, over = {}) => approvalLogFrom('p1', `schedule-r3-${action}`, rec({ action, revision: 3, ...over }));
  assert.equal(t('submit').action, 'スケジュールの承認を依頼');
  assert.equal(t('approve', { side: 'client' }).action, 'スケジュールを承認');
  assert.equal(t('withdraw', { note: '日程を見直します' }).action, 'スケジュールの承認の依頼を取り下げ');
  assert.equal(t('reopen', { note: '公開日を延期' }).action, 'スケジュールを再計画');
  for (const a of ['submit', 'approve', 'withdraw', 'reopen']) {
    const l = t(a);
    assert.equal(l.target, 'スケジュール（第3版）', a);
    assert.equal(l.kind, 'schedule', a);
    assert.doesNotMatch(l.target, /要件定義/, a);
  }
  assert.equal(t('approve', { side: 'client' }).side, 'client');
});

test('SU-01 approvalLogFrom: kind の無い古い記録・kind requirements は要件定義の文のまま', () => {
  const old = approvalLogFrom('p1', 'requirements-r2-submit', { action: 'submit', revision: 2, side: 'afro', actorName: 'x' });
  assert.equal(old.kind, 'requirements');
  assert.equal(old.action, '要件定義書の確認を依頼');
  assert.equal(old.target, '要件定義（第2版）');
  assert.equal(approvalKindOf({}), 'requirements');
  assert.equal(approvalKindOf({ kind: 'unknown' }), 'unknown');
  assert.equal(approvalKindOf({ kind: 'schedule' }), 'schedule');
  // 要件定義書の withdraw の note は従来どおり履歴に出さない（AC-14。出すのはスケジュールの withdraw / reopen だけ）
  const reqW = approvalLogFrom('p1', 'requirements-r2-withdraw', { kind: 'requirements', action: 'withdraw', revision: 2, side: 'afro', actorName: 'x', note: '内部メモ' });
  assert.equal('note' in reqW, false);
});

test('SU-01 approvalLogFrom: スケジュールの withdraw / reopen の note を出す。submit・approve には付けない', () => {
  assert.equal(approvalLogFrom('p1', 'w', rec({ action: 'withdraw', note: '日程を見直します' })).note, '日程を見直します');
  assert.equal(approvalLogFrom('p1', 'r', rec({ action: 'reopen', note: '公開日を延期' })).note, '公開日を延期');
  assert.equal('note' in approvalLogFrom('p1', 's', rec({ action: 'submit', note: 'x' })), false);
  assert.equal('note' in approvalLogFrom('p1', 'w', rec({ action: 'withdraw', note: 3 })), false);
});

test('SU-01 approvalLogFrom: スケジュールの代理承認は「アフロ（名前）が代理で承認」と理由・対象はスケジュール', () => {
  const l = approvalLogFrom('p1', 'schedule-r1-approve', rec({ action: 'approve', proxy: true, note: '電話で承認', actorUid: 'admin1', actorName: '管理 一郎', actorRole: 'admin' }));
  assert.equal(l.action, 'アフロ（管理 一郎）が代理で承認');
  assert.equal(l.side, 'afro');
  assert.equal(l.target, 'スケジュール（第1版）');
  assert.deepEqual(l.proxy, { note: '電話で承認', sameAsRequester: false });
  assert.equal('note' in l, false); // 代理の理由は proxy.note（withdraw / reopen の note と分ける）
});

test('SU-02 approvalLogsFrom: 依頼者の突き合わせは kind＋版（要件定義 r1 の依頼者と スケジュール r1 の依頼者を混ぜない）', () => {
  const reqSubmitA = { id: 'requirements-r1-submit', data: { kind: 'requirements', action: 'submit', revision: 1, side: 'afro', actorUid: 'admin1', actorName: '管理 一郎' } };
  const schedSubmitB = { id: 'schedule-r1-submit', data: rec({ actorUid: 'devB' }) };
  const proxyBy = (uid) => ({ id: 'schedule-r1-approve', data: rec({ action: 'approve', proxy: true, note: '電話で承認', actorUid: uid, actorName: '管理', actorRole: 'admin' }) });
  // スケジュール r1 を A（要件定義 r1 の依頼者）が代理 → 同じ人ではない
  const byA = approvalLogsFrom('p1', [proxyBy('admin1'), schedSubmitB, reqSubmitA]);
  assert.equal(byA[0].proxy.sameAsRequester, false);
  // スケジュール r1 の依頼者 B と同じ uid の代理 → 同じ人
  const byB = approvalLogsFrom('p1', [proxyBy('devB'), schedSubmitB, reqSubmitA]);
  assert.equal(byB[0].proxy.sameAsRequester, true);
  // 逆向き: 要件定義の代理承認は スケジュールの依頼者と突き合わせない
  const reqProxy = { id: 'requirements-r1-approve', data: { kind: 'requirements', action: 'approve', revision: 1, side: 'afro', proxy: true, note: 'n', actorUid: 'devB', actorName: '管理' } };
  assert.equal(approvalLogsFrom('p1', [reqProxy, schedSubmitB])[0].proxy.sameAsRequester, false);
  // kind の無い古い要件定義の依頼は要件定義として突き合わせる
  const oldSubmit = { id: 'requirements-r1-submit', data: { action: 'submit', revision: 1, side: 'afro', actorUid: 'devB' } };
  assert.equal(approvalLogsFrom('p1', [reqProxy, oldSubmit])[0].proxy.sameAsRequester, true);
});

test('L-19 countsAsLastCheck: 「最後の確認」はお客様側の要件定義書の記録だけ（スケジュールの承認を数えない。kind 無しは数える）', () => {
  assert.equal(countsAsLastCheck({ side: 'client', kind: 'requirements' }), true);
  assert.equal(countsAsLastCheck({ side: 'client' }), true); // demo・古い live の記録
  assert.equal(countsAsLastCheck({ side: 'client', kind: 'schedule' }), false);
  assert.equal(countsAsLastCheck({ side: 'afro', kind: 'requirements' }), false);
  // clientStatus はこの判定で lastLog を数える（clientStatus は import.meta.env を使う部品を引くので、ここでは呼び出しの有無を確かめる）
  const src = readFileSync(new URL('../../src/features/projects/clientStatus.ts', import.meta.url), 'utf8');
  assert.match(src, /const lastLog = state\.approvalLogs\.find\(\(l\) => ofProject\(l\.projectId\) && countsAsLastCheck\(l\) && l\.actor !== ACTOR\.afro\)/);
});
