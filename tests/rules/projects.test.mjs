// projects / siteKeys の許可・拒否（§5.3・§5.4・§28.4。Low-2、案件の分離）
import { after, before, beforeEach, describe, test } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { Timestamp, collection, deleteDoc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { createRulesEnv } from './guard.mjs';
import {
  ANSWERS, PAST, T0, answerMetaFor, approveBatch, createProjectBatch, dbAs, deleteField, doc, seed, serverTimestamp, setDoc, stamp, submitBatch, updateDoc, withdrawBatch,
} from './fixtures.mjs';

let env;
before(async () => { env = await createRulesEnv(); });
after(async () => { await env?.clearFirestore(); await env?.cleanup(); });
beforeEach(async () => { await seed(env); });

describe('projects: get / list（案件の分離）', () => {
  test('admin・アサインされた開発者・担当のお客様は get できる', async () => {
    await assertSucceeds(getDoc(doc(dbAs(env, 'admin1'), 'projects/p1')));
    await assertSucceeds(getDoc(doc(dbAs(env, 'devA'), 'projects/p1')));
    await assertSucceeds(getDoc(doc(dbAs(env, 'devB'), 'projects/p1')));
    await assertSucceeds(getDoc(doc(dbAs(env, 'client1'), 'projects/p1')));
  });
  test('アサイン外の開発者・他案件のお客様・無効化された人は get できない', async () => {
    await assertFails(getDoc(doc(dbAs(env, 'devC'), 'projects/p1')));
    await assertFails(getDoc(doc(dbAs(env, 'client2'), 'projects/p1')));
    await assertFails(getDoc(doc(dbAs(env, 'devOff'), 'projects/p1')));
    await assertFails(getDoc(doc(dbAs(env, 'clientOff'), 'projects/p1')));
  });
  test('未ログイン・メール未確認・招待未受け取りは get できない', async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'projects/p1')));
    await assertFails(getDoc(doc(dbAs(env, 'devA', { email_verified: false }), 'projects/p1')));
    await assertFails(getDoc(doc(env.authenticatedContext('stranger', { email: 's@example.com', email_verified: true }).firestore(), 'projects/p1')));
  });
  test('M-8: accounts.email と違う token.email では get できない', async () => {
    await assertFails(getDoc(doc(dbAs(env, 'devA', { email: 'changed@afro.example' }), 'projects/p1')));
  });
  test('開発者は array-contains 付きの一覧ができる（§10 のクエリ）', async () => {
    const db = dbAs(env, 'devA');
    await assertSucceeds(getDocs(query(collection(db, 'projects'), where('memberUids', 'array-contains', 'devA'), orderBy('updatedAt', 'desc'), limit(50))));
  });
  test('開発者の array-contains なし・他人の uid での一覧 → 拒否', async () => {
    const db = dbAs(env, 'devA');
    await assertFails(getDocs(query(collection(db, 'projects'), limit(50))));
    await assertFails(getDocs(query(collection(db, 'projects'), where('memberUids', 'array-contains', 'devC'))));
  });
  test('admin は全件の一覧ができる（§10 のクエリ）', async () => {
    await assertSucceeds(getDocs(query(collection(dbAs(env, 'admin1'), 'projects'), where('archived', '==', false), orderBy('updatedAt', 'desc'), limit(50))));
  });
  test('お客様は一覧できない（get のみ）', async () => {
    await assertFails(getDocs(query(collection(dbAs(env, 'client1'), 'projects'), limit(1))));
  });
});

describe('projects: create（案件作成のバッチ）', () => {
  test('開発者は projects・siteKeys・requirements/current を 1 バッチで作れる', async () => {
    await assertSucceeds(createProjectBatch(dbAs(env, 'devA')));
  });
  test('launchDate（Timestamp）付きでも作れる', async () => {
    await assertSucceeds(createProjectBatch(dbAs(env, 'devA'), { mutate: { project: { launchDate: Timestamp.fromDate(new Date('2027-04-01T03:00:00Z')) } } }));
  });
  const deny = (name, uid, mutate) => test(name, async () => { await assertFails(createProjectBatch(dbAs(env, uid), { mutate })); });
  deny('admin が ownerUid・createdBy を他人（devA）にして作る → 拒否', 'admin1', {});
  deny('お客様は案件を作れない', 'client1', {});
  deny('お客様が admin の形（memberUids に開発者）で作る → 拒否', 'client1', { project: { memberUids: ['devA'] } });
  deny('無効化された開発者は作れない', 'devOff', {});
  deny('memberUids に他人を足して作る → 拒否', 'devA', { project: { memberUids: ['devA', 'devC'] } });
  deny('ownerUid を他人にする → 拒否', 'devA', { project: { ownerUid: 'devC' } });
  deny('requirements を analyzed で作る → 拒否', 'devA', { project: { requirements: { status: 'analyzed', revision: 1 } } });
  deny('requirements を approved で作る → 拒否', 'devA', { project: { requirements: { status: 'approved', revision: 0 } } });
  deny('archived: true で作る → 拒否', 'devA', { project: { archived: true } });
  deny('createdAt を過去日時にする → 拒否', 'devA', { project: { createdAt: PAST } });
  deny('未知のキーを足す → 拒否', 'devA', { project: { budget: 100 } });
  deny('schemaVersion が無い → 拒否', 'devA', { project: { schemaVersion: undefined } });
  deny('accent が選択肢外 → 拒否', 'devA', { project: { accent: '#000000' } });
  deny('clientName 41 文字 → 拒否', 'devA', { project: { clientName: 'あ'.repeat(41) } });
  deny('industry 21 文字 → 拒否', 'devA', { project: { industry: 'あ'.repeat(21) } });
  deny('siteUrl が http(s) でない → 拒否', 'devA', { project: { siteUrl: 'javascript:alert(1)' } });
  deny('launchDate が文字列 → 拒否', 'devA', { project: { launchDate: '2027-04-01' } });
  deny('siteKeys なしで作る → 拒否', 'devA', { skipKey: true });
  deny('siteKeys の鍵と siteUrlKey が違う → 拒否', 'devA', { keyId: 'other-key.example.jp' });
  deny('既に使われている siteUrlKey（URL の重複）→ 拒否', 'devA', { project: { siteUrlKey: 'example.co.jp' }, keyId: 'example.co.jp' });
  deny('requirements/current に proposal を入れて作る（R-1）→ 拒否', 'devA', { req: { schemaVersion: 1, answers: {}, answerMeta: {}, proposalRevision: 1, ...stamp('devA') } });
  test('作成値の検査: 40 文字の clientName・20 文字の industry は許可', async () => {
    await assertSucceeds(createProjectBatch(dbAs(env, 'devA'), { mutate: { project: { clientName: 'あ'.repeat(40), industry: 'い'.repeat(20) } } }));
  });
});

describe('projects: create（admin。2026-11-25 ユーザー決定「管理者もプロジェクトを作れるように」）', () => {
  const asAdmin = (project = {}, rest = {}) => createProjectBatch(dbAs(env, 'admin1'), { uid: 'admin1', mutate: { project, ...rest } });
  const members = (n) => Array.from({ length: n }, (_, i) => `u${i}`);
  test('admin は担当なし（memberUids: []）で 1 バッチで作れる', async () => {
    await assertSucceeds(asAdmin({ memberUids: [] }));
  });
  test('admin は担当の開発者を選んで作れる（[devA]・20 人まで）', async () => {
    await assertSucceeds(asAdmin({ memberUids: ['devA'] }));
    await assertSucceeds(createProjectBatch(dbAs(env, 'admin1'), { uid: 'admin1', pid: 'p10', key: 'twenty.example.jp', mutate: { project: {
      // 式の数が最も多い形（20 人・任意項目の launchDate・上限の長さ）でも 1000 式の上限に当たらない
      memberUids: members(20), launchDate: Timestamp.fromDate(new Date('2027-04-01T03:00:00Z')),
      clientName: 'あ'.repeat(40), siteName: 'い'.repeat(40), industry: 'う'.repeat(20),
    } } }));
  });
  test('admin が作った案件（[devA]）: devA は get・一覧・回答の入力ができ、アサイン外の devC はできない', async () => {
    await assertSucceeds(asAdmin({ memberUids: ['devA'] }));
    const a = dbAs(env, 'devA');
    await assertSucceeds(getDoc(doc(a, 'projects/p9')));
    const listed = await assertSucceeds(getDocs(query(collection(a, 'projects'), where('memberUids', 'array-contains', 'devA'), orderBy('updatedAt', 'desc'), limit(50))));
    if (!listed.docs.some((d) => d.id === 'p9')) throw new Error('p9 not listed for devA');
    await assertSucceeds(getDoc(doc(a, 'projects/p9/requirements/current')));
    await assertSucceeds(updateDoc(doc(a, 'projects/p9/requirements/current'), { answers: ANSWERS, answerMeta: answerMetaFor(ANSWERS), ...stamp('devA') }));
    await assertFails(getDoc(doc(dbAs(env, 'devC'), 'projects/p9')));
  });
  test('admin が作った案件へお客様を招待できる・admin は後から担当を変えられる', async () => {
    await assertSucceeds(asAdmin({ memberUids: [] }));
    const db = dbAs(env, 'admin1');
    await assertSucceeds(setDoc(doc(db, 'invites/new9@customer.example'), { schemaVersion: 1, role: 'client', status: 'invited', name: '新規 顧客9', company: '新規株式会社', projectId: 'p9', createdAt: serverTimestamp(), createdBy: 'admin1' }));
    await assertSucceeds(updateDoc(doc(db, 'projects/p9'), { memberUids: ['devC'], ...stamp('admin1') }));
  });
  const deny = (name, project, rest = {}) => test(name, async () => { await assertFails(asAdmin(project, rest)); });
  deny('admin が memberUids に自分を入れて作る → 拒否（admin 自身はアサインしない）', { memberUids: ['admin1'] });
  deny('admin が memberUids に開発者と自分を入れて作る → 拒否', { memberUids: ['devA', 'admin1'] });
  test('admin がお客様の uid を memberUids に入れて作っても、お客様は開発者の権限を得ない', async () => {
    await assertSucceeds(asAdmin({ memberUids: ['client1'] }));
    const c = dbAs(env, 'client1');
    await assertFails(updateDoc(doc(c, 'projects/p9'), { siteName: '書き換え', ...stamp('client1') }));
    await assertFails(updateDoc(doc(c, 'projects/p9/requirements/current'), { answers: ANSWERS, answerMeta: answerMetaFor(ANSWERS), ...stamp('client1') }));
  });
  deny('ownerUid を他人にする → 拒否', { memberUids: [], ownerUid: 'devA' });
  deny('createdBy を他人にする → 拒否', { memberUids: [], createdBy: 'devA' });
  deny('updatedBy を他人にする → 拒否', { memberUids: [], updatedBy: 'devA' });
  deny('requirements を analyzed で作る → 拒否', { memberUids: [], requirements: { status: 'analyzed', revision: 1 } });
  deny('archived: true で作る → 拒否', { memberUids: [], archived: true });
  deny('clientName 41 文字（validProject）→ 拒否', { memberUids: [], clientName: 'あ'.repeat(41) });
  deny('memberUids 21 人 → 拒否', { memberUids: members(21) });
  deny('memberUids に重複 → 拒否', { memberUids: ['devA', 'devA'] });
  deny('memberUids に文字列以外 → 拒否', { memberUids: ['devA', 1] });
  deny('memberUids に空文字 → 拒否', { memberUids: [''] });
  deny('memberUids が list でない → 拒否', { memberUids: 'devA' });
  deny('memberUids が無い → 拒否', { memberUids: undefined });
  deny('既に使われている siteUrlKey（URL の重複）→ 拒否', { memberUids: [], siteUrlKey: 'example.co.jp' }, { keyId: 'example.co.jp' });
  deny('siteKeys なしで作る → 拒否', { memberUids: [] }, { skipKey: true });
  deny('requirements/current に proposal を入れて作る（R-1）→ 拒否', { memberUids: [] }, { req: { schemaVersion: 1, answers: {}, answerMeta: {}, proposalRevision: 1, ...stamp('admin1') } });
  test('無効化された admin（ここでは admin2 を disabled にする）は作れない', async () => {
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'accounts/admin2'), { status: 'disabled' }));
    await assertFails(createProjectBatch(dbAs(env, 'admin2'), { uid: 'admin2', mutate: { project: { memberUids: [] } } }));
  });
  test('admin は既存の案件に requirements/current だけを作れない（案件作成のバッチだけ）', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'projects/p7'), { ...(await getDoc(doc(db, 'projects/p2'))).data(), siteUrlKey: 'p7.example.jp', siteUrl: 'https://p7.example.jp', memberUids: ['devC'], createdBy: 'admin1', ownerUid: 'admin1' });
    });
    const req = { schemaVersion: 1, answers: {}, answerMeta: {}, ...stamp('admin1') };
    await assertFails(setDoc(doc(dbAs(env, 'admin1'), 'projects/p7/requirements/current'), req));
    await assertFails(setDoc(doc(dbAs(env, 'admin1'), 'projects/p8/requirements/current'), req));
    // 開発者の従来の経路（アサインされた開発者は事後の案件で判定）は変わらない
    await assertSucceeds(setDoc(doc(dbAs(env, 'devC'), 'projects/p7/requirements/current'), { schemaVersion: 1, answers: {}, answerMeta: {}, ...stamp('devC') }));
  });
});

describe('siteKeys', () => {
  test('開発者・admin は鍵の有無を get できる（重複確認）', async () => {
    await assertSucceeds(getDoc(doc(dbAs(env, 'devA'), 'siteKeys/example.co.jp')));
    await assertSucceeds(getDoc(doc(dbAs(env, 'admin1'), 'siteKeys/not-exist.example')));
  });
  test('お客様は get できない・誰も一覧できない', async () => {
    await assertFails(getDoc(doc(dbAs(env, 'client1'), 'siteKeys/example.co.jp')));
    await assertFails(getDocs(collection(dbAs(env, 'devA'), 'siteKeys')));
  });
  test('既存の案件を指す鍵だけを作って URL を先取りする → 拒否', async () => {
    await assertFails(setDoc(doc(dbAs(env, 'devA'), 'siteKeys/squat.example.jp'), { projectId: 'p1', createdAt: serverTimestamp() }));
  });
  test('鍵の更新・削除 → 拒否', async () => {
    await assertFails(updateDoc(doc(dbAs(env, 'devA'), 'siteKeys/example.co.jp'), { projectId: 'p2' }));
    await assertFails(deleteDoc(doc(dbAs(env, 'devA'), 'siteKeys/example.co.jp')));
  });
});

describe('projects: update（基本情報・アサイン・アーカイブ。Low-2）', () => {
  const upd = (uid, data, pid = 'p1') => updateDoc(doc(dbAs(env, uid), `projects/${pid}`), data);
  test('アサインされた開発者は基本情報を変えられる（協力会社も）', async () => {
    await assertSucceeds(upd('devA', { siteName: '新しいサイト名', accent: '#15803D', ...stamp('devA') }));
    await assertSucceeds(upd('devB', { launchDate: Timestamp.fromDate(new Date('2027-01-01T03:00:00Z')), ...stamp('devB') }));
    await assertSucceeds(upd('devB', { launchDate: deleteField(), ...stamp('devB') }));
  });
  test('基本情報の検査: 41 文字の siteName・選択肢外の accent → 拒否', async () => {
    await assertFails(upd('devA', { siteName: 'あ'.repeat(41), ...stamp('devA') }));
    await assertFails(upd('devA', { accent: 'red', ...stamp('devA') }));
  });
  test('siteUrl / siteUrlKey / ownerUid / createdAt は変えられない', async () => {
    await assertFails(upd('devA', { siteUrl: 'https://changed.example.jp', ...stamp('devA') }));
    await assertFails(upd('devA', { siteUrlKey: 'changed.example.jp', ...stamp('devA') }));
    await assertFails(upd('devA', { ownerUid: 'devB', ...stamp('devA') }));
    await assertFails(upd('devA', { createdAt: serverTimestamp(), ...stamp('devA') }));
  });
  test('アサイン外の開発者・お客様・無効化された開発者は変えられない', async () => {
    await assertFails(upd('devC', { siteName: 'x', ...stamp('devC') }));
    await assertFails(upd('client1', { siteName: 'x', ...stamp('client1') }));
    await assertFails(upd('devOff', { siteName: 'x', ...stamp('devOff') }));
  });
  test('updatedAt / updatedBy を偽る → 拒否', async () => {
    await assertFails(upd('devA', { siteName: 'x', updatedAt: PAST, updatedBy: 'devA' }));
    await assertFails(upd('devA', { siteName: 'x', updatedAt: serverTimestamp(), updatedBy: 'devB' }));
    await assertFails(upd('devA', { siteName: 'x' }));
  });
  test('開発者は memberUids を変えられない（自分で他人を足す）', async () => {
    await assertFails(upd('devA', { memberUids: ['devA', 'devB', 'devOff', 'devC'], ...stamp('devA') }));
  });
  test('admin はアサインを変えられる（20 人まで）', async () => {
    await assertSucceeds(upd('admin1', { memberUids: ['devA', 'devC'], ...stamp('admin1') }));
    await assertSucceeds(upd('admin1', { memberUids: Array.from({ length: 20 }, (_, i) => `u${i}`), ...stamp('admin1') }));
  });
  test('admin のアサイン 21 人・list 以外 → 拒否', async () => {
    await assertFails(upd('admin1', { memberUids: Array.from({ length: 21 }, (_, i) => `u${i}`), ...stamp('admin1') }));
    await assertFails(upd('admin1', { memberUids: 'devA', ...stamp('admin1') }));
  });
  test('admin は基本情報・要件の状態を変えられない（§25-1）', async () => {
    await assertFails(upd('admin1', { siteName: 'x', ...stamp('admin1') }));
    await assertFails(upd('admin1', { 'requirements.status': 'approved', ...stamp('admin1') }));
  });
  test('Low-2: 開発者はアーカイブ・解除できる', async () => {
    await assertSucceeds(upd('devA', { archived: true, ...stamp('devA') }));
    await assertSucceeds(upd('devA', { archived: false, ...stamp('devA') }));
  });
  test('Low-2: admin の archived 書き込み → 拒否', async () => {
    await assertFails(upd('admin1', { archived: true, ...stamp('admin1') }));
  });
  test('archived が bool でない → 拒否', async () => {
    await assertFails(upd('devA', { archived: 'yes', ...stamp('devA') }));
  });
  test('アーカイブと基本情報を同時に変える（分岐の混在）→ 拒否', async () => {
    await assertFails(upd('devA', { archived: true, siteName: 'x', ...stamp('devA') }));
  });
  test('案件の削除は誰もできない', async () => {
    await assertFails(deleteDoc(doc(dbAs(env, 'admin1'), 'projects/p1')));
    await assertFails(deleteDoc(doc(dbAs(env, 'devA'), 'projects/p1')));
  });
});

// 相談（U3）で案件に consult が載っても、従来の更新がすべて通る（validProject の hasOnly に consult を足した回帰。LIVE_DASHBOARD_TASKS_CONSULT §2.3・§6）
describe('projects: consult を持つ案件の従来の更新（回帰）', () => {
  const CONSULT = { count: 3, lastAt: T0, lastSide: 'client', lastName: '顧客 一子' };
  const withConsult = async (reqState = 'draft') => {
    await seed(env, { reqState });
    await env.withSecurityRulesDisabled(async (ctx) => { await updateDoc(doc(ctx.firestore(), 'projects/p1'), { consult: CONSULT }); });
  };
  const upd = (uid, data) => updateDoc(doc(dbAs(env, uid), 'projects/p1'), data);
  test('開発者の基本情報の編集・アーカイブと解除', async () => {
    await withConsult();
    await assertSucceeds(upd('devA', { siteName: '新しいサイト名', ...stamp('devA') }));
    await assertSucceeds(upd('devB', { launchDate: deleteField(), ...stamp('devB') }));
    await assertSucceeds(upd('devA', { archived: true, ...stamp('devA') }));
    await assertSucceeds(upd('devA', { archived: false, ...stamp('devA') }));
  });
  test('admin のアサインの変更', async () => {
    await withConsult();
    await assertSucceeds(upd('admin1', { memberUids: ['devA', 'devC'], ...stamp('admin1') }));
  });
  test('確認依頼（submit）・差し戻し（withdraw）', async () => {
    await withConsult();
    await assertSucceeds(submitBatch(dbAs(env, 'devA')));
    await assertSucceeds(withdrawBatch(dbAs(env, 'devA')));
  });
  test('お客様の承認（approve）', async () => {
    await withConsult('analyzed');
    await assertSucceeds(approveBatch(dbAs(env, 'client1')));
  });
  test('従来の分岐で consult を書き換える → 拒否（基本情報・アサイン・アーカイブに混ぜる）', async () => {
    await withConsult();
    const fake = { ...CONSULT, lastSide: 'afro' };
    await assertFails(upd('devA', { siteName: '新しいサイト名', consult: fake, ...stamp('devA') }));
    await assertFails(upd('admin1', { memberUids: ['devA'], consult: fake, ...stamp('admin1') }));
    await assertFails(upd('devA', { archived: true, consult: fake, ...stamp('devA') }));
    await assertFails(upd('devA', { consult: deleteField(), ...stamp('devA') }));
  });
});

describe('既定の拒否', () => {
  test('定義していないコレクションは読み書きできない', async () => {
    await assertFails(getDoc(doc(dbAs(env, 'admin1'), 'secrets/x')));
    await assertFails(setDoc(doc(dbAs(env, 'admin1'), 'secrets/x'), { a: 1 }));
    await assertFails(setDoc(doc(dbAs(env, 'devA'), 'projects/p1/notes/x'), { a: 1 }));
  });
});
