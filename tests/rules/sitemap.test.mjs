// サイトマップの Rules（docs/design/LIVE_SITEMAP_IMPL_PLAN.md §4 U1-0・U1・§7、データ設計 LIVE_SITEMAP_DATA.md §2・§3.3、
// 脅威モデル docs/reviews/2026-11-28-live-sitemap-threat-model.md SM-01〜18）。
// 段 0（U1-0）: 案件の sitemap キーを許す（作成時は禁止）・sitemap/*・sitemapVersions/* は全拒否・承認の記録 kind sitemap は全拒否。
//   既存の要件定義書・スケジュール・相談の操作は sitemap キーを持つ案件でも通る（d0649c16 との差分の回帰）
// 中身（internal・版文書・submit）は callable（Admin SDK）だけが書く（P-1）。中身の検査は tests/functions/sitemap-*.test.mjs
import { after, before, describe, test } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { createRulesEnv } from './guard.mjs';
import { deleteDoc, getDoc } from 'firebase/firestore';
import {
  ANSWERS, PROPOSAL, USERS, approvalDoc, approveBatch, createProjectBatch, dbAs, doc, proxyApproveBatch, seed, serverTimestamp, setDoc, stamp, submitBatch, updateDoc, withdrawBatch, writeBatch,
  scheduleSeed, schedApproveBatch, schedInitBatch, schedProxyBatch, schedReopenBatch, schedSaveBatch, schedSubmitBatch, schedWithdrawBatch,
  siteApproveBatch, siteInternalDoc, siteLogDoc, siteProxyBatch, siteReopenBatch, siteSummary, siteVersionDoc, siteWithdrawBatch, sitemapSeed,
} from './fixtures.mjs';

let env;
before(async () => { env = await createRulesEnv(); });
after(async () => { await env?.clearFirestore(); await env?.cleanup(); });

const P = 'projects/p1';
const INT = `${P}/sitemap/internal`;
const VER = (n) => `${P}/sitemapVersions/r${n}`;
const ap = (aid) => `${P}/approvals/${aid}`;
const raw = (fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));
/** 案件 p1 に sitemap の要約を置く（Rules を通さない） */
const addSummary = (summary = siteSummary({ state: 'approved' })) => raw((db) => updateDoc(doc(db, P), { sitemap: summary }));
const upd = (uid, data) => updateDoc(doc(dbAs(env, uid), P), { ...data, ...stamp(uid) });
const ALL = ['admin1', 'devA', 'devB', 'client1'];

// ================= 段 0（U1-0） =================

describe('段 0: sitemap を持つ案件でも既存の操作が通る（validProject の hasOnly。SM-18）', () => {
  for (const uid of ['devA', 'admin1']) {
    test(`${uid}: 基本情報の変更・アーカイブ／解除 → 許可`, async () => {
      await seed(env);
      await addSummary();
      await assertSucceeds(upd(uid, { siteName: '新しいサイト名' }));
      await assertSucceeds(upd(uid, { archived: true }));
      await assertSucceeds(upd(uid, { archived: false }));
    });
    test(`${uid}: 要件定義書の確認依頼・差し戻し → 許可`, async () => {
      await seed(env);
      await addSummary(siteSummary({ state: 'draft' }));
      await assertSucceeds(submitBatch(dbAs(env, uid), { uid }));
      await assertSucceeds(withdrawBatch(dbAs(env, uid), { uid }));
    });
  }
  test('admin: アサインの変更 → 許可', async () => {
    await seed(env);
    await addSummary();
    await assertSucceeds(upd('admin1', { memberUids: ['devA', 'devC'] }));
  });
  test('要件定義書のお客様の承認・admin の代理承認 → 許可', async () => {
    await seed(env, { reqState: 'analyzed' });
    await addSummary(siteSummary({ state: 'draft' }));
    await assertSucceeds(approveBatch(dbAs(env, 'client1')));
    await seed(env, { reqState: 'analyzed' });
    await addSummary(siteSummary({ state: 'draft' }));
    await assertSucceeds(proxyApproveBatch(dbAs(env, 'admin1')));
  });
  test('お客様の相談（consult）→ 許可', async () => {
    await seed(env);
    await addSummary();
    const db = dbAs(env, 'client1');
    const b = writeBatch(db);
    b.set(doc(db, 'projects/p1/messages/000001'), { schemaVersion: 1, seq: 1, text: '確認しました', side: 'client', authorUid: 'client1', authorName: USERS.client1.name, at: serverTimestamp() });
    b.update(doc(db, P), { consult: { count: 1, lastAt: serverTimestamp(), lastSide: 'client', lastName: USERS.client1.name } });
    await assertSucceeds(b.commit());
  });
  test('既存の分岐からは sitemap を書けない（基本情報・アーカイブ・アサインと一緒に変える → 拒否）', async () => {
    await seed(env);
    await addSummary(siteSummary({ state: 'requested' }));
    await assertFails(upd('devA', { siteName: '新しいサイト名', 'sitemap.status': 'approved' }));
    await assertFails(upd('admin1', { archived: true, 'sitemap.status': 'draft' }));
    await assertFails(upd('admin1', { memberUids: ['devA'], 'sitemap.status': 'draft' }));
  });
  test('要約だけを好きな値で書く（none → approved）→ 全員拒否', async () => {
    await seed(env, { reqState: 'approved' });
    for (const uid of ALL) await assertFails(upd(uid, { sitemap: { status: 'approved', revision: 5, approvedRevision: 5 } }));
  });
});

describe('段 0: スケジュールの全操作が sitemap を持つ案件でも通る（d0649c16 との差分の回帰）', () => {
  const withSite = async (state, extra = {}) => { await scheduleSeed(env, { state, ...extra }); await addSummary(siteSummary({ state: 'draft' })); };
  test('init → 許可', async () => { await withSite('none'); await assertSucceeds(schedInitBatch(dbAs(env, 'devA'))); });
  test('WBS・完了印・担当の同時保存 → 許可', async () => { await withSite('approved', { done: false }); await assertSucceeds(schedSaveBatch(dbAs(env, 'devA'))); });
  test('承認の依頼（submit）→ 許可', async () => { await withSite('draft'); await assertSucceeds(schedSubmitBatch(dbAs(env, 'devA'))); });
  test('取り下げ（withdraw）→ 許可', async () => { await withSite('requested'); await assertSucceeds(schedWithdrawBatch(dbAs(env, 'devA'))); });
  test('お客様の承認 → 許可', async () => { await withSite('requested'); await assertSucceeds(schedApproveBatch(dbAs(env, 'client1'))); });
  test('admin の代理承認 → 許可', async () => { await withSite('requested'); await assertSucceeds(schedProxyBatch(dbAs(env, 'admin1'))); });
  test('再計画（reopen）→ 許可', async () => { await withSite('approved'); await assertSucceeds(schedReopenBatch(dbAs(env, 'devA'))); });
});

describe('段 0: 案件の作成で sitemap を持たせない（S-10）', () => {
  test('開発者・admin が sitemap 付きで作る → 拒否（無ければ許可）', async () => {
    await seed(env);
    await assertFails(createProjectBatch(dbAs(env, 'devA'), { mutate: { project: { sitemap: { status: 'approved', revision: 1 } } } }));
    await assertFails(createProjectBatch(dbAs(env, 'admin1'), { uid: 'admin1', pid: 'p8', key: 'admin-site.example.jp', mutate: { project: { memberUids: [], sitemap: { status: 'draft', revision: 0 } } } }));
    await assertFails(createProjectBatch(dbAs(env, 'devA'), { mutate: { project: { sitemap: 'draft' } } }));
    await assertSucceeds(createProjectBatch(dbAs(env, 'devA')));
  });
});

describe('sitemap/*・sitemapVersions/* はクライアントから書けない（admin を含む全員。P-1・AC-11・SM-08）', () => {
  for (const uid of ALL) {
    test(`${uid}: internal・版文書・任意の ID の create／update／delete → 拒否`, async () => {
      await sitemapSeed(env, { state: 'requested' });
      const db = dbAs(env, uid);
      await assertFails(setDoc(doc(db, `${P}/sitemap/x`), siteInternalDoc()));
      await assertFails(setDoc(doc(db, VER(2)), siteVersionDoc(2)));
      await assertFails(updateDoc(doc(db, INT), { editSeq: 4 }));
      await assertFails(updateDoc(doc(db, VER(1)), { contentHash: 'f'.repeat(64) }));
      await assertFails(deleteDoc(doc(db, INT)));
      await assertFails(deleteDoc(doc(db, VER(1))));
    });
  }
  test('internal が無い案件で create（初回の作成のふり）→ 拒否', async () => {
    await sitemapSeed(env, { state: 'none' });
    for (const uid of ALL) await assertFails(setDoc(doc(dbAs(env, uid), INT), siteInternalDoc({ editSeq: 0 })));
  });
});

describe('段 0: sitemap/*・sitemapVersions/* は誰も読めない', () => {
  for (const uid of ALL) {
    test(`${uid}: internal・版文書の get → 拒否`, async () => {
      await sitemapSeed(env, { state: 'requested' });
      await assertFails(getDoc(doc(dbAs(env, uid), INT)));
      await assertFails(getDoc(doc(dbAs(env, uid), VER(1))));
    });
  }
});

describe('段 0: 承認の記録 kind sitemap は全拒否（S-4）', () => {
  test('正しい形の取り下げ・本人承認・代理承認・再計画 → 拒否', async () => {
    await sitemapSeed(env, { state: 'requested' });
    await assertFails(siteWithdrawBatch(dbAs(env, 'devA')));
    await assertFails(siteWithdrawBatch(dbAs(env, 'admin1'), { uid: 'admin1' }));
    await assertFails(siteApproveBatch(dbAs(env, 'client1')));
    await assertFails(siteProxyBatch(dbAs(env, 'admin1')));
    await sitemapSeed(env, { state: 'approved' });
    await assertFails(siteReopenBatch(dbAs(env, 'devA')));
  });
  test('submit の記録（クライアントは submit を書けない）→ 全員拒否', async () => {
    await sitemapSeed(env, { state: 'draft' });
    for (const uid of ['admin1', 'devA']) {
      const db = dbAs(env, uid);
      const b = writeBatch(db);
      b.update(doc(db, P), { 'sitemap.status': 'requested', 'sitemap.revision': 1, 'sitemap.requestedAt': serverTimestamp(), 'sitemap.contentHash': 'a'.repeat(64), ...stamp(uid) });
      b.set(doc(db, ap('sitemap-r1-submit')), siteLogDoc(uid, 'submit', 1, { contentHash: 'a'.repeat(64), pageCount: { before: 2, after: 2 } }));
      await assertFails(b.commit());
    }
  });
  test("kind 'sitemap' で requirements-r1-submit・schedule-r1-submit（他の記録のふり）→ 拒否", async () => {
    await seed(env);
    await assertFails(submitBatch(dbAs(env, 'devA'), { mutate: { log: { ...approvalDoc('devA', 'submit', 1, { answers: ANSWERS, proposal: PROPOSAL }), kind: 'sitemap' } } }));
    await scheduleSeed(env, { state: 'draft' });
    const db = dbAs(env, 'devA');
    await assertFails(setDoc(doc(db, ap('schedule-r1-submit')), siteLogDoc('devA', 'submit', 1)));
  });
});
