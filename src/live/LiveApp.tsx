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
const LiveDashboardPage = lazy(() => import('./pages/LiveDashboardPage'));
const LiveTasksPage = lazy(() => import('./pages/LiveTasksPage'));
const LiveConsultPage = lazy(() => import('./pages/LiveConsultPage'));
const HearingGate = lazy(() => import('./pages/HearingGate'));
const RequirementsPage = lazy(() => import('@/features/requirements/RequirementsPage'));
const HearingAnswersPage = lazy(() => import('@/features/requirements/HearingAnswersPage'));
const LiveRequirementsPage = lazy(() => import('./pages/LiveRequirementsPage'));

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
 * ヒアリングは管理者（/ai-studio。2026-11-26 から開発者と同じ操作）と開発者（/dev/hearing）。要件定義（AI 下書き）は /ai-studio/requirements・/dev/requirements（0.49.1）
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
      // ダッシュボード（LIVE_DASHBOARD_TASKS_CONSULT U1。管理者は全案件、開発者は担当案件）。メニューと最初の画面は U4（liveNav.ts・session.ts ROLE_HOME）
      { path: 'dashboard', element: <RoleRoute roles={admin}><LiveDashboardPage /></RoleRoute> },
      // 構築タスク（LIVE_DASHBOARD_TASKS_CONSULT U2。管理者は全案件・開発者は担当案件で追加・状態変更。お客様は開けない）。メニューは U4（liveNav.ts）
      { path: 'tasks', element: <RoleRoute roles={admin}><LiveTasksPage /></RoleRoute> },
      // 相談（LIVE_DASHBOARD_TASKS_CONSULT U3。管理者は全案件・開発者は担当案件で返信、お客様は自分の案件で送る）。メニューは U4（liveNav.ts）
      { path: 'chat', element: <RoleRoute roles={admin}><LiveConsultPage /></RoleRoute> },
      { path: 'projects', element: <RoleRoute roles={admin}><ProjectsListPage /></RoleRoute> },
      // 管理者のプロジェクト作成（2026-11-25 ユーザー決定「管理者もプロジェクトを作れるように」。画面は開発者と同じ）
      { path: 'projects/new', element: <RoleRoute roles={admin}><NewProjectPage /></RoleRoute> },
      { path: 'projects/:projectId', element: <RoleRoute roles={admin}><ProjectDetailPage /></RoleRoute> },
      { path: 'ai-studio', element: <RoleRoute roles={admin}><HearingGate><RequirementsPage /></HearingGate></RoleRoute> },
      { path: 'ai-studio/hearing', element: <RoleRoute roles={admin}><HearingGate><HearingAnswersPage /></HearingGate></RoleRoute> },
      // 要件定義（0.49.1。ヒアリングの「要件定義へ進む」の行き先。AI 下書き）
      { path: 'ai-studio/requirements', element: <RoleRoute roles={admin}><HearingGate><LiveRequirementsPage /></HearingGate></RoleRoute> },
      { path: 'users', element: <RoleRoute roles={admin}><LiveUsersPage /></RoleRoute> },
      { path: 'dev', element: <RoleRoute roles={dev}><LiveDashboardPage /></RoleRoute> },
      { path: 'dev/tasks', element: <RoleRoute roles={dev}><LiveTasksPage /></RoleRoute> },
      { path: 'dev/chat', element: <RoleRoute roles={dev}><LiveConsultPage /></RoleRoute> },
      { path: 'dev/projects', element: <RoleRoute roles={dev}><ProjectsListPage /></RoleRoute> },
      { path: 'dev/projects/new', element: <RoleRoute roles={dev}><NewProjectPage /></RoleRoute> },
      { path: 'dev/projects/:projectId', element: <RoleRoute roles={dev}><ProjectDetailPage /></RoleRoute> },
      { path: 'dev/hearing', element: <RoleRoute roles={dev}><HearingGate><RequirementsPage /></HearingGate></RoleRoute> },
      { path: 'dev/hearing/answers', element: <RoleRoute roles={dev}><HearingGate><HearingAnswersPage /></HearingGate></RoleRoute> },
      { path: 'dev/requirements', element: <RoleRoute roles={dev}><HearingGate><LiveRequirementsPage /></HearingGate></RoleRoute> },
      { path: 'portal/approvals', element: <RoleRoute roles={client}><PortalApprovalPage /></RoleRoute> },
      { path: 'portal/chat', element: <RoleRoute roles={client}><LiveConsultPage /></RoleRoute> },
      { path: '*', element: <RoleHome /> },
    ],
  },
], {
  basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/',
});


export default function LiveApp() {
  return <RouterProvider router={router} />;
}
