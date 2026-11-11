import type { DemoState, Project, Stage } from '@/types';
import { QUALITY_ITEMS } from '@/data/quality';
import { REQUIREMENT_QUESTIONS } from '@/data/requirements';
import { approvalSteps } from '@/features/portal/portalSteps';
import { isAnswered } from '@/features/requirements/validation';

/**
 * デモのデータ（要件・サイトマップ・デザイン・品質）を持つ案件（requirements.projectId）の
 * 段階・進捗・次の作業・承認待ちの数を、そのデータから導く。
 * 以前は承認のたびに固定値を足していた（前回より下がらない）ため、デモをやり直すと
 * 「進捗 46% なのに次の作業が AI 要件定義」のような矛盾が残った。値の正はデモのデータ側に置く。
 */
export function derivedDemoProject(state: DemoState): Pick<Project, 'stage' | 'progress' | 'nextAction' | 'pendingApprovals'> {
  const req = state.requirements;
  const pendingApprovals = approvalSteps(state).filter((s) => s.status === 'waiting').length;
  const base = { pendingApprovals };
  if (req.status === 'draft') {
    const answered = REQUIREMENT_QUESTIONS.filter((q) => isAnswered(req.answers[q.id])).length;
    return { ...base, stage: 'hearing', progress: 2 + Math.round((10 * answered) / REQUIREMENT_QUESTIONS.length), nextAction: 'ヒアリングを入力する' };
  }
  if (req.status === 'analyzed') return { ...base, stage: 'requirements', progress: 18, nextAction: '要件定義書の承認をもらう' };
  if (!state.sitemap.approvedAt) return { ...base, stage: 'build', progress: 25, nextAction: 'サイトマップを承認する' };
  if (!state.design.approvedAt) return { ...base, stage: 'build', progress: 38, nextAction: 'デザイン案の採用を決める' };
  if (!state.design.buildCompletedAt) return { ...base, stage: 'build', progress: 52, nextAction: '全ページを構築する' };
  const both = QUALITY_ITEMS.filter((i) => state.qualityChecks[i.id]?.afroAt && state.qualityChecks[i.id]?.clientAt).length;
  const stage: Stage = 'quality';
  return { ...base, stage, progress: 64 + Math.round((30 * both) / QUALITY_ITEMS.length), nextAction: '品質チェック（110問）を進める' };
}

/** デモの案件の表示用の値をデモのデータに合わせる（変わらなければ同じ state を返す） */
export function syncDemoProject(state: DemoState): DemoState {
  const id = state.requirements.projectId;
  const cur = state.projects.find((p) => p.id === id);
  if (!cur) return state;
  const d = derivedDemoProject(state);
  if (cur.stage === d.stage && cur.progress === d.progress && cur.nextAction === d.nextAction && cur.pendingApprovals === d.pendingApprovals) return state;
  return { ...state, projects: state.projects.map((p) => (p.id === id ? { ...p, ...d } : p)) };
}
