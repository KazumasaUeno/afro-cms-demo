// live のダッシュボードの導出（src/live/dashboard.ts。LIVE_DASHBOARD_TASKS_CONSULT U1）の単体テスト。
// 実行: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dashboardCards, dashboardCopy, listLimitNote, projectBase, REQ_STATUS_ORDER, statusCounts } from '../../src/live/dashboard.ts';
import { LIST_LIMIT } from '../../src/live/model.ts';

const doc = (id, status, extra = {}) => ({
  id, clientName: `客${id}`, siteName: `サイト${id}`, siteUrl: `https://${id}.example.jp`, industry: '', accent: '#123456',
  ownerUid: 'u1', memberUids: ['u1'], requirements: { status, revision: 0 }, archived: false, updatedAt: '2026-11-25T00:00:00.000Z', ...extra,
});

test('statusCounts: 状態ごとの件数（無い状態も 0）', () => {
  assert.deepEqual(statusCounts([]), { draft: 0, analyzed: 0, approved: 0 });
  const docs = [doc('a', 'draft'), doc('b', 'analyzed'), doc('c', 'analyzed'), doc('d', 'approved'), doc('e', 'draft')];
  assert.deepEqual(statusCounts(docs), { draft: 2, analyzed: 2, approved: 1 });
  // 合計は案件数と一致する
  const c = statusCounts(docs);
  assert.equal(REQ_STATUS_ORDER.reduce((n, s) => n + c[s], 0), docs.length);
});

test('REQ_STATUS_ORDER: 要件定義 作成中 → 承認待ち → 承認済み の 3 つ', () => {
  assert.deepEqual([...REQ_STATUS_ORDER], ['draft', 'analyzed', 'approved']);
});

test('dashboardCards: 段階・進捗・次の作業は requirements.status から導き、並びは購読の順のまま', () => {
  const cards = dashboardCards([doc('a', 'analyzed', { launchDate: '2027-01-10T00:00:00.000Z' }), doc('b', 'draft'), doc('c', 'approved')]);
  assert.deepEqual(cards.map((p) => p.id), ['a', 'b', 'c']);
  assert.deepEqual(cards.map((p) => [p.stage, p.progress, p.nextAction, p.pendingApprovals]), [
    ['requirements', 15, 'お客様の承認を待つ', 1],
    ['hearing', 5, 'ヒアリングを入力する', 0],
    ['schedule', 21, 'スケジュールを入力する', 0], // 要件定義書の承認後はスケジュールの段階（LIVE_SCHEDULE_PLAN U2-1）
  ]);
  assert.equal(cards[0].launchDate, '2027-01-10T00:00:00.000Z');
  assert.equal('launchDate' in cards[1], false);
  assert.deepEqual(dashboardCards([]), []);
});

test('projectBase: 開発者は /dev/projects、管理者は /projects', () => {
  assert.equal(projectBase('developer'), '/dev/projects');
  assert.equal(projectBase('admin'), '/projects');
});

test('dashboardCopy: 開発者は担当案件（空は demo と同じ文言＋作成の案内）', () => {
  const some = dashboardCopy('developer', 3);
  assert.equal(some.eyebrow, '開発者画面');
  assert.equal(some.title, '担当案件');
  assert.match(some.description, /担当している案件は 3 件です/);
  const none = dashboardCopy('developer', 0);
  assert.equal(none.description, '担当している案件はまだありません。');
  assert.equal(none.empty.title, '担当している案件がありません');
  assert.match(none.empty.body, /管理者に担当の追加を依頼してください/);
  assert.deepEqual(none.empty.action, { to: '/dev/projects/new', label: '新しいプロジェクト' });
});

test('dashboardCopy: 管理者は全案件（空はユーザー管理での割り当てを案内）', () => {
  const some = dashboardCopy('admin', 12);
  assert.equal(some.eyebrow, '管理者画面');
  assert.match(some.description, /プロジェクトは 12 件です/);
  assert.doesNotMatch(some.title + some.description, /担当/);
  const none = dashboardCopy('admin', 0);
  assert.equal(none.empty.title, 'プロジェクトはまだありません');
  assert.match(none.empty.body, /ユーザー管理/);
  assert.deepEqual(none.empty.action, { to: '/projects/new', label: '新しいプロジェクト' });
});

test('ダッシュボードの導出は構築状況・相談・デプロイの値を持たない（U2/U3 前・NC-6）', () => {
  const copy = JSON.stringify([dashboardCopy('developer', 1), dashboardCopy('admin', 1)]);
  assert.doesNotMatch(copy, /デプロイ|構築|相談|タスク/);
});

test('listLimitNote: 案件一覧が購読の上限（500 件）に達したときだけ「上限」の注記を出す', () => {
  assert.equal(LIST_LIMIT, 500);
  assert.equal(listLimitNote(0), null);
  assert.equal(listLimitNote(499), null);
  assert.match(listLimitNote(500), /上限の 500 件/);
  assert.match(listLimitNote(3, 3), /上限の 3 件/);
});
