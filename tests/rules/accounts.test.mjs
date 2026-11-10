// accounts / invites の許可・拒否（§28.2・§28.3・§28.9 R-3・Low-1 (b)、M-1・M-5・M-8、SEC-1・SEC-5・SEC-6・SEC-9）
import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, getDoc, getDocs, query, where } from 'firebase/firestore';
import { createRulesEnv } from './guard.mjs';
import {
  PAST, claimAccount, claimBatch, dbAs, doc, inviteDoc, seed, serverTimestamp, setDoc, stamp, updateDoc,
} from './fixtures.mjs';

let env;
before(async () => { env = await createRulesEnv(); });
after(async () => { await env?.clearFirestore(); await env?.cleanup(); });
beforeEach(async () => { await seed(env); });

const NEWDEV_INV = inviteDoc({ role: 'developer', name: '新人 開発', affiliation: 'partner', partnerCompany: '協力会社Z', devRole: 'QA' });
const NEWCLIENT_INV = inviteDoc({ role: 'client', name: '新規 顧客', company: '株式会社テスト', projectId: 'p1' });
const asNew = (uid, email, token = {}) => env.authenticatedContext(uid, { email, email_verified: true, ...token }).firestore();

describe('accounts: get（Low-1 (b)・SEC-9）', () => {
  test('本人は自分を読める（disabled でも）', async () => {
    await assertSucceeds(getDoc(doc(dbAs(env, 'devA'), 'accounts/devA')));
    await assertSucceeds(getDoc(doc(dbAs(env, 'devOff'), 'accounts/devOff')));
  });
  test('admin は誰でも読める', async () => {
    for (const uid of ['admin2', 'devB', 'client2']) await assertSucceeds(getDoc(doc(dbAs(env, 'admin1'), `accounts/${uid}`)));
  });
  test('社内の開発者は admin・社内・協力会社の開発者を読める', async () => {
    const db = dbAs(env, 'devC');
    for (const uid of ['admin1', 'devA', 'devB', 'devP2']) await assertSucceeds(getDoc(doc(db, `accounts/${uid}`)));
  });
  test('協力会社の開発者は admin と社内の開発者だけ読める', async () => {
    const db = dbAs(env, 'devB');
    await assertSucceeds(getDoc(doc(db, 'accounts/admin1')));
    await assertSucceeds(getDoc(doc(db, 'accounts/devA')));
  });
  test('SEC-9: 協力会社の開発者は他社の協力会社開発者を読めない', async () => {
    await assertFails(getDoc(doc(dbAs(env, 'devB'), 'accounts/devP2')));
  });
  test('SEC-9: affiliation の無い開発者は協力会社扱い（社内の開発者として読まれない・協力会社を読めない）', async () => {
    await assertFails(getDoc(doc(dbAs(env, 'devNoAff'), 'accounts/devB')));
    await assertFails(getDoc(doc(dbAs(env, 'devB'), 'accounts/devNoAff')));
  });
  test('開発者は担当案件のお客様を読める', async () => {
    await assertSucceeds(getDoc(doc(dbAs(env, 'devA'), 'accounts/client1')));
    await assertSucceeds(getDoc(doc(dbAs(env, 'devB'), 'accounts/client1')));
  });
  test('SEC-9: 開発者は他案件のお客様を読めない（社内・協力会社とも）', async () => {
    await assertFails(getDoc(doc(dbAs(env, 'devA'), 'accounts/client2')));
    await assertFails(getDoc(doc(dbAs(env, 'devB'), 'accounts/client2')));
  });
  test('お客様は自分以外を読めない', async () => {
    const db = dbAs(env, 'client1');
    for (const uid of ['devA', 'admin1', 'client2']) await assertFails(getDoc(doc(db, `accounts/${uid}`)));
  });
  test('無効化された開発者は他人を読めない', async () => {
    await assertFails(getDoc(doc(dbAs(env, 'devOff'), 'accounts/devA')));
  });
  test('未ログイン・メール未確認は読めない', async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'accounts/devA')));
    await assertFails(getDoc(doc(dbAs(env, 'devA', { email_verified: false }), 'accounts/devA')));
    await assertFails(getDoc(doc(dbAs(env, 'admin1', { email_verified: false }), 'accounts/devA')));
  });
  test('accounts 文書の無い（招待を受け取っていない）ログインは他人を読めない', async () => {
    await assertFails(getDoc(doc(asNew('stranger', 'stranger@example.com'), 'accounts/devA')));
  });
});

describe('accounts: list', () => {
  test('admin は一覧できる', async () => {
    await assertSucceeds(getDocs(query(collection(dbAs(env, 'admin1'), 'accounts'), where('role', '==', 'developer'))));
  });
  test('開発者は担当案件のお客様を role と projectId の両方で絞れば一覧できる', async () => {
    const db = dbAs(env, 'devA');
    await assertSucceeds(getDocs(query(collection(db, 'accounts'), where('role', '==', 'client'), where('projectId', '==', 'p1'))));
  });
  test('開発者の絞り込みなし・他案件・role なしの一覧は拒否', async () => {
    const db = dbAs(env, 'devA');
    await assertFails(getDocs(collection(db, 'accounts')));
    await assertFails(getDocs(query(collection(db, 'accounts'), where('role', '==', 'client'), where('projectId', '==', 'p2'))));
    await assertFails(getDocs(query(collection(db, 'accounts'), where('projectId', '==', 'p1'))));
  });
  test('お客様は一覧できない', async () => {
    await assertFails(getDocs(query(collection(dbAs(env, 'client1'), 'accounts'), where('projectId', '==', 'p1'))));
  });
});

describe('招待の受け取り（claim。M-1・SEC-1・SEC-6）', () => {
  test('招待どおりの写しで受け取れる（開発者・お客様・Console で作った admin）', async () => {
    await assertSucceeds(claimBatch(asNew('u-dev', 'newdev@afro.example'), { uid: 'u-dev', email: 'newdev@afro.example', account: claimAccount('u-dev', NEWDEV_INV, 'newdev@afro.example') }));
    await assertSucceeds(claimBatch(asNew('u-cli', 'newclient@customer.example'), { uid: 'u-cli', email: 'newclient@customer.example', account: claimAccount('u-cli', NEWCLIENT_INV, 'newclient@customer.example') }));
    const adm = { ...inviteDoc({ role: 'admin', name: '新任 管理' }), createdBy: 'console' };
    await assertSucceeds(claimBatch(asNew('u-adm', 'newadmin@afro.example'), { uid: 'u-adm', email: 'newadmin@afro.example', account: claimAccount('u-adm', adm, 'newadmin@afro.example') }));
  });
  const deny = (name, over, { inv = NEWDEV_INV, email = 'newdev@afro.example', token = {}, invite, uid = 'u-dev', docUid } = {}) =>
    test(name, async () => {
      const db = asNew(uid, email, token);
      await assertFails(claimBatch(db, { uid: docUid ?? uid, email, account: claimAccount(uid, inv, email, over), invite }));
    });
  deny('SEC-1: name を変えて受け取る → 拒否', { name: '別人の名前' });
  deny('SEC-1: company を変えて受け取る → 拒否', { company: '偽の会社' }, { inv: NEWCLIENT_INV, email: 'newclient@customer.example', uid: 'u-cli' });
  deny('M-1: role を admin に変えて受け取る → 拒否', { role: 'admin' });
  deny('M-1: お客様が projectId を他案件に変える → 拒否', { projectId: 'p2' }, { inv: NEWCLIENT_INV, email: 'newclient@customer.example', uid: 'u-cli' });
  deny('M-1: affiliation / partnerCompany / devRole を変える → 拒否', { affiliation: 'internal' });
  deny('M-1: partnerCompany を落とす → 拒否', { partnerCompany: undefined });
  deny('M-1: devRole を書き換える → 拒否', { devRole: 'リード' });
  deny('status を disabled 以外の値・disabledAt を持たせる → 拒否', { disabledAt: PAST });
  deny('activatedAt を過去日時にする → 拒否', { activatedAt: PAST });
  deny('schemaVersion が 1 でない → 拒否', { schemaVersion: 2 });
  deny('email を token と違う値にする → 拒否', { email: 'other@afro.example' });
  deny('未知のキーを足す → 拒否', { isSuperUser: true });
  deny('メール未確認では受け取れない', {}, { token: { email_verified: false } });
  deny('他人の uid の accounts を作る → 拒否', {}, { docUid: 'someone-else' });
  deny('invites を claimed にしない（accounts だけ作る）→ 拒否', {}, { invite: null });
  deny('invites の claimedBy を他人にする → 拒否', {}, { invite: { status: 'claimed', claimedBy: 'x', claimedAt: serverTimestamp() } });
  test('他人のメールの招待は受け取れない（token.email の招待しか見えない）', async () => {
    const db = asNew('u-x', 'attacker@example.com');
    await assertFails(claimBatch(db, { uid: 'u-x', email: 'newdev@afro.example', account: claimAccount('u-x', NEWDEV_INV, 'attacker@example.com') }));
    await assertFails(getDoc(doc(db, 'invites/newdev@afro.example')));
  });
  test('revoked の招待は受け取れない', async () => {
    const inv = inviteDoc({ role: 'client', name: '取消 顧客', company: '株式会社テスト', projectId: 'p1' });
    await assertFails(claimBatch(asNew('u-r', 'revoked@customer.example'), { uid: 'u-r', email: 'revoked@customer.example', account: claimAccount('u-r', inv, 'revoked@customer.example') }));
  });
  test('二重受け取り（2 回目）は拒否', async () => {
    const db = asNew('u-dev', 'newdev@afro.example');
    await assertSucceeds(claimBatch(db, { uid: 'u-dev', email: 'newdev@afro.example', account: claimAccount('u-dev', NEWDEV_INV, 'newdev@afro.example') }));
    await assertFails(claimBatch(db, { uid: 'u-dev', email: 'newdev@afro.example', account: claimAccount('u-dev', NEWDEV_INV, 'newdev@afro.example') }));
    // Auth を作り直して別 uid で再受け取り → claimed なので拒否
    const db2 = asNew('u-dev2', 'newdev@afro.example');
    await assertFails(claimBatch(db2, { uid: 'u-dev2', email: 'newdev@afro.example', account: claimAccount('u-dev2', NEWDEV_INV, 'newdev@afro.example') }));
  });
  test('本人は自分のメールの招待を読める・invites の一覧はできない', async () => {
    const db = asNew('u-dev', 'newdev@afro.example');
    await assertSucceeds(getDoc(doc(db, 'invites/newdev@afro.example')));
    await assertFails(getDocs(collection(db, 'invites')));
  });
  test('SEC-6: 大文字混在の token.email は小文字の招待文書と一致せず拒否（安全側）', async () => {
    const db = asNew('u-up', 'NewDev@Afro.example');
    await assertFails(claimBatch(db, { uid: 'u-up', email: 'newdev@afro.example', account: claimAccount('u-up', NEWDEV_INV, 'NewDev@Afro.example') }));
  });
});

describe('SEC-6: Auth エミュレータが大文字混在メールをどう返すか（計測）', () => {
  test('signUp した ID トークンの email', async () => {
    const host = process.env.FIREBASE_AUTH_EMULATOR_HOST;
    assert.ok(host && /^(127\.0\.0\.1|localhost):\d+$/.test(host), 'Auth エミュレータの host が必要');
    const res = await fetch(`http://${host}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'Mixed.Case@Example.COM', password: 'secret-123456', returnSecureToken: true }),
    });
    const body = await res.json();
    assert.equal(res.ok, true, JSON.stringify(body));
    const payload = JSON.parse(Buffer.from(body.idToken.split('.')[1], 'base64url').toString('utf8'));
    console.log(`[計測] signUp('Mixed.Case@Example.COM') → token.email=${payload.email}, email_verified=${payload.email_verified}`);
    // 小文字化されるなら invites/{小文字} と一致して受け取れる。されないなら上のテストのとおり拒否（安全側）
    assert.equal(payload.email, 'mixed.case@example.com');
  });
});

describe('accounts: update（M-5・R-3・SEC-5）', () => {
  test('admin は開発者・お客様を無効化できる（disabledAt = request.time）', async () => {
    const db = dbAs(env, 'admin1');
    await assertSucceeds(updateDoc(doc(db, 'accounts/devA'), { status: 'disabled', disabledAt: serverTimestamp(), ...stamp('admin1') }));
    await assertSucceeds(updateDoc(doc(db, 'accounts/client1'), { status: 'disabled', disabledAt: serverTimestamp(), ...stamp('admin1') }));
  });
  test('admin は無効化を戻せる（disabledAt は触らない）・改名できる', async () => {
    const db = dbAs(env, 'admin1');
    await assertSucceeds(updateDoc(doc(db, 'accounts/devOff'), { status: 'active', ...stamp('admin1') }));
    await assertSucceeds(updateDoc(doc(db, 'accounts/client1'), { name: '顧客 一子（改）', ...stamp('admin1') }));
  });
  test('admin は開発者の devRole を変えられる', async () => {
    await assertSucceeds(updateDoc(doc(dbAs(env, 'admin1'), 'accounts/devA'), { devRole: 'バックエンド', ...stamp('admin1') }));
  });
  test('R-3: admin がお客様に devRole を足す → 拒否', async () => {
    await assertFails(updateDoc(doc(dbAs(env, 'admin1'), 'accounts/client1'), { devRole: 'フロント', ...stamp('admin1') }));
  });
  test('SEC-5 / M-5: admin が他の admin を無効化・改名 → 拒否', async () => {
    const db = dbAs(env, 'admin1');
    await assertFails(updateDoc(doc(db, 'accounts/admin2'), { status: 'disabled', disabledAt: serverTimestamp(), ...stamp('admin1') }));
    await assertFails(updateDoc(doc(db, 'accounts/admin2'), { name: '乗っ取り', ...stamp('admin1') }));
  });
  test('admin が自分を無効化 → 拒否', async () => {
    await assertFails(updateDoc(doc(dbAs(env, 'admin1'), 'accounts/admin1'), { status: 'disabled', disabledAt: serverTimestamp(), ...stamp('admin1') }));
  });
  test('role・email・projectId は誰も変えられない（権限昇格）', async () => {
    const db = dbAs(env, 'admin1');
    await assertFails(updateDoc(doc(db, 'accounts/devA'), { role: 'admin', ...stamp('admin1') }));
    await assertFails(updateDoc(doc(db, 'accounts/client1'), { projectId: 'p2', ...stamp('admin1') }));
    await assertFails(updateDoc(doc(db, 'accounts/devA'), { email: 'x@afro.example', ...stamp('admin1') }));
  });
  test('本人は自分の role・status・name を変えられない', async () => {
    const db = dbAs(env, 'devA');
    await assertFails(updateDoc(doc(db, 'accounts/devA'), { role: 'admin', ...stamp('devA') }));
    await assertFails(updateDoc(doc(db, 'accounts/devA'), { name: '別名', ...stamp('devA') }));
    await assertFails(updateDoc(doc(dbAs(env, 'devOff'), 'accounts/devOff'), { status: 'active', ...stamp('devOff') }));
  });
  test('無効化の disabledAt を過去にする・status の値が想定外 → 拒否', async () => {
    const db = dbAs(env, 'admin1');
    await assertFails(updateDoc(doc(db, 'accounts/devA'), { status: 'disabled', disabledAt: PAST, ...stamp('admin1') }));
    await assertFails(updateDoc(doc(db, 'accounts/devA'), { status: 'disabled', ...stamp('admin1') }));
    await assertFails(updateDoc(doc(db, 'accounts/devA'), { status: 'banned', ...stamp('admin1') }));
  });
  test('updatedAt / updatedBy を偽る → 拒否', async () => {
    const db = dbAs(env, 'admin1');
    await assertFails(updateDoc(doc(db, 'accounts/devA'), { name: '改名', updatedAt: PAST, updatedBy: 'admin1' }));
    await assertFails(updateDoc(doc(db, 'accounts/devA'), { name: '改名', updatedAt: serverTimestamp(), updatedBy: 'devA' }));
  });
  test('名前の長さ: 40 文字は許可・41 文字は拒否', async () => {
    const db = dbAs(env, 'admin1');
    await assertSucceeds(updateDoc(doc(db, 'accounts/devA'), { name: 'あ'.repeat(40), ...stamp('admin1') }));
    await assertFails(updateDoc(doc(db, 'accounts/devA'), { name: 'あ'.repeat(41), ...stamp('admin1') }));
  });
  test('開発者は他人のアカウントを変えられない', async () => {
    await assertFails(updateDoc(doc(dbAs(env, 'devA'), 'accounts/devB'), { status: 'disabled', disabledAt: serverTimestamp(), ...stamp('devA') }));
  });
  test('削除は誰もできない（admin も）', async () => {
    const { deleteDoc } = await import('firebase/firestore');
    await assertFails(deleteDoc(doc(dbAs(env, 'admin1'), 'accounts/devA')));
    await assertFails(deleteDoc(doc(dbAs(env, 'devA'), 'accounts/devA')));
  });
  test('無効化されたユーザーは全権限を失う（無効化の即時性）', async () => {
    await assertSucceeds(updateDoc(doc(dbAs(env, 'admin1'), 'accounts/devA'), { status: 'disabled', disabledAt: serverTimestamp(), ...stamp('admin1') }));
    await assertFails(getDoc(doc(dbAs(env, 'devA'), 'projects/p1')));
  });
});

describe('invites: create / update / list', () => {
  const create = (uid, email, data) => setDoc(doc(dbAs(env, uid), `invites/${email}`), data);
  const newInv = (f) => ({ ...inviteDoc(f), createdAt: serverTimestamp(), createdBy: 'admin1' });
  test('admin は開発者（社内・協力会社）・お客様を招待できる', async () => {
    await assertSucceeds(create('admin1', 'a@afro.example', newInv({ role: 'developer', name: '社内 新人', affiliation: 'internal', devRole: 'QA' })));
    await assertSucceeds(create('admin1', 'b@partner.example', newInv({ role: 'developer', name: '協力 新人', affiliation: 'partner', partnerCompany: '協力会社Q' })));
    await assertSucceeds(create('admin1', 'c@customer.example', newInv({ role: 'client', name: '顧客 新人', company: '株式会社テスト', projectId: 'p1' })));
  });
  test('admin を招待で作る → 拒否（Console のみ）', async () => {
    await assertFails(create('admin1', 'boss@afro.example', newInv({ role: 'admin', name: '偽管理者' })));
  });
  test('開発者・お客様は招待できない', async () => {
    await assertFails(create('devA', 'x@afro.example', { ...newInv({ role: 'developer', name: 'x', affiliation: 'internal' }), createdBy: 'devA' }));
    await assertFails(create('client1', 'y@customer.example', { ...newInv({ role: 'client', name: 'y', company: 'c', projectId: 'p1' }), createdBy: 'client1' }));
  });
  test('お客様の招待: 存在しない案件・会社名なし・開発者項目つき → 拒否', async () => {
    await assertFails(create('admin1', 'c1@customer.example', newInv({ role: 'client', name: '顧客', company: '株式会社テスト', projectId: 'no-such' })));
    await assertFails(create('admin1', 'c2@customer.example', newInv({ role: 'client', name: '顧客', projectId: 'p1' })));
    await assertFails(create('admin1', 'c3@customer.example', newInv({ role: 'client', name: '顧客', company: '株式会社テスト', projectId: 'p1', devRole: 'QA' })));
  });
  test('開発者の招待: 協力会社で会社名なし・社内で会社名あり・所属なし → 拒否', async () => {
    await assertFails(create('admin1', 'd1@partner.example', newInv({ role: 'developer', name: '開発', affiliation: 'partner' })));
    await assertFails(create('admin1', 'd2@afro.example', newInv({ role: 'developer', name: '開発', affiliation: 'internal', partnerCompany: 'X' })));
    await assertFails(create('admin1', 'd3@afro.example', newInv({ role: 'developer', name: '開発' })));
    await assertFails(create('admin1', 'd4@afro.example', newInv({ role: 'developer', name: '開発', affiliation: 'internal', projectId: 'p1' })));
  });
  test('文書 ID が小文字でない・メール形式でない → 拒否', async () => {
    await assertFails(create('admin1', 'Upper@afro.example', newInv({ role: 'developer', name: '開発', affiliation: 'internal' })));
    await assertFails(create('admin1', 'not-an-email', newInv({ role: 'developer', name: '開発', affiliation: 'internal' })));
  });
  test('status が invited でない・createdAt が過去・createdBy が他人 → 拒否', async () => {
    const base = newInv({ role: 'developer', name: '開発', affiliation: 'internal' });
    await assertFails(create('admin1', 'e1@afro.example', { ...base, status: 'claimed' }));
    await assertFails(create('admin1', 'e2@afro.example', { ...base, createdAt: PAST }));
    await assertFails(create('admin1', 'e3@afro.example', { ...base, createdBy: 'admin2' }));
  });
  test('同じメールの二重招待（既存文書への set）→ 拒否', async () => {
    await assertFails(create('admin1', 'newdev@afro.example', newInv({ role: 'developer', name: '新人 開発', affiliation: 'internal' })));
  });
  test('admin は未使用の招待を取り消せる・使用済みや revoked は変えられない', async () => {
    const db = dbAs(env, 'admin1');
    await assertSucceeds(updateDoc(doc(db, 'invites/newdev@afro.example'), { status: 'revoked', revokedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db, 'invites/revoked@customer.example'), { status: 'invited' }));
    await assertFails(updateDoc(doc(db, 'invites/newclient@customer.example'), { status: 'revoked', revokedAt: PAST }));
    await assertFails(updateDoc(doc(db, 'invites/newclient@customer.example'), { role: 'admin' }));
  });
  test('招待の削除は誰もできない', async () => {
    const { deleteDoc } = await import('firebase/firestore');
    await assertFails(deleteDoc(doc(dbAs(env, 'admin1'), 'invites/newdev@afro.example')));
  });
  test('一覧は admin だけ', async () => {
    await assertSucceeds(getDocs(query(collection(dbAs(env, 'admin1'), 'invites'), where('status', '==', 'invited'))));
    await assertFails(getDocs(collection(dbAs(env, 'devA'), 'invites')));
    await assertFails(getDoc(doc(dbAs(env, 'devA'), 'invites/newdev@afro.example')));
  });
});
