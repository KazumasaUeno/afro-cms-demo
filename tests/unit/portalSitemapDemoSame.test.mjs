// demo のお客様ポータルの確認・承認とプロジェクト詳細が、サイトマップ区画の View への切り出し（LIVE_SITEMAP_IMPL_PLAN P-13・U4）と
// approvalSteps の designAvailable（P-10）の追加の前後で 1 文字も変わらないことの確認（R-4・AC-27。props の無い経路を変えない）。
// 方法: 同じ固定の日時・同じ demo の保存データで renderToStaticMarkup し、切り出し前（bc96362）の出力の sha256 と比べる。
// demo の見た目を意図して変えたときだけ、`UPDATE_DEMO_SNAPSHOT=1 npm run test:unit` で表示された値に置き換える（理由をコミットに書く）。
// 実行: npm run test:unit
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { importTsxSource } from './tsxBundle.mjs';

/** 切り出し前（bc96362）の出力の sha256（先頭 16 桁） */
const BASELINE = {
  'portal-p1': '883332af1e982dde',
  'portal-p3-approved': '70c642c8b22b9819',
  'portal-p3-requested': '48d7c902b3220cbf',
  'portal-p3-requested-comment': '0daac92e75f6160c',
  'portal-p3-draft': 'b8cee99308fe775b',
  'portal-p3-notCreated': 'bd6ae8b4bcd91706',
  'portal-p3-preview': 'ff02116f2e4894e3',
  'detail-p3': '3786370c0b94501e',
  'detail-p3-requested': '158526fb468d7c66',
  'detail-p3-designWait': 'd44ae999b5d597ba',
  'detail-p1': '1aa53c4017209661',
};

const NOW = Date.parse('2026-11-28T03:00:00.000Z');

const ENTRY = `
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { DemoStoreProvider } from '@/store/DemoStore';
import { ThemeModeProvider } from '@/theme/ThemeMode';
import { ToastProvider } from '@/hooks/useToast';
import PortalApprovalsPage from '@/features/portal/PortalApprovalsPage';
import ProjectDetailPage from '@/features/projects/ProjectDetailPage';
export { createSeedState } from '@/store/seed';
export { STORAGE_KEY } from '@/services/storage';
const wrap = (url, el) => renderToStaticMarkup(<MemoryRouter initialEntries={[url]}><DemoStoreProvider><ThemeModeProvider><ToastProvider>{el}</ToastProvider></ThemeModeProvider></DemoStoreProvider></MemoryRouter>);
export const portal = (url, preview) => wrap(url, <PortalApprovalsPage preview={preview} />);
export const detail = (url) => wrap(url, <Routes><Route path="/projects/:projectId" element={<ProjectDetailPage />} /><Route path="/dev/projects/:projectId" element={<ProjectDetailPage />} /></Routes>);
`;

const hash = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

test('demo のポータルの確認・承認・プロジェクト詳細の出力が切り出し前と同じ（props が無い経路）', async () => {
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
    const requested = (w) => { w.schedule.approvedAt ??= '2026-11-20T00:00:00.000Z'; delete w.sitemap.approvedAt; delete w.design.approvedAt; delete w.design.selected; };
    const comment = { text: '意図<img src=x onerror=alert(1)>', at: '2026-11-20T01:00:00.000Z', by: '黒田' };
    const cases = {
      'portal-p1': ['/portal/approvals', 'portal', seed, '確認・承認'],
      'portal-p3-approved': ['/portal/approvals', 'portal', withP3(() => {}), 'サイトマップ'],
      'portal-p3-requested': ['/portal/approvals', 'portal', withP3(requested), 'リニューアル後は'],
      'portal-p3-requested-comment': ['/portal/approvals', 'portal', withP3((w) => { requested(w); w.sitemap.devComment = comment; }), '開発担当者より'],
      'portal-p3-draft': ['/portal/approvals', 'portal', withP3((w) => { requested(w); delete w.approvalRequests.sitemap; }), 'サイトマップ'],
      'portal-p3-notCreated': ['/portal/approvals', 'portal', withP3((w) => { requested(w); w.sitemap = { before: { nodes: [], edges: [] }, after: { nodes: [], edges: [] } }; }), 'アフロがサイトマップを作成しています'],
      'portal-p3-preview': ['/client-view/approvals', 'preview', withP3(requested), '説明用の表示'],
      'detail-p3': ['/projects/p3', 'detail', withP3(() => {}), 'サイトマップ'],
      'detail-p3-requested': ['/projects/p3', 'detail', withP3(requested), 'サイトマップ'],
      'detail-p3-designWait': ['/dev/projects/p3', 'detail', withP3((w) => { delete w.design.approvedAt; delete w.design.selected; delete w.approvalRequests.design; }), 'サイトマップ'],
      'detail-p1': ['/projects/p1', 'detail', seed, 'ヒアリング'],
    };
    const got = {};
    for (const [name, [url, kind, state, must]] of Object.entries(cases)) {
      store.clear();
      store.set(m.STORAGE_KEY, JSON.stringify(state));
      const html = kind === 'detail' ? m.detail(url) : m.portal(url, kind === 'preview');
      if (process.env.DUMP_DIR) (await import('node:fs')).writeFileSync(`${process.env.DUMP_DIR}/${name}.html`, html);
      if (must) assert.ok(html.includes(must), `${name}: 想定の画面になっていない（${must}）`);
      assert.ok(!/<img[^>]*onerror/i.test(html), `${name}: 文字列が要素として出ている`);
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
