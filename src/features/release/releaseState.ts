import type { DemoState, ISODate } from '@/types';
import { QUALITY_ITEMS } from '@/data/quality';
import { isComplete } from '@/features/quality/qualityStats';
import { stageApprovals } from '@/features/portal/portalSteps';

export interface ReleaseCondition {
  label: string;
  done: boolean;
  /** 済んだ日時（あれば） */
  at?: ISODate;
  /** 済んでいないときに誰が何をするか */
  todo: string;
}

/**
 * 公開できるかの判定（リリース画面と品質チェック画面で同じものを使う。2026-11-18 リリース画面を分けたときに QualityPage から移した）。
 * 公開できるのはリリースの段階で、全ページの構築・品質チェックの全項目・お客様の納品検収（品質チェックの完了）・お客様の公開承認が済んでいるとき
 */
export function releaseState(state: DemoState) {
  const ownerStage = state.projects.find((p) => p.id === state.requirements.projectId)?.stage;
  const openItems = QUALITY_ITEMS.filter((i) => !isComplete(state.qualityChecks[i.id])).length;
  const clientCompleted = !!state.design.qualityApprovedAt;
  const releaseApprovedAt = stageApprovals(state).release;
  const launched = ownerStage === 'operation' || ownerStage === 'improvement';
  const conditions: ReleaseCondition[] = [
    { label: '全ページの構築', done: !!state.design.buildCompletedAt, at: state.design.buildCompletedAt, todo: '開発担当者が構築タスクを終える' },
    { label: '品質チェックの全項目', done: openItems === 0, todo: `アフロとお客様が残り ${openItems} 項目を確認する` },
    { label: 'お客様の納品検収（品質チェックの完了）', done: clientCompleted, at: state.design.qualityApprovedAt, todo: 'お客様がポータルの品質確認で「完了する」を押す' },
    {
      label: 'お客様の公開承認', done: !!releaseApprovedAt, at: releaseApprovedAt,
      todo: state.approvalRequests?.release ? 'お客様がポータルで公開を承認する（依頼済み）' : '開発担当者がお客様へ公開の承認を依頼する',
    },
  ];
  const canLaunch = !launched && conditions.every((c) => c.done) && ownerStage === 'release' && state.requirements.projectId === state.currentProjectId;
  return { ownerStage, openItems, clientCompleted, releaseApproved: !!releaseApprovedAt, launched, conditions, canLaunch };
}
