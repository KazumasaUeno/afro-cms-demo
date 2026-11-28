// サイトマップの依頼の callable（functions/src/sitemap/submit.ts・version.ts。LIVE_SITEMAP_IMPL_PLAN §4 U-F1・§7）。npm run test:functions からだけ動く。
// 本体 handleSubmitSitemap を Admin SDK（Firestore エミュレータ）で直接呼ぶ。export（functions/src/index.ts）は INT
// 対応: AC-06・AC-07（ハッシュ再計算一致・allowlist）・SM-10（rev+1・rev 51 拒否）・SM-15・冪等 WARN・S-7（AI 実行中は拒否）・sec M-1・M-6・L-1・L-2・L-3
import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { assertDemoProject, emulatorHostFromEnv } from '../rules/guard.mjs';

const PROJECT = assertDemoProject(process.env.GCLOUD_PROJECT);
const fsHost = emulatorHostFromEnv('FIRESTORE_EMULATOR_HOST');
const freq = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp, getApps } = freq('firebase-admin/app');
const { getFirestore, Timestamp } = freq('firebase-admin/firestore');
const { handleSaveSitemapEdits } = freq('./lib/sitemap/edits.js');
const { handleSubmitSitemap } = freq('./lib/sitemap/submit.js');
const { contentHashOf, toSitemapVersion } = freq('./lib/sitemap/version.js');
const { canonicalSitemapJson } = freq('./lib/ai/shared/sitemapRules.js');

if (getApps().length === 0) initializeApp({ projectId: PROJECT });
const db = getFirestore();
const T = Date.parse('2026-11-28T03:00:00Z');
const CANARY = 'CANARY-SUBMIT-0b7c';
const auth = (uid, o = {}) => ({ uid, token: { email: o.email ?? `${uid}@x.example`, email_verified: o.verified ?? true } });
const INTERNAL = 'projects/p1/sitemap/internal';

let logs;
let clock;
const logger = { info: (m, f) => logs.push(['info', m, f]), warn: (m, f) => logs.push(['warn', m, f]), error: (m, f) => logs.push(['error', m, f]) };
const deps = (o = {}) => ({ db, now: () => clock, log: logger, ...o });
const submit = (uid, data = {}, o = {}) => handleSubmitSitemap({ auth: uid ? auth(uid, o.auth) : null, data: { projectId: 'p1', baseEditSeq: 1, expectRevision: 0, ...data } }, deps(o.deps));
const get = async (p) => (await db.doc(p).get()).data();
const project = () => get('projects/p1');
const approvalIds = async () => (await db.collection('projects/p1/approvals').get()).docs.map((d) => d.id).sort();
const versionIds = async () => (await db.collection('projects/p1/sitemapVersions').get()).docs.map((d) => d.id).sort();

const node = (id, x, y, label, path, kind, reason) => ({ id, position: { x, y }, data: { label, path, kind, ...(reason !== undefined ? { reason } : {}) } });
const edge = (s, t) => ({ id: `${s}-${t}`, source: s, target: t });
const validDoc = () => ({
  before: { nodes: [node('b-home', 0, 0, 'トップ', '/', 'home'), node('b-info', 0, 140, 'その他', '/info', 'section')], edges: [edge('b-home', 'b-info')] },
  after: {
    nodes: [node('a-home', 0, 0, 'トップ', '/', 'home', '主力商品を最初に'), node('a-shop', 0, 150, 'ショップ', '/shop', 'section'), node('a-contact', 200, 150, 'お問い合わせ', '/contact', 'cta')],
    edges: [edge('a-home', 'a-shop'), edge('a-home', 'a-contact')],
  },
});

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

/** 手で作って 1 回保存（editSeq 1）。保存は本物の callable を通す */
async function draft(doc = validDoc(), comment = { text: '意図のコメント' }) {
  const call = (data) => handleSaveSitemapEdits({ auth: auth('devA'), data: { projectId: 'p1', ...data } }, deps());
  await call({ op: 'createManual' });
  clock = T + 1000;
  await call({ op: 'save', baseEditSeq: 0, ...doc, ...(comment ? { devComment: comment } : {}) });
  clock = T + 2000;
  logs = [];
}

beforeEach(async () => {
  const r = await fetch(`http://${fsHost.host}:${fsHost.port}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  assert.equal(r.status, 200);
  logs = []; clock = T;
  await seed();
});

// ---------- 成功（AC-07・DATA §2.3・§2.4） ----------
test('依頼1: 版文書 r1（不変・allowlist）＋承認記録 submit＋要約 requested を 1 TX で作る', async () => {
  await draft();
  const out = await submit('devA');
  assert.equal(out.revision, 1);
  assert.match(out.contentHash, /^[0-9a-f]{64}$/);
  const v = await get('projects/p1/sitemapVersions/r1');
  assert.deepEqual(Object.keys(v).sort(), ['after', 'before', 'contentHash', 'devComment', 'origin', 'revision', 'schemaVersion', 'sourceReqRevision', 'submittedAt', 'submittedBy']);
  assert.deepEqual(v.before, validDoc().before);
  assert.deepEqual(v.after, validDoc().after);
  assert.deepEqual(Object.keys(v.devComment).sort(), ['at', 'byName', 'text']);
  assert.equal(v.devComment.byName, '名前devA');
  assert.equal(v.origin, 'manual');
  assert.equal(v.revision, 1);
  assert.equal(v.schemaVersion, 1);
  assert.equal(v.sourceReqRevision, 2);
  assert.equal(v.contentHash, out.contentHash);
  assert.equal(v.submittedBy, 'devA');
  assert.equal(v.submittedAt.toMillis(), T + 2000);
  const a = await get('projects/p1/approvals/sitemap-r1-submit');
  assert.deepEqual(a, {
    schemaVersion: 1, kind: 'sitemap', action: 'submit', revision: 1, side: 'afro',
    actorUid: 'devA', actorName: '名前devA', actorEmail: 'devA@x.example', at: a.at, actorRole: 'developer',
    contentHash: out.contentHash, pageCount: { before: 2, after: 3 },
  });
  assert.equal(a.at.toMillis(), T + 2000);
  const p = await project();
  assert.equal(p.sitemap.status, 'requested');
  assert.equal(p.sitemap.revision, 1);
  assert.equal(p.sitemap.contentHash, out.contentHash);
  assert.equal(p.sitemap.requestedAt.toMillis(), T + 2000);
  assert.equal(p.updatedBy, 'devA');
  // internal は変えない（承認後の再計画で編集を再開できる）
  assert.equal((await get(INTERNAL)).editSeq, 1);
  assert.deepEqual(logs.map(([l, m, f]) => [l, m, f.status, f.revision]), [['info', 'sitemap.submit', 'submitted', 1]]);
});
test('依頼2（AC-07）: 承認記録の contentHash ＝ 版文書から再計算した sha256(canonical) ＝ internal から作った値', async () => {
  await draft();
  const { contentHash } = await submit('adm');
  const v = await get('projects/p1/sitemapVersions/r1');
  const direct = createHash('sha256').update(canonicalSitemapJson({ before: v.before, after: v.after, devComment: v.devComment }), 'utf8').digest('hex');
  assert.equal(direct, contentHash);
  assert.equal(contentHashOf(v), contentHash);
  assert.equal(contentHashOf(await get(INTERNAL)), contentHash);
  assert.equal((await get('projects/p1/approvals/sitemap-r1-submit')).contentHash, contentHash);
  assert.equal((await get('projects/p1/approvals/sitemap-r1-submit')).actorRole, 'admin');
});
test('依頼3: コメント無しでも版文書を作る（devComment のキーを持たない）', async () => {
  await draft(validDoc(), null);
  await submit('devA');
  assert.equal('devComment' in (await get('projects/p1/sitemapVersions/r1')), false);
});

// ---------- 版の番号（SM-10・sec L-2） ----------
test('版1（L-2）: expectRevision を +2・+1 で送る → aborted（書かない）。rev はサーバーが事前 +1 で決める', async () => {
  await draft();
  for (const expectRevision of [2, 1]) await assert.rejects(submit('devA', { expectRevision }), rejects('aborted', { reason: 'conflict' }));
  assert.deepEqual(await versionIds(), []);
  assert.deepEqual(await approvalIds(), []);
  assert.equal((await project()).sitemap.status, 'draft');
  assert.equal((await submit('devA', { expectRevision: 0 })).revision, 1);
});
test('版2（SM-10）: 要約の revision 50 から依頼 → revision-limit（51 を作らない）。49 からは 50 を作れる', async () => {
  await draft();
  await db.doc('projects/p1').update({ 'sitemap.revision': 50 });
  await assert.rejects(submit('devA', { expectRevision: 50 }), rejects('failed-precondition', { reason: 'revision-limit' }));
  assert.deepEqual(await versionIds(), []);
  await db.doc('projects/p1').update({ 'sitemap.revision': 49 });
  assert.equal((await submit('devA', { expectRevision: 49 })).revision, 50);
  assert.deepEqual(await versionIds(), ['r50']);
});
test('版3: 取り下げ後（draft・revision 1）に再依頼 → r2。前回承認の印（approvedRevision 等）は残す', async () => {
  await draft();
  await submit('devA');
  // 承認 → 再計画（Rules の client TX の結果を Admin で作る）
  await db.doc('projects/p1').update({ 'sitemap.status': 'draft', 'sitemap.approvedRevision': 1, 'sitemap.approvalId': 'sitemap-r1-approve', 'sitemap.approvedBy': 'cli', 'sitemap.approvedAt': Timestamp.fromMillis(T) });
  const out = await submit('devA', { expectRevision: 1 });
  assert.equal(out.revision, 2);
  const s = (await project()).sitemap;
  assert.equal(s.status, 'requested');
  assert.equal(s.revision, 2);
  assert.equal(s.approvedRevision, 1);
  assert.equal(s.approvalId, 'sitemap-r1-approve');
  assert.deepEqual(await versionIds(), ['r1', 'r2']);
  assert.deepEqual(await approvalIds(), ['sitemap-r1-submit', 'sitemap-r2-submit']);
});
test('版4: 既に同じ番号の版文書がある（要約と食い違う）→ state・重複を作らない', async () => {
  await draft();
  await db.doc('projects/p1/sitemapVersions/r1').set({ contentHash: 'x' });
  await assert.rejects(submit('devA'), rejects('failed-precondition', { reason: 'state' }));
  assert.deepEqual(await approvalIds(), []);
  assert.equal((await project()).sitemap.status, 'draft');
});

// ---------- 冪等（DATA §3.2） ----------
test('冪等: 同じ依頼の 2 回目は同じ結果・WARN sitemap.submit.duplicate・記録は 1 件ずつ', async () => {
  await draft();
  const first = await submit('devA');
  logs = [];
  const second = await submit('devA');
  assert.deepEqual(second, first);
  assert.deepEqual(logs.map(([l, m, f]) => [l, m, f.status, f.revision]), [['warn', 'sitemap.submit.duplicate', 'duplicate', 1]]);
  assert.deepEqual(await versionIds(), ['r1']);
  assert.deepEqual(await approvalIds(), ['sitemap-r1-submit']);
  // editSeq が違う・既に別の版 → 冪等にしない（state）
  await assert.rejects(submit('devA', { baseEditSeq: 0 }), rejects('failed-precondition', { reason: 'state' }));
});

// ---------- 前提（AC-06・SM-15・S-7・S-3・S-9） ----------
test('前提1（AC-06・SM-15）: スケジュール未承認（approvedRevision なし）→ schedule-not-approved。再計画中（draft・approvedRevision あり）は通る', async () => {
  await draft();
  for (const schedule of [undefined, { status: 'requested', revision: 1 }, { status: 'draft', revision: 0 }, { status: 'approved', approvedRevision: 0 }]) {
    await db.doc('projects/p1').update({ schedule: schedule ?? null });
    await assert.rejects(submit('devA'), rejects('failed-precondition', { reason: 'schedule-not-approved' }));
  }
  assert.deepEqual(await versionIds(), []);
  await db.doc('projects/p1').update({ schedule: { status: 'draft', revision: 2, approvedRevision: 1 } });
  assert.equal((await submit('devA')).revision, 1);
});
test('前提2（S-7）: AI の生成中は job-running', async () => {
  await draft();
  await db.doc('projects/p1/aiDrafts/sitemap').set({ job: { state: 'running', leaseUntil: Timestamp.fromMillis(T + 60_000) } });
  await assert.rejects(submit('devA'), rejects('failed-precondition', { reason: 'job-running' }));
  assert.deepEqual(await versionIds(), []);
});
test('前提3: 依頼中・承認済み・未作成 → state、古い editSeq → aborted', async () => {
  await assert.rejects(submit('devA'), rejects('failed-precondition', { reason: 'state' }));
  await draft();
  await assert.rejects(submit('devA', { baseEditSeq: 0 }), rejects('aborted', { reason: 'conflict' }));
  for (const status of ['requested', 'approved']) {
    await db.doc('projects/p1').update({ 'sitemap.status': status });
    await assert.rejects(submit('devA', { expectRevision: 1 }), rejects('failed-precondition', { reason: 'state' }));
  }
  assert.deepEqual(await versionIds(), []);
});
test('前提4（S-3・SM-13・SM-14）: 担当外・お客様・無効・未ログイン・archived・要件未承認は拒否', async () => {
  await draft();
  for (const uid of ['devB', 'cli', 'off']) await assert.rejects(submit(uid), rejects('permission-denied'));
  await assert.rejects(submit(null), rejects('unauthenticated'));
  await assert.rejects(submit('devA', {}, { auth: { verified: false } }), rejects('permission-denied'));
  await db.doc('projects/p1').update({ archived: true });
  await assert.rejects(submit('adm'), rejects('failed-precondition', { reason: 'archived' }));
  await db.doc('projects/p1').update({ archived: false, 'requirements.status': 'draft' });
  await assert.rejects(submit('adm'), rejects('failed-precondition', { reason: 'req-not-approved' }));
  assert.deepEqual(await versionIds(), []);
  assert.deepEqual(await approvalIds(), []);
});
test('前提5（sec M-1）: TX の前に担当から外れた → TX 内の案件で拒否', async () => {
  await draft();
  const racing = { doc: (p) => db.doc(p), runTransaction: async (fn) => { await db.doc('projects/p1').update({ memberUids: [] }); return db.runTransaction(fn); } };
  await assert.rejects(submit('devA', {}, { deps: { db: racing } }), rejects('permission-denied'));
  assert.deepEqual(await versionIds(), []);
});

// ---------- 中身の検査（validateSitemapDoc 全件・改善後トップ＋1 件） ----------
test('中身1: internal に不正なページ（Admin で直接）→ invalid-argument（件数）・何も作らない', async () => {
  await draft();
  const d = await get(INTERNAL);
  d.after.nodes[1].data.label = 'x'.repeat(25);
  d.after.nodes[2].data.path = '/shop';
  await db.doc(INTERNAL).set(d);
  await assert.rejects(submit('devA'), (e) => {
    assert.equal(e.code, 'invalid-argument');
    assert.equal(e.details.count, 3); // 名前 1 件＋重複したパスは両方のページに出る
    assert.equal(e.details.code, 'label_too_long');
    assert.equal(e.details.nodeId, 'a-shop');
    return true;
  });
  assert.deepEqual(await versionIds(), []);
});
test('中身2: 改善後がトップだけ（手で作った直後）→ invalid-argument too_few_pages', async () => {
  const call = (data) => handleSaveSitemapEdits({ auth: auth('devA'), data: { projectId: 'p1', ...data } }, deps());
  await call({ op: 'createManual' });
  await assert.rejects(submit('devA', { baseEditSeq: 0 }), rejects('invalid-argument', { field: 'after.nodes', code: 'too_few_pages', count: 1 }));
  assert.equal((await project()).sitemap.status, 'draft');
});

// ---------- 入力（sec L-1） ----------
test('入力: 未知キー（revision・contentHash・status・origin）・整数でない値・欠け → invalid-argument', async () => {
  await draft();
  for (const k of ['revision', 'contentHash', 'status', 'origin', 'actorUid']) {
    await assert.rejects(submit('devA', { [k]: 1 }), rejects('invalid-argument', { field: 'input', code: 'unknown_key' }));
  }
  for (const [k, v] of [['baseEditSeq', '1'], ['expectRevision', 0.5], ['expectRevision', -1]]) {
    await assert.rejects(submit('devA', { [k]: v }), rejects('invalid-argument', { field: k }));
  }
  await assert.rejects(handleSubmitSitemap({ auth: auth('devA'), data: { projectId: 'p1', baseEditSeq: 1 } }, deps()), rejects('invalid-argument', { code: 'required' }));
  assert.deepEqual(await versionIds(), []);
});

// ---------- ハッシュの網羅（sec L-3）・版文書の allowlist（AC-03） ----------
test('ハッシュ（L-3）: お客様に見える項目を 1 つずつ変えるとハッシュが変わる。見えない項目では変わらない', () => {
  const base = { ...validDoc(), devComment: { text: 'c', at: Timestamp.fromMillis(T), byUid: 'devA', byName: 'n' } };
  const h0 = contentHashOf(base);
  const visible = [
    (d) => { d.after.nodes[1].data.label = 'ショップ2'; },
    (d) => { d.after.nodes[1].data.path = '/shop2'; },
    (d) => { d.after.nodes[0].data.reason = '別の理由'; },
    (d) => { delete d.after.nodes[0].data.reason; },
    (d) => { d.after.nodes[1].data.kind = 'new'; },
    (d) => { d.after.nodes[1].position.x = 1; },
    (d) => { d.after.nodes[1].position.y = 151; },
    (d) => { d.after.nodes[1].id = 'a-shop2'; },
    (d) => { d.before.nodes[1].data.label = '別'; },
    (d) => { d.after.edges.pop(); },
    (d) => { d.after.edges[0].target = 'a-contact'; },
    (d) => { d.devComment.text = 'c2'; },
    (d) => { d.devComment.at = Timestamp.fromMillis(T + 1); },
    (d) => { d.devComment.byName = 'm'; },
    (d) => { delete d.devComment; },
  ];
  const seen = new Set([h0]);
  visible.forEach((m, i) => {
    const d = structuredClone({ ...base, devComment: { ...base.devComment } });
    d.devComment.at = base.devComment.at;
    m(d);
    const h = contentHashOf(d);
    assert.notEqual(h, h0, `visible ${i}`);
    seen.add(h);
  });
  assert.equal(seen.size, visible.length + 1);
  for (const m of [(d) => { d.editSeq = 9; }, (d) => { d.updatedBy = 'x'; }, (d) => { d.devComment.byUid = 'adm'; }, (d) => { d.origin = 'ai'; }]) {
    const d = { ...base, devComment: { ...base.devComment } };
    m(d);
    assert.equal(contentHashOf(d), h0);
  }
});
test('版文書の allowlist（AC-03）: editSeq・updatedBy・aiRequestId・lastError・byUid・未知キーを写さない', () => {
  const v = toSitemapVersion({
    ...validDoc(), devComment: { text: 'c', at: 1, byUid: 'devA', byName: 'n' }, origin: 'ai', sourceReqRevision: 3,
    editSeq: 7, updatedBy: 'devA', updatedAt: 1, savedByName: 'n', aiRequestId: 'r', lastError: { code: 'x' }, generated: {}, secret: CANARY,
  }, { revision: 4, contentHash: 'h', submittedAt: 2, submittedBy: 'devA' });
  assert.deepEqual(Object.keys(v).sort(), ['after', 'before', 'contentHash', 'devComment', 'origin', 'revision', 'schemaVersion', 'sourceReqRevision', 'submittedAt', 'submittedBy']);
  assert.deepEqual(v.devComment, { text: 'c', at: 1, byName: 'n' });
  assert.equal(v.origin, 'ai');
  assert.doesNotMatch(JSON.stringify(v), new RegExp(CANARY));
});

// ---------- ログ（sec M-6） ----------
test('ログ（M-6）: 中身・コメントに注入文字列があっても、成功・失敗のログと details に入力の文字列が無い', async () => {
  const d = validDoc();
  d.after.nodes[1].data.reason = `<img src=x onerror=alert(1)>${CANARY}`;
  d.after.nodes[1].data.label = 'CANARY';
  await draft(d, { text: `${CANARY} コメント` });
  const errors = [];
  await submit('devA', { expectRevision: 3 }).catch((e) => errors.push(e));
  await submit('devA', { [CANARY]: 1 }).catch((e) => errors.push(e));
  const bad = await get(INTERNAL);
  bad.after.nodes[2].data.label = `${CANARY}${'x'.repeat(30)}`;
  await db.doc(INTERNAL).set(bad);
  await submit('devA').catch((e) => errors.push(e));
  await db.doc(INTERNAL).set({ ...bad, after: d.after });
  await submit('devA');
  await submit('devA');
  assert.equal(errors.length, 3);
  const dump = JSON.stringify({ logs, errors: errors.map((e) => ({ code: e.code, message: e.message, details: e.details })) });
  assert.doesNotMatch(dump, new RegExp(CANARY));
  assert.doesNotMatch(dump, /onerror|名前devA|@x\.example/);
  assert.ok(logs.some(([l, m]) => l === 'warn' && m === 'sitemap.submit.duplicate'));
});
