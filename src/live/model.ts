import type { DocumentData, DocumentSnapshot, QueryDocumentSnapshot } from 'firebase/firestore';
import type { AnswerMeta, AnswerValue, ApprovalLog, ClientAccount, DevUser, Project, Proposal, ProposalPoint, RequirementSession, Stage } from '@/types';
import { isProposalV2, isProposalV3, type ProposalV2, type ProposalV3, type StoredProposal } from '@/types/aiDraft';

/**
 * Firestore の文書（BACKEND_FIREBASE §5）⇔ 画面の型（types/index.ts）。日時は Timestamp → ISO 文字列。
 * 保存しない値（stage・progress・nextAction・pendingApprovals）は requirements.status から導く（§5.7）
 */

type Snap = DocumentSnapshot<DocumentData> | QueryDocumentSnapshot<DocumentData>;
export type ReqStatus = 'draft' | 'analyzed' | 'approved';

/** 書き込み直後のローカルの値（serverTimestamp 未確定）は端末の推定時刻にする */
const read = (s: Snap): DocumentData => s.data({ serverTimestamps: 'estimate' }) ?? {};

export function toIso(v: unknown): string | undefined {
  if (v && typeof v === 'object' && 'toDate' in v && typeof (v as { toDate: unknown }).toDate === 'function') {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  return undefined;
}

/** Timestamp を中まで ISO 文字列へ（aiDrafts の文書。aiDraftState.ts は ISO を前提にする。U4b） */
export function deepIso(v: unknown): unknown {
  if (v && typeof v === 'object') {
    const iso = toIso(v);
    if (iso !== undefined) return iso;
    if (Array.isArray(v)) return v.map(deepIso);
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = deepIso(x);
    return out;
  }
  return v;
}

export interface ProjectDoc {
  id: string;
  clientName: string;
  siteName: string;
  siteUrl: string;
  industry: string;
  accent: string;
  launchDate?: string;
  ownerUid: string;
  memberUids: string[];
  requirements: { status: ReqStatus; revision: number; analyzedAt?: string; approvedAt?: string; approvedBy?: string; approvalId?: string };
  archived: boolean;
  updatedAt: string;
  /** 相談の要約（最後の 1 件の写し。無い案件は相談なし＝null。Migration 不要。LIVE_DASHBOARD_TASKS_CONSULT §2.2） */
  consult: ConsultSummary | null;
}

/** projects/{pid}.consult（messages の最後の 1 件の写し。firestore.rules consultOk がメッセージと同じ書き込みでだけ許す） */
export interface ConsultSummary {
  count: number;
  lastAt: string;
  lastSide: 'client' | 'afro';
  lastName: string;
}

/**
 * 案件の consult（相談の要約）。lastAt は read() の serverTimestamps: 'estimate' で、送った直後（サーバーの時刻が未確定）も端末の推定時刻になる。
 * それでも読めない値（壊れた・欠けた）は fallbackAt（案件の updatedAt）にする（1970 年にすると一覧の並び・「○分前」が壊れる。U3 レビュー #2）
 */
export function consultOf(v: unknown, fallbackAt?: string): ConsultSummary | null {
  if (!v || typeof v !== 'object') return null;
  const c = v as DocumentData;
  if (typeof c.count !== 'number' || c.count < 1) return null;
  return {
    count: c.count,
    lastAt: toIso(c.lastAt) ?? fallbackAt ?? new Date(0).toISOString(),
    lastSide: c.lastSide === 'client' ? 'client' : 'afro',
    lastName: String(c.lastName ?? ''),
  };
}

export function projectDoc(s: Snap): ProjectDoc {
  const d = read(s);
  const r = (d.requirements ?? {}) as DocumentData;
  const updatedAt = toIso(d.updatedAt) ?? new Date(0).toISOString();
  return {
    id: s.id,
    clientName: String(d.clientName ?? ''),
    siteName: String(d.siteName ?? ''),
    siteUrl: String(d.siteUrl ?? ''),
    industry: String(d.industry ?? ''),
    accent: String(d.accent ?? ''),
    launchDate: toIso(d.launchDate),
    ownerUid: String(d.ownerUid ?? ''),
    memberUids: Array.isArray(d.memberUids) ? d.memberUids.map(String) : [],
    requirements: {
      status: r.status === 'analyzed' || r.status === 'approved' ? r.status : 'draft',
      revision: typeof r.revision === 'number' ? r.revision : 0,
      analyzedAt: toIso(r.analyzedAt),
      approvedAt: toIso(r.approvedAt),
      approvedBy: typeof r.approvedBy === 'string' ? r.approvedBy : undefined,
      approvalId: typeof r.approvalId === 'string' ? r.approvalId : undefined,
    },
    archived: d.archived === true,
    updatedAt,
    consult: consultOf(d.consult, updatedAt),
  };
}

const STAGE: Record<ReqStatus, { stage: Stage; progress: number; next: string; pending: number }> = {
  draft: { stage: 'hearing', progress: 5, next: 'ヒアリングを入力する', pending: 0 },
  analyzed: { stage: 'requirements', progress: 15, next: 'お客様の承認を待つ', pending: 1 },
  approved: { stage: 'requirements', progress: 25, next: '要件定義書 承認済み', pending: 0 },
};

export function toProject(p: ProjectDoc): Project {
  const s = STAGE[p.requirements.status];
  return {
    id: p.id, clientName: p.clientName, siteName: p.siteName, siteUrl: p.siteUrl, industry: p.industry,
    stage: s.stage, progress: s.progress, ownerId: p.ownerUid, updatedAt: p.updatedAt, nextAction: s.next,
    accent: p.accent, ...(p.launchDate ? { launchDate: p.launchDate } : {}), pendingApprovals: s.pending,
  };
}

export interface ReqDoc {
  answers: Record<string, AnswerValue>;
  answerMeta: Record<string, AnswerMeta>;
  proposal?: StoredProposal;
  proposalRevision?: number;
}

export function reqDoc(s: Snap): ReqDoc {
  const d = read(s);
  const answers: Record<string, AnswerValue> = {};
  for (const [k, v] of Object.entries((d.answers ?? {}) as Record<string, unknown>)) {
    if (typeof v === 'string') answers[k] = v;
    else if (Array.isArray(v)) answers[k] = v.map(String);
  }
  const answerMeta: Record<string, AnswerMeta> = {};
  for (const [k, v] of Object.entries((d.answerMeta ?? {}) as Record<string, DocumentData>)) {
    answerMeta[k] = { by: v?.by === 'client' ? 'client' : 'afro', at: toIso(v?.at) ?? new Date().toISOString() };
  }
  return {
    answers,
    answerMeta,
    // 版で分ける（version を持たない = v1、version == 2 = v2。それ以外の版は読まない＝回答から作る）
    proposal: storedProposalOf(d.proposal),
    proposalRevision: typeof d.proposalRevision === 'number' ? d.proposalRevision : undefined,
  };
}

export function toSession(projectId: string, p: ProjectDoc | null, r: ReqDoc | null, overlay?: Record<string, AnswerValue>): RequirementSession {
  const answers = { ...(r?.answers ?? {}), ...(overlay ?? {}) };
  const comp = answers['q-competitor'];
  // 承認依頼の後の要件定義書は、そのとき保存した提案（承認の対象と同じ写し）だけを見せる
  const fixed = p && p.requirements.status !== 'draft' && r?.proposalRevision === p.requirements.revision ? r.proposal : undefined;
  return {
    projectId,
    answers,
    competitors: Array.isArray(comp) ? comp : [],
    status: p?.requirements.status ?? 'draft',
    mode: 'afro',
    answerMeta: r?.answerMeta ?? {},
    analyzedAt: p?.requirements.analyzedAt,
    approvedAt: p?.requirements.approvedAt,
    ...(fixed ? { proposal: fixed } : {}),
  };
}

/** 保存された提案の版を見分ける（Rules の validStoredProposal と同じ分け方） */
export function storedProposalOf(v: unknown): StoredProposal | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  if (!('version' in v)) return v as Proposal;
  // v3 を先に見る（U4。v3 → v2 → v1）
  if (isProposalV3(v)) return v as ProposalV3;
  return isProposalV2(v as StoredProposal) ? (v as ProposalV2) : undefined;
}

/**
 * v3 の提案（会社標準ひな型）。generated のサーバー欄・template（flags を除く）＋ edited の summary・points・doc を値を変えずに写す。
 * TODO(U3): firestore.rules の validStoredProposal が v3 を受け付けるのは U3（別担当）。それまで live の提出は Rules で拒否されうる
 */
export function proposalV3FromDraft(g: DocumentData, e: DocumentData): ProposalV3 {
  return {
    version: 3, template: g.template, hostname: g.hostname, issue: g.issue, purposes: g.purposes, improves: g.improves,
    competitors: g.competitors, siteCheck: g.siteCheck, origin: g.origin,
    summary: e.summary, points: e.points, doc: e.doc,
  } as ProposalV3;
}

/**
 * v2 の提案（firestore.rules proposalV2Ok と同じ 11 キー）。generated のサーバー欄（flags を除く）＋ edited の 3 欄を**値を変えずに**写す
 * （Rules はマップの等式で比べるので、切り詰め・並べ替え・型の変換をしない。Timestamp 等もそのまま渡す）
 */
export function proposalV2FromDraft(g: DocumentData, e: DocumentData): ProposalV2 {
  return {
    version: 2, hostname: g.hostname, issue: g.issue, purposes: g.purposes, improves: g.improves,
    competitors: g.competitors, siteCheck: g.siteCheck, origin: g.origin,
    summary: e.summary, points: e.points, draft: e.draft,
  } as ProposalV2;
}

/** 保存する提案。v1 は validProposal と同じ形だけ（点数は number に、項目は決めたキーだけ。M-11）。v2 は 11 キーだけを写す（flags は落ちる） */
export function proposalForSave(p: Proposal): Proposal;
export function proposalForSave(p: ProposalV2): ProposalV2;
export function proposalForSave(p: StoredProposal): StoredProposal;
export function proposalForSave(p: StoredProposal): StoredProposal {
  if (isProposalV3(p)) return proposalV3FromDraft(p, p);
  if (isProposalV2(p)) return proposalV2FromDraft(p, p);
  return proposalV1ForSave(p);
}

function proposalV1ForSave(p: Proposal): Proposal {
  const point = (x: ProposalPoint): ProposalPoint => ({
    id: String(x.id).slice(0, 40), title: String(x.title).slice(0, 80), detail: String(x.detail).slice(0, 600),
    priority: x.priority, impact: String(x.impact).slice(0, 200), area: String(x.area).slice(0, 40),
  });
  const score = (n: number) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
  return {
    hostname: String(p.hostname).slice(0, 253) || 'your-site.example.jp',
    issue: String(p.issue).slice(0, 600),
    purposes: [...new Set(p.purposes)],
    improves: [...new Set(p.improves)],
    competitors: p.competitors.slice(0, 3).map((c) => String(c).slice(0, 253)).filter(Boolean),
    currentScore: score(p.currentScore),
    projectedScore: score(p.projectedScore),
    points: p.points.slice(0, 6).map(point),
  };
}

const ACTION: Record<string, string> = { submit: '要件定義書の確認を依頼', approve: '要件定義書を承認', withdraw: '確認依頼を差し戻し' };

export function toApprovalLog(projectId: string, s: Snap): ApprovalLog {
  const d = read(s);
  const action = String(d.action ?? '');
  return {
    id: s.id,
    at: toIso(d.at) ?? new Date().toISOString(),
    actor: String(d.actorName ?? ''),
    side: d.side === 'client' ? 'client' : 'afro',
    action: ACTION[action] ?? action,
    target: `要件定義（第${Number(d.revision) || 0}版）`,
    projectId,
  };
}

/** 招待中だけの人の id（accounts の uid とぶつからない形） */
export const INVITE_PREFIX = 'invite:';

/** 一覧の購読の上限（案件・承認履歴・ユーザー。repositories.tsx。案件一覧が上限に達したら画面で注記する＝dashboard.ts listLimitNote） */
export const LIST_LIMIT = 500;

/** 1 案件の担当の開発者の上限（firestore.rules の projUpdateOk・adminMembersOk と同じ 20） */
export const MAX_MEMBERS = 20;

export function clientFromAccount(s: Snap): ClientAccount {
  const d = read(s);
  return {
    id: s.id, company: String(d.company ?? ''), name: String(d.name ?? ''), email: String(d.email ?? ''), projectId: String(d.projectId ?? ''),
    status: d.status === 'disabled' ? 'disabled' : 'active', createdAt: toIso(d.activatedAt) ?? '', activatedAt: toIso(d.activatedAt), disabledAt: toIso(d.disabledAt),
  };
}

export function clientFromInvite(s: Snap): ClientAccount {
  const d = read(s);
  return {
    id: INVITE_PREFIX + s.id, company: String(d.company ?? ''), name: String(d.name ?? ''), email: s.id, projectId: String(d.projectId ?? ''),
    status: 'invited', createdAt: toIso(d.createdAt) ?? '',
  };
}

export function devFromAccount(s: Snap): DevUser {
  const d = read(s);
  return {
    id: s.id, name: String(d.name ?? ''), role: String(d.devRole ?? ''), email: String(d.email ?? ''),
    affiliation: d.affiliation === 'internal' ? 'internal' : 'partner',
    ...(typeof d.partnerCompany === 'string' ? { partnerCompany: d.partnerCompany } : {}),
    status: d.status === 'disabled' ? 'disabled' : 'active', createdAt: toIso(d.activatedAt) ?? '', disabledAt: toIso(d.disabledAt),
  };
}

/** 招待中の開発者（まだログインできない。一覧では招待中として出す） */
export function devFromInvite(s: Snap): DevUser {
  const d = read(s);
  return {
    id: INVITE_PREFIX + s.id, name: String(d.name ?? ''), role: String(d.devRole ?? ''), email: s.id,
    affiliation: d.affiliation === 'internal' ? 'internal' : 'partner',
    ...(typeof d.partnerCompany === 'string' ? { partnerCompany: d.partnerCompany } : {}),
    status: 'active', createdAt: toIso(d.createdAt) ?? '',
  };
}

export type TaskStatus = 'todo' | 'doing' | 'review' | 'done';
const TASK_STATUS_SET: readonly TaskStatus[] = ['todo', 'doing', 'review', 'done'];

/** 構築タスク（projects/{pid}/tasks/{tid}。docs/design/LIVE_DASHBOARD_TASKS_CONSULT.md §2.1）。主担当は持たない（assigneeUids[0]） */
export interface TaskDoc {
  id: string;
  title: string;
  page: string;
  assigneeUids: string[];
  status: TaskStatus;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export function taskDoc(s: Snap): TaskDoc {
  const d = read(s);
  const status = TASK_STATUS_SET.includes(d.status) ? (d.status as TaskStatus) : 'todo';
  const epoch = new Date(0).toISOString();
  return {
    id: s.id,
    title: String(d.title ?? ''),
    page: String(d.page ?? ''),
    assigneeUids: Array.isArray(d.assigneeUids) ? d.assigneeUids.map(String) : [],
    status,
    createdAt: toIso(d.createdAt) ?? epoch,
    createdBy: String(d.createdBy ?? ''),
    updatedAt: toIso(d.updatedAt) ?? toIso(d.createdAt) ?? epoch,
    updatedBy: String(d.updatedBy ?? ''),
  };
}

/** 相談のメッセージ（projects/{pid}/messages/{seq 6 桁}。docs/design/LIVE_DASHBOARD_TASKS_CONSULT.md §2.2）。編集・削除なし */
export interface MessageDoc {
  id: string;
  seq: number;
  text: string;
  side: 'client' | 'afro';
  authorUid: string;
  authorName: string;
  at: string;
}

export function messageDoc(s: Snap): MessageDoc {
  const d = read(s);
  return {
    id: s.id,
    seq: typeof d.seq === 'number' ? d.seq : 0,
    text: String(d.text ?? ''),
    side: d.side === 'client' ? 'client' : 'afro',
    authorUid: String(d.authorUid ?? ''),
    authorName: String(d.authorName ?? ''),
    at: toIso(d.at) ?? new Date().toISOString(),
  };
}
