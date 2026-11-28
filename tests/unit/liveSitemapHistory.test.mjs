// サイトマップの承認の記録を履歴に出す（docs/design/LIVE_SITEMAP_IMPL_PLAN.md §4 U2-0・§13 影響 穴 2）。
// 段 0: 未知の kind を要件定義と誤表示しない・「サイトマップ（第N版）」・依頼者の突き合わせは kind＋版。
// 純粋関数だけ（React・Firebase を import しない）。権限は tests/rules/。
// 実行: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { approvalKindOf, approvalLogFrom, approvalLogsFrom, countsAsLastCheck } from '../../src/live/model.ts';

const ts = (iso) => ({ toDate: () => new Date(iso) });
const rec = (over = {}) => ({
  schemaVersion: 1, kind: 'sitemap', action: 'submit', revision: 1, side: 'afro', actorUid: 'devB', actorName: '開発 B', actorEmail: 'b@x', at: ts('2026-11-28T01:00:00.000Z'), ...over,
});

test('U2-0 approvalKindOf: kind 無し → requirements（従来どおり）・sitemap → sitemap・未知の文字列 → unknown', () => {
  assert.equal(approvalKindOf({}), 'requirements');
  assert.equal(approvalKindOf({ kind: null }), 'requirements');
  assert.equal(approvalKindOf({ kind: 'requirements' }), 'requirements');
  assert.equal(approvalKindOf({ kind: 'schedule' }), 'schedule');
  assert.equal(approvalKindOf({ kind: 'sitemap' }), 'sitemap');
  assert.equal(approvalKindOf({ kind: 'unknown' }), 'unknown');
  assert.equal(approvalKindOf({ kind: 'design' }), 'unknown');
  assert.equal(approvalKindOf({ kind: 3 }), 'unknown');
});

test('U2-0 approvalLogFrom: kind sitemap の各操作の文と対象「サイトマップ（第N版）」', () => {
  const t = (action, over = {}) => approvalLogFrom('p1', `sitemap-r2-${action}`, rec({ action, revision: 2, ...over }));
  assert.equal(t('submit').action, 'サイトマップの承認を依頼');
  assert.equal(t('approve', { side: 'client' }).action, 'サイトマップを承認');
  assert.equal(t('withdraw', { note: '構成を見直します' }).action, 'サイトマップの承認の依頼を取り下げ');
  assert.equal(t('reopen', { note: 'ページを追加' }).action, 'サイトマップをやり直し');
  for (const a of ['submit', 'approve', 'withdraw', 'reopen']) {
    const l = t(a);
    assert.equal(l.target, 'サイトマップ（第2版）', a);
    assert.equal(l.kind, 'sitemap', a);
    assert.doesNotMatch(l.target, /要件定義|スケジュール/, a);
    assert.doesNotMatch(l.action, /要件定義|スケジュール/, a);
  }
  assert.equal(t('approve', { side: 'client' }).side, 'client');
});

test('U2-0 approvalLogFrom: サイトマップの withdraw / reopen の note を出す（お客様にも見える。AC-08）。submit・approve には付けない', () => {
  assert.equal(approvalLogFrom('p1', 'w', rec({ action: 'withdraw', note: '構成を見直します' })).note, '構成を見直します');
  assert.equal(approvalLogFrom('p1', 'r', rec({ action: 'reopen', note: 'ページを追加' })).note, 'ページを追加');
  assert.equal('note' in approvalLogFrom('p1', 's', rec({ action: 'submit', note: 'x' })), false);
  assert.equal('note' in approvalLogFrom('p1', 'a', rec({ action: 'approve', side: 'client', note: 'x' })), false);
  assert.equal('note' in approvalLogFrom('p1', 'w', rec({ action: 'withdraw', note: 3 })), false);
});

test('U2-0 approvalLogFrom: サイトマップの代理承認は「アフロ（名前）が代理で承認」と理由・対象はサイトマップ', () => {
  const l = approvalLogFrom('p1', 'sitemap-r1-approve', rec({ action: 'approve', proxy: true, note: '電話で承認', actorUid: 'admin1', actorName: '管理 一郎', actorRole: 'admin' }));
  assert.equal(l.action, 'アフロ（管理 一郎）が代理で承認');
  assert.equal(l.side, 'afro');
  assert.equal(l.target, 'サイトマップ（第1版）');
  assert.deepEqual(l.proxy, { note: '電話で承認', sameAsRequester: false });
  assert.equal('note' in l, false);
});

test('U2-0 approvalLogFrom: 未知の kind は要件定義と表示しない（「不明な記録」・kind unknown・note を出さない）', () => {
  const l = approvalLogFrom('p1', 'x-r1-submit', { kind: 'design', action: 'submit', revision: 1, side: 'afro', actorName: 'x', note: '内部' });
  assert.equal(l.kind, 'unknown');
  assert.equal(l.action, '不明な記録');
  assert.equal(l.target, '不明な記録');
  assert.doesNotMatch(`${l.action}${l.target}`, /要件定義/);
  assert.equal('note' in l, false);
  // 「最後の確認」（要件定義書だけ）に数えない
  assert.equal(countsAsLastCheck({ side: 'client', kind: l.kind }), false);
  assert.equal(countsAsLastCheck({ side: 'client', kind: 'sitemap' }), false);
});

test('U2-0 approvalLogsFrom: 依頼者の突き合わせは kind＋版（サイトマップ r1 と 要件定義 r1・スケジュール r1 を混ぜない）', () => {
  const reqSubmitA = { id: 'requirements-r1-submit', data: { kind: 'requirements', action: 'submit', revision: 1, side: 'afro', actorUid: 'admin1' } };
  const schedSubmitA = { id: 'schedule-r1-submit', data: { kind: 'schedule', action: 'submit', revision: 1, side: 'afro', actorUid: 'admin1' } };
  const siteSubmitB = { id: 'sitemap-r1-submit', data: rec({ actorUid: 'devB' }) };
  const proxyBy = (uid) => ({ id: 'sitemap-r1-approve', data: rec({ action: 'approve', proxy: true, note: 'n', actorUid: uid, actorName: '管理', actorRole: 'admin' }) });
  assert.equal(approvalLogsFrom('p1', [proxyBy('admin1'), siteSubmitB, reqSubmitA, schedSubmitA])[0].proxy.sameAsRequester, false);
  assert.equal(approvalLogsFrom('p1', [proxyBy('devB'), siteSubmitB, reqSubmitA, schedSubmitA])[0].proxy.sameAsRequester, true);
  // 逆向き: スケジュールの代理承認はサイトマップの依頼者と突き合わせない
  const schedProxy = { id: 'schedule-r1-approve', data: { kind: 'schedule', action: 'approve', revision: 1, side: 'afro', proxy: true, note: 'n', actorUid: 'devB' } };
  assert.equal(approvalLogsFrom('p1', [schedProxy, siteSubmitB])[0].proxy.sameAsRequester, false);
  // 未知の kind 同士でも、違う kind の依頼とは突き合わせない
  const unkSubmit = { id: 'a-r1-submit', data: { kind: 'aaa', action: 'submit', revision: 1, side: 'afro', actorUid: 'devB' } };
  const unkProxy = { id: 'b-r1-approve', data: { kind: 'bbb', action: 'approve', revision: 1, side: 'afro', proxy: true, note: 'n', actorUid: 'devB' } };
  assert.equal(approvalLogsFrom('p1', [unkProxy, unkSubmit])[0].proxy.sameAsRequester, false);
});
