// サイトマップの Rules（docs/design/LIVE_SITEMAP_IMPL_PLAN.md §4 U1-0・U1・§7、データ設計 LIVE_SITEMAP_DATA.md §2・§3.3、
// 脅威モデル docs/reviews/2026-11-28-live-sitemap-threat-model.md SM-01〜18）。
// 段 1（U1）: internal は admin・担当の get、版文書はお客様も get（list は admin・担当）、状態だけの 4 遷移（取り下げ・再計画・本人承認・代理承認）。
// 段 0（U1-0）: 案件の sitemap キーを許す（作成時は禁止）・sitemap/*・sitemapVersions/* は全拒否・承認の記録 kind sitemap は全拒否。
//   既存の要件定義書・スケジュール・相談の操作は sitemap キーを持つ案件でも通る（d0649c16 との差分の回帰）
// 中身（internal・版文書・submit）は callable（Admin SDK）だけが書く（P-1）。中身の検査は tests/functions/sitemap-*.test.mjs
import { after, before, describe, test } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { createRulesEnv } from './guard.mjs';
import { collection, deleteDoc, getDoc, getDocs } from 'firebase/firestore';
import {
  ANSWERS, PROPOSAL, SITE_NOTE, T0, USERS, deleteField, siteHash, approvalDoc, approveBatch, createProjectBatch, dbAs, doc, proxyApproveBatch, seed, serverTimestamp, setDoc, stamp, submitBatch, updateDoc, withdrawBatch, writeBatch,
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

describe('承認の記録 kind sitemap: submit と他の記録のふりは拒否（S-4）', () => {
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

// ================= 段 1（U1）: 読み取り（SM-01〜03）と状態の 4 遷移（SM-05〜07・09〜11・13）。G1 は adminRights.test.mjs TEST-09、変異は mutation.test.mjs =================
const unauth = () => env.unauthenticatedContext().firestore();
const NOTE_BAD = { 空: '', 空白だけ: ' 　 ', '201 字': 'あ'.repeat(201), 改行: '電話で\n確認', 'C0（U+0001）': '電話で\u0001確認', '向きの制御（U+202E）': '電話で‮確認' };
const DENY_READERS = {
  devC: () => dbAs(env, 'devC'), devP2: () => dbAs(env, 'devP2'), client2: () => dbAs(env, 'client2'), unauth, adminOff: () => dbAs(env, 'adminOff'),
  devOff: () => dbAs(env, 'devOff'), clientOff: () => dbAs(env, 'clientOff'), メール不一致: () => dbAs(env, 'admin1', { email: 'x@afro.example' }), 未確認メール: () => dbAs(env, 'admin1', { email_verified: false }),
};
/** 承認（本人・代理）の 1 バッチ。summary で要約を、log で記録を 1 か所崩す（undefined はその項目を落とす） */
function approveWith(db, { uid = 'client1', rev = 1, proxy = false, summary = {}, log = {}, aid, skip = [] } = {}) {
  const b = writeBatch(db);
  if (!skip.includes('project')) {
    b.update(doc(db, P), Object.fromEntries(Object.entries({
      'sitemap.status': 'approved', 'sitemap.approvedRevision': rev, 'sitemap.approvedAt': serverTimestamp(), 'sitemap.approvedBy': uid,
      'sitemap.approvalId': `sitemap-r${rev}-approve`, 'sitemap.approvedVia': proxy ? 'proxy' : deleteField(), ...stamp(uid), ...summary,
    }).filter(([, v]) => v !== undefined)));
  }
  if (!skip.includes('log')) {
    const l = siteLogDoc(uid, 'approve', rev, { contentHash: siteHash(rev), ...(proxy ? { proxy: true, note: SITE_NOTE } : {}), ...log });
    b.set(doc(db, ap(aid ?? `sitemap-r${rev}-approve`)), Object.fromEntries(Object.entries(l).filter(([, v]) => v !== undefined)));
  }
  return b.commit();
}
/** 取り下げ・再計画の 1 バッチ */
function moveWith(db, action, { uid = 'devA', rev = 1, summary = {}, log = {}, aid, skip = [] } = {}) {
  const b = writeBatch(db);
  if (!skip.includes('project')) b.update(doc(db, P), { 'sitemap.status': 'draft', ...stamp(uid), ...summary });
  if (!skip.includes('log')) {
    const l = siteLogDoc(uid, action, rev, { note: SITE_NOTE, ...log });
    b.set(doc(db, ap(aid ?? `sitemap-r${rev}-${action}`)), Object.fromEntries(Object.entries(l).filter(([, v]) => v !== undefined)));
  }
  return b.commit();
}

describe('SM-01〜03: 読み取り（S-1）', () => {
  for (const uid of ['admin1', 'devA', 'devB']) {
    test(`${uid}: internal・版文書の get・版文書の list → 許可`, async () => {
      await sitemapSeed(env, { state: 'requested' });
      const db = dbAs(env, uid);
      await assertSucceeds(getDoc(doc(db, INT)));
      await assertSucceeds(getDoc(doc(db, VER(1))));
      await assertSucceeds(getDocs(collection(db, `${P}/sitemapVersions`)));
      await assertSucceeds(getDoc(doc(db, `${P}/aiDrafts/sitemap`)));
      await assertFails(getDoc(doc(db, `${P}/sitemap/other`)));
    });
  }
  test('お客様: 版文書の get → 許可。internal・aiDrafts/sitemap の get・版文書の list → 拒否', async () => {
    await sitemapSeed(env, { state: 'requested' });
    const db = dbAs(env, 'client1');
    await assertSucceeds(getDoc(doc(db, VER(1))));
    await assertFails(getDoc(doc(db, INT)));
    await assertFails(getDoc(doc(db, `${P}/aiDrafts/sitemap`)));
    await assertFails(getDocs(collection(db, `${P}/sitemapVersions`)));
  });
  for (const [name, db] of Object.entries(DENY_READERS)) {
    test(`${name}: internal・版文書の get → 拒否`, async () => {
      await sitemapSeed(env, { state: 'requested' });
      await assertFails(getDoc(doc(db(), INT)));
      await assertFails(getDoc(doc(db(), VER(1))));
    });
  }
});

describe('取り下げ・再計画（AC-08・SM-09・S-8）', () => {
  for (const uid of ['devA', 'devB', 'admin1']) {
    test(`${uid}: 取り下げ（requested → draft）・再計画（approved → draft）→ 許可`, async () => {
      await sitemapSeed(env, { state: 'requested' });
      await assertSucceeds(siteWithdrawBatch(dbAs(env, uid), { uid }));
      await sitemapSeed(env, { state: 'approved' });
      await assertSucceeds(siteReopenBatch(dbAs(env, uid), { uid }));
    });
  }
  test('note 200 字ちょうど（前後の空白は数えない）→ 許可', async () => {
    await sitemapSeed(env, { state: 'requested' });
    await assertSucceeds(moveWith(dbAs(env, 'devA'), 'withdraw', { log: { note: ` ${'あ'.repeat(200)} ` } }));
  });
  for (const [name, note] of Object.entries({ ...NOTE_BAD, 無し: undefined })) {
    test(`note が ${name} → 取り下げ・再計画とも拒否`, async () => {
      await sitemapSeed(env, { state: 'requested' });
      await assertFails(moveWith(dbAs(env, 'devA'), 'withdraw', { log: { note } }));
      await sitemapSeed(env, { state: 'approved' });
      await assertFails(moveWith(dbAs(env, 'devA'), 'reopen', { log: { note } }));
    });
  }
  const DENY = {
    'お客様が取り下げ': ['requested', 'withdraw', { uid: 'client1' }],
    '担当外の開発者（devC）': ['requested', 'withdraw', { uid: 'devC' }],
    'draft で取り下げ': ['draft', 'withdraw', { rev: 0 }],
    'requested で再計画': ['requested', 'reopen', {}],
    'approved で取り下げ': ['approved', 'withdraw', {}],
    '記録だけ（要約を変えない）': ['requested', 'withdraw', { skip: ['project'] }],
    '要約だけ（記録なし）': ['requested', 'withdraw', { skip: ['log'] }],
    '要約の revision も変える': ['requested', 'withdraw', { summary: { 'sitemap.revision': 2 } }],
    '要約の contentHash も変える': ['requested', 'withdraw', { summary: { 'sitemap.contentHash': 'f'.repeat(64) } }],
    '古い版の ID（r0）': ['requested', 'withdraw', { aid: 'sitemap-r0-withdraw' }],
    '記録の revision が違う': ['requested', 'withdraw', { log: { revision: 2 } }],
    'side client': ['requested', 'withdraw', { log: { side: 'client' } }],
    "開発者が actorRole 'admin'": ['requested', 'withdraw', { log: { actorRole: 'admin' } }],
    'admin が actorRole なし': ['requested', 'withdraw', { uid: 'admin1', log: { actorRole: undefined } }],
    '名前を偽る': ['requested', 'withdraw', { log: { actorName: USERS.devB.name } }],
    '余分な項目（contentHash）': ['requested', 'withdraw', { log: { contentHash: siteHash(1) } }],
    'kind が無い': ['requested', 'withdraw', { log: { kind: undefined } }],
    "kind 'schedule'": ['requested', 'withdraw', { log: { kind: 'schedule' } }],
    'schedule-r1-withdraw に書く': ['requested', 'withdraw', { aid: 'schedule-r1-withdraw' }],
  };
  for (const [name, [state, action, opts]] of Object.entries(DENY)) {
    test(`${name} → 拒否`, async () => {
      await sitemapSeed(env, { state, ...(opts.rev === 0 ? { rev: 0 } : {}) });
      const uid = opts.uid ?? 'devA';
      await assertFails(moveWith(dbAs(env, uid), action, { ...opts, uid }));
    });
  }
  test('同じ ID の 2 回目（決定的 ID・AC-12）→ 拒否', async () => {
    await sitemapSeed(env, { state: 'requested' });
    await assertSucceeds(siteWithdrawBatch(dbAs(env, 'devA')));
    await addSummary(siteSummary({ state: 'requested' }));
    await assertFails(siteWithdrawBatch(dbAs(env, 'devA')));
  });
  test('版 50 → 許可、版 51 → 拒否（S-4）', async () => {
    await sitemapSeed(env, { state: 'none' });
    await addSummary(siteSummary({ state: 'requested', rev: 50 }));
    await assertSucceeds(siteWithdrawBatch(dbAs(env, 'devA'), { rev: 50 }));
    await addSummary(siteSummary({ state: 'requested', rev: 51 }));
    await assertFails(siteWithdrawBatch(dbAs(env, 'devA'), { rev: 51 }));
  });
});

describe('お客様の承認（SM-05・SM-07・S-5・S-6）', () => {
  test('表示した版の contentHash で承認 → 許可（版 2 でも）', async () => {
    await sitemapSeed(env, { state: 'requested' });
    await assertSucceeds(siteApproveBatch(dbAs(env, 'client1')));
    await sitemapSeed(env, { state: 'requested', rev: 2 });
    await assertSucceeds(siteApproveBatch(dbAs(env, 'client1'), { rev: 2 }));
  });
  test('前回の代理の印（approvedVia）は本人の承認で消える', async () => {
    await sitemapSeed(env, { state: 'none' });
    await addSummary({ ...siteSummary({ state: 'requested', rev: 2 }), approvedRevision: 1, approvedAt: T0, approvedBy: 'admin1', approvalId: 'sitemap-r1-approve', approvedVia: 'proxy' });
    await raw((db) => setDoc(doc(db, VER(2)), siteVersionDoc(2)));
    await assertSucceeds(siteApproveBatch(dbAs(env, 'client1'), { rev: 2 }));
  });
  const DENY = {
    'contentHash が版文書と違う（SM-07）': { log: { contentHash: 'f'.repeat(64) } },
    '前の版の contentHash': { log: { contentHash: siteHash(2) } },
    'contentHash が無い': { log: { contentHash: undefined } },
    '要約の contentHash を自分の値へ書き換える（M-2）': { summary: { 'sitemap.contentHash': 'f'.repeat(64) }, log: { contentHash: 'f'.repeat(64) } },
    '要約の contentHash だけ書き換える（M-2）': { summary: { 'sitemap.contentHash': 'f'.repeat(64) } },
    '要約の revision を変える': { summary: { 'sitemap.revision': 2 } },
    '要約の approvedVia proxy': { summary: { 'sitemap.approvedVia': 'proxy' } },
    '要約の approvedBy が別人': { summary: { 'sitemap.approvedBy': 'client2' } },
    '要約の approvalId が違う': { summary: { 'sitemap.approvalId': 'sitemap-r2-approve' } },
    '要約の approvedRevision が違う': { summary: { 'sitemap.approvedRevision': 2 } },
    '記録に proxy': { log: { proxy: true } },
    '記録に note': { log: { note: SITE_NOTE } },
    'side afro': { log: { side: 'afro' } },
    "actorRole 'admin'": { log: { actorRole: 'admin' } },
    'actorUid を偽る': { log: { actorUid: 'client2' } },
    'actorEmail を偽る': { log: { actorEmail: USERS.client2.email } },
    '余分な項目（pageCount）': { log: { pageCount: { before: 2, after: 2 } } },
    '古い版の ID（r2 の承認）': { aid: 'sitemap-r2-approve' },
    '記録だけ': { skip: ['project'] },
    '要約だけ': { skip: ['log'] },
  };
  for (const [name, opts] of Object.entries(DENY)) {
    test(`${name} → 拒否`, async () => {
      await sitemapSeed(env, { state: 'requested' });
      await assertFails(approveWith(dbAs(env, 'client1'), opts));
    });
  }
  test('draft・approved で承認、他案件のお客様・開発者の承認 → 拒否', async () => {
    await sitemapSeed(env, { state: 'draft', rev: 1 });
    await assertFails(siteApproveBatch(dbAs(env, 'client1')));
    await sitemapSeed(env, { state: 'approved' });
    await assertFails(siteApproveBatch(dbAs(env, 'client1')));
    await sitemapSeed(env, { state: 'requested' });
    await assertFails(siteApproveBatch(dbAs(env, 'client2'), { uid: 'client2' }));
    await assertFails(approveWith(dbAs(env, 'devA'), { uid: 'devA' }));
    await assertFails(approveWith(dbAs(env, 'devA'), { uid: 'devA', log: { side: 'client' } }));
  });
  test('再計画の後に旧版の承認 ID（SM-10）→ 拒否', async () => {
    await sitemapSeed(env, { state: 'approved' });
    await assertSucceeds(siteReopenBatch(dbAs(env, 'devA')));
    await assertFails(siteApproveBatch(dbAs(env, 'client1')));
  });
});

describe('代理承認（SM-06・S-5）', () => {
  test('正しい形 → 許可', async () => {
    await sitemapSeed(env, { state: 'requested' });
    await assertSucceeds(siteProxyBatch(dbAs(env, 'admin1')));
  });
  for (const [name, note] of Object.entries({ ...NOTE_BAD, 無し: undefined })) {
    test(`note が ${name} → 拒否`, async () => {
      await sitemapSeed(env, { state: 'requested' });
      await assertFails(approveWith(dbAs(env, 'admin1'), { uid: 'admin1', proxy: true, log: { note } }));
    });
  }
  const DENY = {
    'proxy が無い': { log: { proxy: undefined } },
    'actorRole が無い': { log: { actorRole: undefined } },
    'side client': { log: { side: 'client' } },
    '要約に approvedVia が無い': { summary: { 'sitemap.approvedVia': deleteField() } },
    'contentHash が違う': { log: { contentHash: 'f'.repeat(64) } },
    '要約の contentHash を変える（M-2）': { summary: { 'sitemap.contentHash': 'f'.repeat(64) } },
    'actorUid が別の admin': { log: { actorUid: 'admin2' } },
  };
  for (const [name, opts] of Object.entries(DENY)) {
    test(`${name} → 拒否`, async () => {
      await sitemapSeed(env, { state: 'requested' });
      await assertFails(approveWith(dbAs(env, 'admin1'), { uid: 'admin1', proxy: true, ...opts }));
    });
  }
  test('開発者（担当）の代理承認 → 拒否', async () => {
    await sitemapSeed(env, { state: 'requested' });
    await assertFails(approveWith(dbAs(env, 'devA'), { uid: 'devA', proxy: true }));
  });
});

describe('アーカイブ・要件定義書の状態（SM-13・SM-14・S-3）', () => {
  const OPS4 = {
    取り下げ: ['requested', (db) => siteWithdrawBatch(db)], 再計画: ['approved', (db) => siteReopenBatch(db)],
    本人の承認: ['requested', (db) => siteApproveBatch(db)], 代理承認: ['requested', (db) => siteProxyBatch(db)],
  };
  const who = { 取り下げ: 'devA', 再計画: 'devA', 本人の承認: 'client1', 代理承認: 'admin1' };
  for (const [name, [state, run]] of Object.entries(OPS4)) {
    test(`アーカイブ中の${name} → 拒否（読み取りは可）`, async () => {
      await sitemapSeed(env, { state });
      await raw((db) => updateDoc(doc(db, P), { archived: true }));
      await assertFails(run(dbAs(env, who[name])));
      await assertSucceeds(getDoc(doc(dbAs(env, 'client1'), VER(1))));
      await assertSucceeds(getDoc(doc(dbAs(env, 'devA'), INT)));
    });
    test(`要件定義書が approved でない案件の${name} → 拒否`, async () => {
      await sitemapSeed(env, { state });
      await raw((db) => updateDoc(doc(db, P), { 'requirements.status': 'analyzed' }));
      await assertFails(run(dbAs(env, who[name])));
    });
  }
  test('アーカイブと取り下げを同じバッチ → 拒否', async () => {
    await sitemapSeed(env, { state: 'requested' });
    await assertFails(moveWith(dbAs(env, 'devA'), 'withdraw', { summary: { archived: true } }));
  });
});

describe('SM-11: 他の承認との分離', () => {
  test("kind 'sitemap' で requirements-r1-approve → 拒否／kind 'requirements' で sitemap-r1-approve → 拒否", async () => {
    await sitemapSeed(env, { state: 'requested' });
    await assertFails(approveWith(dbAs(env, 'client1'), { aid: 'requirements-r1-approve' }));
    await assertFails(approveWith(dbAs(env, 'client1'), { log: { kind: 'requirements' } }));
  });
  test('サイトマップの承認後もスケジュールの取り下げ・承認が通る', async () => {
    await scheduleSeed(env, { state: 'requested' });
    await addSummary(siteSummary({ state: 'approved' }));
    await assertSucceeds(schedApproveBatch(dbAs(env, 'client1')));
  });
});
