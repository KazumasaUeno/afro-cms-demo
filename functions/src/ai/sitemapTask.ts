/**
 * generateSitemapDraftTask（onTaskDispatched）の本体 handleSitemapTask（LIVE_SITEMAP_AI.md §4・§8、LIVE_SITEMAP_DATA.md §4・§7・§8、
 * IMPL_PLAN §4 U-F2、脅威モデル S-13・S-17・S-19・sec L-5）。Secret を結ぶのはこの関数だけ（SA afro-cms-ai-worker@。task.ts と同じ型）。
 *
 * 開始: job が自分（running・同じ requestId・lease 内）か → フラグ（readSitemapFlags）→ Secret → transaction で前提を見直し lease を延ばす
 *       （要件定義書 approved・版と承認記録が job と一致・サイトマップ none/draft・未アーカイブ）。どれかが違えば返金して終わる
 * 処理: 承認の写し（approvals/{job.approvalId}）の proposal・answers → 現行サイトのナビ（トップ 1 枚。失敗しても続ける）→ 「現在」の木（ルール）
 *       → buildSitemapPayload（送るデータはここ 1 か所）→ generateSitemap（注入）→ validateSitemapDoc をもう一度
 * 結果: 最後の transaction で job が自分・lease 内・前提が同じときだけ書く（fencing）。
 *       sitemap/internal を置き換えるのは「依頼時の job.baseEditSeq」と「今の internal.editSeq」が同じとき（none なら作成）だけ。
 *       違えば結果を aiDrafts/sitemap に残すだけ（generated.applied false。開発者の編集を上書きしない）。
 *       lease 切れ・前提の変化で結果を捨てるときは上限を戻し、費用（costMicroUsd）だけ足す。AI の失敗は上限を戻さず費用を足す
 * 例外を外へ投げない（retryConfig.maxAttempts 1）。lastError は種別のコードだけ。ログにページ名・パス・理由・要件・回答を出さない
 */
import { FieldValue, Timestamp, type DocumentSnapshot, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { generationAllowed, type AiFlags, type FlagRole } from './flags';
import type { GenerateSitemapResult, SitemapGenerator } from './generateSitemap';
import { AI_LEASE, SITE_LIMITS } from './limits';
import { errorCodeOf, type AiLogger } from './log';
import { readUsage, refund, type UsageDoc } from './quota';
import { jobRunning, releaseReservation, usageRef } from './request';
import { canonicalJson, configHash, sha256Hex } from './shared/answersHash';
import { SITEMAP_LIMITS, validateSitemapDoc } from './shared/sitemapRules';
import { robotsDisallowsRoot, siteErrorCode } from './site/checks';
import { extractHtml, type NavItem } from './site/extract';
import { fetchFollow, SiteFetchError, type FetchDeps } from './site/fetch';
import { parseSiteUrl } from './site/url';
import { beforeTreeFromNav, buildSitemapPayload } from './sitemapPayload';
import { parseSitemapRequestInput } from './sitemapRequest';
import { internalRef, isObj, projectRef, sitemapAiDraftRef, type SitemapProject } from '../sitemap/common';
import { cleanDiagram } from '../sitemap/version';

export type SiteFetchStatus = 'ok' | 'none' | 'blocked' | 'timeout' | 'error';
export interface SiteNavResult { navItems: NavItem[]; siteFetch: SiteFetchStatus }

export interface SitemapTaskDeps {
  db: Firestore;
  now: () => number;
  /** readSitemapFlags */
  flags: () => AiFlags;
  /** Secret の値（無ければ空文字）。値はログ・文書へ出さない */
  apiKey: () => string;
  createGenerator: (apiKey: string) => SitemapGenerator;
  /** 現行サイトのナビ（fetchSiteNav。テストは Stub） */
  siteNav: (siteUrl: string) => Promise<SiteNavResult>;
  log: AiLogger;
}

/**
 * ready: 下書きを作り internal へ反映 ／ kept: 下書きは aiDrafts に残したが internal は編集されていたので触らない ／
 * fenced: job が自分でない・lease 切れ（結果を捨てる）／ dropped: 書く時に前提が変わった（結果を捨てる）／
 * failed: AI・検査の失敗 ／ refunded: AI を呼ぶ前に止めた ／ stale: 自分の job でない ／ invalid: payload の形が違う
 */
export type SitemapTaskOutcome = 'invalid' | 'stale' | 'refunded' | 'ready' | 'kept' | 'fenced' | 'dropped' | 'failed';

const REQ_APPROVAL_ID = /^requirements-r\d{1,4}-approve$/;
const safeId = (v: unknown) => (typeof v === 'string' && /^[\w-]{1,128}$/.test(v) ? v : undefined);
const mine = (job: Record<string, unknown>, requestId: string) => job.state === 'running' && job.requestId === requestId;

/** 現行サイトのナビ（トップ 1 枚・robots.txt だけ。fetchFollow の守り＝SSRF・リダイレクト・2 MB をそのまま通る。AI 設計 §1.3）。例外を投げない */
export async function fetchSiteNav(siteUrl: string, deps: FetchDeps): Promise<SiteNavResult> {
  if (!siteUrl.trim()) return { navItems: [], siteFetch: 'none' };
  const fail = (e: unknown): SiteNavResult => {
    const code = siteErrorCode(e);
    if (code === 'site-timeout') return { navItems: [], siteFetch: 'timeout' };
    if (/^site-(url-|blocked|robots)/.test(code)) return { navItems: [], siteFetch: 'blocked' };
    return { navItems: [], siteFetch: 'error' };
  };
  let top: URL;
  try {
    top = parseSiteUrl(siteUrl);
  } catch (e) {
    return fail(e);
  }
  try {
    try {
      const r = await fetchFollow(`${top.protocol}//${top.host}/robots.txt`, deps);
      if (r.status === 200 && robotsDisallowsRoot(r.body.toString('utf8'))) return { navItems: [], siteFetch: 'blocked' };
    } catch (e) {
      if (!(e instanceof SiteFetchError)) throw e;
    }
    const page = await fetchFollow(top, deps);
    if (page.status < 200 || page.status >= 300 || !/^text\/html\b|^application\/xhtml\+xml\b/.test(page.contentType)) {
      return { navItems: [], siteFetch: 'error' };
    }
    return { navItems: extractHtml(page.body.toString('utf8'), SITE_LIMITS.maxTextChars, page.url).navItems, siteFetch: 'ok' };
  } catch (e) {
    return fail(e);
  }
}

/** 開始時・書き込み時の前提（S-13）: 未アーカイブ・要件定義書 approved で版と承認記録が job と同じ・サイトマップ none/draft */
function preconditionOk(p: SitemapProject | undefined, job: Record<string, unknown>): boolean {
  if (!p || p.archived === true) return false;
  const r = (p.requirements ?? {}) as Record<string, unknown>;
  if (r.status !== 'approved' || r.revision !== job.reqRevision || r.approvalId !== job.approvalId) return false;
  const s = p.sitemap;
  return s === undefined || s === null || s.status === 'draft';
}

export async function handleSitemapTask(data: unknown, deps: SitemapTaskDeps): Promise<SitemapTaskOutcome> {
  const started = deps.now();
  let projectId: string;
  let requestId: string;
  try {
    ({ projectId, requestId } = parseSitemapRequestInput(data));
  } catch {
    deps.log.warn('ai.sitemap.task', { event: 'ai.sitemap.task', status: 'invalid_payload' });
    return 'invalid';
  }
  const db = deps.db;
  const aiRef = sitemapAiDraftRef(db, projectId);
  const pRef = projectRef(db, projectId);
  const iRef = internalRef(db, projectId);
  const log = (level: 'info' | 'warn' | 'error', status: string, extra: Record<string, unknown> = {}) =>
    deps.log[level]('ai.sitemap.task', { event: 'ai.sitemap.task', status, projectId, requestId, durationMs: deps.now() - started, ...extra });
  const refundWith = async (code: string, level: 'info' | 'warn' | 'error') => {
    const done = await releaseReservation(db, aiRef, requestId, deps.now, 'server', code, 'sitemap');
    log(level, done ? 'refunded' : 'stale', { errorCode: code });
    return done ? 'refunded' as const : 'stale' as const;
  };

  let aiCalled = false;
  let spentMicroUsd = 0;
  let myDay = '';
  let myUid = '';
  /** 使用量の書き戻し（返金＋費用を 1 回の set で。merge:false は既存の経路と同じ。読んだ 4 項目＋byUid の全鍵を写す） */
  const writeUsage = (tx: Transaction, uSnap: DocumentSnapshot | null, o: { refundQuota?: unknown; cost: number }): { quota: unknown } => {
    if (!uSnap || !myDay) return { quota: null };
    let u: UsageDoc = readUsage(uSnap.data());
    let quota: unknown = null;
    if (o.refundQuota !== undefined) {
      const r = refund(o.refundQuota, u, myDay, myUid, 'sitemap');
      u = r.usage;
      quota = r.quota;
    }
    if (o.cost > 0) u = { ...u, costMicroUsd: u.costMicroUsd + o.cost };
    if (uSnap.exists && (o.refundQuota !== undefined || o.cost > 0)) tx.set(uSnap.ref, u, { merge: false });
    return { quota };
  };

  try {
    const pre = (await aiRef.get()).data();
    const job0 = (isObj(pre?.job) ? pre.job : {}) as Record<string, unknown>;
    if (!pre || !mine(job0, requestId)) {
      // 閉じた job（同じ requestId）は返金済みの経路。別の依頼に置き換わっていたら自分の予約は戻っていないが、
      // 予約した日・利用者は job にしか無く既に上書きされているため戻せない（docs/TODO.md。warn で数えられるようにする）
      const replaced = !!pre && isObj(pre.job) && pre.job.requestId !== requestId;
      log(replaced ? 'warn' : 'info', 'stale', replaced ? { errorCode: 'ai-replaced-unrefunded' } : {});
      return 'stale';
    }
    if (!jobRunning(job0, deps.now())) return await refundWith('ai-lease-expired', 'warn');
    myDay = typeof job0.quotaDay === 'string' ? job0.quotaDay : '';
    myUid = typeof job0.by === 'string' ? job0.by : '';
    const role = (typeof job0.role === 'string' ? job0.role : 'none') as FlagRole;
    if (!generationAllowed(deps.flags(), role, projectId)) return await refundWith('ai-feature-disabled', 'warn');
    const key = deps.apiKey();
    if (!key) return await refundWith('ai-config-missing', 'error');
    const approvalId = typeof job0.approvalId === 'string' && REQ_APPROVAL_ID.test(job0.approvalId) ? job0.approvalId : null;
    if (!approvalId) return await refundWith('ai-precondition-changed', 'info');

    // 前提の見直しと lease の延長（transaction）
    const start = await db.runTransaction(async (tx) => {
      const [aSnap, pSnap, rSnap] = await Promise.all([tx.get(aiRef), tx.get(pRef), tx.get(db.doc(`projects/${projectId}/approvals/${approvalId}`))]);
      const job = (isObj(aSnap.data()?.job) ? aSnap.data()?.job : {}) as Record<string, unknown>;
      if (!mine(job, requestId)) {
        // 開始の直前に別の依頼へ置き換わった: 書き込み時（fenced）と同じく job に触らず、自分の予約だけ戻す（code review Minor）
        if (aSnap.exists && job.requestId !== requestId && myDay) {
          const uSnap = await tx.get(usageRef(db, myDay));
          const w = writeUsage(tx, uSnap, { refundQuota: aSnap.data()?.quota, cost: 0 });
          if (w.quota) tx.update(aiRef, { quota: w.quota });
          return { kind: 'replaced' as const };
        }
        return { kind: 'stale' as const };
      }
      if (!jobRunning(job, deps.now())) return { kind: 'expired' as const };
      const apr = rSnap.data();
      if (!preconditionOk(pSnap.data() as SitemapProject | undefined, job)
        || !rSnap.exists || !apr || apr.kind !== 'requirements' || apr.action !== 'approve' || apr.revision !== job.reqRevision) {
        return { kind: 'precondition' as const };
      }
      tx.update(aiRef, { 'job.leaseUntil': Timestamp.fromMillis(deps.now() + AI_LEASE.workerSeconds * 1000) });
      return { kind: 'go' as const, proposal: apr.proposal as unknown, answers: (isObj(apr.answers) ? apr.answers : {}) as Record<string, unknown> };
    });
    if (start.kind === 'stale') {
      log('info', 'stale');
      return 'stale';
    }
    if (start.kind === 'replaced') {
      log('warn', 'fenced', { errorCode: 'ai-replaced' });
      return 'fenced';
    }
    if (start.kind === 'expired') return await refundWith('ai-lease-expired', 'warn');
    if (start.kind === 'precondition') return await refundWith('ai-precondition-changed', 'info');

    // 現行サイトのナビ（失敗しても「現在」はトップだけで続ける）→ 「現在」の木（ルール）→ 送るデータ
    const urlRaw = start.answers['q-url'];
    const siteUrl = (Array.isArray(urlRaw) ? String(urlRaw[0] ?? '') : typeof urlRaw === 'string' ? urlRaw : '').trim();
    let nav: SiteNavResult;
    try {
      nav = await deps.siteNav(siteUrl);
    } catch (e) {
      log('warn', 'site_nav_threw', { errorCode: errorCodeOf(e) });
      nav = { navItems: [], siteFetch: 'error' };
    }
    const before = beforeTreeFromNav(nav.navItems);
    const payload = buildSitemapPayload({ proposal: start.proposal, answers: start.answers, before });
    const generator = deps.createGenerator(key);
    const [inputHash, cHash] = await Promise.all([sha256Hex(canonicalJson(payload)), configHash(generator.config)]);
    let result: GenerateSitemapResult;
    try {
      aiCalled = true;
      result = await generator.generateSitemap({ payload, before });
    } catch (e) {
      log('error', 'generator_threw', { errorCode: errorCodeOf(e) });
      result = { ok: false, code: 'upstream', durationMs: 0 };
    }
    if (!result.ok && result.code === 'config') {
      aiCalled = false;
      return await refundWith('ai-config', 'error');
    }
    spentMicroUsd = Math.max(0, Math.floor(result.usage?.costMicroUsd || 0));
    // 保存時の検査をもう一度（AI 出力を検査なしで DB の正へ書かない。AI 設計 §3.2）
    let before2 = null;
    let after2 = null;
    if (result.ok) {
      const r = result.result;
      const v = validateSitemapDoc({ before: r.before, after: r.after });
      if (!v.ok || r.after.nodes.length > SITEMAP_LIMITS.aiPages) {
        result = { ok: false, code: 'schema', anthropicRequestId: result.anthropicRequestId, usage: result.usage, durationMs: result.durationMs };
      } else {
        before2 = cleanDiagram(r.before);
        after2 = cleanDiagram(r.after);
      }
    }

    // 結果の書き込み（fencing）
    const accRef = myUid && /^[\w-]{1,128}$/.test(myUid) ? db.doc(`accounts/${myUid}`) : null;
    const outcome = await db.runTransaction(async (tx) => {
      const uRef = myDay ? usageRef(db, myDay) : null;
      const [aSnap, pSnap, iSnap, uSnap, accSnap] = await Promise.all([
        tx.get(aiRef), tx.get(pRef), tx.get(iRef), uRef ? tx.get(uRef) : Promise.resolve(null), accRef ? tx.get(accRef) : Promise.resolve(null),
      ]);
      const ai = aSnap.data();
      const job = (isObj(ai?.job) ? ai.job : {}) as Record<string, unknown>;
      const nowMs = deps.now();
      const ts = Timestamp.fromMillis(nowMs);
      const idleJob = { state: 'idle', requestId, by: job.by ?? (myUid || 'unknown'), startedAt: job.startedAt ?? ts };
      if (!ai || job.requestId !== requestId) {
        // 別の依頼に置き換わった（自分の lease が切れた後）。自分の予約は誰も戻していないので戻す。job には触らない
        const w = writeUsage(tx, uSnap, { refundQuota: ai?.quota, cost: spentMicroUsd });
        if (ai && w.quota) tx.update(aiRef, { quota: w.quota });
        return 'fenced' as const;
      }
      if (job.state !== 'running') {
        // 自分の job だが既に閉じている（返金済みの経路）。費用だけ
        writeUsage(tx, uSnap, { cost: spentMicroUsd });
        return 'fenced' as const;
      }
      const leaseLost = !jobRunning(job, nowMs);
      const p = pSnap.data() as SitemapProject | undefined;
      if (leaseLost || !preconditionOk(p, job)) {
        const w = writeUsage(tx, uSnap, { refundQuota: ai.quota, cost: spentMicroUsd });
        tx.update(aiRef, {
          ...(w.quota ? { quota: w.quota } : {}),
          lastError: { code: leaseLost ? 'ai-lease-expired' : 'ai-precondition-changed', at: ts, requestId },
          job: idleJob, updatedAt: ts, updatedBy: 'server',
        });
        return leaseLost ? 'fenced' as const : 'dropped' as const;
      }
      if (!result.ok || !before2 || !after2) {
        const fail = result as Extract<GenerateSitemapResult, { ok: false }>;
        const lastError: Record<string, unknown> = { code: `ai-${fail.code}`, at: ts, requestId };
        if (typeof fail.httpStatus === 'number' && Number.isInteger(fail.httpStatus)) lastError.httpStatus = fail.httpStatus;
        const rid = safeId(fail.anthropicRequestId);
        if (rid) lastError.anthropicRequestId = rid;
        tx.update(aiRef, { state: ai.generated ? 'ready' : 'failed', lastError, job: idleJob, updatedAt: ts, updatedBy: 'server' });
        writeUsage(tx, uSnap, { cost: spentMicroUsd });
        return 'failed' as const;
      }
      // internal へ反映するか（sec L-5: 依頼時の editSeq と同じときだけ。none なら作る）
      const r = result.result;
      const base = job.baseEditSeq;
      const summary = p?.sitemap;
      const cur = iSnap.data();
      const name = typeof accSnap?.data()?.name === 'string' ? (accSnap?.data()?.name as string) : '';
      const by = typeof job.by === 'string' ? job.by : 'server';
      const reqRevision = job.reqRevision as number;
      let applied = false;
      if (base === null || base === undefined) {
        if ((summary === undefined || summary === null) && !iSnap.exists) {
          tx.create(iRef, {
            schemaVersion: 1, before: before2, after: after2, origin: 'ai', sourceReqRevision: reqRevision, aiRequestId: requestId,
            editSeq: 0, updatedAt: ts, updatedBy: by, savedByName: name,
          });
          tx.update(pRef, { sitemap: { status: 'draft', revision: 0 }, updatedAt: ts, updatedBy: by });
          applied = true;
        }
      } else if (summary?.status === 'draft' && iSnap.exists && cur?.editSeq === base) {
        tx.update(iRef, {
          before: before2, after: after2, origin: 'ai', sourceReqRevision: reqRevision, aiRequestId: requestId,
          editSeq: (base as number) + 1, updatedAt: ts, updatedBy: by, savedByName: name,
        });
        applied = true;
      }
      const generated = {
        schemaVersion: 1,
        before: before2,
        after: after2,
        summary: r.summary,
        openQuestions: r.openQuestions,
        beforeSource: r.beforeSource,
        siteFetch: nav.siteFetch,
        notes: r.notes,
        flags: r.flags,
        origin: { kind: 'ai', promptVersion: generator.config.promptVersion, model: generator.model },
        reqDocRevision: reqRevision,
        applied,
      };
      tx.update(aiRef, {
        state: 'ready', generated, generatedAt: ts, inputHash, configHash: cHash, usage: result.usage,
        job: idleJob, lastError: FieldValue.delete(), updatedAt: ts, updatedBy: 'server',
      });
      writeUsage(tx, uSnap, { cost: spentMicroUsd });
      return applied ? 'ready' as const : 'kept' as const;
    });

    // 本文は出さない（件数・種別・トークン・費用だけ）
    const fields: Record<string, unknown> = { beforeSource: before.source, siteFetch: nav.siteFetch, costMicroUsd: spentMicroUsd };
    if (typeof result.durationMs === 'number') fields.aiDurationMs = result.durationMs;
    if (result.usage) Object.assign(fields, { input: result.usage.input, output: result.usage.output, cacheRead: result.usage.cacheRead });
    if (result.ok) Object.assign(fields, { pagesRaw: result.result.stats.pagesRaw, pagesKept: result.result.stats.pagesKept, drop: result.result.stats.drop });
    else Object.assign(fields, { errorCode: `ai-${result.code}`, httpStatus: result.httpStatus });
    const rid = safeId(result.anthropicRequestId);
    if (rid) fields.anthropicRequestId = rid;
    log(outcome === 'ready' || outcome === 'kept' ? 'info' : 'warn', outcome, fields);
    return outcome;
  } catch (e) {
    // 想定外（Firestore の失敗など）。AI を呼ぶ前なら返金、呼んだ後なら費用を足し lastError（job は idle）
    log('error', 'error', { errorCode: errorCodeOf(e), aiCalled });
    try {
      if (!aiCalled) return await refundWith('ai-internal', 'error');
      await db.runTransaction(async (tx) => {
        const uRef = myDay ? usageRef(db, myDay) : null;
        const [s, uSnap] = await Promise.all([tx.get(aiRef), uRef ? tx.get(uRef) : Promise.resolve(null)]);
        writeUsage(tx, uSnap, { cost: spentMicroUsd });
        const ai = s.data();
        const job = (isObj(ai?.job) ? ai.job : {}) as Record<string, unknown>;
        if (!ai || !mine(job, requestId)) return;
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
