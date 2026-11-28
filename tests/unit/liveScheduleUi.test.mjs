// live のスケジュール画面（U3-b）の判定（src/features/schedule/liveScheduleUi.ts・scheduleSource.ts）。React・Firebase を import しない。
// 実行: npm run test:unit
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import {
  liveDetailNext, liveWbsDone, liveWbsItems, liveWbsRows, markNotes, scheduleButtons, scheduleOpened, scheduleSaveKind, scheduleTokenOf, SCHEDULE_REQUESTED_WBS_NOTE, wbsOpened, wbsTaskListOf, wbsTokenOf, pendingSaveFailed, SCHEDULE_SAVE_FAILED_BEFORE_SUBMIT,
} from '../../src/features/schedule/liveScheduleUi.ts';
import { changedDone, sameDone } from '../../src/features/schedule/scheduleSource.ts';
import { validateScheduleInput } from '../../src/live/schedule.ts';

const sched = { buildDue: '2027-01-10', deliveryDate: '2027-01-20', releaseDate: '2027-01-31', savedAt: '2026-12-01T00:00:00.000Z', savedBy: 'x' };
const internal = (over = {}) => ({ draft: { buildDue: '2027-01-10', deliveryDate: '2027-01-20', releaseDate: '2027-01-31' }, note: '', assignees: {}, marks: {}, savedByName: 'a', editSeq: 3, updatedBy: 'u', ...over });
const draft = (over = {}) => ({ buildDue: '2027-01-10', deliveryDate: '2027-01-20', releaseDate: '2027-01-31', note: '', ...over });

test('changedDone / sameDone: 保存済みと違う行だけ（付ける true・外す false）', () => {
  assert.deepEqual(changedDone({ sitemap: true, design: false }, { design: true }), { sitemap: true, design: false });
  assert.deepEqual(changedDone({ sitemap: true }, { sitemap: true }), {});
  assert.ok(sameDone({ sitemap: false }, {}));
});

test('liveWbsItems / liveWbsDone: 保存済みの行は doneAt を外し、無い行は予定日から導く', () => {
  const s = { ...sched, wbs: [{ id: 'sitemap', start: '2026-12-02', end: '2026-12-05', doneAt: '2026-12-04T00:00:00Z', assignee: '黒田' }] };
  const items = liveWbsItems(s, '2026-12-02');
  assert.equal(items.length, 6);
  assert.deepEqual(items[0], { id: 'sitemap', start: '2026-12-02', end: '2026-12-05', assignee: '黒田' });
  assert.deepEqual(liveWbsItems(undefined, '2026-12-02'), []);
  assert.deepEqual(liveWbsDone({ wbs: [{ id: 'sitemap', start: 'a', end: 'b', doneAt: 'x' }, { id: 'build', start: 'a', end: 'b', doneAt: 'x' }] }), { sitemap: true });
});

test('liveWbsRows（構築タスクが読めない）: 構築は％不明、後の行の完了印（下書き）があれば完了 100%（CR Major 1）', () => {
  const its = liveWbsItems(sched, '2026-12-01');
  const unknown = liveWbsRows(its, {}, null, '2026-12-01').find((r) => r.id === 'build');
  assert.equal(unknown.percentUnknown, true);
  assert.equal(unknown.tasks, undefined);
  const done = liveWbsRows(its, { quality: true }, null, '2026-12-01').find((r) => r.id === 'build');
  assert.deepEqual([done.done, done.percent, done.status, done.percentUnknown], [true, 100, 'done', undefined]);
  assert.equal(liveWbsRows(its, {}, [], '2026-12-01').find((r) => r.id === 'build').percentUnknown, undefined, 'アフロ側（読める）は従来どおり');
});

test('wbsTaskListOf → liveWbsRows（配線。QA D-1）: お客様は useLiveTasks が [] でも null 扱いで％不明、アフロの 0 件は 0%', () => {
  const its = liveWbsItems(sched, '2026-12-01');
  const build = (afro, tasks) => liveWbsRows(its, {}, wbsTaskListOf(afro, tasks), '2026-12-01').find((r) => r.id === 'build');
  // お客様: useLiveTasks(null) は { data: [] }（NO_TASKS）を返す
  const client = build(false, { data: [], error: null });
  assert.deepEqual([client.percentUnknown, client.tasks], [true, undefined]);
  assert.equal(liveWbsRows(its, { release: true }, wbsTaskListOf(false, { data: [], error: null }), '2026-12-01').find((r) => r.id === 'build').percent, 100);
  // アフロ側: 0 件は 0%（％を出す）・読み取りの失敗は％不明
  const afro0 = build(true, { data: [], error: null });
  assert.deepEqual([afro0.percentUnknown, afro0.percent, afro0.tasks.total], [undefined, 0, 0]);
  assert.equal(build(true, { data: [], error: new Error('x') }).percentUnknown, true);
  // useLiveWbsSource が判定を通っている（空配列で判定する式に戻っていない）
  const page = readFileSync(new URL('../../src/live/pages/LiveSchedulePage.tsx', import.meta.url), 'utf8');
  assert.match(page, /const taskList = wbsTaskListOf\(afro, tasks\);/);
  assert.match(page, /const afro = account\.role === 'admin' \|\| account\.role === 'developer';/);
  assert.doesNotMatch(page, /tasks\.error \? null : tasks\.data/);
});

test('SCHEDULE_REQUESTED_WBS_NOTE: 依頼中に WBS を変えるときの注意（CR Minor 4。文言は lead 判断）', () => {
  assert.equal(SCHEDULE_REQUESTED_WBS_NOTE, '依頼中に WBS を変えると、お客様は画面を開き直してから承認することになります');
});

test('liveWbsRows: 完了印は下書きから、構築は構築タスク（一覧つき）', () => {
  const items = liveWbsItems(sched, '2026-12-02');
  const tasks = [{ id: 't1', title: 'A', page: 'top', assigneeUids: ['u1'], status: 'done', createdAt: '', createdBy: '', updatedAt: '', updatedBy: '' },
    { id: 't2', title: 'B', page: 'top', assigneeUids: [], status: 'todo', createdAt: '', createdBy: '', updatedAt: '', updatedBy: '' }];
  const rows = liveWbsRows(items, { sitemap: true, build: true }, tasks, '2026-12-01');
  assert.equal(rows.find((r) => r.id === 'sitemap').status, 'done');
  const build = rows.find((r) => r.id === 'build');
  assert.equal(build.percent, 50);
  assert.equal(build.tasks.list.length, 2);
  assert.equal(build.tasks.list[0].assigneeId, 'u1');
  assert.equal(liveWbsRows(items, {}, null, '2026-12-01').find((r) => r.id === 'build').tasks, undefined);
  assert.equal(rows.some((r) => 'doneAt' in r), false);
});

test('markNotes: 最後の操作と人', () => {
  const n = markNotes(internal({ marks: { sitemap: { state: 'undone', at: '2026-12-04T03:00:00.000Z', by: 'u1' } } }), { u1: '黒田' });
  assert.match(n.sitemap, /^完了印を外した: .*・黒田$/);
  assert.equal(markNotes(null, {}).sitemap, undefined);
});

test('版: WBS は current の editSeq を開いた時点で固定し、担当・完了印が変わったら必ず競合（-1）', () => {
  const cur = { revision: 0, editSeq: 5, updatedBy: '', copy: {} };
  const i = internal();
  const tok = wbsTokenOf(cur, i);
  assert.deepEqual(wbsOpened(tok, i), { current: 5, internal: 3 });
  // メモの保存で internal の editSeq が進んでも WBS の下書きは競合にしない
  assert.deepEqual(wbsOpened(tok, internal({ editSeq: 4, note: 'x' })), { current: 5, internal: 4 });
  assert.equal(wbsOpened(tok, internal({ editSeq: 4, assignees: { sitemap: '黒田' } })).internal, -1);
});

test('版: 予定日・メモは開いた後に変わっていれば -1、未作成は null', () => {
  assert.equal(scheduleOpened(scheduleTokenOf(null), null), null);
  const i = internal();
  assert.equal(scheduleOpened(scheduleTokenOf(i), i), 3);
  assert.equal(scheduleOpened(scheduleTokenOf(i), internal({ editSeq: 4, note: 'x' })), -1);
  assert.equal(scheduleOpened(scheduleTokenOf(null), i), -1);
});

test('scheduleSaveKind: 承認済みで予定日を変える → 再計画、依頼中 → 止める、メモだけ → 保存', () => {
  const i = internal();
  assert.equal(scheduleSaveKind('approved', i, draft({ releaseDate: '2027-02-01' })), 'reopen');
  assert.equal(scheduleSaveKind('requested', i, draft({ releaseDate: '2027-02-01' })), 'blocked');
  assert.equal(scheduleSaveKind('approved', i, draft({ note: 'メモ' })), 'save');
  assert.equal(scheduleSaveKind('draft', i, draft({ releaseDate: '2027-02-01' })), 'save');
  assert.equal(scheduleSaveKind(undefined, null, draft()), 'save');
});

test('scheduleButtons: 依頼中は取り下げ（アフロ）・代理承認（管理者だけ）、アーカイブ等で canEdit=false なら表示だけ', () => {
  assert.deepEqual(scheduleButtons('requested', 'admin', true, true), { requested: true, request: false, withdraw: true, proxy: true, approved: false });
  assert.equal(scheduleButtons('requested', 'developer', true, true).proxy, false);
  assert.deepEqual(scheduleButtons('requested', 'admin', false, true), { requested: true, request: false, withdraw: false, proxy: false, approved: false });
  assert.equal(scheduleButtons('draft', 'developer', true, true).request, true);
  assert.equal(scheduleButtons('draft', 'developer', true, false).request, false);
  assert.equal(scheduleButtons('draft', 'admin', false, true).request, false);
  assert.equal(scheduleButtons('approved', 'admin', true, true).approved, true);
  assert.equal(scheduleButtons(undefined, 'admin', true, true).request, false);
});

test('liveDetailNext: 要件定義書の承認後はスケジュールへ（影響分析 3）', () => {
  const work = { next: 'ヒアリング', to: '/dev/hearing' };
  assert.deepEqual(liveDetailNext('approved', 'スケジュールを入力する', '/schedule', work), { label: 'スケジュールを入力する', to: '/schedule' });
  assert.deepEqual(liveDetailNext('analyzed', 'x', '/schedule', work), { label: 'ヒアリング', to: '/dev/hearing' });
});

test('画面の日付の検査: 暦に無い日（2/30）・範囲外の年を止める', () => {
  assert.ok(validateScheduleInput(draft({ deliveryDate: '2027-02-30' })).deliveryDate);
  assert.ok(validateScheduleInput(draft({ buildDue: '1999-12-31' })).buildDue);
  assert.deepEqual(validateScheduleInput(draft()), {});
});

test('pendingSaveFailed（Codex P2 2026-11-28）: 待った保存が 1 つでも失敗なら承認依頼しない。submit がそれを使う', () => {
  assert.equal(pendingSaveFailed([]), false);
  assert.equal(pendingSaveFailed([{ status: 'fulfilled', value: undefined }]), false);
  assert.equal(pendingSaveFailed([{ status: 'fulfilled', value: undefined }, { status: 'rejected', reason: new Error('conflict') }]), true);
  assert.match(SCHEDULE_SAVE_FAILED_BEFORE_SUBMIT, /保存してから依頼/);
  const repo = readFileSync(new URL('../../src/live/repositories.tsx', import.meta.url), 'utf8');
  const wait = repo.indexOf('const pending = await Promise.allSettled([...(schedInflight.get(pid) ?? [])]);');
  const guard = repo.indexOf('if (pendingSaveFailed(pending)) throw new Error(SCHEDULE_SAVE_FAILED_BEFORE_SUBMIT);');
  assert.ok(wait > 0 && guard > wait && guard - wait < 200, 'submit は待った直後に失敗を確かめる');
});

test('WBS の版（token）は編集ダイアログを開いている間は追従しない（Codex P2 2026-11-28）', () => {
  const src = readFileSync(new URL('../../src/features/schedule/WbsSection.tsx', import.meta.url), 'utf8');
  assert.ok(src.includes('if (liveToken !== undefined && !dirty && !editing) setToken(liveToken);'));
  assert.ok(src.includes('}, [liveToken, dirty, editing]);'));
});
