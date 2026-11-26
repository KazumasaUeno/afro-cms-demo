/**
 * generateRequirementsDraftTask（onTaskDispatched。設計 §2.2）の本体。Secret を結ぶのはこの関数だけ（L-a。SA afro-cms-ai-worker@）。
 *
 * 開始: フラグを見直す（off・allowlist 外なら返金して終わる）→ Secret が無ければ返金 → transaction で job が自分で running かを確かめ lease を延ばす
 * 処理: 回答の読み直しと前提の再確認 → 送る回答（§4）→ サイト診断（§3。失敗しても回答だけで続ける）→ generateDraft（U3。注入）→ 再検証
 * 結果: 最後の transaction で job が自分で running のときだけ書く（fencing）。AI を呼ぶ前の失敗は加算を戻す。呼んだ後は戻さない
 * 例外を外へ投げない（retryConfig.maxAttempts 1。失敗は lastError とログに残す）
 */
import { FieldValue, Timestamp, type DocumentReference, type DocumentSnapshot, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { validateEditable, EditableError } from './editable';
import { validateEditableV3 } from './reqDocEditable';
import type { ReqDocServerFacts } from './reqDocPostprocess';
import { generationAllowed, type AiFlags, type FlagRole } from './flags';
import type { GenerateDraftResult, Generator } from './generatePort';
import { AI_LEASE } from './limits';
import { errorCodeOf, type AiLogger } from './log';
import { readUsage } from './quota';
import { draftRef, parseRequestInput, releaseReservation, usageRef } from './request';
import { answersHash, configHash } from './shared/answersHash';
import { buildSentAnswers, competitorHostsOf, missingRequired } from './shared/redact';
import type { AnswerValue } from './shared/types';
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

/** 日付（ISO 文字列か Timestamp）→ 'yyyy-mm-dd'（読めなければ undefined） */
function dayOf(v: unknown): string | undefined {
  if (typeof v === 'string') return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : undefined;
  if (v instanceof Timestamp) return v.toDate().toISOString().slice(0, 10);
  return undefined;
}

/**
 * v3 でサーバーが転記する材料（REQUIREMENTS_DOC_TEMPLATE.md §2 の fill:'server'）。**AI へは送らない**（generateDraft の buildPayload は読まない）。
 * 案件の欄（siteName・clientName）・DNS の選択式の回答（q-dns-owner・q-dns-switch。自由記述の q-infra・q-dns-note は読まない）・
 * 日程（案件の文書に schedule があるときだけ。[INFERENCE] 今の live の projects には schedule が無い＝firestore.rules validProject）
 */
export function serverFactsOf(project: Record<string, unknown> | undefined, answers: Record<string, AnswerValue>): ReqDocServerFacts {
  const p = project ?? {};
  const text = (v: unknown) => (typeof v === 'string' ? v : undefined);
  const sch = (p.schedule && typeof p.schedule === 'object' ? p.schedule : {}) as Record<string, unknown>;
  const facts: ReqDocServerFacts = {
    siteName: text(p.siteName),
    clientName: text(p.clientName),
    dnsOwner: text(answers['q-dns-owner']),
    dnsSwitch: text(answers['q-dns-switch']),
    releaseDate: dayOf(sch.releaseDate),
    deliveryDate: dayOf(sch.deliveryDate),
    buildDue: dayOf(sch.buildDue),
  };
  return Object.fromEntries(Object.entries(facts).filter(([, v]) => v !== undefined)) as ReqDocServerFacts;
}

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
  // AI を呼んだ後の推定費用（fencing・想定外の失敗でも aiUsage へ足す）と、自分の予約の日（job0.quotaDay）
  let spentMicroUsd = 0;
  let myDay = '';
  const addCost = (tx: Transaction, uRef: DocumentReference, uSnap: DocumentSnapshot, cost: number) => {
    if (!uSnap.exists || cost <= 0) return;
    const u = readUsage(uSnap.data());
    tx.set(uRef, { ...u, costMicroUsd: u.costMicroUsd + cost }, { merge: false });
  };
  try {
    // 開始前の確認（フラグ・Secret）。どちらも AI を呼ぶ前なので返金する
    const pre = (await aiRef.get()).data();
    const job0 = (pre?.job ?? {}) as Record<string, unknown>;
    if (!pre || job0.state !== 'running' || job0.requestId !== requestId) {
      log('info', 'stale');
      return 'stale';
    }
    myDay = typeof job0.quotaDay === 'string' ? job0.quotaDay : '';
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
      const answers = (rSnap.data()?.answers ?? {}) as Record<string, AnswerValue>;
      if (!p || p.archived === true || p.requirements?.status !== 'draft' || missingRequired(answers).length > 0) return { kind: 'precondition' as const };
      tx.update(aiRef, { 'job.leaseUntil': Timestamp.fromMillis(deps.now() + AI_LEASE.workerSeconds * 1000) });
      return { kind: 'go' as const, answers, facts: serverFactsOf(p, answers) };
    });
    if (start.kind === 'stale') {
      log('info', 'stale');
      return 'stale';
    }
    if (start.kind === 'precondition') return await refundWith('ai-precondition-changed', 'info');

    const raw = start.answers;
    const siteUrl = asList(raw['q-url'])[0]?.trim() ?? '';
    const sent = { answers: buildSentAnswers(raw), competitorHosts: competitorHostsOf(raw) };
    const site = await deps.siteCheck(siteUrl);
    // 生成器（本物のクライアント）はここで初めて作る（Secret の値は worker の中だけ）
    const generator = deps.createGenerator(key);
    const [aHash, cHash] = await Promise.all([answersHash(raw), configHash(generator.config)]);
    let result: GenerateDraftResult;
    try {
      aiCalled = true;
      result = await generator.generateDraft({
        answers: sent.answers,
        siteFacts: site.siteCheck.items.length > 0 ? site.siteCheck : null,
        siteText: site.siteText,
        competitorHosts: sent.competitorHosts,
        // v3 の転記だけに使う（AI へは送らない）。v2 の生成器は読まない
        serverFacts: start.facts,
      });
    } catch (e) {
      // generateDraft は失敗を値で返す。ここに来るのは想定外。本文は持たないので種別だけ（握り潰さずログに残す）
      log('error', 'generator_threw', { errorCode: errorCodeOf(e) });
      result = { ok: false, code: 'upstream', durationMs: 0 };
    }
    // 送る前の設定の誤り（未知のモデル。U3 が code 'config' で返す）は AI を呼んでいないので返金する
    if (!result.ok && result.code === 'config') {
      aiCalled = false;
      return await refundWith('ai-config', 'error');
    }
    spentMicroUsd = Math.max(0, Math.floor(result.usage?.costMicroUsd || 0));
    let editable = null;
    if (result.ok) {
      try {
        const p = result.proposal;
        // v3 は自分自身と照らして検査する（キーの過不足・固定は確認中だけ・上限）
        editable = p.version === 3
          ? validateEditableV3({ summary: p.summary, points: p.points, doc: p.doc }, p)
          : validateEditable({ summary: p.summary, points: p.points, draft: p.draft });
      } catch (e) {
        if (!(e instanceof EditableError)) throw e;
        result = { ok: false, code: 'schema', anthropicRequestId: result.anthropicRequestId, usage: result.usage, durationMs: result.durationMs };
      }
    }

    // 結果の書き込み（fencing）
    const nowTs = Timestamp.fromMillis(deps.now());
    const outcome = await db.runTransaction(async (tx) => {
      const uRef = myDay ? usageRef(db, myDay) : null;
      const [aSnap, uSnap] = await Promise.all([tx.get(aiRef), uRef ? tx.get(uRef) : Promise.resolve(null)]);
      const ai = aSnap.data();
      const job = (ai?.job ?? {}) as Record<string, unknown>;
      if (!ai || job.state !== 'running' || job.requestId !== requestId) {
        // 結果は捨てるが、費用は発生している（自分の予約の日へ足す）
        if (uRef && uSnap) addCost(tx, uRef, uSnap, spentMicroUsd);
        return 'fenced' as const;
      }
      const idleJob = { state: 'idle', requestId, by: job.by ?? 'unknown', startedAt: job.startedAt ?? nowTs };
      if (result.ok && editable) {
        // サーバー欄の正は U3 の result.proposal（除去済みの文・siteCheck は項目が無ければ null。Lead DECISION 2026-11-24 CR-M2）
        const p = result.proposal;
        const generated = {
          version: p.version,
          hostname: p.hostname,
          issue: p.issue,
          purposes: p.purposes,
          improves: p.improves,
          competitors: p.competitors,
          siteCheck: p.siteCheck,
          origin: p.origin,
          ...(p.version === 3 ? { template: { id: p.template.id, version: p.template.version } } : {}),
          ...editable,
          flags: { unsupportedNumbers: (result.flags?.unsupportedNumbers ?? []).filter((x) => typeof x === 'string').slice(0, 50).map((x) => x.slice(0, 50)) },
        };
        const update: Record<string, unknown> = {
          state: 'ready',
          generated,
          answersHash: aHash,
          configHash: cHash,
          usage: result.usage,
          job: idleJob,
          lastError: FieldValue.delete(),
          updatedAt: nowTs,
          updatedBy: 'server',
        };
        if (job.discardEdits === true) {
          Object.assign(update, { edited: FieldValue.delete(), editedAt: FieldValue.delete(), editedBy: FieldValue.delete(), submitReady: FieldValue.delete() });
          if (job.role === 'admin') {
            const prev = Array.isArray(ai.discardLog) ? ai.discardLog : [];
            update.discardLog = [...prev, { by: job.by, at: nowTs, role: 'admin' }].slice(-AI_DRAFT_LIMITS.discardLog);
          }
        }
        tx.update(aiRef, update);
        if (uRef && uSnap) addCost(tx, uRef, uSnap, spentMicroUsd);
        return 'ready' as const;
      }
      const fail = result as Extract<GenerateDraftResult, { ok: false }>;
      const lastError: Record<string, unknown> = { code: `ai-${fail.code}`, at: nowTs, requestId };
      if (typeof fail.httpStatus === 'number' && Number.isInteger(fail.httpStatus)) lastError.httpStatus = fail.httpStatus;
      const rid = safeId(fail.anthropicRequestId);
      if (rid) lastError.anthropicRequestId = rid;
      tx.update(aiRef, { state: ai.generated ? 'ready' : 'failed', lastError, job: idleJob, updatedAt: nowTs, updatedBy: 'server' });
      // AI が応答した失敗（schema・refusal・max_tokens）も費用は発生している。回数は戻さず、推定費用だけ足す
      if (uRef && uSnap) addCost(tx, uRef, uSnap, spentMicroUsd);
      return 'failed' as const;
    });

    // 本文は出さない（件数・種別・所要時間だけ）
    const fields: Record<string, unknown> = { siteCode: site.code ?? 'ok', siteStatus: site.siteCheck.status };
    if (typeof result.durationMs === 'number') fields.aiDurationMs = result.durationMs;
    if (!result.ok && result.usage) Object.assign(fields, { input: result.usage.input, output: result.usage.output, cacheRead: result.usage.cacheRead });
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
        const uRef = myDay ? usageRef(db, myDay) : null;
        const [s, uSnap] = await Promise.all([tx.get(aiRef), uRef ? tx.get(uRef) : Promise.resolve(null)]);
        // 呼んだ後の費用は、job が自分のものでなくても足す（結果の transaction は失敗して何も書いていない）
        if (uRef && uSnap) addCost(tx, uRef, uSnap, spentMicroUsd);
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
