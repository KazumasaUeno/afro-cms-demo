import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, RouterProvider, useLocation } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { RouteLoader } from '@/components/layout/RouteLoader';
import { AreaGuard } from '@/components/layout/AreaGuard';
import HomePage from '@/features/home/HomePage';
import LoginPage from '@/features/auth/LoginPage';

// 重いライブラリ（React Flow / Tiptap / Recharts / GSAP）を使う画面は遅延読み込み
const ProjectsPage = lazy(() => import('@/features/projects/ProjectsPage'));
const NewProjectPage = lazy(() => import('@/features/projects/NewProjectPage'));
const ProjectDetailPage = lazy(() => import('@/features/projects/ProjectDetailPage'));
const RequirementsPage = lazy(() => import('@/features/requirements/RequirementsPage'));
const HearingAnswersPage = lazy(() => import('@/features/requirements/HearingAnswersPage'));
const RequirementsDocPage = lazy(() => import('@/features/requirements/RequirementsDocPage'));
const DesignStudioPage = lazy(() => import('@/features/design/DesignStudioPage'));
const SitemapPage = lazy(() => import('@/features/sitemap/SitemapPage'));
const QualityPage = lazy(() => import('@/features/quality/QualityPage'));
const CmsEditorPage = lazy(() => import('@/features/cms/CmsEditorPage'));
const InsightsPage = lazy(() => import('@/features/insights/InsightsPage'));
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage'));
const UsersPage = lazy(() => import('@/features/users/UsersPage'));
// お客様ポータル・開発者画面
const PublishApprovalsPage = lazy(() => import('@/features/portal/PublishApprovalsPage'));
const DevDashboardPage = lazy(() => import('@/features/dev/DevDashboardPage'));
const DevTasksPage = lazy(() => import('@/features/dev/DevTasksPage'));
const DevDeploysPage = lazy(() => import('@/features/dev/DevDeploysPage'));
const PortalHomePage = lazy(() => import('@/features/portal/PortalHomePage'));
const PortalApprovalsPage = lazy(() => import('@/features/portal/PortalApprovalsPage'));
const PortalQualityPage = lazy(() => import('@/features/portal/PortalQualityPage'));
const PortalReportsPage = lazy(() => import('@/features/portal/PortalReportsPage'));
const PortalSignagePage = lazy(() => import('@/features/portal/PortalSignagePage'));
const PresentPage = lazy(() => import('@/features/present/PresentPage'));

/** 旧 CMS画面の URL（0.4.0）はポータルのページ編集へ。?page= / ?new= はそのまま引き継ぐ */
function LegacyCmsRedirect() {
  const { search } = useLocation();
  return <Navigate to={`/portal/pages${search}`} replace />;
}

const router = createBrowserRouter([
  // エリアごとのログイン画面（AppShell の外。デモのため実際の認証は行わない）
  { path: '/login', element: <LoginPage area="admin" /> },
  { path: '/dev/login', element: <LoginPage area="dev" /> },
  { path: '/portal/login', element: <LoginPage area="portal" /> },
  // 旧 CMS画面の URL（0.4.0）はポータルのページ編集へ（転送先でポータルのログインを確認する）
  { path: '/cms/*', element: <LegacyCmsRedirect /> },
  {
    path: '/',
    // 未ログインのエリアはそのエリアのログイン画面へ（?next= で戻り先を渡す）
    element: <AreaGuard><AppShell /></AreaGuard>,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'projects', element: <ProjectsPage /> },
      { path: 'projects/new', element: <NewProjectPage /> },
      { path: 'projects/:projectId', element: <ProjectDetailPage /> },
      { path: 'ai-studio', element: <RequirementsPage /> },
      { path: 'ai-studio/hearing', element: <HearingAnswersPage /> },
      // 要件定義書（0.28.0）。AI 分析の前は「まだ作成されていません」、分析後は要件定義書。プロジェクト詳細の「AI要件定義を開く」の行き先
      { path: 'ai-studio/requirements', element: <RequirementsDocPage /> },
      { path: 'ai-studio/design', element: <DesignStudioPage /> },
      { path: 'site', element: <SitemapPage /> },
      { path: 'quality', element: <QualityPage /> },
      // 管理者画面（アフロ社内）は従来どおりルート直下。お客様ポータルは /portal、開発者画面は /dev 配下
      { path: 'portal/pages', element: <CmsEditorPage /> },
      { path: 'portal/publish', element: <PublishApprovalsPage /> },
      { path: 'dev', element: <DevDashboardPage /> },
      // 開発者画面のプロジェクト（0.26.0）。管理者画面の /projects・/projects/:id と同じ画面（担当案件だけ。詳細は URL の案件が担当かを画面の中で確かめる）
      { path: 'dev/projects', element: <ProjectsPage /> },
      { path: 'dev/projects/:projectId', element: <ProjectDetailPage /> },
      // 構築の段階のサイトマップ・デザイン（0.26.0）。管理者画面の /site・/ai-studio/design と同じ画面（担当案件だけ。DevProjectGate）
      { path: 'dev/sitemap', element: <SitemapPage /> },
      { path: 'dev/design', element: <DesignStudioPage /> },
      // 品質管理・運用・改善の段階（0.27.0）。管理者画面の /quality・/insights、お客様ポータルの /portal/pages と同じ画面（担当案件だけ。DevProjectGate）。
      // お客様側の操作（顧客の品質承認・ページの公開）は開発者画面では出さない
      { path: 'dev/quality', element: <QualityPage /> },
      { path: 'dev/cms', element: <CmsEditorPage /> },
      { path: 'dev/insights', element: <InsightsPage /> },
      // 開発者画面のヒアリング（0.25.0）。管理者画面の /ai-studio・/ai-studio/hearing と同じ画面を開発者画面の中で開く（担当案件だけ。DevProjectGate）
      { path: 'dev/hearing', element: <RequirementsPage /> },
      { path: 'dev/hearing/answers', element: <HearingAnswersPage /> },
      { path: 'dev/requirements', element: <RequirementsDocPage /> },
      { path: 'dev/tasks', element: <DevTasksPage /> },
      // 自動チェックは 0.19.0 で開発者画面から外した（11/10 レビュー）。古いリンク・ブックマークはダッシュボードへ
      { path: 'dev/checks', element: <Navigate to="/dev" replace /> },
      { path: 'dev/deploys', element: <DevDeploysPage /> },
      { path: 'portal', element: <PortalHomePage /> },
      // お客様ポータルのヒアリングは 0.18.0 で廃止（アフロが入力する）。古いリンク・ブックマークは確認・承認へ
      { path: 'portal/requirements', element: <Navigate to="/portal/approvals" replace /> },
      { path: 'portal/approvals', element: <PortalApprovalsPage /> },
      { path: 'portal/quality', element: <PortalQualityPage /> },
      { path: 'portal/reports', element: <PortalReportsPage /> },
      { path: 'portal/signage', element: <PortalSignagePage /> },
      { path: 'insights', element: <InsightsPage /> },
      { path: 'users', element: <UsersPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
  {
    path: '/present',
    element: (
      <Suspense fallback={<RouteLoader label="営業プレゼンモード" />}>
        <PresentPage />
      </Suspense>
    ),
  },
], {
  // GitHub Pages ではサブパス（/afro-cms-demo/）配下で配信する。ローカルは '/'
  basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/',
});

export default function App() {
  return <RouterProvider router={router} />;
}
