// サイトマップの編集の callable（functions/src/sitemap/edits.ts。LIVE_SITEMAP_IMPL_PLAN §4 U-F1・§7）。npm run test:functions（emulators:exec）からだけ動く。
// 本体 handleSaveSitemapEdits を Admin SDK（Firestore エミュレータ）で直接呼ぶ（ai-flow.test.mjs と同じ型）。export（functions/src/index.ts）は INT
// 対応: AC-01（callable）・AC-05・AC-11・AC-13・AC-14・AC-15・AC-16・SM-02・SM-08・SM-13・SM-14・SM-16・SM-17・文書サイズ・sec M-1・M-6・L-1
import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { assertDemoProject, emulatorHostFromEnv } from '../rules/guard.mjs';

const PROJECT = assertDemoProject(process.env.GCLOUD_PROJECT);
const fsHost = emulatorHostFromEnv('FIRESTORE_EMULATOR_HOST');
const freq = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp, getApps } = freq('firebase-admin/app');
const { getFirestore, Timestamp } = freq('firebase-admin/firestore');
const { handleSaveSitemapEdits, manualSitemapStart } = freq('./lib/sitemap/edits.js');
const { makeSitemapFunctions } = freq('./lib/sitemap/index.js');
const { SITEMAP_LIMITS } = freq('./lib/ai/shared/sitemapRules.js');

if (getApps().length === 0) initializeApp({ projectId: PROJECT });
const db = getFirestore();
const T = Date.parse('2026-11-28T03:00:00Z');
const CANARY = 'CANARY-SITEMAP-5e1d';
const auth = (uid, o = {}) => ({ uid, token: { email: o.email ?? `${uid}@x.example`, email_verified: o.verified ?? true } });
const INTERNAL = 'projects/p1/sitemap/internal';

let logs;
let clock;
const logger = { info: (m, f) => logs.push(['info', m, f]), warn: (m, f) => logs.push(['warn', m, f]), error: (m, f) => logs.push(['error', m, f]) };
const deps = (o = {}) => ({ db, now: () => clock, log: logger, ...o });
const save = (uid, data = {}, o = {}) => handleSaveSitemapEdits({ auth: uid ? auth(uid, o.auth) : null, data: { projectId: 'p1', ...data } }, deps(o.deps));
const create = (uid, o) => save(uid, { op: 'createManual' }, o);
const internal = async () => (await db.doc(INTERNAL).get()).data();
const project = async () => (await db.doc('projects/p1').get()).data();

const node = (id, x, y, label, path, kind, reason) => ({ id, position: { x, y }, data: { label, path, kind, ...(reason !== undefined ? { reason } : {}) } });
const edge = (s, t) => ({ id: `${s}-${t}`, source: s, target: t });
const validDoc = () => ({
  before: { nodes: [node('b-home', 0, 0, 'トップ', '/', 'home'), node('b-info', 0, 140, 'その他', '/info', 'section')], edges: [edge('b-home', 'b-info')] },
  after: {
    nodes: [node('a-home', 0, 0, 'トップ', '/', 'home', '主力商品を最初に'), node('a-shop', 0, 150, 'ショップ', '/shop', 'section'), node('a-contact', 200, 150, 'お問い合わせ', '/contact', 'cta')],
    edges: [edge('a-home', 'a-shop'), edge('a-home', 'a-contact')],
  },
});
const edit = (uid, doc, baseEditSeq, extra = {}, o) => save(uid, { op: 'save', baseEditSeq, ...doc, ...extra }, o);

/** HttpsError のコードと details（の一部）を確かめる */
const rejects = (code, details) => (e) => {
  assert.equal(e.code, code, `code ${e.code} (${JSON.stringify(e.details)})`);
  if (details) for (const [k, v] of Object.entries(details)) assert.deepEqual(e.details?.[k], v, `details.${k}`);
  return true;
};

async function seed() {
  const acct = (uid, role, o = {}) => db.doc(`accounts/${uid}`).set({ schemaVersion: 1, status: o.status ?? 'active', email: `${uid}@x.example`, role, name: `名前${uid}`, ...(o.projectId ? { projectId: o.projectId } : {}) });
  await Promise.all([acct('adm', 'admin'), acct('devA', 'developer'), acct('devB', 'developer'), acct('cli', 'client', { projectId: 'p1' }), acct('off', 'developer', { status: 'disabled' })]);
  await db.doc('projects/p1').set({
    memberUids: ['devA', 'off'], archived: false, requirements: { status: 'approved', revision: 2 },
    schedule: { status: 'approved', revision: 1, approvedRevision: 1 },
  });
}

beforeEach(async () => {
  const r = await fetch(`http://${fsHost.host}:${fsHost.port}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  assert.equal(r.status, 200);
  logs = []; clock = T;
  await seed();
});

// ---------- 手で作る（none → draft。PLAN §3） ----------
test('作成1: 担当の開発者が手で作る → editSeq 0・改善後はトップ 1 件だけ・origin manual・要約 {draft, 0}', async () => {
  assert.deepEqual(await create('devA'), { editSeq: 0 });
  const d = await internal();
  assert.deepEqual(d.before, { nodes: [], edges: [] });
  assert.deepEqual(d.after, manualSitemapStart().after);
  assert.equal(d.after.nodes.length, 1);
  assert.equal(d.after.nodes[0].data.kind, 'home');
  assert.equal(d.origin, 'manual');
  assert.equal(d.sourceReqRevision, 2);
  assert.equal(d.editSeq, 0);
  assert.equal(d.schemaVersion, 1);
  assert.equal(d.updatedBy, 'devA');
  assert.equal(d.savedByName, '名前devA');
  const p = await project();
  assert.deepEqual(p.sitemap, { status: 'draft', revision: 0 });
  assert.equal(p.updatedBy, 'devA');
  assert.deepEqual(logs.map(([l, m, f]) => [l, m, f.status, f.op]), [['info', 'sitemap.edits', 'saved', 'createManual']]);
});
test('作成2: 担当外の案件でも admin は作れる（AC-01）', async () => {
  assert.deepEqual(await create('adm'), { editSeq: 0 });
  assert.equal((await project()).sitemap.status, 'draft');
});
test('作成3: 2 回目の作成は state（要約・internal があるとき）', async () => {
  await create('devA');
  await assert.rejects(create('devA'), rejects('failed-precondition', { reason: 'state' }));
  // 要約だけある（AI の作成途中など）でも state
  await db.doc(INTERNAL).delete();
  await assert.rejects(create('adm'), rejects('failed-precondition', { reason: 'state' }));
});

// ---------- 認可（AC-01・SM-02） ----------
test('認可1: 担当外の開発者・お客様・無効アカウント → permission-denied（何も書かない）', async () => {
  for (const uid of ['devB', 'cli', 'off']) await assert.rejects(create(uid), rejects('permission-denied'));
  assert.equal(await internal(), undefined);
  assert.equal((await project()).sitemap, undefined);
});
test('認可2: 未ログイン → unauthenticated・email_verified=false・メール不一致 → permission-denied', async () => {
  await assert.rejects(create(null), rejects('unauthenticated'));
  await assert.rejects(create('devA', { auth: { verified: false } }), rejects('permission-denied'));
  await assert.rejects(create('adm', { auth: { email: 'other@x.example' } }), rejects('permission-denied'));
  assert.equal(await internal(), undefined);
});
test('認可3（sec M-1）: TX の前に担当から外れた・アーカイブされた → TX 内の案件で判定して拒否', async () => {
  // runTransaction の直前（resolveCaller の後）に案件を変える。判定が TX の外の古い案件を使っていれば通ってしまう
  const racing = (patch) => ({ doc: (p) => db.doc(p), runTransaction: async (fn) => { await db.doc('projects/p1').update(patch); return db.runTransaction(fn); } });
  await assert.rejects(create('devA', { deps: { db: racing({ memberUids: ['off'] }) } }), rejects('permission-denied'));
  await seed();
  await assert.rejects(create('devA', { deps: { db: racing({ archived: true }) } }), rejects('failed-precondition', { reason: 'archived' }));
  assert.equal(await internal(), undefined);
});
test('認可4: TX の前にアカウントが無効化された → permission-denied', async () => {
  const racing = { doc: (p) => db.doc(p), runTransaction: async (fn) => { await db.doc('accounts/devA').update({ status: 'disabled' }); return db.runTransaction(fn); } };
  await assert.rejects(create('devA', { deps: { db: racing } }), rejects('permission-denied'));
});

// ---------- 前提（AC-05・AC-13・SM-13・SM-14） ----------
test('前提1: 要件定義書が approved でない（draft・analyzed）→ req-not-approved（admin も）', async () => {
  for (const status of ['draft', 'analyzed', 'requested']) {
    await db.doc('projects/p1').update({ requirements: { status, revision: 0 } });
    for (const uid of ['devA', 'adm']) await assert.rejects(create(uid), rejects('failed-precondition', { reason: 'req-not-approved' }));
  }
  assert.equal(await internal(), undefined);
});
test('前提2: アーカイブ中は作成も保存も archived（読み取りは Rules 側）', async () => {
  await create('devA');
  await db.doc('projects/p1').update({ archived: true });
  await assert.rejects(edit('devA', validDoc(), 0), rejects('failed-precondition', { reason: 'archived' }));
  await assert.rejects(edit('adm', validDoc(), 0), rejects('failed-precondition', { reason: 'archived' }));
  assert.equal((await internal()).editSeq, 0);
});
test('前提3: AI の生成中（lease 内）は保存も作成も job-running・lease 切れは通る（OQ-S5）', async () => {
  await db.doc('projects/p1/aiDrafts/sitemap').set({ job: { state: 'running', leaseUntil: Timestamp.fromMillis(T + 60_000) } });
  await assert.rejects(create('devA'), rejects('failed-precondition', { reason: 'job-running' }));
  await db.doc('projects/p1/aiDrafts/sitemap').set({ job: { state: 'running', leaseUntil: Timestamp.fromMillis(T - 1) } });
  assert.deepEqual(await create('devA'), { editSeq: 0 });
  await db.doc('projects/p1/aiDrafts/sitemap').set({ job: { state: 'running', leaseUntil: Timestamp.fromMillis(T + 60_000) } });
  await assert.rejects(edit('devA', validDoc(), 0), rejects('failed-precondition', { reason: 'job-running' }));
  assert.equal((await internal()).editSeq, 0);
});

// ---------- 保存（D-5・AC-16・SM-08・SM-16） ----------
test('保存1: 丸ごと置換・editSeq+1・origin と sourceReqRevision は変えない・コメントは名前と日時つき', async () => {
  await create('devA');
  clock = T + 1000;
  assert.deepEqual(await edit('devA', validDoc(), 0, { devComment: { text: '  意図を書きます  ' } }), { editSeq: 1 });
  const d = await internal();
  assert.deepEqual(d.before, validDoc().before);
  assert.deepEqual(d.after, validDoc().after);
  assert.equal(d.editSeq, 1);
  assert.equal(d.origin, 'manual');
  assert.equal(d.sourceReqRevision, 2);
  assert.equal(d.devComment.text, '意図を書きます');
  assert.equal(d.devComment.byUid, 'devA');
  assert.equal(d.devComment.byName, '名前devA');
  assert.equal(d.devComment.at.toMillis(), T + 1000);
  // 本文が同じなら、書いた人と日時は変えない（admin が別の箇所を直しても「開発担当者より」は devA のまま）
  clock = T + 5000;
  assert.deepEqual(await edit('adm', validDoc(), 1, { devComment: { text: '意図を書きます' } }), { editSeq: 2 });
  const d2 = await internal();
  assert.equal(d2.devComment.byUid, 'devA');
  assert.equal(d2.devComment.at.toMillis(), T + 1000);
  assert.equal(d2.updatedBy, 'adm');
  assert.equal(d2.savedByName, '名前adm');
  // コメントを送らない・空白だけ → キーを消す
  assert.deepEqual(await edit('devA', validDoc(), 2, { devComment: { text: '   ' } }), { editSeq: 3 });
  assert.equal('devComment' in (await internal()), false);
  // 保存は要約を変えない（Write 1）
  assert.deepEqual((await project()).sitemap, { status: 'draft', revision: 0 });
});
test('保存2（AC-16・SM-16）: 同じ editSeq から 2 回保存 → 2 回目は aborted（conflict）・中身は 1 回目のまま', async () => {
  await create('devA');
  await edit('devA', validDoc(), 0);
  const other = validDoc();
  other.after.nodes[1].data.label = '別タブ';
  await assert.rejects(edit('adm', other, 0), rejects('aborted', { reason: 'conflict' }));
  const d = await internal();
  assert.equal(d.editSeq, 1);
  assert.equal(d.after.nodes[1].data.label, 'ショップ');
  // 先の editSeq（未来）も競合
  await assert.rejects(edit('devA', validDoc(), 5), rejects('aborted'));
});
test('保存3（AC-11・SM-08）: 依頼中・承認済みは保存できない（state）。none（要約なし）も state', async () => {
  await assert.rejects(edit('devA', validDoc(), 0), rejects('failed-precondition', { reason: 'state' }));
  await create('devA');
  for (const status of ['requested', 'approved']) {
    await db.doc('projects/p1').update({ 'sitemap.status': status, 'sitemap.revision': 1 });
    for (const uid of ['devA', 'adm']) await assert.rejects(edit(uid, validDoc(), 0), rejects('failed-precondition', { reason: 'state' }));
  }
  assert.equal((await internal()).editSeq, 0);
});
test('保存4: 要約が draft でも internal が無ければ state（作り直しは AI か手で）', async () => {
  await create('devA');
  await db.doc(INTERNAL).delete();
  await assert.rejects(edit('devA', validDoc(), 0), rejects('failed-precondition', { reason: 'state' }));
});

// ---------- 中身の検査（AC-14・AC-15・SM-17。保存されない） ----------
const many = (v, n) => Array.from({ length: n }, (_, i) => node(`${v}-p${i}`, i, 100, `ページ${i}`, i === 0 ? '/' : `/p${i}`, i === 0 ? 'home' : 'page'));
const BAD = [
  ['61 ページ', (d) => { d.after.nodes = many('a', 61); d.after.edges = []; }, 'too_many_pages', 'after.nodes'],
  ['121 接続', (d) => { d.after.edges = Array.from({ length: 121 }, (_, i) => ({ id: `a-e${i}`, source: 'a-home', target: 'a-shop' })); }, 'too_many_edges', 'after.edges'],
  ['ページ名 0 字', (d) => { d.after.nodes[1].data.label = ''; }, 'label_required', 'after.label'],
  ['ページ名 25 字', (d) => { d.after.nodes[1].data.label = 'あ'.repeat(25); }, 'label_too_long', 'after.label'],
  ['ページ名の制御文字', (d) => { d.after.nodes[1].data.label = 'a‮b'; }, 'label_control', 'after.label'],
  ['理由 141 字', (d) => { d.after.nodes[0].data.reason = 'x'.repeat(141); }, 'reason_too_long', 'after.reason'],
  ['理由の制御文字', (d) => { d.after.nodes[0].data.reason = 'a\u0007'; }, 'reason_control', 'after.reason'],
  ['パスの重複', (d) => { d.after.nodes[2].data.path = '/shop'; }, 'path_duplicate', 'after.path'],
  ['パスの文字', (d) => { d.after.nodes[2].data.path = '/お問い合わせ'; }, 'path_chars', 'after.path'],
  ['パスが / で始まらない', (d) => { d.after.nodes[2].data.path = 'contact'; }, 'path_slash', 'after.path'],
  ['トップ 0 件', (d) => { d.after.nodes[0].data.kind = 'page'; }, 'home_count', 'after.nodes'],
  ['トップ 2 件', (d) => { d.before.nodes[1].data.kind = 'home'; }, 'home_count', 'before.nodes'],
  ['ID の形', (d) => { d.after.nodes[1].id = 'x-shop'; }, 'id_format', 'after.id'],
  ['ID の重複', (d) => { d.after.nodes[2].id = 'a-shop'; }, 'id_duplicate', 'after.id'],
  ['自己接続', (d) => { d.after.edges.push({ id: 'a-shop-a-shop', source: 'a-shop', target: 'a-shop' }); }, 'edge_self', 'after.edges'],
  ['接続の端が無い', (d) => { d.after.edges.push({ id: 'a-home-a-none', source: 'a-home', target: 'a-none' }); }, 'edge_endpoint', 'after.edges'],
  ['接続の重複', (d) => { d.after.edges.push({ id: 'a-home-a-shop2', source: 'a-home', target: 'a-shop' }); }, 'edge_duplicate', 'after.edges'],
  ['座標 NaN', (d) => { d.after.nodes[1].position.x = NaN; }, 'position', 'after.position'],
  ['座標 Infinity', (d) => { d.after.nodes[1].position.y = Infinity; }, 'position', 'after.position'],
  ['座標 1e6', (d) => { d.after.nodes[1].position.x = 1e6; }, 'position', 'after.position'],
  ['kind の値', (d) => { d.after.nodes[1].data.kind = 'admin'; }, 'kind', 'after.kind'],
  ['ノードの余分なキー', (d) => { d.after.nodes[1].extra = 1; }, 'unknown_key', 'after.nodes'],
  ['data の余分なキー', (d) => { d.after.nodes[1].data.href = 'javascript:1'; }, 'unknown_key', 'after.nodes'],
  ['図の余分なキー', (d) => { d.after.viewport = {}; }, 'unknown_key', 'after'],
  ['コメント 501 字', (d) => { d.devComment = { text: 'x'.repeat(501) }; }, 'devComment_too_long', 'devComment'],
];
test(`検査（SM-17）: 不正な ${BAD.length} 種はどれも invalid-argument・details は {field, nodeId?, code, count} だけ・保存されない`, async () => {
  await create('devA');
  for (const [name, mutate, code, field] of BAD) {
    const d = validDoc();
    mutate(d);
    const { devComment, ...doc } = d;
    await assert.rejects(edit('devA', doc, 0, devComment ? { devComment } : {}), (e) => {
      assert.equal(e.code, 'invalid-argument', name);
      assert.equal(e.details.code, code, name);
      assert.equal(e.details.field, field, name);
      assert.equal(typeof e.details.count, 'number', name);
      assert.ok(Object.keys(e.details).every((k) => ['field', 'nodeId', 'code', 'count'].includes(k)), name);
      if (e.details.nodeId !== undefined) assert.match(e.details.nodeId, /^[ab]-[a-z0-9-]{1,40}$/, name);
      return true;
    });
  }
  const d = await internal();
  assert.equal(d.editSeq, 0);
  assert.deepEqual(d.after, manualSitemapStart().after);
});
test('検査（AC-15）: トップは各図にちょうど 1 件。現在の図は空でもよい（現行サイトが無い案件）', async () => {
  await create('devA');
  const d = validDoc();
  d.before = { nodes: [], edges: [] };
  assert.deepEqual(await edit('devA', d, 0), { editSeq: 1 });
  const noHome = validDoc();
  noHome.after.nodes = noHome.after.nodes.filter((n) => n.data.kind !== 'home');
  noHome.after.edges = [];
  await assert.rejects(edit('devA', noHome, 1), rejects('invalid-argument', { code: 'home_count' }));
});
test(`検査: 上限ちょうど（各図 ${SITEMAP_LIMITS.pages} ページ・${SITEMAP_LIMITS.edges} 接続・最大長）は保存でき、文書は 300KB 未満`, async () => {
  await create('devA');
  const big = (v) => {
    const nodes = Array.from({ length: SITEMAP_LIMITS.pages }, (_, i) => node(
      `${v}-${'p'.repeat(30)}${String(i).padStart(4, '0')}`, -99_999.5 + i, 99_999,
      'あ'.repeat(SITEMAP_LIMITS.label - 2) + String(i).padStart(2, '0'),
      i === 0 ? '/' : `/${'x'.repeat(SITEMAP_LIMITS.path - 6)}${String(i).padStart(4, '0')}`,
      i === 0 ? 'home' : 'new', '理'.repeat(SITEMAP_LIMITS.reason),
    ));
    // トップ → 各ページ 59・i → i+1 が 58・i → i+2 が 3 ＝ 120（重複・自己接続なし）
    const edges = [];
    for (let i = 1; i < nodes.length; i++) edges.push({ id: `${v}-h${i}`, source: nodes[0].id, target: nodes[i].id });
    for (let i = 1; i + 1 < nodes.length; i++) edges.push({ id: `${v}-n${i}`, source: nodes[i].id, target: nodes[i + 1].id });
    for (let i = 1; i <= 3; i++) edges.push({ id: `${v}-s${i}`, source: nodes[i].id, target: nodes[i + 2].id });
    return { nodes, edges: edges.slice(0, SITEMAP_LIMITS.edges) };
  };
  const doc = { before: big('b'), after: big('a') };
  assert.equal(doc.after.nodes.length, 60);
  assert.equal(doc.after.edges.length, 120);
  assert.deepEqual(await edit('devA', doc, 0, { devComment: { text: 'コ'.repeat(SITEMAP_LIMITS.devComment) } }), { editSeq: 1 });
  const d = await internal();
  assert.equal(d.after.nodes.length, 60);
  assert.equal(d.before.edges.length, 120);
  const bytes = Buffer.byteLength(JSON.stringify(d), 'utf8');
  assert.ok(bytes < 300 * 1024, `internal ${bytes} bytes`);
});

// ---------- 入力の厳格さ（sec L-1） ----------
test('入力1: origin・editSeq・status・updatedBy・revision などの未知キー → invalid-argument（field input・unknown_key）', async () => {
  await create('devA');
  for (const k of ['origin', 'editSeq', 'status', 'updatedBy', 'revision', 'aiRequestId', `x${CANARY}`]) {
    await assert.rejects(edit('devA', validDoc(), 0, { [k]: k === 'origin' ? 'ai' : 1 }), (e) => {
      assert.equal(e.code, 'invalid-argument', k);
      assert.deepEqual(e.details, { field: 'input', code: 'unknown_key', count: 1 }, k);
      return true;
    });
  }
  await assert.rejects(save('devA', { op: 'createManual', origin: 'ai' }), rejects('invalid-argument', { code: 'unknown_key' }));
  await assert.rejects(save('devA', { op: 'createManual', ...validDoc() }), rejects('invalid-argument', { code: 'unknown_key' }));
  assert.equal((await internal()).origin, 'manual');
  assert.equal((await internal()).editSeq, 0);
});
test('入力2: baseEditSeq が整数でない・負・欠け、op が不明、projectId の形、devComment の形 → invalid-argument', async () => {
  await create('devA');
  for (const v of ['0', 1.5, -1, null, NaN]) await assert.rejects(edit('devA', validDoc(), v), rejects('invalid-argument', { field: 'baseEditSeq' }));
  const { before, after } = validDoc();
  await assert.rejects(save('devA', { op: 'save', before, after }), rejects('invalid-argument', { code: 'required' }));
  for (const op of ['delete', undefined, 1]) await assert.rejects(save('devA', { op }), rejects('invalid-argument'));
  await assert.rejects(handleSaveSitemapEdits({ auth: auth('devA'), data: { projectId: '../p1', op: 'createManual' } }, deps()), rejects('invalid-argument', { field: 'projectId' }));
  await assert.rejects(handleSaveSitemapEdits({ auth: auth('devA'), data: null }, deps()), rejects('invalid-argument', { code: 'shape' }));
  for (const c of ['text', { text: 1 }, { text: 'a', byUid: 'adm' }, { text: 'a', at: 'x' }]) {
    await assert.rejects(edit('devA', validDoc(), 0, { devComment: c }), rejects('invalid-argument', { field: 'devComment' }));
  }
  assert.equal((await internal()).editSeq, 0);
});

// ---------- ログと details に入力の文字列を出さない（sec M-6・SM-29 を U-F1 まで） ----------
test('ログ（M-6）: 注入文字列を含む不正・正常の保存で、ログと HttpsError の details に入力の文字列が無い', async () => {
  await create('devA');
  const errors = [];
  const bad = [
    (d) => { d.after.nodes[1].data.label = `${CANARY}${'x'.repeat(30)}`; },
    (d) => { d.after.nodes[1].data.reason = `<img src=x onerror=alert(1)>${CANARY}`.padEnd(200, 'x'); },
    (d) => { d.after.nodes[1].data.path = `/${CANARY}/<script>`; },
    (d) => { d.after.nodes[1].id = `a-${CANARY}`; },
    (d) => { d.after.nodes[1].data[CANARY] = CANARY; },
  ];
  for (const m of bad) {
    const d = validDoc();
    m(d);
    await edit('devA', d, 0).catch((e) => errors.push(e));
  }
  await edit('devA', validDoc(), 0, { devComment: { text: `${CANARY}${'x'.repeat(600)}` } }).catch((e) => errors.push(e));
  await edit('devA', validDoc(), 0, { [CANARY]: CANARY }).catch((e) => errors.push(e));
  assert.equal(errors.length, 7);
  // 正常の保存（中身に canary を含む）
  const ok = validDoc();
  ok.after.nodes[1].data.label = 'CANARY-SITEMAP';
  ok.after.nodes[1].data.reason = CANARY;
  await edit('devA', ok, 0, { devComment: { text: CANARY } });
  const dump = JSON.stringify({ logs, errors: errors.map((e) => ({ code: e.code, message: e.message, details: e.details })) });
  assert.doesNotMatch(dump, new RegExp(CANARY));
  assert.doesNotMatch(dump, /onerror|<script>|名前devA/);
  for (const e of errors) assert.equal(e.message, 'invalid');
  assert.ok(logs.every(([, m]) => m === 'sitemap.edits'));
});

// ---------- 配線の形（sec M-4: Secret を結ばない） ----------
test('関数定義: saveSitemapEdits・submitSitemap は callable で Secret を持たない', () => {
  const fns = makeSitemapFunctions({ enforceAppCheck: false, cors: false });
  for (const name of ['saveSitemapEdits', 'submitSitemap']) {
    const ep = fns[name].__endpoint;
    assert.ok(ep?.callableTrigger, name);
    assert.equal((ep.secretEnvironmentVariables ?? []).length, 0, name);
  }
});
