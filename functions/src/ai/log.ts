/**
 * AI 下書きのログ（設計 §2.2「ログ」・計画 M4）。出すのは種別・状態・HTTP 状態・Anthropic の request-id・トークン数・所要時間・ID だけ。
 * **回答・サイト本文・プロンプト・キー・例外のメッセージを出さない**（テストは canary で確かめる。tests/functions/ai-logs.test.mjs）。
 * テストから捕捉できるよう注入にする。既定は firebase-functions の logger
 */
import { logger } from 'firebase-functions';

export interface AiLogger {
  info(msg: string, fields: Record<string, unknown>): void;
  warn(msg: string, fields: Record<string, unknown>): void;
  error(msg: string, fields: Record<string, unknown>): void;
}

export const functionsLogger: AiLogger = {
  info: (m, f) => logger.info(m, f),
  warn: (m, f) => logger.warn(m, f),
  error: (m, f) => logger.error(m, f),
};

/** 例外から種別だけを取る（message は使わない） */
export function errorCodeOf(e: unknown): string {
  const c = (e as { code?: unknown; name?: unknown } | null)?.code;
  if (typeof c === 'string' && /^[\w./-]{1,64}$/.test(c)) return c;
  if (typeof c === 'number') return String(c);
  const n = (e as { name?: unknown } | null)?.name;
  return typeof n === 'string' && /^\w{1,64}$/.test(n) ? n : 'unknown';
}
