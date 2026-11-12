import { useLocation } from 'react-router-dom';
import type { DemoState, Project, Stage } from '@/types';
import { areaOf, CLIENT_PROJECT_ID } from '@/components/layout/nav';
import { workView } from '@/store/projectWork';
import type { ApprovalKey } from '@/features/portal/portalSteps';
import { useHearingRoutes, type HearingRoutes } from '@/features/requirements/hearingRoutes';
import { nextBestAction, STAGE_LINKS } from './projectHelpers';

export interface StageLink { label: string; to: string }

export interface ProjectRoutes {
  /** 開発者画面（/dev 配下）で開いているか。管理者だけの操作（新しいプロジェクト・構築・公開など。承認・採用はお客様ポータルだけ）を出し分ける */
  dev: boolean;
  /** プロジェクト一覧 */
  list: string;
  /** プロジェクト詳細 */
  detail: (id: string) => string;
  /** 各段階から開ける関連画面（開発者画面では、開発者画面の中にある画面だけ。無い段階は空） */
  stageLinks: Record<Stage, StageLink[]>;
  /** 制作フロー（要件定義 → サイトマップ → デザイン）。requirements は要件定義書の画面（0.28.0） */
  requirements: string;
  sitemap: string;
  /** デザイン要件定義（0.28.0。デザインスタジオの前） */
  designRequirements: string;
  design: string;
  /** 品質チェック・ページ編集（CMS）・改善（インサイト） */
  quality: string;
  cms: string;
  insights: string;
  /** お客様の対応状況の行から開く先（開発者画面に無い画面は null = 押せない行） */
  approval: Record<ApprovalKey, string | null>;
}

const ADMIN: ProjectRoutes = {
  dev: false,
  list: '/projects',
  detail: (id) => `/projects/${id}`,
  stageLinks: STAGE_LINKS,
  requirements: '/ai-studio/requirements',
  sitemap: '/site',
  designRequirements: '/ai-studio/design/requirements',
  design: '/ai-studio/design',
  quality: '/quality',
  cms: '/portal/pages',
  insights: '/insights',
  approval: { requirements: '/ai-studio/requirements', sitemap: '/site', design: '/ai-studio/design', quality: '/quality' },
};

function devRoutes(h: HearingRoutes): ProjectRoutes {
  const sitemap = '/dev/sitemap';
  const design = '/dev/design';
  const designRequirements = '/dev/design/requirements';
  const quality = '/dev/quality';
  const cms = '/dev/cms';
  const insights = '/dev/insights';
  return {
    dev: true,
    list: '/dev/projects',
    detail: (id) => `/dev/projects/${id}`,
    // 品質・運用・改善も開発者画面の中で開く（2026-11-11 ユーザー決定。0.27.0）
    stageLinks: {
      hearing: [{ label: 'ヒアリングを入力', to: h.answers }],
      requirements: [{ label: 'AI要件定義を開く', to: h.doc }],
      build: [{ label: 'サイトマップ', to: sitemap }, { label: 'デザイン要件定義', to: designRequirements }, { label: 'デザインスタジオ', to: design }],
      quality: [{ label: '品質チェック', to: quality }],
      operation: [{ label: 'ページ・お知らせを編集', to: cms }],
      improvement: [{ label: 'インサイト・改善提案', to: insights }],
    },
    requirements: h.doc,
    sitemap,
    designRequirements,
    design,
    quality,
    cms,
    insights,
    approval: { requirements: h.doc, sitemap, design, quality },
  };
}

/**
 * プロジェクト一覧・詳細・サイトマップ・デザインは、管理者画面と開発者画面（/dev/projects・/dev/sitemap・/dev/design。0.26.0）で同じ部品を使う。
 * 品質チェック・ページ編集・改善も同じ（/dev/quality・/dev/cms・/dev/insights。0.27.0）。
 * 行き先をいまのエリアの中に保つ（開発者だけのログインで管理者画面の URL へ飛ぶと /login へ戻される）。hearingRoutes.ts と同じ方式。
 * 表示の出し分けだけで、セキュリティ境界ではない（担当案件の制限は DevProjectGate、実体はルール）。
 */
export function useProjectRoutes(): ProjectRoutes {
  const { pathname } = useLocation();
  const hearing = useHearingRoutes();
  return areaOf(pathname) === 'dev' ? devRoutes(hearing) : ADMIN;
}

/**
 * 開発者画面で、担当案件の「次の作業」とその行き先（開発者画面の中だけ）。
 * ヒアリングの段階 → ヒアリング（/dev/hearing）、要件定義の段階 → 要件定義書（/dev/requirements。0.28.0）、それ以降 → 構築タスク。
 * デモの案件は制作フローの「次の一手」で判定し、ヒアリング・要件定義以外の一手（サイトマップ・デザインの承認など）は管理者の作業なので構築タスクを出す。
 * ダッシュボードのカードとプロジェクト詳細の「次に必要な作業」で使う
 */
export function devNextWork(p: Project, state: DemoState): { next: string; to: string } {
  // 制作データは案件ごと（0.29.0）。運用・改善の段階はデモのデータ（ページ・診断）が MINAMO COFFEE の分だけなので、案件の値を使う
  if (p.id === CLIENT_PROJECT_ID || (p.stage !== 'operation' && p.stage !== 'improvement')) {
    const view = workView(state, p.id);
    // 分析前はヒアリングの入力、分析後（承認待ち）は要件定義書（0.28.0）
    if (view.requirements.status === 'draft') return { next: nextBestAction(view).cta, to: '/dev/hearing' };
    return view.requirements.status === 'analyzed' ? { next: nextBestAction(view).cta, to: '/dev/requirements' } : { next: '構築タスクを進める', to: '/dev/tasks' };
  }
  return { next: p.nextAction, to: '/dev/tasks' };
}
