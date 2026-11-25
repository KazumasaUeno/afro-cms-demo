#!/usr/bin/env node
// 盲検の集計（設計 §3.2: 平均 ≥ 3.5 かつ現行テンプレートの平均より高い。3 案の違いは採点者 2 名とも y）。API を呼ばない。
//   node prototypes/ai-design-eval/score-blind.mjs out/<実行日時>
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ASPECTS = ['brand', 'req', 'jp', 'cta', 'sp'];

/** CSV（BOM 可・コメントに , を含まない前提）→ Map(id → { scores:[5], distinct }) */
export function readScores(text) {
  const lines = text.replace(/^﻿/, '').trim().split(/\r?\n/);
  const head = lines[0].split(',').map((s) => s.trim());
  return new Map(lines.slice(1).map((l) => {
    const cells = l.split(',');
    const get = (k) => (cells[head.indexOf(k)] ?? '').trim();
    return [get('id'), { scores: ASPECTS.map(get), distinct: get('distinct').toLowerCase() }];
  }));
}

/** key と 2 名の点 → { ok, blank, rows, templateMean } */
export function scoreBlind(key, s1, s2) {
  const blank = [];
  const by = {};
  for (const id of new Set([...s1.keys(), ...s2.keys()])) {
    if (!key[id]) throw new Error(`key に無い id: ${id}`);
    const src = key[id].source;
    const b = (by[src] ??= { scorer1: [], scorer2: [], distinctBoth: 0, items: 0 });
    b.items++;
    let bothY = true;
    for (const [who, m] of [['scorer1', s1], ['scorer2', s2]]) {
      const r = m.get(id);
      const nums = (r?.scores ?? []).map(Number);
      if (!r || nums.length !== ASPECTS.length || nums.some((n) => !Number.isInteger(n) || n < 1 || n > 5)) { blank.push(`${id}.${who}`); continue; }
      if (!['y', 'n'].includes(r.distinct)) blank.push(`${id}.${who}.distinct`);
      if (r.distinct !== 'y') bothY = false;
      b[who].push(nums.reduce((a, n) => a + n, 0) / nums.length);
    }
    if (bothY) b.distinctBoth++;
  }
  if (blank.length) return { ok: false, blank };
  const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const tpl = by.template ? avg([...by.template.scorer1, ...by.template.scorer2]) : null;
  const rows = Object.entries(by).map(([source, s]) => {
    const mean = avg([...s.scorer1, ...s.scorer2]);
    return { source, items: s.items, scorer1: +avg(s.scorer1).toFixed(2), scorer2: +avg(s.scorer2).toFixed(2), mean: +mean.toFixed(2), distinctBoth: `${s.distinctBoth}/${s.items}`,
      pass: source === 'template' ? '-' : tpl === null ? '判定不可（テンプレートなし）' : mean >= 3.5 && mean > tpl && s.distinctBoth === s.items ? '合格' : '不合格' };
  });
  return { ok: true, templateMean: tpl === null ? null : +tpl.toFixed(2), rows };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const here = dirname(fileURLToPath(import.meta.url));
  const arg = process.argv[2];
  if (!arg) { console.error('out/<実行日時> を指定'); process.exit(2); }
  const dir = join(existsSync(arg) ? arg : join(here, 'out', arg), 'blind');
  const key = JSON.parse(readFileSync(join(dir, 'key.json'), 'utf8'));
  const read = (who) => readScores(readFileSync(join(dir, `scores-${who}.csv`), 'utf8'));
  const r = scoreBlind(key, read('scorer1'), read('scorer2'));
  if (!r.ok) { console.error(`未記入・範囲外 ${r.blank.length} 件（5 観点は 1〜5 の整数、distinct は y / n）: ${r.blank.slice(0, 20).join(' ')}${r.blank.length > 20 ? ' …' : ''}`); process.exit(1); }
  console.table(r.rows);
  writeFileSync(join(dir, 'result.json'), JSON.stringify(r, null, 2));
  console.log('基準（§3.2。緩めない）: 5 観点の平均 ≥ 3.5 かつ現行テンプレートの平均より高い かつ 全件で 2 名とも「3 案が見分けられる」。合格した中から費用・時間で推す（確定はユーザー）');
}
