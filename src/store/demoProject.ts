import type { DemoState, Project, Stage } from '@/types';
import { QUALITY_ITEMS } from '@/data/quality';
import { REQUIREMENT_QUESTIONS } from '@/data/requirements';
import { approvalSteps } from '@/features/portal/portalSteps';
import { isAnswered } from '@/features/requirements/validation';
import { designReady } from '@/features/design/designReq';
import { workView } from './projectWork';

/**
 * 案件の段階・進捗・次の作業・承認待ちの数を、その案件の制作データ（要件・サイトマップ・デザイン・品質）から導く。
 * state はその案件の制作データを差し込んだもの（workView）を渡す。
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
  if (req.status === 'analyzed') return { ...base, stage: 'requirements', progress: 18, nextAction: 'お客様の要件定義書の承認を待つ' };
  if (!state.sitemap.approvedAt) return { ...base, stage: 'build', progress: 25, nextAction: 'お客様のサイトマップ承認を待つ' };
  if (!state.design.approvedAt && !designReady(state)) return { ...base, stage: 'build', progress: 38, nextAction: 'デザイン要件定義を入力する' };
  if (!state.design.approvedAt) return { ...base, stage: 'build', progress: 38, nextAction: 'お客様のデザイン案の採用を待つ' };
  if (!state.design.buildCompletedAt) return { ...base, stage: 'build', progress: 52, nextAction: '全ページを構築する' };
  const both = QUALITY_ITEMS.filter((i) => state.qualityChecks[i.id]?.afroAt && state.qualityChecks[i.id]?.clientAt).length;
  const stage: Stage = 'quality';
  // すべて双方確認済みなら次は公開（開発者画面の品質チェックから運用へ進める。0.30.1）
  const nextAction = both === QUALITY_ITEMS.length ? 'サイトを公開する' : '品質チェック（110問）を進める';
  return { ...base, stage, progress: 64 + Math.round((30 * both) / QUALITY_ITEMS.length), nextAction };
}

/**
 * 案件の表示用の値（段階・進捗・次の作業・承認待ちの数）を、それぞれの案件の制作データに合わせる（0.29.0 から全案件。変わらなければ同じ state を返す）。
 * 運用・改善の段階は制作データからは導けない（品質チェックの完了の先）ので、全ページ構築まで済んでいれば段階をそのまま保つ。
 * その段階の承認待ちの数は、その案件のページ・お知らせの承認待ち（公開承認）の数にする（0.30.0。ページが案件ごとになったため）
 */
export function syncDemoProject(state: DemoState): DemoState {
  let changed = false;
  const projects = state.projects.map((cur) => {
    const view = workView(state, cur.id);
    // 品質チェックを後から外しても段階は下げない（下げると付け直しても運用・改善へ戻せないため）
    if ((cur.stage === 'operation' || cur.stage === 'improvement') && view.design.buildCompletedAt) {
      const pendingApprovals = view.pages.filter((p) => p.status === 'review').length;
      if (cur.pendingApprovals === pendingApprovals) return cur;
      changed = true;
      return { ...cur, pendingApprovals };
    }
    const d = derivedDemoProject(view);
    if (cur.stage === d.stage && cur.progress === d.progress && cur.nextAction === d.nextAction && cur.pendingApprovals === d.pendingApprovals) return cur;
    changed = true;
    return { ...cur, ...d };
  });
  return changed ? { ...state, projects } : state;
}
