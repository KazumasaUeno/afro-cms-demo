// live のサイトマップのデータ層の純関数（docs/design/LIVE_SITEMAP_IMPL_PLAN.md §3・§4 U2・§7 liveSitemap）。
// AC-09（表示した revision・contentHash で組む・違えば送らない）・AC-17（1 秒以上まとめる・同時に 1 本）・AC-28（段階）・SM-19・OQ-N4。
// 実行: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clientSitemapView, clientVersionToRead, createSaveQueue, diagramOf, liveSitemapState, sitemapAiDraftOf, sitemapApprovalIdOf, sitemapApproveRecord,
  sitemapApproveReplay, sitemapCallableError, SitemapConflictError, sitemapConflict, sitemapEditable, sitemapInternalDoc, sitemapSubmitBlock,
  sitemapSummaryOf, sitemapVersionDoc,
} from '../../src/live/sitemap.ts';
import { toProject } from '../../src/live/model.ts';

const node = (id, kind = 'page', path = `/${id}`) => ({ id, position: { x: 0, y: 0 }, data: { label: 'ページ', path, kind } });
const after = { nodes: [node('a-home', 'home', '/'), node('a-x')], edges: [{ id: 'a-home-a-x', source: 'a-home', target: 'a-x' }] };
const empty = { nodes: [], edges: [] };

test('要約: 壊れた値・未知の状態は未作成（null）。代理の印は proxy だけ', () => {
  assert.equal(sitemapSummaryOf(undefined), null);
  assert.equal(sitemapSummaryOf({ status: 'x', revision: 0 }), null);
  assert.equal(sitemapSummaryOf({ status: 'draft', revision: -1 }), null);
  assert.deepEqual(sitemapSummaryOf({ status: 'approved', revision: 2, approvedRevision: 2, approvedVia: 'other', contentHash: 'h' }),
    { status: 'approved', revision: 2, contentHash: 'h', approvedRevision: 2 });
});

test('internal・版文書: editSeq・revision・contentHash が読めなければ null。壊れたノード・端の無い接続は捨てる', () => {
  assert.equal(sitemapInternalDoc({ before: empty }), null);
  const i = sitemapInternalDoc({ editSeq: 3, origin: 'ai', before: { nodes: [node('b-home', 'home'), { id: 1 }], edges: [{ id: 'e', source: 'b-home', target: 'zz' }] }, after });
  assert.equal(i.editSeq, 3);
  assert.equal(i.origin, 'ai');
  assert.equal(i.before.nodes.length, 1);
  assert.equal(i.before.edges.length, 0);
  assert.equal(sitemapInternalDoc({ editSeq: 0, origin: 'evil' }).origin, 'manual');
  assert.equal(sitemapVersionDoc({ revision: 0, contentHash: 'h' }), null);
  assert.equal(sitemapVersionDoc({ revision: 1 }), null);
  assert.equal(sitemapVersionDoc({ revision: 1, contentHash: 'h', after }).after.nodes.length, 2);
  assert.deepEqual(diagramOf({ nodes: [node('a-y', 'weird')] }).nodes[0].data.kind, 'page');
});

test('AI ジョブ: running・failed・エラーのコードだけ（本文は読まない）', () => {
  assert.equal(sitemapAiDraftOf(null), null);
  assert.deepEqual(sitemapAiDraftOf({ job: { state: 'running' } }), { running: true, failed: false });
  assert.deepEqual(sitemapAiDraftOf({ state: 'failed', lastError: { code: 'timeout', message: 'x' } }), { running: false, failed: true, errorCode: 'timeout' });
});

test('お客様: 読む版は依頼中・承認済み → revision、下書き → 前回承認版、承認歴なし → null（準備中）', () => {
  assert.equal(clientVersionToRead(null), null);
  assert.equal(clientVersionToRead({ status: 'draft', revision: 0 }), null);
  assert.equal(clientVersionToRead({ status: 'requested', revision: 2 }), 2);
  assert.equal(clientVersionToRead({ status: 'draft', revision: 3, approvedRevision: 2 }), 2);
  assert.equal(clientVersionToRead({ status: 'draft', revision: 1 }), null);
  const v = sitemapVersionDoc({ revision: 2, contentHash: 'h', after });
  assert.deepEqual(clientSitemapView({ status: 'draft', revision: 3, approvedRevision: 2 }, v).status, 'adjusting');
  assert.equal(clientSitemapView({ status: 'requested', revision: 3 }, v).kind, 'none');
  assert.equal(clientSitemapView({ status: 'approved', revision: 2, approvedVia: 'proxy' }, v).approvedVia, 'proxy');
});

test('AC-09: 表示した版と違えば送らない。承認の記録は表示した revision・contentHash から組む', () => {
  assert.equal(sitemapConflict({ revision: 2, contentHash: 'h' }, { revision: 2, contentHash: 'h' }), null);
  assert.equal(sitemapConflict({ revision: 1, contentHash: 'h' }, { revision: 2, contentHash: 'h' }), 'revision');
  assert.equal(sitemapConflict({ revision: 2, contentHash: 'h' }, { revision: 2, contentHash: 'g' }), 'changed');
  assert.equal(sitemapConflict({ revision: 2, contentHash: '' }, { revision: 2 }), 'changed');
  assert.equal(sitemapConflict({ revision: 2, contentHash: 'h' }, null), 'revision');
  const r = sitemapApproveRecord({ revision: 2, contentHash: 'h' }, null);
  assert.deepEqual(r, { schemaVersion: 1, kind: 'sitemap', action: 'approve', revision: 2, side: 'client', contentHash: 'h' });
  assert.deepEqual(sitemapApproveRecord({ revision: 2, contentHash: 'h' }, { note: '口頭' }).proxy, true);
  assert.equal(sitemapApprovalIdOf(2), 'sitemap-r2-approve');
  const sum = { status: 'approved', revision: 2, approvalId: 'sitemap-r2-approve' };
  assert.equal(sitemapApproveReplay(sum, 2, { action: 'approve', revision: 2 }, false), 'same');
  assert.equal(sitemapApproveReplay(sum, 2, { action: 'approve', revision: 2, proxy: true }, false), 'other');
  assert.equal(sitemapApproveReplay(sum, 1, { action: 'approve', revision: 2 }, false), null);
});

test('OQ-N4: 編集できるのは下書きだけ（依頼中・承認済み・アーカイブ・AI 実行中・お客様は不可）', () => {
  const base = { afro: true, archived: false, reqApproved: true, status: 'draft', aiRunning: false };
  assert.equal(sitemapEditable(base), true);
  for (const k of [{ status: 'requested' }, { status: 'approved' }, { status: null }, { archived: true }, { aiRunning: true }, { afro: false }, { reqApproved: false }]) {
    assert.equal(sitemapEditable({ ...base, ...k }), false, JSON.stringify(k));
  }
});

test('依頼できない理由: スケジュール未承認・不正な項目の件数・改善後にトップ＋1 件', () => {
  assert.match(sitemapSubmitBlock({ before: empty, after }, false), /スケジュール/);
  assert.equal(sitemapSubmitBlock({ before: empty, after }, true), null);
  assert.match(sitemapSubmitBlock({ before: empty, after: { nodes: [node('a-home', 'home', '/')], edges: [] } }, true), /トップと1ページ/);
  const bad = { nodes: [node('a-home', 'home', '/'), { ...node('a-x'), data: { label: '', path: 'nope', kind: 'page' } }], edges: [] };
  assert.equal(sitemapSubmitBlock({ before: empty, after: bad }, true), '直す必要がある項目が1件あります');
});

test('callable の失敗: aborted → 競合、details の文字列は文言に入れない', () => {
  assert.ok(sitemapCallableError({ code: 'functions/aborted' }) instanceof SitemapConflictError);
  assert.match(sitemapCallableError({ code: 'functions/permission-denied' }).message, /権限がありません/);
  assert.match(sitemapCallableError({ code: 'functions/failed-precondition', details: { reason: 'job-running' } }).message, /AI が作成している間/);
  const m = sitemapCallableError({ code: 'functions/invalid-argument', details: { field: '<img src=x>', count: 3 } }).message;
  assert.equal(m, '内容を確認してください（3件）');
});

test('アフロ側の state: 承認済みのときだけ approvedAt・コメントは by に名前', () => {
  const i = sitemapInternalDoc({ editSeq: 1, after, devComment: { text: 'よろしく', at: '2026-11-28T00:00:00.000Z', byName: '黒田', byUid: 'u1' } });
  const s = liveSitemapState({ status: 'requested', revision: 1, approvedAt: '2026-11-28T00:00:00.000Z' }, i);
  assert.equal(s.approvedAt, undefined);
  assert.deepEqual(s.devComment, { text: 'よろしく', at: '2026-11-28T00:00:00.000Z', by: '黒田' });
  assert.equal(liveSitemapState({ status: 'approved', revision: 1, approvedAt: 'x' }, i).approvedAt, 'x');
  assert.deepEqual(liveSitemapState(null, null).after, empty);
});

function fakeTimer() {
  const q = [];
  return { q, set: (fn, ms) => { const t = { fn, ms }; q.push(t); return t; }, clear: (t) => { const i = q.indexOf(t); if (i >= 0) q.splice(i, 1); }, fire: () => q.splice(0).forEach((t) => t.fn()) };
}

test('AC-17: 1 秒の間の変更は 1 回にまとめる。書いている間の変更は書き終わってから最後の値だけ', async () => {
  const timer = fakeTimer();
  const writes = [];
  let release;
  const q = createSaveQueue({
    delayMs: 1000, base: () => 5, timer, onError: (e) => { throw e; },
    write: (v, base) => { writes.push([v, base]); return new Promise((r) => { release = () => r(base + 1); }); },
  });
  for (let i = 0; i < 10; i++) q.push(i);
  assert.equal(timer.q.length, 1);
  assert.equal(timer.q[0].ms >= 1000, true);
  timer.fire();
  assert.deepEqual(writes, [[9, 5]]);
  q.push(10); q.push(11);
  assert.equal(timer.q.length, 0, '書いている間は予約しない');
  release();
  await new Promise((r) => setImmediate(r));
  timer.fire();
  assert.deepEqual(writes, [[9, 5], [11, 6]], '次の基準は返った editSeq');
  release();
  await new Promise((r) => setImmediate(r));
  assert.equal(q.idle(), true);
});

test('AC-17: 失敗したら待ちを捨てて基準を戻す。flush は待ちを書き切る', async () => {
  const timer = fakeTimer();
  const errors = [];
  let n = 0;
  const q = createSaveQueue({
    delayMs: 1000, base: () => 0, timer, onError: (e) => errors.push(e),
    write: async (v, base) => { n++; if (v === 'bad') throw new SitemapConflictError('c'); return base + 1; },
  });
  q.push('bad');
  await q.flush();
  assert.equal(errors.length, 1);
  q.push('ok');
  await q.flush();
  assert.equal(n, 2);
  assert.equal(q.idle(), true);
});

test('AC-28: スケジュールの承認後はサイトマップの段階（demo と同じ文言・進捗）', () => {
  const doc = {
    id: 'p1', clientName: '', siteName: '', siteUrl: '', industry: '', accent: '', ownerUid: 'o', memberUids: [], archived: false, updatedAt: '2026-11-28T00:00:00.000Z', consult: null,
    requirements: { status: 'approved', revision: 1 },
    schedule: { status: 'approved', revision: 1, approvedRevision: 1 },
  };
  assert.deepEqual([toProject(doc).stage, toProject(doc).nextAction], ['build', 'サイトマップを作成する']);
  assert.equal(toProject({ ...doc, sitemap: { status: 'requested', revision: 1 } }).pendingApprovals, 1);
  assert.equal(toProject({ ...doc, sitemap: { status: 'requested', revision: 1 } }).nextAction, 'お客様のサイトマップ承認を待つ');
  assert.equal(toProject({ ...doc, schedule: { status: 'requested', revision: 1 } }).stage, 'schedule');
});
