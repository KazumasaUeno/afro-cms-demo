/**
 * AI 下書きの関数の配線（実装計画 §4 U2）。functions/src/index.ts は makeAiFunctions を呼んで export するだけ。
 * - callable 2 本（requestRequirementsDraft・saveAiDraftEdits）は全体既定（256MiB/30s・SA afro-cms-functions@）。**Secret を結ばない**
 * - worker（generateRequirementsDraftTask）だけ SA afro-cms-ai-worker@（L-a）・secrets [ANTHROPIC_API_KEY]・540s・512MiB・再試行なし
 */
import { getFirestore } from 'firebase-admin/firestore';
import { getFunctions } from 'firebase-admin/functions';
import { onCall } from 'firebase-functions/https';
import { defineSecret } from 'firebase-functions/params';
import { onTaskDispatched } from 'firebase-functions/tasks';
import { handleSaveEdits } from './edits';
import { readFlags } from './flags';
import { createGenerator, CURRENT_CONFIG_KEY } from './generatePort';
import { AI_WORKER } from './limits';
import { functionsLogger } from './log';
import { handleRequestDraft } from './request';
import { configHash, sha256Hex } from './shared/answersHash';
import { runSiteCheck } from './site/checks';
import { systemResolver } from './site/lookup';
import { handleTask } from './task';

export const AI_WORKER_SERVICE_ACCOUNT = 'afro-cms-ai-worker@';
export const AI_TASK_FUNCTION = 'generateRequirementsDraftTask';
const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');

export function makeAiFunctions(opts: { region: string; enforceAppCheck: boolean; cors: boolean | string[] }) {
  const callableOpts = { enforceAppCheck: opts.enforceAppCheck, cors: opts.cors };
  const requestRequirementsDraft = onCall(callableOpts, (req) =>
    handleRequestDraft(req, {
      db: getFirestore(),
      now: Date.now,
      flags: readFlags,
      // 今の設定のハッシュだけ（callable は AI のクライアントを作らない・Secret を持たない）
      configHash: () => configHash(CURRENT_CONFIG_KEY),
      enqueue: async ({ projectId, requestId }) =>
        getFunctions().taskQueue(`locations/${opts.region}/functions/${AI_TASK_FUNCTION}`).enqueue(
          { projectId, requestId },
          // 押下ごとの requestId を鍵にする（同じ押下の二重投入だけを止める。世代＝requestId）
          { id: await sha256Hex(`${projectId}:${requestId}`), dispatchDeadlineSeconds: AI_WORKER.dispatchDeadlineSeconds },
        ),
      log: functionsLogger,
    }));
  const saveAiDraftEdits = onCall(callableOpts, (req) =>
    handleSaveEdits(req, { db: getFirestore(), now: Date.now, flags: readFlags, log: functionsLogger }));
  const generateRequirementsDraftTask = onTaskDispatched({
    region: opts.region,
    serviceAccount: AI_WORKER_SERVICE_ACCOUNT,
    secrets: [ANTHROPIC_API_KEY],
    timeoutSeconds: AI_WORKER.timeoutSeconds,
    memory: AI_WORKER.memory,
    cpu: 1,
    concurrency: 1,
    maxInstances: AI_WORKER.maxInstances,
    retryConfig: { maxAttempts: 1 },
    rateLimits: { maxConcurrentDispatches: AI_WORKER.maxConcurrentDispatches },
  }, async (req) => {
    await handleTask(req.data, {
      db: getFirestore(),
      now: Date.now,
      flags: readFlags,
      apiKey: () => ANTHROPIC_API_KEY.value() ?? '',
      // 本物のクライアントはここ（worker）でだけ Secret の値から作る
      createGenerator: (key) => createGenerator(key),
      siteCheck: (url) => runSiteCheck(url, { resolve: systemResolver, nowIso: () => new Date().toISOString() }),
      log: functionsLogger,
    });
  });
  return { requestRequirementsDraft, saveAiDraftEdits, generateRequirementsDraftTask };
}
