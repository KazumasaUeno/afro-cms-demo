// live の構築タスクの導出・変換（src/live/tasks.ts・model.ts の taskDoc。LIVE_DASHBOARD_TASKS_CONSULT U2）の単体テスト。
// 権限の検査は tests/rules/tasks.test.mjs（エミュレータ）。ここは画面の絞り込みと、Rules に送る前の入力の検査
// 実行: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TASK_LIMIT, TASK_STATUS_ORDER, addTaskBlock, canEditTasks, myOpenTasks, nextBuildAction, prepareNewTask, taskCounts, taskLimitNote, taskPages, visibleTasks,
} from '../../src/live/tasks.ts';
import { taskDoc } from '../../src/live/model.ts';
import { DEV_TASK_PAGE_MAX, DEV_TASK_TITLE_MAX, WHOLE_SITE } from '../../src/data/devTaskLimits.ts';

const t = (id, status, assigneeUids = ['u1'], extra = {}) => ({
  id, title: `題名${id}`, page: `ページ${id}`, assigneeUids, status,
  createdAt: '2026-11-25T00:00:00.000Z', createdBy: 'u1', updatedAt: '2026-11-25T00:00:00.000Z', updatedBy: 'u1', ...extra,
});

test('上限の値（Rules・設計と同じ）', () => {
  assert.equal(TASK_LIMIT, 300);
  assert.equal(DEV_TASK_TITLE_MAX, 60);
  assert.equal(DEV_TASK_PAGE_MAX, 40);
  assert.equal(WHOLE_SITE, 'サイト全体');
  assert.deepEqual([...TASK_STATUS_ORDER], ['todo', 'doing', 'review', 'done']);
});

test('taskCounts: 状態ごとの件数（無い状態も 0）', () => {
  assert.deepEqual(taskCounts([]), { todo: 0, doing: 0, review: 0, done: 0 });
  assert.deepEqual(taskCounts([t('a', 'todo'), t('b', 'doing'), t('c', 'doing'), t('d', 'done')]), { todo: 1, doing: 2, review: 0, done: 1 });
});

test('visibleTasks: 自分の担当のみ（複数担当の 2 人目でも自分の担当）', () => {
  const list = [t('a', 'todo', ['u1']), t('b', 'todo', ['u2', 'u1']), t('c', 'todo', ['u2'])];
  assert.deepEqual(visibleTasks(list, 'u1', true).map((x) => x.id), ['a', 'b']);
  assert.deepEqual(visibleTasks(list, 'u1', false).map((x) => x.id), ['a', 'b', 'c']);
});

test('taskPages: 既存のページ（初出順・重複なし・サイト全体と空は外す）', () => {
  const list = [t('a', 'todo', ['u1'], { page: 'トップ' }), t('b', 'todo', ['u1'], { page: WHOLE_SITE }), t('c', 'todo', ['u1'], { page: 'トップ' }), t('d', 'todo', ['u1'], { page: '会社概要' })];
  assert.deepEqual(taskPages(list), ['トップ', '会社概要']);
});

test('myOpenTasks: 自分の担当で未完了の上位 3 件（レビュー待ち → 作業中 → 未着手、同じ状態は更新の新しい順）', () => {
  const list = [
    t('a', 'todo'), t('b', 'doing', ['u1'], { updatedAt: '2026-11-20T00:00:00.000Z' }), t('c', 'done'), t('d', 'review'),
    t('e', 'doing', ['u1'], { updatedAt: '2026-11-24T00:00:00.000Z' }), t('f', 'review', ['u2']),
  ];
  assert.deepEqual(myOpenTasks(list, 'u1').map((x) => x.id), ['d', 'e', 'b']);
  assert.deepEqual(myOpenTasks(list, 'u9'), []);
});

test('nextBuildAction: 開発者は自分の担当のレビュー待ちが最優先、次に要件の状態、タスク 0 件なら追加を案内', () => {
  assert.equal(nextBuildAction('approved', [t('a', 'review', ['u1'])], 'u1').title, 'レビュー待ちが 1 件あります');
  assert.equal(nextBuildAction('approved', [t('a', 'review', ['u1'])], 'u1').to, '/dev/tasks');
  // 他人のレビュー待ちは数えない
  assert.equal(nextBuildAction('approved', [t('a', 'review', ['u2'])], 'u1').title, '今すぐ対応が必要なものはありません');
  assert.equal(nextBuildAction('draft', [], 'u1').to, '/dev/hearing');
  assert.equal(nextBuildAction('analyzed', [], 'u1').title, '要件定義書はお客様の承認待ちです');
  assert.equal(nextBuildAction('approved', [], 'u1').cta, 'タスクを追加する');
});

test('nextBuildAction: admin（uid null）は全タスクを数え、追加・ヒアリングへのボタンは管理者画面の URL で出す（2026-11-26 U5。以前は見るだけ＝ボタンなし）', () => {
  const a = nextBuildAction('approved', [t('a', 'review', ['u2']), t('b', 'review', ['u3'])], null);
  assert.equal(a.title, 'レビュー待ちのタスクが 2 件あります');
  assert.equal(a.to, '/tasks');
  assert.equal(nextBuildAction('draft', [], null).to, '/ai-studio');
  assert.equal(nextBuildAction('draft', [], null).cta, 'ヒアリングを開く');
  assert.equal(nextBuildAction('approved', [], null).to, '/tasks');
  assert.equal(nextBuildAction('approved', [], null).cta, 'タスクを追加する');
  assert.equal(nextBuildAction('analyzed', [], null).to, undefined);
});

test('canEditTasks・addTaskBlock: admin は全案件、開発者は担当だけ。担当 0 人の案件は admin も追加できない（L-5）', () => {
  assert.equal(canEditTasks('admin', 'a1', []), true);
  assert.equal(canEditTasks('admin', 'a1', ['u1']), true);
  assert.equal(canEditTasks('developer', 'u1', ['u1']), true);
  assert.equal(canEditTasks('developer', 'u9', ['u1']), false);
  assert.equal(canEditTasks('client', 'u1', ['u1']), false);
  assert.match(addTaskBlock([]), /担当の開発者がいないため/);
  assert.equal(addTaskBlock(['u1']), null);
  // admin が作るタスクでも担当は memberUids の中だけ（admin 自身は入れられない）
  const r = prepareNewTask({ title: '題名', page: 'トップ', assigneeUids: ['a1'] }, ['u1']);
  assert.equal(r.ok, false);
});

test('prepareNewTask: trim して保存の形にする（Rules の validTask と同じ条件）', () => {
  const r = prepareNewTask({ title: '  題名  ', page: ' トップ ', assigneeUids: ['u1', 'u2', 'u1'] }, ['u1', 'u2']);
  assert.deepEqual(r, { ok: true, value: { title: '題名', page: 'トップ', assigneeUids: ['u1', 'u2'] } });
  assert.equal(prepareNewTask({ title: 'あ'.repeat(60), page: 'い'.repeat(40), assigneeUids: ['u1'] }, ['u1']).ok, true);
});

test('prepareNewTask: 通らない入力は理由を返す（空・上限超え・担当なし・担当外・21 人）', () => {
  const m = ['u1', 'u2'];
  const reason = (input) => { const r = prepareNewTask(input, m); assert.equal(r.ok, false); return r.reason; };
  assert.match(reason({ title: '   ', page: 'トップ', assigneeUids: ['u1'] }), /タスク名を入力/);
  assert.match(reason({ title: 'あ'.repeat(61), page: 'トップ', assigneeUids: ['u1'] }), /60 文字以内/);
  assert.match(reason({ title: '題名', page: '', assigneeUids: ['u1'] }), /対象ページを入力/);
  assert.match(reason({ title: '題名', page: 'い'.repeat(41), assigneeUids: ['u1'] }), /40 文字以内/);
  assert.match(reason({ title: '題名', page: 'トップ', assigneeUids: [] }), /1 人以上/);
  assert.match(reason({ title: '題名', page: 'トップ', assigneeUids: ['u3'] }), /担当ではない/);
  const many = Array.from({ length: 21 }, (_, i) => `m${i}`);
  assert.match(prepareNewTask({ title: '題名', page: 'トップ', assigneeUids: many }, many).reason, /20 人まで/);
});

test('taskLimitNote: 上限に達したときだけ注記', () => {
  assert.equal(taskLimitNote(299), null);
  assert.match(taskLimitNote(300), /上限の 300 件/);
});

test('taskDoc: 文書 → 画面の型（Timestamp → ISO、未知の状態は未着手、配列でない担当は空）', () => {
  const ts = (iso) => ({ toDate: () => new Date(iso) });
  const snap = (id, data) => ({ id, data: () => data });
  const d = taskDoc(snap('t1', {
    schemaVersion: 1, title: 'ヒーロー', page: 'トップ', assigneeUids: ['u1', 'u2'], status: 'review',
    createdAt: ts('2026-11-01T00:00:00Z'), createdBy: 'u1', updatedAt: ts('2026-11-02T00:00:00Z'), updatedBy: 'u2',
  }));
  assert.deepEqual(d, {
    id: 't1', title: 'ヒーロー', page: 'トップ', assigneeUids: ['u1', 'u2'], status: 'review',
    createdAt: '2026-11-01T00:00:00.000Z', createdBy: 'u1', updatedAt: '2026-11-02T00:00:00.000Z', updatedBy: 'u2',
  });
  const bad = taskDoc(snap('t2', { status: 'archived', assigneeUids: 'u1', createdAt: ts('2026-11-01T00:00:00Z') }));
  assert.equal(bad.status, 'todo');
  assert.deepEqual(bad.assigneeUids, []);
  assert.equal(bad.updatedAt, '2026-11-01T00:00:00.000Z');
});
