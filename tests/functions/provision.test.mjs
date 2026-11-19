// provisionInvitee（functions/src/index.ts）のエミュレータテスト。npm run test:functions から実行する（emulators:exec 経由のみ）。
// Auth / Firestore はエミュレータの REST に `Authorization: Bearer owner`（Rules を通らない Console 相当）で用意し、
// callable はクライアント SDK と同じプロトコル（POST {data} ＋ ID トークン）で呼ぶ。
import { before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { assertDemoProject, emulatorHostFromEnv } from '../rules/guard.mjs';
import { EMULATOR_PROJECT_ID } from '../../scripts/firebase-projects.mjs';

const PROJECT = assertDemoProject(process.env.GCLOUD_PROJECT);
assert.equal(PROJECT, EMULATOR_PROJECT_ID);
const fsHost = emulatorHostFromEnv('FIRESTORE_EMULATOR_HOST');
const auHost = emulatorHostFromEnv('FIREBASE_AUTH_EMULATOR_HOST');
const FS = `http://${fsHost.host}:${fsHost.port}`;
const AUTH = `http://${auHost.host}:${auHost.port}`;
const KEY = 'demo-api-key';
const REGION = 'asia-northeast1';
let FUNCTIONS = '';

before(async () => {
  // Functions の場所はエミュレータのハブから取る（emulators:exec が FIREBASE_EMULATOR_HUB を渡す）
  const hub = emulatorHostFromEnv('FIREBASE_EMULATOR_HUB');
  const list = await (await fetch(`http://${hub.host}:${hub.port}/emulators`)).json();
  assert.ok(list.functions, 'functions emulator is running');
  const { host, port } = list.functions;
  assert.match(String(host), /^(127\.0\.0\.1|localhost|::1)$/);
  FUNCTIONS = `http://${host === '::1' ? '[::1]' : host}:${port}/${PROJECT}/${REGION}`;
});

async function call(url, init = {}, owner = true) {
  const headers = { 'Content-Type': 'application/json', ...(owner ? { Authorization: 'Bearer owner' } : {}), ...(init.headers ?? {}) };
  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : {} };
}

const fsDoc = (path) => `${FS}/v1/projects/${PROJECT}/databases/(default)/documents/${path}`;
const fields = (o) => ({ fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'number' ? { integerValue: String(v) } : { stringValue: v }])) });

async function putDoc(path, data) {
  const r = await call(fsDoc(path), { method: 'PATCH', body: JSON.stringify(fields(data)) });
  assert.equal(r.status, 200, JSON.stringify(r.body));
}

async function signUp(email, password) {
  const r = await call(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${KEY}`, { method: 'POST', body: JSON.stringify({ email, password, returnSecureToken: true }) }, false);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.localId;
}

async function setVerified(uid) {
  const r = await call(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`, { method: 'POST', body: JSON.stringify({ localId: uid, emailVerified: true }) });
  assert.equal(r.status, 200, JSON.stringify(r.body));
}

function signIn(email, password) {
  return call(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${KEY}`, { method: 'POST', body: JSON.stringify({ email, password, returnSecureToken: true }) }, false);
}

async function idTokenFor(email, password) {
  const r = await signIn(email, password);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.idToken;
}

async function lookup(email) {
  const r = await call(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:lookup`, { method: 'POST', body: JSON.stringify({ email: [email] }) });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.users ?? [];
}

/** callable を呼ぶ（firebase/functions の httpsCallable と同じ形） */
function provision(idToken, data) {
  const headers = idToken ? { Authorization: `Bearer ${idToken}` } : {};
  return call(`${FUNCTIONS}/provisionInvitee`, { method: 'POST', headers, body: JSON.stringify({ data }) }, false);
}

const PW = 'Passw0rd!x';
const INVITEE = 'new.person@customer.example';

/** 利用者を作る（verified=true ならメール確認済み）。account を渡すと accounts/{uid} も置く */
async function makeUser(email, { verified = true, account } = {}) {
  const uid = await signUp(email, PW);
  if (verified) await setVerified(uid);
  if (account) await putDoc(`accounts/${uid}`, { schemaVersion: 1, status: 'active', email, name: 'テスト', ...account });
  return { uid, token: await idTokenFor(email, PW) };
}

beforeEach(async () => {
  assert.equal((await call(`${FS}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' })).status, 200);
  assert.equal((await call(`${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' })).status, 200);
  await putDoc(`invites/${INVITEE}`, { schemaVersion: 1, role: 'developer', status: 'invited', name: '招待 太郎', affiliation: 'internal', createdBy: 'console' });
});

test('有効な管理者: アカウントを作り created（メール未確認・パスワード方式）', async () => {
  const admin = await makeUser('admin1@afro.example', { account: { role: 'admin' } });
  const r = await provision(admin.token, { email: `  ${INVITEE.toUpperCase()} ` });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.result, 'created');
  const users = await lookup(INVITEE);
  assert.equal(users.length, 1);
  assert.equal(users[0].email, INVITEE);
  assert.equal(users[0].emailVerified ?? false, false);
  assert.ok((users[0].providerUserInfo ?? []).some((p) => p.providerId === 'password'), 'password provider (password reset email works)');
  // パスワード設定（再設定）のメールを出せる（クライアントの sendPasswordResetEmail と同じ API）
  const oob = await call(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${KEY}`, { method: 'POST', body: JSON.stringify({ requestType: 'PASSWORD_RESET', email: INVITEE }) }, false);
  assert.equal(oob.status, 200, JSON.stringify(oob.body));
});

test('既にアカウントがある: 何も変えずに existing（前のパスワードでログインでき、確認状態もそのまま）', async () => {
  const admin = await makeUser('admin1@afro.example', { account: { role: 'admin' } });
  const pre = await signUp(INVITEE, 'Earlier1!pw');
  const beforeUser = (await lookup(INVITEE))[0];
  const r = await provision(admin.token, { email: INVITEE });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.result, 'existing');
  const after = await lookup(INVITEE);
  assert.equal(after.length, 1);
  assert.equal(after[0].localId, pre);
  assert.equal(after[0].passwordHash, beforeUser.passwordHash);
  assert.equal(after[0].emailVerified ?? false, false);
  assert.equal((await signIn(INVITEE, 'Earlier1!pw')).status, 200);
  // 2 回目（送り直し）も existing
  assert.equal((await provision(admin.token, { email: INVITEE })).body.result, 'existing');
});

test('ログインしていない: unauthenticated', async () => {
  const r = await provision(null, { email: INVITEE });
  assert.equal(r.status, 401);
  assert.equal(r.body.error.status, 'UNAUTHENTICATED');
  assert.equal((await lookup(INVITEE)).length, 0);
});

test('管理者以外（有効な開発者・お客様）: permission-denied', async () => {
  const cases = [
    ['dev1@afro.example', { role: 'developer', affiliation: 'internal' }],
    ['client1@customer.example', { role: 'client', projectId: 'p1', company: '株式会社テスト' }],
  ];
  for (const [email, account] of cases) {
    const u = await makeUser(email, { account });
    const r = await provision(u.token, { email: INVITEE });
    assert.equal(r.status, 403, email);
    assert.equal(r.body.error.status, 'PERMISSION_DENIED');
  }
  assert.equal((await lookup(INVITEE)).length, 0);
});

test('メール未確認の管理者: permission-denied', async () => {
  const admin = await makeUser('admin1@afro.example', { verified: false, account: { role: 'admin' } });
  const r = await provision(admin.token, { email: INVITEE });
  assert.equal(r.status, 403);
  assert.equal(r.body.error.status, 'PERMISSION_DENIED');
  assert.equal((await lookup(INVITEE)).length, 0);
});

test('無効化された管理者・accounts.email が token と違う管理者・accounts が無い人: permission-denied（Rules の isAdmin と同じ）', async () => {
  const off = await makeUser('adminoff@afro.example', { account: { role: 'admin', status: 'disabled' } });
  const moved = await makeUser('adminnew@afro.example');
  await putDoc(`accounts/${moved.uid}`, { schemaVersion: 1, status: 'active', email: 'adminold@afro.example', name: 'テスト', role: 'admin' });
  const none = await makeUser('nobody@afro.example');
  for (const u of [off, moved, none]) {
    const r = await provision(u.token, { email: INVITEE });
    assert.equal(r.status, 403);
    assert.equal(r.body.error.status, 'PERMISSION_DENIED');
  }
  assert.equal((await lookup(INVITEE)).length, 0);
});

test('招待の文書が無い・取り消し済み: failed-precondition（アカウントを作らない）', async () => {
  const admin = await makeUser('admin1@afro.example', { account: { role: 'admin' } });
  const r = await provision(admin.token, { email: 'stranger@other.example' });
  assert.equal(r.status, 400);
  assert.equal(r.body.error.status, 'FAILED_PRECONDITION');
  assert.equal((await lookup('stranger@other.example')).length, 0);
  await putDoc(`invites/${INVITEE}`, { schemaVersion: 1, role: 'developer', status: 'revoked', name: '招待 太郎', affiliation: 'internal', createdBy: 'console' });
  const r2 = await provision(admin.token, { email: INVITEE });
  assert.equal(r2.body.error.status, 'FAILED_PRECONDITION');
  assert.equal((await lookup(INVITEE)).length, 0);
});

test('メールの形・長さが不正: invalid-argument', async () => {
  const admin = await makeUser('admin1@afro.example', { account: { role: 'admin' } });
  const bad = [{}, { email: 1 }, { email: '' }, { email: 'no-at-mark' }, { email: 'a b@c.example' }, { email: `${'a'.repeat(250)}@x.jp` }];
  for (const data of bad) {
    const r = await provision(admin.token, data);
    assert.equal(r.status, 400, JSON.stringify(data));
    assert.equal(r.body.error.status, 'INVALID_ARGUMENT', JSON.stringify(data));
  }
});
