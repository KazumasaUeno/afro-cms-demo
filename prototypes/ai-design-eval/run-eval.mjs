#!/usr/bin/env node
// デザイン AI（3 案 × 2 画面を HTML で出す）の評価。prototypes/ 配下。本番 DB・認証・API に接続しない。作り物の案件 6 件だけ。
//   node prototypes/ai-design-eval/run-eval.mjs [--models a,b] [--runs 1] [--cap 15]   … dry-run（既定）: 送信本文と推定費用を出すだけ（通信 0・費用 0）
//   node prototypes/ai-design-eval/run-eval.mjs --go [--models a,b] [--cap 15]          … 実 API（ユーザーが評価専用キーで実行）
// 他: --cases d01-wagashi,d02-seikotsu ／ --effort medium ／ --max-tokens 64000 ／ --concurrency 3 ／ --out <dir> ／ --provider anthropic|openai|gemini
// キー: ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY（形だけ見る。値は表示しない・書かない）
// 止まる条件: ①次の 1 回を最悪の額で見積もると累計が --cap（既定 $15）を超える ②モデルごとに最初の 3 回がすべて失敗
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CASES } from './cases.mjs';
import { buildRequest, DEFAULTS, PROMPT_VERSION } from './prompt.mjs';
import { clientFor, costMicroUsd, KEY_ENV, keyShapeProblem, PRICED_MODELS, providerOf, scrubSecrets } from './clients.mjs';
import { evaluateCall, writeOutputs } from './evaluate.mjs';
import { MACHINE_CRITERIA, summarize } from './checks.mjs';
import { writeGallery } from './gallery.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, d) => (args.includes(name) ? args[args.indexOf(name) + 1] : d);
const list = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);
const MODELS = list(opt('--models', 'claude-sonnet-5-5,claude-opus-5-5'));
const RUNS = Number(opt('--runs', '1'));
const CAP = Number(opt('--cap', '15'));
const EFFORT = opt('--effort', DEFAULTS.effort);
const MAX_TOKENS = Number(opt('--max-tokens', String(DEFAULTS.maxTokens)));
const CONCURRENCY = Math.max(1, Number(opt('--concurrency', '3')));
const forced = opt('--provider');
const fail = (msg) => { console.error(msg); process.exit(2); };
// --cases-file <out/配下の .mjs>: 実在のお客様の入力（CASES を export）。Git に入らない out/ 配下だけ読む。
// 送ってよいのはユーザーが了承した送信先だけなので、Anthropic 以外のモデルとは組み合わせない（2026-11-27 アイグラン: Anthropic のみ了承）
const casesFile = opt('--cases-file');
let baseCases = CASES;
if (casesFile) {
  const abs = resolve(casesFile);
  const outDir = resolve(here, 'out') + (process.platform === 'win32' ? '\\' : '/');
  if (!abs.toLowerCase().startsWith(outDir.toLowerCase())) fail('--cases-file は prototypes/ai-design-eval/out/ 配下（Git に入らない場所）のファイルだけ指定できる');
  baseCases = (await import(new URL(`file:///${abs.replace(/\\/g, '/')}`).href)).CASES ?? [];
  const nonAnthropic = list(opt('--models', 'claude-sonnet-5-5,claude-opus-5-5')).filter((m) => providerOf(m, opt('--provider')) !== 'anthropic');
  if (nonAnthropic.length) fail(`--cases-file（実在のお客様の入力）は Anthropic のモデルだけで回す。外す: ${nonAnthropic.join(', ')}`);
}
const cases = opt('--cases') ? baseCases.filter((c) => list(opt('--cases')).includes(c.id)) : baseCases;
const go = args.includes('--go');

if (go && args.includes('--dry-run')) fail('--dry-run と --go は同時に指定できない');
if (!cases.length) fail('--cases に一致する案件が無い');
if (!(CAP > 0) || !(RUNS >= 1) || !(MAX_TOKENS >= 1000)) fail('--cap / --runs / --max-tokens の値が不正');
let plan;
try {
  plan = MODELS.map((model) => {
    const provider = providerOf(model, forced);
    if (!PRICED_MODELS.includes(model)) throw new Error(`単価が無いモデル: ${model}（pricing-design.json に足す）`);
    return { model, provider };
  });
} catch (e) { fail(e.message); }

/** 見積もり: 典型 = 入力 6k / 出力 40k（HTML 6 画面 × 約 15,000 文字＋思考）[見込み]。最悪 = 入力 8k / 出力 max_tokens 全部 */
const typicalMicro = (m) => costMicroUsd(m, { input: 6_000, output: 40_000 });
const worstMicro = (m) => costMicroUsd(m, { input: 8_000, output: MAX_TOKENS });

const keys = {};
if (go) {
  // キーの形を先に全部見る（1 社目を回してから 2 社目のキーで止まらない）
  for (const provider of new Set(plan.map((p) => p.provider))) {
    const k = process.env[KEY_ENV[provider]];
    const problem = keyShapeProblem(provider, k);
    if (problem) fail(problem);
    keys[provider] = k;
  }
}

const out = resolve(opt('--out', join(here, 'out', new Date().toISOString().replace(/[:.]/g, '-'))));
mkdirSync(out, { recursive: true });
const meta = { promptVersion: PROMPT_VERSION, models: MODELS, cases: cases.map((c) => c.id), runs: RUNS, effort: EFFORT, maxTokens: MAX_TOKENS, capUsd: CAP, go, startedAt: new Date().toISOString() };
writeFileSync(join(out, 'meta.json'), JSON.stringify(meta, null, 2));

if (!go) {
  // dry-run: 送信本文を作って書くだけ。SDK を読み込まない・fetch を呼ばない
  mkdirSync(join(out, 'requests'), { recursive: true });
  const lines = plan.map(({ model, provider }) => {
    for (const c of cases) writeFileSync(join(out, 'requests', `${model}__${c.id}.json`), JSON.stringify(buildRequest(c, { model, effort: EFFORT, maxTokens: MAX_TOKENS }), null, 2));
    const n = cases.length * RUNS;
    return { model, provider, keyEnv: KEY_ENV[provider], calls: n, typicalUsd: +(typicalMicro(model) * n / 1e6).toFixed(2), worstUsd: +(worstMicro(model) * n / 1e6).toFixed(2) };
  });
  console.table(lines);
  const sum = (k) => lines.reduce((s, l) => s + l[k], 0);
  console.log(`dry-run（${PROMPT_VERSION}）: 予定 ${sum('calls')} 回（${plan.length} モデル × ${cases.length} 件 × ${RUNS} 回。1 回 = 3 案 × 2 画面）`);
  console.log(`推定 $${sum('typicalUsd').toFixed(2)}（1 回 入力 6k / 出力 40k）／最悪 $${sum('worstUsd').toFixed(2)}（1 回 入力 8k / 出力 ${MAX_TOKENS}）／上限 --cap $${CAP}（最悪の額で次の 1 回が上限を超えるなら呼ばずに止まる）`);
  if (sum('worstUsd') > CAP) console.log(`注意: 最悪の額が上限を超えるので、最後のほうの呼び出しは行われない可能性がある（--cap を上げるか --models / --cases を絞る）`);
  console.log(`送信本文（キーは含まない）を ${join(out, 'requests')} に書いた。通信はしていない。実行は --go（キー: ${[...new Set(lines.map((l) => l.keyEnv))].join(' / ')}）`);
  process.exit(0);
}

const rows = [];
let spent = 0;
let reserved = 0;
let stopReason = null;
const clients = Object.fromEntries([...new Set(plan.map((p) => p.provider))].map((p) => [p, clientFor(p, keys[p])]));
const jobs = [];
for (const { model, provider } of plan) for (let run = 1; run <= RUNS; run++) for (const c of cases) jobs.push({ model, provider, c, run });

const save = () => {
  writeFileSync(join(out, 'rows.json'), JSON.stringify(rows, null, 2));
  const summary = plan.map(({ model }) => summarize(model, rows));
  writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 2));
  return summary;
};

async function worker() {
  while (jobs.length && !stopReason) {
    const { model, provider, c, run } = jobs[0];
    const worst = worstMicro(model);
    if ((spent + reserved + worst) / 1e6 > CAP) { stopReason = `推定の累計 $${((spent + reserved) / 1e6).toFixed(2)}＋次の 1 回の最悪 $${(worst / 1e6).toFixed(2)} が上限 $${CAP} を超えるので止める`; break; }
    jobs.shift();
    reserved += worst;
    // 各 Provider の client は lastError を 1 つしか持たないので、同時実行のときは呼び出しごとに client を作る
    const client = CONCURRENCY > 1 ? clientFor(provider, keys[provider]) : clients[provider];
    const { row, proposals } = await evaluateCall({ c, model, client, run, effort: EFFORT, maxTokens: MAX_TOKENS });
    reserved -= worst;
    spent += row.costMicroUsd ?? 0;
    if (row.detail) row.detail = scrubSecrets(row.detail, Object.values(keys));
    rows.push(row);
    writeOutputs(out, row, proposals);
    const pc = row.pageChecks ?? [];
    console.log(`${model} ${c.id} #${run} ${row.code}${row.httpStatus ? '/' + row.httpStatus : ''} ${(row.ms / 1000).toFixed(0)}s $${((row.costMicroUsd ?? 0) / 1e6).toFixed(3)} 累計 $${(spent / 1e6).toFixed(2)}${pc.length ? ` 禁止=${pc.reduce((a, p) => a + p.forbidden, 0)} ブランド色なし=${pc.filter((p) => !p.brandPresent).length} コントラスト不足=${pc.filter((p) => p.contrastOk === false).length}` : ''}`);
    // モデルごとに最初の 3 回がすべて失敗 = キー・課金・ネットワーク・モデル名の誤り。費用がほぼ 0 のうちに止める
    const head = rows.filter((x) => x.model === model).slice(0, 3);
    if (head.length === 3 && head.every((x) => x.code !== 'ok') && rows.filter((x) => x.model === model).length === 3) {
      stopReason = `${model}: 最初の 3 回がすべて失敗（${head.map((x) => x.code + (x.httpStatus ? '/' + x.httpStatus : '/HTTPなし')).join(',')}${head[0].detail ? `／${head[0].detail}` : ''}）。キー・課金・ネットワーク・モデル名を確認。中止`;
    }
    save();
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
const summary = save();
writeGallery(out, baseCases);
console.table(summary.map(({ model, n, schemaOk, pages, parseFail, forbidden, brandMissing, ctaMissing, japaneseFail, mojibake, contrastFail, contrastUnknown, sizeFail, notDistinct, p90ms, costUsd, machinePass }) =>
  ({ model, n, schemaOk, pages, parseFail, forbidden, brandMissing, ctaMissing, japaneseFail, mojibake, contrastFail, contrastUnknown, sizeFail, notDistinct, p90s: p90ms === null ? null : +(p90ms / 1000).toFixed(0), costUsd, machinePass })));
console.log(`合格基準（機械。評価前に固定・緩めない）: ${MACHINE_CRITERIA.text}`);
console.log(`結果: ${out}（summary.json・rows.json・html/・index.html で一覧）`);
if (stopReason) { console.error(stopReason); process.exit(1); }
