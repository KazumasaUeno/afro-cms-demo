/**
 * worker（task.ts）から U3 の generateDraft を呼ぶための口（実装計画 §4 U3「U2 との契約」）。
 * - 本物のクライアント（anthropicClient）を作るのは createGenerator だけ。呼ぶのは worker だけ（Secret の値を受け取る）。
 *   callable（request.ts・edits.ts）はクライアントを作らない（使うのは CURRENT_CONFIG_KEY のハッシュだけ）
 * - generateDraft は種別・HTTP 状態・request-id・使用量・所要時間だけを返す（本文・メッセージ全文は返さない）
 */
import { createAnthropicDraftClient, type DraftClient } from './anthropicClient';
import { DEFAULT_AI_CONFIG, generateDraft, type AiConfig, type GenerateDraftInput, type GenerateDraftResult } from './generateDraft';
import { PROMPT_VERSION } from './prompts/PRM-REQ-001';
import type { AiConfigKey } from './shared/answersHash';

export type { AiConfig, AiConfigKey, GenerateDraftResult };

/** worker が渡す入力（config は生成器が持つ）。answers は送る形（buildSentAnswers 済み。generateDraft がもう一度除去する） */
export type GeneratorInput = Omit<GenerateDraftInput, 'config'>;

export interface Generator {
  /** configHash の元（モデル・promptVersion・effort） */
  config: AiConfigKey;
  generateDraft: (input: GeneratorInput) => Promise<GenerateDraftResult>;
}

export function configKeyOf(config: AiConfig, promptVersion: string = PROMPT_VERSION): AiConfigKey {
  return { model: config.model, promptVersion, effort: config.effort };
}

/** 今の AI 設定（[PENDING U-3] モデルは評価の後にユーザーが確定する。generateDraft.ts の DEFAULT_AI_CONFIG） */
export const CURRENT_CONFIG_KEY: AiConfigKey = configKeyOf(DEFAULT_AI_CONFIG);

/** クライアント（本物または Stub）から生成器を作る */
export function generatorFromClient(client: DraftClient, config: AiConfig = DEFAULT_AI_CONFIG, now: () => number = Date.now): Generator {
  return {
    config: configKeyOf(config),
    generateDraft: (input) => generateDraft({ ...input, config }, { client, now }),
  };
}

/**
 * 本番の生成器（worker だけが呼ぶ）。apiKey は Secret の値（ログ・文書へ出さない）。
 * makeClient はテストで Stub を差すための口（既定は Anthropic の本物）
 */
export function createGenerator(
  apiKey: string,
  opts: { makeClient?: (o: { apiKey: string }) => DraftClient; config?: AiConfig; now?: () => number } = {},
): Generator {
  const client = (opts.makeClient ?? createAnthropicDraftClient)({ apiKey });
  return generatorFromClient(client, opts.config ?? DEFAULT_AI_CONFIG, opts.now ?? Date.now);
}
