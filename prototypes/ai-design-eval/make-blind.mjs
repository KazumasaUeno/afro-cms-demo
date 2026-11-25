#!/usr/bin/env node
// 盲検の採点表（設計 §3.3: 開発者 2 名・出し手を伏せる・5 観点 1〜5 点・現行テンプレートも混ぜる）。API を呼ばない。
//   node prototypes/ai-design-eval/make-blind.mjs [out/<実行日時>] [--models a,b]
// - 機械の合格基準（checks.mjs MACHINE_CRITERIA）を満たしたモデルだけを回す（--models で上書き。不合格のモデルも見たいとき）
// - 1 件 = 1 案件 × 1 出し手の 3 案（各 2 画面 × 2 幅）。各案件の run 1 を使う
// - 現行テンプレートは out/template/（render-template.mjs）から。無ければテンプレートなしで作り、警告する（合否の比較ができない）
// - 画面は blind/html/ に「出し手が分からない名前」で写す（元のファイル名にはモデル名が入っているため）
// 出力（out/<実行日時>/blind/）: sheet.html（採点者に渡す）・scores-scorer1.csv / scores-scorer2.csv（各自記入）・key.json（採点が終わるまで開かない）
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CASES, mainPageOf } from './cases.mjs';
import { machinePass } from './checks.mjs';
import { esc, GALLERY_CSS, parseName, proposalTiles } from './gallery.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const modelsArg = args.includes('--models') ? args[args.indexOf('--models') + 1].split(',') : null;
const outArg = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--models');
const outRoot = join(here, 'out');
const runDir = outArg ? (existsSync(outArg) ? outArg : join(outRoot, outArg)) : join(outRoot, (existsSync(outRoot) ? readdirSync(outRoot) : []).filter((d) => existsSync(join(outRoot, d, 'summary.json'))).sort().at(-1) ?? '');
if (!existsSync(join(runDir, 'summary.json'))) { console.error(`summary.json が無い: ${runDir}（--go の実行結果を指定）`); process.exit(2); }

export const ASPECTS = [['brand', 'ブランドに合うか'], ['req', '要件どおりか'], ['jp', '日本語の読みやすさ'], ['cta', 'CTA の分かりやすさ'], ['sp', 'スマホ']];

const summary = JSON.parse(readFileSync(join(runDir, 'summary.json'), 'utf8'));
for (const s of summary) console.log(`${s.model}: 機械 ${machinePass(s) ? '合格' : '不合格'}（n=${s.n} schema=${s.schemaOk} 禁止=${s.forbidden} ブランド色なし=${s.brandMissing} CTAなし=${s.ctaMissing} 文字化け=${s.mojibake} コントラスト不足=${s.contrastFail}/UNKNOWN ${s.contrastUnknown} 似た3案=${s.notDistinct} p90=${s.p90ms}ms $${s.costUsd}）`);
const models = modelsArg ?? summary.filter(machinePass).map((s) => s.model);
if (!models.length) { console.error('機械の基準を満たしたモデルが無い。盲検は不要（プロンプトを直して同じセットを回し直す）。不合格でも見たいときは --models で指定'); process.exit(1); }

const tplDir = join(outRoot, 'template');
const sources = [...models.map((m) => ({ source: m, dir: runDir })), ...(existsSync(join(tplDir, 'html')) ? [{ source: 'template', dir: tplDir }] : [])];
if (!sources.some((s) => s.source === 'template')) console.warn('警告: out/template/html が無い（node prototypes/ai-design-eval/render-template.mjs を先に）。現行テンプレートとの比較ができない');

// 決まった種で並べ替え（同じ結果から同じ表ができる）
let seed = 20261126;
const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
const shuffle = (xs) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const items = [];
const missing = [];
for (const c of CASES) for (const s of sources) {
  const files = readdirSync(join(s.dir, 'html')).map(parseName).filter((f) => f && f.source === s.source && f.caseId === c.id && f.run === 1);
  if (files.length < 6) { missing.push(`${s.source}.${c.id}`); continue; }
  items.push({ c, ...s, files });
}
const order = shuffle(items).map((it, i) => ({ ...it, id: `B${String(i + 1).padStart(3, '0')}` }));

const dir = join(runDir, 'blind');
rmSync(dir, { recursive: true, force: true });
mkdirSync(join(dir, 'html'), { recursive: true });
const card = (it) => {
  // 案の順も出し手ごとに混ぜる（テンプレートは常に「ミニマル・クリエイティブ・プレミアム」の順なので、順で見分けられないように）
  const letters = shuffle(['A', 'B', 'C']);
  it.letterMap = {};
  const tiles = letters.map((L, k) => {
    const shown = 'ABC'[k];
    it.letterMap[shown] = L;
    const srcOf = (page, device) => {
      const f = it.files.find((x) => x.letter === L && x.page === page && (x.device === device || x.device === null));
      if (!f) return null;
      const name = `${it.id}_${shown}_${page}_${device}.html`;
      copyFileSync(join(it.dir, 'html', f.file), join(dir, 'html', name));
      return `html/${name}`;
    };
    return `<div class="card"><b>案 ${shown}</b>${proposalTiles(srcOf)}</div>`;
  }).join('');
  const c = it.c;
  return `<section><h2>${it.id}　${esc(c.project.siteName)}（${esc(c.project.industry)}）</h2>
<details><summary>お客様の入力（AI に送ったもの）</summary><ul><li>ブランド色: ${esc(c.project.accent)}</li><li>強み: ${esc(c.hearing['q-strength'])}</li><li>ターゲット: ${esc(c.hearing['q-target'])}</li><li>コンバージョン: ${esc(c.hearing['q-cv'])}</li>
<li>不満: ${esc(c.design['q-design-dislike'])}</li><li>企業イメージ: ${esc(c.design['q-image'])}</li><li>参考: ${esc(c.design['q-design-ref'])}</li><li>写真・イラスト: ${esc(c.design['q-design-media'])}</li><li>スマホ: ${esc(c.design['q-design-sp'])}</li>
<li>ナビ: ${esc(c.sitemap.map((n) => n.label).join(' / '))}（主要ページ「${esc(mainPageOf(c).label)}」）</li></ul></details>${tiles}</section>`;
};
const cards = order.map(card);
writeFileSync(join(dir, 'sheet.html'), `<!doctype html><html lang="ja"><meta charset="utf-8"><title>デザイン案 盲検 採点表</title><style>${GALLERY_CSS}</style>
<h1>デザイン案の盲検 採点表（${order.length} 件。1 件 = 1 案件の 3 案）</h1>
<p>各件の 3 案をまとめて見て、5 観点を 1〜5 で採点し、自分の scores-scorerN.csv に書いてください（もう 1 人のファイルは見ない）。<b>出し手（AI のモデル名・現行テンプレート）は伏せてあります。key.json は採点が終わるまで開かないでください。</b></p>
<p>観点: ${ASPECTS.map(([, l]) => l).join('／')}。distinct 列は「3 案が見分けられる」なら y、そうでなければ n。</p>
<p>5 = そのままお客様に出せる ／ 4 = 少し直せば出せる ／ 3 = 使える部分が半分ほど ／ 2 = ほぼ作り直し ／ 1 = 使えない・誤り・不適切（入力に無い数字や主張がある・文字化け・崩れ）</p>
${cards.join('\n')}</html>`);
const header = `id,${ASPECTS.map(([k]) => k).join(',')},distinct,comment`;
// 採点者ごとに別ファイル。先頭は BOM（Excel で文字化けさせない）
for (const who of ['scorer1', 'scorer2']) writeFileSync(join(dir, `scores-${who}.csv`), `﻿${header}\n${order.map((it) => `${it.id},,,,,,,`).join('\n')}\n`);
writeFileSync(join(dir, 'key.json'), JSON.stringify(Object.fromEntries(order.map((it) => [it.id, { source: it.source, case: it.c.id, shownToOriginal: it.letterMap }])), null, 2));
console.log(`採点表: ${join(dir, 'sheet.html')}（${order.length} 件 = ${CASES.length} 件 × [${sources.map((s) => s.source).join(', ')}]）`);
if (missing.length) console.log(`画面がそろわず外したもの ${missing.length} 件: ${missing.join(' ')}`);
