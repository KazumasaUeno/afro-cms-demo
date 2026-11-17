import type { ApprovalKey, DemoState, ISODate } from '@/types';
import { QUALITY_ITEMS } from '@/data/quality';

// 承認の依頼の記録（ProjectWork.approvalRequests）にも使うので、型は types に置いた（2026-11-17）
export type { ApprovalKey } from '@/types';
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
  /** アフロがお客様へ承認を依頼した日時（2026-11-17 会議。無ければ未依頼） */
  requestedAt?: ISODate;
  /** 前の節目が終わり、アフロの依頼を待っている（locked のうち。依頼すれば waiting になる） */
  awaitingRequest?: boolean;
  /** 品質確認だけは件数で進む */
  progress?: { done: number; total: number };
}

/** 依頼の前の節目の理由（2026-11-17 会議） */
export const PREPARING = 'アフロが準備中です。準備ができると承認のお願いが届きます。';

/**
 * お客様が承認する 4 つの節目（資料: 要件定義書 → サイトマップ → トップデザイン → 品質チェック）。
 * 状態は store の既存の値から導く（ポータル専用の状態は持たない）。
 * ウォーターフォールなので、前の節目が終わるまで次は locked（お客様の確認待ちにしない）。
 * 前の節目が終わっても、アフロが承認を依頼するまでは locked（2026-11-17 会議「アフロの準備ができる前に承認待ちになる」。
 * 以前は要件定義書の承認と同時にサイトマップが承認待ちになっていた）。理由は PREPARING の文言
 */
export function approvalSteps(state: DemoState): ApprovalStep[] {
  const req = state.requirements;
  const clientDone = QUALITY_ITEMS.filter((i) => !!state.qualityChecks[i.id]?.clientAt).length;
  const total = QUALITY_ITEMS.length;
  const requests = state.approvalRequests ?? {};
  // 依頼が無い「承認待ち」は「準備中」にする（承認済みはそのまま）
  const gate = (step: ApprovalStep): ApprovalStep => {
    const requestedAt = requests[step.key];
    if (step.status !== 'waiting') return requestedAt ? { ...step, requestedAt } : step;
    return requestedAt ? { ...step, requestedAt } : { ...step, status: 'locked', lockedReason: PREPARING, awaitingRequest: true };
  };
  const steps: ApprovalStep[] = [
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
      key: 'design', no: 3, title: 'トップデザイン', ask: 'ページごとに 2 つの案を比べて、採用するデザインを選んでください',
      status: state.design.approvedAt ? 'approved' : state.sitemap.approvedAt ? 'waiting' : 'locked', approvedAt: state.design.approvedAt,
      lockedReason: 'サイトマップの承認のあとに、アフロがデザイン案を作成します。',
    },
    {
      key: 'quality', no: 4, title: '品質チェック', ask: '公開前の確認項目をチェックしてください',
      // 承認済みはお客様が「完了」を押したとき（0.39.7。全項目にチェックしただけでは承認にしない）
      status: state.design.qualityApprovedAt ? 'approved' : state.design.buildCompletedAt ? 'waiting' : 'locked',
      lockedReason: '全ページの構築が終わると、公開前の確認をお願いします。',
      approvedAt: state.design.qualityApprovedAt,
      progress: { done: clientDone, total },
    },
  ];
  return steps.map(gate);
}

/** 節目が「アフロの依頼を待っている」（前の節目が終わり、まだ依頼していない）か。承認を依頼するボタンを出す条件 */
export function canRequestApproval(state: DemoState, key: ApprovalKey): boolean {
  return !!approvalSteps(state).find((s) => s.key === key)?.awaitingRequest;
}
