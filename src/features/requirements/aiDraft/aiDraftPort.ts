/**
 * AI 下書きの通信口（DEC lead F2）。実装は src/live/aiDraftPort.ts（Firebase）で、src/live/main.tsx が登録する。
 * - このファイルは Firebase を import しない（demo のビルドに SDK を入れない。repositories/index.ts の registerLiveRepositories と同じ形）
 * - 登録されていなければ AI 下書きの画面は出さない（demo・フラグ off）
 * - 日時は ISO 文字列で返す（Timestamp → ISO の変換は実装側。aiDraftState.ts は ISO を前提にする）
 */
import type { AiDraftDoc, AiEditable } from '@/types/aiDraft';
import { parseAiFlagMode, type AiFlagMode } from './aiDraftState';

export interface AiDraftRequestInput {
  projectId: string;
  requestId: string;
  regenerate: boolean;
  discardEdits: boolean;
  confirmDiscard: boolean;
}

/** functions/src/ai/request.ts の RequestOutput と同じ形 */
export type AiDraftRequestOutput =
  | { state: 'running'; requestId: string }
  | { state: 'ready'; reused: true }
  | { state: 'ready' | 'failed'; requestId: string };

export interface AiDraftPort {
  /** projects/{pid}/aiDrafts/requirements の購読（無ければ null）。戻り値で解除する */
  subscribe(projectId: string, next: (doc: AiDraftDoc | null) => void, fail: (e: Error) => void): () => void;
  /** requestRequirementsDraft */
  request(input: AiDraftRequestInput): Promise<AiDraftRequestOutput>;
  /** saveAiDraftEdits（{ok:true} 以外は例外） */
  saveEdits(projectId: string, edited: AiEditable): Promise<void>;
}

let port: AiDraftPort | null = null;

export function registerAiDraftPort(p: AiDraftPort): void {
  port = p;
}

export function getAiDraftPort(): AiDraftPort | null {
  return port;
}

/** 画面の表示フラグ（VITE_FEATURE_AI_REQUIREMENTS。既定 off。サーバー側の判定が正で、これは表示だけ） */
export const AI_FLAG_MODE: AiFlagMode = parseAiFlagMode(import.meta.env.VITE_FEATURE_AI_REQUIREMENTS);
