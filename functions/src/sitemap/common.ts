/**
 * サイトマップの callable の共通部品（LIVE_SITEMAP_IMPL_PLAN §3・§4 U-F1、LIVE_SITEMAP_DATA §2・§3.2）。
 * - 失敗は HttpsError のコードと details だけで伝える（details は {reason} か {field, nodeId?, code, count?}。入力の文字列を入れない＝sec M-6）
 * - 入力は厳格（未知キーは invalid-argument。キー名も入力なので details に載せない＝field は固定の 'input'。sec L-1）
 * - 認可は TX の中で読んだ案件のスナップショットに当てる（sec M-1）。resolveCaller（accounts）は TX の外で可
 */
import type { DocumentSnapshot, Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/https';
import { assertCanEdit, type Caller, type ProjectLike } from '../ai/authz';
import { jobRunning } from '../ai/request';
import type { AiLogger } from '../ai/log';

export interface SitemapDeps {
  db: Firestore;
  now: () => number;
  log: AiLogger;
}

export type SitemapReason = 'req-not-approved' | 'schedule-not-approved' | 'state' | 'job-running' | 'archived' | 'revision-limit';

export const PROJECT_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
/** 版の上限（DATA §2.1。要約の revision ≦ 50） */
export const SITEMAP_MAX_REVISION = 50;

export const projectRef = (db: Firestore, pid: string) => db.doc(`projects/${pid}`);
export const internalRef = (db: Firestore, pid: string) => db.doc(`projects/${pid}/sitemap/internal`);
export const versionRef = (db: Firestore, pid: string, rev: number) => db.doc(`projects/${pid}/sitemapVersions/r${rev}`);
export const sitemapApprovalId = (rev: number, action: 'submit') => `sitemap-r${rev}-${action}`;
export const approvalRef = (db: Firestore, pid: string, id: string) => db.doc(`projects/${pid}/approvals/${id}`);
/** AI のジョブ文書（U-F2 が書く。ここは job の running を読むだけ） */
export const sitemapAiDraftRef = (db: Firestore, pid: string) => db.doc(`projects/${pid}/aiDrafts/sitemap`);

/* ---------- 失敗（コードと details だけ） ---------- */

export const precondition = (reason: SitemapReason) => new HttpsError('failed-precondition', reason, { reason });
export const conflict = () => new HttpsError('aborted', 'conflict', { reason: 'conflict' });

/** 指摘（validateSitemapDoc の SitemapIssue と同じ形。code は固定の種別） */
export interface Issue { field: string; nodeId?: string; code: string; count?: number }

/** 入力・検査の失敗。details は先頭の指摘の {field, nodeId?, code} と指摘の件数 count だけ */
export function invalid(issues: readonly Issue[] | Issue): HttpsError {
  const list: readonly Issue[] = Array.isArray(issues) ? issues : [issues as Issue];
  const first = list[0] ?? { field: 'input', code: 'shape' };
  return new HttpsError('invalid-argument', 'invalid', {
    field: first.field,
    ...(first.nodeId ? { nodeId: first.nodeId } : {}),
    code: first.code,
    count: list.length,
  });
}
const badInput = (code: string) => invalid({ field: 'input', code });

/* ---------- 入力（sec L-1） ---------- */

export type Obj = Record<string, unknown>;
export const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** 入力を許可したキーだけに限る（未知キー・必須の欠け → invalid-argument。キー名は details に出さない） */
export function strictInput(data: unknown, allowed: readonly string[], required: readonly string[]): Obj {
  if (!isObj(data)) throw badInput('shape');
  if (!Object.keys(data).every((k) => allowed.includes(k))) throw badInput('unknown_key');
  if (!required.every((k) => k in data)) throw badInput('required');
  return data;
}

export function projectIdOf(d: Obj): string {
  const v = d.projectId;
  if (typeof v !== 'string' || !PROJECT_ID_RE.test(v)) throw invalid({ field: 'projectId', code: 'shape' });
  return v;
}

/** 0 以上の整数（baseEditSeq・expectRevision） */
export function seqOf(d: Obj, field: string): number {
  const v = d[field];
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) throw invalid({ field, code: 'shape' });
  return v;
}

/* ---------- TX の中の前提（S-3・S-9） ---------- */

export interface SitemapSummary {
  status?: unknown;
  revision?: unknown;
  contentHash?: unknown;
  [k: string]: unknown;
}
export interface SitemapProject extends ProjectLike {
  requirements?: { status?: unknown; revision?: unknown } | null;
  schedule?: { approvedRevision?: unknown } | null;
  sitemap?: SitemapSummary | null;
}

/**
 * TX で読んだ案件・アカウントに対して、役割（admin・担当の開発者）・archived・要件定義書 approved・AI 実行中でないことを確かめる。
 * 返り値は案件のデータと、お客様に出す名前（accounts.name）
 */
export function assertWritable(caller: Caller, pSnap: DocumentSnapshot, accSnap: DocumentSnapshot, aiSnap: DocumentSnapshot, nowMs: number): { p: SitemapProject; name: string } {
  const p = pSnap.data() as SitemapProject | undefined;
  try {
    assertCanEdit(caller, p);
  } catch (e) {
    if (e instanceof HttpsError && e.code === 'failed-precondition') throw precondition('archived');
    throw e;
  }
  // TX 外の resolveCaller の後にアカウントが無効化された場合も通さない
  const a = accSnap.data();
  if (!accSnap.exists || !a || a.status !== 'active' || a.role !== caller.role) throw new HttpsError('permission-denied', 'not allowed');
  const project = p as SitemapProject;
  if (project.requirements?.status !== 'approved') throw precondition('req-not-approved');
  if (aiSnap.exists && jobRunning(aiSnap.data()?.job, nowMs)) throw precondition('job-running');
  return { p: project, name: typeof a.name === 'string' ? a.name : '' };
}

/** ログに出す失敗の種別（コードと details の種別だけ。message・入力は出さない） */
export function failureFields(e: unknown): Record<string, unknown> {
  if (!(e instanceof HttpsError)) return {};
  const d = isObj(e.details) ? e.details : {};
  const pick = (k: string) => (typeof d[k] === 'string' || typeof d[k] === 'number' ? { [k]: d[k] } : {});
  return { ...pick('reason'), ...pick('field'), ...pick('code'), ...pick('count') };
}
