// サイトマップの利用者入力（ページ名・パス・改善理由・開発担当者のコメント）が HTML として解釈されないことの確認（LIVE_SITEMAP_IMPL_PLAN U3-b）。
// live ではページ名・理由・コメントは担当者と AI の出力で、お客様の画面にも出る。React のエスケープに頼っていること（dangerouslySetInnerHTML を使っていないこと）を
// renderToStaticMarkup の出力で確かめる。React Flow のノードは SSR で描かれないので、PageNode は ReactFlowProvider の中で直接描く。
// 実行: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importTsxSource } from './tsxBundle.mjs';

const ENTRY = `
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { ReactFlowProvider } from '@xyflow/react';
import { ThemeModeProvider } from '@/theme/ThemeMode';
import { ToastProvider } from '@/hooks/useToast';
import { SitemapView } from '@/features/sitemap/SitemapView';
import { SitemapViewer } from '@/features/sitemap/SitemapViewer';
import { SitemapDevCommentPanelView, SitemapDevCommentView } from '@/features/sitemap/DevCommentView';
import { PageNode } from '@/features/sitemap/PageNode';
const wrap = (el) => renderToStaticMarkup(<MemoryRouter initialEntries={['/site']}><ThemeModeProvider><ToastProvider>{el}</ToastProvider></ThemeModeProvider></MemoryRouter>);
export const view = (sitemap, locked) => wrap(<SitemapView source={{
  sitemap, locked, lockedNote: sitemap.devComment.text, saveDelayMs: 300, onSave() {}, aiBadge: { tooltip: sitemap.devComment.text },
  devCommentPanel: <SitemapDevCommentPanelView saved={sitemap.devComment} writable={!locked} onSave={() => {}} />,
  backTo: '/projects/p1', nav: null, created: true, notCreated: null, reqApproved: true, description: sitemap.devComment.text,
}} />);
export const viewer = (sitemap) => wrap(<SitemapViewer sitemap={sitemap} />);
export const comment = (c) => wrap(<SitemapDevCommentView comment={c} />);
export const node = (data) => wrap(<ReactFlowProvider><PageNode id="n1" data={data} selected={false} isConnectable type="page" dragging={false} zIndex={0} selectable deletable draggable positionAbsoluteX={0} positionAbsoluteY={0} /></ReactFlowProvider>);
`;

const EVIL = '<img src=x onerror=alert(1)><script>alert(2)</script>';
const EVIL_LABEL = '"><svg onload=alert(3)>';
const PATH = '/"><script>alert(4)</script>';

/** React の文字のエスケープ（& < > " '）と同じ */
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');

/** 生の危険なタグ・属性が出力に無い（エスケープされた文字列としては出てよい） */
function assertInert(html, where) {
  assert.ok(!/<script[\s>]/i.test(html), `${where}: <script> がそのまま出ている`);
  assert.ok(!/<img[^>]*onerror/i.test(html), `${where}: <img onerror> がそのまま出ている`);
  assert.ok(!/<svg[^>]*onload/i.test(html), `${where}: <svg onload> がそのまま出ている`);
}

const diagram = () => ({
  nodes: [
    { id: 'h', position: { x: 0, y: 0 }, data: { label: EVIL_LABEL, path: '/', kind: 'home', reason: EVIL } },
    { id: 'a', position: { x: 0, y: 150 }, data: { label: EVIL, path: PATH, kind: 'new', reason: EVIL_LABEL } },
  ],
  edges: [{ id: 'h-a', source: 'h', target: 'a' }],
});
const sitemap = () => ({ before: diagram(), after: diagram(), devComment: { text: EVIL, at: '2026-11-20T01:00:00.000Z', by: EVIL_LABEL } });

test('サイトマップの画面・閲覧の図・コメント・ページカードが、ページ名・理由・コメントを HTML として解釈しない', async () => {
  const m = await importTsxSource(ENTRY);
  globalThis.window ??= { addEventListener() {}, removeEventListener() {}, localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
  const origError = console.error;
  console.error = () => {};
  try {
    // 編集できる画面（改善理由の一覧・コメントの入力欄）と閲覧だけの画面（注記・コメントの表示）
    for (const locked of [false, true]) {
      const html = m.view(sitemap(), locked);
      assertInert(html, `SitemapView locked=${locked}`);
      // 改善理由の一覧に、理由が文字として出ている（描かれていないのに緑にならないように）
      assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'), `SitemapView locked=${locked}: 改善理由の一覧が出ていない`);
    }
    const viewer = m.viewer(sitemap());
    assertInert(viewer, 'SitemapViewer');
    assert.ok(viewer.includes('リニューアル後'), 'SitemapViewer が描かれていない');
    const c = m.comment(sitemap().devComment);
    assertInert(c, 'SitemapDevCommentView');
    assert.ok(c.includes('&lt;script&gt;alert(2)&lt;/script&gt;'), 'コメントが文字として出ていない');
    for (const data of diagram().nodes.map((n) => n.data)) {
      const html = m.node(data);
      assertInert(html, `PageNode ${data.kind}`);
      assert.ok(html.includes(esc(data.label)), `PageNode ${data.kind}: ページ名が文字として出ていない`);
    }
  } finally {
    console.error = origError;
  }
});
