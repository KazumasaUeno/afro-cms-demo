// 提案 v2 の受け付け（設計 docs/design/AI_REQUIREMENTS.md §5.3・§7 B-H5・B-M4、実装計画 §4 U1「submit の検査」MEDIUM-2）。
// - v2 の submit は中身を再検証せず、aiDrafts の generated のサーバー欄（flags を除く）＋ edited の 3 欄と一致することだけを見る
// - aiDraft・generated・edited のどれかが無い、state が ready でない → 拒否
// - v1（version を持たない 8 キー）は従来どおり（回帰）
import { after, before, describe, test } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { runTransaction } from 'firebase/firestore';
import { createRulesEnv } from './guard.mjs';
import {
  ANSWERS, FULL_ANSWERS, PROPOSAL, approvalDoc, approveBatch, dbAs, doc, serverTimestamp, stamp, submitBatch, updateDoc, withdrawBatch,
} from './fixtures.mjs';
import { AI_PATH, EDITED, GENERATED, MAX_EDITED, MAX_GENERATED, aiDraftDoc, proposalV2, seedAi } from './aiFixtures.mjs';

let env;
before(async () => { env = await createRulesEnv(); });
after(async () => { await env?.clearFirestore(); await env?.cleanup(); });

const V2 = proposalV2();
// edited の保存は callable saveAiDraftEdits（Admin SDK。代替 F-a）。テストでは Rules を通さずに書いて代わりにする
const serverSaveEdited = (edited) => env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), AI_PATH), { edited, editedAt: serverTimestamp(), editedBy: 'devA', updatedAt: serverTimestamp(), updatedBy: 'devA' }));

describe('submit v2（draft → analyzed）: 許可', () => {
  test('generated のサーバー欄＋edited の 3 欄と一致する v2 の submit は通る', async () => {
    await seedAi(env);
    await assertSucceeds(submitBatch(dbAs(env, 'devA'), { proposal: V2 }));
  });
  test('協力会社の開発者も v2 を submit できる', async () => {
    await seedAi(env);
    await assertSucceeds(submitBatch(dbAs(env, 'devB'), { uid: 'devB', proposal: V2 }));
  });
  test('最大の payload（全 20 問上限＋generated・edited とも上限ちょうど）の submit が通る', async () => {
    await seedAi(env, { aiDraft: aiDraftDoc({ generated: MAX_GENERATED, edited: MAX_EDITED }), answers: FULL_ANSWERS });
    await assertSucceeds(submitBatch(dbAs(env, 'devA'), { answers: FULL_ANSWERS, proposal: proposalV2(MAX_GENERATED, MAX_EDITED) }));
  });
  test('開発者が直した edited（generated と違う）で submit できる', async () => {
    const e = { ...EDITED, summary: '開発者が書き直した要約' };
    await seedAi(env, { aiDraft: aiDraftDoc({ edited: e }) });
    await assertSucceeds(submitBatch(dbAs(env, 'devA'), { proposal: proposalV2(GENERATED, e) }));
  });
  test('基本チェックが取れなかった下書き（siteCheck: null）でも submit できる', async () => {
    const g = { ...GENERATED, siteCheck: null };
    await seedAi(env, { aiDraft: aiDraftDoc({ generated: g }) });
    await assertSucceeds(submitBatch(dbAs(env, 'devA'), { proposal: proposalV2(g) }));
  });
  test('トランザクションでも v2 を submit できる', async () => {
    await seedAi(env);
    const db = dbAs(env, 'devA');
    await assertSucceeds(runTransaction(db, async (tx) => {
      await tx.get(doc(db, AI_PATH));
      tx.update(doc(db, 'projects/p1'), { requirements: { status: 'analyzed', revision: 1, analyzedAt: serverTimestamp() }, ...stamp('devA') });
      tx.update(doc(db, 'projects/p1/requirements/current'), { proposal: V2, proposalRevision: 1, ...stamp('devA') });
      tx.set(doc(db, 'projects/p1/approvals/requirements-r1-submit'), approvalDoc('devA', 'submit', 1, { answers: ANSWERS, proposal: V2 }));
    }));
  });
});

describe('submit v2: 拒否（偽造・欠け・版）', () => {
  const deny = (name, proposal, seedOpts = {}, opts = {}) => test(name, async () => {
    await seedAi(env, seedOpts);
    await assertFails(submitBatch(dbAs(env, opts.uid ?? 'devA'), { uid: opts.uid ?? 'devA', proposal, ...(opts.batch ?? {}) }));
  });
  deny('siteCheck を偽造（passed を水増し）→ 拒否', { ...V2, siteCheck: { ...V2.siteCheck, passed: 10 } });
  deny('origin を偽造（model を書き換え）→ 拒否', { ...V2, origin: { ...V2.origin, model: 'claude-opus-5-5' } });
  deny('hostname を偽造 → 拒否', { ...V2, hostname: 'evil.example' });
  deny('edited と違う要約 → 拒否', { ...V2, summary: '保存していない要約' });
  deny('edited と違うポイント（generated 側の値を出す）→ 拒否', proposalV2(GENERATED, EDITED), { aiDraft: aiDraftDoc({ edited: { ...EDITED, points: [] } }) });
  deny('purposes を submit 時の回答から作り直す（生成時と違う）→ 拒否', { ...V2, purposes: ['問い合わせを増やしたい'] });
  deny('提案に flags を含める → 拒否', { ...V2, flags: { unsupportedNumbers: [] } });
  deny('aiDraft が無い → 拒否', V2, { aiDraft: null });
  deny('aiDraft に generated が無い → 拒否', V2, { aiDraft: aiDraftDoc({ omit: ['generated'] }) });
  deny('aiDraft に edited が無い（確認していない）→ 拒否', V2, { aiDraft: aiDraftDoc({ edited: null }) });
  deny("aiDraft の state=='failed' → 拒否", V2, { aiDraft: aiDraftDoc({ state: 'failed' }) });
  deny('version:1 で v2 の形 → 拒否', { ...V2, version: 1 });
  deny('version:3 → 拒否', { ...V2, version: 3 });
  deny('v2 の欄が欠ける（draft なし）→ 拒否', (({ draft: _d, ...rest }) => rest)(V2));
  deny('v1 の形に version:2 だけ付ける → 拒否', { ...PROPOSAL, version: 2 });
  deny('お客様は v2 を submit できない', V2, {}, { uid: 'client1' });
  test('admin は担当外の案件でも v2 を submit できる（2026-11-26 R-2）', async () => {
    await seedAi(env);
    await assertSucceeds(submitBatch(dbAs(env, 'admin1'), { uid: 'admin1', proposal: V2 }));
  });
  deny('未アサインの開発者は v2 を submit できない', V2, {}, { uid: 'devC' });
  test('承認の写し（approvals）の proposal を改変 → 拒否', async () => {
    await seedAi(env);
    await assertFails(submitBatch(dbAs(env, 'devA'), { proposal: V2, mutate: { log: approvalDoc('devA', 'submit', 1, { answers: ANSWERS, proposal: { ...V2, summary: '写しだけ改変' } }) } }));
  });
});

describe('v2 の承認・差し戻し・再 submit', () => {
  test('お客様の approve で v2 の提案が写る', async () => {
    await seedAi(env, { reqState: 'analyzed', proposal: V2 });
    await assertSucceeds(approveBatch(dbAs(env, 'client1'), { proposal: V2 }));
  });
  test('お客様の approve で写しの v2 を改変 → 拒否', async () => {
    await seedAi(env, { reqState: 'analyzed', proposal: V2 });
    await assertFails(approveBatch(dbAs(env, 'client1'), { proposal: { ...V2, summary: '改変' } }));
  });
  test('withdraw → edited を直す（callable 相当）→ v2 で再 submit（revision 2）まで通る', async () => {
    await seedAi(env, { reqState: 'analyzed', proposal: V2 });
    const db = dbAs(env, 'devA');
    await assertSucceeds(withdrawBatch(db));
    const e = { ...EDITED, summary: '差し戻し後に直した要約' };
    await serverSaveEdited(e);
    await assertSucceeds(submitBatch(db, { fromRev: 1, proposal: proposalV2(GENERATED, e) }));
  });
  test('差し戻しの後、直す前の古い提案で再 submit → 拒否', async () => {
    await seedAi(env, { reqState: 'analyzed', proposal: V2 });
    const db = dbAs(env, 'devA');
    await assertSucceeds(withdrawBatch(db));
    await serverSaveEdited({ ...EDITED, summary: '直した' });
    await assertFails(submitBatch(db, { fromRev: 1, proposal: V2 }));
  });
});

describe('v1 の回帰（既存の文書・既存の画面の経路）', () => {
  test('v1 の提案（8 キー）の submit は aiDraft が無くても通る', async () => {
    await seedAi(env, { aiDraft: null });
    await assertSucceeds(submitBatch(dbAs(env, 'devA')));
  });
  test('v1 の既存の確認依頼中の文書をお客様が承認できる', async () => {
    await seedAi(env, { reqState: 'analyzed' });
    await assertSucceeds(approveBatch(dbAs(env, 'client1')));
  });
  test('v1 の既存の文書を差し戻して回答を更新できる', async () => {
    await seedAi(env, { reqState: 'analyzed' });
    const db = dbAs(env, 'devA');
    await assertSucceeds(withdrawBatch(db));
    await assertSucceeds(updateDoc(doc(db, 'projects/p1/requirements/current'), { 'answers.q-issue': '修正後', 'answerMeta.q-issue': { by: 'afro', at: serverTimestamp() }, ...stamp('devA') }));
  });
});
