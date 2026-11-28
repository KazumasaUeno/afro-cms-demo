// live の画面から DemoStore の useDemo() を呼ばないことの静的テスト（0.47.4。live のプロジェクト詳細が
// 「useDemo must be used inside DemoStoreProvider」で落ちた再発防止）。
// live の入口（src/live/main.tsx）から import（動的 import も）をたどり、届くモジュールに `useDemo(` の呼び出しが無いことを確かめる。
// 例外: demo の repository 実装（DATA_MODE で live では使わない）と DemoStore 自身（定義）。モードに関係なく使う部品は useDemoOptional を使う。
// 実行: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = path.join(root, 'src');
const rel = (f) => path.relative(root, f).split(path.sep).join('/');
const ALLOWED = new Set(['src/repositories/demo.ts', 'src/store/DemoStore.tsx']);

// 外部パッケージは null（たどらない）。ローカル（@/ と ./）で解決できないものは undefined（黙って飛ばさず、テストで失敗にする）
function resolve(from, spec) {
  let base;
  if (spec.startsWith('@/')) base = path.join(src, spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(from), spec);
  else return null;
  for (const c of [base, `${base}.tsx`, `${base}.ts`, path.join(base, 'index.tsx'), path.join(base, 'index.ts')]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return undefined;
}

function liveReachable() {
  const seen = new Map();
  const unresolved = [];
  // live の入口に加え、まだルートに載っていない live の画面（LIVE_SITEMAP_IMPL_PLAN U3-b。INT で LiveApp に載せる）も入口にする
  const queue = [[path.join(src, 'live/main.tsx'), null], [path.join(src, 'live/pages/LiveSitemapPage.tsx'), null]];
  while (queue.length) {
    const [file, parent] = queue.shift();
    if (seen.has(file)) continue;
    seen.set(file, parent);
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(/(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g)) {
      const spec = m[1] || m[2] || m[3];
      const next = resolve(file, spec);
      if (next === undefined) unresolved.push(`${rel(file)}: ${spec}`);
      else if (next) queue.push([next, file]);
    }
  }
  return { seen, unresolved };
}

test('live から届くモジュールが useDemo() を呼ばない（useDemoOptional か repository を使う）', () => {
  const { seen: reach, unresolved } = liveReachable();
  // 解決できないローカル import があると、その先を調べないまま緑になる（偽の緑）。拡張子・解決規則が増えたら resolve() を直す
  assert.deepEqual(unresolved, [], `解決できないローカル import がある（resolve() の見直しが要る）`);
  assert.ok(reach.size > 50, `live の import をたどれていない（${reach.size} 件）`);
  assert.ok(reach.has(path.join(src, 'features/projects/ApprovalHistory.tsx')), 'ApprovalHistory が live から届く前提が崩れた（テストの見直しが要る）');
  assert.ok(reach.has(path.join(src, 'features/sitemap/SitemapView.tsx')), 'LiveSitemapPage から SitemapView をたどれていない（テストの見直しが要る）');
  const bad = [...reach]
    .filter(([f]) => !ALLOWED.has(rel(f)) && /\buseDemo\(/.test(fs.readFileSync(f, 'utf8')))
    .map(([f, parent]) => `${rel(f)}（← ${parent ? rel(parent) : '入口'}）`);
  assert.deepEqual(bad, []);
});
