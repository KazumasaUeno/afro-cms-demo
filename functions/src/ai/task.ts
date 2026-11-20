/**
 * generateRequirementsDraftTask（onTaskDispatched。設計 §2.2）の本体。Secret を結ぶのはこの関数だけ（L-a。SA afro-cms-ai-worker@）。
 *
 * 開始: フラグを見直す（off・allowlist 外なら返金して終わる）→ Secret が無ければ返金 → transaction で job が自分で running かを確かめ lease を延ばす
 * 処理: 回答の読み直しと前提の再確認 → 送る回答（§4）→ サイト診断（§3。失敗しても回答だけで続ける）→ generateDraft（U3。注入）→ 再検証
 * 結果: 最後の transaction で job が自分で running のときだけ書く（fencing）。AI を呼ぶ前の失敗は加算を戻す。呼んだ後は戻さない
 * 例外を外へ投げない（retryConfig.maxAttempts 1。失敗は lastError とログに残す）
 */
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { validateEditable, EditableError } from './editable';
import { generationAllowed, type AiFlags, type FlagRole } from './flags';
import { NotWiredError, type GenerateDraftResult, type Generator } from './generatePort';
import { AI_LEASE } from './limits';
import { errorCodeOf, type AiLogger } from './log';
import { readUsage } from './quota';
import { draftRef, parseRequestInput, releaseReservation, usageRef } from './request';
import { answersHash, buildSentAnswers, configHash, missingRequired } from './shared/answersHash';
import { AI_DRAFT_LIMITS } from './shared/aiDraft';
import type { SiteCheckResult } from './site/checks';

export interface TaskDeps {
  db: Firestore;
  now: () => number;
  flags: () => AiFlags;
  /** Secret の値（無ければ空文字）。値はログ・文書へ出さない */
  apiKey: () => string;
  createGenerator: (apiKey: string) => Generator;
  siteCheck: (siteUrl: string) => Promise<SiteCheckResult>;
  log: AiLogger;
}

export type TaskOutcome = 'stale' | 'refunded' | 'ready' | 'failed' | 'fenced' | 'invalid';

const asList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : typeof v === 'string' && v ? [v] : []);
const safeId = (v: unknown) => (typeof v === 'string' && /^[\w-]{1,128}$/.test(v) ? v : undefined);

export async function handleTask(data: unknown, deps: TaskDeps): Promise<TaskOutcome> {
  const started = deps.now();
  let input: { projectId: string; requestId: string };
  try {
    const p = parseRequestInput(data);
    input = { projectId: p.projectId, requestId: p.requestId };
  } catch {
    deps.log.warn('ai.task', { event: 'ai.task', status: 'invalid_payload' });
    return 'invalid';
  }
  const { projectId, requestId } = input;
  const db = deps.db;
  const aiRef = draftRef(db, projectId);
  const log = (level: 'info' | 'warn' | 'error', status: string, extra: Record<string, unknown> = {}) =>
    deps.log[level]('ai.task', { event: 'ai.task', status, projectId, requestId, durationMs: deps.now() - started, ...extra });
  const refundWith = async (code: string, level: 'info' | 'warn' | 'error') => {
    const done = await releaseReservation(db, aiRef, requestId, deps.now, 'server', code);
    log(level, done ? 'refunded' : 'stale', { errorCode: code });
    return done ? 'refunded' as const : 'stale' as const;
  };

  let aiCalled = false;
  try {
    // 開始前の確認（フラグ・Secret）。どちらも AI を呼ぶ前なので返金する
    const pre = (await aiRef.get()).data();
    const job0 = (pre?.job ?? {}) as Record<string, unknown>;
    if (!pre || job0.state !== 'running' || job0.requestId !== requestId) {
      log('info', 'stale');
      return 'stale';
    }
    const role = (typeof job0.role === 'string' ? job0.role : 'none') as FlagRole;
    if (!generationAllowed(deps.flags(), role, projectId)) return await refundWith('ai-feature-disabled', 'warn');
    const key = deps.apiKey();
    if (!key) return await refundWith('ai-config-missing', 'error');

    // lease を延ばし、前提を見直す（transaction）
    const start = await db.runTransaction(async (tx) => {
      const [aSnap, pSnap, rSnap] = await Promise.all([
        tx.get(aiRef), tx.get(db.doc(`projects/${projectId}`)), tx.get(db.doc(`projects/${projectId}/requirements/current`)),
      ]);
      const job = (aSnap.data()?.job ?? {}) as Record<string, unknown>;
      if (job.state !== 'running' || job.requestId !== requestId) return { kind: 'stale' as const };
      const p = pSnap.data();
      const answers = (rSnap.data()?.answers ?? {}) as Record<string, unknown>;
      if (!p || p.archived === true || p.requirements?.status !== 'draft' || missingRequired(answers).length > 0) return { kind: 'precondition' as const };
      tx.update(aiRef, { 'job.leaseUntil': Timestamp.fromMillis(deps.now() + AI_LEASE.workerSeconds * 1000) });
      return { kind: 'go' as const, answers, hasGenerated: !!aSnap.data()?.generated };
    });
    if (start.kind === 'stale') {
      log('info', 'stale');
      return 'stale';
    }
    if (start.kind === 'precondition') return await refundWith('ai-precondition-changed', 'info');

    const sent = buildSentAnswers(start.answers);
    const site = await deps.siteCheck(sent.siteUrl);
    const generator = deps.createGenerator(key);
    let result: GenerateDraftResult;
    try {
      aiCalled = true;
      result = await generator.generateDraft({
        answers: sent.answers, siteFacts: site.siteFacts, siteText: site.siteText, competitorHosts: sent.competitorHosts, config: generator.config,
      });
    } catch (e) {
      if (e instanceof NotWiredError) {
        aiCalled = false;
        return await refundWith('ai-not-wired', 'warn');
      }
      result = { ok: false, code: 'upstream' };
    }
    let editable = null;
    if (result.ok) {
      try {
        editable = validateEditable(result.proposal);
      } catch (e) {
        if (!(e instanceof EditableError)) throw e;
        result = { ok: false, code: 'schema', anthropicRequestId: result.anthropicRequestId };
      }
    }

    // 結果の書き込み（fencing）
    const nowTs = Timestamp.fromMillis(deps.now());
    const outcome = await db.runTransaction(async (tx) => {
      const aSnap = await tx.get(aiRef);
      const ai = aSnap.data();
      const job = (ai?.job ?? {}) as Record<string, unknown>;
      if (!ai || job.state !== 'running' || job.requestId !== requestId) return 'fenced' as const;
      const day = typeof job.quotaDay === 'string' ? job.quotaDay : '';
      const uRef = day ? usageRef(db, day) : null;
      const uSnap = uRef ? await tx.get(uRef) : null;
      const idleJob = { state: 'idle', requestId, by: job.by ?? 'unknown', startedAt: job.startedAt ?? nowTs };
      if (result.ok && editable) {
        const raw = start.answers;
        const generated = {
          version: 2,
          hostname: sent.hostname,
          issue: asList(raw['q-issue']).join('、').trim(),
          purposes: asList(raw['q-purpose']),
          improves: asList(raw['q-improve']),
          competitors: sent.competitorHosts,
          siteCheck: site.siteCheck,
          origin: { kind: 'ai', promptVersion: generator.config.promptVersion, model: generator.config.model },
          ...editable,
          flags: { unsupportedNumbers: (result.flags?.unsupportedNumbers ?? []).filter((x) => typeof x === 'string').slice(0, 50).map((x) => x.slice(0, 50)) },
        };
        const update: Record<string, unknown> = {
          state: 'ready',
          generated,
          answersHash: answersHash(raw),
          configHash: configHash(generator.config),
          usage: result.usage,
          job: idleJob,
          lastError: FieldValue.delete(),
          updatedAt: nowTs,
          updatedBy: 'server',
        };
        if (job.discardEdits === true) {
          Object.assign(update, { edited: FieldValue.delete(), editedAt: FieldValue.delete(), editedBy: FieldValue.delete() });
          if (job.role === 'admin') {
            const prev = Array.isArray(ai.discardLog) ? ai.discardLog : [];
            update.discardLog = [...prev, { by: job.by, at: nowTs, role: 'admin' }].slice(-AI_DRAFT_LIMITS.discardLog);
          }
        }
        tx.update(aiRef, update);
        if (uRef && uSnap) {
          const u = readUsage(uSnap.data());
          tx.set(uRef, { ...u, costMicroUsd: u.costMicroUsd + Math.max(0, Math.floor(result.usage.costMicroUsd || 0)) }, { merge: false });
        }
        return 'ready' as const;
      }
      const fail = result as Extract<GenerateDraftResult, { ok: false }>;
      const lastError: Record<string, unknown> = { code: `ai-${fail.code}`, at: nowTs, requestId };
      if (typeof fail.httpStatus === 'number' && Number.isInteger(fail.httpStatus)) lastError.httpStatus = fail.httpStatus;
      const rid = safeId(fail.anthropicRequestId);
      if (rid) lastError.anthropicRequestId = rid;
      tx.update(aiRef, { state: ai.generated ? 'ready' : 'failed', lastError, job: idleJob, updatedAt: nowTs, updatedBy: 'server' });
      return 'failed' as const;
    });

    const fields: Record<string, unknown> = { siteCode: site.code ?? 'ok', siteStatus: site.siteCheck.status };
    if (result.ok) Object.assign(fields, { input: result.usage.input, output: result.usage.output, cacheRead: result.usage.cacheRead });
    else Object.assign(fields, { errorCode: `ai-${result.code}`, httpStatus: result.httpStatus });
    const rid = safeId(result.anthropicRequestId);
    if (rid) fields.anthropicRequestId = rid;
    log(outcome === 'ready' ? 'info' : 'warn', outcome, fields);
    return outcome;
  } catch (e) {
    // 想定外（Firestore の失敗など）。AI を呼ぶ前なら返金、呼んだ後なら lastError だけ（job は idle に戻す）
    log('error', 'error', { errorCode: errorCodeOf(e), aiCalled });
    try {
      if (!aiCalled) return await refundWith('ai-internal', 'error');
      await db.runTransaction(async (tx) => {
        const s = await tx.get(aiRef);
        const ai = s.data();
        const job = (ai?.job ?? {}) as Record<string, unknown>;
        if (!ai || job.state !== 'running' || job.requestId !== requestId) return;
        const ts = Timestamp.fromMillis(deps.now());
        tx.update(aiRef, {
          state: ai.generated ? 'ready' : 'failed',
          lastError: { code: 'ai-internal', at: ts, requestId },
          job: { state: 'idle', requestId, by: job.by ?? 'unknown', startedAt: job.startedAt ?? ts },
          updatedAt: ts,
          updatedBy: 'server',
        });
      });
    } catch (e2) {
      log('error', 'error_record_failed', { errorCode: errorCodeOf(e2) });
    }
    return 'failed';
  }
}
