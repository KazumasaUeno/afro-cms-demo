// AI 下書き projects/{pid}/aiDrafts/requirements と aiUsage/{yyyymm} の Rules（設計 docs/design/AI_REQUIREMENTS.md §7、
// 実装計画 §4 U1「edited の Rules」・HIGH-3、§11 T-10）。
// - お客様は下書きを読めない。読めるのはアサインされた開発者と admin
// - 代替 F-a（計画 L-b）: 最大の payload の edited 更新が Rules の 1000 式の上限を超えたため、クライアントからの書き込みは全員拒否。
//   edited の保存は callable saveAiDraftEdits（U2）。edited の形・上限の検査ケースは aiEditedCases.mjs（U2 が callable 版へ写す）
import { after, before, describe, test } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, getDoc, getDocs, query, setDoc as setDocFs } from 'firebase/firestore';
import { createRulesEnv } from './guard.mjs';
import { ANSWERS, PROPOSAL, approvalDoc, dbAs, doc, serverTimestamp, stamp, updateDoc, writeBatch } from './fixtures.mjs';
import { AI_PATH, EDITED, GENERATED, MAX_EDITED, MAX_GENERATED, PAST_TS, aiDraftDoc, editPayload, proposalV2, seedAi } from './aiFixtures.mjs';

let env;
before(async () => { env = await createRulesEnv(); });
after(async () => { await env?.clearFirestore(); await env?.cleanup(); });

const unauth = () => env.unauthenticatedContext().firestore();
const changedEdited = { ...EDITED, summary: '開発者が直した要約です。' };

describe('aiDrafts: 読み取り（お客様は不可）', () => {
  test('アサインされた開発者（社内・協力会社）と admin は get できる', async () => {
    await seedAi(env);
    await assertSucceeds(getDoc(doc(dbAs(env, 'devA'), AI_PATH)));
    await assertSucceeds(getDoc(doc(dbAs(env, 'devB'), AI_PATH)));
    await assertSucceeds(getDoc(doc(dbAs(env, 'admin1'), AI_PATH)));
  });
  test('アサインされた開発者と admin は案件の aiDrafts を list できる', async () => {
    await seedAi(env);
    await assertSucceeds(getDocs(collection(dbAs(env, 'devA'), 'projects/p1/aiDrafts')));
    await assertSucceeds(getDocs(collection(dbAs(env, 'admin1'), 'projects/p1/aiDrafts')));
  });
  test('お客様（その案件）は get できない', async () => {
    await seedAi(env);
    await assertFails(getDoc(doc(dbAs(env, 'client1'), AI_PATH)));
  });
  test('お客様（その案件）は list できない', async () => {
    await seedAi(env);
    await assertFails(getDocs(collection(dbAs(env, 'client1'), 'projects/p1/aiDrafts')));
  });
  test('他案件のお客様は get できない', async () => {
    await seedAi(env);
    await assertFails(getDoc(doc(dbAs(env, 'client2'), AI_PATH)));
  });
  test('未アサインの開発者は get できない', async () => {
    await seedAi(env);
    await assertFails(getDoc(doc(dbAs(env, 'devC'), AI_PATH)));
  });
  test('未アサインの開発者は list できない', async () => {
    await seedAi(env);
    await assertFails(getDocs(query(collection(dbAs(env, 'devC'), 'projects/p1/aiDrafts'))));
  });
  test('未認証・無効化された開発者は get できない', async () => {
    await seedAi(env);
    await assertFails(getDoc(doc(unauth(), AI_PATH)));
    await assertFails(getDoc(doc(dbAs(env, 'devOff'), AI_PATH)));
  });
});

describe('aiDrafts: クライアントからの書き込みは全員拒否（代替 F-a。edited の保存は callable saveAiDraftEdits）', () => {
  const deny = (name, payload, { uid = 'devA', seedOpts = {} } = {}) => test(name, async () => {
    await seedAi(env, seedOpts);
    await assertFails(updateDoc(doc(dbAs(env, uid), AI_PATH), typeof payload === 'function' ? payload(uid) : payload));
  });
  // 正しい形の edited でも拒否（F-a）。検査ケースは aiEditedCases.mjs（U2 が callable のテストへ写す）
  deny('アサインされた開発者（社内）の正しい edited 保存 → 拒否', (u) => editPayload(u, changedEdited));
  deny('アサインされた開発者（協力会社）の正しい edited 保存 → 拒否', (u) => editPayload(u, EDITED), { uid: 'devB' });
  deny('edited がまだ無い下書きへの初回保存 → 拒否', (u) => editPayload(u, EDITED), { seedOpts: { aiDraft: aiDraftDoc({ edited: null }) } });
  deny('最大の payload の edited 保存 → 拒否（Rules では上限を超えるため callable へ）', (u) => editPayload(u, MAX_EDITED), { seedOpts: { aiDraft: aiDraftDoc({ generated: MAX_GENERATED, edited: null }) } });
  deny('admin は edited を書けない（再生成は関数経由だけ。L-4）', (u) => editPayload(u, changedEdited), { uid: 'admin1' });
  deny('未アサインの開発者は edited を書けない', (u) => editPayload(u, changedEdited), { uid: 'devC' });
  deny('お客様は edited を書けない', (u) => editPayload(u, changedEdited), { uid: 'client1' });
  deny('無効化された開発者は edited を書けない', (u) => editPayload(u, changedEdited), { uid: 'devOff' });
  test('未認証は edited を書けない', async () => {
    await seedAi(env);
    await assertFails(updateDoc(doc(unauth(), AI_PATH), { edited: changedEdited, updatedAt: serverTimestamp(), updatedBy: 'x' }));
  });
  // サーバー欄（Functions だけが書く）
  deny('開発者が generated を書き換える → 拒否', (u) => editPayload(u, EDITED, { generated: { ...GENERATED, hostname: 'evil.example' } }));
  deny('開発者が job を書き換える → 拒否', (u) => ({ job: { state: 'running', requestId: 'x' }, ...stamp(u) }));
  deny('開発者が quota を書き換える → 拒否', (u) => ({ quota: { day: '2026-11-20', dayCount: 0, month: '2026-11', monthCount: 0 }, ...stamp(u) }));
  deny('開発者が usage を書き換える → 拒否', (u) => ({ usage: { input: 0, output: 0, cacheRead: 0, costMicroUsd: 0 }, ...stamp(u) }));
  deny('開発者が lastError を書く → 拒否', (u) => ({ lastError: { code: 'x', at: serverTimestamp(), requestId: 'r' }, ...stamp(u) }));
  deny('開発者が discardLog を書き換える → 拒否', (u) => ({ discardLog: [{ by: 'devA', at: PAST_TS, role: 'admin' }], ...stamp(u) }));
  deny('要件が analyzed（確認依頼中）→ 更新不可', (u) => editPayload(u, changedEdited), { seedOpts: { reqState: 'analyzed' } });
});

describe('aiDrafts: 同じバッチでの編集と確認依頼・作成・削除', () => {
  test('同じバッチで edited を変えて submit する → 拒否', async () => {
    await seedAi(env);
    const db = dbAs(env, 'devA');
    const b = writeBatch(db);
    const proposal = proposalV2(GENERATED, changedEdited); // submit 側は新しい edited と一致させる（拒否の原因を edited 側に限る）
    b.update(doc(db, AI_PATH), editPayload('devA', changedEdited));
    b.update(doc(db, 'projects/p1'), { requirements: { status: 'analyzed', revision: 1, analyzedAt: serverTimestamp() }, ...stamp('devA') });
    b.update(doc(db, 'projects/p1/requirements/current'), { proposal, proposalRevision: 1, ...stamp('devA') });
    b.set(doc(db, 'projects/p1/approvals/requirements-r1-submit'), approvalDoc('devA', 'submit', 1, { answers: ANSWERS, proposal }));
    await assertFails(b.commit());
  });
  test('開発者は aiDrafts を作れない（作成は Functions だけ）', async () => {
    await seedAi(env, { aiDraft: null });
    await assertFails(setDocFs(doc(dbAs(env, 'devA'), AI_PATH), aiDraftDoc()));
    await assertFails(setDocFs(doc(dbAs(env, 'admin1'), AI_PATH), aiDraftDoc()));
  });
  test('別名の文書（aiDrafts/other）にも書けない', async () => {
    await seedAi(env);
    await assertFails(setDocFs(doc(dbAs(env, 'devA'), 'projects/p1/aiDrafts/other'), { edited: EDITED, ...stamp('devA') }));
  });
  test('開発者・admin とも aiDrafts を削除できない', async () => {
    await seedAi(env);
    await assertFails(deleteDoc(doc(dbAs(env, 'devA'), AI_PATH)));
    await assertFails(deleteDoc(doc(dbAs(env, 'admin1'), AI_PATH)));
  });
  test('対照: v1 の提案（PROPOSAL）の submit は aiDrafts があっても通る', async () => {
    await seedAi(env);
    const db = dbAs(env, 'devA');
    const b = writeBatch(db);
    b.update(doc(db, 'projects/p1'), { requirements: { status: 'analyzed', revision: 1, analyzedAt: serverTimestamp() }, ...stamp('devA') });
    b.update(doc(db, 'projects/p1/requirements/current'), { proposal: PROPOSAL, proposalRevision: 1, ...stamp('devA') });
    b.set(doc(db, 'projects/p1/approvals/requirements-r1-submit'), approvalDoc('devA', 'submit', 1, { answers: ANSWERS, proposal: PROPOSAL }));
    await assertSucceeds(b.commit());
  });
});

describe('aiUsage: admin だけが読める・誰も書けない', () => {
  const USAGE = 'aiUsage/202611';
  test('admin は get できる', async () => {
    await seedAi(env);
    await assertSucceeds(getDoc(doc(dbAs(env, 'admin1'), USAGE)));
  });
  test('admin は list できる', async () => {
    await seedAi(env);
    await assertSucceeds(getDocs(collection(dbAs(env, 'admin1'), 'aiUsage')));
  });
  test('開発者は get・list できない', async () => {
    await seedAi(env);
    await assertFails(getDoc(doc(dbAs(env, 'devA'), USAGE)));
    await assertFails(getDocs(collection(dbAs(env, 'devA'), 'aiUsage')));
  });
  test('お客様・未認証は get・list できない', async () => {
    await seedAi(env);
    await assertFails(getDoc(doc(dbAs(env, 'client1'), USAGE)));
    await assertFails(getDocs(collection(dbAs(env, 'client1'), 'aiUsage')));
    await assertFails(getDoc(doc(unauth(), USAGE)));
  });
  test('admin を含む全員が書けない（作成・更新・削除）', async () => {
    await seedAi(env);
    for (const uid of ['admin1', 'devA', 'client1']) {
      const db = dbAs(env, uid);
      await assertFails(updateDoc(doc(db, USAGE), { count: 0 }));
      await assertFails(setDocFs(doc(db, 'aiUsage/202612'), { count: 0, costMicroUsd: 0, byDay: {}, byUid: {} }));
      await assertFails(deleteDoc(doc(db, USAGE)));
    }
  });
});
