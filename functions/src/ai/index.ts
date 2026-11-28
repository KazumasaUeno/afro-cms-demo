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
import { readFlags, readProposalVersion, readSitemapFlags } from './flags';
import { aiConfigFor } from './generateDraft';
import { configKeyForVersion, createGenerator } from './generatePort';
import { AI_WORKER } from './limits';
import { functionsLogger } from './log';
import { handleRequestDraft } from './request';
import { configHash, sha256Hex } from './shared/answersHash';
import { runSiteCheck } from './site/checks';
import { systemResolver } from './site/lookup';
import { handleTask } from './task';
import { createSitemapGenerator } from './generateSitemap';
import { handleRequestSitemap } from './sitemapRequest';
import { fetchSiteNav, handleSitemapTask } from './sitemapTask';

/**
 * worker の実行 SA。Secret を結ぶ関数は、firebase-tools が Secret の IAM を確かめる処理（deploy/functions/ensure.js
 * secretsToServiceAccounts → secretManager.checkServiceAgentRole）で endpoint.serviceAccount を**補わずに**使うため、
 * 末尾 '@' の省略形だと setIamPolicy が 400「Invalid service account」になる（2026-11-25 G-7 で発生。firebase-tools 15.35）。
 * なので完全なメールにする。プロジェクト ID は discovery に渡る GCLOUD_PROJECT（予備 FIREBASE_CONFIG）から読む。
 * 分からないときは省略形のまま（デプロイが同じ 400 で止まる＝別の SA へ権限を付けない。fail-closed）
 */
export function aiWorkerServiceAccount(env: NodeJS.ProcessEnv): string {
  let fromConfig = '';
  try { fromConfig = String((JSON.parse(env.FIREBASE_CONFIG ?? '{}') as { projectId?: unknown }).projectId ?? ''); } catch { fromConfig = ''; }
  const project = (env.GCLOUD_PROJECT || fromConfig).trim();
  return /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project) ? `afro-cms-ai-worker@${project}.iam.gserviceaccount.com` : 'afro-cms-ai-worker@';
}
export const AI_WORKER_SERVICE_ACCOUNT = aiWorkerServiceAccount(process.env);
export const AI_TASK_FUNCTION = 'generateRequirementsDraftTask';
const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');

export function makeAiFunctions(opts: { region: string; enforceAppCheck: boolean; cors: boolean | string[] }) {
  const callableOpts = { enforceAppCheck: opts.enforceAppCheck, cors: opts.cors };
  const requestRequirementsDraft = onCall(callableOpts, (req) =>
    handleRequestDraft(req, {
      db: getFirestore(),
      now: Date.now,
      flags: readFlags,
      // 今の設定のハッシュだけ（callable は AI のクライアントを作らない・Secret を持たない）。版は AI_REQUIREMENTS_PROPOSAL_VERSION（既定 2）
      configHash: () => configHash(configKeyForVersion(readProposalVersion())),
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
      // 版（AI_REQUIREMENTS_PROPOSAL_VERSION。既定 2）は callable の configHash と同じ値から選ぶ
      createGenerator: (key) => createGenerator(key, { config: aiConfigFor(readProposalVersion()) }),
      siteCheck: (url) => runSiteCheck(url, { resolve: systemResolver, nowIso: () => new Date().toISOString() }),
      log: functionsLogger,
    });
  });
  return { requestRequirementsDraft, saveAiDraftEdits, generateRequirementsDraftTask };
}

/**
 * サイトマップの AI 下書き（LIVE_SITEMAP_IMPL_PLAN §3・§4 U-F2。sec M-4）。functions/src/index.ts は makeSitemapAiFunctions を呼んで export するだけ（INT）。
 * - requestSitemapDraft（callable）: 全体既定（256MiB/30s・SA afro-cms-functions@）。**Secret を結ばない**・AI のクライアントを作らない
 * - generateSitemapDraftTask（worker）: 要件定義書の worker と同じ SA afro-cms-ai-worker@・secrets [ANTHROPIC_API_KEY] はここだけ・
 *   retryConfig.maxAttempts 1（SDK も maxRetries 0）・invoker は指定しない（onTaskDispatched の既定の OIDC。公開しない）
 */
export const SITEMAP_AI_TASK_FUNCTION = 'generateSitemapDraftTask';

export function makeSitemapAiFunctions(opts: { region: string; enforceAppCheck: boolean; cors: boolean | string[] }) {
  const callableOpts = { enforceAppCheck: opts.enforceAppCheck, cors: opts.cors };
  const requestSitemapDraft = onCall(callableOpts, (req) =>
    handleRequestSitemap(req, {
      db: getFirestore(),
      now: Date.now,
      flags: readSitemapFlags,
      enqueue: async ({ projectId, requestId }) =>
        getFunctions().taskQueue(`locations/${opts.region}/functions/${SITEMAP_AI_TASK_FUNCTION}`).enqueue(
          { projectId, requestId },
          // 押下ごとの requestId を鍵にする（要件定義書の worker と鍵が重ならないよう接頭辞を付ける）
          { id: await sha256Hex(`sitemap:${projectId}:${requestId}`), dispatchDeadlineSeconds: AI_WORKER.dispatchDeadlineSeconds },
        ),
      log: functionsLogger,
    }));
  const generateSitemapDraftTask = onTaskDispatched({
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
    await handleSitemapTask(req.data, {
      db: getFirestore(),
      now: Date.now,
      flags: readSitemapFlags,
      apiKey: () => ANTHROPIC_API_KEY.value() ?? '',
      // 本物のクライアントはここ（worker）でだけ Secret の値から作る
      createGenerator: (key) => createSitemapGenerator(key),
      siteNav: (url) => fetchSiteNav(url, { resolve: systemResolver }),
      log: functionsLogger,
    });
  });
  return { requestSitemapDraft, generateSitemapDraftTask };
}
