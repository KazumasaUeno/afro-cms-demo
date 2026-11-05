import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { PageFallback } from '@/components/layout/PageFallback';
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
      { path: 'cms', element: <CmsEditorPage /> },
      { path: 'insights', element: <InsightsPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
  {
    path: '/present',
    element: (
      <Suspense fallback={<PageFallback />}>
        <PresentPage />
      </Suspense>
    ),
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
