/**
 * requestRequirementsDraft（onCall。設計 §2.1）: 認可・前提・lease・上限の確保だけを 1 transaction で行い、Cloud Tasks へ積む。
 * **Secret を持たない**（L-a。実行 SA は全体既定の afro-cms-functions@）。回答・URL はクライアントから受け取らない。
 *
 * 順序: フラグ（off なら最初に拒否）→ 認可 → transaction（①読む ②前提 ③lease と Idempotency ④ここで初めて上限を加算 ⑤job）→ enqueue。
 * enqueue に失敗したら返金の transaction（lease を外し加算を戻す）をして unavailable。前提で落ちたときは何も書かない
 */
import { Timestamp, type DocumentReference, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/https';
import { assertCanGenerate, resolveCaller, type AuthLike, type ProjectLike } from './authz';
import { generationAllowed, type AiFlags } from './flags';
import { AI_LEASE } from './limits';
import { currentDraftQuota, jstDay, readUsage, refund, reserve, usageDocId, type QuotaScope } from './quota';
import { answersHash } from './shared/answersHash';
import { missingRequired } from './shared/redact';
import type { AnswerValue } from './shared/types';
import { errorCodeOf, type AiLogger } from './log';

export interface RequestInput {
  projectId: string;
  requestId: string;
  regenerate: boolean;
  discardEdits: boolean;
  confirmDiscard: boolean;
}

export type RequestOutput = { state: 'running'; requestId: string } | { state: 'ready'; reused: true } | { state: 'ready' | 'failed'; requestId: string };

export interface RequestDeps {
  db: Firestore;
  now: () => number;
  flags: () => AiFlags;
  /** 今の AI 設定のハッシュ（モデル・promptVersion・effort。U3 の設定から） */
  configHash: () => Promise<string>;
  enqueue: (task: { projectId: string; requestId: string }) => Promise<void>;
  log: AiLogger;
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROJECT_ID = /^[A-Za-z0-9_-]{1,128}$/;

export function parseRequestInput(data: unknown): RequestInput {
  const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const { projectId, requestId } = d;
  if (typeof projectId !== 'string' || !PROJECT_ID.test(projectId)) throw new HttpsError('invalid-argument', 'projectId is invalid');
  if (typeof requestId !== 'string' || !UUID_V4.test(requestId)) throw new HttpsError('invalid-argument', 'requestId is invalid');
  for (const k of ['regenerate', 'discardEdits', 'confirmDiscard']) {
    if (d[k] !== undefined && typeof d[k] !== 'boolean') throw new HttpsError('invalid-argument', `${k} is invalid`);
  }
  return { projectId, requestId: requestId.toLowerCase(), regenerate: d.regenerate === true, discardEdits: d.discardEdits === true, confirmDiscard: d.confirmDiscard === true };
}

export const draftRef = (db: Firestore, pid: string) => db.doc(`projects/${pid}/aiDrafts/requirements`);
export const usageRef = (db: Firestore, day: string) => db.doc(`aiUsage/${usageDocId(day)}`);

const millis = (v: unknown): number => (v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : 0);

/** 実行中のジョブか（lease が切れていない） */
export function jobRunning(job: unknown, nowMs: number): boolean {
  const j = (job && typeof job === 'object' ? job : {}) as Record<string, unknown>;
  return j.state === 'running' && millis(j.leaseUntil) > nowMs;
}

export async function handleRequestDraft(req: { auth?: AuthLike | null; data: unknown }, deps: RequestDeps): Promise<RequestOutput> {
  const started = deps.now();
  const flags = deps.flags();
  if (flags.mode === 'off') throw new HttpsError('failed-precondition', 'feature-disabled');
  const input = parseRequestInput(req.data);
  const caller = await resolveCaller(deps.db, req.auth);
  if (!generationAllowed(flags, caller.role, input.projectId)) throw new HttpsError('failed-precondition', 'feature-disabled');
  const log = (level: 'info' | 'warn' | 'error', status: string, extra: Record<string, unknown> = {}) =>
    deps.log[level]('ai.request', { event: 'ai.request', status, projectId: input.projectId, requestId: input.requestId, uid: caller.uid, durationMs: deps.now() - started, ...extra });
  const db = deps.db;
  const projRef = db.doc(`projects/${input.projectId}`);
  const reqRef = db.doc(`projects/${input.projectId}/requirements/current`);
  const aiRef = draftRef(db, input.projectId);
  const cfgHash = await deps.configHash();

  let outcome: RequestOutput;
  let reservedDay = '';
  try {
    outcome = await db.runTransaction(async (tx) => {
      const now = deps.now();
      const day = jstDay(now);
      const uRef = usageRef(db, day);
      // ① 読む（transaction の読みは書きより先）
      const [pSnap, rSnap, aSnap, uSnap] = await Promise.all([tx.get(projRef), tx.get(reqRef), tx.get(aiRef), tx.get(uRef)]);
      const project = pSnap.data() as ProjectLike | undefined;
      assertCanGenerate(caller, project);
      // ② 前提
      if (project?.requirements?.status !== 'draft') throw new HttpsError('failed-precondition', 'not-draft');
      const answers = (rSnap.data()?.answers ?? {}) as Record<string, unknown>;
      if (!rSnap.exists || missingRequired(answers).length > 0) throw new HttpsError('failed-precondition', 'answers-missing');
      const ai = aSnap.data() as Record<string, unknown> | undefined;
      const job = (ai?.job ?? {}) as Record<string, unknown>;
      // ③ lease と Idempotency
      // 同じ requestId は状態を返すだけで予約し直さない（設計 §2.1③。CR-M1）。running のまま lease が切れた押下は failed で返し、
      // 画面は新しい requestId で押し直す（再予約すると二重加算になり、同じタスク ID の enqueue は task-already-exists で進まない）
      if (job.requestId === input.requestId) {
        if (jobRunning(job, now)) return { state: 'running', requestId: input.requestId } as const;
        if (job.state === 'running') return { state: 'failed', requestId: input.requestId } as const;
        return { state: ai?.state === 'ready' ? 'ready' : 'failed', requestId: input.requestId } as const;
      }
      if (jobRunning(job, now)) throw new HttpsError('aborted', 'already-running');
      const hasEdits = !!ai?.edited;
      if (hasEdits && !input.discardEdits) throw new HttpsError('failed-precondition', 'edits-exist');
      if (input.discardEdits && caller.role === 'admin' && !input.confirmDiscard) throw new HttpsError('failed-precondition', 'confirm-discard-required');
      const aHash = await answersHash(answers as Record<string, AnswerValue>);
      if (!input.regenerate && ai?.generated && ai.state === 'ready' && ai.answersHash === aHash && ai.configHash === cfgHash) {
        return { state: 'ready', reused: true } as const;
      }
      // ④ 上限（ここで初めて加算）
      const usage = readUsage(uSnap.data());
      const next = reserve(currentDraftQuota(ai?.quota, day), usage, caller.uid);
      // ⑤ job
      const ts = Timestamp.fromMillis(now);
      const newJob = {
        state: 'running',
        requestId: input.requestId,
        by: caller.uid,
        role: caller.role,
        startedAt: ts,
        leaseUntil: Timestamp.fromMillis(now + AI_LEASE.requestSeconds * 1000),
        discardEdits: hasEdits && input.discardEdits,
        quotaDay: day,
      };
      const base = ai ? {} : { schemaVersion: 1, state: 'failed', discardLog: [] };
      tx.set(aiRef, { ...base, job: newJob, quota: next.quota, updatedAt: ts, updatedBy: caller.uid }, { merge: true });
      tx.set(uRef, next.usage, { merge: false });
      reservedDay = day;
      return { state: 'running', requestId: input.requestId } as const;
    });
  } catch (e) {
    if (e instanceof HttpsError) {
      log(e.code === 'resource-exhausted' || e.code === 'aborted' ? 'warn' : 'info', 'rejected', { errorCode: e.code, reason: e.message });
      throw e;
    }
    log('error', 'error', { errorCode: errorCodeOf(e) });
    throw new HttpsError('internal', 'could not start');
  }

  if (!reservedDay) {
    log('info', 'state' in outcome && 'reused' in outcome ? 'reused' : 'idempotent', { state: outcome.state });
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
    await releaseReservation(db, aiRef, input.requestId, deps.now, caller.uid).catch((re) =>
      log('error', 'refund_failed', { errorCode: errorCodeOf(re) }));
    log('error', 'enqueue_failed', { errorCode: code });
    throw new HttpsError('unavailable', 'could not start');
  }
  log('info', 'enqueued');
  return outcome;
}

/**
 * 返金: job がまだこの requestId で running なら lease を外し（idle）、加算を戻す。違えば何もしない（false）。
 * lastError は呼び出し側が渡したときだけ書く。scope は上限の名前空間（省略は要件定義書。サイトマップは aiRef に aiDrafts/sitemap を渡し scope 'sitemap'）
 */
export async function releaseReservation(
  db: Firestore,
  aiRef: DocumentReference,
  requestId: string,
  now: () => number,
  by: string,
  lastErrorCode?: string,
  scope?: QuotaScope,
): Promise<boolean> {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(aiRef);
    const ai = snap.data();
    const job = (ai?.job ?? {}) as Record<string, unknown>;
    if (!ai || job.state !== 'running' || job.requestId !== requestId) return false;
    const day = typeof job.quotaDay === 'string' ? job.quotaDay : jstDay(now());
    const uRef = usageRef(db, day);
    const uSnap = await tx.get(uRef);
    const uid = typeof job.by === 'string' ? job.by : by;
    const r = refund(ai.quota, readUsage(uSnap.data()), day, uid, scope);
    const ts = Timestamp.fromMillis(now());
    const update: Record<string, unknown> = {
      job: { state: 'idle', requestId, by: uid, startedAt: job.startedAt ?? ts },
      updatedAt: ts,
      updatedBy: 'server',
    };
    if (r.quota) update.quota = r.quota;
    if (lastErrorCode) update.lastError = { code: lastErrorCode, at: ts, requestId };
    tx.update(aiRef, update);
    if (uSnap.exists) tx.set(uRef, r.usage, { merge: false });
    return true;
  });
}
