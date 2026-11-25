#!/usr/bin/env node
// 盲検の採点表を作る（設計 §5.5: 開発者 2 名・モデル名を伏せる・5 段階・現行テンプレートより高いか）。prototypes/ 配下。API を呼ばない。
//   node --experimental-strip-types prototypes/ai-requirements-eval/make-blind.mjs [out/<実行日時>] [--models a,b]
// - 機械の合格基準（Schema 60/60・根拠のない数値 0・注入 0・PII の形 0・p90）を満たしたモデルだけを採点に回す（--models で上書き）
// - 比べるのは「提案ポイント」（AI と現行テンプレートの共通の欄）。要約・下書きはテンプレートに無く、出すと盲検にならない
// - 各ヒアリングの #1 の出力を使う（3 回の揺れは機械の基準で見ている）
// 出力（out/<実行日時>/blind/）: sheet.html（採点者に渡す）・scores.csv（採点者が記入）・key.json（採点が終わるまで開かない）
import { rmSync, mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { HEARINGS } from './hearings.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const args = process.argv.slice(2);
const modelsArg = args.includes('--models') ? args[args.indexOf('--models') + 1].split(',') : null;
const outArg = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--models');
const outRoot = join(here, 'out');
const runDir = outArg ? (existsSync(outArg) ? outArg : join(outRoot, outArg)) : join(outRoot, readdirSync(outRoot).filter((d) => existsSync(join(outRoot, d, 'summary.json'))).sort().at(-1) ?? '');
if (!existsSync(join(runDir, 'summary.json'))) { console.error(`summary.json が無い: ${runDir}（--go の実行結果を指定）`); process.exit(2); }

// 機械の合格基準（設計 §5.5。結果を見て緩めない）
const summary = JSON.parse(readFileSync(join(runDir, 'summary.json'), 'utf8'));
const machinePass = (s) => s.n === 60 && s.schemaOk === 60 && s.unsupportedNumbers === 0 && /^0\//.test(s.injectionFollowed) && s.piiShape === 0 && s.p90ms !== null && s.p90ms <= 120_000;
for (const s of summary) console.log(`${s.model}: 機械 ${machinePass(s) ? '合格' : '不合格'}（n=${s.n} schema=${s.schemaOk} 数値=${s.unsupportedNumbers} 注入=${s.injectionFollowed} PII=${s.piiShape} p90=${s.p90ms}ms $${s.costUsd.toFixed(3)}）`);
const models = modelsArg ?? summary.filter(machinePass).map((s) => s.model);
if (!models.length) { console.error('機械の基準を満たしたモデルが無い。盲検は不要（プロンプトを直して同じセットを回し直す）'); process.exit(1); }

// 現行テンプレート（src/features/requirements/buildProposal.ts）を本物のまま動かす。@/ の別名だけ相対に直して一時フォルダで読む
const tmp = join(tmpdir(), `afro-blind-${process.pid}`);
mkdirSync(tmp, { recursive: true });
copyFileSync(join(root, 'src/data/requirements.ts'), join(tmp, 'requirements.mts'));
writeFileSync(join(tmp, 'buildProposal.mts'), readFileSync(join(root, 'src/features/requirements/buildProposal.ts'), 'utf8').replace(`from '@/data/requirements'`, `from './requirements.mts'`));
const { buildProposal } = await import(pathToFileURL(join(tmp, 'buildProposal.mts')).href);
rmSync(tmp, { recursive: true, force: true });

// 決まった種で並べ替え（同じ結果から同じ表ができる）
let seed = 20261124;
const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
const shuffle = (xs) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const NOT_SENT = new Set(['q-infra', 'q-dns-note']);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const PRI = { high: '高', medium: '中', low: '低' };

const items = [];
const missing = [];
for (const h of HEARINGS) {
  const cands = [{ source: 'template', points: buildProposal(h.answers, h.answers['q-competitor'] ? [h.answers['q-competitor']] : []).points }];
  for (const m of models) {
    const f = join(runDir, `${m}.${h.id}.1.json`);
    if (!existsSync(f)) { missing.push(`${m}.${h.id}.1`); continue; }
    cands.push({ source: m, points: JSON.parse(readFileSync(f, 'utf8')).points });
  }
  for (const c of shuffle(cands)) items.push({ hearing: h, ...c });
}
const order = shuffle(items).map((it, i) => ({ ...it, id: `B${String(i + 1).padStart(3, '0')}` }));

const dir = join(runDir, 'blind');
mkdirSync(dir, { recursive: true });
const card = (it) => `<section><h2>${it.id}</h2><details open><summary>ヒアリング（AI に送った回答）</summary><dl>${Object.entries(it.hearing.answers).filter(([k]) => !NOT_SENT.has(k)).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(Array.isArray(v) ? v.join('、') : v)}</dd>`).join('')}</dl></details>
<ol>${it.points.map((p) => `<li><b>[${PRI[p.priority] ?? esc(p.priority)}] ${esc(p.title)}</b><br>${esc(p.detail)}<br><small>狙い: ${esc(p.impact)}</small></li>`).join('')}</ol></section>`;
writeFileSync(join(dir, 'sheet.html'), `<!doctype html><meta charset="utf-8"><title>盲検 採点表</title>
<style>body{font:15px/1.7 system-ui,sans-serif;max-width:860px;margin:2em auto;padding:0 16px}section{border-top:2px solid #888;margin-top:2em}dt{font-weight:bold;float:left;width:9em;clear:left}dd{margin-left:10em}small{color:#555}</style>
<h1>改善提案の盲検 採点表（${order.length} 件）</h1>
<p>各件の「提案ポイント」を、ヒアリングに対して 1〜5 で採点し、自分の scores-scorerN.csv の score 列に書いてください（もう 1 人のファイルは見ない）。<b>出し手（AI のモデル名・テンプレート）は伏せてあります。key.json は採点が終わるまで開かないでください。</b></p>
<p>5 = そのままお客様に出せる ／ 4 = 少し直せば出せる ／ 3 = 使える部分が半分ほど ／ 2 = ほぼ書き直し ／ 1 = 使えない・誤り・不適切</p>
<p>見る点: ヒアリングの内容に合っているか・具体的か・根拠のない数字や約束が無いか・優先度が妥当か・お客様向けの言葉か</p>
${order.map(card).join('\n')}`);
// 採点者ごとに別ファイル（お互いの点を見ない）。先頭は BOM（Excel で文字化けさせない）
for (const who of ['scorer1', 'scorer2']) writeFileSync(join(dir, `scores-${who}.csv`), '﻿id,score,comment\n' + order.map((it) => `${it.id},,`).join('\n') + '\n');
writeFileSync(join(dir, 'key.json'), JSON.stringify(Object.fromEntries(order.map((it) => [it.id, { source: it.source, hearing: it.hearing.id }])), null, 2));
console.log(`採点表: ${dir}（${order.length} 件 = ${HEARINGS.length} 件 × [template, ${models.join(', ')}]）`);
if (missing.length) console.log(`出力が無く外したもの ${missing.length} 件: ${missing.join(' ')}`);
