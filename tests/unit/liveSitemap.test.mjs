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

/* ---------- U2 後半: callable の入力・保存のまとめの状態・案件の state ---------- */
import { createSitemapSaver, liveSitemapProjectState, SITEMAP_SAVE_FAILED_BEFORE_SUBMIT, sitemapDraftRequestInput } from '../../src/live/sitemap.ts';
import { liveProjectView } from '../../src/live/projectView.ts';

test('requestSitemapDraft の入力: 真の印だけ送る（S-12。偽はキーを入れない）', () => {
  const id = '3f1c2b8e-1d2a-4c3b-9e8f-0a1b2c3d4e5f';
  assert.deepEqual(sitemapDraftRequestInput('p1', id, {}), { projectId: 'p1', requestId: id });
  assert.deepEqual(sitemapDraftRequestInput('p1', id, { regenerate: true, discardEdits: false, confirmDiscard: true }),
    { projectId: 'p1', requestId: id, regenerate: true, confirmDiscard: true });
});

const edits = (n) => ({ before: empty, after, devComment: { text: `c${n}` } });

test('保存のまとめ: 待ちがある間は idle でない。書けたら idle・失敗なし。依頼の基準は返った editSeq', async () => {
  const timer = fakeTimer();
  const writes = [];
  const s = createSitemapSaver({ delayMs: 1200, timer, write: async (v, base) => { writes.push([v.devComment.text, base]); return base + 1; } });
  const seen = [];
  const un = s.subscribe(() => seen.push(s.status()));
  s.push(edits(1), 4);
  s.push(edits(2), 4);
  assert.equal(s.status().idle, false);
  assert.equal(timer.q[0].ms >= 1000, true);
  assert.equal(await s.beforeSubmit(4), 5, '依頼の前に書き切り、基準は書いた後の editSeq');
  assert.deepEqual(writes, [['c2', 4]]);
  assert.deepEqual(s.status(), { idle: true, error: null });
  assert.equal(s.status(), s.status(), '同じ状態なら同じオブジェクト（useSyncExternalStore）');
  assert.equal(seen.length > 0, true);
  un();
});

test('保存のまとめ: 通信の失敗は依頼を止める（保存前の内容を承認の対象にしない）。次に書ければ解ける', async () => {
  const timer = fakeTimer();
  let fail = true;
  const s = createSitemapSaver({ delayMs: 1200, timer, write: async (_v, base) => { if (fail) throw Object.assign(new Error('x'), { code: 'functions/unavailable' }); return base + 1; } });
  s.push(edits(1), 0);
  await assert.rejects(s.beforeSubmit(0), (e) => e.message === SITEMAP_SAVE_FAILED_BEFORE_SUBMIT);
  assert.equal(s.status().error instanceof Error, true);
  fail = false;
  s.push(edits(2), 0);
  assert.equal(await s.beforeSubmit(0), 1);
  assert.equal(s.status().error, null);
});

test('保存のまとめ: 競合は SitemapConflictError を出し基準を戻す。最新を読み直した後の依頼は止めない', async () => {
  const timer = fakeTimer();
  const bases = [];
  let conflict = true;
  const s = createSitemapSaver({ delayMs: 1200, timer, write: async (_v, base) => { bases.push(base); if (conflict) throw { code: 'functions/aborted' }; return base + 1; } });
  s.push(edits(1), 2);
  await s.flush();
  assert.equal(s.status().error instanceof SitemapConflictError, true);
  assert.equal(await s.beforeSubmit(7), 7, '競合の後は開き直した editSeq が基準');
  conflict = false;
  s.push(edits(2), 7);
  await s.flush();
  assert.deepEqual(bases, [2, 7]);
});

test('案件の state: 要約が無ければ null。依頼中だけ依頼の日時。internal が無ければ版の中身', () => {
  const v = sitemapVersionDoc({ revision: 1, contentHash: 'h', before: empty, after });
  assert.equal(liveSitemapProjectState(null, null, v), null);
  const r = liveSitemapProjectState({ status: 'requested', revision: 1, requestedAt: '2026-11-28T01:00:00.000Z' }, null, v);
  assert.equal(r.requestedAt, '2026-11-28T01:00:00.000Z');
  assert.equal(r.sitemap.after.nodes.length, 2);
  assert.equal(liveSitemapProjectState({ status: 'draft', revision: 1, requestedAt: 'x' }, null, null).requestedAt, undefined);
  const work = { sitemap: { before: empty, after: empty }, design: {}, qualityChecks: {}, pages: [], diagnoses: [], signage: {} };
  const req = { projectId: 'p1', answers: {}, competitors: [], status: 'approved' };
  const st = liveProjectView({ id: 'p1' }, req, [], work, null, r);
  assert.equal(st.sitemap.after.nodes.length, 2);
  assert.deepEqual(st.approvalRequests, { sitemap: '2026-11-28T01:00:00.000Z' });
  assert.equal(liveProjectView({ id: 'p1' }, req, [], work).sitemap, work.sitemap, 'サイトマップが無ければ従来どおり空の値');
});
