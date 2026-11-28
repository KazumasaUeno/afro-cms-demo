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
import { readFileSync } from 'node:fs';
import { getDoc } from 'firebase/firestore';
import { AI_PATH, EDITED, GENERATED, MAX_EDITED, MAX_GENERATED, aiDraftDoc, proposalV2, seedAi } from './aiFixtures.mjs';
import {
  ANSWERS, PROPOSAL, PROXY_NOTE, T0, USERS, approvalDoc, approveBatch, claimAccount, claimBatch, dbAs, doc, inviteDoc, proxyApproveBatch, seed, serverTimestamp, setDoc, stamp, submitBatch, updateDoc, writeBatch,
} from './fixtures.mjs';
import { SCHED_DATES, SCHED_NOTE, SCHED_WBS, scheduleSeed, schedLogDoc, wbsWithDone } from './fixtures.mjs';
import { SITE_NOTE, siteHash, siteLogDoc, sitemapSeed } from './fixtures.mjs';

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
  // 0.47.0: 関数が作っていない uid（Console 追加・招待前の登録）で、写しは正しく受け取る
  provisionedOther: async (env) => { await seed(env); return claimBatch(asNew(env, 'u-console', 'newdev@afro.example'), { uid: 'u-console', email: 'newdev@afro.example', account: claimAccount('u-console', NEWDEV_INV, 'newdev@afro.example') }); },
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
  // claimOk と招待の受け取り更新の両方から provisionedUid の照合を外す（片方だけでは、もう片方が拒否する＝多重防御）
  provisioned: () => mutate(mutate(BASE, "&& before.get('provisionedUid', null) == uid", ''), "&& resource.data.get('provisionedUid', null) == request.auth.uid", ''),
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
  m4: () => mutate(BASE, "&& before.requirements.status == 'draft' && after.requirements.status == 'draft'", "&& before.requirements.status == 'draft'"),
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
  pair("0.47.0 関数が作っていない uid で受け取る ← provisionedUid == uid（claimOk・招待の更新）", attacks.provisionedOther, M.provisioned);
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

// ================= AI 下書き・提案 v2（実装計画 §4 U1。MEDIUM-3 の定数の食い違い・submit v2 の変異） =================
// 代替 F-a により edited の上限は Rules に無い（callable saveAiDraftEdits が検査）。ここで照合するのは
// ①Rules の v2 の等式のキー ⇔ src/types/aiDraft.ts の ProposalV2 ②aiDrafts・aiUsage がクライアントから書けないこと（F-a のアンカー）
// ③テスト用の最大値（aiFixtures）⇔ AI_DRAFT_LIMITS ④列挙（分野・根拠キー）⇔ Rules の選択肢・質問 ID
const AI_TS = readFileSync(new URL('../../src/types/aiDraft.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const RULES_LF = BASE.replace(/\r\n/g, '\n');
const NL = BASE.includes('\r\n') ? '\r\n' : '\n';

/** `export const NAME = [...] as const;` の文字列要素 */
function tsStringList(name) {
  const m = new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const;`).exec(AI_TS);
  if (!m) throw new Error(`aiDraft.ts に ${name} がありません`);
  return [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]);
}
function tsLimits() {
  const m = /export const AI_DRAFT_LIMITS = \{([\s\S]*?)\} as const;/.exec(AI_TS);
  if (!m) throw new Error('aiDraft.ts に AI_DRAFT_LIMITS がありません');
  return Object.fromEntries([...m[1].matchAll(/^\s+(\w+): (\d+),/gm)].map((x) => [x[1], Number(x[2])]));
}
function tsInterfaceKeys(name) {
  const m = new RegExp(`export interface ${name}(?: extends [\\w, ]+)? \\{([\\s\\S]*?)\\n\\}`).exec(AI_TS);
  if (!m) throw new Error(`aiDraft.ts に interface ${name} がありません`);
  return [...m[1].matchAll(/^ {2}(\w+)\??:/gm)].map((x) => x[1]);
}
function rulesFn(name) {
  const m = new RegExp(`function ${name}\\(([\\w, ]*)\\) \\{([\\s\\S]*?)\\n    \\}\\n`).exec(RULES_LF);
  if (!m) throw new Error(`firestore.rules に function ${name} がありません`);
  return m[2];
}
const quoted = (body) => [...body.matchAll(/'([^']*)'/g)].map((x) => x[1]);
const allowsIn = (block) => [...block.matchAll(/allow ([\w, ]+):\s*if ([^;]+);/g)].map((x) => [x[1].trim(), x[2].trim()]);

describe('AI: 定数・形の食い違い（Rules ⇔ src/types/aiDraft.ts ⇔ テストの最大値）', () => {
  test('Rules の v2 の等式のキー ＝ ProposalV2 のキー（version＋サーバー欄＋edited の 3 欄。flags は含めない）', () => {
    const lit = /p == \{([\s\S]*?)\};/.exec(rulesFn('proposalV2Ok'));
    assert.ok(lit, 'proposalV2Ok にマップリテラルの等式がありません');
    const ruleKeys = [...lit[1].matchAll(/'(\w+)':/g)].map((x) => x[1]).sort();
    const tsKeys = ['version', ...tsInterfaceKeys('ProposalV2ServerFields'), ...tsInterfaceKeys('AiEditable')].sort();
    assert.deepEqual(ruleKeys, tsKeys);
    assert.ok(!ruleKeys.includes('flags'));
    assert.deepEqual(Object.keys(proposalV2()).sort(), tsKeys, 'aiFixtures.proposalV2 の形も一致');
    assert.deepEqual(tsInterfaceKeys('AiEditable').sort(), ['draft', 'points', 'summary']);
  });
  test('F-a: aiDrafts はクライアントから作成・更新・削除できない／aiUsage は admin の読み取りだけ', () => {
    const m = /match \/aiDrafts\/\{did\} \{([\s\S]*?)\n {6}\}/.exec(RULES_LF);
    assert.ok(m, 'aiDrafts の match がありません');
    assert.deepEqual(allowsIn(m[1]), [['get, list', 'isAdmin() || assigned(pid)'], ['create, update, delete', 'false']]);
    const u = /match \/aiUsage\/\{ym\} \{([\s\S]*?)\n {4}\}/.exec(RULES_LF);
    assert.ok(u, 'aiUsage の match がありません');
    assert.deepEqual(allowsIn(u[1]), [['get, list', 'isAdmin()'], ['write', 'false']]);
  });
  test('テストの最大の payload（aiFixtures）＝ AI_DRAFT_LIMITS（U2 の callable テストが同じ最大値を使う）', () => {
    const L = tsLimits();
    assert.deepEqual(Object.keys(L).sort(), ['discardLog', 'draftField', 'evidence', 'openQuestion', 'openQuestions', 'pointDetail', 'pointId', 'pointImpact', 'pointTitle', 'points', 'siteCheckItems', 'summary']);
    const len = (s) => [...s].length;
    assert.equal(len(MAX_EDITED.summary), L.summary);
    assert.equal(MAX_EDITED.points.length, L.points);
    for (const p of MAX_EDITED.points) {
      assert.equal(len(p.id), L.pointId); assert.equal(len(p.title), L.pointTitle);
      assert.equal(len(p.detail), L.pointDetail); assert.equal(len(p.impact), L.pointImpact);
      assert.equal(p.evidence.length, L.evidence);
    }
    for (const k of ['goal', 'target', 'contents', 'features', 'nonFunctional', 'operation', 'schedule']) assert.equal(len(MAX_EDITED.draft[k]), L.draftField, k);
    assert.equal(MAX_EDITED.draft.openQuestions.length, L.openQuestions);
    for (const q of MAX_EDITED.draft.openQuestions) assert.equal(len(q), L.openQuestion);
    assert.equal(MAX_GENERATED.siteCheck.items.length, L.siteCheckItems);
    assert.deepEqual(Object.keys(MAX_EDITED.draft).sort(), tsInterfaceKeys('ProposalV2Draft').sort());
    assert.deepEqual(Object.keys(MAX_EDITED.points[0]).sort(), tsInterfaceKeys('ProposalV2Point').sort());
  });
  test('列挙: 分野 ⊇ Rules の improveOptions()、根拠キー ＝ 送る質問 ID＋基本チェックのキー、送る質問 ID ⊂ Rules の質問 ID（q-infra・q-dns-* を含まない）', () => {
    const areas = tsStringList('AI_POINT_AREAS');
    for (const o of quoted(/function improveOptions\(\) \{ return (\[[^\]]*\]); \}/.exec(RULES_LF)[1])) assert.ok(areas.includes(o), `分野に ${o} がありません`);
    const sent = tsStringList('AI_SENT_QUESTION_IDS');
    const site = tsStringList('AI_SITE_CHECK_KEYS');
    assert.match(AI_TS, /export const AI_EVIDENCE_KEYS = \[\.\.\.AI_SENT_QUESTION_IDS, \.\.\.AI_SITE_CHECK_KEYS\] as const;/);
    assert.equal(new Set([...sent, ...site]).size, sent.length + site.length, '根拠キーが重複');
    const ruleQ = quoted(/a\.keys\(\)\.hasOnly\(\[([^\]]*)\]\)/.exec(RULES_LF)[1]);
    for (const id of sent) assert.ok(ruleQ.includes(id), `送る質問 ${id} が Rules の質問 ID にありません`);
    for (const id of ['q-infra', 'q-dns-owner', 'q-dns-switch', 'q-dns-note']) assert.ok(!sent.includes(id), `${id} は送らない（設計 §4）`);
    for (const k of [...MAX_EDITED.points, ...EDITED.points].flatMap((p) => p.evidence)) assert.ok([...sent, ...site].includes(k), `fixtures の根拠 ${k} が許可リスト外`);
    for (const it of MAX_GENERATED.siteCheck.items) assert.ok(site.includes(it.key));
  });
});

describe('AI: submit v2 ・aiDrafts の変異テスト（元＝拒否／1 条件を外した変異＝許可）', () => {
  const pair = (name, attack, mutant) => test(name, async () => {
    const rules = mutant();
    assert.notEqual(rules, BASE);
    await withRules(BASE, async (env) => { await assertFails(attack(env)); });
    await withRules(rules, async (env) => { await assertSucceeds(attack(env)); });
  });
  pair("state=='failed' の下書きで submit ← ai.state == 'ready'",
    async (env) => { await seedAi(env, { aiDraft: aiDraftDoc({ state: 'failed' }) }); return submitBatch(dbAs(env, 'devA'), { proposal: proposalV2() }); },
    () => mutate(BASE, "return ai.state == 'ready'", 'return true'));
  pair("siteCheck を偽造して submit ← 'siteCheck': g.siteCheck（サーバー欄の一致）",
    async (env) => { await seedAi(env); return submitBatch(dbAs(env, 'devA'), { proposal: { ...proposalV2(), siteCheck: { ...GENERATED.siteCheck, passed: 10 } } }); },
    () => mutate(BASE, "'siteCheck': g.siteCheck", "'siteCheck': p.siteCheck"));
  pair("edited と違う要約で submit ← 'summary': e.summary（edited の一致）",
    async (env) => { await seedAi(env); return submitBatch(dbAs(env, 'devA'), { proposal: { ...proposalV2(), summary: '保存していない要約' } }); },
    () => mutate(BASE, "'summary': e.summary", "'summary': p.summary"));
  pair('お客様が下書きを読む ← aiDrafts の get/list は isAdmin() || assigned(pid) だけ',
    async (env) => { await seedAi(env); return getDoc(doc(dbAs(env, 'client1'), AI_PATH)); },
    () => mutate(BASE, `allow get, list: if isAdmin() || assigned(pid);${NL}        allow create, update, delete: if false;`,
      `allow get, list: if isAdmin() || assigned(pid) || clientOf(pid);${NL}        allow create, update, delete: if false;`));
});

// ================= TEST-10: admin の分岐・代理承認の強制（ADMIN_FULL_RIGHTS_PLAN、脅威モデル TEST-10） =================
// roleOf == 'admin' の条件を緩める（T-01・T-02）／ proxy・approvedVia・note・actorRole の強制を外す（T-04）変異が、攻撃で検出されること
describe('TEST-10: admin の分岐と代理承認の変異テスト（元＝拒否／1 条件を外した変異＝許可）', () => {
  const pair = (name, attack, mutant) => test(name, async () => {
    const rules = mutant();
    assert.notEqual(rules, BASE);
    await withRules(BASE, async (env) => { await assertFails(attack(env)); });
    await withRules(rules, async (env) => { await assertSucceeds(attack(env)); });
  });
  const noteOf = (note) => approvalDoc('admin1', 'approve', 1, { answers: ANSWERS, proposal: PROPOSAL, proxy: true, note });
  const drop = (o, ...keys) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));
  const sendAs = (env, uid) => {
    const db = dbAs(env, uid); const b = writeBatch(db);
    b.set(doc(db, 'projects/p1/messages/000001'), { schemaVersion: 1, seq: 1, text: 'x', side: 'afro', authorUid: uid, authorName: USERS[uid].name, at: serverTimestamp() });
    b.update(doc(db, 'projects/p1'), { consult: { count: 1, lastAt: serverTimestamp(), lastSide: 'afro', lastName: USERS[uid].name } });
    return b.commit();
  };
  pair("担当外の開発者が基本情報を変える ← projUpdateOk の admin の分岐の r == 'admin'",
    async (env) => { await seed(env); return updateDoc(doc(dbAs(env, 'devC'), 'projects/p1'), { siteName: '乗っ取り', ...stamp('devC') }); },
    () => mutate(BASE, `|| (r == 'admin'${NL}`, `|| ((r == 'admin' || r == 'developer')${NL}`));
  pair("担当外の開発者がタスクを作る ← taskCreateOk の r == 'admin'",
    async (env) => { await seed(env); return setDoc(doc(dbAs(env, 'devC'), 'projects/p1/tasks/x'), { schemaVersion: 1, title: 't', page: 'p', assigneeUids: ['devA'], status: 'todo', createdAt: serverTimestamp(), createdBy: 'devC', ...stamp('devC') }); },
    () => mutate(BASE, "      return ((r == 'developer' && request.auth.uid in p.memberUids) || r == 'admin')", "      return ((r == 'developer' && request.auth.uid in p.memberUids) || r != 'none')"));
  pair("担当外の開発者が相談を送る ← sideOf の r == 'admin'",
    async (env) => { await seed(env); return sendAs(env, 'devC'); },
    () => mutate(BASE, "|| r == 'admin' ? 'afro'", "|| r != 'none' ? 'afro'"));
  pair('代理承認の記録に proxy が無い ← proxyApproveOk の d.proxy == true と adminProxyApprove の l.proxy == true',
    async (env) => { await seed(env, { reqState: 'analyzed' }); return proxyApproveBatch(dbAs(env, 'admin1'), { mutate: { log: drop(noteOf(PROXY_NOTE), 'proxy') } }); },
    () => mutate(mutate(BASE, ' && d.proxy == true', ''), '&& l.proxy == true ', ''));
  pair("代理承認で requirements に approvedVia が無い ← a.approvedVia == 'proxy' と pa.approvedVia == 'proxy'",
    async (env) => {
      await seed(env, { reqState: 'analyzed' });
      return proxyApproveBatch(dbAs(env, 'admin1'), { mutate: { project: { 'requirements.status': 'approved', 'requirements.approvedAt': serverTimestamp(), 'requirements.approvedBy': 'admin1', 'requirements.approvalId': 'requirements-r1-approve', ...stamp('admin1') } } });
    },
    () => mutate(mutate(BASE, "&& a.approvedVia == 'proxy'", ''), "&& pa.approvedVia == 'proxy'", ''));
  pair('お客様が承認の記録に proxy: true を付ける ← approveOk の hasOnly と clientApprove の相互照合',
    async (env) => { await seed(env, { reqState: 'analyzed' }); return approveBatch(dbAs(env, 'client1'), { mutate: { log: { ...approvalDoc('client1', 'approve', 1, { answers: ANSWERS, proposal: PROPOSAL }), proxy: true } } }); },
    () => mutate(mutate(BASE, "'answers','proposal','actorRole']);", "'answers','proposal','actorRole','proxy']);"), "&& l.side == 'client' && !l.keys().hasAny(['proxy'])", "&& l.side == 'client'"));
  pair('代理承認の note に改行 ← !d.note.matches(reNoteControl())',
    async (env) => { await seed(env, { reqState: 'analyzed' }); return proxyApproveBatch(dbAs(env, 'admin1'), { note: '電話で\n確認' }); },
    () => mutate(BASE, ' && !d.note.matches(reNoteControl())', ''));
  pair("開発者が submit の記録で actorRole: 'admin' を名乗る ← d.get('actorRole', acc.role) == acc.role",
    async (env) => { await seed(env); return submitBatch(dbAs(env, 'devA'), { mutate: { log: approvalDoc('devA', 'submit', 1, { answers: ANSWERS, proposal: PROPOSAL, actorRole: 'admin' }) } }); },
    () => mutate(BASE, " && d.get('actorRole', acc.role) == acc.role", ''));
});

// ================= SR-18・ST-24: スケジュールの変異テスト（LIVE_SCHEDULE_PLAN §10.2 の ①〜⑪＋α。review L-4） =================
// review M-1: 既存の変異のアンカー文字列・TEST-09 の関数名を再利用しない（ここのアンカーは schedule 側の式だけ。mutate は 1 件ちょうどを確かめる）
describe('SR-18・ST-24: スケジュールの変異テスト（元＝拒否／1 条件を外した変異＝許可）', () => {
  const pair = (name, attack, mutant) => test(name, async () => {
    const rules = mutant();
    assert.notEqual(rules, BASE);
    await withRules(BASE, async (env) => { await assertFails(attack(env)); });
    await withRules(rules, async (env) => { await assertSucceeds(attack(env)); });
  });
  const P1 = 'projects/p1';
  const CUR = `${P1}/schedule/current`;
  const INT = `${P1}/schedule/internal`;
  const strip = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
  /** 承認の依頼（draft → requested）。log で記録を 1 か所崩す・aid で ID を変える・summary で要約を崩す */
  const submitS = (env, { uid = 'devA', fromRev = 0, log = {}, aid, summary = {} } = {}) => {
    const r = fromRev + 1; const db = dbAs(env, uid); const b = writeBatch(db);
    b.update(doc(db, P1), { 'schedule.status': 'requested', 'schedule.revision': r, 'schedule.requestedAt': serverTimestamp(), 'schedule.releaseDate': SCHED_DATES.releaseDate, ...stamp(uid), ...summary });
    b.update(doc(db, CUR), { revision: r, ...SCHED_DATES, editSeq: 1, ...stamp(uid) });
    b.set(doc(db, `${P1}/approvals/${aid ?? `schedule-r${r}-submit`}`), strip({ ...schedLogDoc(uid, 'submit', r, { ...SCHED_DATES, wbs: wbsWithDone(T0) }), ...log }));
    return b.commit();
  };
  const wbsMoved = () => { const w = wbsWithDone(T0); return { ...w, design: { ...w.design, end: '2026-12-05' } }; };
  const saveWbsBatch = (env, uid, { archived, editSeq = 1, wbs = wbsMoved() } = {}) => {
    const db = dbAs(env, uid); const b = writeBatch(db);
    if (archived !== undefined) b.update(doc(db, P1), { archived, ...stamp(uid) });
    b.update(doc(db, CUR), { wbs, editSeq, ...stamp(uid) });
    return b.commit();
  };
  const archive = (env) => env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), P1), { archived: true }));

  pair('① kind の無い記録 ← apprCreateOk の kind の振り分け（不明は false）と schedApprOk の kind == schedule',
    async (env) => { await scheduleSeed(env, { state: 'draft' }); return submitS(env, { log: { kind: undefined } }); },
    () => mutate(mutate(BASE, "return k == 'requirements' ? reqApprCreateOk(pid, aid, a)", "return k == 'requirements' ? reqApprCreateOk(pid, aid, a) : k != 'schedule' ? schedApprOk(pid, aid, a)"),
      "&& d.kind == 'schedule' && d.revision is int", '&& d.revision is int'));
  pair('② schedule の記録を requirements-r2-submit に書く ← schedApprId の schedule-r 接頭辞',
    async (env) => { await scheduleSeed(env, { state: 'draft', rev: 1 }); return submitS(env, { fromRev: 1, aid: 'requirements-r2-submit' }); },
    () => mutate(BASE, "{ return 'schedule-r' + string(rev)", "{ return 'requirements-r' + string(rev)"));
  pair('③ お客様が rev 0 の current を読む ← current の get の revision >= 1',
    async (env) => { await scheduleSeed(env, { state: 'draft' }); return getDoc(doc(dbAs(env, 'client1'), CUR)); },
    () => mutate(BASE, '&& resource.data.revision >= 1)', ')'));
  pair('④ お客様が internal を読む ← internal の get にお客様の分岐が無い',
    async (env) => { await scheduleSeed(env, { state: 'requested' }); return getDoc(doc(dbAs(env, 'client1'), INT)); },
    () => mutate(BASE, "sid == 'internal' && (isAdmin() || assigned(pid))", "sid == 'internal' && (isAdmin() || assigned(pid) || clientOf(pid))"));
  pair('⑤a 代理承認の記録に proxy が無い ← schedProxyLog と schedProxyMark の proxy == true',
    async (env) => {
      await scheduleSeed(env, { state: 'requested' });
      const db = dbAs(env, 'admin1'); const b = writeBatch(db);
      b.update(doc(db, P1), { 'schedule.status': 'approved', 'schedule.approvedRevision': 1, 'schedule.approvedAt': serverTimestamp(), 'schedule.approvedBy': 'admin1', 'schedule.approvalId': 'schedule-r1-approve', 'schedule.approvedVia': 'proxy', ...stamp('admin1') });
      b.set(doc(db, `${P1}/approvals/schedule-r1-approve`), schedLogDoc('admin1', 'approve', 1, { ...SCHED_DATES, wbs: wbsWithDone(T0), note: SCHED_NOTE }));
      return b.commit();
    },
    () => mutate(mutate(BASE, "&& d.get('proxy', false) == true && schedNoteOk(d.note)", '&& schedNoteOk(d.note)'), "return lg.get('proxy', false) == true && ", 'return '));
  pair("⑤b 開発者が記録で actorRole: 'admin' を名乗る ← schedApprOk の actorRole の強制",
    async (env) => { await scheduleSeed(env, { state: 'draft' }); return submitS(env, { log: { actorRole: 'admin' } }); },
    () => mutate(BASE, "(r == 'admin' ? d.get('actorRole', null) == 'admin' : d.get('actorRole', r) == r)", 'true'));
  pair('⑥ アーカイブ解除と WBS の保存を同じバッチ ← schedGate の事前の archived',
    async (env) => { await scheduleSeed(env, { state: 'approved' }); await archive(env); return saveWbsBatch(env, 'devA', { archived: false }); },
    () => mutate(BASE, 'p.archived == false && pa.archived', 'pa.archived'));
  pair('⑦ アーカイブと WBS の保存を同じバッチ ← schedGate の事後の archived（L-17）',
    async (env) => { await scheduleSeed(env, { state: 'approved' }); return saveWbsBatch(env, 'devA', { archived: true }); },
    () => mutate(BASE, '&& pa.archived == false; }', '; }'));
  pair('⑧ submit の記録の写しが current と違う ← schedCopyOk(d, getAfter(current))',
    async (env) => { await scheduleSeed(env, { state: 'draft' }); return submitS(env, { log: { releaseDate: '2026-12-31' } }); },
    () => mutate(BASE, "&& schedCopyOk(d, getAfter(schedPath(pid, 'current')).data)", ''));
  pair('⑨ 同じ editSeq から 2 回保存（後の方）← schedCurUpdateOk の editSeq +1',
    async (env) => {
      await scheduleSeed(env, { state: 'approved' });
      await assertSucceeds(saveWbsBatch(env, 'devA'));
      return saveWbsBatch(env, 'devB', { wbs: wbsWithDone(T0) });
    },
    () => mutate(BASE, `d.editSeq == b.editSeq + 1${NL}        && ((ch.hasOnly`, `true${NL}        && ((ch.hasOnly`));
  pair('⑩ current の doneAt だけ付ける（internal.marks なし）← doneOk の marks の照合（current→internal）',
    async (env) => {
      await scheduleSeed(env, { state: 'approved', done: false });
      const w = { ...SCHED_WBS, design: { ...SCHED_WBS.design, doneAt: serverTimestamp() } };
      return saveWbsBatch(env, 'devA', { wbs: w });
    },
    () => mutate(BASE, " && im.get(id, {}) == {'state': 'done', 'at': request.time, 'by': request.auth.uid})", ')'));
  pair('⑪ internal.marks だけ done にする（current の doneAt なし）← markOk の照合（internal→current）',
    async (env) => {
      await scheduleSeed(env, { state: 'approved', done: false });
      return updateDoc(doc(dbAs(env, 'devA'), INT), { marks: { design: { state: 'done', at: serverTimestamp(), by: 'devA' } }, savedByName: USERS.devA.name, editSeq: 1, ...stamp('devA') });
    },
    () => mutate(BASE, " && cw[id].get('doneAt', null) == request.time", ''));
  pair('⑫ 要約の releaseDate が current と違う ← schedAfroMove の要約の等式',
    async (env) => { await scheduleSeed(env, { state: 'draft' }); return submitS(env, { summary: { 'schedule.releaseDate': '2027-03-01' } }); },
    () => mutate(BASE, "&& s.releaseDate == getAfter(schedPath(pid, 'current')).data.releaseDate", ''));
  pair('⑬ 差し戻し後に current を更新せず要約と記録だけ進める（ST-20）← schedAfroLog の current.revision == d.revision',
    async (env) => {
      await scheduleSeed(env, { state: 'draft', rev: 1 });
      const db = dbAs(env, 'devA'); const b = writeBatch(db);
      b.update(doc(db, P1), { 'schedule.status': 'requested', 'schedule.revision': 2, 'schedule.requestedAt': serverTimestamp(), 'schedule.releaseDate': SCHED_DATES.releaseDate, ...stamp('devA') });
      b.set(doc(db, `${P1}/approvals/schedule-r2-submit`), schedLogDoc('devA', 'submit', 2, { ...SCHED_DATES, wbs: wbsWithDone(T0) }));
      return b.commit();
    },
    () => mutate(BASE, "&& getAfter(schedPath(pid, 'current')).data.revision == d.revision)", ')'));
});

// ================= SM-12: サイトマップの変異テスト（LIVE_SITEMAP_IMPL_PLAN §7。既存のアンカー文字列は再利用しない） =================
describe('SM-12: サイトマップの変異テスト（元＝拒否／1 条件を外した変異＝許可）', () => {
  const pair = (name, attack, mutant) => test(name, async () => {
    const rules = mutant();
    assert.notEqual(rules, BASE);
    await withRules(BASE, async (env) => { await assertFails(attack(env)); });
    await withRules(rules, async (env) => { await assertSucceeds(attack(env)); });
  });
  const P1 = 'projects/p1';
  const strip = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
  /** 取り下げ（requested → draft）。log で記録を 1 か所崩す・aid で ID を変える・summary で要約を足す */
  const withdrawS = (env, { uid = 'devA', log = {}, aid, summary = {} } = {}) => {
    const db = dbAs(env, uid); const b = writeBatch(db);
    b.update(doc(db, P1), { 'sitemap.status': 'draft', ...stamp(uid), ...summary });
    b.set(doc(db, `${P1}/approvals/${aid ?? 'sitemap-r1-withdraw'}`), strip({ ...siteLogDoc(uid, 'withdraw', 1, { note: SITE_NOTE }), ...log }));
    return b.commit();
  };
  const approveS = (env, { uid = 'client1', log = {}, summary = {}, proxy = false } = {}) => {
    const db = dbAs(env, uid); const b = writeBatch(db);
    b.update(doc(db, P1), strip({ 'sitemap.status': 'approved', 'sitemap.approvedRevision': 1, 'sitemap.approvedAt': serverTimestamp(), 'sitemap.approvedBy': uid, 'sitemap.approvalId': 'sitemap-r1-approve', ...(proxy ? { 'sitemap.approvedVia': 'proxy' } : {}), ...stamp(uid), ...summary }));
    b.set(doc(db, `${P1}/approvals/sitemap-r1-approve`), strip({ ...siteLogDoc(uid, 'approve', 1, { contentHash: siteHash(1), ...(proxy ? { proxy: true, note: SITE_NOTE } : {}) }), ...log }));
    return b.commit();
  };
  const archive = (env) => env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), P1), { archived: true }));

  pair('① kind の無い記録 ← apprCreateOk の kind の振り分けと siteApprOk の kind == sitemap',
    async (env) => { await sitemapSeed(env, { state: 'requested' }); return withdrawS(env, { log: { kind: undefined } }); },
    () => mutate(mutate(BASE, ": k == 'sitemap' ? siteApprOk(pid, aid, a)", ": k == 'sitemap' || k == null ? siteApprOk(pid, aid, a)"), "&& d.kind == 'sitemap' && d.revision is int", '&& d.revision is int'));
  pair('② sitemap の記録を schedule-r1-withdraw に書く ← siteApprId の sitemap-r 接頭辞',
    async (env) => { await sitemapSeed(env, { state: 'requested' }); return withdrawS(env, { aid: 'schedule-r1-withdraw' }); },
    () => mutate(BASE, "{ return 'sitemap-r' + string(rev)", "{ return 'schedule-r' + string(rev)"));
  pair('③ 開発者が submit（draft → requested）を書く ← siteAfroMove・siteAfroLog に submit の分岐が無い',
    async (env) => {
      await sitemapSeed(env, { state: 'draft', rev: 1 });
      const db = dbAs(env, 'devA'); const b = writeBatch(db);
      b.update(doc(db, P1), { 'sitemap.status': 'requested', ...stamp('devA') });
      b.set(doc(db, `${P1}/approvals/sitemap-r2-submit`), siteLogDoc('devA', 'submit', 1, { note: SITE_NOTE }));
      return b.commit();
    },
    () => mutate(mutate(BASE, "return s.status == 'draft' && s.diff(b).affectedKeys().hasOnly(['status'])", "return true || s.status == 'draft' && s.diff(b).affectedKeys().hasOnly(['status'])"),
      "return schedNoteOk(d.note) && s.status == 'draft' && aid", "return true || schedNoteOk(d.note) && s.status == 'draft' && aid"));
  pair('④ お客様が版文書と違う contentHash で承認 ← siteHashOk の等式',
    async (env) => { await sitemapSeed(env, { state: 'requested' }); return approveS(env, { log: { contentHash: 'f'.repeat(64) } }); },
    () => mutate(BASE, '{ return d.contentHash == get(siteVerPath(pid, rev)).data.contentHash; }', '{ return d.contentHash is string; }'));
  pair('⑤a 代理承認の記録に proxy が無い ← siteProxyLog と siteProxyMark の proxy == true',
    async (env) => { await sitemapSeed(env, { state: 'requested' }); return approveS(env, { uid: 'admin1', proxy: true, log: { proxy: undefined } }); },
    () => mutate(mutate(BASE, 'return d.proxy == true && d.side ==', 'return d.side =='), "&& m.get('proxy', false) == true && m.actorUid", '&& m.actorUid'));
  pair("⑤b 開発者が記録で actorRole: 'admin' を名乗る ← siteApprOk の actorRole の強制",
    async (env) => { await sitemapSeed(env, { state: 'requested' }); return withdrawS(env, { log: { actorRole: 'admin' } }); },
    () => mutate(BASE, "(r != 'admin' ? d.get('actorRole', r) == r : d.get('actorRole', '') == 'admin')", 'true'));
  pair('⑥ アーカイブ中の取り下げ ← siteGate の事前の archived',
    async (env) => { await sitemapSeed(env, { state: 'requested' }); await archive(env); return withdrawS(env); },
    () => mutate(BASE, "{ return pa.archived == false && p.archived == false && p.requirements.status == 'approved'; }", "{ return p.requirements.status == 'approved'; }"));
  pair('⑦ アーカイブと取り下げを同じバッチ ← siteProjOk の差分 allowlist と siteGate の事後の archived',
    async (env) => { await sitemapSeed(env, { state: 'requested' }); return withdrawS(env, { summary: { archived: true } }); },
    () => mutate(mutate(BASE, "return ch.hasOnly(['sitemap','updatedAt','updatedBy']) && s is map", "return ch.hasOnly(['sitemap','archived','updatedAt','updatedBy']) && s is map"),
      "{ return pa.archived == false && p.archived == false && p.requirements.status == 'approved'; }", "{ return p.archived == false && p.requirements.status == 'approved'; }"));
  pair('⑧ お客様が internal を読む ← internal の get にお客様の分岐が無い（S-1）',
    async (env) => { await sitemapSeed(env, { state: 'requested' }); return getDoc(doc(dbAs(env, 'client1'), `${P1}/sitemap/internal`)); },
    () => mutate(BASE, "(isAdmin() || assigned(pid)) && sid == 'internal'", "(isAdmin() || assigned(pid) || clientOf(pid)) && sid == 'internal'"));
  pair('⑨ note の無い取り下げ ← siteAfroLog の schedNoteOk（S-8）',
    async (env) => { await sitemapSeed(env, { state: 'requested' }); return withdrawS(env, { log: { note: undefined } }); },
    () => mutate(BASE, "return schedNoteOk(d.note) && s.status == 'draft'", "return s.status == 'draft'"));
  pair('⑩a admin が internal を書く ← sitemap/{sid} の write は全拒否（sec L-4）',
    async (env) => { await sitemapSeed(env, { state: 'draft' }); return updateDoc(doc(dbAs(env, 'admin1'), `${P1}/sitemap/internal`), { editSeq: 4 }); },
    () => mutate(BASE, 'allow create, update, delete: if false;                                       // 作業中の版は', 'allow create, update, delete: if isAdmin();                                       // 作業中の版は'));
  pair('⑩b admin が版文書を書き換える ← sitemapVersions/{vid} の write は全拒否（sec L-4）',
    async (env) => { await sitemapSeed(env, { state: 'requested' }); return updateDoc(doc(dbAs(env, 'admin1'), `${P1}/sitemapVersions/r1`), { contentHash: 'f'.repeat(64) }); },
    () => mutate(BASE, 'allow create, update, delete: if false;                                       // 版文書は', 'allow create, update, delete: if isAdmin();                                       // 版文書は'));
  pair('⑪ お客様が承認と同じバッチで要約の contentHash を書き換える ← 承認の 6 キーの差分 allowlist（M-2 (b)）',
    async (env) => { await sitemapSeed(env, { state: 'requested' }); return approveS(env, { summary: { 'sitemap.contentHash': 'f'.repeat(64) } }); },
    () => mutate(BASE, "hasOnly(['status','approvalId','approvedRevision','approvedAt','approvedBy','approvedVia'])", "hasOnly(['status','approvalId','approvedRevision','approvedAt','approvedBy','approvedVia','contentHash','revision'])"));
});
