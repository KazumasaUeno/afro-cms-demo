// 単価は pricing.json（コードに焼かない）。費用は推定で、正は Anthropic の請求（設計 §6）
import pricing from './pricing.json';

type Rates = { input: number; cacheWrite5m: number; cacheRead: number; output: number };
type ModelRates = Rates & { longContext?: Rates & { overPromptTokens: number } };
const MODELS = pricing.models as Record<string, ModelRates>;

export const PRICED_MODELS = Object.keys(MODELS);
export const PRICING_VERIFIED_AT = pricing.verifiedAt;

export interface TokenUsage { input: number; cacheWrite: number; cacheRead: number; output: number }

/** 推定費用（マイクロドル。整数）。未知のモデルは throw（設定の誤り） */
export function costMicroUsd(model: string, u: TokenUsage): number {
  const m = MODELS[model];
  if (!m) throw new Error(`pricing.json に無いモデル: ${model}`);
  const prompt = u.input + u.cacheWrite + u.cacheRead;
  const r: Rates = m.longContext && prompt > m.longContext.overPromptTokens ? m.longContext : m;
  return Math.round(u.input * r.input + u.cacheWrite * r.cacheWrite5m + u.cacheRead * r.cacheRead + u.output * r.output);
}
