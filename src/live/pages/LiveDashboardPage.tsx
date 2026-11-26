import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import { FolderKanban, Hammer, LayoutDashboard, MessageSquare } from 'lucide-react';
import { useMemo } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { PageHeader, SectionTitle, StatusPill, Surface } from '@/components/ui';
import { RouteLoader } from '@/components/layout/RouteLoader';
import { ProjectCardView } from '@/features/dev/ProjectCardView';
import { tokens } from '@/theme/tokens';
import { TASK_TONE, taskLabel } from '@/features/dev/devUi';
import { dashboardCards, dashboardCopy, listLimitNote, projectBase, REQ_STATUS_ORDER, statusCounts, type DashboardRole } from '../dashboard';
import type { ProjectDoc } from '../model';
import { useLiveCurrentProject, useLiveProjects, useLiveTasks } from '../repositories';
import { myOpenTasks, nextBuildAction, TASK_STATUS_ORDER, taskCounts, taskLimitNote } from '../tasks';
import { useLiveSession } from '../session';
import { unansweredCount } from '../consult';
import { EmptyState, LoadError, ReqStatusPill } from './shared';

/**
 * live のダッシュボード（docs/design/LIVE_DASHBOARD_TASKS_CONSULT.md §1.1・U1）。
 * - 開発者（/dev）: 担当案件 ／ 管理者（/dashboard）: 全案件・見るだけ。材料は既存の案件一覧の購読だけ（追加の Read 0）
 * - 出すもの: 要件の状態ごとの件数と案件のカード（demo の開発者ダッシュボードと同じ見た目 ProjectCardView）
 * - 構築状況（U2）: 表示中の 1 案件のタスクの状態別件数・構築で次にやること・（開発者は）あなたのタスク上位 3 件。
 *   購読は構築タスク画面と同じ useLiveTasks（キー t:{pid}）
 * - 相談の未対応（U3）: 最後がお客様の案件の数（案件一覧の consult。追加 Read 0）
 * - 出さないもの: 最近のデプロイ（live に記録が無い。NC-6）
 * メニューへの追加は U4（それまでは URL から開く）
 */
export default function LiveDashboardPage() {
  const { account, uid } = useLiveSession();
  const role: DashboardRole = account.role === 'developer' ? 'developer' : 'admin';
  const { data: docs, loading, error } = useLiveProjects();
  const navigate = useNavigate();
  const cards = useMemo(() => dashboardCards(docs), [docs]);
  const counts = useMemo(() => statusCounts(docs), [docs]);
  const copy = dashboardCopy(role, docs.length);
  const base = projectBase(role);
  const limitNote = listLimitNote(docs.length);
  // 相談の未対応（最後がお客様の案件の数。案件一覧の consult から数える＝追加 Read 0。U3）
  const unanswered = useMemo(() => unansweredCount(docs, account.role, uid), [docs, account.role, uid]);
  const chatPath = role === 'developer' ? '/dev/chat' : '/chat';

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
          {limitNote && <Alert severity="info" data-testid="dashboard-list-limit">{limitNote}</Alert>}
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

          {/* 相談の未対応（U3）。admin は見るだけ、開発者は担当案件（全員が返信者） */}
          <Surface padding={{ xs: 2, md: 2.5 }} data-testid="dashboard-consult">
            <Stack direction="row" spacing={1.5} alignItems="center" useFlexGap sx={{ flexWrap: 'wrap' }}>
              <MessageSquare size={18} color={tokens.color.muted} aria-hidden />
              <Typography variant="body2" sx={{ fontWeight: 650, flex: 1, minWidth: 0 }} data-testid="dashboard-consult-count">
                {unanswered > 0 ? `相談の未対応が ${unanswered} 件あります` : '相談の未対応はありません'}
              </Typography>
              <Button size="small" variant={unanswered > 0 ? 'outlined' : 'text'} component={RouterLink} to={chatPath} sx={{ minHeight: 44 }}>相談を開く</Button>
            </Stack>
          </Surface>

          <BuildStatus role={role} />

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

/** 構築状況（表示中の 1 案件。設計 §1.1）。admin は見るだけ（全タスクを数え、行き先のボタンは構築タスク画面だけ） */
function BuildStatus({ role }: { role: DashboardRole }) {
  const project = useLiveCurrentProject();
  const { uid } = useLiveSession();
  const q = useLiveTasks(project?.id ?? null);
  const counts = useMemo(() => taskCounts(q.data), [q.data]);
  const mine = useMemo(() => (role === 'developer' ? myOpenTasks(q.data, uid) : []), [q.data, role, uid]);
  if (!project) return null;
  const action = nextBuildAction(project.requirements.status, q.data, role === 'developer' ? uid : null);
  const tasksPath = role === 'developer' ? '/dev/tasks' : '/tasks';
  const note = taskLimitNote(q.data.length);
  return (
    <Box component="section" aria-label="構築状況" data-testid="dashboard-build-status" sx={{ minWidth: 0 }}>
      <SectionTitle
        title="構築状況"
        icon={<Hammer size={18} color={tokens.color.muted} />}
        sub={<ProjectName p={project} />}
      />
      <Surface padding={{ xs: 2, md: 2.5 }}>
        {q.error ? (
          <Typography variant="body2" color="error">構築タスクを読み込めませんでした。接続を確かめて再読み込みしてください。</Typography>
        ) : q.loading ? (
          <Typography variant="body2" color="text.secondary">読み込み中…</Typography>
        ) : (
          <Stack spacing={2}>
            <Box>
              <Typography variant="caption" sx={{ display: 'block', mb: 0.5 }}>構築で次にやること</Typography>
              <Stack direction="row" spacing={1.5} alignItems="center" useFlexGap sx={{ flexWrap: 'wrap' }}>
                <Typography variant="body2" sx={{ fontWeight: 650 }} data-testid="dashboard-next-action">{action.title}</Typography>
                {action.cta && action.to && <Button size="small" variant="outlined" component={RouterLink} to={action.to} sx={{ minHeight: 44 }}>{action.cta}</Button>}
              </Stack>
            </Box>
            <Stack direction="row" useFlexGap flexWrap="wrap" role="list" aria-label={`タスク 全 ${q.data.length} 件の状態ごとの件数`} sx={{ gap: 1 }}>
              {TASK_STATUS_ORDER.map((s) => (
                <Stack role="listitem" key={s} direction="row" spacing={0.75} alignItems="center">
                  <StatusPill tone={TASK_TONE[s]}>{taskLabel(s)}</StatusPill>
                  <Typography variant="body2" sx={{ fontWeight: 650, fontVariantNumeric: 'tabular-nums', pr: 1 }}>{counts[s]}</Typography>
                </Stack>
              ))}
            </Stack>
            {role === 'developer' && (
              <Box>
                <Typography variant="caption" sx={{ display: 'block', mb: 0.5 }}>あなたのタスク（完了していないもの）</Typography>
                {mine.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">担当している未完了のタスクはありません。</Typography>
                ) : (
                  <Stack component="ul" spacing={0.75} sx={{ m: 0, p: 0, listStyle: 'none' }}>
                    {mine.map((t) => (
                      <Stack component="li" key={t.id} direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                        <StatusPill tone={TASK_TONE[t.status]}>{taskLabel(t.status)}</StatusPill>
                        <Typography variant="body2" noWrap sx={{ minWidth: 0 }} title={`${t.page}: ${t.title}`}>{t.page}: {t.title}</Typography>
                      </Stack>
                    ))}
                  </Stack>
                )}
              </Box>
            )}
            {note && <Typography variant="caption">{note}</Typography>}
            <Box><Button size="small" component={RouterLink} to={tasksPath} sx={{ minHeight: 44 }}>構築タスクを開く</Button></Box>
          </Stack>
        )}
      </Surface>
    </Box>
  );
}

function ProjectName({ p }: { p: ProjectDoc }) {
  return <Typography variant="caption" sx={{ overflowWrap: 'anywhere' }}>{p.siteName}（{p.clientName}）</Typography>;
}
