// ログアウト前後の書き込み待ち（src/live/pendingWrites.ts）の単体テスト。実行: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cancelScheduledWrites, DISCARDED_ON_SIGN_OUT, flushBeforeSignOut } from '../../src/live/pendingWrites.ts';

test('flushBeforeSignOut: 保存できたら saved', async () => {
  assert.equal(await flushBeforeSignOut(async () => true, 1000), 'saved');
});

test('flushBeforeSignOut: saveNow が false なら failed（ログアウトさせない）', async () => {
  assert.equal(await flushBeforeSignOut(async () => false, 1000), 'failed');
});

test('flushBeforeSignOut: saveNow が例外でも failed', async () => {
  assert.equal(await flushBeforeSignOut(() => Promise.reject(new Error('x')), 1000), 'failed');
});

test('flushBeforeSignOut: 終わらない保存（オフライン）は timeout。タイマーは片付ける', async () => {
  let cleared = 0;
  const r = await flushBeforeSignOut(() => new Promise(() => {}), 5, undefined, (t) => { cleared++; clearTimeout(t); });
  assert.equal(r, 'timeout');
  assert.equal(cleared, 1);
});

test('flushBeforeSignOut: 保存が先に終われば timeout のタイマーを止める', async () => {
  let cleared = 0;
  const r = await flushBeforeSignOut(async () => true, 60_000, undefined, (t) => { cleared++; clearTimeout(t); });
  assert.equal(r, 'saved');
  assert.equal(cleared, 1);
});

test('cancelScheduledWrites: 予約をすべて止め、待っている呼び出し元へ失敗を返す', async () => {
  const fired = [];
  const timers = new Map();
  const waits = ['p1', 'p2'].map((pid) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => fired.push(pid), 20);
    timers.set(pid, { timer, resolve, reject });
  }));
  const cleared = [];
  const n = cancelScheduledWrites(timers, (t) => { cleared.push(t); clearTimeout(t); });
  assert.equal(n, 2);
  assert.equal(timers.size, 0);
  assert.equal(cleared.length, 2);
  for (const w of waits) await assert.rejects(w, { message: DISCARDED_ON_SIGN_OUT });
  await new Promise((r) => setTimeout(r, 40));
  assert.deepEqual(fired, [], 'アンマウント後に書き込みが走らない');
});

test('cancelScheduledWrites: 予約が無ければ 0', () => {
  assert.equal(cancelScheduledWrites(new Map()), 0);
});
