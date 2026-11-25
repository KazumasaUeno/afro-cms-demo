#!/usr/bin/env node
// 現行テンプレート（AI を使っていない 3 案。src/features/design/previews/*.tsx）を、評価用の 6 案件で静的 HTML にする（盲検の比較対象）。
// 本物の部品をそのまま使う: vite（既存の devDependency）の SSR 読み込みで designContext.ts と previews を読み、react-dom/server で文字列にする。
// 依存は増やさない（リポジトリの node_modules にある vite / react / react-dom だけ）。API を呼ばない。
//   node prototypes/ai-design-eval/render-template.mjs        → out/template/html/template__<案件>__r1__<A|B|C>__<top|main>__<phone|pc>.html
// 注意: テンプレートは端末ごとに描き分ける部品（device = phone 390px / pc 1280px）なので、幅ごとに別ファイル。
//       書体はアプリでは @fontsource の Noto を読むが、ここでは端末の書体になる（AI 案も外部書体なしなので条件は同じ）
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CASES, toSitemapState } from './cases.mjs';
import { htmlName } from './evaluate.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const req = createRequire(join(root, 'package.json'));
let vitePath;
try { vitePath = req.resolve('vite'); } catch { console.error('node_modules に vite が無い。リポジトリのルートで npm ci を 1 回実行（既存の依存だけ）'); process.exit(2); }
const { createServer } = await import(pathToFileURL(vitePath).href);

const server = await createServer({ root, configFile: join(root, 'vite.config.ts'), logLevel: 'error', appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true, include: [] }, ssr: { external: ['react', 'react-dom'] } });
try {
  // react は Node で読む（SSR の部品と同じ実体。ssr.external で vite にも外部扱いさせる）
  const React = req('react');
  const { renderToStaticMarkup } = req('react-dom/server');
  const ctxMod = await server.ssrLoadModule('/src/features/design/designContext.ts');
  const { DESIGN_VARIANTS } = await server.ssrLoadModule('/src/data/designs.ts');
  const previews = {
    minimal: (await server.ssrLoadModule('/src/features/design/previews/MinimalPreview.tsx')).MinimalPreview,
    creative: (await server.ssrLoadModule('/src/features/design/previews/CreativePreview.tsx')).CreativePreview,
    premium: (await server.ssrLoadModule('/src/features/design/previews/PremiumPreview.tsx')).PremiumPreview,
  };
  const h = React.createElement;
  const outDir = join(here, 'out', 'template');
  mkdirSync(join(outDir, 'html'), { recursive: true });
  mkdirSync(join(outDir, 'raw'), { recursive: true });
  let n = 0;
  for (const c of CASES) {
    const project = { ...c.project, stage: 'design', progress: 0, ownerId: 'x', updatedAt: '2026-11-25T00:00:00Z', nextAction: '', pendingApprovals: 0 };
    const work = { requirements: { answers: c.hearing }, sitemap: toSitemapState(c), design: { answers: c.design } };
    const ctx = ctxMod.designContextOf(project, work);
    const ids = ['minimal', 'creative', 'premium'];
    const proposals = ids.map((id) => { const v = ctxMod.personalize(DESIGN_VARIANTS.find((x) => x.id === id), ctx); return { name: v.name, concept: v.description, palette: v.palette }; });
    writeFileSync(join(outDir, 'raw', `template__${c.id}__r1.json`), JSON.stringify({ source: 'template', proposals }, null, 2));
    ids.forEach((id, i) => {
      for (const page of ['top', 'main']) for (const device of ['phone', 'pc']) {
        const body = renderToStaticMarkup(h(previews[id], { device, still: true, ctx, page: page === 'main' ? ctx.pages[0] : undefined }));
        const doc = `<!doctype html>\n<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${c.project.siteName}</title><style>html,body{margin:0}body{-webkit-text-size-adjust:100%}</style></head><body>${body}</body></html>\n`;
        writeFileSync(join(outDir, 'html', htmlName('template', c.id, 1, i, page, device)), doc);
        n++;
      }
    });
  }
  console.log(`現行テンプレート: ${n} 画面（${CASES.length} 件 × 3 案 × 2 画面 × 2 幅）を ${join(outDir, 'html')} に書いた`);
  const { writeGallery } = await import('./gallery.mjs');
  console.log(`一覧: ${writeGallery(outDir)}`);
} finally {
  await server.close();
}
