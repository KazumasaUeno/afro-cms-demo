// 提案 v3（要件定義書のひな型。docs/design/REQUIREMENTS_DOC_TEMPLATE.md §3.3・§7 U3）の受け付け。
// - v3 の submit は v2 と同じく中身を再検証せず、aiDrafts の generated のサーバー欄（flags を除く）＋template＋edited の 3 欄
//   （summary・points・doc）とマップの等式 1 本で一致することだけを見る（proposalV3Ok）。doc の検査は callable saveAiDraftEdits（F-a）
// - クライアントが doc を偽造（generated の値へ戻す・by を変える・固定の状態を変える・上限超え・AI追加を足す）→ edited と食い違うので拒否
// - v1・v2 の保存済みの文書の更新（承認・差し戻し・回答の更新）と v2 の submit は今までどおり（回帰）
// - お客様は aiDrafts を読めない（v3 の下書きでも）
// - 最大の payload で式の数・参照の数を計測する（式の詰め物を足して通る数を数える。方法は AI_REQUIREMENTS_PLAN.md §7.1 と同じ）
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, collectionGroup, getDoc, getDocs, setDoc as setDocFs } from 'firebase/firestore';
import { createRulesEnv, readRules } from './guard.mjs';
import {
  ANSWERS, FULL_ANSWERS, PROPOSAL, approvalDoc, approveBatch, dbAs, doc, serverTimestamp, stamp, submitBatch, updateDoc, withdrawBatch,
} from './fixtures.mjs';
import { AI_PATH, GENERATED, MAX_EDITED, MAX_GENERATED, aiDraftDoc, proposalV2, seedAi } from './aiFixtures.mjs';
import {
  CHAPTERS, EDITED_V3, GENERATED_V3, ITEMS, L, MAX_EDITED_V3, MAX_GENERATED_V3, REQUIRED_CHAPTERS, aiDraftDocV3, docBytes, editedV3Of, proposalV3, submitReadyOf,
} from './aiFixturesV3.mjs';

let env;
before(async () => { env = await createRulesEnv(); });
after(async () => { await env?.clearFirestore(); await env?.cleanup(); });

const V3 = proposalV3();
const V2 = proposalV2();
const seedV3 = (opts = {}) => seedAi(env, { aiDraft: aiDraftDocV3(), ...opts });
const FIXED = ITEMS.find((i) => i.kubun === 'fixed').id;
// FREE: 必須でない章の自由な項目（直してもゲートに関係しない）／ REQ: 必須の章の項目
const FREE = ITEMS.find((i) => i.kubun !== 'fixed' && !REQUIRED_CHAPTERS.includes(i.chapterId)).id;
const REQ = ITEMS.find((i) => REQUIRED_CHAPTERS.includes(i.chapterId)).id;
/** doc.items の 1 項目だけを差し替えた提案 */
const withItem = (p, id, over) => ({ ...p, doc: { ...p.doc, items: { ...p.doc.items, [id]: { ...p.doc.items[id], ...over } } } });
const serverSaveEdited = (e) => env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), AI_PATH), { edited: e, editedAt: serverTimestamp(), editedBy: 'devA', submitReady: submitReadyOf(e), ...stamp('devA') }));

describe('前提: テストデータとカタログ・Rules の形', () => {
  test('カタログは 19 章（特記欄 18）・129 項目（固定 32）。テストの doc はその全項目を持つ', () => {
    assert.equal(CHAPTERS.length, 19);
    assert.equal(CHAPTERS.filter((c) => c.hasNotes).length, 18);
    assert.equal(ITEMS.length, 129);
    assert.equal(ITEMS.filter((i) => i.kubun === 'fixed').length, 32);
    assert.deepEqual(Object.keys(V3.doc.items).sort(), ITEMS.map((i) => i.id).sort());
    assert.equal(MAX_EDITED_V3.doc.added.length, L.added);
  });
  test('Rules の v3 の等式のキー ＝ ProposalV3 のキー（version＋サーバー欄＋template＋edited の 3 欄。flags は含めない）', () => {
    const rules = readRules().replace(/\r\n/g, '\n');
    const body = /function proposalV3Ok\(p, pid\) \{([\s\S]*?)\n {4}\}\n/.exec(rules)?.[1];
    assert.ok(body, 'proposalV3Ok がありません');
    const lit = /p == \{([\s\S]*?)\};/.exec(body);
    assert.ok(lit, 'proposalV3Ok にマップリテラルの等式がありません');
    const keys = [...lit[1].matchAll(/'(\w+)':/g)].map((x) => x[1]).sort();
    const ts = readFileSync(new URL('../../src/types/aiDraft.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    const ifaceKeys = (name) => [...(new RegExp(`export interface ${name}(?: extends [\\w, ]+)? \\{([\\s\\S]*?)\\n\\}`).exec(ts)?.[1] ?? '').matchAll(/^ {2}(\w+)\??:/gm)].map((x) => x[1]);
    const expected = [...ifaceKeys('ProposalV3'), ...ifaceKeys('ProposalV2ServerFields'), ...ifaceKeys('AiEditableV3')].sort();
    assert.deepEqual(keys, expected);
    assert.ok(!keys.includes('flags'));
    assert.deepEqual(Object.keys(V3).sort(), expected, 'aiFixturesV3.proposalV3 の形も一致');
  });
  test('最大の payload の文書の大きさは 1 MiB 未満（aiDrafts は generated＋edited、requirements/current・approvals は写し）', () => {
    const MiB = 1024 * 1024;
    const ai = docBytes(aiDraftDocV3({ generated: MAX_GENERATED_V3, edited: MAX_EDITED_V3 }));
    const req = docBytes({ answers: FULL_ANSWERS, proposal: proposalV3(MAX_GENERATED_V3) });
    console.log(`[size] aiDrafts ${ai} B（${(ai / MiB * 100).toFixed(1)}%）／ requirements/current・approvals の写し 約 ${req} B（${(req / MiB * 100).toFixed(1)}%）`);
    assert.ok(ai < MiB && req < MiB);
  });
});

describe('submit v3（draft → analyzed）: 許可', () => {
  test('generated のサーバー欄＋template＋edited の 3 欄と一致する v3 の submit は通る', async () => {
    await seedV3();
    await assertSucceeds(submitBatch(dbAs(env, 'devA'), { proposal: V3 }));
  });
  test('協力会社の開発者も v3 を submit できる', async () => {
    await seedV3();
    await assertSucceeds(submitBatch(dbAs(env, 'devB'), { uid: 'devB', proposal: V3 }));
  });
  test('最大の payload（全 20 問上限＋generated・edited とも上限ちょうど・4 バイト文字）の submit が通る', async () => {
    await seedAi(env, { aiDraft: aiDraftDocV3({ generated: MAX_GENERATED_V3, edited: MAX_EDITED_V3 }), answers: FULL_ANSWERS });
    await assertSucceeds(submitBatch(dbAs(env, 'devA'), { answers: FULL_ANSWERS, proposal: proposalV3(MAX_GENERATED_V3) }));
  });
  test('開発者が直した edited（項目の文・状態・AI追加の削除。generated と違う）で submit できる', async () => {
    const e = withItem(EDITED_V3, FREE, { status: 'na', text: '今回は対象外' });
    e.doc = { ...e.doc, added: [] };
    await seedV3({ aiDraft: aiDraftDocV3({ edited: e }) });
    await assertSucceeds(submitBatch(dbAs(env, 'devA'), { proposal: proposalV3(GENERATED_V3, e) }));
  });
  test('基本チェックが取れなかった下書き（siteCheck: null）でも submit できる', async () => {
    const g = { ...GENERATED_V3, siteCheck: null };
    await seedV3({ aiDraft: aiDraftDocV3({ generated: g, edited: editedV3Of(g) }) });
    await assertSucceeds(submitBatch(dbAs(env, 'devA'), { proposal: proposalV3(g) }));
  });
});

describe('submit v3: 拒否（偽造・欠け・版）', () => {
  const deny = (name, proposal, seedOpts = {}, opts = {}) => test(name, async () => {
    await seedV3(seedOpts);
    await assertFails(submitBatch(dbAs(env, opts.uid ?? 'devA'), { uid: opts.uid ?? 'devA', proposal }));
  });
  const editedDiff = withItem(EDITED_V3, FREE, { status: 'open', text: '開発者が未確定に戻した' });
  deny('edited と違う doc（直す前の generated の doc を出す）→ 拒否', proposalV3(GENERATED_V3, EDITED_V3), { aiDraft: aiDraftDocV3({ edited: editedDiff }) });
  deny('edited の doc を generated と同じに戻した提案（edited は直してある）→ 拒否', { ...proposalV3(GENERATED_V3, editedDiff), doc: GENERATED_V3.doc }, { aiDraft: aiDraftDocV3({ edited: editedDiff }) });
  deny('項目の文を書き換え → 拒否', withItem(V3, FREE, { text: '保存していない文' }));
  deny('項目の by を ai → human に書き換え → 拒否', withItem(V3, FREE, { by: 'human' }));
  deny('項目の evidence を水増し → 拒否', withItem(V3, FREE, { evidence: ['q-issue', 'q-purpose'] }));
  deny('固定の項目を std_pending → proposed に変える → 拒否', withItem(V3, FIXED, { status: 'proposed', text: '独自の標準' }));
  deny('項目の文が上限超え（itemText+1）→ 拒否', withItem(V3, FREE, { text: '𠮷'.repeat(L.itemText + 1) }));
  deny('カタログに無い項目を足す → 拒否', { ...V3, doc: { ...V3.doc, items: { ...V3.doc.items, 't99-01': { status: 'proposed', text: 'x', evidence: [], by: 'ai' } } } });
  deny('項目を 1 つ消す → 拒否', { ...V3, doc: { ...V3.doc, items: Object.fromEntries(Object.entries(V3.doc.items).slice(1)) } });
  deny('AI追加を足す（上限 10 を超える 11 件）→ 拒否', { ...V3, doc: { ...V3.doc, added: Array.from({ length: L.added + 1 }, (_, i) => ({ ...V3.doc.added[0], id: `a${String(i + 1).padStart(2, '0')}` })) } });
  deny('AI追加の source を書き換え → 拒否', { ...V3, doc: { ...V3.doc, added: [{ ...V3.doc.added[0], source: 'human' }] } });
  deny('特記欄が上限超え（notes+1）→ 拒否', { ...V3, doc: { ...V3.doc, notes: { ...V3.doc.notes, c01: '𠮷'.repeat(L.notes + 1) } } });
  deny('表紙の欄を書き換え → 拒否', { ...V3, doc: { ...V3.doc, cover: { ...V3.doc.cover, approver: '代表取締役' } } });
  deny('template の版を書き換え → 拒否', { ...V3, template: { id: 'TPL-WEB-REQ', version: '9.9' } });
  deny('template を落とす → 拒否', (({ template: _t, ...rest }) => rest)(V3));
  deny('doc を落とす → 拒否', (({ doc: _d, ...rest }) => rest)(V3));
  deny('提案に flags を含める → 拒否', { ...V3, flags: { unsupportedNumbers: [] } });
  deny('v2 の draft を足す → 拒否', { ...V3, draft: GENERATED.draft });
  deny('siteCheck を偽造 → 拒否', { ...V3, siteCheck: { ...V3.siteCheck, passed: 10 } });
  deny('origin を偽造 → 拒否', { ...V3, origin: { ...V3.origin, model: 'claude-opus-5-5' } });
  deny('version:2 で v3 の形 → 拒否', { ...V3, version: 2 });
  deny('version:4 → 拒否', { ...V3, version: 4 });
  deny("version:'3'（文字列）→ 拒否", { ...V3, version: '3' });
  deny('generated が v2 の下書きに v3 の形を出す → 拒否', V3, { aiDraft: aiDraftDoc() });
  // g.version == 3 の検査が効くこと（サーバーはこの形を書かないが、v2 の generated に template があっても v3 として通さない）
  deny('generated が version 2 のまま template を持つ下書きに v3 を出す → 拒否',
    proposalV3({ ...GENERATED_V3, version: 2 }, EDITED_V3),
    { aiDraft: aiDraftDocV3({ generated: { ...GENERATED_V3, version: 2 } }) });
  deny('generated は v3 だが edited が v2 の形（doc が無い）→ 拒否', V3, { aiDraft: aiDraftDocV3({ edited: { summary: GENERATED_V3.summary, points: GENERATED_V3.points, draft: GENERATED.draft }, submitReady: { requiredOk: true, templateVersion: GENERATED_V3.template.version } }) });
  deny('aiDraft が無い → 拒否', V3, { aiDraft: null });
  deny('aiDraft に edited が無い（確認していない）→ 拒否', V3, { aiDraft: aiDraftDocV3({ edited: null, submitReady: { requiredOk: true, templateVersion: GENERATED_V3.template.version } }) });
  deny("aiDraft の state=='failed' → 拒否", V3, { aiDraft: aiDraftDocV3({ state: 'failed' }) });
  deny('お客様は v3 を submit できない', V3, {}, { uid: 'client1' });
  deny('admin は v3 を submit できない', V3, {}, { uid: 'admin1' });
  deny('未アサインの開発者は v3 を submit できない', V3, {}, { uid: 'devC' });
  deny('無効の開発者（アサイン済み）は v3 を submit できない', V3, {}, { uid: 'devOff' });
  test('承認の写し（approvals）の doc を改変 → 拒否', async () => {
    await seedV3();
    const forged = withItem(V3, FREE, { text: '写しだけ改変' });
    await assertFails(submitBatch(dbAs(env, 'devA'), { proposal: V3, mutate: { log: approvalDoc('devA', 'submit', 1, { answers: ANSWERS, proposal: forged }) } }));
  });
});

describe('submit v3: 必須の章のゲート（submitReady）', () => {
  const sub = () => submitBatch(dbAs(env, 'devA'), { proposal: V3 });
  test('必須の章は 01・02・19・21（固定の項目を含まない）', () => {
    assert.deepEqual(REQUIRED_CHAPTERS, ['c01', 'c02', 'c19', 'c21']);
    assert.ok(ITEMS.filter((i) => REQUIRED_CHAPTERS.includes(i.chapterId)).every((i) => i.kubun !== 'fixed'));
  });
  test('requiredOk: true・版が一致 → 通る', async () => {
    await seedV3({ aiDraft: aiDraftDocV3({ submitReady: { requiredOk: true, templateVersion: GENERATED_V3.template.version } }) });
    await assertSucceeds(sub());
  });
  test('requiredOk: false → 拒否', async () => {
    await seedV3({ aiDraft: aiDraftDocV3({ submitReady: { requiredOk: false, templateVersion: GENERATED_V3.template.version } }) });
    await assertFails(sub());
  });
  test('submitReady が無い（ゲート以前に保存した edited）→ 拒否', async () => {
    await seedV3({ aiDraft: aiDraftDocV3({ submitReady: null }) });
    await assertFails(sub());
  });
  test("requiredOk が true 以外（'true'・1）→ 拒否", async () => {
    for (const requiredOk of ['true', 1]) {
      await seedV3({ aiDraft: aiDraftDocV3({ submitReady: { requiredOk, templateVersion: GENERATED_V3.template.version } }) });
      await assertFails(sub());
    }
  });
  test('submitReady の版が generated の版と違う → 拒否', async () => {
    await seedV3({ aiDraft: aiDraftDocV3({ submitReady: { requiredOk: true, templateVersion: '0.0' } }) });
    await assertFails(sub());
  });
  test('submitReady が map でない → 拒否', async () => {
    await seedV3({ aiDraft: aiDraftDocV3({ submitReady: true }) });
    await assertFails(sub());
  });
  test("generated の template.id が 'TPL-WEB-REQ' でない → 拒否（提案も同じ template でも）", async () => {
    const g = { ...GENERATED_V3, template: { id: 'TPL-OTHER', version: GENERATED_V3.template.version } };
    await seedV3({ aiDraft: aiDraftDocV3({ generated: g, edited: editedV3Of(g) }) });
    await assertFails(submitBatch(dbAs(env, 'devA'), { proposal: proposalV3(g) }));
  });
  test('必須の章の項目が未確定の edited（callable は requiredOk:false を書く）→ 拒否、直して保存し直すと通る', async () => {
    const e = withItem(EDITED_V3, REQ, { status: 'open', text: '' });
    assert.equal(submitReadyOf(e).requiredOk, false);
    await seedV3({ aiDraft: aiDraftDocV3({ edited: e }) });
    const db = dbAs(env, 'devA');
    await assertFails(submitBatch(db, { proposal: proposalV3(GENERATED_V3, e) }));
    const fixed = withItem(EDITED_V3, REQ, { status: 'na', text: '今回は対象外' });
    await serverSaveEdited(fixed);
    await assertSucceeds(submitBatch(db, { proposal: proposalV3(GENERATED_V3, fixed) }));
  });
});

describe('v3 の承認・差し戻し・再 submit', () => {
  test('お客様の approve で v3 の提案が写る', async () => {
    await seedV3({ reqState: 'analyzed', proposal: V3 });
    await assertSucceeds(approveBatch(dbAs(env, 'client1'), { proposal: V3 }));
  });
  test('お客様の approve で写しの v3 を改変（固定の項目の状態）→ 拒否', async () => {
    await seedV3({ reqState: 'analyzed', proposal: V3 });
    await assertFails(approveBatch(dbAs(env, 'client1'), { proposal: withItem(V3, FIXED, { status: 'proposed' }) }));
  });
  test('お客様は requirements/current の v3 の提案を書き換えられない', async () => {
    await seedV3({ reqState: 'analyzed', proposal: V3 });
    await assertFails(updateDoc(doc(dbAs(env, 'client1'), 'projects/p1/requirements/current'), { proposal: withItem(V3, FREE, { text: '改変' }), ...stamp('client1') }));
  });
  test('withdraw → edited を直す（callable 相当）→ v3 で再 submit（revision 2）まで通る', async () => {
    await seedV3({ reqState: 'analyzed', proposal: V3 });
    const db = dbAs(env, 'devA');
    await assertSucceeds(withdrawBatch(db));
    const e = withItem(EDITED_V3, FREE, { text: '差し戻し後に直した文' });
    await serverSaveEdited(e);
    await assertSucceeds(submitBatch(db, { fromRev: 1, proposal: proposalV3(GENERATED_V3, e) }));
  });
  test('差し戻しの後、直す前の古い v3 で再 submit → 拒否', async () => {
    await seedV3({ reqState: 'analyzed', proposal: V3 });
    const db = dbAs(env, 'devA');
    await assertSucceeds(withdrawBatch(db));
    await serverSaveEdited(withItem(EDITED_V3, FREE, { text: '直した' }));
    await assertFails(submitBatch(db, { fromRev: 1, proposal: V3 }));
  });
});

describe('v1・v2 の回帰（保存済みの文書・作り直しで v3 に置き換わる経路）', () => {
  test('v1 の提案（8 キー）の submit は aiDraft が無くても通る', async () => {
    await seedAi(env, { aiDraft: null });
    await assertSucceeds(submitBatch(dbAs(env, 'devA'), { proposal: PROPOSAL }));
  });
  test('v1 の既存の確認依頼中の文書をお客様が承認できる（aiDraft が v3 でも）', async () => {
    await seedV3({ reqState: 'analyzed' });
    await assertSucceeds(approveBatch(dbAs(env, 'client1')));
  });
  test('v2 の submit は v2 の下書きで今までどおり通る', async () => {
    await seedAi(env);
    await assertSucceeds(submitBatch(dbAs(env, 'devA'), { proposal: V2 }));
  });
  test('v2 の最大の payload の submit も通る', async () => {
    await seedAi(env, { aiDraft: aiDraftDoc({ generated: MAX_GENERATED, edited: MAX_EDITED }), answers: FULL_ANSWERS });
    await assertSucceeds(submitBatch(dbAs(env, 'devA'), { answers: FULL_ANSWERS, proposal: proposalV2(MAX_GENERATED, MAX_EDITED) }));
  });
  test('v2 の既存の確認依頼中の文書をお客様が承認できる（下書きが v3 に作り直されていても）', async () => {
    await seedV3({ reqState: 'analyzed', proposal: V2 });
    await assertSucceeds(approveBatch(dbAs(env, 'client1'), { proposal: V2 }));
  });
  test('v2 の既存の文書を差し戻して回答を更新できる', async () => {
    await seedAi(env, { reqState: 'analyzed', proposal: V2 });
    const db = dbAs(env, 'devA');
    await assertSucceeds(withdrawBatch(db));
    await assertSucceeds(updateDoc(doc(db, 'projects/p1/requirements/current'), { 'answers.q-issue': '修正後', 'answerMeta.q-issue': { by: 'afro', at: serverTimestamp() }, ...stamp('devA') }));
  });
  test('v2 の文書を差し戻し → 下書きを v3 で作り直し → v3 で再 submit は通り、古い v2 では拒否', async () => {
    await seedV3({ reqState: 'analyzed', proposal: V2 });
    const db = dbAs(env, 'devA');
    await assertSucceeds(withdrawBatch(db));
    await assertFails(submitBatch(db, { fromRev: 1, proposal: V2 }));
    await assertSucceeds(submitBatch(db, { fromRev: 1, proposal: V3 }));
  });
});

describe('aiDrafts（v3 の下書き）: お客様は読めない・誰も書けない', () => {
  test('アサインされた開発者と admin は get できる', async () => {
    await seedV3();
    await assertSucceeds(getDoc(doc(dbAs(env, 'devA'), AI_PATH)));
    await assertSucceeds(getDoc(doc(dbAs(env, 'admin1'), AI_PATH)));
  });
  test('お客様（その案件）は get・list・collectionGroup で読めない', async () => {
    await seedV3();
    const db = dbAs(env, 'client1');
    await assertFails(getDoc(doc(db, AI_PATH)));
    await assertFails(getDocs(collection(db, 'projects/p1/aiDrafts')));
    await assertFails(getDocs(collectionGroup(db, 'aiDrafts')));
  });
  test('未アサインの開発者・未ログインは読めない', async () => {
    await seedV3();
    await assertFails(getDoc(doc(dbAs(env, 'devC'), AI_PATH)));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), AI_PATH)));
  });
  test('アサインされた開発者も edited（v3）を直接書けない（保存は callable）', async () => {
    await seedV3();
    const db = dbAs(env, 'devA');
    await assertFails(updateDoc(doc(db, AI_PATH), { edited: withItem(EDITED_V3, FIXED, { status: 'proposed' }), editedAt: serverTimestamp(), editedBy: 'devA', ...stamp('devA') }));
    await assertFails(setDocFs(doc(db, AI_PATH), aiDraftDocV3()));
  });
});

// ================= 変異（mutation.test.mjs C-1 と同じ考え方）: proposalV3Ok の各条件が拒否の原因であること =================
describe('変異: proposalV3Ok の条件を 1 つ外すと、その攻撃が通る', () => {
  const mutated = (from, to) => {
    const src = readRules();
    assert.equal(src.split(from).length - 1, 1, `変異のアンカーが 1 件ではない: ${from}`);
    return src.replace(from, () => to);
  };
  const pair = (name, from, to, seedOpts, proposal) => test(name, async () => {
    await seedV3(seedOpts);
    await assertFails(submitBatch(dbAs(env, 'devA'), { proposal }));
    const e = await createRulesEnv({ rules: mutated(from, to) });
    try {
      await seedAi(e, { aiDraft: aiDraftDocV3(), ...seedOpts });
      await assertSucceeds(submitBatch(dbAs(e, 'devA'), { proposal }));
    } finally {
      await e.cleanup();
      const r = await createRulesEnv();   // 本来の Rules を読み直す（Rules はプロジェクト全体に効く）
      await r.cleanup();
    }
  });
  pair("g3.version == 3 を外す → version 2 の generated（template あり）に v3 が通る", "a3.state == 'ready' && g3.version == 3", "a3.state == 'ready'",
    { aiDraft: aiDraftDocV3({ generated: { ...GENERATED_V3, version: 2 } }) }, proposalV3({ ...GENERATED_V3, version: 2 }, EDITED_V3));
  pair("a3.state == 'ready' を外す → failed の下書きで v3 が通る", "a3.state == 'ready' && g3.version == 3", 'g3.version == 3',
    { aiDraft: aiDraftDocV3({ state: 'failed' }) }, V3);
  pair('requiredOk の検査を外す → 必須の章が未確定でも v3 が通る', "&& a3.get('submitReady', {}).get('requiredOk', false) == true && a3.submitReady.templateVersion == g3.template.version", '',
    { aiDraft: aiDraftDocV3({ submitReady: { requiredOk: false, templateVersion: GENERATED_V3.template.version } }) }, V3);
  pair('templateVersion の一致を外す → 別の版で判定した submitReady で v3 が通る', '&& a3.submitReady.templateVersion == g3.template.version', '',
    { aiDraft: aiDraftDocV3({ submitReady: { requiredOk: true, templateVersion: '0.0' } }) }, V3);
  pair("template.id の検査を外す → 別のひな型の generated で v3 が通る", "&& g3.template.id == 'TPL-WEB-REQ'", '',
    { aiDraft: aiDraftDocV3({ generated: { ...GENERATED_V3, template: { id: 'TPL-OTHER', version: '0.1' } }, edited: EDITED_V3 }) },
    proposalV3({ ...GENERATED_V3, template: { id: 'TPL-OTHER', version: '0.1' } }, EDITED_V3));
  pair("'doc': e3.doc を 'doc': g3.doc にする → 直す前の generated の doc が通る（edited と比べていることの確認）", "'doc': e3.doc}", "'doc': g3.doc}",
    { aiDraft: aiDraftDocV3({ edited: withItem(EDITED_V3, FREE, { status: 'open', text: '直した' }) }) }, proposalV3(GENERATED_V3, EDITED_V3));
});

// ================= 計測: 最大の payload の v3 submit の式の数・参照の数（設計 §3.3「要計測」） =================
// 方法（AI_REQUIREMENTS_PLAN.md §7.1 と同じ）: 経路の先頭に詰め物（pad10() = 比較 10 個）を k 個足した Rules で、通る最大の k を数える。
// 基準は trivial な書き込み（probe/{id} の create。詰め物だけ）。v3 は v2 と同じ getAfter(aiDraft) 1 回なので参照の数も同じ形で数える。
// 公式の上限: 式 1,000／リクエスト・参照 10（単一）・20（batch。各操作 10）（2026-11-20 取得。AI_REQUIREMENTS_PLAN.md §7.1）
describe('計測: Rules の式の数・参照の数（最大の payload）', () => {
  const PAD = `    function pad10() { return 1 == 1 && 2 == 2 && 3 == 3 && 4 == 4 && 5 == 5 && 6 == 6 && 7 == 7 && 8 == 8 && 9 == 9 && 10 == 10; }\n`;
  const pads = (k) => Array.from({ length: k }, () => 'pad10() && ').join('');
  const nopes = (k) => Array.from({ length: k }, (_, i) => `!exists(/databases/$(db)/documents/nope/n${i}) && `).join('');
  /** fn の return の直後に詰め物を差し込んだ Rules（＋ probe/{id} の trivial な create） */
  function probeRules({ fn, inject }) {
    let r = readRules().replace(/\r\n/g, '\n');
    const anchor = `    function ${fn}(`;
    assert.ok(r.includes(anchor), fn);
    r = r.replace(anchor, PAD + anchor);
    const ret = new RegExp(`(function ${fn}\\([^)]*\\) \\{[\\s\\S]*?return )`);
    r = r.replace(ret, `$1${inject}`);
    r = r.replace('    match /projects/{pid} {', `    match /probe/{id} { allow create: if authed() && ${inject}true; }\n    match /projects/{pid} {`);
    return r;
  }
  async function passes({ path, inject }) {
    const e = await createRulesEnv({ rules: probeRules({ fn: path === 'v2' ? 'proposalV2Ok' : 'proposalV3Ok', inject }) });
    try {
      if (path === 'trivial') {
        await seedAi(e, { aiDraft: null, usage: false });
        return await setDocFs(doc(dbAs(e, 'devA'), 'probe/x'), { a: 1 }).then(() => true, () => false);
      }
      if (path === 'v2') {
        await seedAi(e, { aiDraft: aiDraftDoc({ generated: MAX_GENERATED, edited: MAX_EDITED }), answers: FULL_ANSWERS });
        return await submitBatch(dbAs(e, 'devA'), { answers: FULL_ANSWERS, proposal: proposalV2(MAX_GENERATED, MAX_EDITED) }).then(() => true, () => false);
      }
      await seedAi(e, { aiDraft: aiDraftDocV3({ generated: MAX_GENERATED_V3, edited: MAX_EDITED_V3 }), answers: FULL_ANSWERS });
      return await submitBatch(dbAs(e, 'devA'), { answers: FULL_ANSWERS, proposal: proposalV3(MAX_GENERATED_V3) }).then(() => true, () => false);
    } finally {
      await e.cleanup();
    }
  }
  async function maxK(path, make, hi) {
    if (!(await passes({ path, inject: make(0) }))) return -1;
    let lo = 0;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (await passes({ path, inject: make(mid) })) lo = mid; else hi = mid - 1;
    }
    return lo;
  }
  test('v3 の最大の submit は式・参照の上限に対して余裕がある（trivial な書き込みとの差で見る）', { timeout: 600_000 }, async () => {
    const base = await maxK('trivial', pads, 20);
    const v2 = await maxK('v2', pads, 20);
    const v3 = await maxK('v3', pads, 20);
    const refBase = await maxK('trivial', nopes, 12);
    const refV2 = await maxK('v2', nopes, 12);
    const refV3 = await maxK('v3', nopes, 12);
    // 1 個の重さは trivial の打ち切りから逆算（base 個で通り base+1 個で止まる → 1,000/(base+1)〜1,000/base 式）[INFERENCE]
    const per = 1000 / (base + 1);
    console.log(`[measure] pad10 の通る最大数: trivial ${base}・v2 submit ${v2}・v3 submit ${v3}（1 個 ≒ ${per.toFixed(0)}〜${(1000 / base).toFixed(0)} 式 → v3 の消費 ≒ ${((base - v3) * per).toFixed(0)}〜${((base - v3 + 1) * per).toFixed(0)} 式・余裕 ≒ ${(v3 * per / 10).toFixed(0)}%）／ 存在しない文書の exists(): trivial ${refBase}・v2 submit ${refV2}・v3 submit ${refV3}`);
    assert.ok(v3 >= 0, '最大の payload の v3 submit が詰め物なしで通らない');
    // 余裕 20% [TARGET]（AI_REQUIREMENTS_PLAN.md §4 U1）: 1,000 式の 20% ≒ pad10 4 個（1 個 ≒ 50 式）
    assert.ok(v3 * per >= 200, `v3 の式の余裕が 20% 未満（pad10 ${v3} 個）`);
    assert.ok(refV3 >= 5, `v3 の参照の余裕が足りない（exists ${refV3} 個）`);
  });
  after(async () => {
    // 次のテストファイルのために本来の Rules を読み直す（各ファイルの before でも読み直す）
    const e = await createRulesEnv();
    await e.cleanup();
  });
});
