import type { DocumentData, DocumentSnapshot, QueryDocumentSnapshot } from 'firebase/firestore';
import type { AnswerMeta, AnswerValue, ApprovalLog, ClientAccount, DevUser, Project, Proposal, ProposalPoint, RequirementSession, Stage } from '@/types';

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
}

export function projectDoc(s: Snap): ProjectDoc {
  const d = read(s);
  const r = (d.requirements ?? {}) as DocumentData;
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
    updatedAt: toIso(d.updatedAt) ?? new Date(0).toISOString(),
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
  proposal?: Proposal;
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
    proposal: d.proposal && typeof d.proposal === 'object' ? (d.proposal as Proposal) : undefined,
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

/** 保存する提案（validProposal と同じ形だけ。点数は number に、項目は決めたキーだけにする。M-11） */
export function proposalForSave(p: Proposal): Proposal {
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
