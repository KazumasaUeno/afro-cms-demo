import type { ApprovalKey, DemoState, Project, Stage } from '@/types';
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
  // 承認を依頼する前は「承認を依頼する」、依頼の後は「お客様の承認を待つ」（2026-11-17 会議）
  const asked = (key: ApprovalKey, waiting: string, ask: string) => (state.approvalRequests?.[key] ? waiting : ask);
  if (req.status === 'analyzed') return { ...base, stage: 'requirements', progress: 18, nextAction: asked('requirements', 'お客様の要件定義書の承認を待つ', '要件定義書の承認を依頼する') };
  // 日程を入れるまで制作へ進めない（2026-11-17 会議）。ただし後の工程が済んでいれば（サイトマップの承認など。日程の機能より前の保存データ）制作以降として扱う
  if (!state.schedule && !state.sitemap.approvedAt) return { ...base, stage: 'schedule', progress: 21, nextAction: 'スケジュールを入力する' };
  if (!state.sitemap.approvedAt) return { ...base, stage: 'build', progress: 25, nextAction: asked('sitemap', 'お客様のサイトマップ承認を待つ', 'サイトマップの承認を依頼する') };
  if (!state.design.approvedAt && !designReady(state)) return { ...base, stage: 'build', progress: 38, nextAction: 'デザイン要件定義を入力する' };
  if (!state.design.approvedAt) return { ...base, stage: 'build', progress: 38, nextAction: asked('design', 'お客様のデザイン案の採用を待つ', 'デザイン案の承認を依頼する') };
  if (!state.design.buildCompletedAt) return { ...base, stage: 'build', progress: 52, nextAction: '全ページを構築する' };
  // お客様が品質チェックを完了（納品検収）したらリリースの段階（2026-11-17 会議）。開発者画面の品質チェックから公開して運用へ進める（0.30.1）
  if (state.design.qualityApprovedAt) return { ...base, stage: 'release', progress: 95, nextAction: 'サイトを公開する' };
  const both = QUALITY_ITEMS.filter((i) => state.qualityChecks[i.id]?.afroAt && state.qualityChecks[i.id]?.clientAt).length;
  const stage: Stage = 'quality';
  const nextAction = !state.approvalRequests?.quality ? '品質チェックを依頼する'
    : both === QUALITY_ITEMS.length ? 'お客様の品質チェックの完了（納品検収）を待つ' : '品質チェック（110問）を進める';
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
