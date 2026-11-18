import { useLocation } from 'react-router-dom';
import type { DemoState, Project, Stage } from '@/types';
import { areaOf } from '@/components/layout/nav';
import { designReady } from '@/features/design/designReq';
import { workView } from '@/store/projectWork';
import { stageApprovals, type ApprovalKey } from '@/features/portal/portalSteps';
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
  /** お知らせ（2026-11-18。ページとは別の画面） */
  news: string;
  insights: string;
  /** 相談チャット（0.38.0）と、お客様の確認・承認画面の説明用の表示（0.38.0） */
  chat: string;
  clientApprovals: string;
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
  news: '/portal/news',
  insights: '/insights',
  chat: '/chat',
  clientApprovals: '/client-view/approvals',
  approval: { requirements: '/ai-studio/requirements', schedule: '/schedule', sitemap: '/site', design: '/ai-studio/design', build: '/ai-studio/design', quality: '/quality', release: '/release' },
};

function devRoutes(h: HearingRoutes): ProjectRoutes {
  const sitemap = '/dev/sitemap';
  const design = '/dev/design';
  const designRequirements = '/dev/design/requirements';
  const quality = '/dev/quality';
  const cms = '/dev/cms';
  const news = '/dev/news';
  const insights = '/dev/insights';
  return {
    dev: true,
    list: '/dev/projects',
    detail: h.project,
    // 品質・運用・改善も開発者画面の中で開く（2026-11-11 ユーザー決定。0.27.0）
    stageLinks: {
      hearing: [{ label: 'ヒアリングを入力', to: h.answers }],
      requirements: [{ label: 'AI要件定義を開く', to: h.doc }],
      // 日程の入力（2026-11-17 会議。開発担当者が入れる）
      schedule: [{ label: 'スケジュールを入力', to: '/dev/schedule' }],
      // 素材ドライブは制作の段階（2026-11-18 ユーザー指示「素材ドライブは制作に移動」）
      build: [{ label: 'サイトマップ', to: sitemap }, { label: 'デザイン要件定義', to: designRequirements }, { label: 'デザインスタジオ', to: design }, { label: '素材ドライブ', to: '/dev/assets' }],
      quality: [{ label: '品質チェック', to: quality }],
      // リリースの段階はリリース画面（2026-11-18 ユーザー指示）
      release: [{ label: 'リリース画面', to: '/dev/release' }],
      // ページとお知らせは別の画面（2026-11-18 ユーザー指示）。フォームは外した（同日「フォームは不要」）
      operation: [{ label: 'ページを編集', to: cms }, { label: 'お知らせを編集', to: news }],
      improvement: [{ label: 'インサイト・改善提案', to: insights }],
    },
    requirements: h.doc,
    sitemap,
    designRequirements,
    design,
    quality,
    cms,
    news,
    insights,
    chat: '/dev/chat',
    clientApprovals: '/dev/client-view/approvals',
    approval: { requirements: h.doc, schedule: '/dev/schedule', sitemap, design, build: '/dev/tasks', quality, release: '/dev/release' },
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
 * 全ページ未構築 → 構築タスク（/dev/tasks。2026-11-17 から全案件に構築タスクがある。以前は MINAMO COFFEE 以外はデザインスタジオ）、
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
  // 日程を入れるまで制作へ進めない（2026-11-17 会議）
  if (!view.schedule && !view.sitemap.approvedAt) return { next: 'スケジュールを入力する', to: '/dev/schedule' };
  // 段階の最後の承認（2026-11-17）: 依頼していなければ依頼、依頼済みならお客様を待つ
  const ask = (key: ApprovalKey, label: string) => (view.approvalRequests?.[key] ? `お客様の${label}の承認を待つ` : `${label}の承認を依頼する`);
  const appr = stageApprovals(view);
  if (!appr.schedule) return { next: ask('schedule', 'スケジュール'), to: '/dev/schedule' };
  // 承認・採用はお客様の作業なので、待っている間もその画面を開く（開発者は内容を確認できる）
  if (!view.sitemap.approvedAt) return { next: 'お客様のサイトマップ承認を待つ', to: '/dev/sitemap' };
  if (!view.design.approvedAt && !designReady(view)) return { next: 'デザイン要件定義を入力する', to: '/dev/design/requirements' };
  if (!view.design.approvedAt) return { next: 'お客様のデザイン案の採用を待つ', to: '/dev/design' };
  if (!view.design.buildCompletedAt) {
    return { next: '構築タスクを進める', to: '/dev/tasks' };
  }
  if (!appr.build) return { next: ask('build', '制作の完了'), to: `/dev/projects/${p.id}` };
  if (view.design.qualityApprovedAt && !appr.release) return { next: ask('release', '公開'), to: '/dev/release' };
  // 公開できるのはお客様の品質チェックの完了（納品検収）の後（2026-11-17 会議。リリースの段階）
  return view.design.qualityApprovedAt
    ? { next: 'サイトを公開する', to: '/dev/release' }
    : { next: qualityCompletion(view.qualityChecks).percent === 100 ? 'お客様の納品検収を待つ' : '品質チェックを進める', to: '/dev/quality' };
}
