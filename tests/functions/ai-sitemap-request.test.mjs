// requestSitemapDraft の本体 handleRequestSitemap（functions/src/ai/sitemapRequest.ts。LIVE_SITEMAP_AI.md §4・§7・DATA §3.2・§7・§8・IMPL_PLAN §4 U-F2）。
// npm run test:functions（emulators:exec）からだけ動く。Admin SDK（Firestore エミュレータ）で直接呼ぶ。enqueue は Stub（Cloud Tasks・Anthropic に触らない）。
// 対応: S-12（入力）・S-3（主体・archived・要件 approved）・S-14（上限の名前空間）・S-19（ログ）・AC-23（編集の破棄の確認）・AC-24（off／許可リスト外）
import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { assertDemoProject, emulatorHostFromEnv } from '../rules/guard.mjs';

const PROJECT = assertDemoProject(process.env.GCLOUD_PROJECT);
const fsHost = emulatorHostFromEnv('FIRESTORE_EMULATOR_HOST');
const freq = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp, getApps } = freq('firebase-admin/app');
const { getFirestore, Timestamp } = freq('firebase-admin/firestore');
const { handleRequestSitemap, parseSitemapRequestInput } = freq('./lib/ai/sitemapRequest.js');
const { AI_LEASE, AI_QUOTA_SITEMAP } = freq('./lib/ai/limits.js');

if (getApps().length === 0) initializeApp({ projectId: PROJECT });
const db = getFirestore();
const T = Date.parse('2026-11-28T03:00:00Z');
const DAY = '2026-11-28';
const CANARY = 'CANARY-SMAP-REQ-77aa';
const RID = '0b7c2a4e-1f3d-4c5b-9a8e-6d7f8091a2b3';
const RID2 = '1c8d3b5f-2a4e-4d6c-8b9f-7e8091a2b3c4';
const AI = 'projects/p1/aiDrafts/sitemap';
const INTERNAL = 'projects/p1/sitemap/internal';
const USAGE = 'aiUsage/202611';
const auth = (uid, o = {}) => ({ uid, token: { email: o.email ?? `${uid}@x.example`, email_verified: o.verified ?? true } });

let logs;
let clock;
let enqueued;
let enqueueImpl;
const logger = { info: (m, f) => logs.push(['info', m, f]), warn: (m, f) => logs.push(['warn', m, f]), error: (m, f) => logs.push(['error', m, f]) };
const ON = { mode: 'on', allowlist: [] };
const deps = (o = {}) => ({
  db, now: () => clock, log: logger, flags: () => ON,
  enqueue: async (t) => { enqueued.push(t); if (enqueueImpl) await enqueueImpl(t); },
  ...o,
});
const call = (uid, data = {}, o = {}) => handleRequestSitemap({ auth: uid ? auth(uid, o.auth) : null, data: { projectId: 'p1', requestId: RID, ...data } }, deps(o.deps));
const get = async (path) => (await db.doc(path).get()).data();

const rejects = (code, details) => (e) => {
  assert.equal(e.code, code, `code ${e.code} ${e.message} (${JSON.stringify(e.details)})`);
  if (details) for (const [k, v] of Object.entries(details)) assert.deepEqual(e.details?.[k], v, `details.${k}`);
  return true;
};
const reason = (r) => rejects('failed-precondition', { reason: r });

async function seed() {
  const acct = (uid, role, o = {}) => db.doc(`accounts/${uid}`).set({ schemaVersion: 1, status: o.status ?? 'active', email: `${uid}@x.example`, role, name: `名前${uid}`, ...(o.projectId ? { projectId: o.projectId } : {}) });
  await Promise.all([acct('adm', 'admin'), acct('devA', 'developer'), acct('devB', 'developer'), acct('cli', 'client', { projectId: 'p1' })]);
  await db.doc('projects/p1').set({
    name: `案件 ${CANARY}`, memberUids: ['devA'], archived: false,
    requirements: { status: 'approved', revision: 2, approvalId: 'requirements-r2-approve' },
    schedule: { status: 'approved', revision: 1, approvedRevision: 1 },
  });
  await db.doc('projects/p1/approvals/requirements-r2-approve').set({
    schemaVersion: 1, kind: 'requirements', action: 'approve', revision: 2, side: 'client',
    answers: { 'q-purpose': CANARY }, proposal: { version: 2, summary: CANARY },
  });
}

beforeEach(async () => {
  const r = await fetch(`http://${fsHost.host}:${fsHost.port}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  assert.equal(r.status, 200);
  logs = []; clock = T; enqueued = []; enqueueImpl = null;
  await seed();
});

// ---------- 入力（S-12・sec L-1） ----------
test('入力: 許可した 5 キーだけ・requestId は UUID v4（小文字に揃える）・真偽値は boolean だけ', () => {
  assert.deepEqual(parseSitemapRequestInput({ projectId: 'p1', requestId: RID.toUpperCase() }), { projectId: 'p1', requestId: RID, regenerate: false, discardEdits: false, confirmDiscard: false });
  assert.deepEqual(parseSitemapRequestInput({ projectId: 'p1', requestId: RID, regenerate: true, discardEdits: true, confirmDiscard: true }).confirmDiscard, true);
  const bad = [
    [null, 'input'], [[], 'input'], [{ requestId: RID }, 'input'], [{ projectId: 'p1' }, 'input'],
    [{ projectId: 'p1', requestId: RID, text: CANARY }, 'input'],
    [{ projectId: 'p1', requestId: RID, proposal: {} }, 'input'],
    [{ projectId: 'p/1', requestId: RID }, 'projectId'],
    [{ projectId: 'p1', requestId: 'not-a-uuid' }, 'requestId'],
    [{ projectId: 'p1', requestId: '0b7c2a4e-1f3d-1c5b-9a8e-6d7f8091a2b3' }, 'requestId'],
    [{ projectId: 'p1', requestId: RID, regenerate: 'true' }, 'regenerate'],
    [{ projectId: 'p1', requestId: RID, discardEdits: 1 }, 'discardEdits'],
    [{ projectId: 'p1', requestId: RID, confirmDiscard: null }, 'confirmDiscard'],
  ];
  for (const [d, field] of bad) {
    assert.throws(() => parseSitemapRequestInput(d), (e) => (assert.equal(e.code, 'invalid-argument'), assert.equal(e.details.field, field), true), JSON.stringify(d));
  }
  // details に入力の値を入れない
  assert.throws(() => parseSitemapRequestInput({ projectId: 'p1', requestId: RID, [CANARY]: 1 }), (e) => !JSON.stringify(e.details).includes(CANARY));
});

// ---------- 成功（queued） ----------
test('成功: 担当の開発者 → queued・job（running・lease・照合用の版）・上限（sitemap 枠・共用 count）・enqueue 1 回', async () => {
  assert.deepEqual(await call('devA'), { state: 'queued', requestId: RID });
  assert.deepEqual(enqueued, [{ projectId: 'p1', requestId: RID }]);
  const ai = await get(AI);
  assert.equal(ai.schemaVersion, 1);
  assert.equal(ai.state, 'failed', '下書きはまだ無い（ジョブ状態と分ける）');
  const j = ai.job;
  assert.deepEqual(Object.keys(j).sort(), ['approvalId', 'baseEditSeq', 'by', 'discardEdits', 'leaseUntil', 'quotaDay', 'regenerate', 'reqRevision', 'requestId', 'role', 'startedAt', 'state'].sort());
  assert.equal(j.state, 'running');
  assert.equal(j.requestId, RID);
  assert.equal(j.by, 'devA');
  assert.equal(j.role, 'developer');
  assert.equal(j.leaseUntil.toMillis(), T + AI_LEASE.requestSeconds * 1000);
  assert.equal(j.quotaDay, DAY);
  assert.equal(j.regenerate, false);
  assert.equal(j.discardEdits, false);
  assert.equal(j.baseEditSeq, null);
  assert.equal(j.reqRevision, 2);
  assert.equal(j.approvalId, 'requirements-r2-approve');
  assert.deepEqual(ai.quota, { day: DAY, dayCount: 1, month: '2026-11', monthCount: 1 });
  const u = await get(USAGE);
  assert.deepEqual(u.byUid, { [`sitemap:${DAY}:devA`]: 1 });
  assert.equal(u.count, 1);
  assert.equal(await get(INTERNAL), undefined, 'callable は internal を書かない');
  assert.equal((await get('projects/p1')).sitemap, undefined, 'callable は案件の要約を書かない');
  assert.deepEqual(logs.map(([l, m, f]) => [l, m, f.status]), [['info', 'ai.sitemap.request', 'enqueued']]);
});

test('成功: admin は担当外でも可。draft の要約があっても可（再生成）', async () => {
  await db.doc('projects/p1').update({ sitemap: { status: 'draft', revision: 0 } });
  assert.equal((await call('adm', { regenerate: true })).state, 'queued');
  assert.equal((await get(AI)).job.regenerate, true);
});

// ---------- 冪等（同じ requestId） ----------
test('冪等: 同じ requestId は実行中なら running・終わっていれば reused（積み直さない・上限に数えない）', async () => {
  await call('devA');
  assert.deepEqual(await call('devA'), { state: 'running', requestId: RID });
  // worker が終えた（job idle・下書き ready）
  await db.doc(AI).update({ 'job.state': 'idle', state: 'ready' });
  assert.deepEqual(await call('devA'), { state: 'reused', requestId: RID });
  // lease 切れの running も積み直さない
  await db.doc(AI).update({ 'job.state': 'running' });
  clock = T + (AI_LEASE.requestSeconds + 1) * 1000;
  assert.deepEqual(await call('devA'), { state: 'reused', requestId: RID });
  assert.equal(enqueued.length, 1);
  assert.equal((await get(USAGE)).count, 1);
  assert.equal((await get(AI)).quota.dayCount, 1);
  assert.deepEqual(logs.slice(1).map(([, , f]) => f.status), ['idempotent', 'reused', 'reused']);
});

test('同時 2 本（同じ requestId）: 加算 1 回・enqueue 1 回', async () => {
  const rs = await Promise.all([call('devA'), call('devA')]);
  assert.deepEqual(rs.map((r) => r.state).sort(), ['queued', 'running']);
  assert.equal(enqueued.length, 1);
  assert.equal((await get(USAGE)).count, 1);
});

test('別の requestId: 実行中なら job-running（lease 切れなら引き継げる）', async () => {
  await call('devA');
  await assert.rejects(call('devA', { requestId: RID2 }), reason('job-running'));
  clock = T + (AI_LEASE.requestSeconds + 1) * 1000;
  assert.equal((await call('devA', { requestId: RID2 })).state, 'queued');
  assert.equal((await get(AI)).job.requestId, RID2);
});

// ---------- フラグ（AC-24） ----------
test('フラグ: off は最初に ai-disabled（何も読まない・書かない）。internal は admin かつ許可リストの案件だけ', async () => {
  await assert.rejects(call(null, {}, { deps: { flags: () => ({ mode: 'off', allowlist: [] }) } }), reason('ai-disabled'));
  const internal = { flags: () => ({ mode: 'internal', allowlist: ['p1'] }) };
  await assert.rejects(call('devA', {}, { deps: internal }), reason('ai-disabled'));
  await assert.rejects(call('adm', {}, { deps: { flags: () => ({ mode: 'internal', allowlist: ['other'] }) } }), reason('ai-disabled'));
  assert.equal(await get(AI), undefined);
  assert.equal((await call('adm', {}, { deps: internal })).state, 'queued');
});

// ---------- 認可（S-3） ----------
test('認可: 担当外の開発者・お客様・未確認メール・メール不一致 → permission-denied、未ログイン → unauthenticated（何も書かない）', async () => {
  for (const uid of ['devB', 'cli']) await assert.rejects(call(uid), rejects('permission-denied'));
  await assert.rejects(call('devA', {}, { auth: { verified: false } }), rejects('permission-denied'));
  await assert.rejects(call('adm', {}, { auth: { email: 'other@x.example' } }), rejects('permission-denied'));
  await assert.rejects(call(null), rejects('unauthenticated'));
  assert.equal(await get(AI), undefined);
  assert.equal(await get(USAGE), undefined);
  assert.equal(enqueued.length, 0);
});

test('認可: 存在しない案件 → permission-denied。archived → archived', async () => {
  await assert.rejects(call('adm', { projectId: 'nope' }), rejects('permission-denied'));
  await db.doc('projects/p1').update({ archived: true });
  await assert.rejects(call('devA'), reason('archived'));
});

// ---------- 前提 ----------
test('前提: 要件定義書が approved でない・approvalId が無い／形が違う／版が違う・承認記録が無い／違う → req-not-approved', async () => {
  const cases = [
    { 'requirements.status': 'analyzed' },
    { 'requirements.approvalId': null },
    { 'requirements.approvalId': '../../x' },
    { 'requirements.approvalId': 'requirements-r1-approve' },
  ];
  for (const c of cases) {
    await seed();
    await db.doc('projects/p1').update(c);
    await assert.rejects(call('devA'), reason('req-not-approved'), JSON.stringify(c));
  }
  for (const a of [null, { action: 'submit' }, { revision: 1 }, { kind: 'schedule' }]) {
    await seed();
    if (a === null) await db.doc('projects/p1/approvals/requirements-r2-approve').delete();
    else await db.doc('projects/p1/approvals/requirements-r2-approve').update(a);
    await assert.rejects(call('devA'), reason('req-not-approved'), JSON.stringify(a));
  }
  assert.equal(await get(AI), undefined);
  assert.equal(await get(USAGE), undefined);
});

test('前提: サイトマップが requested・approved → state', async () => {
  for (const status of ['requested', 'approved']) {
    await db.doc('projects/p1').update({ sitemap: { status, revision: 1 } });
    await assert.rejects(call('devA'), reason('state'), status);
  }
});

test('前提: スケジュール未承認でも AI 下書きは作れる（スケジュールは依頼（submit）の前提。PLAN §3）', async () => {
  await db.doc('projects/p1').update({ schedule: { status: 'draft', revision: 0 } });
  assert.equal((await call('devA')).state, 'queued');
});

// ---------- 編集の破棄（AC-23） ----------
test('編集あり: discardEdits と confirmDiscard の両方が要る。揃えば baseEditSeq を記録して queued', async () => {
  await db.doc('projects/p1').update({ sitemap: { status: 'draft', revision: 0 } });
  await db.doc(INTERNAL).set({ schemaVersion: 1, editSeq: 4, origin: 'manual' });
  await assert.rejects(call('devA'), reason('edits-exist'));
  await assert.rejects(call('devA', { confirmDiscard: true }), reason('edits-exist'));
  await assert.rejects(call('devA', { discardEdits: true }), reason('confirm-discard-required'));
  await assert.rejects(call('adm', { discardEdits: true, confirmDiscard: false }), reason('confirm-discard-required'));
  assert.equal(await get(AI), undefined);
  assert.equal((await call('devA', { discardEdits: true, confirmDiscard: true })).state, 'queued');
  const j = (await get(AI)).job;
  assert.equal(j.discardEdits, true);
  assert.equal(j.baseEditSeq, 4);
  assert.equal((await get(INTERNAL)).editSeq, 4, '置き換えは worker の最後の TX だけ');
});

test('編集なし: discardEdits を付けても job.discardEdits は false・baseEditSeq は null', async () => {
  await call('devA', { discardEdits: true, confirmDiscard: true });
  const j = (await get(AI)).job;
  assert.equal(j.discardEdits, false);
  assert.equal(j.baseEditSeq, null);
});

// ---------- 上限（S-14・DATA §8） ----------
test('上限: 案件の日 5 回でサイトマップは止まるが、要件定義書の枠・鍵は別（要件の鍵が残っていても数えない）', async () => {
  await db.doc(USAGE).set({ count: 3, costMicroUsd: 10, byDay: { [DAY]: 3 }, byUid: { [`${DAY}:devA`]: 10 } });
  await db.doc(AI).set({ schemaVersion: 1, state: 'failed', quota: { day: DAY, dayCount: AI_QUOTA_SITEMAP.projectPerDay - 1, month: '2026-11', monthCount: 4 }, job: { state: 'idle', requestId: RID2 } });
  assert.equal((await call('devA')).state, 'queued');
  const u = await get(USAGE);
  assert.equal(u.byUid[`${DAY}:devA`], 10, '要件定義書の鍵はそのまま');
  assert.equal(u.byUid[`sitemap:${DAY}:devA`], 1);
  assert.equal(u.count, 4);
  assert.equal(u.costMicroUsd, 10);
  await db.doc(AI).update({ 'job.state': 'idle' });
  await assert.rejects(call('devA', { requestId: '2d9e4c6a-3b5f-4e7d-9c0a-8f9102b3c4d5' }), (e) => (assert.equal(e.code, 'resource-exhausted'), assert.equal(e.message, 'quota-project-day'), true));
  assert.equal(enqueued.length, 1);
  assert.equal(logs.at(-1)[0], 'warn');
  assert.equal(logs.at(-1)[2].reason, 'quota-project-day');
});

test('上限: 全体 200/月は要件定義書と共用', async () => {
  await db.doc(USAGE).set({ count: 200, costMicroUsd: 0, byDay: {}, byUid: {} });
  await assert.rejects(call('devA'), (e) => (assert.equal(e.code, 'resource-exhausted'), assert.equal(e.message, 'quota-global-month'), true));
  assert.equal(await get(AI), undefined);
});

// ---------- enqueue の失敗 ----------
test('enqueue 失敗: 返金（sitemap の鍵・案件の枠を戻し job は idle）して unavailable。同じ requestId は reused', async () => {
  enqueueImpl = async () => { throw Object.assign(new Error(`boom ${CANARY}`), { code: 'unavailable' }); };
  await assert.rejects(call('devA'), rejects('unavailable'));
  const ai = await get(AI);
  assert.equal(ai.job.state, 'idle');
  assert.equal(ai.quota.dayCount, 0);
  const u = await get(USAGE);
  assert.equal(u.count, 0);
  assert.equal(u.byUid[`sitemap:${DAY}:devA`], 0);
  assert.equal(logs.at(-1)[2].status, 'enqueue_failed');
  enqueueImpl = null;
  assert.equal((await call('devA')).state, 'reused');
  assert.equal((await call('devA', { requestId: RID2 })).state, 'queued');
});

test('enqueue の task-already-exists は warn で残して queued（握り潰さない）', async () => {
  enqueueImpl = async () => { throw Object.assign(new Error('dup'), { code: 'functions/task-already-exists' }); };
  assert.equal((await call('devA')).state, 'queued');
  assert.equal((await get(AI)).job.state, 'running');
  assert.deepEqual(logs.at(-1).slice(0, 1), ['warn']);
  assert.equal(logs.at(-1)[2].status, 'enqueue_duplicate');
});

// ---------- ログ（S-19） ----------
test('ログ: 要件・回答・案件名・例外の message（canary）を出さない。event と種別・ID だけ', async () => {
  await call('devA');
  await call('devA');
  await assert.rejects(call('devA', { requestId: RID2 }), reason('job-running'));
  enqueueImpl = async () => { throw new Error(CANARY); };
  clock = T + (AI_LEASE.requestSeconds + 1) * 1000;
  await assert.rejects(call('devA', { requestId: '3e0f5d7b-4c6a-4f8e-8d1b-9a0213c4d5e6' }), rejects('unavailable'));
  assert.ok(logs.length >= 4);
  assert.doesNotMatch(JSON.stringify(logs), new RegExp(CANARY));
  for (const [, m, f] of logs) {
    assert.equal(m, 'ai.sitemap.request');
    assert.equal(f.event, 'ai.sitemap.request');
    assert.equal(f.projectId, 'p1');
  }
  assert.equal(logs.find(([, , f]) => f.status === 'rejected')[2].reason, 'job-running');
});

test('文書: callable が書くのは aiDrafts/sitemap と aiUsage だけ（Timestamp で lease）', async () => {
  await call('devA');
  assert.ok((await get(AI)).job.leaseUntil instanceof Timestamp);
  const names = (await db.collection('projects/p1/aiDrafts').listDocuments()).map((d) => d.id);
  assert.deepEqual(names, ['sitemap']);
});
