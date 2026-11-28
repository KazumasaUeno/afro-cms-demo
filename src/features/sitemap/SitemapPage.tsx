import { Button } from '@mui/material';
import { ArrowRight } from 'lucide-react';
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { BuildFlowNav } from '@/components/layout/BuildFlowNav';
import { currentProject, useDemo } from '@/store/DemoStore';
import type { SitemapEdge, SitemapNode, SitemapVariant } from '@/types';
import { useProjectRoutes } from '@/features/projects/projectRoutes';
import { sitemapCreated } from '@/data/sitemap';
import { RequestApprovalButton } from '@/features/portal/RequestApprovalButton';
import { SitemapDevCommentPanel } from './DevComment';
import { NotCreated, ScheduleMissingBanner, SitemapView } from './SitemapView';

/**
 * サイトマップ（demo の入れ物。DemoStore の値と操作を SitemapView へ渡すだけ。LIVE_SITEMAP_IMPL_PLAN P-13）。
 * 管理者画面（/site）と開発者画面（/dev/sitemap。0.26.0）で同じ画面。見た目は SitemapView。live は SitemapView を直接使う
 */
export default function SitemapPage() {
  const { state, dispatch } = useDemo();
  const routes = useProjectRoutes();
  const navigate = useNavigate();
  const approvedAt = state.sitemap.approvedAt;
  // ウォーターフォール: 要件定義書の承認が先
  const reqApproved = state.requirements.status === 'approved';
  const onSave = useCallback(
    (variant: SitemapVariant, nodes: SitemapNode[], edges: SitemapEdge[]) => dispatch({ type: 'setSitemap', variant, nodes, edges }),
    [dispatch],
  );
  return (
    <SitemapView
      source={{
        sitemap: state.sitemap,
        locked: !!approvedAt,
        saveDelayMs: 300,
        onSave,
        aiBadge: {},
        devCommentPanel: <SitemapDevCommentPanel />,
        backTo: routes.detail(currentProject(state).id),
        nav: <BuildFlowNav />,
        // サイトマップは要件定義書の承認のときに作る（はじめは無い。0.29.4）
        created: sitemapCreated(state.sitemap),
        notCreated: <NotCreated requirementsTo={routes.requirements} />,
        reqApproved,
        approvedAt,
        approvedAction: <Button variant="contained" endIcon={<ArrowRight size={16} />} onClick={() => navigate(routes.design)}>デザインへ進む</Button>,
        requestedAt: state.approvalRequests?.sitemap,
        requestAction: <RequestApprovalButton approvalKey="sitemap" blockedReason={state.schedule ? undefined : 'スケジュールを入れると依頼できます'} />,
        banner: reqApproved && !approvedAt && !state.schedule
          ? <ScheduleMissingBanner onOpen={() => navigate(routes.stageLinks.schedule[0]?.to ?? '/schedule')} />
          : undefined,
      }}
    />
  );
}
