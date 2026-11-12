import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { RouteLoader } from '@/components/layout/RouteLoader';
import { ROLE_HOME, useLiveSession, type LiveRole } from './session';
import { LiveShell } from './LiveShell';
import LiveLoginPage from './pages/LiveLoginPage';

// 重い画面（Tiptap 等を含むヒアリング）は遅延読み込み
const ProjectsListPage = lazy(() => import('./pages/ProjectsListPage'));
const NewProjectPage = lazy(() => import('./pages/LiveNewProjectPage'));
const ProjectDetailPage = lazy(() => import('./pages/LiveProjectDetailPage'));
const PortalApprovalPage = lazy(() => import('./pages/PortalApprovalPage'));
const LiveUsersPage = lazy(() => import('./pages/LiveUsersPage'));
const HearingGate = lazy(() => import('./pages/HearingGate'));
const RequirementsPage = lazy(() => import('@/features/requirements/RequirementsPage'));
const HearingAnswersPage = lazy(() => import('@/features/requirements/HearingAnswersPage'));

/** その役割の画面だけを開く（表示の出し分け。権限の実体は Firestore Rules） */
function RoleRoute({ roles, children }: { roles: LiveRole[]; children: ReactNode }) {
  const { account } = useLiveSession();
  if (!roles.includes(account.role)) return <Navigate to={ROLE_HOME[account.role]} replace />;
  return <Suspense fallback={<RouteLoader />}>{children}</Suspense>;
}

function RoleHome() {
  return <Navigate to={ROLE_HOME[useLiveSession().account.role]} replace />;
}

const admin: LiveRole[] = ['admin'];
const dev: LiveRole[] = ['developer'];
const client: LiveRole[] = ['client'];

/**
 * live のルーティング（BACKEND_FIREBASE §14: 範囲内の画面だけ。サイトマップ・デザイン・品質・CMS・分析・設定・営業プレゼン等は出さない）。
 * ヒアリングは管理者（/ai-studio。回答の入力だけ。§25-1）と開発者（/dev/hearing）
 */
const router = createBrowserRouter([
  { path: '/login', element: <LiveLoginPage /> },
  { path: '/dev/login', element: <LiveLoginPage /> },
  { path: '/portal/login', element: <LiveLoginPage /> },
  {
    path: '/',
    element: <LiveShell />,
    children: [
      { index: true, element: <RoleHome /> },
      { path: 'projects', element: <RoleRoute roles={admin}><ProjectsListPage /></RoleRoute> },
      { path: 'projects/:projectId', element: <RoleRoute roles={admin}><ProjectDetailPage /></RoleRoute> },
      { path: 'ai-studio', element: <RoleRoute roles={admin}><HearingGate><RequirementsPage /></HearingGate></RoleRoute> },
      { path: 'ai-studio/hearing', element: <RoleRoute roles={admin}><HearingGate><HearingAnswersPage /></HearingGate></RoleRoute> },
      { path: 'users', element: <RoleRoute roles={admin}><LiveUsersPage /></RoleRoute> },
      { path: 'dev/projects', element: <RoleRoute roles={dev}><ProjectsListPage /></RoleRoute> },
      { path: 'dev/projects/new', element: <RoleRoute roles={dev}><NewProjectPage /></RoleRoute> },
      { path: 'dev/projects/:projectId', element: <RoleRoute roles={dev}><ProjectDetailPage /></RoleRoute> },
      { path: 'dev/hearing', element: <RoleRoute roles={dev}><HearingGate><RequirementsPage /></HearingGate></RoleRoute> },
      { path: 'dev/hearing/answers', element: <RoleRoute roles={dev}><HearingGate><HearingAnswersPage /></HearingGate></RoleRoute> },
      { path: 'portal/approvals', element: <RoleRoute roles={client}><PortalApprovalPage /></RoleRoute> },
      { path: '*', element: <RoleHome /> },
    ],
  },
], {
  basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/',
});


export default function LiveApp() {
  return <RouterProvider router={router} />;
}
