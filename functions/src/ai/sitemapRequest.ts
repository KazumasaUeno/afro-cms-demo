/**
 * requestSitemapDraft（onCall。LIVE_SITEMAP_AI.md §4・§7、LIVE_SITEMAP_DATA.md §3.2・§7・§8、IMPL_PLAN §3・§4 U-F2、脅威モデル S-12・S-13・S-14・S-19）。
 * 認可・前提・lease・上限の確保だけを 1 transaction で行い、Cloud Tasks へ積む（worker は generateSitemapDraftTask。**この関数は Secret を持たない**）。
 *
 * - 入力は {projectId, requestId(UUID v4), regenerate?, discardEdits?, confirmDiscard?} だけ（未知キーは invalid-argument。真偽値は typeof boolean。S-12・sec L-1）。
 *   本文・要件の版・URL はクライアントから受けない。送る本文は worker が approvals/{project.requirements.approvalId}（承認の写し。不変）から読む
 * - 順序: フラグ（off なら最初に拒否）→ 入力 → 認可（呼び出し者）→ transaction（①読む ②認可と archived ③同じ requestId ④前提 ⑤編集の破棄の確認 ⑥上限 ⑦job）→ enqueue。
 *   enqueue に失敗したら返金（releaseReservation の scope 'sitemap'）して unavailable。前提で落ちたときは何も書かない
 * - 前提の失敗は failed-precondition＋details {reason}（ai-disabled / req-not-approved / state / job-running / archived / edits-exist / confirm-discard-required）
 * - 戻り値: 新しく積んだ 'queued'／同じ requestId が実行中 'running'／同じ requestId は終わっている 'reused'（積み直さない・上限に数えない。結果は aiDrafts/sitemap を読む）
 * - ログは event 'ai.sitemap.request' で種別・ID・件数だけ（要件・回答・ラベルを出さない。S-19）
 */
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/https';
import { assertCanGenerate, resolveCaller, type AuthLike } from './authz';
import { generationAllowed, type AiFlags } from './flags';
import { AI_LEASE } from './limits';
import { errorCodeOf, type AiLogger } from './log';
import { currentDraftQuota, jstDay, readUsage, reserve } from './quota';
import { jobRunning, releaseReservation, usageRef } from './request';
import {
  failureFields, internalRef, invalid, isObj, projectIdOf, projectRef, sitemapAiDraftRef, strictInput, type SitemapProject,
} from '../sitemap/common';

export interface SitemapRequestInput {
  projectId: string;
  requestId: string;
  regenerate: boolean;
  discardEdits: boolean;
  confirmDiscard: boolean;
}

export type SitemapRequestOutput = { state: 'queued' | 'running' | 'reused'; requestId: string };

export interface SitemapRequestDeps {
  db: Firestore;
  now: () => number;
  /** readSitemapFlags（AI_SITEMAP_MODE・AI_SITEMAP_PROJECT_ALLOWLIST） */
  flags: () => AiFlags;
  enqueue: (task: { projectId: string; requestId: string }) => Promise<void>;
  log: AiLogger;
}

export type SitemapRequestReason =
  | 'ai-disabled' | 'req-not-approved' | 'state' | 'job-running' | 'archived' | 'edits-exist' | 'confirm-discard-required';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** 要件定義書の承認記録の ID（firestore.rules の approvalId(rev, 'approve')）。文書パスに入れる前に形を確かめる */
const REQ_APPROVAL_ID = /^requirements-r(\d{1,4})-approve$/;
const INPUT_KEYS = ['projectId', 'requestId', 'regenerate', 'discardEdits', 'confirmDiscard'] as const;
const FLAG_KEYS = ['regenerate', 'discardEdits', 'confirmDiscard'] as const;

export const sitemapPrecondition = (reason: SitemapRequestReason) => new HttpsError('failed-precondition', reason, { reason });

/** 入力の検査（DB を読まない）。不正は invalid-argument（details は {field, code, count}。入力の値を入れない） */
export function parseSitemapRequestInput(data: unknown): SitemapRequestInput {
  const d = strictInput(data, INPUT_KEYS, ['projectId', 'requestId']);
  const projectId = projectIdOf(d);
  const { requestId } = d;
  if (typeof requestId !== 'string' || !UUID_V4.test(requestId)) throw invalid({ field: 'requestId', code: 'shape' });
  for (const k of FLAG_KEYS) if (d[k] !== undefined && typeof d[k] !== 'boolean') throw invalid({ field: k, code: 'shape' });
  return {
    projectId,
    requestId: requestId.toLowerCase(),
    regenerate: d.regenerate === true,
    discardEdits: d.discardEdits === true,
    confirmDiscard: d.confirmDiscard === true,
  };
}

/** 要件定義書が approved で、承認記録（approvals/{approvalId}）が今の版の approve であること。満たせば {approvalId, revision} */
function approvedRequirements(p: SitemapProject): { approvalId: string; revision: number } | null {
  const r = (p.requirements ?? {}) as Record<string, unknown>;
  if (r.status !== 'approved' || typeof r.revision !== 'number' || !Number.isInteger(r.revision)) return null;
  const id = r.approvalId;
  if (typeof id !== 'string') return null;
  const m = REQ_APPROVAL_ID.exec(id);
  if (!m || Number(m[1]) !== r.revision) return null;
  return { approvalId: id, revision: r.revision };
}

export async function handleRequestSitemap(req: { auth?: AuthLike | null; data: unknown }, deps: SitemapRequestDeps): Promise<SitemapRequestOutput> {
  const started = deps.now();
  const flags = deps.flags();
  if (flags.mode === 'off') throw sitemapPrecondition('ai-disabled');
  const input = parseSitemapRequestInput(req.data);
  const caller = await resolveCaller(deps.db, req.auth);
  const log = (level: 'info' | 'warn' | 'error', status: string, extra: Record<string, unknown> = {}) =>
    deps.log[level]('ai.sitemap.request', {
      event: 'ai.sitemap.request', status, projectId: input.projectId, requestId: input.requestId, uid: caller.uid, durationMs: deps.now() - started, ...extra,
    });
  if (!generationAllowed(flags, caller.role, input.projectId)) {
    log('info', 'rejected', { errorCode: 'failed-precondition', reason: 'ai-disabled' });
    throw sitemapPrecondition('ai-disabled');
  }
  const db = deps.db;
  const pRef = projectRef(db, input.projectId);
  const iRef = internalRef(db, input.projectId);
  const aiRef = sitemapAiDraftRef(db, input.projectId);
  const accRef = db.doc(`accounts/${caller.uid}`);

  let outcome: SitemapRequestOutput;
  try {
    outcome = await db.runTransaction(async (tx) => {
      const now = deps.now();
      const day = jstDay(now);
      const uRef = usageRef(db, day);
      // ① 読む（transaction の読みは書きより先。承認記録は案件の値が要るので 2 段目）
      const [pSnap, accSnap, iSnap, aSnap, uSnap] = await Promise.all([tx.get(pRef), tx.get(accRef), tx.get(iRef), tx.get(aiRef), tx.get(uRef)]);
      const p = pSnap.data() as SitemapProject | undefined;
      // ② 認可と archived（TX で読んだ案件に当てる。sec M-1）
      try {
        assertCanGenerate(caller, p);
      } catch (e) {
        if (e instanceof HttpsError && e.code === 'failed-precondition') throw sitemapPrecondition('archived');
        throw e;
      }
      const a = accSnap.data();
      if (!accSnap.exists || !a || a.status !== 'active' || a.role !== caller.role) throw new HttpsError('permission-denied', 'not allowed');
      const project = p as SitemapProject;
      const ai = aSnap.data() as Record<string, unknown> | undefined;
      const job = isObj(ai?.job) ? ai.job : {};
      // ③ 同じ requestId は状態を返すだけ（予約し直さない・積み直さない。同じタスク名の enqueue は進まないため）
      if (job.requestId === input.requestId) {
        return { state: jobRunning(job, now) ? 'running' : 'reused', requestId: input.requestId } as const;
      }
      // ④ 前提（none → draft（AI）・draft → draft（再生成）。PLAN §3）
      const reqOk = approvedRequirements(project);
      if (!reqOk) throw sitemapPrecondition('req-not-approved');
      const aprSnap = await tx.get(db.doc(`projects/${input.projectId}/approvals/${reqOk.approvalId}`));
      const apr = aprSnap.data();
      if (!aprSnap.exists || !apr || apr.kind !== 'requirements' || apr.action !== 'approve' || apr.revision !== reqOk.revision) {
        throw sitemapPrecondition('req-not-approved');
      }
      const status = project.sitemap?.status;
      if (project.sitemap !== undefined && project.sitemap !== null && status !== 'draft') throw sitemapPrecondition('state');
      if (jobRunning(job, now)) throw sitemapPrecondition('job-running');
      // ⑤ 作業中の版があるなら、捨てる指定と確認の両方が要る（AC-23）
      let baseEditSeq: number | null = null;
      if (iSnap.exists) {
        if (!input.discardEdits) throw sitemapPrecondition('edits-exist');
        if (!input.confirmDiscard) throw sitemapPrecondition('confirm-discard-required');
        const seq = iSnap.data()?.editSeq;
        baseEditSeq = typeof seq === 'number' && Number.isSafeInteger(seq) ? seq : 0;
      }
      // ⑥ 上限（ここで初めて加算。案件の枠は aiDrafts/sitemap.quota、利用者の鍵は sitemap:{day}:{uid}、全体は共用）
      const next = reserve(currentDraftQuota(ai?.quota, day), readUsage(uSnap.data()), caller.uid, 'sitemap');
      // ⑦ job（worker が開始時と書き込み時に照合する値を一緒に置く。S-13・sec L-5）
      const ts = Timestamp.fromMillis(now);
      const newJob = {
        state: 'running',
        requestId: input.requestId,
        by: caller.uid,
        role: caller.role,
        startedAt: ts,
        leaseUntil: Timestamp.fromMillis(now + AI_LEASE.requestSeconds * 1000),
        quotaDay: day,
        regenerate: input.regenerate,
        discardEdits: baseEditSeq !== null,
        baseEditSeq,
        reqRevision: reqOk.revision,
        approvalId: reqOk.approvalId,
      };
      const base = ai ? {} : { schemaVersion: 1, state: 'failed' };
      tx.set(aiRef, { ...base, job: newJob, quota: next.quota, updatedAt: ts, updatedBy: caller.uid }, { merge: true });
      tx.set(uRef, next.usage, { merge: false });
      return { state: 'queued', requestId: input.requestId } as const;
    });
  } catch (e) {
    if (e instanceof HttpsError) {
      const quota = e.code === 'resource-exhausted';
      log(quota ? 'warn' : 'info', 'rejected', { errorCode: e.code, ...failureFields(e), ...(quota ? { reason: e.message } : {}) });
      throw e;
    }
    log('error', 'error', { errorCode: errorCodeOf(e) });
    throw new HttpsError('internal', 'could not start');
  }

  // 予約したかは確定した結果で決める（TX の中で旗を立てると、競合で再実行された試行が running を返しても旗が残り二重に積む）
  if (outcome.state !== 'queued') {
    log('info', outcome.state === 'running' ? 'idempotent' : 'reused', { state: outcome.state });
    return outcome;
  }
  try {
    await deps.enqueue({ projectId: input.projectId, requestId: input.requestId });
  } catch (e) {
    const code = errorCodeOf(e);
    if (code === 'functions/task-already-exists') {
      // 同じ requestId のタスクが既にある（握り潰しは warn で残す）
      log('warn', 'enqueue_duplicate', { errorCode: code });
      return outcome;
    }
    await releaseReservation(db, aiRef, input.requestId, deps.now, caller.uid, undefined, 'sitemap').catch((re) =>
      log('error', 'refund_failed', { errorCode: errorCodeOf(re) }));
    log('error', 'enqueue_failed', { errorCode: code });
    throw new HttpsError('unavailable', 'could not start');
  }
  log('info', 'enqueued');
  return outcome;
}
