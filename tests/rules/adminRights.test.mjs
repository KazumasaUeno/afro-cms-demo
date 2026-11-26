// 管理者に開発の全操作と代理承認（docs/design/ADMIN_FULL_RIGHTS_PLAN.md §2・§7、脅威モデル docs/reviews/2026-11-26-admin-full-rights-threat-model.md TEST-01〜07・09）。
// 既定の世界（fixtures.mjs seed）: p1 は devA・devB・devOff が担当（admin1 は担当に入っていない＝担当外）、お客様 client1 ／ p2 は devC、お客様 client2
// TEST-08 は tests/functions/ai-flow.test.mjs、TEST-10 は tests/rules/mutation.test.mjs
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { deleteDoc, runTransaction } from 'firebase/firestore';
import { createRulesEnv, readRules } from './guard.mjs';
import {
  ANSWERS, FULL_ANSWERS, PAST, PROPOSAL, PROXY_NOTE, USERS, approvalDoc, approveBatch, dbAs, doc, proxyApproveBatch, seed, serverTimestamp, setDoc, stamp, submitBatch, updateDoc, withdrawBatch, writeBatch,
} from './fixtures.mjs';
import { seedAi } from './aiFixtures.mjs';
import { MAX_EDITED_V3, MAX_GENERATED_V3, aiDraftDocV3, proposalV3 } from './aiFixturesV3.mjs';

let env;
before(async () => { env = await createRulesEnv(); });
after(async () => { await env?.clearFirestore(); await env?.cleanup(); });

const REQ = 'projects/p1/requirements/current';
/** undefined の項目を落とす（Firestore の SDK は undefined を送れない＝その項目が無い形を作る） */
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
const upd = (db, data, pid = 'p1') => updateDoc(doc(db, `projects/${pid}`), data);
function taskOf(uid, over = {}) {
  return { schemaVersion: 1, title: '問い合わせフォームの確認', page: 'サイト全体', assigneeUids: ['devA'], status: 'todo', createdAt: serverTimestamp(), createdBy: uid, ...stamp(uid), ...over };
}
const storedTask = { schemaVersion: 1, title: 'ヒーロー', page: 'トップ', assigneeUids: ['devA'], status: 'todo', createdAt: PAST, createdBy: 'devA', updatedAt: PAST, updatedBy: 'devA' };
async function seedTask() { await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'projects/p1/tasks/t1'), storedTask)); }
/** 相談の送信（メッセージ＋consult を 1 バッチ。consult の無い案件の 1 件目） */
function sendAs(db, uid, { side = 'afro', name = USERS[uid]?.name ?? uid } = {}) {
  const b = writeBatch(db);
  b.set(doc(db, 'projects/p1/messages/000001'), { schemaVersion: 1, seq: 1, text: '確認しました', side, authorUid: uid, authorName: name, at: serverTimestamp() });
  b.update(doc(db, 'projects/p1'), { consult: { count: 1, lastAt: serverTimestamp(), lastSide: side, lastName: name } });
  return b.commit();
}

// 開発の操作の一覧（uid と db を受けて書き込み）。prep は seed の状態
const OPS = {
  '回答の入力': { reqState: 'draft', run: (db, uid) => updateDoc(doc(db, REQ), { 'answers.q-target': '30〜40代', 'answerMeta.q-target': { by: 'afro', at: PAST }, ...stamp(uid) }) },
  '確認依頼（submit）': { reqState: 'draft', run: (db, uid) => submitBatch(db, { uid, mutate: USERS[uid] ? {} : { log: { ...approvalDoc('admin1', 'submit', 1, { answers: ANSWERS, proposal: PROPOSAL }), actorUid: uid } } }) },
  '差し戻し（withdraw）': { reqState: 'analyzed', run: (db, uid) => withdrawBatch(db, { uid, mutate: USERS[uid] ? {} : { log: { ...approvalDoc('admin1', 'withdraw', 1), actorUid: uid } } }) },
  '代理承認': { reqState: 'analyzed', run: (db, uid) => proxyApproveBatch(db, { uid, mutate: USERS[uid] ? {} : { log: { ...approvalDoc('admin1', 'approve', 1, { answers: ANSWERS, proposal: PROPOSAL, proxy: true, note: PROXY_NOTE }), actorUid: uid } } }) },
  '基本情報の変更': { reqState: 'draft', run: (db, uid) => upd(db, { siteName: '新しいサイト名', ...stamp(uid) }) },
  'アーカイブ': { reqState: 'draft', run: (db, uid) => upd(db, { archived: true, ...stamp(uid) }) },
  'タスクの作成': { reqState: 'draft', run: (db, uid) => setDoc(doc(db, 'projects/p1/tasks/new1'), taskOf(uid)) },
  'タスクの状態変更': { reqState: 'draft', task: true, run: (db, uid) => updateDoc(doc(db, 'projects/p1/tasks/t1'), { status: 'doing', ...stamp(uid) }) },
  '相談の返信（side afro）': { reqState: 'draft', run: (db, uid) => sendAs(db, uid) },
};
async function prep(op) { await seed(env, { reqState: op.reqState }); if (op.task) await seedTask(); }

describe('TEST-01: admin は担当外の案件で開発の全操作ができる', () => {
  for (const [name, op] of Object.entries(OPS)) {
    test(`admin1（担当外）: ${name} → 許可`, async () => {
      await prep(op);
      await assertSucceeds(op.run(dbAs(env, 'admin1'), 'admin1'));
    });
  }
  test('admin2（もう 1 人の admin）も submit できる・アーカイブの解除もできる', async () => {
    await seed(env);
    await assertSucceeds(submitBatch(dbAs(env, 'admin2'), { uid: 'admin2' }));
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'projects/p1'), { archived: true }));
    await assertSucceeds(upd(dbAs(env, 'admin2'), { archived: false, ...stamp('admin2') }));
  });
  test('admin が差し戻し → 回答を直す → 再 submit（revision 2）→ 代理承認（revision 2）まで通る', async () => {
    await seed(env, { reqState: 'analyzed' });
    const db = dbAs(env, 'admin1');
    await assertSucceeds(withdrawBatch(db, { uid: 'admin1' }));
    await assertSucceeds(updateDoc(doc(db, REQ), { 'answers.q-issue': '修正後の課題', 'answerMeta.q-issue': { by: 'afro', at: PAST }, ...stamp('admin1') }));
    const answers = { ...ANSWERS, 'q-issue': '修正後の課題' };
    await assertSucceeds(submitBatch(db, { uid: 'admin1', fromRev: 1, answers }));
    await assertSucceeds(proxyApproveBatch(db, { rev: 2, answers }));
  });
  test('admin がアーカイブすると相談は止まる（お客様も admin も送れない）', async () => {
    await seed(env);
    await assertSucceeds(upd(dbAs(env, 'admin1'), { archived: true, ...stamp('admin1') }));
    await assertFails(sendAs(dbAs(env, 'client1'), 'client1', { side: 'client' }));
    await assertFails(sendAs(dbAs(env, 'admin1'), 'admin1'));
  });
  test('担当 0 人の案件では admin もタスクを作れない（L-5・R-7）', async () => {
    await seed(env);
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'projects/p1'), { memberUids: [] }));
    await assertFails(setDoc(doc(dbAs(env, 'admin1'), 'projects/p1/tasks/new1'), taskOf('admin1')));
  });
});

describe('TEST-02: 担当外の開発者・協力会社・お客様・他案件のお客様・未ログインは拒否（T-01・T-02）', () => {
  const others = {
    devC: () => dbAs(env, 'devC'), devP2: () => dbAs(env, 'devP2'), client1: () => dbAs(env, 'client1'), client2: () => dbAs(env, 'client2'),
    unauth: () => env.unauthenticatedContext().firestore(),
  };
  for (const [name, op] of Object.entries(OPS)) {
    for (const [uid, db] of Object.entries(others)) {
      test(`${uid}: ${name} → 拒否`, async () => {
        await prep(op);
        await assertFails(op.run(db(), uid === 'unauth' ? 'nobody' : uid));
      });
    }
  }
});

describe('TEST-03: 無効化・メール不一致・未確認メールの admin は全分岐で拒否（T-03）', () => {
  const bad = {
    adminOff: () => dbAs(env, 'adminOff'),
    メール不一致: () => dbAs(env, 'admin1', { email: 'changed@afro.example' }),
    未確認メール: () => dbAs(env, 'admin1', { email_verified: false }),
  };
  for (const [name, op] of Object.entries(OPS)) {
    for (const [kind, db] of Object.entries(bad)) {
      test(`${kind}: ${name} → 拒否`, async () => {
        await prep(op);
        await assertFails(op.run(db(), kind === 'adminOff' ? 'adminOff' : 'admin1'));
      });
    }
  }
});

describe('TEST-04: 代理承認の形（T-04）', () => {
  const ok = approvalDoc('admin1', 'approve', 1, { answers: ANSWERS, proposal: PROPOSAL, proxy: true, note: PROXY_NOTE });
  const proj = (over = {}) => clean({ 'requirements.status': 'approved', 'requirements.approvedAt': serverTimestamp(), 'requirements.approvedBy': 'admin1', 'requirements.approvalId': 'requirements-r1-approve', 'requirements.approvedVia': 'proxy', ...stamp('admin1'), ...over });
  const allow = (name, opts) => test(`${name} → 許可`, async () => { await seed(env, { reqState: 'analyzed' }); await assertSucceeds(proxyApproveBatch(dbAs(env, 'admin1'), opts)); });
  const deny = (name, opts, reqState = 'analyzed') => test(`${name} → 拒否`, async () => { await seed(env, { reqState }); await assertFails(proxyApproveBatch(dbAs(env, 'admin1'), opts)); });
  allow('正しい形（proxy: true・note・side afro・actorRole admin・approvedVia proxy）', {});
  allow('note が 200 字ちょうど（前後の空白は数えない）', { note: ` ${'あ'.repeat(200)} ` });
  allow('note が 1 字', { note: '可' });
  test('トランザクションでも代理承認できる', async () => {
    await seed(env, { reqState: 'analyzed' });
    const db = dbAs(env, 'admin1');
    await assertSucceeds(runTransaction(db, async (tx) => {
      const r = await tx.get(doc(db, REQ));
      tx.update(doc(db, 'projects/p1'), proj());
      tx.set(doc(db, 'projects/p1/approvals/requirements-r1-approve'), { ...ok, answers: r.data().answers, proposal: r.data().proposal });
    }));
  });
  deny('proxy が無い', { mutate: { log: { ...ok, proxy: undefined } } });
  deny('proxy: false', { mutate: { log: { ...ok, proxy: false } } });
  deny("proxy: 'true'（文字列）", { mutate: { log: { ...ok, proxy: 'true' } } });
  deny('note が無い', { mutate: { log: { ...ok, note: undefined } } });
  deny('note が空', { note: '' });
  deny('note が空白だけ', { note: ' 　 ' });
  deny('note が 201 字', { note: 'あ'.repeat(201) });
  deny('note が文字列でない', { note: 123 });
  for (const code of [0x0a, 0x0d, 0x09, 0x00, 0x1f, 0x7f, 0x202a, 0x202e, 0x2066, 0x2069]) {
    deny(`note に U+${code.toString(16).toUpperCase().padStart(4, '0')}`, { note: `電話で確認${String.fromCharCode(code)}しました` });
  }
  deny("side: 'client'", { mutate: { log: { ...ok, side: 'client' } } });
  deny('actorUid を他人（admin2）', { mutate: { log: { ...ok, actorUid: 'admin2' } } });
  deny('actorName を他人', { mutate: { log: { ...ok, actorName: '管理 二郎' } } });
  deny('actorEmail を他人', { mutate: { log: { ...ok, actorEmail: 'admin2@afro.example' } } });
  deny('actorRole が無い', { mutate: { log: { ...ok, actorRole: undefined } } });
  deny("actorRole: 'developer'", { mutate: { log: { ...ok, actorRole: 'developer' } } });
  deny('at を過去日時', { mutate: { log: { ...ok, at: PAST } } });
  deny('写し（answers）を改変', { mutate: { log: { ...ok, answers: { ...ANSWERS, 'q-issue': '改変' } } } });
  deny('写し（proposal）を改変', { mutate: { log: { ...ok, proposal: { ...PROPOSAL, projectedScore: 100 } } } });
  deny('未知のキー', { mutate: { log: { ...ok, consentAt: PAST } } });
  deny('文書 ID が規則外', { mutate: { aid: 'requirements-r1-proxy' } });
  deny('approvedVia が無い（お客様の 4 キーの形）', { mutate: { project: proj({ 'requirements.approvedVia': undefined }) } });
  deny("approvedVia: 'client'", { mutate: { project: proj({ 'requirements.approvedVia': 'client' }) } });
  deny('approvedBy をお客様にする', { mutate: { project: proj({ 'requirements.approvedBy': 'client1' }) } });
  deny('approvedAt を過去日時', { mutate: { project: proj({ 'requirements.approvedAt': PAST }) } });
  deny('代理承認と同時に revision を変える', { mutate: { project: proj({ 'requirements.revision': 5 }) } });
  deny('代理承認と同時に基本情報を変える', { mutate: { project: proj({ siteName: '変更' }) } });
  deny('代理承認と同時に回答を変える', { mutate: { req: { 'answers.q-issue': '変更', ...stamp('admin1') } } });
  deny('記録だけ（状態を変えない）', { mutate: { skipProject: true } });
  deny('状態だけ（記録なし）', { mutate: { skipLog: true } });
  deny('draft のときの代理承認', {}, 'draft');
  test('requirements の approvedVia: proxy にお客様の形の記録（proxy なし・side client）を組み合わせる → 拒否（相互照合 §7-1）', async () => {
    await seed(env, { reqState: 'analyzed' });
    await assertFails(proxyApproveBatch(dbAs(env, 'admin1'), { mutate: { log: { ...ok, side: 'client', proxy: undefined, note: undefined } } }));
  });
  test('Firestore の undefined 除去が効いていること（proxy を落とした記録に proxy キーが無い）', () => {
    const log = { ...ok, proxy: undefined };
    for (const [k, v] of Object.entries(log)) if (v === undefined) delete log[k];
    assert.equal('proxy' in log, false);
  });
});

describe('TEST-05: お客様・開発者は代理の形を作れない（T-04）', () => {
  const okClient = approvalDoc('client1', 'approve', 1, { answers: ANSWERS, proposal: PROPOSAL });
  const denyC = (name, opts) => test(`お客様: ${name} → 拒否`, async () => { await seed(env, { reqState: 'analyzed' }); await assertFails(approveBatch(dbAs(env, 'client1'), opts)); });
  denyC('proxy: true を付ける', { mutate: { log: { ...okClient, proxy: true } } });
  denyC('note を付ける', { mutate: { log: { ...okClient, note: '承認します' } } });
  denyC("actorRole: 'admin' を名乗る", { mutate: { log: { ...okClient, actorRole: 'admin' } } });
  denyC("approvedVia: 'proxy' を付ける", { mutate: { project: { 'requirements.status': 'approved', 'requirements.approvedAt': serverTimestamp(), 'requirements.approvedBy': 'client1', 'requirements.approvalId': 'requirements-r1-approve', 'requirements.approvedVia': 'proxy', ...stamp('client1') } } });
  test("お客様: actorRole: 'client'（本人の役割）は許可（R-5 の任意キー）", async () => {
    await seed(env, { reqState: 'analyzed' });
    await assertSucceeds(approveBatch(dbAs(env, 'client1'), { mutate: { log: { ...okClient, actorRole: 'client' } } }));
  });
  test('お客様: 代理承認の形のバッチ → 拒否', async () => {
    await seed(env, { reqState: 'analyzed' });
    await assertFails(proxyApproveBatch(dbAs(env, 'client1'), { uid: 'client1', mutate: { log: approvalDoc('client1', 'approve', 1, { answers: ANSWERS, proposal: PROPOSAL, proxy: true, note: PROXY_NOTE, side: 'afro' }) } }));
  });
  test('担当の開発者: 代理承認（actorRole なし・admin を名乗る）→ どちらも拒否', async () => {
    await seed(env, { reqState: 'analyzed' });
    await assertFails(proxyApproveBatch(dbAs(env, 'devA'), { uid: 'devA' }));
    await assertFails(proxyApproveBatch(dbAs(env, 'devA'), { uid: 'devA', mutate: { log: approvalDoc('devA', 'approve', 1, { answers: ANSWERS, proposal: PROPOSAL, proxy: true, note: PROXY_NOTE, actorRole: 'admin' }) } }));
  });
  test("担当の開発者: submit・withdraw で actorRole: 'admin' を名乗る → 拒否／'developer' は許可", async () => {
    await seed(env);
    await assertFails(submitBatch(dbAs(env, 'devA'), { mutate: { log: approvalDoc('devA', 'submit', 1, { answers: ANSWERS, proposal: PROPOSAL, actorRole: 'admin' }) } }));
    await assertSucceeds(submitBatch(dbAs(env, 'devA'), { mutate: { log: approvalDoc('devA', 'submit', 1, { answers: ANSWERS, proposal: PROPOSAL, actorRole: 'developer' }) } }));
    await assertFails(withdrawBatch(dbAs(env, 'devA'), { mutate: { log: approvalDoc('devA', 'withdraw', 1, { actorRole: 'admin' }) } }));
  });
  test('admin の submit・withdraw で actorRole が無い／developer → 拒否（admin の文書は必須）', async () => {
    await seed(env);
    await assertFails(submitBatch(dbAs(env, 'admin1'), { uid: 'admin1', mutate: { log: clean(approvalDoc('admin1', 'submit', 1, { answers: ANSWERS, proposal: PROPOSAL, actorRole: undefined })) } }));
    await assertFails(submitBatch(dbAs(env, 'admin1'), { uid: 'admin1', mutate: { log: approvalDoc('admin1', 'submit', 1, { answers: ANSWERS, proposal: PROPOSAL, actorRole: 'developer' }) } }));
    await seed(env, { reqState: 'analyzed' });
    await assertFails(withdrawBatch(dbAs(env, 'admin1'), { uid: 'admin1', mutate: { log: clean(approvalDoc('admin1', 'withdraw', 1, { actorRole: undefined })) } }));
  });
});

describe('TEST-06: 二重承認・上書きの排他（T-05）', () => {
  test('お客様の承認の後の代理承認 → 拒否', async () => {
    await seed(env, { reqState: 'analyzed' });
    await assertSucceeds(approveBatch(dbAs(env, 'client1')));
    await assertFails(proxyApproveBatch(dbAs(env, 'admin1')));
  });
  test('代理承認の後のお客様の承認・2 回目の代理承認 → 拒否', async () => {
    await seed(env, { reqState: 'analyzed' });
    await assertSucceeds(proxyApproveBatch(dbAs(env, 'admin1')));
    await assertFails(approveBatch(dbAs(env, 'client1')));
    await assertFails(proxyApproveBatch(dbAs(env, 'admin2'), { uid: 'admin2' }));
  });
  test('代理承認の記録の update・delete・上書きは admin を含む全員が拒否', async () => {
    await seed(env, { reqState: 'analyzed' });
    await assertSucceeds(proxyApproveBatch(dbAs(env, 'admin1')));
    for (const uid of ['admin1', 'admin2', 'devA', 'client1']) {
      const db = dbAs(env, uid);
      const ref = doc(db, 'projects/p1/approvals/requirements-r1-approve');
      await assertFails(updateDoc(ref, { note: '書き換え' }));
      await assertFails(deleteDoc(ref));
      await assertFails(setDoc(ref, approvalDoc('client1', 'approve', 1, { answers: ANSWERS, proposal: PROPOSAL })));
    }
  });
  test('代理承認の後、admin は approved を draft・analyzed に戻せない・approvedVia を消せない', async () => {
    await seed(env, { reqState: 'analyzed' });
    const db = dbAs(env, 'admin1');
    await assertSucceeds(proxyApproveBatch(db));
    await assertFails(upd(db, { 'requirements.status': 'analyzed', ...stamp('admin1') }));
    await assertFails(withdrawBatch(db, { uid: 'admin1' }));
    await assertFails(upd(db, { 'requirements.approvedVia': 'client', ...stamp('admin1') }));
  });
});

describe('TEST-07: admin の相談の side（T-07）', () => {
  test("admin の side: 'client' → 拒否／'afro' → 許可", async () => {
    await seed(env);
    await assertFails(sendAs(dbAs(env, 'admin1'), 'admin1', { side: 'client' }));
    await assertSucceeds(sendAs(dbAs(env, 'admin1'), 'admin1', { side: 'afro' }));
  });
  test('admin が名前を偽る → 拒否', async () => {
    await seed(env);
    await assertFails(sendAs(dbAs(env, 'admin1'), 'admin1', { name: USERS.client1.name }));
  });
});

// ================= TEST-09: 1 リクエスト 1000 式の上限の余裕（最大の payload。方法は proposalV3.test.mjs の計測と同じ） =================
// 経路の関数の return の直後に詰め物（pad10() = 比較 10 個）を k 個足した Rules で、通る最大の k を数える。基準は trivial な create
describe('TEST-09: 計測（admin の最大の submit・代理承認）', () => {
  const PAD = '    function pad10() { return 1 == 1 && 2 == 2 && 3 == 3 && 4 == 4 && 5 == 5 && 6 == 6 && 7 == 7 && 8 == 8 && 9 == 9 && 10 == 10; }\n';
  const pads = (k) => Array.from({ length: k }, () => 'pad10() && ').join('');
  function probeRules(fn, inject) {
    let r = readRules().replace(/\r\n/g, '\n');
    r = r.replace('    match /projects/{pid} {', `    match /probe/{id} { allow create: if authed() && ${inject}true; }\n    match /projects/{pid} {`);
    if (!fn) return PAD.length && r.replace('    function authed()', PAD + '    function authed()');
    const anchor = `    function ${fn}(`;
    assert.equal(r.split(anchor).length - 1, 1, fn);
    r = r.replace(anchor, PAD + anchor);
    const re = new RegExp(`(function ${fn}\\([^)]*\\) \\{[\\s\\S]*?return)\\b`);
    assert.ok(re.test(r), fn);
    return r.replace(re, `$1 ${inject}`);
  }
  const seedSubmit = (e) => seedAi(e, { aiDraft: aiDraftDocV3({ generated: MAX_GENERATED_V3, edited: MAX_EDITED_V3 }), answers: FULL_ANSWERS });
  const seedApprove = (e) => seedAi(e, { reqState: 'analyzed', proposal: proposalV3(MAX_GENERATED_V3), answers: FULL_ANSWERS });
  const submitV3 = (e, uid) => submitBatch(dbAs(e, uid), { uid, answers: FULL_ANSWERS, proposal: proposalV3(MAX_GENERATED_V3) });
  const PATHS = {
    trivial: { fn: null, seed: (e) => seed(e), run: (e) => setDoc(doc(dbAs(e, 'admin1'), 'probe/x'), { a: 1 }) },
    'dev submit（requirements: proposalV3Ok）': { fn: 'proposalV3Ok', seed: seedSubmit, run: (e) => submitV3(e, 'devA') },
    'admin submit（requirements: proposalV3Ok）': { fn: 'proposalV3Ok', seed: seedSubmit, run: (e) => submitV3(e, 'admin1') },
    'admin submit（projects: devTransition）': { fn: 'devTransition', seed: seedSubmit, run: (e) => submitV3(e, 'admin1') },
    'admin submit（approvals: submitOrWithdrawOk）': { fn: 'submitOrWithdrawOk', seed: seedSubmit, run: (e) => submitV3(e, 'admin1') },
    'client approve（approvals: approveOk）': { fn: 'approveOk', seed: seedApprove, run: (e) => approveBatch(dbAs(e, 'client1'), { answers: FULL_ANSWERS, proposal: proposalV3(MAX_GENERATED_V3) }) },
    'client approve（projects: clientApprove）': { fn: 'clientApprove', seed: seedApprove, run: (e) => approveBatch(dbAs(e, 'client1'), { answers: FULL_ANSWERS, proposal: proposalV3(MAX_GENERATED_V3) }) },
    'admin 代理承認（approvals: proxyApproveOk）': { fn: 'proxyApproveOk', seed: seedApprove, run: (e) => proxyApproveBatch(dbAs(e, 'admin1'), { answers: FULL_ANSWERS, proposal: proposalV3(MAX_GENERATED_V3), note: 'あ'.repeat(200) }) },
    'admin 代理承認（projects: adminProxyApprove）': { fn: 'adminProxyApprove', seed: seedApprove, run: (e) => proxyApproveBatch(dbAs(e, 'admin1'), { answers: FULL_ANSWERS, proposal: proposalV3(MAX_GENERATED_V3), note: 'あ'.repeat(200) }) },
  };
  async function passes(p, k) {
    const e = await createRulesEnv({ rules: probeRules(p.fn, pads(k)) });
    try { await p.seed(e); return await p.run(e).then(() => true, () => false); } finally { await e.cleanup(); }
  }
  async function maxK(p, hi = 20) {
    if (!(await passes(p, 0))) return -1;
    let lo = 0;
    while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (await passes(p, mid)) lo = mid; else hi = mid - 1; }
    return lo;
  }
  test('最大の payload の admin の submit・代理承認は 1000 式の上限に 20% 以上の余裕がある', { timeout: 900_000 }, async () => {
    const res = {};
    for (const [name, p] of Object.entries(PATHS)) res[name] = await maxK(p);
    const per = 1000 / (res.trivial + 1);
    for (const [name, k] of Object.entries(res)) console.log(`[measure] ${name}: pad10 ${k} 個（余裕 ≒ ${(k * per).toFixed(0)} 式・${(k * per / 10).toFixed(0)}%）`);
    for (const [name, k] of Object.entries(res)) {
      if (name === 'trivial') continue;
      assert.ok(k >= 0, `${name} が詰め物なしで通らない`);
      assert.ok(k * per >= 200, `${name} の式の余裕が 20% 未満（pad10 ${k} 個）`);
    }
  });
  after(async () => { const e = await createRulesEnv(); await e.cleanup(); });
});
