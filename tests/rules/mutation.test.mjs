// 変異テスト（BACKEND_FIREBASE.md §28.10 C-1・C-2）。
// C-1: 1 条件だけ外した Rules で同じ攻撃を流し、元の Rules＝拒否／変異＝許可 を確かめる。
//      → 「その条件が拒否の原因」であること（式数の上限や別の条件で偶然拒否されているのではないこと）を示す。
// C-2: M-4 の 3 経路は、validAnswers / validProposal を `is map` に軽くした Rules（1000 式の上限に当たらない）でも拒否されること。
//      M-4 の条件を外しても拒否されるので、拒否の原因は requirements/current の update の hasOnly 分岐（回答だけ／提案だけ）と
//      proposalRevision の一致。M-4 の条件そのものは多重防御として firestore.rules に残す（このテストは Rules を変えない）。
// 拒否の理由をエミュレータのエラー文言では判定しない（文言は API ではない）。判定は assertFails / assertSucceeds の対だけ。
// Rules の差し替えは同じ demo- プロジェクトの全体に効くので、環境は 1 つずつ作って片付ける（test-rules.mjs は 1 ファイルずつ順に実行）。
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { createRulesEnv, readRules } from './guard.mjs';
import {
  ANSWERS, PROPOSAL, T0, approvalDoc, approveBatch, claimAccount, claimBatch, dbAs, doc, inviteDoc, seed, serverTimestamp, stamp, submitBatch, updateDoc, writeBatch,
} from './fixtures.mjs';

const BASE = readRules();

/** src の中で from がちょうど 1 回出ることを確かめてから置き換える（Rules の書き換えで変異が黙って無効にならないように） */
function mutate(src, from, to) {
  const n = src.split(from).length - 1;
  if (n !== 1) throw new Error(`変異のアンカーが ${n} 件（1 件であるべき）: ${from.slice(0, 100)}`);
  const out = src.replace(from, () => to);
  if (out === src) throw new Error(`変異で Rules が変わりませんでした: ${from.slice(0, 100)}`);
  return out;
}

/** 関数の本体を `return p is map;` に置き換える（関数が見つからなければ throw） */
function lighten(src, fn) {
  const re = new RegExp(`function ${fn}\\((\\w+)\\) \\{[\\s\\S]*?\\r?\\n    \\}\\r?\\n`);
  const m = re.exec(src);
  if (!m) throw new Error(`軽量化の対象 ${fn} が見つかりません`);
  const out = src.replace(re, () => `function ${fn}(${m[1]}) { return ${m[1]} is map; }\n`);
  if (out === src || !out.includes(`function ${fn}(${m[1]}) { return ${m[1]} is map; }`)) throw new Error(`${fn} を軽量化できませんでした`);
  return out;
}
const lightRules = (src) => lighten(lighten(src, 'validAnswers'), 'validProposal');

/** rules で環境を作り、fn(env) を実行して必ず片付ける */
async function withRules(rules, fn) {
  const env = await createRulesEnv({ rules });
  try { return await fn(env); } finally { await env.clearFirestore(); await env.cleanup(); }
}

const asNew = (env, uid, email) => env.authenticatedContext(uid, { email, email_verified: true }).firestore();
const NEWDEV_INV = inviteDoc({ role: 'developer', name: '新人 開発', affiliation: 'partner', partnerCompany: '協力会社Z', devRole: 'QA' });
const NEWCLIENT_INV = inviteDoc({ role: 'client', name: '新規 顧客', company: '株式会社テスト', projectId: 'p1' });
const REQ = 'projects/p1/requirements/current';

// ---- 攻撃（env を受け取り、書き込みの Promise を返す）----
const attacks = {
  m1Name: async (env) => { await seed(env); return claimBatch(asNew(env, 'u-dev', 'newdev@afro.example'), { uid: 'u-dev', email: 'newdev@afro.example', account: claimAccount('u-dev', NEWDEV_INV, 'newdev@afro.example', { name: '別人の名前' }) }); },
  m1Company: async (env) => { await seed(env); return claimBatch(asNew(env, 'u-cli', 'newclient@customer.example'), { uid: 'u-cli', email: 'newclient@customer.example', account: claimAccount('u-cli', NEWCLIENT_INV, 'newclient@customer.example', { company: '偽の会社' }) }); },
  m1Role: async (env) => { await seed(env); return claimBatch(asNew(env, 'u-dev', 'newdev@afro.example'), { uid: 'u-dev', email: 'newdev@afro.example', account: claimAccount('u-dev', NEWDEV_INV, 'newdev@afro.example', { role: 'admin' }) }); },
  m2AnalyzedAt: async (env) => {
    await seed(env, { reqState: 'analyzed' });
    return approveBatch(dbAs(env, 'client1'), { mutate: { project: { 'requirements.status': 'approved', 'requirements.approvedAt': serverTimestamp(), 'requirements.approvedBy': 'client1', 'requirements.approvalId': 'requirements-r1-approve', 'requirements.analyzedAt': serverTimestamp(), ...stamp('client1') } } });
  },
  m3SubmitSideClient: async (env) => { await seed(env); return submitBatch(dbAs(env, 'devA'), { mutate: { log: { ...approvalDoc('devA', 'submit', 1, { answers: ANSWERS, proposal: PROPOSAL }), side: 'client' } } }); },
  m3DevApprove: async (env) => { await seed(env, { reqState: 'analyzed' }); return approveBatch(dbAs(env, 'devA'), { uid: 'devA', mutate: { log: { ...approvalDoc('devA', 'approve', 1, { answers: ANSWERS, proposal: PROPOSAL }), side: 'client' } } }); },
  m5DisableAdmin: async (env) => { await seed(env); return updateDoc(doc(dbAs(env, 'admin1'), 'accounts/admin2'), { status: 'disabled', disabledAt: serverTimestamp(), ...stamp('admin1') }); },
  m5RenameAdmin: async (env) => { await seed(env); return updateDoc(doc(dbAs(env, 'admin1'), 'accounts/admin2'), { name: '乗っ取り', ...stamp('admin1') }); },
  // M-4 の 3 経路
  m4Sec4: async (env) => { await seed(env); return submitBatch(dbAs(env, 'devA'), { mutate: { req: { proposal: PROPOSAL, proposalRevision: 1, 'answers.q-issue': '直前に変更', ...stamp('devA') } } }); },
  m4TwoReqWrites: async (env) => {
    await seed(env); const db = dbAs(env, 'devA'); const b = writeBatch(db);
    b.update(doc(db, 'projects/p1'), { requirements: { status: 'analyzed', revision: 1, analyzedAt: serverTimestamp() }, ...stamp('devA') });
    b.update(doc(db, REQ), { 'answers.q-issue': '直前に変更', ...stamp('devA') });
    b.update(doc(db, REQ), { proposal: PROPOSAL, proposalRevision: 1, ...stamp('devA') });
    b.set(doc(db, 'projects/p1/approvals/requirements-r1-submit'), approvalDoc('devA', 'submit', 1, { answers: { ...ANSWERS, 'q-issue': '直前に変更' }, proposal: PROPOSAL }));
    return b.commit();
  },
  m4AnswersOnlyTransition: async (env) => {
    await seed(env); const db = dbAs(env, 'devA'); const b = writeBatch(db);
    b.update(doc(db, 'projects/p1'), { requirements: { status: 'analyzed', revision: 1, analyzedAt: serverTimestamp() }, ...stamp('devA') });
    b.update(doc(db, REQ), { 'answers.q-issue': '直前に変更', ...stamp('devA') });
    b.set(doc(db, 'projects/p1/approvals/requirements-r1-submit'), approvalDoc('devA', 'submit', 1, { answers: { ...ANSWERS, 'q-issue': '直前に変更' }, proposal: PROPOSAL }));
    return b.commit();
  },
  // 対照（軽量化した Rules が「何でも拒否」になっていないこと）
  okSubmit: async (env) => { await seed(env); return submitBatch(dbAs(env, 'devA')); },
  okTwoDraftWrites: async (env) => {
    await seed(env); const db = dbAs(env, 'devA'); const b = writeBatch(db);
    b.update(doc(db, REQ), { 'answers.q-issue': 'x1', ...stamp('devA') });
    b.update(doc(db, REQ), { 'answers.q-target': 'x2', 'answerMeta.q-target': { by: 'afro', at: T0 }, ...stamp('devA') });
    return b.commit();
  },
};

// ---- 変異（1 条件だけ外す。アンカーが無ければ throw）----
const M = {
  m1Name: () => mutate(BASE, '&& d.role == before.role && d.name == before.name', '&& d.role == before.role'),
  m1Company: () => mutate(BASE, "&& optEq(d, before, 'company') && optEq(d, before, 'projectId')", "&& optEq(d, before, 'projectId')"),
  m1Role: () => mutate(BASE, '&& d.role == before.role && d.name == before.name', '&& d.name == before.name'),
  m2AnalyzedAt: () => mutate(BASE, "&& a.diff(b).affectedKeys().hasOnly(['status','approvedAt','approvedBy','approvalId'])", ''),
  m3SubmitSideClient: () => mutate(BASE, "return actorOk(d, acc) && d.side == 'afro' && (", 'return actorOk(d, acc) && ('),
  // 承認（projUpdateOk / apprCreateOk の r == 'client'）を開発者にも開く
  m3DevApprove: () => mutate(
    mutate(BASE,
      "|| (r == 'client' && a.projectId == pid && ch.hasOnly(['requirements','updatedAt','updatedBy']) && clientApprove(pid));",
      "|| (((r == 'client' && a.projectId == pid) || mine) && ch.hasOnly(['requirements','updatedAt','updatedBy']) && clientApprove(pid));"),
    "return (r == 'client' && a.projectId == pid && approveOk(pid, aid, a))",
    "return (((r == 'client' && a.projectId == pid) || r == 'developer') && approveOk(pid, aid, a))"),
  m5: () => mutate(BASE, "&& resource.data.role != 'admin'", ''),
  m4: () => mutate(BASE, "(before.requirements.status == 'draft' && after.requirements.status == 'draft'", "(before.requirements.status == 'draft'"),
};

describe('C-1: 変異テスト（元＝拒否／1 条件を外した変異＝許可）', () => {
  const pair = (name, attack, mutant) => test(name, async () => {
    const rules = mutant(); // アンカーが無ければここで落ちる
    assert.notEqual(rules, BASE);
    await withRules(BASE, async (env) => { await assertFails(attack(env)); });
    await withRules(rules, async (env) => { await assertSucceeds(attack(env)); });
  });
  pair('M-1 claim で name を変える ← d.name == before.name', attacks.m1Name, M.m1Name);
  pair("M-1 claim で company を変える ← optEq(d, before, 'company')", attacks.m1Company, M.m1Company);
  pair('M-1 claim で role=admin にする ← d.role == before.role', attacks.m1Role, M.m1Role);
  pair('M-2 承認と同時に analyzedAt を変える ← affectedKeys().hasOnly(4 キー)', attacks.m2AnalyzedAt, M.m2AnalyzedAt);
  pair("M-3 submit ログの side を client にする ← d.side == 'afro'", attacks.m3SubmitSideClient, M.m3SubmitSideClient);
  pair("M-3 開発者が承認バッチを書く ← projUpdateOk / apprCreateOk の r == 'client'", attacks.m3DevApprove, M.m3DevApprove);
  pair("M-5 admin が admin を無効化する ← resource.data.role != 'admin'", attacks.m5DisableAdmin, M.m5);
  pair("M-5 admin が admin を改名する ← resource.data.role != 'admin'", attacks.m5RenameAdmin, M.m5);
});

describe('C-2: M-4 の 3 経路は軽量化した Rules（式数の上限に当たらない）でも拒否', () => {
  const m4Paths = [
    ['SEC-4: 1 回の update で proposal＋answers', attacks.m4Sec4],
    ['同じバッチで requirements を 2 回 update（回答→提案）', attacks.m4TwoReqWrites],
    ['回答だけ update＋遷移（提案を書かない）', attacks.m4AnswersOnlyTransition],
  ];
  test('軽量化は validAnswers / validProposal を置き換えている（アンカー確認）', () => {
    const light = lightRules(BASE);
    assert.match(light, /function validAnswers\(\w+\) \{ return \w+ is map; \}/);
    assert.match(light, /function validProposal\(\w+\) \{ return \w+ is map; \}/);
    assert.ok(!/function validProposal\(\w+\) \{\s*return \w+ is map && /.test(light));
  });
  test('対照: 軽量化した Rules でも正規の submit と draft の 2 回 update は通る', async () => {
    for (const rules of [lightRules(BASE), lightRules(M.m4())]) {
      await withRules(rules, async (env) => {
        await assertSucceeds(attacks.okSubmit(env));
        await assertSucceeds(attacks.okTwoDraftWrites(env));
      });
    }
  });
  for (const [name, attack] of m4Paths) {
    test(`${name} → 軽量化 Rules でも、さらに M-4 の条件を外しても拒否`, async () => {
      await withRules(lightRules(BASE), async (env) => { await assertFails(attack(env)); });
      await withRules(lightRules(M.m4()), async (env) => { await assertFails(attack(env)); });
    });
  }
});
