// サイトマップの「現在」用のナビ抽出（extractHtml の baseUrl・navItems。LIVE_SITEMAP_AI.md §1.3・IMPL_PLAN §4 U-F2 part A）。
// 純関数だけ（ネットワーク・エミュレータに触らない）。既存の navLinks と他の項目は baseUrl の有無で変わらない（スナップショット）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const req = createRequire(import.meta.url);
const { extractHtml, navPathOf } = req('../../functions/lib/ai/site/extract.js');
const { SITE_LIMITS } = req('../../functions/lib/ai/limits.js');

const BASE = new URL('https://shop.example/');
const HTML = [
  '<html><head><title>T</title><meta name="description" content="説明"></head><body>',
  '<nav>',
  '<a href="/">ホーム</a>',
  '<a class="x" href="/Menu/?q=1#top">メニュー</a>',
  '<a href="about">店舗情報</a>',
  '<a href="https://shop.example/news/2026/">お知らせ</a>',
  '<a href="//shop.example/contact">お問い合わせ</a>',
  '<a href="https://other.example/x">外部</a>',
  '<a href="https://www.shop.example/y">別ホスト</a>',
  '<a href="http://shop.example/down">http へ</a>',
  '<a href="mailto:info@shop.example">メール</a>',
  '<a href="tel:0312345678">電話 03-1234-5678</a>',
  '<a href="javascript:alert(1)">JS</a>',
  '<a href="/%E3%81%82">日本語パス</a>',
  '<a href="#top">先頭</a>',
  '<a>href なし</a>',
  '<a href="/empty"> </a>',
  '<a href="https://shop.example:8443/p">ポート</a>',
  '</nav><p>本文</p></body></html>',
].join('');

test('navItems: 同一ホストのパスだけ（クエリ・フラグメント除去・小文字・末尾 / 除去・相対とプロトコル相対を解決）', () => {
  const e = extractHtml(HTML, undefined, BASE);
  assert.deepEqual(e.navItems, [
    { text: 'ホーム', path: '/' },
    { text: 'メニュー', path: '/menu' },
    { text: '店舗情報', path: '/about' },
    { text: 'お知らせ', path: '/news/2026' },
    { text: 'お問い合わせ', path: '/contact' },
    { text: '先頭', path: '/' },
  ]);
});

test('navItems: 外部・別ホスト・https→http・mailto・tel・javascript・validatePath を通らないパス・別ポート・文字なしは入れない', () => {
  const paths = extractHtml(HTML, undefined, BASE).navItems.map((x) => x.path);
  for (const bad of ['/x', '/y', '/down', '/p', '/empty']) assert.ok(!paths.includes(bad), bad);
  assert.ok(!paths.some((p) => p.includes('%')));
});

test('navItems: 文字は navLinks と同じ除去（電話・メール）を通る', () => {
  const e = extractHtml('<nav><a href="/c">電話 03-1234-5678 info@shop.example</a></nav>', undefined, BASE);
  assert.equal(e.navItems.length, 1);
  assert.doesNotMatch(JSON.stringify(e.navItems), /1234-5678|info@shop/);
  assert.equal(e.navItems[0].text, e.navLinks[0]);
});

test('navItems: baseUrl を渡さない・不正な baseUrl なら []（既存の呼び出しは変わらない）', () => {
  assert.deepEqual(extractHtml(HTML).navItems, []);
  assert.deepEqual(extractHtml(HTML, undefined, 'not a url').navItems, []);
  assert.equal(extractHtml(HTML, undefined, 'https://shop.example/').navItems.length, 6);
});

test('スナップショット: baseUrl の有無で navItems 以外（navLinks を含む）は同じ・navLinks は従来の値', () => {
  const a = extractHtml(HTML);
  const b = extractHtml(HTML, undefined, BASE);
  const { navItems: _a, ...restA } = a;
  const { navItems: _b, ...restB } = b;
  assert.deepEqual(restB, restA);
  // 変更前（a11c7c3）の lib で同じ HTML を抽出した値（2026-11-28 採取）
  assert.deepEqual(b.navLinks, ['ホーム', 'メニュー', '店舗情報', 'お知らせ', 'お問い合わせ', '外部', '別ホスト', 'http へ', 'メール', '電話 [電話]', 'JS', '日本語パス', '先頭', 'href なし', 'ポート']);
  assert.equal(b.title, 'T');
  assert.equal(b.description, '説明');
});

test('navItems: 上限 50 件（SITE_LIMITS.maxNavLinks）・非表示のナビは入れない', () => {
  const many = `<nav>${Array.from({ length: 80 }, (_, i) => `<a href="/p${i}">P${i}</a>`).join('')}</nav><nav hidden><a href="/secret">秘密</a></nav>`;
  const e = extractHtml(many, undefined, BASE);
  assert.equal(e.navItems.length, SITE_LIMITS.maxNavLinks);
  assert.ok(!e.navItems.some((x) => x.path === '/secret'));
});

test('navPathOf: 空・null・不正は null（例外を投げない）', () => {
  assert.equal(navPathOf(null, BASE), null);
  assert.equal(navPathOf('   ', BASE), null);
  assert.equal(navPathOf('http://[::1]/', BASE), null);
  assert.equal(navPathOf('/A/B//', BASE), '/a/b');
});
