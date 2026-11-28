/**
 * サイトマップの AI 下書きの生成（LIVE_SITEMAP_AI.md §2〜§5・§9。generateDraft.ts と同じ流れ・同じ失敗の型）。worker（sitemapTask.ts）が注入で呼ぶ。
 * - Anthropic へ 1 回だけ（再要求・自動再試行なし。SDK maxRetries 0 は anthropicClient）。ツールなし・fallbacks なし・構造化出力（json_schema）
 * - プロンプトは PRM-SMAP-001（本文はレジストリにだけある）。max_tokens は AI_MAX_TOKENS.sitemap
 * - 出力は validateSitemapOutput（形）→ postprocessSitemap（12 段）を通したものだけ返す（AI の生テキストは返さない・保存しない）
 * - 返すのは種別・HTTP 状態・request-id・使用量・件数だけ（本文はログに出さない）
 */
import type Anthropic from '@anthropic-ai/sdk';
import { createAnthropicDraftClient, classifyError, type DraftClient } from './anthropicClient';
import { DEFAULT_AI_CONFIG, type AiConfig, type AiUsage, type GenerateDraftErrorCode } from './generateDraft';
import { AI_MAX_TOKENS } from './limits';
import { costMicroUsd, PRICED_MODELS } from './pricing';
import { buildUserMessage, PROMPT_VERSION, SYSTEM_PROMPT } from './prompts/PRM-SMAP-001';
import type { AiConfigKey } from './shared/answersHash';
import type { BeforeTree, SitemapPayload } from './sitemapPayload';
import { postprocessSitemap, type SitemapPostprocessed } from './sitemapPostprocess';
import { SITEMAP_OUTPUT_SCHEMA, validateSitemapOutput } from './sitemapSchema';

/** [PENDING 評価 L-5] モデル・effort は要件定義書の既定と同じ。max_tokens だけサイトマップ用（変更はユーザー確認） */
export const SITEMAP_AI_CONFIG: AiConfig = { model: DEFAULT_AI_CONFIG.model, effort: 'low', maxTokens: AI_MAX_TOKENS.sitemap };

export interface GenerateSitemapInput { payload: SitemapPayload; before: BeforeTree; config: AiConfig }
export interface GenerateSitemapDeps { client: DraftClient; now: () => number }

export type GenerateSitemapResult =
  | { ok: true; result: SitemapPostprocessed; usage: AiUsage; anthropicRequestId?: string; durationMs: number }
  | { ok: false; code: GenerateDraftErrorCode; httpStatus?: number; anthropicRequestId?: string; usage?: AiUsage; durationMs: number };

export function sitemapConfigKey(config: AiConfig = SITEMAP_AI_CONFIG): AiConfigKey {
  return { model: config.model, promptVersion: PROMPT_VERSION, effort: config.effort };
}

/** 送る要求（ツール・fallbacks を持たない。未知のモデルは throw＝設定の誤り） */
export function buildSitemapRequest(payload: SitemapPayload, config: AiConfig = SITEMAP_AI_CONFIG): Anthropic.MessageStreamParams {
  if (!PRICED_MODELS.includes(config.model)) throw new Error(`unknown model: ${config.model}`);
  return {
    model: config.model,
    max_tokens: Math.min(config.maxTokens, AI_MAX_TOKENS.sitemap),
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: buildUserMessage(payload) }],
    thinking: { type: 'adaptive' },
    output_config: { effort: config.effort, format: { type: 'json_schema', schema: SITEMAP_OUTPUT_SCHEMA } },
  };
}

function usageOf(model: string, m: Anthropic.Message): AiUsage {
  const u = m.usage;
  const t = { input: u.input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0, output: u.output_tokens ?? 0 };
  return { input: t.input + t.cacheWrite, output: t.output, cacheRead: t.cacheRead, costMicroUsd: costMicroUsd(model, t) };
}

export async function generateSitemap(input: GenerateSitemapInput, deps: GenerateSitemapDeps): Promise<GenerateSitemapResult> {
  const started = deps.now();
  let params: Anthropic.MessageStreamParams;
  try {
    params = buildSitemapRequest(input.payload, input.config);
  } catch {
    return { ok: false, code: 'config', durationMs: deps.now() - started };
  }
  let res;
  try {
    res = await deps.client.create(params);
  } catch (e) {
    return { ok: false, ...classifyError(e), durationMs: deps.now() - started };
  }
  const durationMs = deps.now() - started;
  const rid = res.requestId ? { anthropicRequestId: res.requestId } : {};
  const usage = usageOf(input.config.model, res.message);
  const fail = (code: GenerateDraftErrorCode): GenerateSitemapResult => ({ ok: false, code, ...rid, usage, durationMs });
  const stop = res.message.stop_reason;
  if (stop === 'refusal') return fail('refusal');
  if (stop === 'max_tokens' || stop === 'model_context_window_exceeded') return fail('max_tokens');
  if (stop !== 'end_turn') return fail('schema');
  const text = res.message.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail('schema');
  }
  const raw = validateSitemapOutput(parsed);
  if (!raw) return fail('schema');
  const result = postprocessSitemap(raw, { before: input.before, inputText: JSON.stringify(input.payload) });
  return { ok: true, result, usage, ...rid, durationMs };
}

/** worker が使う生成器（configHash の元と、生成の口） */
export interface SitemapGenerator {
  config: AiConfigKey;
  model: string;
  generateSitemap: (input: Omit<GenerateSitemapInput, 'config'>) => Promise<GenerateSitemapResult>;
}

export function sitemapGeneratorFromClient(client: DraftClient, config: AiConfig = SITEMAP_AI_CONFIG, now: () => number = Date.now): SitemapGenerator {
  return {
    config: sitemapConfigKey(config),
    model: config.model,
    generateSitemap: (input) => generateSitemap({ ...input, config }, { client, now }),
  };
}

/**
 * 本番の生成器（worker だけが呼ぶ。apiKey は Secret の値。ログ・文書へ出さない）。
 * makeClient はテストで Stub を差すための口（既定は Anthropic の本物）
 */
export function createSitemapGenerator(
  apiKey: string,
  opts: { makeClient?: (o: { apiKey: string }) => DraftClient; config?: AiConfig; now?: () => number } = {},
): SitemapGenerator {
  const client = (opts.makeClient ?? createAnthropicDraftClient)({ apiKey });
  return sitemapGeneratorFromClient(client, opts.config ?? SITEMAP_AI_CONFIG, opts.now ?? Date.now);
}
