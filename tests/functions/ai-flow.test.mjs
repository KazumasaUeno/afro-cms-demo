// AI 下書きの callable・worker・編集の保存（functions/src/ai/。計画 §4 U2）。npm run test:functions（emulators:exec）からだけ動く。
// 本体（handleRequestDraft / handleTask / handleSaveEdits）を Admin SDK（Firestore エミュレータ）と注入した Stub で直接呼ぶ。
// 配線（index.ts の export と既定 off）だけは Functions エミュレータへ HTTP で確かめる。Anthropic は呼ばない（Stub）
import { before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { assertDemoProject, emulatorHostFromEnv } from '../rules/guard.mjs';
import { EDITED_CASES } from '../rules/aiEditedCases.mjs';
import { GENERATED, EDITED, proposalV2 } from '../rules/aiFixtures.mjs';

const PROJECT = assertDemoProject(process.env.GCLOUD_PROJECT);
const fsHost = emulatorHostFromEnv('FIRESTORE_EMULATOR_HOST');
const freq = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp } = freq('firebase-admin/app');
const { getFirestore, Timestamp } = freq('firebase-admin/firestore');
const lib = (p) => freq(`./lib/ai/${p}.js`);
const { handleRequestDraft } = lib('request');
const { handleTask } = lib('task');
const { handleSaveEdits } = lib('edits');
const { parseMode, AI_MODE_DEFAULT } = lib('flags');
const { configHash } = lib('shared/answersHash');
const { createGenerator, CURRENT_CONFIG_KEY } = lib('generatePort');
const { DEFAULT_AI_CONFIG } = lib('generateDraft');
const { AI_QUOTA } = lib('limits');
const { assertNoRealSecrets } = await import('../../scripts/test-functions.mjs');

initializeApp({ projectId: PROJECT });
const db = getFirestore();
const T = Date.parse('2026-11-20T03:00:00Z');
const CANARY_ANS = 'CANARY-ANSWER-7f3a';
const CANARY_SITE = 'CANARY-SITE-91bc';
const CANARY_KEY = 'sk-ant-canary-0000';
const CONFIG = { model: 'stub-model', promptVersion: 'PRM-REQ-001@1.0.0', effort: 'low' };
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const auth = (uid, verified = true) => ({ uid, token: { email: `${uid}@x.example`, email_verified: verified } });
const AI = 'projects/p1/aiDrafts/requirements';

let logs;
let clock;
let enqueued;
let stubCalls;
const logger = { info: (m, f) => logs.push(['info', m, f]), warn: (m, f) => logs.push(['warn', m, f]), error: (m, f) => logs.push(['error', m, f]) };
const flagsOn = () => ({ mode: 'on', allowlist: [] });
const rdeps = (o = {}) => ({ db, now: () => clock, flags: flagsOn, configHash: () => configHash(CONFIG), enqueue: async (t) => { enqueued.push(t); }, log: logger, ...o });
// U3 の契約（result.proposal がサーバー欄の正。CR-M2）: Stub も完全な ProposalV2 を返す
const STUB_PROPOSAL = { ...proposalV2(GENERATED), hostname: 'stub.example', issue: '除去済みの課題', competitors: ['rival.example'], siteCheck: null };
const okResult = { ok: true, proposal: STUB_PROPOSAL, flags: { unsupportedNumbers: [] }, usage: { input: 10, output: 20, cacheRead: 0, costMicroUsd: 7 }, anthropicRequestId: 'req_abc' };
const tdeps = (result = okResult, o = {}) => ({
  db, now: () => clock, flags: flagsOn, apiKey: () => CANARY_KEY, log: logger,
  createGenerator: () => ({ config: CONFIG, generateDraft: async (input) => { stubCalls.push(input); return typeof result === 'function' ? result(input) : result; } }),
  siteCheck: async () => ({ siteCheck: { status: 'ok', fetchedAt: 'x', passed: 1, total: 1, items: [] }, siteFacts: { https: true }, siteText: `body ${CANARY_SITE}`, code: null }),
  ...o,
});
const call = (uid, data, o) => handleRequestDraft({ auth: uid ? auth(uid) : null, data: { projectId: 'p1', requestId: uuid(1), ...data } }, rdeps(o));
const ai = async () => (await db.doc(AI).get()).data();
const usage = async (id = '202611') => (await db.doc(`aiUsage/${id}`).get()).data();
const code = (msg) => (e) => (assert.equal(e.message, msg), true);

async function seed() {
  const acct = (uid, role, status = 'active') => db.doc(`accounts/${uid}`).set({ schemaVersion: 1, status, email: `${uid}@x.example`, role, name: 'n' });
  await Promise.all([acct('adm', 'admin'), acct('devA', 'developer'), acct('devB', 'developer'), acct('cli', 'client'), acct('off', 'developer', 'disabled')]);
  await db.doc('projects/p1').set({ memberUids: ['devA', 'off'], archived: false, requirements: { status: 'draft', revision: 0 } });
  await db.doc('projects/p1/requirements/current').set({ answers: {
    'q-url': 'https://www.shop.example/', 'q-purpose': ['問い合わせを増やしたい'], 'q-issue': `スマホで見づらい ${CANARY_ANS} 03-1234-5678`,
    'q-improve': ['スマホ表示'], 'q-infra': '管理会社 秘密', 'q-competitor': ['https://rival.example/'],
  } });
}

before(async () => { assert.ok(existsSync(new URL('../../functions/lib/ai/index.js', import.meta.url))); });
beforeEach(async () => {
  const r = await fetch(`http://${fsHost.host}:${fsHost.port}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  assert.equal(r.status, 200);
  logs = []; enqueued = []; stubCalls = []; clock = T;
  await seed();
});

// ---------- テストの守り（M1・T-12） ----------
test('守り: ANTHROPIC_API_KEY と functions/.secret.local が無い（あれば runner が止める）', () => {
  assert.equal(process.env.ANTHROPIC_API_KEY, undefined);
  assert.equal(existsSync(new URL('../../functions/.secret.local', import.meta.url)), false);
  assert.throws(() => assertNoRealSecrets({ ANTHROPIC_API_KEY: 'x' }), /ANTHROPIC_API_KEY/);
});

// ---------- フラグ（H3。7 件） ----------
test('フラグ1: 未設定・空・未知の値は off', () => {
  for (const v of [undefined, '', 'ON!', 'true', 1]) assert.equal(parseMode(v), 'off');
  assert.equal(parseMode(' Internal '), 'internal');
});
// 本番の値は off か internal（2026-11-25 ユーザー GO で社内試験の internal へ。on は法務の記録が要る＝deploy の検査が止める）
test('フラグ2: コードの既定が off（ファイルが無くても off）・本番の値は off か internal（on ではない）', () => {
  assert.equal(AI_MODE_DEFAULT, 'off');
  assert.match(readFileSync(new URL('../../functions/src/ai/flags.ts', import.meta.url), 'utf8'), /defineString\('AI_REQUIREMENTS_MODE', \{ default: AI_MODE_DEFAULT \}\)/);
  const env = readFileSync(new URL('../../functions/.env.afro-cms-4a6ff', import.meta.url), 'utf8');
  assert.match(env, /^AI_REQUIREMENTS_MODE=(off|internal)$/m);
  assert.doesNotMatch(env, /^AI_REQUIREMENTS_MODE=\s*on\s*$/im);
});
const internal = (allowlist) => () => ({ mode: 'internal', allowlist });
test('フラグ3: internal で admin 以外は拒否', () => assert.rejects(call('devA', {}, { flags: internal(['p1']) }), code('feature-disabled')));
test('フラグ4: internal で admin でも allowlist 外は拒否', () => assert.rejects(call('adm', {}, { flags: internal(['p9']) }), code('feature-disabled')));
test('フラグ5: allowlist が空なら internal でも全拒否（admin も）', async () => {
  await assert.rejects(call('adm', {}, { flags: internal([]) }), code('feature-disabled'));
  assert.deepEqual(await call('adm', {}, { flags: internal(['p1']) }), { state: 'running', requestId: uuid(1) });
});
test('フラグ6: enqueue 後・worker 開始前に off → Stub 0 回・上限の返金・lease 解除', async () => {
  await call('devA', {});
  assert.equal((await usage()).count, 1);
  assert.equal(await handleTask(enqueued[0], tdeps(okResult, { flags: () => ({ mode: 'off', allowlist: [] }) })), 'refunded');
  assert.equal(stubCalls.length, 0);
  const d = await ai();
  assert.equal(d.job.state, 'idle');
  assert.equal(d.quota.dayCount, 0);
  assert.equal((await usage()).count, 0);
  assert.equal(d.lastError.code, 'ai-feature-disabled');
});
test('フラグ7: off・allowlist 外で文書も上限も変わらない', async () => {
  await assert.rejects(call('devA', {}, { flags: () => ({ mode: 'off', allowlist: [] }) }), code('feature-disabled'));
  await assert.rejects(call('adm', {}, { flags: internal(['p9']) }), code('feature-disabled'));
  assert.equal(await ai(), undefined);
  assert.equal(await usage(), undefined);
  assert.equal(enqueued.length, 0);
});

// ---------- 認可・状態 ----------
for (const [name, uid] of [['お客様', 'cli'], ['未アサインの開発者', 'devB'], ['無効なアカウント', 'off']]) {
  test(`認可: ${name}は拒否・何も書かない`, async () => {
    await assert.rejects(call(uid, {}), code('not allowed'));
    assert.equal(await ai(), undefined);
  });
}
test('認可: 未確認メールは拒否', () => assert.rejects(handleRequestDraft({ auth: auth('devA', false), data: { projectId: 'p1', requestId: uuid(1) } }, rdeps()), code('not allowed')));
test('認可: 未ログインは unauthenticated', () => assert.rejects(call(null, {}), (e) => e.code === 'unauthenticated'));
test('状態: archived は拒否', async () => {
  await db.doc('projects/p1').update({ archived: true });
  await assert.rejects(call('devA', {}), code('project-archived'));
});
test('認可: admin（アサインなし）とアサインされた開発者は可', async () => {
  assert.equal((await call('adm', {})).state, 'running');
  assert.equal(enqueued.length, 1);
});
for (const st of ['analyzed', 'approved']) {
  test(`状態: ${st} は failed-precondition`, async () => {
    await db.doc('projects/p1').update({ 'requirements.status': st });
    await assert.rejects(call('devA', {}), code('not-draft'));
  });
}
test('状態: 必須回答が欠けると拒否', async () => {
  await db.doc('projects/p1/requirements/current').update({ 'answers.q-issue': '  ' });
  await assert.rejects(call('devA', {}), code('answers-missing'));
  assert.equal(await ai(), undefined);
});
async function readyDraft(withEdits = true) {
  await call('devA', {});
  await handleTask(enqueued.at(-1), tdeps());
  if (withEdits) await handleSaveEdits({ auth: auth('devA'), data: { projectId: 'p1', edited: { ...EDITED, summary: '直した' } } }, { db, now: () => clock, flags: flagsOn, log: logger });
}
test('状態: edited ありで discardEdits なし → edits-exist', async () => {
  await readyDraft();
  await assert.rejects(call('devA', { requestId: uuid(2), regenerate: true }), code('edits-exist'));
});
test('状態: admin の discardEdits は confirmDiscard 必須・ありなら discardLog に残る', async () => {
  await readyDraft();
  await assert.rejects(call('adm', { requestId: uuid(2), regenerate: true, discardEdits: true }), code('confirm-discard-required'));
  await call('adm', { requestId: uuid(3), regenerate: true, discardEdits: true, confirmDiscard: true });
  assert.equal(await handleTask(enqueued.at(-1), tdeps()), 'ready');
  const d = await ai();
  assert.equal(d.edited, undefined);
  assert.equal(d.discardLog.length, 1);
  assert.equal(d.discardLog[0].by, 'adm');
});

// ---------- Idempotency・lease・上限 ----------
test('同じ requestId 2 回: enqueue 1 回・加算 1 回', async () => {
  await call('devA', {});
  assert.deepEqual(await call('devA', {}), { state: 'running', requestId: uuid(1) });
  assert.equal(enqueued.length, 1);
  assert.equal((await usage()).count, 1);
});
test('成功: generated・ハッシュ・usage を書き、送る回答に q-infra・連絡先が無い', async () => {
  await call('devA', {});
  assert.equal(await handleTask(enqueued[0], tdeps()), 'ready');
  const d = await ai();
  assert.equal(d.state, 'ready');
  assert.equal(d.generated.version, 2);
  // サーバー欄は result.proposal のまま（worker は回答から組み立て直さない）
  const { flags: _f, ...stored } = d.generated;
  assert.deepEqual(stored, STUB_PROPOSAL);
  assert.deepEqual(d.generated.flags, { unsupportedNumbers: [] });
  assert.equal(d.configHash, await configHash(CONFIG));
  assert.match(d.answersHash, /^[0-9a-f]{64}$/);
  assert.equal(d.job.state, 'idle');
  assert.equal((await usage()).costMicroUsd, 7);
  const sent = JSON.stringify(stubCalls[0].answers);
  assert.doesNotMatch(sent, /q-infra|秘密|1234-5678|q-competitor/);
  assert.match(sent, /\[電話\]/);
});
test('同じハッシュ 2 回目は reused（加算なし）・regenerate は加算あり', async () => {
  await readyDraft(false);
  assert.deepEqual(await call('devA', { requestId: uuid(2) }), { state: 'ready', reused: true });
  assert.equal((await usage()).count, 1);
  await call('devA', { requestId: uuid(3), regenerate: true });
  assert.equal((await usage()).count, 2);
});
test('同時 2 本: 片方は already-running・Stub 1 回', async () => {
  const rs = await Promise.allSettled([call('devA', { requestId: uuid(1) }), call('devA', { requestId: uuid(2) })]);
  assert.equal(rs.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(rs.find((r) => r.status === 'rejected').reason.message, 'already-running');
  for (const t of enqueued) await handleTask(t, tdeps());
  assert.equal(stubCalls.length, 1);
});
test('fencing: lease 切れで引き継がれた後に古いタスクが終わっても結果を捨てる', async () => {
  await call('devA', { requestId: uuid(1) });
  const slow = async () => {
    clock = T + 700_000; // 古い lease（630 秒）が切れた後に別の押下
    await call('devA', { requestId: uuid(2) });
    return okResult;
  };
  assert.equal(await handleTask(enqueued[0], tdeps(slow)), 'fenced');
  const d = await ai();
  assert.equal(d.job.requestId, uuid(2));
  assert.equal(d.generated, undefined);
});
test('lease 切れの後の押下は引き継げる（期限内は already-running）', async () => {
  await call('devA', { requestId: uuid(1) });
  await assert.rejects(call('devA', { requestId: uuid(2) }), code('already-running'));
  clock = T + 631_000;
  assert.equal((await call('devA', { requestId: uuid(3) })).state, 'running');
});
test('同じ requestId が lease 切れ（T+631s）で届く: failed を返し、加算・lease・enqueue をし直さない（CR-M1）', async () => {
  await call('devA', { requestId: uuid(1) });
  const before = await ai();
  clock = T + 631_000;
  assert.deepEqual(await call('devA', { requestId: uuid(1) }), { state: 'failed', requestId: uuid(1) });
  const d = await ai();
  assert.equal(d.job.state, 'running');
  assert.equal(d.job.leaseUntil.toMillis(), before.job.leaseUntil.toMillis());
  assert.equal(d.quota.dayCount, 1);
  assert.equal((await usage()).count, 1);
  assert.equal(enqueued.length, 1);
  // 新しい requestId なら引き継げる
  assert.equal((await call('devA', { requestId: uuid(2) })).state, 'running');
  assert.equal((await usage()).count, 2);
});
test('fencing で捨てた結果も費用は自分の予約の日へ足す', async () => {
  await call('devA', { requestId: uuid(1) });
  const slow = async () => {
    clock = T + 700_000;
    await call('devA', { requestId: uuid(2) });
    return okResult;
  };
  assert.equal(await handleTask(enqueued[0], tdeps(slow)), 'fenced');
  assert.equal((await usage()).costMicroUsd, 7);
});
test('AI を呼んだ後の想定外の失敗（外側の catch）も費用を足し、回数は戻さない', async () => {
  await call('devA', {});
  const broken = { ok: true, proposal: null, usage: { input: 1, output: 1, cacheRead: 0, costMicroUsd: 5 }, durationMs: 1 };
  assert.equal(await handleTask(enqueued[0], tdeps(broken)), 'failed');
  const u = await usage();
  assert.deepEqual([u.count, u.costMicroUsd], [1, 5]);
  const d = await ai();
  assert.deepEqual([d.lastError.code, d.job.state], ['ai-internal', 'idle']);
});
test('generateDraft が例外を投げたら generator_threw をログに残す（失敗・回数は戻さない）', async () => {
  await call('devA', {});
  assert.equal(await handleTask(enqueued[0], tdeps(async () => { throw new Error('boom'); })), 'failed');
  const l = logs.find((x) => x[2].status === 'generator_threw');
  assert.equal(l?.[0], 'error');
  assert.equal((await usage()).count, 1);
});
test('送る前の設定の誤り（未知のモデル）は config: Anthropic 0 回・返金', async () => {
  await call('devA', {});
  let created = 0;
  const deps = tdeps(okResult, {
    createGenerator: (key) => createGenerator(key, { config: { ...DEFAULT_AI_CONFIG, model: 'no-such-model' }, makeClient: () => ({ create: async () => { created++; throw new Error('x'); } }) }),
  });
  assert.equal(await handleTask(enqueued[0], deps), 'refunded');
  assert.equal(created, 0);
  assert.equal((await usage()).count, 0);
  const d = await ai();
  assert.deepEqual([d.lastError.code, d.job.state, d.quota.dayCount], ['ai-config', 'idle', 0]);
});
test('enqueue の失敗: 返金して unavailable', async () => {
  await assert.rejects(call('devA', {}, { enqueue: async () => { throw Object.assign(new Error(CANARY_ANS), { code: 'x' }); } }), (e) => e.code === 'unavailable');
  const d = await ai();
  assert.equal(d.job.state, 'idle');
  assert.equal(d.quota.dayCount, 0);
  assert.equal((await usage()).count, 0);
});
test('AI を呼ぶ前の失敗（Secret なし）: 返金・Stub 0 回', async () => {
  await call('devA', {});
  assert.equal(await handleTask(enqueued[0], tdeps(okResult, { apiKey: () => '' })), 'refunded');
  assert.equal(stubCalls.length, 0);
  assert.equal((await usage()).count, 0);
  assert.equal((await ai()).lastError.code, 'ai-config-missing');
});
test('JST の日付境界: UTC 15:00 は JST の翌日（月の文書も変わる）', async () => {
  clock = Date.parse('2026-11-30T15:00:00Z');
  await call('devA', {});
  assert.equal((await ai()).quota.day, '2026-12-01');
  assert.equal((await usage('202612')).byDay['2026-12-01'], 1);
  assert.equal(await usage('202611'), undefined);
});
const exhaust = [
  ['案件の日', async () => db.doc(AI).set({ schemaVersion: 1, state: 'failed', job: { state: 'idle' }, quota: { day: '2026-11-20', dayCount: AI_QUOTA.projectPerDay, month: '2026-11', monthCount: 5 } }), 'quota-project-day'],
  ['案件の月', async () => db.doc(AI).set({ schemaVersion: 1, state: 'failed', job: { state: 'idle' }, quota: { day: '2026-11-19', dayCount: 1, month: '2026-11', monthCount: AI_QUOTA.projectPerMonth } }), 'quota-project-month'],
  ['利用者の日', async () => db.doc('aiUsage/202611').set({ count: 0, costMicroUsd: 0, byDay: {}, byUid: { '2026-11-20:devA': AI_QUOTA.userPerDay } }), 'quota-user-day'],
  ['全体の月', async () => db.doc('aiUsage/202611').set({ count: AI_QUOTA.globalPerMonth, costMicroUsd: 0, byDay: {}, byUid: {} }), 'quota-global-month'],
];
for (const [name, prep, msg] of exhaust) {
  test(`上限: ${name}の超過で resource-exhausted・enqueue 0 回`, async () => {
    await prep();
    await assert.rejects(call('devA', {}), (e) => e.code === 'resource-exhausted' && e.message === msg);
    assert.equal(enqueued.length, 0);
  });
}

// ---------- 失敗時の保持 ----------
test('保持: 下書きありで再生成が失敗 → state ready のまま・lastError だけ', async () => {
  await readyDraft(false);
  await call('devA', { requestId: uuid(2), regenerate: true });
  assert.equal(await handleTask(enqueued.at(-1), tdeps({ ok: false, code: 'rate_limited', httpStatus: 429, anthropicRequestId: 'req_1' })), 'failed');
  const d = await ai();
  assert.equal(d.state, 'ready');
  assert.deepEqual([d.lastError.code, d.lastError.httpStatus], ['ai-rate_limited', 429]);
  assert.equal((await usage()).count, 2); // 呼んだ後は戻さない
});
test('保持: discardEdits で生成が失敗 → edited が残る', async () => {
  await readyDraft();
  await call('devA', { requestId: uuid(2), regenerate: true, discardEdits: true });
  await handleTask(enqueued.at(-1), tdeps({ ok: false, code: 'refusal' }));
  assert.equal((await ai()).edited.summary, '直した');
});

// ---------- saveAiDraftEdits（F-a。tests/rules/aiEditedCases.mjs を写す） ----------
const edeps = { db, now: () => T, flags: flagsOn, log: logger };
const save = (uid, edited) => handleSaveEdits({ auth: auth(uid), data: { projectId: 'p1', edited } }, edeps);
async function withGenerated() {
  await db.doc(AI).set({ schemaVersion: 1, state: 'ready', job: { state: 'idle' }, generated: { ...GENERATED, siteCheck: { ...GENERATED.siteCheck, fetchedAt: '2026-11-01T00:00:00Z' } }, quota: { day: 'x', dayCount: 1, month: 'x', monthCount: 1 }, updatedAt: Timestamp.fromMillis(T), updatedBy: 'server' });
}
for (const c of EDITED_CASES) {
  test(`編集: ${c.name} → ${c.expect}`, async () => {
    await withGenerated();
    if (c.expect === 'allow') {
      assert.deepEqual(await save('devA', c.edited), { ok: true });
      assert.deepEqual((await ai()).edited, c.edited);
    } else {
      await assert.rejects(save('devA', c.edited), (e) => e.code === 'invalid-argument');
      assert.equal((await ai()).edited, undefined);
    }
  });
}
test('編集: admin・お客様・未アサインは拒否', async () => {
  await withGenerated();
  for (const uid of ['adm', 'cli', 'devB']) await assert.rejects(save(uid, EDITED), code('not allowed'));
});
test('編集: 要件が draft でない・generated が無いと拒否', async () => {
  await assert.rejects(save('devA', EDITED), code('no-generated'));
  await withGenerated();
  await db.doc('projects/p1').update({ 'requirements.status': 'analyzed' });
  await assert.rejects(save('devA', EDITED), code('not-draft'));
});
test('編集: 生成中（job running）は failed-precondition（Lead DECISION）', async () => {
  await readyDraft(false);
  await call('devA', { requestId: uuid(2), regenerate: true });
  await assert.rejects(save('devA', EDITED), code('generation-running'));
  assert.equal((await ai()).edited, undefined);
});
test('編集: 書くのは edited・editedAt・editedBy・updatedAt・updatedBy だけ（サーバー欄は不変）', async () => {
  await withGenerated();
  const before = await ai();
  await save('devA', EDITED);
  const after = await ai();
  const changed = Object.keys(after).filter((k) => JSON.stringify(after[k]) !== JSON.stringify(before[k])).sort();
  assert.deepEqual(changed, ['edited', 'editedAt', 'editedBy', 'updatedBy']);
});
test('編集: off なら拒否', () => assert.rejects(handleSaveEdits({ auth: auth('devA'), data: { projectId: 'p1', edited: EDITED } }, { ...edeps, flags: () => ({ mode: 'off', allowlist: [] }) }), code('feature-disabled')));

// ---------- ログ（M4。canary） ----------
test('canary: 回答・サイト本文・キーがログ・lastError・HttpsError のどれにも出ない', async () => {
  const errors = [];
  const out = [];
  const w = process.stdout.write.bind(process.stdout);
  process.stdout.write = (c, ...a) => { out.push(String(c)); return w(c, ...a); };
  try {
    const outcomes = [okResult, { ok: false, code: 'schema' }, async () => { throw new Error(`${CANARY_ANS} ${CANARY_KEY}`); }, { ok: true, proposal: { ...EDITED, summary: 1 }, usage: okResult.usage }];
    for (const [i, r] of outcomes.entries()) {
      clock = T + i * 1000;
      await call('devA', { requestId: uuid(10 + i), regenerate: true, discardEdits: true });
      await handleTask(enqueued.at(-1), tdeps(r));
    }
    await call('devA', { requestId: uuid(20) }, { enqueue: async () => { throw new Error(CANARY_KEY); } }).catch((e) => errors.push(e.message));
    await save('devA', { ...EDITED, summary: CANARY_ANS.repeat(100) }).catch((e) => errors.push(e.message));
    await save('devA', { ...EDITED, extra: CANARY_SITE }).catch((e) => errors.push(e.message));
  } finally {
    process.stdout.write = w;
  }
  const hay = JSON.stringify({ logs, errors, out, last: (await ai()).lastError });
  for (const c of [CANARY_ANS, CANARY_SITE, CANARY_KEY]) assert.equal(hay.includes(c), false, c);
  assert.ok(logs.length >= 8);
});

// ---------- 配線: worker → 本物の createGenerator → U3 generateDraft（クライアントだけ Stub。本物のキー・API なし） ----------
const VALID_OUT = {
  summary: 'スマホで見やすくします。',
  points: [{ area: 'スマホ表示', priority: 'high', title: 'スマホ前提', detail: '文字を大きくします。', impact: '問い合わせの増加', evidence: ['q-issue'] }],
  draft: { goal: '問い合わせを増やす', target: '', contents: '', features: '', nonFunctional: '', operation: '', schedule: '', openQuestions: [] },
};
const stubMsg = (over = {}) => ({ id: 'msg_1', type: 'message', role: 'assistant', model: DEFAULT_AI_CONFIG.model, stop_reason: 'end_turn', stop_sequence: null,
  content: [{ type: 'text', text: JSON.stringify(VALID_OUT) }], usage: { input_tokens: 1000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 500 }, ...over });
function wiredDeps(msgOver) {
  const seen = { keys: [], params: [] };
  const deps = tdeps(okResult, {
    createGenerator: (key) => createGenerator(key, {
      makeClient: ({ apiKey }) => { seen.keys.push(apiKey); return { create: async (params) => { seen.params.push(params); return { message: stubMsg(msgOver), requestId: 'req_wired' }; } }; },
    }),
  });
  return { deps, seen };
}
test('配線: worker は本物の createGenerator を通して U3 generateDraft を呼ぶ（Stub クライアント・キーは worker の値だけ）', async () => {
  await call('devA', {}, { configHash: () => configHash(CURRENT_CONFIG_KEY) });
  const { deps, seen } = wiredDeps();
  assert.equal(await handleTask(enqueued[0], deps), 'ready');
  assert.deepEqual(seen.keys, [CANARY_KEY]);
  assert.equal(seen.params.length, 1);
  assert.equal(seen.params[0].model, DEFAULT_AI_CONFIG.model);
  const body = JSON.stringify(seen.params[0].messages);
  assert.doesNotMatch(body, /管理会社|1234-5678|q-infra/);
  assert.match(body, /shop\.example/);
  const d = await ai();
  assert.equal(d.state, 'ready');
  assert.equal(d.generated.summary, VALID_OUT.summary);
  assert.equal(d.generated.origin.model, DEFAULT_AI_CONFIG.model);
  // サーバー欄は U3 の proposal（除去済み・項目の無い siteCheck は null）
  assert.equal(d.generated.hostname, 'shop.example');
  assert.deepEqual(d.generated.competitors, ['rival.example']);
  assert.equal(d.generated.siteCheck, null);
  assert.doesNotMatch(d.generated.issue, /1234-5678/);
  assert.match(d.generated.issue, /スマホで見づらい/);
  assert.equal(d.configHash, await configHash(CURRENT_CONFIG_KEY));
  assert.ok(d.usage.costMicroUsd > 0);
  assert.equal((await usage()).costMicroUsd, d.usage.costMicroUsd);
  const done = logs.find((l) => l[1] === 'ai.task' && l[2].status === 'ready');
  assert.equal(done[2].anthropicRequestId, 'req_wired');
  assert.equal(typeof done[2].aiDurationMs, 'number');
  // 同じ回答・同じ設定なら再利用（クライアントは作られない）
  assert.deepEqual(await call('devA', { requestId: uuid(2) }, { configHash: () => configHash(CURRENT_CONFIG_KEY) }), { state: 'ready', reused: true });
});
test('配線: AI が応答した失敗（refusal）も推定費用を aiUsage に足し、回数は戻さない・lastError に request-id', async () => {
  await call('devA', {});
  const { deps } = wiredDeps({ stop_reason: 'refusal' });
  assert.equal(await handleTask(enqueued[0], deps), 'failed');
  const d = await ai();
  assert.equal(d.lastError.code, 'ai-refusal');
  assert.equal(d.lastError.anthropicRequestId, 'req_wired');
  const u = await usage();
  assert.equal(u.count, 1);
  assert.ok(u.costMicroUsd > 0);
  const done = logs.find((l) => l[1] === 'ai.task' && l[2].status === 'failed');
  assert.equal(done[2].output, 500);
  assert.equal(typeof done[2].aiDurationMs, 'number');
});
test('配線: Stub の ok:false に usage があれば費用だけ足す（schema）', async () => {
  await call('devA', {});
  const r = { ok: false, code: 'schema', usage: { input: 1, output: 2, cacheRead: 0, costMicroUsd: 9 }, durationMs: 4 };
  assert.equal(await handleTask(enqueued[0], tdeps(r)), 'failed');
  assert.equal((await usage()).costMicroUsd, 9);
});
test('配線: callable の配線はクライアントを作らない（index.ts で createGenerator を呼ぶのは worker だけ）', () => {
  const src = readFileSync(new URL('../../functions/src/ai/index.ts', import.meta.url), 'utf8');
  assert.equal((src.match(/createGenerator\(/g) ?? []).length, 1);
  assert.ok(src.indexOf('createGenerator(') > src.indexOf('onTaskDispatched('));
  assert.doesNotMatch(readFileSync(new URL('../../functions/src/ai/request.ts', import.meta.url), 'utf8'), /anthropic|createGenerator/i);
});

// ---------- 配線（Functions エミュレータ。既定の off） ----------
test('配線: requestRequirementsDraft・saveAiDraftEdits が export され、既定 off で feature-disabled', async () => {
  const hub = emulatorHostFromEnv('FIREBASE_EMULATOR_HUB');
  const { functions } = await (await fetch(`http://${hub.host}:${hub.port}/emulators`)).json();
  const base = `http://${functions.host === '::1' ? '[::1]' : functions.host}:${functions.port}/${PROJECT}/asia-northeast1`;
  for (const fn of ['requestRequirementsDraft', 'saveAiDraftEdits']) {
    const r = await fetch(`${base}/${fn}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: { projectId: 'p1', requestId: uuid(1) } }) });
    const body = await r.json();
    assert.equal(body.error?.status, 'FAILED_PRECONDITION', `${fn} ${JSON.stringify(body)}`);
    assert.equal(body.error?.message, 'feature-disabled');
  }
});

// ---------- 提案 v3（要件定義書ひな型 U2。AI_REQUIREMENTS_PROPOSAL_VERSION=3 の生成器。クライアントだけ Stub） ----------
const { aiConfigFor } = lib('generateDraft');
const { configKeyForVersion } = lib('generatePort');
const V3_OUT = {
  summary: 'スマホで見やすくします。',
  points: VALID_OUT.points,
  doc: { items: [{ id: 't01-03', status: 'proposed', text: 'スマホで見づらいことが課題です。', evidence: ['q-issue'] }, { id: 't11-01', status: 'proposed', text: 'x', evidence: ['q-issue'] }], added: [], questions: ['公開時期は？'] },
};
function wiredV3() {
  const seen = { params: [] };
  const deps = tdeps(okResult, {
    createGenerator: (key) => createGenerator(key, {
      config: aiConfigFor(3),
      makeClient: () => ({ create: async (params) => { seen.params.push(params); return { message: stubMsg({ content: [{ type: 'text', text: JSON.stringify(V3_OUT) }] }), requestId: 'req_v3' }; } }),
    }),
  });
  return { deps, seen };
}
const seedV3Facts = () => Promise.all([
  db.doc('projects/p1').update({ siteName: 'ショップ公式', clientName: '株式会社ショップ' }),
  db.doc('projects/p1/requirements/current').update({ 'answers.q-dns-owner': 'アフロ', 'answers.q-dns-note': '注意 DNSNOTE-MARK-5d' }),
]);
test('v3: worker が v3 を書く（全 129 項目・固定は確認中・転記・ひな型の版・configHash は v3）。送る内容に案件名・DNS が無い', async () => {
  await seedV3Facts();
  await call('devA', {}, { configHash: () => configHash(configKeyForVersion(3)) });
  const { deps, seen } = wiredV3();
  assert.equal(await handleTask(enqueued[0], deps), 'ready');
  const d = await ai();
  assert.deepEqual([d.generated.version, d.generated.template, d.generated.origin.promptVersion], [3, { id: 'TPL-WEB-REQ', version: '0.1' }, 'PRM-REQ-001@2.0.0']);
  assert.equal(Object.keys(d.generated.doc.items).length, 129);
  assert.deepEqual(d.generated.doc.items['t11-01'], { status: 'std_pending', text: '', evidence: [], by: 'server' });
  assert.equal(d.generated.doc.items['t01-01'].text, 'ショップ公式');
  assert.equal(d.generated.doc.items['t12-01'].text, 'ドメインの管理: アフロ');
  assert.equal(d.configHash, await configHash(configKeyForVersion(3)));
  assert.equal(seen.params[0].max_tokens, 24_000);
  const body = JSON.stringify(seen.params[0]);
  for (const leak of ['ショップ公式', '株式会社ショップ', 'q-dns-owner', 'DNSNOTE-MARK-5d', '管理会社']) assert.equal(body.includes(leak), false, leak);
  assert.equal(JSON.stringify(d.generated).includes('DNSNOTE-MARK-5d'), false);
  // 版の設定が 2 に戻ると configHash が変わり、再利用しない（作り直せる）
  assert.equal((await call('devA', { requestId: uuid(2) }, { configHash: () => configHash(configKeyForVersion(2)) })).state, 'running');
});
test('v3: 編集の保存（写しは通る・固定の変更と v2 の形は拒否）。canary がログ・エラーに出ない', async () => {
  await seedV3Facts();
  await call('devA', {});
  assert.equal(await handleTask(enqueued[0], wiredV3().deps), 'ready');
  const g = (await ai()).generated;
  const ed = structuredClone({ summary: g.summary, points: g.points, doc: g.doc });
  ed.doc.items['t02-02'] = { ...ed.doc.items['t02-02'], status: 'proposed', text: '設計・制作・公開' };
  assert.deepEqual(await save('devA', ed), { ok: true });
  assert.equal((await ai()).edited.doc.items['t02-02'].text, '設計・制作・公開');
  const errors = [];
  const bad = structuredClone(ed); bad.doc.items['t11-01'] = { status: 'proposed', text: CANARY_ANS, evidence: [], by: 'server' };
  await assert.rejects(save('devA', bad), (e) => (errors.push(e.message), e.code === 'invalid-argument'));
  const extra = structuredClone(ed); extra.doc.items[CANARY_SITE] = {};
  await assert.rejects(save('devA', extra), (e) => (errors.push(e.message), e.code === 'invalid-argument'));
  await assert.rejects(save('devA', EDITED), (e) => (errors.push(e.message), e.message === 'edited is invalid: version'));
  assert.equal((await ai()).edited.doc.items['t11-01'].status, 'std_pending');
  const hay = JSON.stringify({ logs, errors });
  for (const c of [CANARY_ANS, CANARY_SITE, CANARY_KEY]) assert.equal(hay.includes(c), false, c);
});
test('v2 の下書きに v3 の形の編集は拒否', async () => {
  await withGenerated();
  await assert.rejects(save('devA', { summary: '', points: [], doc: {} }), (e) => e.message === 'edited is invalid: version');
});

// ---------- 必須の章のゲート submitReady（security-engineer U3 監査の条件・lead DECISION 2026-11-26） ----------
const { REQ_DOC_CATALOG, REQ_DOC_REQUIRED_CHAPTERS } = lib('shared/reqDocCatalog');
const REQUIRED_IDS = REQ_DOC_CATALOG['0.1'].items.filter((i) => REQ_DOC_REQUIRED_CHAPTERS['0.1'].includes(i.chapterId)).map((i) => i.id);
async function v3Ready() {
  await seedV3Facts();
  await call('devA', {});
  assert.equal(await handleTask(enqueued[0], wiredV3().deps), 'ready');
  const g = (await ai()).generated;
  return structuredClone({ summary: g.summary, points: g.points, doc: g.doc });
}
const fillRequired = (ed, over = {}) => {
  for (const id of REQUIRED_IDS) ed.doc.items[id] = { ...ed.doc.items[id], status: 'proposed', text: `${id} の内容`, ...over };
  return ed;
};
test('ゲート: 必須の章が空の項目を含む v3 の保存 → submitReady.requiredOk false（版つき）', async () => {
  const ed = await v3Ready();
  assert.ok(REQUIRED_IDS.length > 0);
  assert.ok(REQUIRED_IDS.some((id) => ed.doc.items[id].text === ''), 'generated に人が書く必須項目がある前提');
  await save('devA', ed);
  assert.deepEqual((await ai()).submitReady, { requiredOk: false, templateVersion: '0.1' });
});
test('ゲート: 必須の章を全部埋めた v3 の保存 → requiredOk true。1 件を未確定に戻す・文を空白だけにすると false', async () => {
  const ed = fillRequired(await v3Ready());
  await save('devA', ed);
  assert.deepEqual((await ai()).submitReady, { requiredOk: true, templateVersion: '0.1' });
  const open = structuredClone(ed); open.doc.items[REQUIRED_IDS[0]] = { ...open.doc.items[REQUIRED_IDS[0]], status: 'open' };
  await save('devA', open);
  assert.equal((await ai()).submitReady.requiredOk, false);
  const blank = structuredClone(ed); blank.doc.items[REQUIRED_IDS[1]] = { ...blank.doc.items[REQUIRED_IDS[1]], text: ' 　\n' };
  await save('devA', blank);
  assert.equal((await ai()).submitReady.requiredOk, false);
});
test('ゲート: 必須の章の項目を「対象外（理由あり）」にしても満たす', async () => {
  const ed = fillRequired(await v3Ready(), { status: 'na', text: '今回は対象外（お客様と合意）' });
  await save('devA', ed);
  assert.equal((await ai()).submitReady.requiredOk, true);
});
test('ゲート: 保存の拒否（固定の変更）では submitReady を書き換えない', async () => {
  const ed = await v3Ready();
  await save('devA', ed);
  const bad = fillRequired(structuredClone(ed)); bad.doc.items['t11-01'] = { status: 'proposed', text: 'x', evidence: [], by: 'server' };
  await assert.rejects(save('devA', bad), (e) => e.code === 'invalid-argument');
  assert.equal((await ai()).submitReady.requiredOk, false);
});
test('ゲート: 作り直し（discardEdits）が成功すると edited と一緒に submitReady も消える', async () => {
  const ed = fillRequired(await v3Ready());
  await save('devA', ed);
  assert.equal((await ai()).submitReady.requiredOk, true);
  await call('devA', { requestId: uuid(2), regenerate: true, discardEdits: true });
  assert.equal(await handleTask(enqueued.at(-1), wiredV3().deps), 'ready');
  const d = await ai();
  assert.equal(d.edited, undefined);
  assert.equal(d.submitReady, undefined);
});
test('ゲート: v2 の保存では submitReady を書かない', async () => {
  await withGenerated();
  await save('devA', EDITED);
  assert.equal((await ai()).submitReady, undefined);
});
