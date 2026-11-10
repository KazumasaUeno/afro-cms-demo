import type { DemoState, ISODate } from '@/types';
import { ACTOR, APPROVE_TEXT } from '@/store/reducer';
import { approvalSteps, hearingTodo, type ApprovalKey, type ApprovalStatus } from '@/features/portal/portalSteps';
import { MODE_LABEL, modeOf, pendingConfirmations, questionsFor } from '@/features/requirements/assignment';
import { isAnswered } from '@/features/requirements/validation';
import { clientTodos } from '@/features/portal/assistant/answers';

/**
 * 管理者画面の「お客様の対応状況」。お客様ポータルと同じ値（portalSteps）から導く（専用の状態は持たない）。
 * デモのデータは MINAMO COFFEE の 1 案件分だけ。
 */

export interface ClientApprovalRow {
  key: ApprovalKey;
  title: string;
  status: ApprovalStatus;
  approvedAt?: ISODate;
  /** 承認した人（アクティビティに残っているときだけ）。アフロが代わりに承認したかどうか */
  byAfro?: boolean;
  progress?: { done: number; total: number };
  /** locked のときの理由 */
  lockedReason?: string;
  /** 管理者画面で開く先 */
  to: string;
}

export interface ClientStatus {
  hearing: {
    modeLabel: string;
    /** 回答の受付中か（AI 分析後は締め切り） */
    open: boolean;
    clientAnswered: number;
    clientTotal: number;
    unanswered: number;
    /** アフロの代理入力をお客様が確認していない数 */
    clientToConfirm: number;
    /** お客様の代理入力をアフロが確認していない数 */
    afroToConfirm: number;
  };
  approvals: ClientApprovalRow[];
  /** お客様の公開承認を待っているページ・お知らせ */
  publishWaiting: number;
  /** お客様にお願いしていて、まだのこと（ヒアリングは 1 件。ポータルのホームと同じ数え方） */
  waitingCount: number;
  /** お客様が最後に操作した日時 */
  lastClientAt?: ISODate;
}

const ADMIN_ROUTE: Record<ApprovalKey, string> = {
  requirements: '/ai-studio', sitemap: '/site', design: '/ai-studio/design', quality: '/quality',
};

export function clientStatus(state: DemoState): ClientStatus {
  const req = state.requirements;
  const clientQs = questionsFor(req, 'client');
  const h = hearingTodo(state);
  const approvals = approvalSteps(state).map((s): ClientApprovalRow => {
    const text = s.key === 'quality' ? undefined : APPROVE_TEXT[s.key];
    // 新しい順なので、承認し直した場合も最新の承認が見つかる（記録が古くて残っていなければ承認した人は出さない）
    const act = s.status === 'approved' && text
      ? state.activities.find((a) => a.kind === 'approve' && a.text === text && a.projectId === req.projectId)
      : undefined;
    return {
      key: s.key, title: s.title, status: s.status, approvedAt: s.approvedAt, progress: s.progress, lockedReason: s.lockedReason, to: ADMIN_ROUTE[s.key],
      byAfro: act ? act.actor !== ACTOR.client : undefined,
    };
  });
  const publishWaiting = state.pages.filter((p) => p.status === 'review').length;
  const lastClient = state.activities.find((a) => a.actor === ACTOR.client)?.at;
  const lastLog = state.approvalLogs.find((l) => l.side === 'client' && l.actor === ACTOR.client)?.at;
  return {
    hearing: {
      modeLabel: MODE_LABEL[modeOf(req)].label,
      open: req.status === 'draft',
      clientAnswered: clientQs.filter((q) => isAnswered(req.answers[q.id])).length,
      clientTotal: clientQs.length,
      unanswered: h.unanswered,
      clientToConfirm: h.toConfirm,
      afroToConfirm: pendingConfirmations(req, 'afro').length,
    },
    approvals,
    publishWaiting,
    waitingCount: clientTodos(state).length,
    lastClientAt: [lastClient, lastLog].filter((v): v is string => !!v).sort().pop(),
  };
}
