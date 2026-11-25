import { Box, Stack, Typography } from '@mui/material';
import { FolderKanban, LayoutDashboard } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader, SectionTitle, Surface } from '@/components/ui';
import { RouteLoader } from '@/components/layout/RouteLoader';
import { ProjectCardView } from '@/features/dev/ProjectCardView';
import { tokens } from '@/theme/tokens';
import { dashboardCards, dashboardCopy, projectBase, REQ_STATUS_ORDER, statusCounts, type DashboardRole } from '../dashboard';
import { useLiveProjects } from '../repositories';
import { useLiveSession } from '../session';
import { EmptyState, LoadError, ReqStatusPill } from './shared';

/**
 * live のダッシュボード（docs/design/LIVE_DASHBOARD_TASKS_CONSULT.md §1.1・U1）。
 * - 開発者（/dev）: 担当案件 ／ 管理者（/dashboard）: 全案件・見るだけ。材料は既存の案件一覧の購読だけ（追加の Read 0）
 * - 出すもの: 要件の状態ごとの件数と案件のカード（demo の開発者ダッシュボードと同じ見た目 ProjectCardView）
 * - 出さないもの: 構築状況（タスク。U2 で追加）・相談の未対応（U3）・最近のデプロイ（live に記録が無い。NC-6）
 * メニューへの追加は U4（それまでは URL から開く）
 */
export default function LiveDashboardPage() {
  const { account } = useLiveSession();
  const role: DashboardRole = account.role === 'developer' ? 'developer' : 'admin';
  const { data: docs, loading, error } = useLiveProjects();
  const navigate = useNavigate();
  const cards = useMemo(() => dashboardCards(docs), [docs]);
  const counts = useMemo(() => statusCounts(docs), [docs]);
  const copy = dashboardCopy(role, docs.length);
  const base = projectBase(role);

  if (loading) return <RouteLoader label="ダッシュボード" />;
  if (error) return <LoadError what="プロジェクトの一覧" />;

  return (
    <>
      <PageHeader eyebrow={copy.eyebrow} icon={<LayoutDashboard size={15} />} title={copy.title} description={copy.description} />

      {docs.length === 0 ? (
        <Box data-testid="dev-no-projects" sx={{ maxWidth: 600, mx: 'auto' }}>
          <EmptyState title={copy.empty.title} body={copy.empty.body} action={copy.empty.action} />
        </Box>
      ) : (
        <Stack spacing={{ xs: 2.5, md: 3 }}>
          {/* 要件の状態ごとの件数（お客様の承認待ちなど） */}
          <Surface padding={{ xs: 2, md: 2.5 }} data-testid="dashboard-status-counts">
            <Stack
              direction="row" useFlexGap flexWrap="wrap" role="list" aria-label={`案件 全 ${docs.length} 件の状態ごとの件数`}
              sx={{ gap: 1 }}
            >
              {REQ_STATUS_ORDER.map((s) => (
                <Stack role="listitem" key={s} direction="row" spacing={0.75} alignItems="center">
                  <ReqStatusPill status={s} />
                  <Typography variant="body2" sx={{ fontWeight: 650, fontVariantNumeric: 'tabular-nums', pr: 1 }}>{counts[s]}</Typography>
                </Stack>
              ))}
            </Stack>
          </Surface>

          <Box component="section" aria-label={copy.sectionTitle} sx={{ minWidth: 0 }}>
            <SectionTitle
              title={copy.sectionTitle}
              icon={<FolderKanban size={18} color={tokens.color.muted} />}
              sub={<Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums' }}>{docs.length} 件</Typography>}
            />
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', sm: 'repeat(2, minmax(0,1fr))' }, gap: 2 }}>
              {cards.map((p) => (
                <ProjectCardView key={p.id} p={p} next={p.nextAction} launchDate={p.launchDate} onOpen={() => navigate(`${base}/${p.id}`)} />
              ))}
            </Box>
          </Box>
        </Stack>
      )}
    </>
  );
}
