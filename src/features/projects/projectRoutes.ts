import { useLocation } from 'react-router-dom';
import type { DemoState, Project, Stage } from '@/types';
import { areaOf, CLIENT_PROJECT_ID } from '@/components/layout/nav';
import type { ApprovalKey } from '@/features/portal/portalSteps';
import { useHearingRoutes, type HearingRoutes } from '@/features/requirements/hearingRoutes';
import { nextBestAction, STAGE_LINKS } from './projectHelpers';

export interface StageLink { label: string; to: string }

export interface ProjectRoutes {
  /** 開発者画面（/dev 配下）で開いているか。管理者だけの操作（新しいプロジェクト・代理承認・採用・構築・公開など）を出し分ける */
  dev: boolean;
  /** プロジェクト一覧 */
  list: string;
  /** プロジェクト詳細 */
  detail: (id: string) => string;
  /** 各段階から開ける関連画面（開発者画面では、開発者画面の中にある画面だけ。無い段階は空） */
  stageLinks: Record<Stage, StageLink[]>;
  /** 制作フロー（要件定義 → サイトマップ → デザイン） */
  requirements: string;
  sitemap: string;
  design: string;
  /** お客様の対応状況の行から開く先（開発者画面に無い画面は null = 押せない行） */
  approval: Record<ApprovalKey, string | null>;
}

const ADMIN: ProjectRoutes = {
  dev: false,
  list: '/projects',
  detail: (id) => `/projects/${id}`,
  stageLinks: STAGE_LINKS,
  requirements: '/ai-studio',
  sitemap: '/site',
  design: '/ai-studio/design',
  approval: { requirements: '/ai-studio', sitemap: '/site', design: '/ai-studio/design', quality: '/quality' },
};

function devRoutes(h: HearingRoutes): ProjectRoutes {
  const sitemap = '/dev/sitemap';
  const design = '/dev/design';
  return {
    dev: true,
    list: '/dev/projects',
    detail: (id) => `/dev/projects/${id}`,
    // 品質・運用・改善の画面は開発者画面に無い（2026-11-11 決定: 開発者画面では出さない）
    stageLinks: {
      hearing: [{ label: 'ヒアリングを入力', to: h.answers }],
      requirements: [{ label: 'AI要件定義を開く', to: h.input }],
      build: [{ label: 'サイトマップ', to: sitemap }, { label: 'デザインスタジオ', to: design }],
      quality: [],
      operation: [],
      improvement: [],
    },
    requirements: h.input,
    sitemap,
    design,
    approval: { requirements: h.input, sitemap, design, quality: null },
  };
}

/**
 * プロジェクト一覧・詳細・サイトマップ・デザインは、管理者画面と開発者画面（/dev/projects・/dev/sitemap・/dev/design。0.26.0）で同じ部品を使う。
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
 * ヒアリング・要件定義の段階 → ヒアリング（/dev/hearing）、それ以降 → 構築タスク。
 * デモの案件は制作フローの「次の一手」で判定し、ヒアリング・要件定義以外の一手（サイトマップ・デザインの承認など）は管理者の作業なので構築タスクを出す。
 * ダッシュボードのカードとプロジェクト詳細の「次に必要な作業」で使う
 */
export function devNextWork(p: Project, state: DemoState): { next: string; to: string } {
  if (p.id === CLIENT_PROJECT_ID) {
    return state.requirements.status !== 'approved' ? { next: nextBestAction(state).cta, to: '/dev/hearing' } : { next: '構築タスクを進める', to: '/dev/tasks' };
  }
  return { next: p.nextAction, to: p.stage === 'hearing' || p.stage === 'requirements' ? '/dev/hearing' : '/dev/tasks' };
}
