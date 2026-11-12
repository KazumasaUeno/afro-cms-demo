import { Box, Button, Stack, Typography } from '@mui/material';
import { FolderKanban, Plus } from 'lucide-react';
import { Link as RouterLink } from 'react-router-dom';
import { PageHeader, Surface } from '@/components/ui';
import { RouteLoader } from '@/components/layout/RouteLoader';
import { formatDateTime } from '@/services/time';
import { tokens } from '@/theme/tokens';
import { useLiveProjects } from '../repositories';
import { useLiveSession } from '../session';
import { EmptyState, LoadError, ReqStatusPill } from './shared';

/** プロジェクトの一覧（管理者: 全件 ／ 開発者: 担当の案件だけ。Rules の memberUids 条件つきの購読） */
export default function ProjectsListPage() {
  const { account } = useLiveSession();
  const dev = account.role === 'developer';
  const { data: list, loading, error } = useLiveProjects();
  const base = dev ? '/dev/projects' : '/projects';

  if (loading) return <RouteLoader label="プロジェクト" />;
  if (error) return <LoadError what="プロジェクトの一覧" />;

  return (
    <Box>
      <PageHeader
        eyebrow={dev ? '開発者画面' : '管理者画面'}
        icon={<FolderKanban size={14} />}
        title="プロジェクト"
        description={dev ? '担当しているプロジェクトです。ヒアリングの入力・AI 分析・お客様への承認依頼をここから進めます。' : 'すべてのプロジェクトです。開発者の担当は「ユーザー」で割り当てます。'}
        actions={dev ? <Button variant="contained" startIcon={<Plus size={16} />} component={RouterLink} to="/dev/projects/new">新しいプロジェクト</Button> : undefined}
      />
      {list.length === 0 ? (
        <EmptyState
          title={dev ? '担当のプロジェクトはまだありません' : 'プロジェクトはまだありません'}
          body={dev ? '新しいプロジェクトを作成するか、管理者に担当を割り当ててもらってください。' : 'プロジェクトは開発者が作成します。'}
          action={dev ? { to: '/dev/projects/new', label: '新しいプロジェクト' } : undefined}
        />
      ) : (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)', xl: 'repeat(3, 1fr)' } }}>
          {list.map((p) => (
            <Box component="li" key={p.id} sx={{ minWidth: 0 }}>
              <RouterLink to={`${base}/${p.id}`} style={{ display: 'block', height: '100%', textDecoration: 'none', color: 'inherit' }}>
              <Surface interactive sx={{ borderLeft: `4px solid ${p.accent || tokens.color.primary}`, height: '100%' }}>
                <Stack spacing={1}>
                  <Typography variant="caption" sx={{ overflowWrap: 'anywhere' }}>{p.clientName}</Typography>
                  <Typography variant="h4" component="h2" sx={{ overflowWrap: 'anywhere' }}>{p.siteName}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{p.siteUrl}</Typography>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 1 }}>
                    <ReqStatusPill status={p.requirements.status} />
                    <Typography variant="caption">更新 {formatDateTime(p.updatedAt)}</Typography>
                  </Stack>
                </Stack>
              </Surface>
              </RouterLink>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
