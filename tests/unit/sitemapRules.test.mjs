// サイトマップの共有の純関数（docs/design/LIVE_SITEMAP_IMPL_PLAN.md §3・§4 U-S・P-5・P-6、PLAN §7・AC-14・AC-15）。
// 1) 移動の同値: src/features/sitemap/metrics.ts の判定と src/data/sitemap.ts の tree() の配置が、移動前の写し（このファイルの OLD_*）と一致する
//    （demo の見本 sitemapFor・present の seedSitemap・petit の sitemapFromSpecs を含む。移動前に計った出力のハッシュとも一致）
// 2) validateSitemapDoc（callable・worker・画面が同じ関数を使う）と canonicalSitemapJson（contentHash の正規化）
// 純粋関数だけ（React・Firebase を import しない）。実行: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as metrics from '../../src/features/sitemap/metrics.ts';
import * as rules from '../../src/shared/ai/sitemapRules.ts';
import { tree } from '../../src/shared/ai/sitemapLayout.ts';
import { emptySitemap, seedSitemap, sitemapFor, sitemapFromSpecs } from '../../src/data/sitemap.ts';

/* ---------- 移動前の写し（2437b20 以前の metrics.ts:11-59・data/sitemap.ts:3-6,58-79。手で直さない） ---------- */

function OLD_depthMap(nodes, edges) {
  const home = nodes.find((n) => n.data.kind === 'home') ?? nodes[0];
  const depth = new Map();
  if (!home) return depth;
  depth.set(home.id, 0);
  const queue = [home.id];
  while (queue.length) {
    const cur = queue.shift();
    for (const e of edges) {
      if (e.source === cur && !depth.has(e.target)) {
        depth.set(e.target, depth.get(cur) + 1);
        queue.push(e.target);
      }
    }
  }
  return depth;
}
function OLD_sitemapMetrics(nodes, edges) {
  const depth = OLD_depthMap(nodes, edges);
  const contact = nodes.find((n) => n.data.kind === 'cta') ?? nodes.find((n) => n.data.label.includes('問い合わせ'));
  const contactDepth = contact ? depth.get(contact.id) : undefined;
  return {
    pages: nodes.length,
    maxDepth: Math.max(0, ...depth.values()),
    contactClicks: contactDepth === undefined ? null : contactDepth,
    firstLevel: [...depth.values()].filter((d) => d === 1).length,
  };
}
const OLD_PATH_RE = /^\/[a-z0-9\-_/]*$/i;
function OLD_validatePath(path, nodes, selfId) {
  const p = path.trim();
  if (!p) return 'パスを入力してください';
  if (!p.startsWith('/')) return '「/」から始めてください';
  if (p.length > 60) return '60文字以内で入力してください';
  if (!OLD_PATH_RE.test(p)) return '半角英数字・ハイフン・スラッシュで入力してください';
  if (nodes.some((n) => n.id !== selfId && n.data.path === p)) return '同じパスのページがすでにあります';
  return null;
}
function OLD_validateLabel(label) {
  const l = label.trim();
  if (!l) return 'ページ名を入力してください';
  if (l.length > 24) return '24文字以内で入力してください';
  return null;
}
const OLD_n = (id, x, y, label, path, kind, reason) => ({ id, position: { x, y }, data: { label, path, kind, reason } });
const OLD_e = (source, target) => ({ id: `${source}-${target}`, source, target });
function OLD_tree(prefix, specs) {
  const [home, ...rest] = specs;
  const id = (key) => `${prefix}-${key}`;
  const first = rest.filter((s) => !s[5]);
  const pos = new Map();
  first.forEach((s, i) => pos.set(s[0], i * 220));
  const nodes = [OLD_n(id(home[0]), ((first.length - 1) * 220) / 2, 0, home[1], home[2], home[3], home[4])];
  const edges = [];
  first.forEach((s) => {
    nodes.push(OLD_n(id(s[0]), pos.get(s[0]) ?? 0, 150, s[1], s[2], s[3], s[4]));
    edges.push(OLD_e(id(home[0]), id(s[0])));
  });
  first.forEach((parent) => {
    const kids = rest.filter((s) => s[5] === parent[0]);
    kids.forEach((s, j) => {
      nodes.push(OLD_n(id(s[0]), (pos.get(parent[0]) ?? 0) + (j - (kids.length - 1) / 2) * 160, 300, s[1], s[2], s[3], s[4]));
      edges.push(OLD_e(id(parent[0]), id(s[0])));
    });
  });
  return { nodes, edges };
}

/* ---------- 入力表 ---------- */

const node = (id, path, label = 'ページ', kind = 'page', reason) => ({ id, position: { x: 0, y: 0 }, data: { label, path, kind, reason } });
const PEERS = [node('a-home', '/', 'トップ', 'home'), node('a-x', '/shop'), node('a-y', '/Shop')];
const LABELS = ['', ' ', '　', 'トップ', ' トップ ', 'a'.repeat(24), 'a'.repeat(25), ` ${'あ'.repeat(24)} `, '😀'.repeat(12), '😀'.repeat(13), 'お問い合わせ\n', '\t'];
const PATHS = ['', ' ', '/', ' / ', 'shop', '/shop', '/Shop', '/shop/', '/a_b-c/d', '/a b', '/日本', `/${'a'.repeat(59)}`, `/${'a'.repeat(60)}`, '//', '/x?y', '/x#y', '/x.html'];
const SELF = [undefined, 'a-x', 'a-y', 'a-home', 'a-none'];
const PLAN_IDS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'generic', 'new-x'];
const petitSpecs = (n) => [['home', 'トップ', '/', 'home', '理由'], ...Array.from({ length: n }, (_, k) => [`k${k}`, `ページ${k}`, `/p${k}`, k === n - 1 ? 'cta' : k % 2 ? 'new' : 'page', k % 3 ? `理由${k}` : undefined])];
const TREE_SPECS = [
  [['home', 'トップ', '/', 'home']],
  [['home', 'トップ', '/', 'home', 'r'], ['a', 'A', '/a', 'section']],
  ...[1, 2, 5, 10, 15, 30].map(petitSpecs),
  // 子あり・子が 1〜4 件・親が見つからない子（配置されない）・親のキーが重複
  [['home', 'トップ', '/', 'home'], ['a', 'A', '/a', 'section'], ['a1', 'A1', '/a/1', 'page', undefined, 'a'], ['b', 'B', '/b', 'section'],
    ['b1', 'B1', '/b/1', 'page', 'x', 'b'], ['b2', 'B2', '/b/2', 'new', undefined, 'b'], ['b3', 'B3', '/b/3', 'page', undefined, 'b'], ['b4', 'B4', '/b/4', 'cta', undefined, 'b'],
    ['orphan', 'O', '/o', 'page', undefined, 'zzz'], ['c', 'C', '/c', 'cta', 'c']],
  [['home', 'トップ', '/', 'home'], ['a', 'A', '/a', 'section'], ['a', 'A2', '/a2', 'page'], ['k', 'K', '/k', 'page', undefined, 'a']],
];

/* ---------- 1) 移動の同値 ---------- */

test('P-5 validateLabel: 移動の前後で全入力の文言が同じ（metrics.ts の re-export と shared の本体）', () => {
  for (const l of LABELS) {
    assert.equal(metrics.validateLabel(l), OLD_validateLabel(l), JSON.stringify(l));
    assert.equal(rules.validateLabel(l), OLD_validateLabel(l), JSON.stringify(l));
  }
});

test('P-5 validatePath: 移動の前後で全入力×自分の id の文言が同じ', () => {
  for (const p of PATHS) for (const s of SELF) {
    assert.equal(metrics.validatePath(p, PEERS, s), OLD_validatePath(p, PEERS, s), `${JSON.stringify(p)} self=${s}`);
    assert.equal(metrics.validatePath(p, [], s), OLD_validatePath(p, [], s));
  }
});

test('P-5 sitemapMetrics・depthMap: 見本の全案件（現在／改善後）・空・家なしで同じ', () => {
  const cases = PLAN_IDS.flatMap((id) => { const s = sitemapFor(id); return [s.before, s.after]; });
  cases.push(emptySitemap().after, { nodes: [node('a-x', '/x', 'お問い合わせ')], edges: [] }, { nodes: [node('a-h', '/', 't', 'home'), node('a-c', '/c', 'c', 'cta')], edges: [] });
  for (const c of cases) {
    assert.deepStrictEqual(metrics.sitemapMetrics(c.nodes, c.edges), OLD_sitemapMetrics(c.nodes, c.edges));
    assert.deepStrictEqual([...metrics.depthMap(c.nodes, c.edges)], [...OLD_depthMap(c.nodes, c.edges)]);
  }
});

test('P-5 tree: 配置が移動前の写しと同じ（子・親なし・キー重複・petit の 1〜30 ページ）', () => {
  for (const specs of TREE_SPECS) for (const prefix of ['a', 'b']) {
    assert.deepStrictEqual(tree(prefix, specs), OLD_tree(prefix, specs), JSON.stringify(specs[1] ?? specs[0]));
  }
});

test('P-5 tree の全利用者: sitemapFor（全案件）・seedSitemap（present）・sitemapFromSpecs（petit）の出力が移動前に計ったハッシュと同じ', () => {
  const out = {
    plans: PLAN_IDS.map((id) => sitemapFor(id)),
    seed: seedSitemap(), empty: emptySitemap(),
    petit: [5, 10, 15].map((n) => sitemapFromSpecs(petitSpecs(n))),
    metrics: PLAN_IDS.map((id) => { const s = sitemapFor(id); return [metrics.sitemapMetrics(s.before.nodes, s.before.edges), metrics.sitemapMetrics(s.after.nodes, s.after.edges), [...metrics.depthMap(s.after.nodes, s.after.edges)]]; }),
  };
  const s = JSON.stringify(out, (k, x) => (x === undefined ? '__undef__' : x));
  // 移動前（6dec7e0）の src で同じ式を計った値
  assert.equal(createHash('sha256').update(s).digest('hex'), 'a6e8ec27706b34f800b8f471215ee4b1e7c62310cd7a4fec5ec66b613bf77981');
});

test('P-5 metrics.ts と data/sitemap.ts は本体を持たない（re-export／import だけ）。利用者の import 先は変えていない', () => {
  const m = readFileSync(new URL('../../src/features/sitemap/metrics.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(m, /function |=>/);
  const d = readFileSync(new URL('../../src/data/sitemap.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(d, /function tree\(/);
  for (const [f, re] of [
    ['../../src/features/present/petit/petitPlan.ts', /from '@\/data\/sitemap'/],
    ['../../src/features/design/designContext.ts', /from '@\/data\/sitemap'/],
    ['../../src/features/present/PresentPage.tsx', /from '@\/data\/sitemap'/],
    ['../../src/store/reducer.ts', /from '@\/data\/sitemap'/],
    ['../../src/store/projectWork.ts', /from '@\/data\/sitemap'/],
    ['../../src/features/sitemap/SitemapView.tsx', /from '\.\/metrics'/],
    ['../../src/features/sitemap/AddPageDialog.tsx', /from '\.\/metrics'/],
    ['../../src/features/sitemap/SitemapViewer.tsx', /from '\.\/metrics'/],
  ]) assert.match(readFileSync(new URL(f, import.meta.url), 'utf8'), re, f);
});

/* ---------- 2) validateSitemapDoc ---------- */

const { validateSitemapDoc, SITEMAP_LIMITS, canonicalSitemapJson } = rules;
const codes = (doc, opts) => validateSitemapDoc(doc, opts).errors.map((e) => `${e.field}:${e.code}${e.nodeId ? `@${e.nodeId}` : ''}`);
const okDoc = () => {
  const s = sitemapFor('p1');
  return { before: s.before, after: s.after };
};
const diagram = (nodes, edges = []) => ({ nodes, edges });
const home = (p = 'a') => node(`${p}-home`, '/', 'トップ', 'home');

test('SITEMAP_LIMITS: 60 ページ・120 接続・AI 30 ページ・座標 ±100,000・名前 24・パス 60・理由 140・コメント 500', () => {
  assert.deepEqual(
    { pages: SITEMAP_LIMITS.pages, edges: SITEMAP_LIMITS.edges, aiPages: SITEMAP_LIMITS.aiPages, coord: SITEMAP_LIMITS.coord, label: SITEMAP_LIMITS.label, path: SITEMAP_LIMITS.path, reason: SITEMAP_LIMITS.reason, devComment: SITEMAP_LIMITS.devComment },
    { pages: 60, edges: 120, aiPages: 30, coord: 100000, label: 24, path: 60, reason: 140, devComment: 500 },
  );
});

test('validateSitemapDoc: demo の見本（全案件）・空の現在サイト・petit は通る', () => {
  for (const id of PLAN_IDS) assert.deepEqual(validateSitemapDoc({ ...sitemapFor(id) }), { ok: true, errors: [] }, id);
  assert.equal(validateSitemapDoc({ before: diagram([]), after: sitemapFromSpecs(petitSpecs(15)).after }).ok, true);
  assert.equal(validateSitemapDoc(emptySitemap()).ok, true);
  // demo の採番（SitemapPage.tsx: `${a|b}-${Date.now().toString(36)}`）と reason: undefined のキー
  const after = diagram([home(), node(`a-${Date.now().toString(36)}`, '/new', '新しいページ', 'new', undefined)], [{ id: `a-home-a-${Date.now().toString(36)}`, source: 'a-home', target: `a-${Date.now().toString(36)}` }]);
  assert.equal(validateSitemapDoc({ before: diagram([]), after }).ok, true);
});

test('validateSitemapDoc AC-14: ページ名・パスは demo と同じ判定（コードで返す・値は返さない）', () => {
  const doc = (n) => ({ before: diagram([]), after: diagram([home(), n]) });
  assert.deepEqual(codes(doc(node('a-x', '/x', ''))), ['after.label:label_required@a-x']);
  assert.deepEqual(codes(doc(node('a-x', '/x', 'a'.repeat(25)))), ['after.label:label_too_long@a-x']);
  assert.deepEqual(codes(doc(node('a-x', '', 'x'))), ['after.path:path_required@a-x']);
  assert.deepEqual(codes(doc(node('a-x', 'x', 'x'))), ['after.path:path_slash@a-x']);
  assert.deepEqual(codes(doc(node('a-x', `/${'a'.repeat(60)}`, 'x'))), ['after.path:path_too_long@a-x']);
  assert.deepEqual(codes(doc(node('a-x', '/日本', 'x'))), ['after.path:path_chars@a-x']);
  assert.deepEqual(codes(doc(node('a-x', '/', 'x'))), ['after.path:path_duplicate@a-home', 'after.path:path_duplicate@a-x']);
  // 現在と改善後で同じパスは可（重複は同じ図の中だけ）
  assert.equal(validateSitemapDoc({ before: diagram([home('b')]), after: diagram([home()]) }).ok, true);
  // エラーに入力の文字列を入れない（sec M-6）
  const bad = '<img src=x onerror=alert(1)>';
  const r = validateSitemapDoc({ before: diagram([]), after: diagram([home(), node('a-x', bad, bad.repeat(3), 'page', bad.repeat(10))]) });
  assert.equal(JSON.stringify(r).includes('onerror'), false);
});

test('validateSitemapDoc AC-15: 制御文字・向きの制御・理由 140 字・種類・座標・ID', () => {
  const one = (n) => codes({ before: diagram([]), after: diagram([home(), n]) });
  assert.deepEqual(one(node('a-x', '/x', 'a‮b')), ['after.label:label_control@a-x']);
  assert.deepEqual(one(node('a-x', '/x', 'a\nb')), ['after.label:label_control@a-x']);
  assert.deepEqual(one(node('a-x', '/x', 'a\u0000b')), ['after.label:label_control@a-x']);
  assert.deepEqual(one(node('a-x', '/x', 'x', 'page', 'あ'.repeat(140))), []);
  assert.deepEqual(one(node('a-x', '/x', 'x', 'page', '')), []);
  assert.deepEqual(one(node('a-x', '/x', 'x', 'page', '1行目\n2行目')), []);
  assert.deepEqual(one(node('a-x', '/x', 'x', 'page', 'あ'.repeat(141))), ['after.reason:reason_too_long@a-x']);
  assert.deepEqual(one(node('a-x', '/x', 'x', 'page', 'a⁦b')), ['after.reason:reason_control@a-x']);
  assert.deepEqual(one(node('a-x', '/x', 'x', 'page', 3)), ['after.reason:shape@a-x']);
  // QA D-1: callable の SDK は reason: undefined を null で送る。null は「理由なし」と同じ（形の誤りにしない）
  assert.deepEqual(one(node('a-x', '/x', 'x', 'page', null)), []);
  assert.deepEqual(one(node('a-x', '/x', 'x', 'top')), ['after.kind:kind@a-x']);
  assert.deepEqual(one({ ...node('a-x', '/x'), position: { x: 100001, y: 0 } }), ['after.position:position@a-x']);
  assert.deepEqual(one({ ...node('a-x', '/x'), position: { x: -100000, y: 100000 } }), []);
  assert.deepEqual(one({ ...node('a-x', '/x'), position: { x: Number.NaN, y: 0 } }), ['after.position:position@a-x']);
  assert.deepEqual(one({ ...node('a-x', '/x'), position: { x: '1', y: 0 } }), ['after.position:position@a-x']);
  assert.deepEqual(one(node('a-X', '/x')), ['after.id:id_format']); // 形の違う ID はエラーに載せない
  assert.deepEqual(one(node(`a-${'a'.repeat(41)}`, '/x')), ['after.id:id_format']);
  assert.deepEqual(one(node('c-x', '/x')), ['after.id:id_format']);
  assert.deepEqual(one(node('a-home', '/x')), ['after.id:id_duplicate@a-home']);
});

test('validateSitemapDoc: トップは図ごとにちょうど 1 件（空の図は可）', () => {
  assert.deepEqual(codes({ before: diagram([]), after: diagram([node('a-x', '/x')]) }), ['after.nodes:home_count']);
  assert.deepEqual(codes({ before: diagram([]), after: diagram([home(), node('a-h2', '/h2', 'h', 'home')]) }), ['after.nodes:home_count']);
});

test('validateSitemapDoc: 接続は両端が同じ図に在る・自己接続なし・重複なし', () => {
  const nodes = [home(), node('a-x', '/x'), node('a-y', '/y')];
  const ed = (source, target, id = `${source}-${target}`) => ({ id, source, target });
  const c = (edges, before = diagram([home('b')])) => codes({ before, after: diagram(nodes, edges) });
  assert.deepEqual(c([ed('a-home', 'a-x'), ed('a-x', 'a-y')]), []);
  assert.deepEqual(c([ed('a-home', 'a-zz')]), ['after.edges:edge_endpoint@a-home']);
  assert.deepEqual(c([ed('b-home', 'a-x')]), ['after.edges:edge_endpoint@b-home']); // 別の図のノード
  assert.deepEqual(c([ed('a-x', 'a-x')]), ['after.edges:edge_self@a-x']);
  assert.deepEqual(c([ed('a-home', 'a-x'), ed('a-home', 'a-x', 'a-dup')]), ['after.edges:edge_duplicate@a-home']);
  assert.deepEqual(c([ed('a-home', 'a-x'), ed('a-home', 'a-y', 'a-home-a-x')]), ['after.edges:edge_id_duplicate@a-home']);
  assert.deepEqual(c([ed('a-home', 'a-x', 'bad id')]), ['after.edges:edge_id@a-home']);
  assert.deepEqual(c([{ ...ed('a-home', 'a-x'), label: 'x' }]), ['after.edges:unknown_key@a-home']);
});

test('validateSitemapDoc: 上限（60 ページ・120 接続・AI は 30 ページ）。超えたら件数のエラーだけ返す', () => {
  const many = (k) => [home(), ...Array.from({ length: k - 1 }, (_, i) => node(`a-p${i}`, `/p${i}`))];
  assert.equal(validateSitemapDoc({ before: diagram([]), after: diagram(many(60)) }).ok, true);
  assert.deepEqual(codes({ before: diagram([]), after: diagram(many(61)) }), ['after.nodes:too_many_pages']);
  assert.deepEqual(codes({ before: diagram([]), after: diagram(many(31)) }, { maxPages: SITEMAP_LIMITS.aiPages }), ['after.nodes:too_many_pages']);
  assert.equal(validateSitemapDoc({ before: diagram([]), after: diagram(many(30)) }, { maxPages: SITEMAP_LIMITS.aiPages }).ok, true);
  const ns = many(60);
  const edges = [];
  for (let i = 0; edges.length < 121; i++) edges.push({ id: `a-e${i}`, source: ns[i % 60].id, target: ns[(i * 7 + 1) % 60].id });
  assert.deepEqual(codes({ before: diagram([]), after: diagram(ns, edges) }), ['after.edges:too_many_edges']);
  // 巨大な入力でも件数のエラーだけ（ノードごとの検査をしない）
  const r = validateSitemapDoc({ before: diagram([]), after: diagram(Array.from({ length: 5000 }, (_, i) => node(`a-${i}`, '/'))) });
  assert.deepEqual(r.errors, [{ field: 'after.nodes', code: 'too_many_pages', count: 5000 }]);
});

test('validateSitemapDoc: 形の不正・知らないキー（版文書へ写らない項目を通さない＝sec L-3）', () => {
  assert.deepEqual(codes(null), ['doc:shape']);
  assert.deepEqual(codes({ before: diagram([]) }), ['after:shape']);
  assert.deepEqual(codes({ before: { nodes: [] }, after: diagram([]) }), ['before:shape']);
  assert.deepEqual(codes({ before: { nodes: [], edges: [], x: 1 }, after: diagram([]) }), ['before:unknown_key']);
  assert.deepEqual(codes({ before: diagram([]), after: diagram([home(), { ...node('a-x', '/x'), type: 'page' }]) }), ['after.nodes:unknown_key@a-x']);
  assert.deepEqual(codes({ before: diagram([]), after: diagram([home(), { ...node('a-x', '/x'), data: { label: 'x', path: '/x', kind: 'page', html: '<b>' } }]) }), ['after.nodes:unknown_key@a-x']);
  assert.deepEqual(codes({ before: diagram([]), after: diagram([home(), { ...node('a-x', '/x'), position: { x: 0, y: 0, z: 0 } }]) }), ['after.position:position@a-x']);
  assert.deepEqual(codes({ before: diagram([]), after: diagram([home(), 'x']) }), ['after.nodes:shape']);
  assert.deepEqual(codes({ before: diagram([]), after: diagram([home(), { id: 'a-x', position: { x: 0, y: 0 } }]) }), ['after.nodes:shape@a-x']);
});

test('validateSitemapDoc: 開発担当者より（trim 後 0〜500 字・改行可・他の制御文字は拒否）', () => {
  const d = (devComment) => codes({ ...okDoc(), devComment });
  assert.deepEqual(d(undefined), []);
  assert.deepEqual(d({ text: 'あ'.repeat(500), at: '2026-11-28T00:00:00.000Z', byName: '開発' }), []);
  assert.deepEqual(d({ text: ` ${'あ'.repeat(500)}\n` }), []);
  assert.deepEqual(d({ text: '1行目\n2行目' }), []);
  assert.deepEqual(d({ text: 'あ'.repeat(501) }), ['devComment:devComment_too_long']);
  assert.deepEqual(d({ text: 'a\tb' }), ['devComment:devComment_control']);
  assert.deepEqual(d({ text: 'a‪b' }), ['devComment:devComment_control']);
  assert.deepEqual(d({ text: 3 }), ['devComment:shape']);
  assert.deepEqual(d('text'), ['devComment:shape']);
});

/* ---------- canonicalSitemapJson（contentHash の正規化。DATA §2.3・sec L-3） ---------- */

test('canonicalSitemapJson: キー順・余計な項目に依らず同じ。お客様に見える項目を 1 つずつ変えると変わる', () => {
  const base = { ...okDoc(), devComment: { text: 'コメント', at: '2026-11-28T00:00:00.000Z', byName: '開発 B', byUid: 'devB' } };
  const c0 = canonicalSitemapJson(base);
  // キー順を変える・byUid（版文書へ写さない）を変えても同じ
  const reordered = {
    devComment: { byName: '開発 B', at: '2026-11-28T00:00:00.000Z', text: 'コメント', byUid: 'other' },
    after: { edges: base.after.edges.map((e) => ({ target: e.target, source: e.source, id: e.id })), nodes: base.after.nodes.map((n) => ({ data: { ...n.data }, position: { y: n.position.y, x: n.position.x }, id: n.id })) },
    before: base.before,
  };
  assert.equal(canonicalSitemapJson(reordered), c0);
  // Firestore の Timestamp（toDate）と ISO 文字列は同じ
  assert.equal(canonicalSitemapJson({ ...base, devComment: { ...base.devComment, at: { toDate: () => new Date('2026-11-28T00:00:00.000Z') } } }), c0);
  const n0 = base.after.nodes[1];
  const withNode = (patch) => ({ ...base, after: { ...base.after, nodes: base.after.nodes.map((n, i) => (i === 1 ? patch(n) : n)) } });
  const variants = {
    label: withNode((n) => ({ ...n, data: { ...n.data, label: `${n.data.label}x` } })),
    path: withNode((n) => ({ ...n, data: { ...n.data, path: `${n.data.path}x` } })),
    reason: withNode((n) => ({ ...n, data: { ...n.data, reason: `${n.data.reason ?? ''}x` } })),
    kind: withNode((n) => ({ ...n, data: { ...n.data, kind: n.data.kind === 'new' ? 'page' : 'new' } })),
    x: withNode((n) => ({ ...n, position: { ...n.position, x: n.position.x + 1 } })),
    y: withNode((n) => ({ ...n, position: { ...n.position, y: n.position.y + 1 } })),
    id: withNode((n) => ({ ...n, id: `${n.id}x` })),
    edge: { ...base, after: { ...base.after, edges: base.after.edges.slice(1) } },
    edgeTarget: { ...base, after: { ...base.after, edges: base.after.edges.map((e, i) => (i === 0 ? { ...e, target: n0.id === e.target ? 'a-other' : n0.id } : e)) } },
    before: { ...base, before: { ...base.before, nodes: base.before.nodes.slice(0, -1) } },
    commentText: { ...base, devComment: { ...base.devComment, text: 'コメント2' } },
    commentAt: { ...base, devComment: { ...base.devComment, at: '2026-11-28T00:00:01.000Z' } },
    commentBy: { ...base, devComment: { ...base.devComment, byName: '開発 C' } },
    noComment: { ...base, devComment: undefined },
  };
  for (const [k, v] of Object.entries(variants)) assert.notEqual(canonicalSitemapJson(v), c0, k);
  // 理由なしと空の理由は別（お客様の画面の「改善理由」の有無が違う）
  const r1 = withNode((n) => ({ ...n, data: { ...n.data, reason: undefined } }));
  const r2 = withNode((n) => ({ ...n, data: { ...n.data, reason: '' } }));
  assert.notEqual(canonicalSitemapJson(r1), canonicalSitemapJson(r2));
  // 配列の並び（ページの順）は意味を持つ
  assert.notEqual(canonicalSitemapJson({ ...base, after: { ...base.after, nodes: [...base.after.nodes].reverse() } }), c0);
});
