// live のメニュー（src/live/liveNav.ts）が使う demo のメニュー項目が demo 側に残っていることの単体テスト（0.48.2）。
// 消えても live は fallback で表示できるが、demo と見た目がずれるので気づけるようにする。実行: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AREAS } from '@/components/layout/nav';
import { isActive } from '@/components/layout/nav';
import { LIVE_BOTTOM_LABEL, LIVE_DEMO_ITEMS, LIVE_NAV, demoItem, liveNavMarks } from '@/live/liveNav';
import { ROLE_HOME } from '@/live/session';

test('live が使う demo のメニュー項目 7 件が demo の AREAS にある', () => {
  assert.equal(LIVE_DEMO_ITEMS.length, 7);
  for (const { area, fallback } of LIVE_DEMO_ITEMS) {
    assert.ok(AREAS[area].items.some((i) => i.to === fallback.to), `${area} のメニューに ${fallback.to} が無い`);
  }
});

test('demo に無い項目は例外にせず fallback を返す', () => {
  const item = demoItem('admin', '/no-such-screen');
  assert.equal(item.to, '/no-such-screen');
  assert.deepEqual(item.match, ['/no-such-screen']);
});

test('U4（2026-11-25）: admin と開発者は ダッシュボード / プロジェクト / 構築タスク / 相談 の 4 つ。お客様は 確認・承認 と 相談', () => {
  const labels = ['ダッシュボード', 'プロジェクト', '構築タスク', '相談'];
  assert.deepEqual(LIVE_NAV.admin.map((i) => i.to), ['/dashboard', '/projects', '/tasks', '/chat']);
  assert.deepEqual(LIVE_NAV.developer.map((i) => i.to), ['/dev', '/dev/projects', '/dev/tasks', '/dev/chat']);
  assert.deepEqual(LIVE_NAV.admin.map((i) => i.label), labels);
  assert.deepEqual(LIVE_NAV.developer.map((i) => i.label), labels);
  // 名前・アイコンは demo の開発者画面のレールと同じ
  for (const [n, to] of ['/dev', '/dev/projects', '/dev/tasks', '/dev/chat'].entries()) {
    assert.equal(LIVE_NAV.admin[n].icon, demoItem('dev', to).icon);
    assert.equal(LIVE_NAV.developer[n].icon, demoItem('dev', to).icon);
  }
  assert.deepEqual(LIVE_NAV.client.map((i) => i.to), ['/portal/approvals', '/portal/chat']);
  // ヒアリング・ユーザー管理はメニューに無い（プロジェクト詳細・上部バーのアカウントのメニューから開く）
  for (const items of Object.values(LIVE_NAV)) {
    for (const i of items) {
      assert.equal(i.badge, undefined);
      assert.ok(!['/dev/hearing', '/ai-studio', '/dev/requirements', '/ai-studio/requirements', '/users'].includes(i.to));
    }
  }
});

test('選択中: ダッシュボードは完全一致・ヒアリング・要件定義を開いている間は「プロジェクト」', () => {
  const active = (role, path) => LIVE_NAV[role].filter((i) => isActive(i, path)).map((i) => i.to);
  assert.deepEqual(active('developer', '/dev'), ['/dev']);
  assert.deepEqual(active('developer', '/dev/tasks'), ['/dev/tasks']);
  assert.deepEqual(active('developer', '/dev/hearing'), ['/dev/projects']);
  assert.deepEqual(active('developer', '/dev/hearing/answers'), ['/dev/projects']);
  assert.deepEqual(active('developer', '/dev/requirements'), ['/dev/projects']);
  assert.deepEqual(active('developer', '/dev/projects/p1'), ['/dev/projects']);
  assert.deepEqual(active('admin', '/dashboard'), ['/dashboard']);
  assert.deepEqual(active('admin', '/ai-studio/hearing'), ['/projects']);
  assert.deepEqual(active('admin', '/ai-studio'), ['/projects']);
  assert.deepEqual(active('admin', '/ai-studio/requirements'), ['/projects']);
  assert.deepEqual(active('admin', '/users'), []);
});

test('最初の画面: admin はダッシュボード・開発者は /dev・お客様は確認・承認（メニューの先頭と同じ）', () => {
  assert.deepEqual(ROLE_HOME, { admin: '/dashboard', developer: '/dev', client: '/portal/approvals' });
  assert.equal(LIVE_NAV.admin[0].to, ROLE_HOME.admin);
  assert.equal(LIVE_NAV.developer[0].to, ROLE_HOME.developer);
  assert.equal(LIVE_BOTTOM_LABEL['/dev'], 'ホーム');
});

test('liveNavMarks: 相談の未対応（アーカイブ除く）・お客様の「返信あり」', () => {
  const doc = (id, over = {}) => ({ id, memberUids: ['devA'], archived: false, consult: null, ...over });
  const c = (lastSide) => ({ count: 1, lastAt: '2026-11-25T00:00:00.000Z', lastSide, lastName: 'x' });
  const docs = [doc('a', { consult: c('client') }), doc('b', { consult: c('client'), archived: true }), doc('c', { consult: c('afro') }), doc('d', { consult: c('client'), memberUids: ['devB'] })];
  assert.deepEqual(liveNavMarks('developer', docs, 'devA'), { '/dev/chat': { count: 1 } });
  assert.deepEqual(liveNavMarks('admin', docs, 'admin1'), { '/chat': { count: 2 } });
  assert.deepEqual(liveNavMarks('developer', [doc('c', { consult: c('afro') })], 'devA'), {});
  assert.deepEqual(liveNavMarks('client', [doc('c', { consult: c('afro') })], 'c1'), { '/portal/chat': { count: 1, mark: '返信あり' } });
  assert.deepEqual(liveNavMarks('client', [doc('a', { consult: c('client') })], 'c1'), {});
  assert.deepEqual(liveNavMarks('client', [], 'c1'), {});
});
