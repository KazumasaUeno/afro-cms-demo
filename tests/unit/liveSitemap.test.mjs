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
  // running は lease 内だけ（修正バッチ 2。lease の無い・切れた running は失敗＝もう一度試せる）
  const lease = { toDate: () => new Date(Date.parse('2026-11-28T03:01:00Z')) };
  const T0 = Date.parse('2026-11-28T03:00:00Z');
  const LMS = Date.parse('2026-11-28T03:01:00Z');
  assert.deepEqual(sitemapAiDraftOf({ job: { state: 'running', leaseUntil: lease } }, T0), { running: true, failed: false, kept: false, leaseUntilMs: LMS });
  assert.deepEqual(sitemapAiDraftOf({ state: 'failed', lastError: { code: 'timeout', message: 'x' } }), { running: false, failed: true, kept: false, errorCode: 'timeout' });
  // code review Minor: 成功の後の作り直しが失敗 → state は ready のまま lastError。失敗として出す
  assert.deepEqual(sitemapAiDraftOf({ state: 'ready', generated: { applied: true }, lastError: { code: 'ai-timeout' }, job: { state: 'idle' } }),
    { running: false, failed: true, kept: false, errorCode: 'ai-timeout' });
  // 成功したが作成中の編集で反映しなかった（kept）→ 注記。反映した成功は何も出さない
  assert.deepEqual(sitemapAiDraftOf({ state: 'ready', generated: { applied: false }, job: { state: 'idle' } }), { running: false, failed: false, kept: true });
  assert.deepEqual(sitemapAiDraftOf({ state: 'ready', generated: { applied: true }, job: { state: 'idle' } }), { running: false, failed: false, kept: false });
  // 作り直しの依頼中は前の失敗・kept を出さない
  assert.deepEqual(sitemapAiDraftOf({ state: 'ready', generated: { applied: false }, lastError: { code: 'x' }, job: { state: 'running', leaseUntil: lease } }, T0), { running: true, failed: false, kept: false, errorCode: 'x', leaseUntilMs: LMS });
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

test('AC-17: 失敗したら待ちを捨てる（基準を戻すのは呼び出し側の reset。競合のときだけ）。flush は待ちを書き切る', async () => {
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

/* ---------- 修正バッチ 2026-11-28（QA D-1・code review Major） ---------- */
import { sitemapSaveInput } from '../../src/live/sitemap.ts';
import { validateSitemapDoc } from '../../src/shared/ai/sitemapRules.ts';

/** @firebase/functions の encode と同じ（node_modules/@firebase/functions/dist/esm/index.esm.js encode: data == null → null・object は値ごと） */
function sdkEncode(data) {
  if (data == null) return null;
  if (typeof data === 'number' || typeof data === 'boolean' || typeof data === 'string') return data;
  if (Array.isArray(data)) return data.map(sdkEncode);
  return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, sdkEncode(v)]));
}

test('D-1: 理由なしのページ（reason: undefined）・現在の図のページを callable の encode を通しても検査に通る形で送る', () => {
  // 画面の addPage・理由を空にしたとき（SitemapView.tsx）と同じ reason: undefined
  const pageNoReason = (id, kind, path) => ({ id, position: { x: 0, y: 0 }, data: { label: 'ページ', path, kind, reason: undefined } });
  const v = {
    before: { nodes: [pageNoReason('b-home', 'home', '/'), pageNoReason('b-x', 'page', '/x')], edges: [{ id: 'b-home-b-x', source: 'b-home', target: 'b-x' }] },
    after: { nodes: [pageNoReason('a-home', 'home', '/'), { ...node('a-y'), data: { ...node('a-y').data, reason: '理由' } }], edges: [] },
  };
  const wire = sdkEncode(sitemapSaveInput('p1', 3, v));
  assert.equal(JSON.stringify(wire).includes('null'), false, 'null のキーを送らない');
  assert.deepEqual(validateSitemapDoc({ before: wire.before, after: wire.after }).errors, []);
  assert.equal(wire.after.nodes[1].data.reason, '理由');
  assert.deepEqual(Object.keys(wire).sort(), ['after', 'baseEditSeq', 'before', 'op', 'projectId']);
  assert.deepEqual(sdkEncode(sitemapSaveInput('p1', 3, { ...v, devComment: { text: 'c' } })).devComment, { text: 'c' });
});

test('Major: 保存成功の後に通信の失敗 → もう一度保存は最後に書けた editSeq を基準にする（自分と競合しない。bases [5,6,6]）', async () => {
  const timer = fakeTimer();
  const bases = [];
  let call = 0;
  let saved = 5; // サーバーの editSeq
  const s = createSitemapSaver({
    delayMs: 1200, timer,
    write: async (_v, base) => {
      bases.push(base); call++;
      if (call === 2) throw Object.assign(new Error('x'), { code: 'functions/unavailable' });
      if (base !== saved) throw { code: 'functions/aborted' };
      return ++saved;
    },
  });
  s.push(edits(1), 5);
  await s.flush();
  s.push(edits(2), 5); // 画面は手元の値がある間、開いた時点の 5 のまま
  await s.flush();
  assert.equal(s.status().error instanceof SitemapConflictError, false);
  s.push(edits(3), 5); // 「もう一度保存」
  await s.flush();
  assert.deepEqual(bases, [5, 6, 6]);
  assert.equal(s.status().error, null, '自分の保存と競合しない（誤った「ほかの人が先に保存しました」を出さない）');
  assert.equal(await s.beforeSubmit(5), 7);
});

test('QA O-1: 「要件定義書の案から作成しました」は AI が作った版だけ（手で作った版は sourceReqRevision を持っても出さない）', async () => {
  const { sitemapFromRequirements } = await import('../../src/live/sitemap.ts');
  assert.equal(sitemapFromRequirements({ origin: 'manual', sourceReqRevision: 2 }), false);
  assert.equal(sitemapFromRequirements({ origin: 'ai', sourceReqRevision: 2 }), true);
  assert.equal(sitemapFromRequirements(null), false);
});

test('code review Minor: 保存のまとめは利用者＋案件ごと。ログアウト（clear）で待ちを捨てて空にする', async () => {
  const { createSaverRegistry } = await import('../../src/live/sitemap.ts');
  const timer = fakeTimer();
  const writes = [];
  const reg = createSaverRegistry(() => createSitemapSaver({ delayMs: 1200, timer, write: async (_v, base) => { writes.push(base); return base + 1; } }));
  const a = reg.get('uA', 'p1');
  assert.equal(reg.get('uA', 'p1'), a);
  assert.notEqual(reg.get('uB', 'p1'), a, '別の人は別のまとめ（前の人の基準・失敗を使わない）');
  a.push(edits(1), 3);
  assert.equal(a.status().idle, false);
  reg.clear();
  assert.equal(reg.size(), 0);
  assert.equal(a.status().idle, true, '待ちを捨てる');
  assert.equal(timer.q.length, 0, '予約を止める');
  assert.deepEqual(writes, []);
  assert.notEqual(reg.get('uA', 'p1'), a, 'ログインし直したら新しいまとめ');
});

/* ---------- 修正バッチ 2（2026-11-28 QA D-1b・再レビュー・Codex） ---------- */
import { createPendingSave } from '../../src/features/sitemap/pendingSave.ts';
import { addPageKindOptions } from '../../src/features/sitemap/addPageRules.ts';
import { sitemapAiPhase } from '../../src/features/sitemap/liveSitemapUi.ts';
import { SITEMAP_AI_LEASE_EXPIRED, SITEMAP_NETWORK_ERROR_TEXT } from '../../src/live/sitemap.ts';

test('rereview Major / codex P2: ほかの人の保存（7）を読み込んだ後の編集は 7 を基準にする（自分の前の 5 に戻らない・競合にしない）', async () => {
  const timer = fakeTimer();
  const bases = [];
  let server = 4;
  const s = createSitemapSaver({ delayMs: 1200, timer, write: async (_v, base) => { bases.push(base); if (base !== server) throw { code: 'functions/aborted' }; return ++server; } });
  s.push(edits(1), 4);
  await s.flush(); // 自分の保存 4 → 5
  server = 7; // ほかの人が 6・7 を保存し、画面はそれを読み込んだ（手元の値が無いので開いた時点は 7）
  s.push(edits(2), 7);
  await s.flush();
  assert.deepEqual(bases, [4, 7]);
  assert.equal(s.status().error, null);
});

test('codex P2: 応答だけ失われた保存（サーバーは書けていた）→ もう一度保存は自分と競合せず、届いた editSeq で書き直す', async () => {
  const timer = fakeTimer();
  const bases = [];
  let server = { editSeq: 5, edits: null };
  let call = 0;
  const s = createSitemapSaver({
    delayMs: 1200, timer,
    write: async (v, base) => {
      bases.push(base); call++;
      if (base !== server.editSeq) throw { code: 'functions/aborted' };
      server = { editSeq: base + 1, edits: v };
      if (call === 1) throw Object.assign(new Error('internal'), { code: 'functions/internal' }); // 書けたが応答が失われた
      return server.editSeq;
    },
    readServer: async () => server,
  });
  s.push(edits(1), 5);
  await s.flush();
  assert.equal(s.status().error?.message, SITEMAP_NETWORK_ERROR_TEXT, '内部の文言（internal）を出さない（QA O-4）');
  s.push(edits(2), 5); // 「もう一度保存」（手元の値は edits(1) の後に edits(2)）
  await s.flush();
  assert.equal(s.status().error, null, '自分の書き込みと競合しない（手元の編集を捨てない）');
  assert.deepEqual(bases, [5, 5, 6]);
  assert.equal(server.editSeq, 7);
  assert.equal(server.edits.devComment.text, 'c2');
});

test('codex P2: 応答が失われた後の競合でも、サーバーの中身が自分の書き込みと違えば本当の競合（ほかの人の保存を上書きしない）', async () => {
  const timer = fakeTimer();
  const bases = [];
  let server = { editSeq: 5, edits: null };
  let call = 0;
  const s = createSitemapSaver({
    delayMs: 1200, timer,
    write: async (v, base) => {
      bases.push(base); call++;
      if (base !== server.editSeq) throw { code: 'functions/aborted' };
      if (call === 1) throw { code: 'functions/unavailable' }; // 届かなかった
      server = { editSeq: base + 1, edits: v };
      return server.editSeq;
    },
    readServer: async () => server,
  });
  s.push(edits(1), 5);
  await s.flush();
  server = { editSeq: 6, edits: edits(9) }; // その間にほかの人が保存
  s.push(edits(2), 5);
  await s.flush();
  assert.equal(s.status().error instanceof SitemapConflictError, true);
  assert.deepEqual(bases, [5, 5]);
});

test('codex P2: AI 実行中は leaseUntil も見る（切れていれば失敗＝もう一度試せる。読んだ後に切れた分は sitemapAiPhase が now で見直す）', () => {
  const now = Date.parse('2026-11-28T03:00:00Z');
  const ts = (ms) => ({ toDate: () => new Date(ms) });
  const expired = sitemapAiDraftOf({ state: 'ready', job: { state: 'running', leaseUntil: ts(now - 1) } }, now);
  assert.deepEqual([expired.running, expired.failed, expired.errorCode], [false, true, SITEMAP_AI_LEASE_EXPIRED]);
  assert.equal(sitemapAiPhase(expired, now), 'failed');
  assert.equal(sitemapAiDraftOf({ job: { state: 'running' } }, now).running, false, 'lease が無い running はサーバーも実行中とみなさない');
  const live = sitemapAiDraftOf({ job: { state: 'running', leaseUntil: ts(now + 60_000) } }, now);
  assert.equal(live.running, true);
  assert.equal(sitemapAiPhase(live, now), 'running');
  assert.equal(sitemapAiPhase(live, now + 60_000), 'failed', '読んだ後に lease が切れた');
});

test('QA O-4: 通信・サーバーの失敗（internal・unavailable・deadline-exceeded）は利用者向けの文言にする', () => {
  for (const code of ['functions/internal', 'functions/unavailable', 'functions/deadline-exceeded']) {
    assert.equal(sitemapCallableError(Object.assign(new Error('internal'), { code })).message, SITEMAP_NETWORK_ERROR_TEXT, code);
  }
  assert.equal(sitemapCallableError({ code: 'functions/aborted' }) instanceof SitemapConflictError, true);
});

test('Minor: ログアウトの前の saveNow は待ちを書き切り、失敗が残れば false（registry.all で全案件）', async () => {
  const { createSaverRegistry } = await import('../../src/live/sitemap.ts');
  const timer = fakeTimer();
  let fail = false;
  const writes = [];
  const reg = createSaverRegistry(() => createSitemapSaver({ delayMs: 1200, timer, write: async (_v, base) => { if (fail) throw { code: 'functions/unavailable' }; writes.push(base); return base + 1; } }));
  reg.get('u', 'p1').push(edits(1), 2);
  reg.get('u', 'p2').push(edits(1), 0);
  const ok = await Promise.all(reg.all().map((s) => s.saveNow()));
  assert.deepEqual(ok, [true, true]);
  assert.deepEqual(writes.sort(), [0, 2]);
  fail = true;
  reg.get('u', 'p1').push(edits(2), 3);
  assert.equal(await reg.get('u', 'p1').saveNow(), false);
});

test('codex P1: キャンバスの待ち（300ms）は flush ですぐ書き、cancel では書かない（demo の離れたとき）', () => {
  const timer = fakeTimer();
  const p = createPendingSave(timer);
  const out = [];
  p.schedule(() => out.push(1), 300);
  p.schedule(() => out.push(2), 300);
  assert.equal(timer.q.length, 1, '前の予約は取り消す');
  p.flush();
  assert.deepEqual(out, [2]);
  assert.equal(timer.q.length, 0);
  p.flush();
  assert.deepEqual(out, [2], '2 回目は何もしない');
  p.schedule(() => out.push(3), 300);
  p.cancel();
  timer.fire();
  assert.deepEqual(out, [2]);
  p.schedule(() => out.push(4), 300);
  timer.fire();
  assert.deepEqual(out, [2, 4]);
  assert.equal(p.pending(), false);
});

test('QA D-1b: 手で作った現在の図（空）に最初に追加するページはトップ → callable の encode を通しても検査に通る', () => {
  const emptyBefore = { nodes: [], edges: [] };
  const o = addPageKindOptions('before', emptyBefore.nodes);
  assert.deepEqual(o, { kinds: ['home'], kind: 'home' });
  const first = { id: 'b-1', position: { x: 0, y: 0 }, data: { label: 'トップ', path: '/', kind: o.kind, reason: undefined } };
  const v = { before: { nodes: [first], edges: [] }, after };
  const wire = sdkEncode(sitemapSaveInput('p1', 0, v));
  assert.deepEqual(validateSitemapDoc({ before: wire.before, after: wire.after }).errors, []);
  // 従来の既定（ページ）のままだと home_count で拒否される（直す前の不具合）
  const old = { ...first, data: { ...first.data, kind: 'page' } };
  assert.deepEqual(validateSitemapDoc({ before: { nodes: [old], edges: [] }, after }).errors.map((e) => e.code), ['home_count']);
  // トップがある図は従来どおり（demo・改善後）
  assert.deepEqual(addPageKindOptions('after', after.nodes), { kinds: ['page', 'section', 'new', 'cta'], kind: 'new' });
  assert.equal(addPageKindOptions('before', [node('b-home', 'home', '/')]).kind, 'page');
});
