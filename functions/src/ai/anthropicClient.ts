/**
 * Anthropic の呼び出し（設計 §2.2・§5.1）。streaming・maxRetries 0・timeout 400s・ツールなし・fallbacks なし（L-3）。
 * キーは引数で受け取る（環境変数 ANTHROPIC_API_KEY / AUTH_TOKEN / BASE_URL を読ませない）。SDK のログ・OpenTelemetry は切る（本文を出さない。security M4）
 */
import Anthropic from '@anthropic-ai/sdk';

export interface DraftCallResult { message: Anthropic.Message; requestId: string | null }
/** generateDraft が注入で受け取るクライアント（テストは Stub を渡す） */
export interface DraftClient { create(params: Anthropic.MessageStreamParams): Promise<DraftCallResult> }

export const ANTHROPIC_TIMEOUT_MS = 400_000;

export function createAnthropicDraftClient(opts: { apiKey: string; baseURL?: string }): DraftClient {
  if (!opts.apiKey) throw new Error('apiKey is required');
  const client = new Anthropic({
    apiKey: opts.apiKey,
    baseURL: opts.baseURL ?? 'https://api.anthropic.com',
    maxRetries: 0,
    timeout: ANTHROPIC_TIMEOUT_MS,
    logLevel: 'off',
    openTelemetry: false,
  });
  return {
    async create(params) {
      const stream = client.messages.stream(params);
      const message = await stream.finalMessage();
      return { message, requestId: stream.request_id ?? null };
    },
  };
}

export type CallErrorCode = 'rate_limited' | 'upstream' | 'timeout';
export interface ClassifiedError { code: CallErrorCode; httpStatus?: number; anthropicRequestId?: string }

/** SDK の例外 → 種別（本文・メッセージは返さない） */
export function classifyError(e: unknown): ClassifiedError {
  if (e instanceof Anthropic.APIConnectionTimeoutError) return { code: 'timeout' };
  if (e instanceof Anthropic.APIError) {
    const out: ClassifiedError = { code: e.status === 429 ? 'rate_limited' : e.status === 408 || e.status === 504 ? 'timeout' : 'upstream' };
    if (typeof e.status === 'number') out.httpStatus = e.status;
    if (e.requestID) out.anthropicRequestId = e.requestID;
    return out;
  }
  return { code: 'upstream' };
}
