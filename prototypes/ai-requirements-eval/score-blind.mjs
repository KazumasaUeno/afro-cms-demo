#!/usr/bin/env node
// 盲検の集計（設計 §5.5: 平均 ≥ 3.5 かつ現行テンプレートより高い）。API を呼ばない。
//   node prototypes/ai-requirements-eval/score-blind.mjs out/<実行日時>
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const arg = process.argv[2];
if (!arg) { console.error('out/<実行日時> を指定'); process.exit(2); }
const runDir = existsSync(arg) ? arg : join(here, 'out', arg);
const dir = join(runDir, 'blind');
const key = JSON.parse(readFileSync(join(dir, 'key.json'), 'utf8'));
const lines = readFileSync(join(dir, 'scores.csv'), 'utf8').replace(/^﻿/, '').trim().split(/\r?\n/).slice(1);

const by = {};
const blank = [];
for (const line of lines) {
  const [id, s1, s2] = line.split(',');
  if (!key[id]) { console.error(`key に無い id: ${id}`); process.exit(2); }
  for (const [who, s] of [['scorer1', s1], ['scorer2', s2]]) {
    const n = Number(s);
    if (!s || !Number.isInteger(n) || n < 1 || n > 5) { blank.push(`${id}.${who}`); continue; }
    ((by[key[id].source] ??= { scorer1: [], scorer2: [] })[who]).push(n);
  }
}
if (blank.length) { console.error(`未記入・範囲外 ${blank.length} 件（1〜5 の整数）: ${blank.slice(0, 20).join(' ')}${blank.length > 20 ? ' …' : ''}`); process.exit(1); }

const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const tpl = avg([...by.template.scorer1, ...by.template.scorer2]);
const rows = Object.entries(by).map(([source, s]) => {
  const all = [...s.scorer1, ...s.scorer2];
  const mean = avg(all);
  return { source, n: all.length, scorer1: +avg(s.scorer1).toFixed(2), scorer2: +avg(s.scorer2).toFixed(2), mean: +mean.toFixed(2),
    pass: source === 'template' ? '-' : mean >= 3.5 && mean > tpl ? '合格' : '不合格' };
});
console.table(rows);
writeFileSync(join(dir, 'result.json'), JSON.stringify({ templateMean: +tpl.toFixed(2), rows }, null, 2));
console.log('基準（設計 §5.5。緩めない）: 平均 ≥ 3.5 かつ現行テンプレートの平均より高い。合格した中で最も安いモデルを推す（確定はユーザー）');
