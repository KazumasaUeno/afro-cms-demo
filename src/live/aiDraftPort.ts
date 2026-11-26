import { doc, onSnapshot } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable, type Functions } from 'firebase/functions';
import type { AiDraftPort, AiDraftRequestInput, AiDraftRequestOutput } from '@/features/requirements/aiDraft/aiDraftPort';
import type { AiDraftDoc, AnyAiEditable } from '@/types/aiDraft';
import { app, db, EMULATOR } from './firebase';
import { FUNCTIONS_REGION } from './functionsRegion';
import { deepIso } from './model';

/**
 * AI 下書きの通信口の実装（DEC lead F2。src/live/main.tsx が registerAiDraftPort で登録する）。
 * - 購読: projects/{pid}/aiDrafts/requirements（Rules: 読めるのは管理者とアサインされた開発者）
 * - 書き込みはすべて callable（aiDrafts はクライアントから書けない）。接続先は invite.ts と同じ（エミュレータは 127.0.0.1:5001）
 * - Timestamp は ISO 文字列にして返す（aiDraftState.ts は ISO を前提にする）
 */

/** callable の待ち時間（関数の timeoutSeconds 30 秒より長く。invite.ts と同じ理由） */
const CALL_TIMEOUT_MS = 60_000;

let functions: Functions | null = null;
function fns(): Functions {
  if (!functions) {
    functions = getFunctions(app, FUNCTIONS_REGION);
    if (EMULATOR) connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  }
  return functions;
}

export const liveAiDraftPort: AiDraftPort = {
  subscribe(projectId, next, fail) {
    return onSnapshot(
      doc(db, 'projects', projectId, 'aiDrafts', 'requirements'),
      (s) => next(s.exists() ? (deepIso(s.data({ serverTimestamps: 'estimate' })) as AiDraftDoc) : null),
      fail,
    );
  },
  async request(input: AiDraftRequestInput): Promise<AiDraftRequestOutput> {
    const call = httpsCallable<AiDraftRequestInput, AiDraftRequestOutput>(fns(), 'requestRequirementsDraft', { timeout: CALL_TIMEOUT_MS });
    const { data } = await call(input);
    return data;
  },
  async saveEdits(projectId: string, edited: AnyAiEditable): Promise<void> {
    const call = httpsCallable<{ projectId: string; edited: AnyAiEditable }, { ok: true }>(fns(), 'saveAiDraftEdits', { timeout: CALL_TIMEOUT_MS });
    const { data } = await call({ projectId, edited });
    if (!data || data.ok !== true) throw new Error('saveAiDraftEdits: unexpected result');
  },
};
