// 管理者ホームの予定の集計（src/features/home/homeDues.ts）の単体テスト。
// 実行: npm run test:unit（node --test --experimental-strip-types。homeDues.ts は型だけを import するのでそのまま読める）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDues, deliveryDues, isDelivered, jstYmd, monthDeliveries, releaseDues } from '../../src/features/home/homeDues.ts';

const row = (id, stage, schedule, extra = {}) => ({ p: { id }, stage, schedule, buildCompleted: false, qualityApproved: false, ...extra });
const ids = (list) => list.map((x) => x.p.id);

test('jstYmd: UTC 15:00 の境目で日本時間の日付に切り替わる', () => {
  assert.equal(jstYmd(new Date('2026-11-30T14:59:59Z')), '2026-11-30');
  assert.equal(jstYmd(new Date('2026-11-30T15:00:00Z')), '2026-12-01');
  assert.equal(jstYmd(new Date('2026-12-31T15:00:00Z')), '2027-01-01');
});

test('monthDeliveries: 日本時間の今月だけ（前月末・翌月 1 日は含まない）', () => {
  const rows = [
    row('oct31', 'build', { deliveryDate: '2026-10-31' }),
    row('nov01', 'build', { deliveryDate: '2026-11-01' }),
    row('nov30', 'build', { deliveryDate: '2026-11-30' }),
    row('dec01', 'build', { deliveryDate: '2026-12-01' }),
    row('none', 'hearing', undefined),
  ];
  // UTC では 11-30 だが日本時間では 12-01 の瞬間 → 12 月の分だけ
  assert.deepEqual(ids(monthDeliveries(rows, new Date('2026-11-30T15:30:00Z'))), ['dec01']);
  // 日本時間 11-30 23:59 → 11 月の分
  assert.deepEqual(ids(monthDeliveries(rows, new Date('2026-11-30T14:59:00Z'))), ['nov01', 'nov30']);
  // UTC では 10-31 だが日本時間では 11-01 の瞬間 → 11 月の分
  assert.deepEqual(ids(monthDeliveries(rows, new Date('2026-10-31T15:00:00Z'))), ['nov01', 'nov30']);
});

test('monthDeliveries: 納品済み（納品検収済み・公開済み）も含めて印を付け、未納品を先に並べる', () => {
  const rows = [
    row('done-live', 'improvement', { deliveryDate: '2026-11-04' }, { qualityApproved: true }),
    row('done-qa', 'release', { deliveryDate: '2026-11-10' }, { qualityApproved: true }),
    row('launched-no-qa', 'operation', { deliveryDate: '2026-11-02' }),
    row('todo-late', 'quality', { deliveryDate: '2026-11-29' }),
    row('todo-early', 'build', { deliveryDate: '2026-11-18' }),
  ];
  const list = monthDeliveries(rows, new Date('2026-11-24T03:00:00Z'));
  assert.deepEqual(ids(list), ['todo-early', 'todo-late', 'launched-no-qa', 'done-live', 'done-qa']);
  assert.deepEqual(list.map((x) => x.delivered), [false, false, true, true, true]);
});

test('deliveryDues: 未納品だけ・期間を問わない（過ぎた日も来年も数える）・近い順', () => {
  const rows = [
    row('late', 'quality', { deliveryDate: '2026-10-01' }),
    row('next-year', 'build', { deliveryDate: '2027-03-01' }),
    row('soon', 'build', { deliveryDate: '2026-11-29' }),
    row('qa-done', 'release', { deliveryDate: '2026-11-20' }, { qualityApproved: true }),
    row('live', 'operation', { deliveryDate: '2026-11-04' }),
    row('no-schedule', 'requirements', undefined),
  ];
  assert.deepEqual(ids(deliveryDues(rows)), ['late', 'soon', 'next-year']);
});

test('releaseDues / buildDues: 済んだ案件を除き近い順', () => {
  const rows = [
    row('a', 'build', { buildDue: '2026-12-14', releaseDate: '2027-01-13' }),
    row('b', 'quality', { buildDue: '2026-10-01', releaseDate: '2026-12-06' }, { buildCompleted: true }),
    row('c', 'improvement', { buildDue: '2026-09-01', releaseDate: '2026-11-11' }, { buildCompleted: true, qualityApproved: true }),
  ];
  assert.deepEqual(ids(releaseDues(rows)), ['b', 'a']);
  assert.deepEqual(ids(buildDues(rows)), ['a']);
});

test('isDelivered: 納品検収済みか公開済み', () => {
  assert.equal(isDelivered(row('x', 'quality', undefined)), false);
  assert.equal(isDelivered(row('x', 'release', undefined, { qualityApproved: true })), true);
  assert.equal(isDelivered(row('x', 'operation', undefined)), true);
});

test('releaseDues: 日程の無い案件も launchDate があれば数える（日程の公開予定日を優先。公開済みは除く）', () => {
  const rows = [
    row('launchOnly', 'design', undefined, { launchDate: '2026-12-10' }),
    row('both', 'build', { releaseDate: '2026-12-01' }, { launchDate: '2027-02-01' }),
    row('none', 'hearing', undefined),
    row('live', 'operation', undefined, { launchDate: '2026-11-01' }),
  ];
  const list = releaseDues(rows);
  assert.deepEqual(ids(list), ['both', 'launchOnly']);
  assert.equal(list[0].date, '2026-12-01');
});
