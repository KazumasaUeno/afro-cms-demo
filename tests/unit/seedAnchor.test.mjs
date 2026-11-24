// デモの日付を今日へ合わせ直す処理（src/store/seedAnchor.ts）の単体テスト。実行: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysBetweenYmd, isYmd, needsReanchor, reanchor, shiftDates } from '../../src/store/seedAnchor.ts';

test('daysBetweenYmd: 月・年をまたぐ', () => {
  assert.equal(daysBetweenYmd('2026-11-17', '2026-11-24'), 7);
  assert.equal(daysBetweenYmd('2026-12-25', '2027-01-08'), 14);
  assert.equal(daysBetweenYmd('2026-11-24', '2026-11-17'), -7);
});

test('isYmd: 実在しない日付（2026-02-30・13 月）は false', () => {
  assert.equal(isYmd('2026-02-28'), true);
  assert.equal(isYmd('2028-02-29'), true);
  assert.equal(isYmd('2026-02-30'), false);
  assert.equal(isYmd('2026-13-01'), false);
  assert.equal(isYmd('2026-11-1'), false);
  assert.equal(isYmd(undefined), false);
});

test('shiftDates: 許可リストの日付の項目だけをずらし、文章・回答・入力値は変えない', () => {
  const s = {
    schedule: { buildDue: '2026-11-28', deliveryDate: '2026-11-30', releaseDate: '2026-12-31', savedAt: '2026-11-17T01:00:00.000Z' },
    projects: [{ id: 'p1', launchDate: '2026-12-10', updatedAt: '2026-11-16T00:00:00.000Z' }],
    wbs: [{ id: 'w1', start: '2026-11-20', end: '2026-11-22' }],
    approvalRequests: { requirements: '2026-11-15T00:00:00.000Z' },
    activities: [{ id: 'x', at: '2026-11-17T03:00:00.000Z', text: '2026-11-17 に承認' }],
    requirements: { answers: { launch: '2026-12-01' }, approvedAt: '2026-11-10T00:00:00Z' },
    form: { values: { date: '2026-11-20' } },
    version: 1, flag: true, none: null, id: 'p1',
  };
  const out = shiftDates(s, 7);
  assert.deepEqual(out.schedule, { buildDue: '2026-12-05', deliveryDate: '2026-12-07', releaseDate: '2027-01-07', savedAt: '2026-11-24T01:00:00.000Z' });
  assert.deepEqual(out.projects[0], { id: 'p1', launchDate: '2026-12-17', updatedAt: '2026-11-23T00:00:00.000Z' });
  assert.deepEqual(out.wbs[0], { id: 'w1', start: '2026-11-27', end: '2026-11-29' });
  assert.equal(out.approvalRequests.requirements, '2026-11-22T00:00:00.000Z');
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

test('shiftDates: 日付の形をした文章の項目（チャット・題名・名前・メモ）はずらさない', () => {
  const s = {
    chat: [{ id: 'c1', text: '2026-11-20', at: '2026-11-17T00:00:00.000Z' }],
    page: { title: '2026-11-17', name: '2026-11-17T00:00:00.000Z', note: '2026-11-18', body: '2026-11-18' },
  };
  const out = shiftDates(s, 3);
  assert.equal(out.chat[0].text, '2026-11-20');
  assert.equal(out.chat[0].at, '2026-11-20T00:00:00.000Z');
  assert.deepEqual(out.page, s.page);
});

test('shiftDates: 素材ドライブの見本（preset）の createdAt はずらさず、アップロードした素材はずらす', () => {
  const s = { assets: { items: [
    { id: 'asset-preset-a', preset: 'a', createdAt: '2026-11-01T00:00:00.000Z' },
    { id: 'u1', createdAt: '2026-11-17T00:00:00.000Z' },
  ] } };
  const out = shiftDates(s, 7);
  assert.equal(out.assets.items[0].createdAt, '2026-11-01T00:00:00.000Z');
  assert.equal(out.assets.items[1].createdAt, '2026-11-24T00:00:00.000Z');
});

test('shiftDates: 実在しない日付（2026-02-30）はずらさない', () => {
  assert.equal(shiftDates({ deliveryDate: '2026-02-30' }, 1).deliveryDate, '2026-02-30');
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

test('reanchor: seedAnchor の無い（壊れた）古い保存データは、ずらさずに seedAnchor を今日にするだけ', () => {
  const old = { activities: [{ id: 'a1', at: '2026-11-16T14:00:00.000Z' }], schedule: { deliveryDate: '2026-11-30' } };
  const out = reanchor(old, '2026-11-24');
  assert.equal(out.seedAnchor, '2026-11-24');
  assert.equal(out.activities[0].at, '2026-11-16T14:00:00.000Z');
  assert.equal(out.schedule.deliveryDate, '2026-11-30');
  assert.equal(reanchor({ seedAnchor: '2026-02-30', deliveryDate: '2026-11-30' }, '2026-11-24').deliveryDate, '2026-11-30');
});

test('needsReanchor / reanchor: 開いたまま 0 時をまたいだら、記録する前に合わせ直せば今の時刻の記録は先へずれない', () => {
  const state = { seedAnchor: '2026-11-24', activities: [{ id: 'a', at: '2026-11-24T10:00:00.000Z' }] };
  assert.equal(needsReanchor(state, '2026-11-24'), false);
  assert.equal(needsReanchor(state, '2026-11-25'), true);
  // 11-25 00:05 JST（= 11-24T15:05Z）の操作: 先に合わせ直してから記録する
  const re = reanchor(state, '2026-11-25');
  const now = '2026-11-24T15:05:00.000Z';
  const after = { ...re, activities: [...re.activities, { id: 'b', at: now }] };
  // 同じ日にもう一度読み込んでも、今の記録はずれない
  const reload = reanchor(after, '2026-11-25');
  assert.equal(reload.activities[1].at, now);
  assert.equal(reload.activities[0].at, '2026-11-25T10:00:00.000Z');
});
