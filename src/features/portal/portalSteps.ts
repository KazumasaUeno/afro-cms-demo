import type { DemoState, ISODate } from '@/types';
import { QUALITY_ITEMS } from '@/data/quality';

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

/**
 * お客様が承認する 4 つの節目（資料: 要件定義書 → サイトマップ → トップデザイン → 品質チェック）。
 * 状態は store の既存の値から導く（ポータル専用の状態は持たない）。
 * ウォーターフォールなので、前の節目が終わるまで次は locked（お客様の確認待ちにしない）。
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
      // 受託開発ではアフロがヒアリングして入力する（お客様の入力はない。2026-11-10 決定）
      lockedReason: 'アフロがヒアリングの内容をもとに要件定義書を作成しています。できあがると、ここで内容の確認と承認をお願いします。',
    },
    {
      key: 'sitemap', no: 2, title: 'サイトマップ', ask: 'リニューアル後のページ構成をご確認ください',
      status: state.sitemap.approvedAt ? 'approved' : req.status === 'approved' ? 'waiting' : 'locked', approvedAt: state.sitemap.approvedAt,
      lockedReason: '要件定義書の承認のあとに、アフロがサイトマップを作成します。',
    },
    {
      key: 'design', no: 3, title: 'トップデザイン', ask: '3 つの案から採用するデザインを選んでください',
      status: state.design.approvedAt ? 'approved' : state.sitemap.approvedAt ? 'waiting' : 'locked', approvedAt: state.design.approvedAt,
      lockedReason: 'サイトマップの承認のあとに、アフロがデザイン案を作成します。',
    },
    {
      key: 'quality', no: 4, title: '品質チェック', ask: '公開前の確認項目をチェックしてください',
      status: clientDone === total ? 'approved' : state.design.buildCompletedAt ? 'waiting' : 'locked',
      lockedReason: '全ページの構築が終わると、公開前の確認をお願いします。',
      approvedAt: clientDone === total ? lastClientAt : undefined,
      progress: { done: clientDone, total },
    },
  ];
}
