#!/usr/bin/env node
// 出力の一覧（index.html）。各画面を幅 375px と 1280px の iframe で並べる。iframe は sandbox=""（スクリプト・フォーム送信・同一オリジン扱いをすべて禁止）。
//   node prototypes/ai-design-eval/gallery.mjs [out/<実行日時>]   … run-eval --go の最後にも自動で作る
// API を呼ばない。Playwright が入っていれば shots.mjs で PNG も撮れる（入っていなければこの一覧で目視）
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CASES, mainPageOf } from './cases.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** html/ のファイル名 → { source, caseId, run, letter, page, device } */
export function parseName(f) {
  const m = f.match(/^(.+?)__([dr]\d\d-[\w-]+?)__r(\d+)__([ABC])__(top|main)(?:__(phone|pc))?\.html$/);
  return m ? { file: f, source: m[1], caseId: m[2], run: +m[3], letter: m[4], page: m[5], device: m[6] ?? null } : null;
}

/** 1 案（2 画面 × 2 幅）の HTML 片。srcOf(page, device) は iframe の src（相対パス） */
export function proposalTiles(srcOf) {
  const frame = (src, w, scale, h = 900) => src
    ? `<div class="f" style="width:${Math.round(w * scale)}px;height:${Math.round(h * scale)}px"><iframe sandbox="" loading="lazy" src="${esc(src)}" width="${w}" height="${h}" style="transform:scale(${scale})"></iframe></div>`
    : `<div class="f none" style="width:${Math.round(w * scale)}px;height:${Math.round(h * scale)}px">なし</div>`;
  return ['top', 'main'].map((page) => `<div class="pg"><div class="pl">${page === 'top' ? 'トップ' : '主要ページ'}　<a href="${esc(srcOf(page, 'pc') ?? '')}" target="_blank" rel="noopener">別タブで開く</a></div>
<div class="row">${frame(srcOf(page, 'phone'), 375, 0.6, 1300)}${frame(srcOf(page, 'pc'), 1280, 0.4, 1950)}</div></div>`).join('');
}

export const GALLERY_CSS = `body{font:14px/1.6 system-ui,"Hiragino Sans","Yu Gothic",sans-serif;margin:24px;color:#1c1c1c;background:#f4f4f2}
h2{margin-top:40px;border-top:2px solid #888;padding-top:12px}.card{background:#fff;border:1px solid #ddd;border-radius:8px;padding:12px;margin:12px 0}
.row{display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap}.f{overflow:hidden;border:1px solid #ccc;background:#fff;position:relative}
.f iframe{border:0;transform-origin:0 0;position:absolute;left:0;top:0}.none{display:flex;align-items:center;justify-content:center;color:#999}
.pg{margin:8px 0}.pl{font-size:12px;color:#555;margin-bottom:4px}small{color:#555}`;

export function writeGallery(runDir, cases = CASES) {
  const htmlDir = join(runDir, 'html');
  if (!existsSync(htmlDir)) return null;
  const files = readdirSync(htmlDir).map(parseName).filter(Boolean);
  const raw = (src, caseId, run) => { const p = join(runDir, 'raw', `${src}__${caseId}__r${run}.json`); return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null; };
  const sections = cases.filter((c) => files.some((f) => f.caseId === c.id)).map((c) => {
    const groups = [...new Set(files.filter((f) => f.caseId === c.id).map((f) => `${f.source}|${f.run}|${f.letter}`))].sort();
    const cards = groups.map((g) => {
      const [source, run, letter] = g.split('|');
      const mine = files.filter((f) => f.caseId === c.id && f.source === source && f.run === +run && f.letter === letter);
      const srcOf = (page, device) => { const f = mine.find((x) => x.page === page && (x.device === device || x.device === null)); return f ? `html/${f.file}` : null; };
      const p = raw(source, c.id, run)?.proposals?.['ABC'.indexOf(letter)];
      return `<div class="card"><b>${esc(source)} ／ 案 ${letter}${p ? `：${esc(p.name)}` : ''}</b> <small>run ${run}</small>${p ? `<br><small>${esc(p.concept)}</small>` : ''}${proposalTiles(srcOf)}</div>`;
    }).join('');
    return `<h2>${esc(c.project.siteName)}（${esc(c.project.industry)}・ブランド色 ${esc(c.project.accent)}・主要ページ「${esc(mainPageOf(c).label)}」）</h2>${cards}`;
  });
  const page = `<!doctype html><html lang="ja"><meta charset="utf-8"><title>デザイン案の一覧</title><style>${GALLERY_CSS}</style>
<h1>デザイン案の一覧（${files.length} 画面）</h1><p>左 = 幅 375px（スマホ）、右 = 幅 1280px（PC）を縮小表示。iframe は sandbox（スクリプト無効）。</p>${sections.join('\n')}</html>`;
  const outFile = join(runDir, 'index.html');
  writeFileSync(outFile, page);
  return outFile;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = process.argv[2];
  const outRoot = join(here, 'out');
  const dir = arg ? (existsSync(arg) ? arg : join(outRoot, arg)) : join(outRoot, readdirSync(outRoot).filter((d) => existsSync(join(outRoot, d, 'html')) && d !== 'template').sort().at(-1) ?? '');
  const f = writeGallery(dir);
  console.log(f ? `一覧: ${f}` : `html/ が無い: ${dir}`);
}
