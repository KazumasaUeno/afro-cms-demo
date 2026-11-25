// 呼び出しの道具（prototypes/ だけ。本番 DB・認証・API に接続しない）。
// - Anthropic: 本番と同じ @anthropic-ai/sdk（functions/node_modules。functions/src/ai/anthropicClient.ts と同じ設定: streaming・maxRetries 0・ログ off）。
//   SDK は --go のときだけ読み込む（dry-run とテストでは読み込まない＝通信の手段を持たない）
// - OpenAI / Gemini: ../ai-requirements-eval/providers.mjs の fetch アダプタをそのまま使う（同じ Anthropic 形の要求を各社の形へ写す）
// キーは引数で受け取り、表示しない・ファイルとログへ書かない
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFetchDraftClient, keyShapeProblem, KEY_ENV, providerOf, scrubSecrets } from '../ai-requirements-eval/providers.mjs';

export { keyShapeProblem, KEY_ENV, providerOf, scrubSecrets };

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(here, '..', '..');

/* ---------------- 単価 ---------------- */

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
/** 本番の単価（functions/src/ai/pricing.json）＋要件 AI 評価の他社単価＋このプロトタイプの単価。ディスクは変えない */
export function loadPricing() {
  const models = {};
  for (const p of [join(ROOT, 'functions', 'src', 'ai', 'pricing.json'), join(here, '..', 'ai-requirements-eval', 'pricing-providers.json'), join(here, 'pricing-design.json')]) {
    for (const [m, r] of Object.entries(readJson(p).models)) models[m] ??= r;
  }
  return models;
}
const PRICING = loadPricing();
export const PRICED_MODELS = Object.keys(PRICING);
/** usage（Anthropic 形の件数）→ micro-USD。長いプロンプトの割増はこの評価の入力（数千トークン）では起きない */
export function costMicroUsd(model, { input = 0, cacheWrite = 0, cacheRead = 0, output = 0 }) {
  const r = PRICING[model];
  if (!r) throw new Error(`単価が無いモデル: ${model}`);
  return Math.round(input * r.input + cacheWrite * (r.cacheWrite5m ?? r.input) + cacheRead * (r.cacheRead ?? r.input) + output * r.output);
}

/* ---------------- Anthropic ---------------- */

export const TIMEOUT_MS = 1_200_000; // 3 案 × 2 画面は出力が長い（要件 AI の約 10 倍）。20 分で打ち切る

/** functions/ の SDK を読み込む（無ければ「npm --prefix functions ci」を案内して止める） */
export function loadAnthropicSdk() {
  const req = createRequire(join(ROOT, 'functions', 'package.json'));
  try {
    const mod = req('@anthropic-ai/sdk');
    return mod.default ?? mod.Anthropic ?? mod;
  } catch {
    throw new Error('functions/node_modules に @anthropic-ai/sdk が無い。リポジトリのルートで npm --prefix functions ci を 1 回実行（依存は増やさない。functions/package.json の既存の依存）');
  }
}

/** Anthropic の DraftClient（create(params) → { message, requestId }）。失敗の種別は lastError に置く */
export function createAnthropicClient({ apiKey, Sdk = loadAnthropicSdk(), timeoutMs = TIMEOUT_MS }) {
  if (!apiKey) throw new Error('apiKey is required');
  const client = new Sdk({ apiKey, baseURL: 'https://api.anthropic.com', maxRetries: 0, timeout: timeoutMs, logLevel: 'off', openTelemetry: false });
  const wrap = {
    provider: 'anthropic',
    lastError: null,
    async create(params) {
      wrap.lastError = null;
      try {
        const stream = client.messages.stream(params);
        const message = await stream.finalMessage();
        return { message, requestId: stream.request_id ?? message?.id ?? null };
      } catch (e) {
        const status = typeof e?.status === 'number' ? e.status : undefined;
        const code = status === 429 ? 'rate_limited' : status === 408 || status === 504 || /timeout/i.test(e?.name ?? '') ? 'timeout' : 'upstream';
        const detail = [e?.error?.error?.type, e?.error?.error?.message].filter(Boolean).join(' ');
        wrap.lastError = { code, ...(status ? { httpStatus: status } : {}), ...(e?.requestID ? { requestId: e.requestID } : {}), detail: scrubSecrets(detail, [apiKey]).slice(0, 300) };
        throw new Error(code);
      }
    },
  };
  return wrap;
}

/** Provider ごとの DraftClient */
export function clientFor(provider, apiKey, opts = {}) {
  if (provider === 'anthropic') return createAnthropicClient({ apiKey, ...opts });
  return createFetchDraftClient(provider, { apiKey, timeoutMs: TIMEOUT_MS, ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}) });
}

/** 応答（Anthropic 形）の本文テキスト。thinking ブロックは除く */
export const textOf = (message) => (Array.isArray(message?.content) ? message.content.filter((b) => b?.type === 'text').map((b) => b.text ?? '').join('') : '');

/** usage → { input, cacheWrite, cacheRead, output } */
export const tokensOf = (message) => {
  const u = message?.usage ?? {};
  return { input: u.input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0, output: u.output_tokens ?? 0 };
};
