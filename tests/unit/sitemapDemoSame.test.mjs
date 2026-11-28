// demo のサイトマップ画面・制作フローのナビが、View と demo の入れ物への分割（LIVE_SITEMAP_IMPL_PLAN P-13・U3-a）の前後で
// 1 文字も変わらないことの確認（R-4・AC-27。props の無い経路を変えない）。
// 方法: 同じ固定の日時・同じ demo の保存データで renderToStaticMarkup し、分割前（7759a02）の出力の sha256 と比べる。
// demo の見た目を意図して変えたときだけ、`UPDATE_DEMO_SNAPSHOT=1 npm run test:unit` で表示された値に置き換える（理由をコミットに書く）。
// 実行: npm run test:unit
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { importTsxSource } from './tsxBundle.mjs';

/** 分割前（7759a02）の出力の sha256（先頭 16 桁） */
const BASELINE = {
  'site-p1-notCreated': '93c8319ecc37816c',
  'site-p3-approved': 'b3ea6caad2036d82',
  'site-p3-draft': '8ed7741a6cec8152',
  'site-p3-requested': '2d6f4540322aba25',
  'devSitemap-p3-draft': 'a922a879e2c8700d',
  'devSitemap-p3-draft-comment': 'bd0a97899f68ce05',
  'devSitemap-p3-approved-comment': 'e0bf7a0a32236ff3',
  'nav-design': '3f26f1c58ae1bbfc',
  'nav-devDesignReq': '6d5369bfb9196b36',
  'nav-hearingInput': 'b3a1a2e19927eb5a',
};

const NOW = Date.parse('2026-11-28T03:00:00.000Z');

const ENTRY = `
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { DemoStoreProvider } from '@/store/DemoStore';
import { ThemeModeProvider } from '@/theme/ThemeMode';
import { ToastProvider } from '@/hooks/useToast';
import SitemapPage from '@/features/sitemap/SitemapPage';
import { BuildFlowNav } from '@/components/layout/BuildFlowNav';
export { createSeedState } from '@/store/seed';
export { STORAGE_KEY } from '@/services/storage';
const wrap = (url, el) => renderToStaticMarkup(<MemoryRouter initialEntries={[url]}><DemoStoreProvider><ThemeModeProvider><ToastProvider>{el}</ToastProvider></ThemeModeProvider></DemoStoreProvider></MemoryRouter>);
export const page = (url) => wrap(url, <SitemapPage />);
export const nav = (url) => wrap(url, <BuildFlowNav />);
`;

const hash = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

test('demo のサイトマップ画面・BuildFlowNav の出力が分割前と同じ（props が無い経路）', async () => {
  const m = await importTsxSource(ENTRY);
  const store = new Map();
  globalThis.window = { addEventListener() {}, removeEventListener() {}, localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) } };
  const origError = console.error;
  // SSR の既知の警告（useLayoutEffect・MUI の prop-types）は出力に関係しないので黙らせる
  console.error = () => {};
  mock.timers.enable({ apis: ['Date'], now: NOW });
  try {
    const seed = m.createSeedState();
    const withP3 = (patch) => {
      const s = structuredClone(seed);
      s.currentProjectId = 'p3';
      const w = s.projectWork.p3;
      patch(w);
      return s;
    };
    const cases = {
      'site-p1-notCreated': ['/site', 'page', seed, 'サイトマップはまだ作成されていません'],
      'site-p3-approved': ['/site', 'page', withP3(() => {}), '承認済み'],
      'site-p3-draft': ['/site', 'page', withP3((w) => { delete w.sitemap.approvedAt; delete w.approvalRequests.sitemap; }), 'そのまま保存されます'],
      'devSitemap-p3-draft': ['/dev/sitemap', 'page', withP3((w) => { delete w.sitemap.approvedAt; delete w.approvalRequests.sitemap; }), 'ページを追加'],
      'site-p3-requested': ['/site', 'page', withP3((w) => { delete w.sitemap.approvedAt; }), 'お客様の承認待ち'],
      'devSitemap-p3-draft-comment': ['/dev/sitemap', 'page', withP3((w) => { delete w.sitemap.approvedAt; delete w.approvalRequests.sitemap; w.sitemap.devComment = { text: '意図<b>x</b>', at: '2026-11-20T01:00:00.000Z', by: '黒田' }; }), 'お客様へのコメント'],
      'devSitemap-p3-approved-comment': ['/dev/sitemap', 'page', withP3((w) => { w.sitemap.devComment = { text: '意図', at: '2026-11-20T01:00:00.000Z', by: '黒田' }; }), '開発担当者より'],
      'nav-design': ['/ai-studio/design', 'nav', withP3(() => {}), '制作フロー'],
      'nav-devDesignReq': ['/dev/design/requirements', 'nav', withP3(() => {}), '制作フロー'],
      'nav-hearingInput': ['/dev/hearing', 'nav', seed, null],
    };
    const got = {};
    for (const [name, [url, kind, state, must]] of Object.entries(cases)) {
      store.clear();
      store.set(m.STORAGE_KEY, JSON.stringify(state));
      const html = kind === 'page' ? m.page(url) : m.nav(url);
      if (process.env.DUMP_DIR) (await import('node:fs')).writeFileSync(`${process.env.DUMP_DIR}/${name}.html`, html);
      if (process.env.DUMP) console.log(name, html.replace(/<style[^>]*>[^<]*<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 900));
      if (must) assert.ok(html.includes(must), `${name}: 想定の画面になっていない（${must}）`);
      got[name] = hash(html);
    }
    if (process.env.UPDATE_DEMO_SNAPSHOT) console.log(JSON.stringify(got, null, 2));
    assert.deepEqual(got, BASELINE);
  } finally {
    mock.timers.reset();
    console.error = origError;
    delete globalThis.window;
  }
});
