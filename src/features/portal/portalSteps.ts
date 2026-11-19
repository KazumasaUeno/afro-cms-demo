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
  const appr = stageApprovals(state);
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
      key: 'schedule', no: 2, title: 'スケジュール', ask: '制作から公開までの日程（納品予定日・公開予定日）をご確認ください',
      status: appr.schedule ? 'approved' : req.status === 'approved' && state.schedule ? 'waiting' : 'locked', approvedAt: appr.schedule,
      lockedReason: '要件定義書の承認のあとに、アフロが制作から公開までの日程を作成します。',
    },
    {
      key: 'sitemap', no: 3, title: 'サイトマップ', ask: 'リニューアル後のページ構成をご確認ください',
      status: state.sitemap.approvedAt ? 'approved' : appr.schedule ? 'waiting' : 'locked', approvedAt: state.sitemap.approvedAt,
      lockedReason: 'スケジュールの承認のあとに、アフロがサイトマップをご用意します。',
    },
    {
      key: 'design', no: 4, title: 'トップデザイン', ask: 'ページごとに 3 つの案を比べて、採用するデザインを選んでください',
      status: state.design.approvedAt ? 'approved' : state.sitemap.approvedAt ? 'waiting' : 'locked', approvedAt: state.design.approvedAt,
      lockedReason: 'サイトマップの承認のあとに、アフロがデザイン案を作成します。',
    },
    {
      key: 'build', no: 5, title: '制作の完了', ask: 'すべてのページができあがりました。仕上がりをご確認ください',
      status: appr.build ? 'approved' : state.design.buildCompletedAt ? 'waiting' : 'locked', approvedAt: appr.build,
      lockedReason: 'デザインの承認のあとに、アフロが全ページを制作します。',
    },
    {
      key: 'quality', no: 6, title: '品質チェック', ask: '公開前の確認項目をチェックしてください',
      // 承認済みはお客様が「完了」を押したとき（0.39.7。全項目にチェックしただけでは承認にしない）
      status: state.design.qualityApprovedAt ? 'approved' : appr.build ? 'waiting' : 'locked',
      lockedReason: '制作の完了の承認のあとに、公開前の確認をお願いします。',
      approvedAt: state.design.qualityApprovedAt,
      progress: { done: clientDone, total },
    },
    {
      key: 'release', no: 7, title: '公開（リリース）', ask: '公開予定日にサイトを公開してよいかをご確認ください',
      status: appr.release ? 'approved' : state.design.qualityApprovedAt ? 'waiting' : 'locked', approvedAt: appr.release,
      lockedReason: '品質チェック（納品検収）の完了のあとに、公開の承認をお願いします。',
    },
  ];
  return steps.map(gate);
}

/**
 * 段階の最後の承認（2026-11-17 追加の schedule・build・release）の承認日時。
 * それより前の保存データ・初期データは、後の節目が進んでいれば承認済みとして扱う（移行せずに導く）:
 * スケジュール = サイトマップの承認があれば / 制作の完了 = 品質チェックを依頼済み・完了済みなら / 公開 = 運用・改善の段階なら
 */
export function stageApprovals(state: DemoState): { schedule?: ISODate; build?: ISODate; release?: ISODate } {
  const d = state.design;
  const stage = state.projects.find((p) => p.id === state.requirements.projectId)?.stage;
  return {
    schedule: state.schedule?.approvedAt ?? (state.schedule ? state.sitemap.approvedAt : undefined),
    build: d.buildApprovedAt ?? (d.buildCompletedAt ? (d.qualityApprovedAt ?? state.approvalRequests?.quality) : undefined),
    release: d.releaseApprovedAt ?? (d.qualityApprovedAt && (stage === 'operation' || stage === 'improvement') ? d.qualityApprovedAt : undefined),
  };
}

/** 節目が「アフロの依頼を待っている」（前の節目が終わり、まだ依頼していない）か。承認を依頼するボタンを出す条件 */
export function canRequestApproval(state: DemoState, key: ApprovalKey): boolean {
  return !!approvalSteps(state).find((s) => s.key === key)?.awaitingRequest;
}
