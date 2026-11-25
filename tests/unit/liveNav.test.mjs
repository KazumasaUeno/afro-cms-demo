// live のメニュー（src/live/liveNav.ts）が使う demo のメニュー項目が demo 側に残っていることの単体テスト（0.48.2）。
// 消えても live は fallback で表示できるが、demo と見た目がずれるので気づけるようにする。実行: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AREAS } from '@/components/layout/nav';
import { LIVE_DEMO_ITEMS, LIVE_NAV, demoItem } from '@/live/liveNav';

test('live が使う demo のメニュー項目 4 件が demo の AREAS にある', () => {
  assert.equal(LIVE_DEMO_ITEMS.length, 4);
  for (const { area, fallback } of LIVE_DEMO_ITEMS) {
    assert.ok(AREAS[area].items.some((i) => i.to === fallback.to), `${area} のメニューに ${fallback.to} が無い`);
  }
});

test('demo に無い項目は例外にせず fallback を返す', () => {
  const item = demoItem('admin', '/no-such-screen');
  assert.equal(item.to, '/no-such-screen');
  assert.deepEqual(item.match, ['/no-such-screen']);
});

test('live のメニューは live にある画面だけ（件数バッジなし）', () => {
  assert.deepEqual(LIVE_NAV.admin.map((i) => i.to), ['/projects', '/users']);
  assert.deepEqual(LIVE_NAV.developer.map((i) => i.to), ['/dev/projects', '/dev/hearing']);
  assert.deepEqual(LIVE_NAV.client.map((i) => i.to), ['/portal/approvals']);
  assert.deepEqual(LIVE_NAV.developer[0].match, ['/dev/projects']);
  for (const items of Object.values(LIVE_NAV)) for (const i of items) assert.equal(i.badge, undefined);
});
