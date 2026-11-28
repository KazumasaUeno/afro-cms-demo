// サイトマップの AI 下書きの上限の名前空間とフラグ（LIVE_SITEMAP_IMPL_PLAN §4 U-F2 part A・P-4・DATA §8・ユーザー決定 OQ-N3）。
// npm run test:functions（emulators:exec）からだけ動く。reserve / refund は純関数、releaseReservation は Firestore エミュレータで確かめる。
// 要件定義書の AI の鍵・上限・aiUsage の 4 項目（merge:false）が変わらないことの回帰を含む（SM-24 の一部。callable を通す分は part B の ai-sitemap-flow）
import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { assertDemoProject, emulatorHostFromEnv } from '../rules/guard.mjs';

const PROJECT = assertDemoProject(process.env.GCLOUD_PROJECT);
emulatorHostFromEnv('FIRESTORE_EMULATOR_HOST');
const freq = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp, getApps } = freq('firebase-admin/app');
const { getFirestore, Timestamp } = freq('firebase-admin/firestore');
const lib = (p) => freq(`./lib/ai/${p}.js`);
const { reserve, refund, userDayKey, currentDraftQuota, readUsage } = lib('quota');
const { releaseReservation } = lib('request');
const { AI_QUOTA, AI_QUOTA_SITEMAP, AI_MAX_TOKENS, SITEMAP_AI_LIMITS } = lib('limits');
const { SITEMAP_LIMITS } = lib('shared/sitemapRules');

if (!getApps().length) initializeApp({ projectId: PROJECT });
const db = getFirestore();
const DAY = '2026-11-20';
const T = Date.parse('2026-11-20T03:00:00Z');
const USAGE_KEYS = ['byDay', 'byUid', 'costMicroUsd', 'count'];
const empty = () => readUsage(undefined);
const exhausted = (fn, reason) => assert.throws(fn, (e) => (assert.equal(e.code, 'resource-exhausted'), assert.equal(e.message, reason), true));

// ---------- 定数（limits.ts の追加。既存値は変えない） ----------
test('limits: サイトマップの上限は要件定義書と同じ値の別枠・既存の AI_QUOTA と v2/v3 は不変', () => {
  assert.deepEqual({ ...AI_QUOTA_SITEMAP }, { projectPerDay: 5, projectPerMonth: 20, userPerDay: 10 });
  assert.deepEqual({ ...AI_QUOTA }, { projectPerDay: 5, projectPerMonth: 20, userPerDay: 10, globalPerMonth: 200 });
  assert.equal(AI_MAX_TOKENS.v2, 12_000);
  assert.equal(AI_MAX_TOKENS.v3, 24_000);
  assert.equal(AI_MAX_TOKENS.sitemap, 8_000);
  assert.equal(SITEMAP_AI_LIMITS.afterPages, SITEMAP_LIMITS.aiPages);
  assert.equal(SITEMAP_AI_LIMITS.navItems, 50);
});

// ---------- 鍵 ----------
test('userDayKey: 省略・requirements は従来の "{day}:{uid}"、sitemap は "sitemap:{day}:{uid}"', () => {
  assert.equal(userDayKey(DAY, 'u1'), `${DAY}:u1`);
  assert.equal(userDayKey(DAY, 'u1', 'requirements'), `${DAY}:u1`);
  assert.equal(userDayKey(DAY, 'u1', 'sitemap'), `sitemap:${DAY}:u1`);
});

// ---------- reserve ----------
test('reserve(sitemap): 利用者の日は sitemap: 鍵、全体の count と byDay は共用で 1 足す', () => {
  const r = reserve(currentDraftQuota(undefined, DAY), empty(), 'u1', 'sitemap');
  assert.deepEqual(r.usage.byUid, { [`sitemap:${DAY}:u1`]: 1 });
  assert.equal(r.usage.count, 1);
  assert.deepEqual(r.usage.byDay, { [DAY]: 1 });
  assert.deepEqual(r.quota, { day: DAY, dayCount: 1, month: '2026-11', monthCount: 1 });
  assert.deepEqual(Object.keys(r.usage).sort(), USAGE_KEYS);
});

test('reserve: 要件定義書を上限まで使っても、サイトマップの利用者の日は別に数える（逆も）', () => {
  const full = { count: 20, costMicroUsd: 0, byDay: { [DAY]: 20 }, byUid: { [`${DAY}:u1`]: AI_QUOTA.userPerDay } };
  exhausted(() => reserve(currentDraftQuota(undefined, DAY), full, 'u1'), 'quota-user-day');
  assert.equal(reserve(currentDraftQuota(undefined, DAY), full, 'u1', 'sitemap').usage.byUid[`sitemap:${DAY}:u1`], 1);
  const fullS = { count: 20, costMicroUsd: 0, byDay: {}, byUid: { [`sitemap:${DAY}:u1`]: AI_QUOTA_SITEMAP.userPerDay } };
  exhausted(() => reserve(currentDraftQuota(undefined, DAY), fullS, 'u1', 'sitemap'), 'quota-user-day');
  assert.equal(reserve(currentDraftQuota(undefined, DAY), fullS, 'u1').usage.byUid[`${DAY}:u1`], 1);
});

test('reserve(sitemap): 案件の日・月は AI_QUOTA_SITEMAP、全体の月は AI_QUOTA.globalPerMonth（合算）で止める', () => {
  exhausted(() => reserve({ day: DAY, dayCount: AI_QUOTA_SITEMAP.projectPerDay, month: '2026-11', monthCount: 5 }, empty(), 'u1', 'sitemap'), 'quota-project-day');
  exhausted(() => reserve({ day: DAY, dayCount: 0, month: '2026-11', monthCount: AI_QUOTA_SITEMAP.projectPerMonth }, empty(), 'u1', 'sitemap'), 'quota-project-month');
  const global = { ...empty(), count: AI_QUOTA.globalPerMonth };
  exhausted(() => reserve(currentDraftQuota(undefined, DAY), global, 'u1', 'sitemap'), 'quota-global-month');
  exhausted(() => reserve(currentDraftQuota(undefined, DAY), global, 'u1'), 'quota-global-month');
  // 199 回目までは両方とも通る（共用の count に 1 ずつ足す）
  const near = { ...empty(), count: AI_QUOTA.globalPerMonth - 2 };
  const a = reserve(currentDraftQuota(undefined, DAY), near, 'u1', 'sitemap');
  const b = reserve(currentDraftQuota(undefined, DAY), a.usage, 'u1');
  assert.equal(b.usage.count, AI_QUOTA.globalPerMonth);
  exhausted(() => reserve(currentDraftQuota(undefined, DAY), b.usage, 'u2', 'sitemap'), 'quota-global-month');
});

test('reserve(requirements): sitemap: 鍵を保ったまま書き戻す（readUsage が全鍵を写す）', () => {
  const u = readUsage({ count: 3, costMicroUsd: 7, byDay: { [DAY]: 3 }, byUid: { [`sitemap:${DAY}:u1`]: 2, [`${DAY}:u1`]: 1 } });
  const r = reserve(currentDraftQuota(undefined, DAY), u, 'u1');
  assert.deepEqual(r.usage.byUid, { [`sitemap:${DAY}:u1`]: 2, [`${DAY}:u1`]: 2 });
  assert.equal(r.usage.costMicroUsd, 7);
  const back = refund(r.quota, r.usage, DAY, 'u1');
  assert.deepEqual(back.usage.byUid, { [`sitemap:${DAY}:u1`]: 2, [`${DAY}:u1`]: 1 });
});

// ---------- refund ----------
test('refund(sitemap): sitemap: 鍵と共用の count・byDay を 1 戻す（要件定義書の鍵は触らない・0 未満にしない）', () => {
  const u = { count: 2, costMicroUsd: 0, byDay: { [DAY]: 2 }, byUid: { [`sitemap:${DAY}:u1`]: 1, [`${DAY}:u1`]: 1 } };
  const r = refund({ day: DAY, dayCount: 1, month: '2026-11', monthCount: 1 }, u, DAY, 'u1', 'sitemap');
  assert.deepEqual(r.usage.byUid, { [`sitemap:${DAY}:u1`]: 0, [`${DAY}:u1`]: 1 });
  assert.equal(r.usage.count, 1);
  assert.deepEqual(r.quota, { day: DAY, dayCount: 0, month: '2026-11', monthCount: 0 });
  const again = refund(r.quota, r.usage, DAY, 'u1', 'sitemap');
  assert.equal(again.usage.byUid[`sitemap:${DAY}:u1`], 0);
});

// ---------- releaseReservation（Firestore エミュレータ。aiUsage は merge:false で 4 項目だけ） ----------
const SM = 'projects/p1/aiDrafts/sitemap';
const RQ = 'projects/p1/aiDrafts/requirements';
const RID = '00000000-0000-4000-8000-000000000001';
const runningJob = () => ({ state: 'running', requestId: RID, by: 'u1', startedAt: Timestamp.fromMillis(T), leaseUntil: Timestamp.fromMillis(T + 60_000), quotaDay: DAY });

beforeEach(async () => {
  await Promise.all([db.doc(SM).delete(), db.doc(RQ).delete(), db.doc('aiUsage/202611').delete()]);
});

test('releaseReservation(scope sitemap): aiDrafts/sitemap の枠と sitemap: 鍵を戻し、要件定義書の鍵を保つ・aiUsage は 4 項目のまま', async () => {
  await db.doc(SM).set({ job: runningJob(), quota: { day: DAY, dayCount: 1, month: '2026-11', monthCount: 1 } });
  await db.doc('aiUsage/202611').set({ count: 2, costMicroUsd: 5, byDay: { [DAY]: 2 }, byUid: { [`sitemap:${DAY}:u1`]: 1, [`${DAY}:u1`]: 1 } });
  assert.equal(await releaseReservation(db, db.doc(SM), RID, () => T, 'u1', 'enqueue-failed', 'sitemap'), true);
  const u = (await db.doc('aiUsage/202611').get()).data();
  assert.deepEqual(Object.keys(u).sort(), USAGE_KEYS);
  assert.deepEqual(u, { count: 1, costMicroUsd: 5, byDay: { [DAY]: 1 }, byUid: { [`sitemap:${DAY}:u1`]: 0, [`${DAY}:u1`]: 1 } });
  const ai = (await db.doc(SM).get()).data();
  assert.equal(ai.job.state, 'idle');
  assert.deepEqual(ai.quota, { day: DAY, dayCount: 0, month: '2026-11', monthCount: 0 });
  assert.equal(ai.lastError.code, 'enqueue-failed');
});

test('releaseReservation（scope 省略＝要件定義書）: 従来どおり "{day}:{uid}" を戻し、sitemap: 鍵を消さない', async () => {
  await db.doc(RQ).set({ job: runningJob(), quota: { day: DAY, dayCount: 1, month: '2026-11', monthCount: 1 } });
  await db.doc('aiUsage/202611').set({ count: 2, costMicroUsd: 0, byDay: { [DAY]: 2 }, byUid: { [`sitemap:${DAY}:u1`]: 1, [`${DAY}:u1`]: 1 } });
  assert.equal(await releaseReservation(db, db.doc(RQ), RID, () => T, 'u1'), true);
  const u = (await db.doc('aiUsage/202611').get()).data();
  assert.deepEqual(Object.keys(u).sort(), USAGE_KEYS);
  assert.deepEqual(u.byUid, { [`sitemap:${DAY}:u1`]: 1, [`${DAY}:u1`]: 0 });
  assert.equal(u.count, 1);
  assert.equal((await db.doc(RQ).get()).data().lastError, undefined);
});

test('releaseReservation(sitemap): 別の requestId・running でない job は何もしない（false）', async () => {
  await db.doc(SM).set({ job: { ...runningJob(), requestId: '00000000-0000-4000-8000-000000000002' }, quota: { day: DAY, dayCount: 1, month: '2026-11', monthCount: 1 } });
  await db.doc('aiUsage/202611').set({ count: 1, costMicroUsd: 0, byDay: { [DAY]: 1 }, byUid: { [`sitemap:${DAY}:u1`]: 1 } });
  assert.equal(await releaseReservation(db, db.doc(SM), RID, () => T, 'u1', undefined, 'sitemap'), false);
  assert.equal((await db.doc('aiUsage/202611').get()).data().count, 1);
});

// ---------- フラグ（AI_SITEMAP_MODE。要件定義書の AI_REQUIREMENTS_MODE とは別の値） ----------
test('readSitemapFlags: AI_SITEMAP_MODE・ALLOWLIST を parseMode・parseAllowlist で読む（不明は off）。要件定義書のフラグとは独立', () => {
  const { readSitemapFlags, readFlags, generationAllowed } = lib('flags');
  const keep = { ...process.env };
  try {
    process.env.AI_REQUIREMENTS_MODE = 'on';
    process.env.AI_REQUIREMENTS_PROJECT_ALLOWLIST = '';
    process.env.AI_SITEMAP_MODE = ' Internal ';
    process.env.AI_SITEMAP_PROJECT_ALLOWLIST = 'p1, bad id ,p2';
    const s = readSitemapFlags();
    assert.deepEqual(s, { mode: 'internal', allowlist: ['p1', 'p2'] });
    assert.equal(readFlags().mode, 'on');
    assert.equal(generationAllowed(s, 'admin', 'p1'), true);
    assert.equal(generationAllowed(s, 'developer', 'p1'), false);
    assert.equal(generationAllowed(s, 'admin', 'p9'), false);
    process.env.AI_SITEMAP_MODE = 'yes';
    assert.equal(readSitemapFlags().mode, 'off');
    process.env.AI_REQUIREMENTS_MODE = 'off';
    process.env.AI_SITEMAP_MODE = 'on';
    assert.equal(readSitemapFlags().mode, 'on');
    assert.equal(readFlags().mode, 'off');
  } finally {
    for (const k of ['AI_REQUIREMENTS_MODE', 'AI_REQUIREMENTS_PROJECT_ALLOWLIST', 'AI_SITEMAP_MODE', 'AI_SITEMAP_PROJECT_ALLOWLIST']) {
      if (keep[k] === undefined) delete process.env[k];
      else process.env[k] = keep[k];
    }
  }
});
