import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { RouteLoader } from '@/components/layout/RouteLoader';
import HomePage from '@/features/home/HomePage';

// 重いライブラリ（React Flow / Tiptap / Recharts / GSAP）を使う画面は遅延読み込み
const ProjectsPage = lazy(() => import('@/features/projects/ProjectsPage'));
const ProjectDetailPage = lazy(() => import('@/features/projects/ProjectDetailPage'));
const RequirementsPage = lazy(() => import('@/features/requirements/RequirementsPage'));
const DesignStudioPage = lazy(() => import('@/features/design/DesignStudioPage'));
const SitemapPage = lazy(() => import('@/features/sitemap/SitemapPage'));
const QualityPage = lazy(() => import('@/features/quality/QualityPage'));
const CmsEditorPage = lazy(() => import('@/features/cms/CmsEditorPage'));
const InsightsPage = lazy(() => import('@/features/insights/InsightsPage'));
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage'));
// お客様側の画面（CMS・ポータル）
const CmsDashboardPage = lazy(() => import('@/features/client-cms/CmsDashboardPage'));
const CmsApprovalsPage = lazy(() => import('@/features/client-cms/CmsApprovalsPage'));
const PortalHomePage = lazy(() => import('@/features/portal/PortalHomePage'));
const PortalApprovalsPage = lazy(() => import('@/features/portal/PortalApprovalsPage'));
const PortalQualityPage = lazy(() => import('@/features/portal/PortalQualityPage'));
const PortalReportsPage = lazy(() => import('@/features/portal/PortalReportsPage'));
const PresentPage = lazy(() => import('@/features/present/PresentPage'));

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'projects', element: <ProjectsPage /> },
      { path: 'projects/:projectId', element: <ProjectDetailPage /> },
      { path: 'ai-studio', element: <RequirementsPage /> },
      { path: 'ai-studio/design', element: <DesignStudioPage /> },
      { path: 'site', element: <SitemapPage /> },
      { path: 'quality', element: <QualityPage /> },
      // 管理者画面（アフロ社内）は従来どおりルート直下。お客様の画面は /cms と /portal 配下
      { path: 'cms', element: <CmsDashboardPage /> },
      { path: 'cms/pages', element: <CmsEditorPage /> },
      { path: 'cms/approvals', element: <CmsApprovalsPage /> },
      { path: 'portal', element: <PortalHomePage /> },
      { path: 'portal/approvals', element: <PortalApprovalsPage /> },
      { path: 'portal/quality', element: <PortalQualityPage /> },
      { path: 'portal/reports', element: <PortalReportsPage /> },
      { path: 'insights', element: <InsightsPage /> },
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
