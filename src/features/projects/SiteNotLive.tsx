import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { NotYetPanel } from '@/components/ui';
import { areaOf } from '@/components/layout/nav';
import { currentProject, useDemo } from '@/store/DemoStore';
import { useProjectRoutes } from './projectRoutes';

/**
 * サイトの公開前（運用の段階より前）の案件で、ページ編集・公開承認・サイネージ・レポートの代わりに出す案内（0.30.0。2026-11-13 ユーザー指示）。
 * お客様ポータルはホームへ、管理者・開発者画面はプロジェクト詳細へ戻す
 */
export function SiteNotLive({ icon, feature }: { icon: ReactNode; feature: string }) {
  const { state } = useDemo();
  const project = currentProject(state);
  const routes = useProjectRoutes();
  const navigate = useNavigate();
  const portal = areaOf(useLocation().pathname) === 'portal';
  return (
    <NotYetPanel
      icon={icon}
      title={`${project.siteName} の${feature}はまだ使えません`}
      description="サイトの公開後（運用の段階）から使えます。"
      actionLabel={portal ? 'ホームへ' : 'プロジェクト詳細を開く'}
      onAction={() => navigate(portal ? '/portal' : routes.detail(project.id))}
    />
  );
}
