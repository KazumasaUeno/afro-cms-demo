// live のサイトマップ画面（U3-b）の判定（src/features/sitemap/liveSitemapUi.ts）。React・Firebase を import しない。
// 実行: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  liveSitemapNext, sitemapAiPhase, sitemapEditsWith, sitemapLiveButtons, sitemapLiveDescription, sitemapLockedNote, sitemapOverlayAction, sitemapSig,
} from '../../src/features/sitemap/liveSitemapUi.ts';

const node = (id, label, x = 0, extra = {}) => ({ id, position: { x, y: 0 }, data: { label, path: `/${id}`, kind: 'page', ...extra } });
const doc = (after) => ({ before: { nodes: [], edges: [] }, after: { nodes: after, edges: [] } });
const base = { role: 'developer', archived: false, reqApproved: true, status: 'draft', aiRunning: false, hasVersion: true, aiMode: 'on' };

test('sitemapSig: キーの順・undefined・座標の端数に左右されず、中身の違いは区別する', () => {
  const a = doc([node('a', 'A', 1.2)]);
  const b = doc([{ id: 'a', data: { kind: 'page', path: '/a', label: 'A', reason: undefined }, position: { y: 0, x: 1 } }]);
  assert.equal(sitemapSig(a), sitemapSig(b));
  assert.notEqual(sitemapSig(a), sitemapSig(doc([node('a', 'B', 1)])));
  assert.notEqual(sitemapSig({ ...a, devText: 'x' }), sitemapSig(a));
});

test('sitemapOverlayAction: 待ち・失敗は重ねたまま、競合は捨てる、書き終わって同じなら捨てる、古ければ少し待つ', () => {
  const o = { hasLocal: true, idle: true, error: false, conflict: false, equal: true };
  assert.equal(sitemapOverlayAction({ ...o, hasLocal: false }), 'none');
  assert.equal(sitemapOverlayAction({ ...o, idle: false, equal: false }), 'keep');
  assert.equal(sitemapOverlayAction({ ...o, error: true, equal: false }), 'keep');
  assert.equal(sitemapOverlayAction({ ...o, conflict: true, error: true, idle: false }), 'drop');
  assert.equal(sitemapOverlayAction(o), 'drop');
  assert.equal(sitemapOverlayAction({ ...o, equal: false }), 'grace');
});

test('sitemapEditsWith: 編集した図だけ置き換え、もう一方とコメントは表示中の値', () => {
  const shown = { before: { nodes: [node('b', 'B')], edges: [] }, after: { nodes: [], edges: [] }, devComment: { text: 'c', at: 'x', by: 'y' } };
  const e = sitemapEditsWith(shown, 'after', [node('a', 'A')], []);
  assert.equal(e.before, shown.before);
  assert.equal(e.after.nodes[0].id, 'a');
  assert.deepEqual(e.devComment, { text: 'c' });
  assert.deepEqual(sitemapEditsWith({ ...shown, devComment: undefined }, 'before', [], []).devComment, { text: '' });
});

test('sitemapLiveButtons: 依頼中は取り下げ（＋管理者は代理）、承認済みは下書きに戻す、none は作成、お客様・アーカイブは何も出さない', () => {
  assert.deepEqual(sitemapLiveButtons({ ...base, status: null }), { createManual: true, aiCreate: true, aiRegenerate: false, request: false, withdraw: false, proxy: false, reopen: false });
  assert.deepEqual(sitemapLiveButtons(base), { createManual: false, aiCreate: false, aiRegenerate: true, request: true, withdraw: false, proxy: false, reopen: false });
  const req = sitemapLiveButtons({ ...base, status: 'requested' });
  assert.deepEqual([req.withdraw, req.proxy, req.request], [true, false, false]);
  assert.equal(sitemapLiveButtons({ ...base, status: 'requested', role: 'admin' }).proxy, true);
  assert.equal(sitemapLiveButtons({ ...base, status: 'requested', role: 'admin', hasVersion: false }).proxy, false);
  assert.equal(sitemapLiveButtons({ ...base, status: 'approved' }).reopen, true);
  assert.ok(Object.values(sitemapLiveButtons({ ...base, role: 'client' })).every((v) => !v));
  assert.ok(Object.values(sitemapLiveButtons({ ...base, archived: true, status: 'requested', role: 'admin' })).every((v) => !v));
  // AI 実行中は作成・依頼・作り直しを出さない
  const run = sitemapLiveButtons({ ...base, aiRunning: true });
  assert.deepEqual([run.request, run.aiRegenerate], [false, false]);
  // フラグ off は AI のボタンを出さない（手で作るは出す）。internal は管理者だけ
  assert.deepEqual([sitemapLiveButtons({ ...base, status: null, aiMode: 'off' }).aiCreate, sitemapLiveButtons({ ...base, status: null, aiMode: 'off' }).createManual], [false, true]);
  assert.equal(sitemapLiveButtons({ ...base, status: null, aiMode: 'internal' }).aiCreate, false);
  assert.equal(sitemapLiveButtons({ ...base, status: null, aiMode: 'internal', role: 'admin' }).aiCreate, true);
});

test('sitemapLockedNote / sitemapLiveDescription: 依頼中は編集不可の理由（OQ-N4）、下書きは編集可', () => {
  assert.equal(sitemapLockedNote(base), null);
  assert.match(sitemapLockedNote({ ...base, status: 'requested' }), /取り下げ/);
  assert.match(sitemapLockedNote({ ...base, archived: true }), /アーカイブ/);
  assert.match(sitemapLockedNote({ ...base, aiRunning: true }), /AI/);
  assert.match(sitemapLiveDescription('requested', true), /承認待ちの間は閲覧だけ/);
  assert.match(sitemapLiveDescription('draft', true), /そのまま保存されます/);
});

test('sitemapAiPhase / liveSitemapNext（AC-28: スケジュール承認後はサイトマップへ）', () => {
  assert.equal(sitemapAiPhase(null), 'idle');
  assert.equal(sitemapAiPhase({ running: true, failed: true }), 'running');
  assert.equal(sitemapAiPhase({ running: false, failed: true }), 'failed');
  const fb = { label: 'x', to: '/schedule' };
  assert.equal(liveSitemapNext({ reqApproved: true, scheduleApproved: false, status: null, sitemapTo: '/site' }, fb), fb);
  assert.deepEqual(liveSitemapNext({ reqApproved: true, scheduleApproved: true, status: null, sitemapTo: '/site' }, fb), { label: 'サイトマップを作成する', to: '/site' });
  assert.equal(liveSitemapNext({ reqApproved: true, scheduleApproved: true, status: 'requested', sitemapTo: '/dev/sitemap' }, fb).label, 'お客様のサイトマップ承認を待つ');
});
