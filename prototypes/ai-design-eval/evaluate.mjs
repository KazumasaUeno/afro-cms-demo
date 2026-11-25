// 1 回の呼び出し（1 案件 × 1 モデル × 1 回 = 3 案 × 2 画面）を行い、機械の検査をかけて 1 行にする。テストは Stub の client を渡す
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRequest, PROMPT_VERSION } from './prompt.mjs';
import { checkPage, distinctness, parseOutput } from './checks.mjs';
import { CTA_BY_CV, inputText } from './cases.mjs';
import { costMicroUsd, textOf, tokensOf } from './clients.mjs';

export const LETTERS = ['A', 'B', 'C'];
/** 出力の HTML のファイル名（source = モデル名 か template。template は端末ごとに別ファイル） */
export const htmlName = (source, caseId, run, idx, page, device) => `${source}__${caseId}__r${run}__${LETTERS[idx]}__${page}${device ? `__${device}` : ''}.html`;

export async function evaluateCall({ c, model, client, run = 1, effort, maxTokens, now = Date.now }) {
  const params = buildRequest(c, { model, effort, maxTokens });
  const started = now();
  const base = { model, provider: client.provider ?? 'anthropic', case: c.id, run, promptVersion: PROMPT_VERSION };
  let res;
  try {
    res = await client.create(params);
  } catch {
    const e = client.lastError ?? { code: 'upstream' };
    return { row: { ...base, code: e.code, httpStatus: e.httpStatus ?? null, requestId: e.requestId ?? null, detail: e.detail ?? null, ms: now() - started, costMicroUsd: 0 }, proposals: null };
  }
  const ms = now() - started;
  const tokens = tokensOf(res.message);
  const cost = costMicroUsd(model, tokens);
  const head = { ...base, requestId: res.requestId ?? null, ms, tokens, costMicroUsd: cost, stopReason: res.message?.stop_reason ?? null };
  const stop = res.message?.stop_reason;
  if (stop === 'refusal') return { row: { ...head, code: 'refusal' }, proposals: null };
  if (stop === 'max_tokens' || stop === 'model_context_window_exceeded') return { row: { ...head, code: 'max_tokens' }, proposals: null };
  const parsed = parseOutput(textOf(res.message));
  if (!parsed.ok) return { row: { ...head, code: 'schema', schemaReason: parsed.reason }, proposals: null };
  const ctx = { brandHex: c.project.accent, inputs: inputText(c), ctaWords: CTA_BY_CV[c.hearing['q-cv']]?.words ?? [] };
  const pageChecks = parsed.proposals.flatMap((p, i) => ['top', 'main'].map((page) => ({ proposal: LETTERS[i], ...checkPage(p.pages[page], { ...ctx, page }) })));
  const d = distinctness(parsed.proposals);
  return { row: { ...head, code: 'ok', pageChecks, distinct: d.distinct, distinctPairs: d.pairs, names: parsed.proposals.map((p) => p.name) }, proposals: parsed.proposals };
}

/** 出力を out/<run>/ に書く: raw/（JSON）と html/（1 画面 1 ファイル） */
export function writeOutputs(outDir, row, proposals) {
  if (!proposals) return;
  mkdirSync(join(outDir, 'raw'), { recursive: true });
  mkdirSync(join(outDir, 'html'), { recursive: true });
  writeFileSync(join(outDir, 'raw', `${row.model}__${row.case}__r${row.run}.json`), JSON.stringify({ promptVersion: row.promptVersion, proposals }, null, 2));
  proposals.forEach((p, i) => {
    for (const page of ['top', 'main']) writeFileSync(join(outDir, 'html', htmlName(row.model, row.case, row.run, i, page)), p.pages[page]);
  });
}

