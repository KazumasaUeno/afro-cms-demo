import { Box, Button, ButtonBase, Stack, Typography } from '@mui/material';
import { ArrowRight, CircleCheck, FolderKanban, FolderLock, LayoutDashboard, Rocket } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PageHeader, SectionTitle, StatusPill, Surface } from '@/components/ui';
import { CLIENT_PROJECT_ID } from '@/components/layout/nav';
import { useDemo, devState } from '@/store/DemoStore';
import { formatDateTime, relativeTime } from '@/services/time';
import { DEV_TASK_STATUSES } from '@/data/dev';
import { nextBestAction, stagePrimaryRoute } from '@/features/projects/projectHelpers';
import { tokens } from '@/theme/tokens';
import type { DevTaskStatus, Project } from '@/types';
import { ENV_TONE, TASK_TONE, envDef, nextDevAction, taskLabel } from './devUi';
import { DevMono } from './DevMono';
import { DevProjectCard } from './DevProjectCard';
import { useDevProjects, useDevUser } from './useDevUser';

/** 「あなたのタスク」の並び順（作業中 → レビュー待ち → 未着手） */
const MINE_ORDER: Record<DevTaskStatus, number> = { doing: 0, review: 1, todo: 2, done: 3 };

/**
 * 開発者画面のダッシュボード（11/10 レビュー）。
 * 1. 担当している案件（進捗・段階・次の作業・公開予定日。押すとその案件の作業画面を開く）
 * 2. お客様の承認待ち・対応状況
 * 3. 構築状況（タスク・環境・デプロイ・エラー。開発データはデモの案件の分だけ）
 * このページは DevProjectGate を通さない（表示中の案件が担当外でも、担当案件の一覧は出す）
 */
export default function DevDashboardPage() {
  const { state, dispatch } = useDemo();
  // ログイン中のメンバー（「自分の担当」「あなた」の判定と、操作の記録に使う）
  const me = useDevUser();
  const projects = useDevProjects();
  const navigate = useNavigate();
  // 開発データ・お客様の承認のデータがあるのはデモの案件（MINAMO COFFEE）だけ
  const demo = projects.find((p) => p.id === CLIENT_PROJECT_ID);
  const flow = nextBestAction(state);

  // 作業画面（管理者画面・構築タスクなど）は表示中の案件で動くので、案件を切り替えてから開く
  const open = (id: string, to: string) => {
    dispatch({ type: 'setCurrentProject', id });
    navigate(to);
  };
  // デモの案件は制作フローの「次の一手」、ほかの案件はいまの段階の画面
  const work = (p: Project) =>
    p.id === CLIENT_PROJECT_ID ? { next: flow.cta, to: flow.to } : { next: p.nextAction, to: stagePrimaryRoute(p.stage) };

  return (
    <>
      <PageHeader
        eyebrow="開発者画面"
        icon={<LayoutDashboard size={15} />}
        title="担当案件"
        description={projects.length
          ? `担当している案件は ${projects.length} 件です。案件を押すと、その案件の作業画面を開きます。`
          : '担当している案件はまだありません。'}
      />

      {projects.length === 0 ? (
        <Surface data-testid="dev-no-projects" sx={{ textAlign: 'center', py: { xs: 5, md: 7 }, px: { xs: 2.5, md: 4 }, maxWidth: 600, mx: 'auto' }}>
          <Stack alignItems="center" spacing={1.5}>
            <FolderLock size={36} color={tokens.color.faint} aria-hidden />
            <Typography variant="h3" component="h2">担当している案件がありません</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
              開発者画面は、担当の案件だけを開けます。管理者に担当の追加を依頼してください（管理者画面の「ユーザー管理」で設定します）。
            </Typography>
          </Stack>
        </Surface>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: { xs: 2.5, md: 3 }, alignItems: 'start' }}>
          {/* 担当している案件 */}
          <Box component="section" aria-label="担当している案件" sx={{ minWidth: 0 }}>
            <SectionTitle
              title="担当している案件"
              icon={<FolderKanban size={18} color={tokens.color.muted} />}
              sub={<Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums' }}>{projects.length} 件</Typography>}
            />
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', sm: 'repeat(2, minmax(0,1fr))' }, gap: 2 }}>
              {projects.map((p) => {
                const w = work(p);
                return <DevProjectCard key={p.id} p={p} next={w.next} onOpen={() => open(p.id, w.to)} />;
              })}
            </Box>
          </Box>

        </Box>
      )}

      {demo && <BuildStatus project={demo} meId={me.id} openWork={(to) => open(demo.id, to)} />}
    </>
  );
}

/**
 * デモの案件の構築状況（タスク・環境・デプロイ・エラー）。担当案件の下に、件数を絞って控えめに出す。
 * 構築タスク・環境の画面は表示中の案件で動くので、openWork で案件を切り替えてから開く
 */
function BuildStatus({ project, meId, openWork }: { project: Project; meId: string; openWork: (to: string) => void }) {
  const { state } = useDemo();
  const dev = devState(state);
  const mineAll = dev.tasks.filter((t) => t.assigneeId === meId && t.status !== 'done');
  const mine = [...mineAll].sort((a, b) => MINE_ORDER[a.status] - MINE_ORDER[b.status]).slice(0, 3);
  const next = nextDevAction(dev, !!state.design.approvedAt, meId);

  return (
    <Box component="section" aria-labelledby="build-status-title" sx={{ mt: { xs: 4, md: 5 }, pt: { xs: 3, md: 4 }, borderTop: `1px solid ${tokens.color.border}` }}>
      <Box sx={{ mb: 2 }}>
        <Typography id="build-status-title" variant="h4" component="h2">構築状況 — {project.siteName}</Typography>
        <Typography variant="caption" sx={{ display: 'block', mt: 0.25 }}>
          開発データはこの案件の分だけです。あなたの担当で未完了のタスクは {mineAll.length} 件です。
        </Typography>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: { xs: 2.5, md: 3 }, alignItems: 'start' }}>
        {/* 次にやること → あなたのタスク（件数つき） → 最近のデプロイ（環境の詳細は「環境・デプロイ」） */}
        <Stack spacing={{ xs: 2.5, md: 3 }} sx={{ minWidth: 0 }}>
          <Surface padding={{ xs: 2, md: 2.5 }} data-testid="next-action">
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'stretch', sm: 'center' }}>
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ width: 36, height: 36, borderRadius: '50%', bgcolor: tokens.color.bgSubtle, color: tokens.color.inkSoft, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  {next.to ? <Rocket size={17} aria-hidden /> : <CircleCheck size={17} aria-hidden />}
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="caption" sx={{ display: 'block', fontWeight: 650 }}>構築で次にやること</Typography>
                  <Typography variant="body1" component="h3" sx={{ fontWeight: 700 }}>{next.title}</Typography>
                </Box>
              </Stack>
              {next.cta && next.to && (
                <Button variant="outlined" endIcon={<ArrowRight size={16} />} onClick={() => openWork(next.to!)} sx={{ minHeight: 44, flexShrink: 0 }}>
                  {next.cta}
                </Button>
              )}
            </Stack>
          </Surface>

          <Surface>
            <SectionTitle
              title="あなたのタスク"
              sub={<Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums' }}>未完了 {mineAll.length} 件</Typography>}
              action={<Button size="small" sx={{ minHeight: 44, flexShrink: 0 }} onClick={() => openWork('/dev/tasks')}>構築タスクへ</Button>}
            />
            {mine.length === 0 ? (
              <Typography variant="body2" color="text.secondary">担当の未完了タスクはありません</Typography>
            ) : (
              <Stack component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                {mine.map((t, i) => (
                  <Box component="li" key={t.id} sx={{ borderTop: i ? `1px solid ${tokens.color.border}` : 'none' }}>
                    <ButtonBase
                      onClick={() => openWork('/dev/tasks')}
                      aria-label={`${t.page}（${taskLabel(t.status)}）をタスク一覧で開く`}
                      sx={{
                        width: 'calc(100% + 16px)', minHeight: 48, px: 1, mx: -1, borderRadius: `${tokens.radius.sm}px`,
                        display: 'flex', justifyContent: 'flex-start', gap: 1.5, textAlign: 'left',
                        '&:hover': { bgcolor: tokens.color.surfaceMuted }, '&.Mui-focusVisible': { boxShadow: tokens.shadow.focus },
                      }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: 650, flex: 1, minWidth: 0 }} noWrap>{t.page}</Typography>
                      <StatusPill tone={TASK_TONE[t.status]}>{taskLabel(t.status)}</StatusPill>
                      <Typography variant="caption" sx={{ flexShrink: 0, width: { xs: 64, sm: 80 }, textAlign: 'right' }}>{relativeTime(t.updatedAt)}</Typography>
                    </ButtonBase>
                  </Box>
                ))}
              </Stack>
            )}
            <Stack
              direction="row" useFlexGap flexWrap="wrap" role="list" aria-label={`構築タスク 全 ${dev.tasks.length} 件の状態ごとの件数`}
              sx={{ gap: 1, mt: 2, pt: 1.5, borderTop: `1px solid ${tokens.color.border}` }}
            >
              {DEV_TASK_STATUSES.map((s) => (
                <Stack role="listitem" key={s.id} direction="row" spacing={0.75} alignItems="center">
                  <StatusPill tone={TASK_TONE[s.id]}>{s.label}</StatusPill>
                  <Typography variant="body2" sx={{ fontWeight: 650, fontVariantNumeric: 'tabular-nums', pr: 1 }}>{dev.tasks.filter((t) => t.status === s.id).length}</Typography>
                </Stack>
              ))}
            </Stack>
          </Surface>

          <Surface>
            <SectionTitle title="最近のデプロイ" action={<Button size="small" sx={{ minHeight: 44, flexShrink: 0 }} onClick={() => openWork('/dev/deploys')}>環境・デプロイへ</Button>} />
            <Stack component="ul" spacing={1.25} sx={{ listStyle: 'none', m: 0, p: 0 }}>
              {dev.deploys.slice(0, 3).map((d) => (
                <Stack component="li" key={d.id} direction="row" spacing={1.5} alignItems="flex-start">
                  <StatusPill tone={ENV_TONE[d.env]} dot={false}>{envDef(d.env).label}</StatusPill>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <DevMono size="md">v{d.version}</DevMono>
                      {d.status === 'failed' && <StatusPill tone="danger">失敗</StatusPill>}
                    </Stack>
                    <Typography variant="caption" sx={{ display: 'block' }}>{d.note}・{d.by}・<DevMono size="sm">{formatDateTime(d.at)}</DevMono></Typography>
                  </Box>
                </Stack>
              ))}
            </Stack>
          </Surface>
        </Stack>

      </Box>
    </Box>
  );
}
