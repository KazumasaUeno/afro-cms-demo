/**
 * U3（ai-engineer）の generateDraft を worker から呼ぶための契約（実装計画 §4 U3「U2 との契約」）。
 * U2 は Anthropic を直接 import しない。本物の実装（anthropicClient + generateDraft）は U3 が用意し、
 * `createGenerator` の既定（下の notWiredGenerator）を差し替える（統合のときに 1 箇所だけ変える）。
 *
 * 契約: generateDraft({answers, siteFacts, siteText, competitorHosts, config}, {client, now})
 *   → {ok:true, proposal, flags, usage} | {ok:false, code, httpStatus?, anthropicRequestId?}。本文・メッセージ全文は返さない
 */
import type { AiEditable } from './shared/aiDraft';

export interface AiConfig {
  model: string;
  promptVersion: string;
  effort: string;
}

export interface GenerateDraftInput {
  /** 送る回答（除去済み。q-url はホスト名だけ。shared/answersHash.ts の buildSentAnswers） */
  answers: Record<string, string | string[]>;
  /** 基本チェックの事実（キーは AI_SITE_CHECK_KEYS） */
  siteFacts: Record<string, string | number | boolean | null>;
  /** 抽出した本文（除去済み・最大 12,000 文字）。取得できなければ空 */
  siteText: string;
  competitorHosts: string[];
  config: AiConfig;
}

export type GenerateFailCode = 'schema' | 'refusal' | 'max_tokens' | 'rate_limited' | 'upstream' | 'timeout';

export interface GenerateUsage {
  input: number;
  output: number;
  cacheRead: number;
  costMicroUsd: number;
}

export type GenerateDraftResult =
  | { ok: true; proposal: AiEditable; flags?: { unsupportedNumbers?: string[] }; usage: GenerateUsage; anthropicRequestId?: string }
  | { ok: false; code: GenerateFailCode; httpStatus?: number; anthropicRequestId?: string };

export type GenerateDraftFn = (input: GenerateDraftInput) => Promise<GenerateDraftResult>;

/** worker が Secret の値から作る生成器（キーは worker の中だけで渡す。ログ・文書へ出さない） */
export interface Generator {
  config: AiConfig;
  generateDraft: GenerateDraftFn;
}

/** U3 が入るまでの既定: 呼ぶと必ず失敗する（無音で成功しない）。worker は lastError 'ai-not-wired' を書き warn を出す */
export const NOT_WIRED_CONFIG: AiConfig = { model: 'not-wired', promptVersion: 'PRM-REQ-001@0.0.0', effort: 'low' };

export function notWiredGenerator(): Generator {
  return {
    config: NOT_WIRED_CONFIG,
    generateDraft: async () => {
      throw new NotWiredError();
    },
  };
}

export class NotWiredError extends Error {
  constructor() {
    super('generateDraft is not wired');
    this.name = 'NotWiredError';
  }
}

/** 本番の生成器を作る（U3 の統合でここを差し替える）。apiKey は使う直前に Secret から読む */
export function createGenerator(_apiKey: string): Generator {
  return notWiredGenerator();
}
