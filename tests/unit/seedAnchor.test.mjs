// デモの日付を今日へ合わせ直す処理（src/store/seedAnchor.ts）の単体テスト。実行: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anchorOf, daysBetweenYmd, jstDay, reanchor, shiftDates } from '../../src/store/seedAnchor.ts';

test('jstDay: UTC 15:00 の境目で日本時間の日付になる', () => {
  assert.equal(jstDay(new Date('2026-11-23T14:59:59Z')), '2026-11-23');
  assert.equal(jstDay(new Date('2026-11-23T15:00:00Z')), '2026-11-24');
});

test('daysBetweenYmd: 月・年をまたぐ', () => {
  assert.equal(daysBetweenYmd('2026-11-17', '2026-11-24'), 7);
  assert.equal(daysBetweenYmd('2026-12-25', '2027-01-08'), 14);
  assert.equal(daysBetweenYmd('2026-11-24', '2026-11-17'), -7);
});

test('shiftDates: 日付と ISO 日時だけをずらし、文章・回答・入力値は変えない', () => {
  const s = {
    schedule: { deliveryDate: '2026-11-30', releaseDate: '2026-12-31' },
    activities: [{ id: 'x', at: '2026-11-17T03:00:00.000Z', text: '2026-11-17 に承認' }],
    requirements: { answers: { launch: '2026-12-01' }, approvedAt: '2026-11-10T00:00:00Z' },
    form: { values: { date: '2026-11-20' } },
    version: 1, flag: true, none: null, id: 'p1',
  };
  const out = shiftDates(s, 7);
  assert.deepEqual(out.schedule, { deliveryDate: '2026-12-07', releaseDate: '2027-01-07' });
  assert.equal(out.activities[0].at, '2026-11-24T03:00:00.000Z');
  assert.equal(out.activities[0].text, '2026-11-17 に承認');
  assert.equal(out.requirements.answers.launch, '2026-12-01');
  assert.equal(out.requirements.approvedAt, '2026-11-17T00:00:00.000Z');
  assert.equal(out.form.values.date, '2026-11-20');
  assert.equal(out.version, 1);
  assert.equal(out.none, null);
  assert.equal(s.schedule.deliveryDate, '2026-11-30', '元の値は変えない');
  assert.equal(shiftDates(s, 0), s);
});

test('reanchor: 保存した日から 7 日後に開くと、予定が 7 日ずれて seedAnchor が今日になる（操作の結果も残る）', () => {
  const saved = { seedAnchor: '2026-11-17', schedule: { deliveryDate: '2026-11-25' }, userEdit: { savedAt: '2026-11-18T05:00:00.000Z' } };
  const out = reanchor(saved, '2026-11-24');
  assert.equal(out.seedAnchor, '2026-11-24');
  assert.equal(out.schedule.deliveryDate, '2026-12-02');
  assert.equal(out.userEdit.savedAt, '2026-11-25T05:00:00.000Z');
  // 同じ日に開き直してもずれない
  assert.equal(reanchor(out, '2026-11-24'), out);
});

test('anchorOf: seedAnchor が無ければ履歴 a1（作った 1.5 時間前）から推定し、無ければ今日', () => {
  // 作ったのは 2026-11-17 00:30 JST（= 11-16T15:30Z）→ a1 は 11-16T14:00Z（JST 23:00 の 11-16）
  assert.equal(anchorOf({ activities: [{ id: 'a1', at: '2026-11-16T14:00:00.000Z' }] }, '2026-11-24'), '2026-11-17');
  assert.equal(anchorOf({ activities: [] }, '2026-11-24'), '2026-11-24');
  assert.equal(anchorOf({ seedAnchor: '2026-11-20' }, '2026-11-24'), '2026-11-20');
});
