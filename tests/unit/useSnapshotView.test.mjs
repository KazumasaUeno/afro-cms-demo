// useSnapshot のいま出す値（src/live/useSnapshot.ts snapshotView。U3 レビュー Major-1: 読み足す間に会話を空にしない）。実行: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapshotView } from '@/live/useSnapshot';

const EMPTY = [];
const st = (key, keep, data, error = null) => ({ key, keep, data, error });

test('key が null なら購読しない（読み込み中ではない・空）', () => {
  assert.deepEqual(snapshotView(st('m:p1:50', 'm:p1', [1]), null, undefined, EMPTY), { data: EMPTY, loading: false, error: null });
});

test('届いた値の key が今の key なら、その値', () => {
  assert.deepEqual(snapshotView(st('m:p1:50', 'm:p1', [1, 2]), 'm:p1:50', 'm:p1', EMPTY), { data: [1, 2], loading: false, error: null });
});

test('件数を増やして購読し直す間は、同じ keep の前の値を出す（loading は true）', () => {
  const v = snapshotView(st('m:p1:50', 'm:p1', [1, 2]), 'm:p1:100', 'm:p1', EMPTY);
  assert.deepEqual(v.data, [1, 2]);
  assert.equal(v.loading, true);
});

test('別の案件（keep が違う）・keep なし・前が失敗のときは前の値を出さない', () => {
  assert.equal(snapshotView(st('m:p1:50', 'm:p1', [1]), 'm:p2:50', 'm:p2', EMPTY).data, EMPTY);
  assert.equal(snapshotView(st('a', undefined, [1]), 'b', undefined, EMPTY).data, EMPTY);
  assert.equal(snapshotView(st('m:p1:50', 'm:p1', EMPTY, new Error('x')), 'm:p1:100', 'm:p1', EMPTY).data, EMPTY);
});

test('最初の読み込み（まだ何も届いていない）は空で loading', () => {
  assert.deepEqual(snapshotView(null, 'm:p1:50', 'm:p1', EMPTY), { data: EMPTY, loading: true, error: null });
});
