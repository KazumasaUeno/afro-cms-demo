// live の相談の導出（src/live/consult.ts。docs/design/LIVE_DASHBOARD_TASKS_CONSULT.md §2.2・§4・U3）と、タスクの新しい順の取得（tasks.ts）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanConsultText, consultBlock, consultPreview, consultRows, consultSide, hasReply, isUnanswered, seqId, toChatMessage, unansweredCount, validateConsultText,
} from '../../src/live/consult.ts';
import { consultOf } from '../../src/live/model.ts';
import { newestTasksInOrder } from '../../src/live/tasks.ts';
import { CHAT_LIMITS, CONSULT_MAX_MESSAGES } from '../../src/data/chatLimits.ts';
import { CHAT_LIMITS as DEMO_LIMITS } from '../../src/data/chat.ts';

const c = (lastSide, lastAt = '2026-11-25T00:00:00.000Z', count = 1) => ({ count, lastAt, lastSide, lastName: lastSide === 'client' ? '顧客' : '開発' });
const p = (id, over = {}) => ({ id, memberUids: ['devA'], archived: false, consult: null, ...over });

test('上限: 1000 字・5000 件（demo と同じ定数を再輸出）', () => {
  assert.equal(CHAT_LIMITS.text, 1000);
  assert.equal(CONSULT_MAX_MESSAGES, 5000);
  assert.equal(DEMO_LIMITS, CHAT_LIMITS);
});

test('seqId: 6 桁ゼロ埋め（Rules の seqId と同じ）・範囲外は throw', () => {
  assert.equal(seqId(1), '000001');
  assert.equal(seqId(42), '000042');
  assert.equal(seqId(999), '000999');
  assert.equal(seqId(5000), '005000');
  for (const n of [0, 5001, 1.5, -1]) assert.throws(() => seqId(n));
});

test('consultSide: お客様は自分の案件・開発者は担当・admin は送れない', () => {
  assert.equal(consultSide('client', 'c1', 'p1', p('p1')), 'client');
  assert.equal(consultSide('client', 'c1', 'p2', p('p1')), null);
  assert.equal(consultSide('developer', 'devA', undefined, p('p1')), 'afro');
  assert.equal(consultSide('developer', 'devZ', undefined, p('p1')), null);
  assert.equal(consultSide('admin', 'a1', undefined, p('p1', { memberUids: ['a1'] })), null);
});

test('未対応 = 最後がお客様 ／ 返信あり = 最後がアフロ ／ 相談なしはどちらでもない', () => {
  assert.equal(isUnanswered(p('p1', { consult: c('client') })), true);
  assert.equal(isUnanswered(p('p1', { consult: c('afro') })), false);
  assert.equal(isUnanswered(p('p1')), false);
  assert.equal(hasReply(p('p1', { consult: c('afro') })), true);
  assert.equal(hasReply(p('p1', { consult: c('client') })), false);
  assert.equal(hasReply(p('p1')), false);
});

test('unansweredCount: 案件の数。開発者は担当だけ・admin は全件・お客様は 0', () => {
  const docs = [
    p('a', { consult: c('client') }),
    p('b', { consult: c('client'), memberUids: ['devB'] }),
    p('c', { consult: c('afro') }),
    p('d'),
  ];
  assert.equal(unansweredCount(docs, 'developer', 'devA'), 1);
  assert.equal(unansweredCount(docs, 'admin', 'admin1'), 2);
  assert.equal(unansweredCount(docs, 'client', 'c1'), 0);
  // アーカイブした案件は数えない（返信できない。U3 レビュー #3）
  const withArchived = [...docs, p('e', { consult: c('client'), archived: true })];
  assert.equal(unansweredCount(withArchived, 'developer', 'devA'), 1);
  assert.equal(unansweredCount(withArchived, 'admin', 'admin1'), 2);
});

test('consultRows: 最後のメッセージの新しい順、相談なしは元の順で下', () => {
  const docs = [p('none1'), p('old', { consult: c('client', '2026-11-01T00:00:00.000Z') }), p('none2'), p('new', { consult: c('afro', '2026-11-20T00:00:00.000Z') })];
  assert.deepEqual(consultRows(docs).map((x) => x.id), ['new', 'old', 'none1', 'none2']);
});

test('consultPreview: 本文は出さず、送った人だけ', () => {
  assert.equal(consultPreview(null), 'まだメッセージはありません');
  assert.match(consultPreview(c('client')), /お客様（顧客）から/);
  assert.match(consultPreview(c('afro')), /開発（アフロ）が返信/);
});

test('validateConsultText: trim 後 1〜1000 字', () => {
  assert.ok(validateConsultText('  '));
  assert.equal(validateConsultText(`  ${'あ'.repeat(1000)}  `), null);
  assert.ok(validateConsultText('あ'.repeat(1001)));
});

test('consultBlock: アーカイブ・5000 件・2 秒以内は送れない', () => {
  const now = Date.parse('2026-11-25T00:00:10.000Z');
  assert.equal(consultBlock(p('p1'), now), null);
  assert.match(consultBlock(p('p1', { archived: true }), now), /アーカイブ/);
  assert.match(consultBlock(p('p1', { consult: c('client', '2026-11-01T00:00:00.000Z', 5000) }), now), /5000/);
  assert.match(consultBlock(p('p1', { consult: c('client', '2026-11-25T00:00:09.000Z') }), now), /続けて/);
  assert.equal(consultBlock(p('p1', { consult: c('client', '2026-11-25T00:00:07.000Z') }), now), null);
});

test('consultOf: 欄が無い・壊れた値は相談なし（Migration 不要）', () => {
  assert.equal(consultOf(undefined), null);
  assert.equal(consultOf({ count: 0 }), null);
  assert.equal(consultOf('x'), null);
  const v = consultOf({ count: 2, lastAt: { toDate: () => new Date('2026-11-25T00:00:00Z') }, lastSide: 'client', lastName: '顧客' });
  assert.deepEqual(v, { count: 2, lastAt: '2026-11-25T00:00:00.000Z', lastSide: 'client', lastName: '顧客' });
  // 時刻が読めないときは案件の更新日時（1970 年にしない。U3 レビュー #2）
  assert.equal(consultOf({ count: 1, lastAt: null, lastSide: 'afro', lastName: '開発' }, '2026-11-20T00:00:00.000Z').lastAt, '2026-11-20T00:00:00.000Z');
});

test('cleanConsultText: 文字の向きの制御・改行以外の制御文字を除く（セキュリティ L-1。Rules の reChatControl と同じ文字）', () => {
  const ch = (n) => String.fromCharCode(n);
  for (const n of [0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069, 0x00, 0x08, 0x0b, 0x0c, 0x1f, 0x7f]) {
    assert.equal(cleanConsultText(`a${ch(n)}b`), 'ab', `U+${n.toString(16)}`);
  }
  const [LF, CR, TAB] = [ch(10), ch(13), ch(9)];
  assert.equal(cleanConsultText(['1', CR + LF, '2', CR, '3', LF, '4'].join('')), ['1', '2', '3', '4'].join(LF));
  assert.equal(cleanConsultText(`a${TAB}b`), 'a b');
  assert.equal(cleanConsultText('日本語　全角空白・絵文字🙂'), '日本語　全角空白・絵文字🙂');
});

test('toChatMessage: 共有部品の形へ', () => {
  assert.deepEqual(toChatMessage({ id: '000001', seq: 1, text: 't', side: 'client', authorUid: 'c1', authorName: '顧客', at: 'x' }),
    { id: '000001', at: 'x', side: 'client', author: '顧客', text: 't' });
});

test('newestTasksInOrder: 新しい順に取った分を古い順へ戻す（同時刻は ID 順）', () => {
  const t = (id, createdAt) => ({ id, createdAt });
  assert.deepEqual(newestTasksInOrder([t('c', '3'), t('b', '2'), t('a2', '1'), t('a1', '1')]).map((x) => x.id), ['a1', 'a2', 'b', 'c']);
});
