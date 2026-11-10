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
const DevChecksPage = lazy(() => import('@/features/dev/DevChecksPage'));
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
      { path: 'ai-studio/design', element: <DesignStudioPage /> },
      { path: 'site', element: <SitemapPage /> },
      { path: 'quality', element: <QualityPage /> },
      // 管理者画面（アフロ社内）は従来どおりルート直下。お客様ポータルは /portal、開発者画面は /dev 配下
      { path: 'portal/pages', element: <CmsEditorPage /> },
      { path: 'portal/publish', element: <PublishApprovalsPage /> },
      { path: 'dev', element: <DevDashboardPage /> },
      { path: 'dev/tasks', element: <DevTasksPage /> },
      { path: 'dev/checks', element: <DevChecksPage /> },
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
