import { useLocation } from 'react-router-dom';
import type { DemoState, Project, Stage } from '@/types';
import { areaOf, CLIENT_PROJECT_ID } from '@/components/layout/nav';
import { designReady } from '@/features/design/designReq';
import { workView } from '@/store/projectWork';
import type { ApprovalKey } from '@/features/portal/portalSteps';
import { useHearingRoutes, type HearingRoutes } from '@/features/requirements/hearingRoutes';
import { nextBestAction, qualityCompletion, STAGE_LINKS } from './projectHelpers';

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
      operation: [{ label: 'ページ・お知らせを編集', to: cms }, { label: '素材ドライブ', to: '/dev/assets' }, { label: 'フォーム', to: '/dev/forms' }],
      improvement: [{ label: 'インサイト・改善提案', to: insights }, { label: '素材ドライブ', to: '/dev/assets' }, { label: 'フォーム', to: '/dev/forms' }],
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
 * ヒアリングの段階 → ヒアリング（/dev/hearing）、要件定義の段階 → 要件定義書（/dev/requirements。0.28.0）。
 * 構築・品質の段階は、その案件の制作データで行き先を分ける（0.30.1。以前は一律に構築タスクだったため、構築タスクを持たない案件では行き止まりだった）:
 * サイトマップ未承認 → /dev/sitemap、デザイン要件定義が未完 → /dev/design/requirements、デザイン未採用 → /dev/design、
 * 全ページ未構築 → MINAMO COFFEE は構築タスク（/dev/tasks。構築タスクはこの案件の分だけ）・ほかはデザインスタジオ（/dev/design）、
 * 品質チェック → /dev/quality（双方確認が済んでいれば「サイトを公開する」）。
 * ダッシュボードのカードとプロジェクト詳細の「次に必要な作業」で使う
 */
export function devNextWork(p: Project, state: DemoState): { next: string; to: string } {
  // 運用・改善の段階は、ページ・診断が案件ごとになった（0.30.0）ので、どの案件もページ編集・インサイトへ（以前は MINAMO COFFEE 以外を構築タスクへ）
  if (p.stage === 'operation') return { next: p.nextAction, to: '/dev/cms' };
  if (p.stage === 'improvement') return { next: p.nextAction, to: '/dev/insights' };
  const view = workView(state, p.id);
  // 分析前はヒアリングの入力、分析後（承認待ち）は要件定義書（0.28.0）
  if (view.requirements.status === 'draft') return { next: nextBestAction(view).cta, to: '/dev/hearing' };
  if (view.requirements.status === 'analyzed') return { next: nextBestAction(view).cta, to: '/dev/requirements' };
  // 承認・採用はお客様の作業なので、待っている間もその画面を開く（開発者は内容を確認できる）
  if (!view.sitemap.approvedAt) return { next: 'お客様のサイトマップ承認を待つ', to: '/dev/sitemap' };
  if (!view.design.approvedAt && !designReady(view)) return { next: 'デザイン要件定義を入力する', to: '/dev/design/requirements' };
  if (!view.design.approvedAt) return { next: 'お客様のデザイン案の採用を待つ', to: '/dev/design' };
  if (!view.design.buildCompletedAt) {
    return p.id === CLIENT_PROJECT_ID ? { next: '構築タスクを進める', to: '/dev/tasks' } : { next: '全ページを構築する', to: '/dev/design' };
  }
  return { next: qualityCompletion(view.qualityChecks).percent === 100 ? 'サイトを公開する' : '品質チェックを進める', to: '/dev/quality' };
}
