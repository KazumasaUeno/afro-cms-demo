import { Box } from '@mui/material';
import { BadgeCheck } from 'lucide-react';
import { PageHeader } from '@/components/ui';
import { RouteLoader } from '@/components/layout/RouteLoader';
import { useCurrentRequirements } from '@/repositories';
import { ProposalView } from '@/features/requirements/ProposalView';
import { ApprovalHistory } from '@/features/projects/ApprovalHistory';
import { useLiveProjects } from '../repositories';
import { EmptyState, LoadError } from './shared';

/**
 * お客様ポータルの確認・承認（live）。担当の 1 案件（accounts.projectId）だけ。
 * 準備中（draft）は内容を見せない。承認待ち・承認済みは保存された要件定義書（承認の対象と同じ写し）を見せる
 */
export default function PortalApprovalPage() {
  const { data: list, loading: pLoading, error: pError } = useLiveProjects();
  const { data: req, loading, error } = useCurrentRequirements();
  const project = list[0];

  if (pLoading || loading) return <RouteLoader label="確認・承認" />;
  if (pError || error) return <LoadError what="要件定義書" />;
  if (!project) return <EmptyState title="ご確認いただく内容はまだありません" body="アフロの担当者からご連絡します。" />;

  return (
    <Box>
      <PageHeader
        eyebrow="お客様ポータル"
        icon={<BadgeCheck size={14} />}
        title="確認・承認"
        description={`${project.siteName}（${project.clientName}）の要件定義書です。`}
      />
      {req.status === 'draft' ? (
        <EmptyState title="要件定義書を準備しています" body="アフロの担当者がヒアリングの内容をまとめています。準備ができたらここで確認・承認していただけます。" />
      ) : (
        <Box sx={{ display: 'grid', gap: 2.5 }}>
          <ProposalView variant="client" />
          <ApprovalHistory projectId={project.id} siteName={project.siteName} />
        </Box>
      )}
    </Box>
  );
}
