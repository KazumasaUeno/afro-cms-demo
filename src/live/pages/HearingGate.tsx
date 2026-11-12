import { Box, Button, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { RouteLoader } from '@/components/layout/RouteLoader';
import { useRepositories } from '@/repositories';
import { useLiveProjects } from '../repositories';
import { useLiveSession } from '../session';
import { EmptyState, LoadError, ReqStatusPill } from './shared';

/**
 * live のヒアリング画面の前に置く: 対象の案件が無ければ案内を出す（空の要件へ書き込ませない）。
 * どの案件を開いているかを上に出す（共有のヒアリング画面は案件名を出さないため）
 */
export default function HearingGate({ children }: { children: ReactNode }) {
  const { account } = useLiveSession();
  const { data: list, loading, error } = useLiveProjects();
  const currentId = useRepositories().projects.useCurrentId();
  const base = account.role === 'developer' ? '/dev/projects' : '/projects';
  const project = list.find((p) => p.id === currentId);

  if (loading) return <RouteLoader label="プロジェクト" />;
  if (error) return <LoadError what="プロジェクト" />;
  if (!project) return <EmptyState title="プロジェクトを選んでください" body="ヒアリングは、プロジェクトの詳細から開きます。" action={{ to: base, label: 'プロジェクトの一覧へ' }} />;

  return (
    <Box>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2, flexWrap: 'wrap', rowGap: 1 }}>
        <Typography variant="caption">対象のプロジェクト</Typography>
        <Typography variant="body2" sx={{ fontWeight: 650, overflowWrap: 'anywhere' }}>{project.siteName}（{project.clientName}）</Typography>
        <ReqStatusPill status={project.requirements.status} />
        <Button size="small" component={RouterLink} to={`${base}/${project.id}`}>詳細へ</Button>
      </Stack>
      {children}
    </Box>
  );
}
