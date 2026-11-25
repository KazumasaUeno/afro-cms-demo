/**
 * 下書きの生成（実装計画 §4 U3「U2 との契約」）。U2 の worker が注入で呼ぶ。Anthropic へ 1 回だけ（再要求・自動再試行なし）。
 * 返すのは種別・HTTP 状態・request-id・使用量だけ（本文・メッセージ全文は返さない。ログも出さない）
 */
import type Anthropic from '@anthropic-ai/sdk';
import type { AnswerValue } from './shared/types';
import type { ProposalV2, ProposalV3, SiteCheck } from './shared/aiDraft';
import { AI_SITE_CHECK_KEYS } from './shared/aiDraft';
import { buildSentAnswers, hostnameOf, redactText } from './shared/redact';
import { buildUserMessage, PROMPT_VERSION, SYSTEM_PROMPT } from './prompts/PRM-REQ-001';
import * as V3 from './prompts/PRM-REQ-001-2.0.0';
import { OUTPUT_SCHEMA, cut, validateOutput } from './schema';
import { postprocess } from './postprocess';
import { OUTPUT_SCHEMA_V3, validateOutputV3 } from './reqDocSchema';
import { postprocessV3, type ReqDocServerFacts } from './reqDocPostprocess';
import { CURRENT_TEMPLATE_VERSION } from './reqDocCatalogView';
import { AI_MAX_TOKENS } from './limits';
import { costMicroUsd, PRICED_MODELS } from './pricing';
import { classifyError, type DraftClient } from './anthropicClient';

export type AiEffort = 'low' | 'medium' | 'high';
/**
 * proposalVersion: 作る提案の版（無ければ 2＝PRM-REQ-001@1.0.0。3＝PRM-REQ-001@2.0.0・会社標準ひな型。REQUIREMENTS_DOC_TEMPLATE.md §4）。
 * どちらを使うかは flags.ts の AI_REQUIREMENTS_PROPOSAL_VERSION（既定 2）→ aiConfigFor
 */
export interface AiConfig { model: string; effort: AiEffort; maxTokens: number; proposalVersion?: 2 | 3 }

/** [PENDING U-3] モデルは評価の後にユーザーが確定する。それまでの既定は設計 §5.1 の既定候補 */
export const DEFAULT_AI_CONFIG: AiConfig = { model: 'claude-sonnet-5-5', effort: 'low', maxTokens: 12_000 };

/** 版ごとの設定（モデル・effort は DEFAULT_AI_CONFIG のまま。v3 は max_tokens だけ AI_MAX_TOKENS.v3） */
export function aiConfigFor(version: 2 | 3): AiConfig {
  return version === 3 ? { ...DEFAULT_AI_CONFIG, maxTokens: AI_MAX_TOKENS.v3, proposalVersion: 3 } : DEFAULT_AI_CONFIG;
}
const isV3 = (c: AiConfig) => c.proposalVersion === 3;
export const SITE_TEXT_MAX = 12_000;

export interface GenerateDraftInput {
  answers: Record<string, AnswerValue>;
  /** U2 の基本チェックの結果（取得できなければ null） */
  siteFacts: SiteCheck | null;
  /** U2 の抽出テキスト（除去済みの想定。ここでも除去と 12,000 字の切り詰めをかける） */
  siteText: string;
  /** competitorHostsOf(answers) の値 */
  competitorHosts: string[];
  /**
   * v3 でサーバーが転記する材料（案件名・顧客名・DNS の選択式の回答・日程）。**AI へは送らない**（buildPayload は読まない）。v2 では使わない
   */
  serverFacts?: ReqDocServerFacts;
  config: AiConfig;
}
export interface GenerateDraftDeps { client: DraftClient; now: () => number }

export interface AiUsage { input: number; output: number; cacheRead: number; costMicroUsd: number }
/** config: 送る前の設定の誤り（未知のモデル）。Anthropic を呼んでいない（worker は返金する） */
export type GenerateDraftErrorCode = 'config' | 'schema' | 'refusal' | 'max_tokens' | 'rate_limited' | 'upstream' | 'timeout';
export type GenerateDraftResult =
  | { ok: true; proposal: ProposalV2 | ProposalV3; flags: { unsupportedNumbers: string[] }; usage: AiUsage; anthropicRequestId?: string; durationMs: number }
  | { ok: false; code: GenerateDraftErrorCode; httpStatus?: number; anthropicRequestId?: string; usage?: AiUsage; durationMs: number };

const asList = (v: AnswerValue | undefined) => (Array.isArray(v) ? v : v ? [v] : []).map((x) => redactText(String(x)).trim()).filter(Boolean);

/** AI へ送るデータ（送信 payload のスナップショットテストの対象） */
export function buildPayload(input: GenerateDraftInput) {
  const answers = buildSentAnswers(input.answers);
  const competitorHosts = input.competitorHosts.map(hostnameOf).filter(Boolean).slice(0, 5);
  const siteFacts = input.siteFacts
    ? { status: input.siteFacts.status, items: input.siteFacts.items.map((i) => ({ key: i.key, ok: i.ok, value: typeof i.value === 'string' ? redactText(i.value) : i.value })) }
    : null;
  const siteText = cut(redactText(input.siteText ?? ''), SITE_TEXT_MAX);
  return { answers, siteFacts, siteText, competitorHosts };
}

export function buildRequest(input: GenerateDraftInput): Anthropic.MessageStreamParams {
  if (!PRICED_MODELS.includes(input.config.model)) throw new Error(`unknown model: ${input.config.model}`);
  return {
    model: input.config.model,
    max_tokens: input.config.maxTokens,
    system: [{ type: 'text', text: isV3(input.config) ? V3.SYSTEM_PROMPT : SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    // ユーザーメッセージは v2・v3 で同じ（同じ buildUserMessage・同じ payload。送る範囲を増やさない）
    messages: [{ role: 'user', content: buildUserMessage(buildPayload(input)) }],
    thinking: { type: 'adaptive' },
    output_config: { effort: input.config.effort, format: { type: 'json_schema', schema: isV3(input.config) ? OUTPUT_SCHEMA_V3 : OUTPUT_SCHEMA } },
  };
}

function usageOf(model: string, m: Anthropic.Message): AiUsage {
  const u = m.usage;
  const t = { input: u.input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0, output: u.output_tokens ?? 0 };
  return { input: t.input + t.cacheWrite, output: t.output, cacheRead: t.cacheRead, costMicroUsd: costMicroUsd(model, t) };
}

export async function generateDraft(input: GenerateDraftInput, deps: GenerateDraftDeps): Promise<GenerateDraftResult> {
  const started = deps.now();
  let params: Anthropic.MessageStreamParams;
  try {
    params = buildRequest(input);
  } catch {
    return { ok: false, code: 'config', durationMs: deps.now() - started };
  }
  const payload = buildPayload(input);
  let res;
  try {
    res = await deps.client.create(params);
  } catch (e) {
    const c = classifyError(e);
    return { ok: false, ...c, durationMs: deps.now() - started };
  }
  const durationMs = deps.now() - started;
  const rid = res.requestId ? { anthropicRequestId: res.requestId } : {};
  const usage = usageOf(input.config.model, res.message);
  const fail = (code: GenerateDraftErrorCode): GenerateDraftResult => ({ ok: false, code, ...rid, usage, durationMs });
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
  const siteKeys = (payload.siteFacts?.items ?? []).map((i) => i.key).filter((k) => (AI_SITE_CHECK_KEYS as readonly string[]).includes(k));
  const allowedEvidence = new Set<string>([...Object.keys(payload.answers), ...(payload.competitorHosts.length ? ['q-competitor'] : []), ...siteKeys]);
  const inputText = JSON.stringify(payload);
  const server = {
    hostname: hostnameOf(String(input.answers['q-url'] ?? '')),
    issue: asList(input.answers['q-issue']).join('\n'),
    purposes: asList(input.answers['q-purpose']),
    improves: asList(input.answers['q-improve']),
    competitors: payload.competitorHosts,
    siteCheck: input.siteFacts,
  };
  if (isV3(input.config)) {
    const raw3 = validateOutputV3(parsed);
    if (!raw3) return fail('schema');
    // 本文を根拠にしてよいのは本文を送ったときだけ
    if (payload.siteText.trim()) allowedEvidence.add('site_text');
    const { editable, unsupportedNumbers } = postprocessV3(raw3, { allowedEvidence, inputText, facts: input.serverFacts ?? {} });
    const proposal: ProposalV3 = {
      version: 3,
      ...server,
      origin: { kind: 'ai', promptVersion: V3.PROMPT_VERSION, model: input.config.model },
      template: { id: 'TPL-WEB-REQ', version: CURRENT_TEMPLATE_VERSION },
      ...editable,
    };
    return { ok: true, proposal, flags: { unsupportedNumbers }, usage, ...rid, durationMs };
  }
  const raw = validateOutput(parsed);
  if (!raw) return fail('schema');
  const { editable, unsupportedNumbers } = postprocess(raw, { allowedEvidence, inputText });
  const proposal: ProposalV2 = {
    version: 2,
    ...server,
    origin: { kind: 'ai', promptVersion: PROMPT_VERSION, model: input.config.model },
    ...editable,
  };
  return { ok: true, proposal, flags: { unsupportedNumbers }, usage, ...rid, durationMs };
}
