import type { DemoState, ISODate } from '@/types';
import { QUALITY_ITEMS } from '@/data/quality';
import { modeOf, pendingConfirmations, questionsFor } from '@/features/requirements/assignment';
import { isAnswered } from '@/features/requirements/validation';

export type ApprovalKey = 'requirements' | 'sitemap' | 'design' | 'quality';
export type ApprovalStatus = 'locked' | 'waiting' | 'approved';

export interface ApprovalStep {
  key: ApprovalKey;
  no: number;
  title: string;
  /** お客様にお願いすること */
  ask: string;
  status: ApprovalStatus;
  approvedAt?: ISODate;
  /** locked のときの理由 */
  lockedReason?: string;
  /** 品質確認だけは件数で進む */
  progress?: { done: number; total: number };
}

/** お客様ポータルのヒアリングで、お客様にお願いしていること（回答の受付中だけ） */
export function hearingTodo(state: DemoState): { unanswered: number; toConfirm: number } {
  const req = state.requirements;
  if (req.status !== 'draft') return { unanswered: 0, toConfirm: pendingConfirmations(req, 'client').length };
  return {
    unanswered: questionsFor(req, 'client').filter((q) => !isAnswered(req.answers[q.id])).length,
    toConfirm: pendingConfirmations(req, 'client').length,
  };
}

/**
 * お客様が承認する 4 つの節目（資料: 要件定義書 → サイトマップ → トップデザイン → 品質チェック）。
 * 状態は store の既存の値から導く（ポータル専用の状態は持たない）。
 */
export function approvalSteps(state: DemoState): ApprovalStep[] {
  const req = state.requirements;
  const clientDone = QUALITY_ITEMS.filter((i) => !!state.qualityChecks[i.id]?.clientAt).length;
  const total = QUALITY_ITEMS.length;
  const lastClientAt = QUALITY_ITEMS.map((i) => state.qualityChecks[i.id]?.clientAt).filter(Boolean).sort().pop();
  return [
    {
      key: 'requirements', no: 1, title: '要件定義書', ask: '改善提案と要件の内容をご確認ください',
      status: req.status === 'approved' ? 'approved' : req.status === 'analyzed' ? 'waiting' : 'locked',
      approvedAt: req.approvedAt,
      lockedReason: modeOf(req) === 'afro'
        ? 'アフロがヒアリング内容を入力・分析しています。要件定義書ができると、ここで確認できます。'
        : '「ヒアリング」の回答をもとに、アフロが要件定義書を作成します。できあがると、ここで確認できます。',
    },
    {
      key: 'sitemap', no: 2, title: 'サイトマップ', ask: 'リニューアル後のページ構成をご確認ください',
      status: state.sitemap.approvedAt ? 'approved' : 'waiting', approvedAt: state.sitemap.approvedAt,
    },
    {
      key: 'design', no: 3, title: 'トップデザイン', ask: '3 つの案から採用するデザインを選んでください',
      status: state.design.approvedAt ? 'approved' : 'waiting', approvedAt: state.design.approvedAt,
    },
    {
      key: 'quality', no: 4, title: '品質チェック', ask: '公開前の確認項目をチェックしてください',
      status: clientDone === total ? 'approved' : 'waiting',
      approvedAt: clientDone === total ? lastClientAt : undefined,
      progress: { done: clientDone, total },
    },
  ];
}
