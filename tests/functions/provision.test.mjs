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

/** invites/{email} の文字列の項目（無ければ null） */
async function getInvite(email) {
  const r = await call(fsDoc(`invites/${email}`));
  if (r.status === 404) return null;
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return Object.fromEntries(Object.entries(r.body.fields ?? {}).map(([k, v]) => [k, v.stringValue ?? v.integerValue ?? null]));
}

/** 招待を取り消す（管理者の画面と同じ invited → revoked。Rules を通らない REST で、残りの項目はそのまま） */
async function revokeInvite(email) {
  const { schemaVersion, ...rest } = await getInvite(email);
  await putDoc(`invites/${email}`, { ...rest, schemaVersion: Number(schemaVersion), status: 'revoked' });
}

/** cond() が true になるまで待つ（Firestore トリガーは非同期。最大 timeoutMs） */
async function waitFor(cond, timeoutMs = 15_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await cond()) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
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
  // TEST-F1: 関数が決めた uid でアカウントを作り、招待に provisionedUid として書く（Rules の受け取りが照合する）
  assert.equal((await getInvite(INVITEE)).provisionedUid, users[0].localId);
  // パスワード設定（再設定）のメールを出せる（クライアントの sendPasswordResetEmail と同じ API）
  const oob = await call(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${KEY}`, { method: 'POST', body: JSON.stringify({ requestType: 'PASSWORD_RESET', email: INVITEE }) }, false);
  assert.equal(oob.status, 200, JSON.stringify(oob.body));
});

test('TEST-F2: 送り直し（関数がこの招待のために作ったアカウント）: resent。アカウント・uid・パスワードは変わらない', async () => {
  const admin = await makeUser('admin1@afro.example', { account: { role: 'admin' } });
  assert.equal((await provision(admin.token, { email: INVITEE })).body.result, 'created');
  const first = (await lookup(INVITEE))[0];
  const r = await provision(admin.token, { email: INVITEE });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.result, 'resent');
  const after = await lookup(INVITEE);
  assert.equal(after.length, 1);
  assert.equal(after[0].localId, first.localId);
  assert.equal(after[0].passwordHash, first.passwordHash);
  assert.equal((await getInvite(INVITEE)).provisionedUid, first.localId);
});

test('TEST-F3: 招待より前からあるアカウント（Console 追加・先の登録）: already-exists で拒否。何も書かず、アカウントも変えない', async () => {
  const admin = await makeUser('admin1@afro.example', { account: { role: 'admin' } });
  const pre = await signUp(INVITEE, 'Earlier1!pw');
  const beforeUser = (await lookup(INVITEE))[0];
  for (let i = 0; i < 2; i++) { // 送り直しでも同じ（受け付けない）
    const r = await provision(admin.token, { email: INVITEE });
    assert.equal(r.status, 409, JSON.stringify(r.body));
    assert.equal(r.body.error.status, 'ALREADY_EXISTS');
  }
  const after = await lookup(INVITEE);
  assert.equal(after.length, 1);
  assert.equal(after[0].localId, pre);
  assert.equal(after[0].passwordHash, beforeUser.passwordHash);
  assert.equal(after[0].emailVerified ?? false, false);
  assert.equal((await signIn(INVITEE, 'Earlier1!pw')).status, 200);
  assert.equal((await getInvite(INVITEE)).provisionedUid ?? null, null, 'provisionedUid is not written');
});

test('関数が作ったアカウントを Console で消し、同じメールで別のアカウントができた: already-exists（provisionedUid と違う uid は受け付けない）', async () => {
  const admin = await makeUser('admin1@afro.example', { account: { role: 'admin' } });
  assert.equal((await provision(admin.token, { email: INVITEE })).body.result, 'created');
  const provisioned = (await getInvite(INVITEE)).provisionedUid;
  const del = await call(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:delete`, { method: 'POST', body: JSON.stringify({ localId: provisioned }) });
  assert.equal(del.status, 200, JSON.stringify(del.body));
  const other = await signUp(INVITEE, 'Other1!pw');
  const r = await provision(admin.token, { email: INVITEE });
  assert.equal(r.status, 409, JSON.stringify(r.body));
  assert.equal(r.body.error.status, 'ALREADY_EXISTS');
  assert.equal((await lookup(INVITEE))[0].localId, other);
  assert.equal((await getInvite(INVITEE)).provisionedUid, provisioned, 'provisionedUid unchanged');
});

test('TEST-F4: 印（provisionedUid）を書いた後にアカウントが無い（作成の失敗・Console で削除）: 同じ uid で作り直して created', async () => {
  const admin = await makeUser('admin1@afro.example', { account: { role: 'admin' } });
  // 作成の失敗の再現: 招待に印だけがあり、その uid のアカウントは無い
  await putDoc(`invites/${INVITEE}`, { schemaVersion: 1, role: 'developer', status: 'invited', name: '招待 太郎', affiliation: 'internal', createdBy: 'console', provisionedUid: 'ghostUid0000000000000000001' });
  const r = await provision(admin.token, { email: INVITEE });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.result, 'created');
  const users = await lookup(INVITEE);
  assert.equal(users.length, 1);
  assert.equal(users[0].localId, 'ghostUid0000000000000000001');
  assert.equal((await getInvite(INVITEE)).provisionedUid, 'ghostUid0000000000000000001');
});

test('同時に 2 回呼ぶ（ボタンの二度押し）: 同じ uid の 1 アカウントだけ。created と resent', async () => {
  const admin = await makeUser('admin1@afro.example', { account: { role: 'admin' } });
  const rs = await Promise.all([provision(admin.token, { email: INVITEE }), provision(admin.token, { email: INVITEE })]);
  for (const r of rs) assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(rs.map((r) => r.body.result).sort(), ['created', 'resent']);
  const users = await lookup(INVITEE);
  assert.equal(users.length, 1);
  assert.equal((await getInvite(INVITEE)).provisionedUid, users[0].localId);
});

test('招待の取り消し（invited → revoked）: 関数が作った Auth アカウントを消す', async () => {
  const admin = await makeUser('admin1@afro.example', { account: { role: 'admin' } });
  assert.equal((await provision(admin.token, { email: INVITEE })).body.result, 'created');
  assert.equal((await lookup(INVITEE)).length, 1);
  await revokeInvite(INVITEE);
  assert.ok(await waitFor(async () => (await lookup(INVITEE)).length === 0), 'auth user deleted by onInviteRevoked');
});

test('招待の取り消し: accounts/{uid} がある・provisionedUid が無い（0.47.0 より前の招待）なら消さない', async () => {
  const admin = await makeUser('admin1@afro.example', { account: { role: 'admin' } });
  // A: 関数が作ったが accounts/{uid} がある（受け取り済みと同じ状態）
  assert.equal((await provision(admin.token, { email: INVITEE })).body.result, 'created');
  const kept = (await getInvite(INVITEE)).provisionedUid;
  await putDoc(`accounts/${kept}`, { schemaVersion: 1, status: 'active', email: INVITEE, name: '招待 太郎', role: 'developer' });
  // B: 0.47.0 より前の招待（provisionedUid なし）と、同じメールのアカウント
  const LEGACY = 'legacy.person@customer.example';
  await putDoc(`invites/${LEGACY}`, { schemaVersion: 1, role: 'developer', status: 'invited', name: '旧 招待', affiliation: 'internal', createdBy: 'console' });
  const legacyUid = await signUp(LEGACY, PW);
  // C（対照）: 消える招待。これが消えたら、先に取り消した A・B のトリガーも動いた後とみなす
  const CONTROL = 'control.person@customer.example';
  await putDoc(`invites/${CONTROL}`, { schemaVersion: 1, role: 'developer', status: 'invited', name: '対照 花子', affiliation: 'internal', createdBy: 'console' });
  assert.equal((await provision(admin.token, { email: CONTROL })).body.result, 'created');

  await revokeInvite(INVITEE);
  await revokeInvite(LEGACY);
  await revokeInvite(CONTROL);
  assert.ok(await waitFor(async () => (await lookup(CONTROL)).length === 0), 'control user deleted');
  await new Promise((r) => setTimeout(r, 1500));
  const a = await lookup(INVITEE);
  assert.equal(a.length, 1);
  assert.equal(a[0].localId, kept);
  const b = await lookup(LEGACY);
  assert.equal(b.length, 1);
  assert.equal(b[0].localId, legacyUid);
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
