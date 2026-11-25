#!/usr/bin/env node
// 画面のスクリーンショット（幅 375 / 1280・全体）。Playwright がリポジトリに「既に」入っているときだけ動く（依存は足さない）。
//   node prototypes/ai-design-eval/shots.mjs out/<実行日時>   → out/<実行日時>/shots/<画面>__375.png / __1280.png
// 入っていなければ何もせず終わる（index.html の iframe 一覧で目視する）。JavaScript は無効のまま開く
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const req = createRequire(join(here, '..', '..', 'package.json'));
let pw;
for (const name of ['playwright', '@playwright/test', 'playwright-core']) { try { pw = req(name); break; } catch { /* 次 */ } }
if (!pw) { console.log('Playwright がこのリポジトリに入っていない（package.json に無い。依存は足さない）。スクリーンショットは撮らずに終わる。index.html（幅 375 / 1280 の iframe 一覧）で見てください'); process.exit(0); }

const arg = process.argv[2];
if (!arg) { console.error('out/<実行日時> を指定'); process.exit(2); }
const dir = existsSync(arg) ? arg : join(here, 'out', arg);
const files = readdirSync(join(dir, 'html')).filter((f) => f.endsWith('.html'));
mkdirSync(join(dir, 'shots'), { recursive: true });
const browser = await pw.chromium.launch();
try {
  for (const width of [375, 1280]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, javaScriptEnabled: false, offline: true });
    const page = await ctx.newPage();
    for (const f of files) {
      if ((f.endsWith('__phone.html') && width !== 375) || (f.endsWith('__pc.html') && width !== 1280)) continue;
      await page.goto(pathToFileURL(join(dir, 'html', f)).href);
      await page.screenshot({ path: join(dir, 'shots', `${f.replace(/\.html$/, '')}__${width}.png`), fullPage: true });
    }
    await ctx.close();
  }
} finally { await browser.close(); }
console.log(`スクリーンショット: ${join(dir, 'shots')}`);
