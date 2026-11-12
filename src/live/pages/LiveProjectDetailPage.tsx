import { Box, Button, Stack, Typography } from '@mui/material';
import { ArrowLeft, ArrowRight, FolderOpen } from 'lucide-react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { PageHeader, Surface } from '@/components/ui';
import { RouteLoader } from '@/components/layout/RouteLoader';
import { useRepositories } from '@/repositories';
import { ApprovalHistory } from '@/features/projects/ApprovalHistory';
import { formatDateTime } from '@/services/time';
import { useLiveProjects } from '../repositories';
import { useLiveSession } from '../session';
import { EmptyState, LoadError, ReqStatusPill } from './shared';

/** プロジェクトの詳細（管理者: どの案件でも ／ 開発者: 担当の案件だけ＝一覧に無ければ「見つからない」） */
export default function LiveProjectDetailPage() {
  const { projectId = '' } = useParams();
  const { account } = useLiveSession();
  const dev = account.role === 'developer';
  const { data: list, loading, error } = useLiveProjects();
  const { projects } = useRepositories();
  const navigate = useNavigate();
  const base = dev ? '/dev/projects' : '/projects';
  const project = list.find((p) => p.id === projectId);

  // 読み込み中は「見つからない」を出さない（repositories/types.ts の決まり）
  if (loading) return <RouteLoader label="プロジェクト" />;
  if (error) return <LoadError what="プロジェクト" />;
  if (!project) {
    return <EmptyState title="プロジェクトが見つかりません" body={dev ? '担当から外れたか、削除された可能性があります。' : undefined} action={{ to: base, label: 'プロジェクトの一覧へ' }} />;
  }

  const status = project.requirements.status;
  const open = () => {
    projects.select(project.id);
    navigate(dev ? '/dev/hearing' : '/ai-studio');
  };
  const openLabel = status === 'draft' ? (dev ? 'ヒアリングを入力する' : 'ヒアリングの回答を入力する') : '要件定義書を見る';

  const rows: [string, string][] = [
    ['お客様', project.clientName],
    ['サイトの URL', project.siteUrl],
    ['業種', project.industry],
    ['公開予定日', project.launchDate ? formatDateTime(project.launchDate).split(' ')[0] : '未定'],
    ['担当の開発者', `${project.memberUids.length} 名`],
    ['更新', formatDateTime(project.updatedAt)],
  ];

  return (
    <Box>
      <Button component={RouterLink} to={base} size="small" startIcon={<ArrowLeft size={16} />} sx={{ mb: 2, ml: -1 }}>プロジェクトの一覧</Button>
      <PageHeader
        eyebrow={dev ? '開発者画面' : '管理者画面'}
        icon={<FolderOpen size={14} />}
        title={project.siteName}
        description={<ReqStatusPill status={status} />}
        actions={<Button variant="contained" endIcon={<ArrowRight size={16} />} onClick={open}>{openLabel}</Button>}
      />
      <Stack spacing={2}>
        <Surface>
          <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '160px 1fr' }, gap: { xs: 0.25, sm: 1.25 } }}>
            {rows.map(([k, v]) => (
              <Box key={k} sx={{ display: 'contents' }}>
                <Typography component="dt" variant="caption" sx={{ mt: { xs: 1, sm: 0 } }}>{k}</Typography>
                <Typography component="dd" variant="body2" sx={{ m: 0, overflowWrap: 'anywhere' }}>{v}</Typography>
              </Box>
            ))}
          </Box>
          {!dev && (
            <Typography variant="caption" component="p" sx={{ mt: 2 }}>
              開発者の担当は「ユーザー」の開発者の一覧から「担当を変更」で割り当てます。お客様は「ユーザー」からこのプロジェクトを選んで招待します。
            </Typography>
          )}
        </Surface>
        <ApprovalHistory projectId={project.id} siteName={project.siteName} />
      </Stack>
    </Box>
  );
}
