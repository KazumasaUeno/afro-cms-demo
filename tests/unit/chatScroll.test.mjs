// 相談の会話のスクロールの決め方（src/features/chat/chatScroll.ts。U3 レビュー Major-1「前のメッセージを読む」で位置を保つ）。実行: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chatScrollMode } from '@/features/chat/chatScroll';

const shape = (key, ids) => ({ key, firstId: ids[0], lastId: ids[ids.length - 1], count: ids.length });
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => String(a + i).padStart(6, '0'));

test('最初の表示・会話の切り替えは一番下へ', () => {
  assert.equal(chatScrollMode(null, shape('p1', range(1, 50))), 'bottom');
  assert.equal(chatScrollMode(shape('p1', range(1, 50)), shape('p2', range(1, 3))), 'bottom');
});

test('新しいメッセージが末尾に増えたら一番下へ（demo の ChatPage と同じ）', () => {
  assert.equal(chatScrollMode(shape('p1', range(1, 3)), shape('p1', range(1, 4))), 'bottom');
  // limitToLast で先頭が 1 件落ちて末尾が増えた（件数は同じ）も下へ
  assert.equal(chatScrollMode(shape('p1', range(1, 50)), shape('p1', range(2, 51))), 'bottom');
});

test('古いメッセージだけが先頭に増えたら位置を保つ', () => {
  assert.equal(chatScrollMode(shape('p1', range(51, 100)), shape('p1', range(1, 100))), 'keep');
});

test('変わっていなければ何もしない（読み込み中に前の会話を出したまま描き直したとき）', () => {
  assert.equal(chatScrollMode(shape('p1', range(51, 100)), shape('p1', range(51, 100))), 'none');
});

test('0 件（読み込み中）から最初の値が届いたら一番下へ', () => {
  assert.equal(chatScrollMode(shape('p1', []), shape('p1', range(1, 50))), 'bottom');
});
