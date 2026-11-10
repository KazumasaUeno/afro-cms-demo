import { Box, Button, ButtonBase, Link, Stack, Typography } from '@mui/material';
import { AlertTriangle, ArrowRight, CircleAlert, CircleCheck, ExternalLink, FolderKanban, FolderLock, LayoutDashboard, Rocket, UserRound } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader, SectionTitle, StatusPill, Surface } from '@/components/ui';
import { CLIENT_PROJECT_ID } from '@/components/layout/nav';
import { useDemo, devState } from '@/store/DemoStore';
import { formatDateTime, relativeTime } from '@/services/time';
import { DEV_ENVS, DEV_TASK_STATUSES, devRecentErrors, latestDeploy, latestSuccess } from '@/data/dev';
import { nextBestAction, stagePrimaryRoute } from '@/features/projects/projectHelpers';
import { ClientStatusPanel } from '@/features/projects/ClientStatusPanel';
import { ApprovalHistory } from '@/features/projects/ApprovalHistory';
import { tokens } from '@/theme/tokens';
import { TOUCH } from '@/theme/media';
import type { DevTaskStatus, Project } from '@/types';
import { ENV_TONE, TASK_TONE, envDef, envSync, nextDevAction, taskLabel } from './devUi';
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
  const others = projects.filter((p) => p.id !== CLIENT_PROJECT_ID);
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
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', lg: 'minmax(0,1fr) 360px' }, gap: { xs: 2.5, md: 3 }, alignItems: 'start' }}>
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

          {/* お客様の承認待ち・対応状況（デモの案件は承認の節目、ほかの案件は承認待ちの件数） */}
          <Box component="section" aria-label="お客様の承認待ち・対応状況" sx={{ minWidth: 0 }}>
            <SectionTitle title="お客様の承認待ち・対応状況" icon={<UserRound size={18} color={tokens.color.muted} />} />
            <Stack spacing={2}>
              {demo && <ClientStatusPanel />}
              {demo && <ApprovalHistory projectId={demo.id} siteName={demo.siteName} />}
              {others.length > 0 && (
                <Surface data-testid="dev-other-approvals">
                  <Typography variant="body2" component="h3" sx={{ fontWeight: 700 }}>{demo ? 'ほかの担当案件' : '担当案件'}</Typography>
                  <Typography variant="caption" sx={{ display: 'block', mb: 1 }}>お客様の承認待ちの件数です</Typography>
                  <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                    {others.map((p) => (
                      <Box component="li" key={p.id}>
                        <ButtonBase
                          onClick={() => open(p.id, `/projects/${p.id}`)}
                          aria-label={`${p.siteName}: ${p.pendingApprovals > 0 ? `お客様の承認待ち ${p.pendingApprovals} 件` : '承認待ちなし'}。詳細を開く`}
                          sx={{
                            width: 'calc(100% + 16px)', minHeight: 44, px: 1, mx: -1, borderRadius: `${tokens.radius.sm}px`, gap: 1, justifyContent: 'flex-start', textAlign: 'left',
                            '&:hover': { bgcolor: tokens.color.surfaceMuted }, '&:hover .go': { opacity: 1 }, '&.Mui-focusVisible': { boxShadow: tokens.shadow.focus },
                          }}
                        >
                          <Box sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: p.accent, flexShrink: 0 }} aria-hidden />
                          <Typography variant="body2" sx={{ fontWeight: 600, flex: 1, minWidth: 0 }} noWrap>{p.siteName}</Typography>
                          {p.pendingApprovals > 0
                            ? <StatusPill tone="warning">承認待ち {p.pendingApprovals} 件</StatusPill>
                            : <StatusPill tone="success">待ちなし</StatusPill>}
                          <Box className="go" sx={{ display: 'flex', opacity: 0.4, color: tokens.color.muted, flexShrink: 0, [TOUCH]: { opacity: 0.8 } }}><ArrowRight size={16} /></Box>
                        </ButtonBase>
                      </Box>
                    ))}
                  </Box>
                </Surface>
              )}
            </Stack>
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
  const errors = useMemo(() => devRecentErrors().slice(0, 3), []);
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

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', lg: 'minmax(0,1fr) 360px' }, gap: { xs: 2.5, md: 3 }, alignItems: 'start' }}>
        {/* 左列: 次にやること → あなたのタスク（件数つき） → 最近のデプロイ */}
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

        {/* 右列: 環境 → 最近のエラー（390px では左列の直後） */}
        <Stack spacing={{ xs: 2.5, md: 3 }} sx={{ minWidth: 0 }}>
          <Surface>
            <SectionTitle title="環境" sub={<StatusPill tone="neutral" dot={false}>シミュレーション</StatusPill>} />
            <Stack>
              {DEV_ENVS.map((e, i) => {
                // 表示する版は「いま動いている版」＝最後に成功した版（失敗は状態の印で示す）
                const d = latestSuccess(dev.deploys, e.id) ?? latestDeploy(dev.deploys, e.id);
                const sync = envSync(dev, e.id);
                return (
                  <Box key={e.id} data-env={e.id} sx={{ pt: i ? 1.5 : 0, pb: i < DEV_ENVS.length - 1 ? 1.5 : 0, borderTop: i ? `1px solid ${tokens.color.border}` : 'none' }}>
                    <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                      <Typography variant="body2" component="h3" sx={{ fontWeight: 650 }}>{e.label}</Typography>
                      <StatusPill tone={sync.tone}>{sync.label}</StatusPill>
                    </Stack>
                    <DevMono size="lg" sx={{ display: 'block', mt: 0.5 }}>{d ? `v${d.version}` : '—'}</DevMono>
                    <Stack direction="row" useFlexGap flexWrap="wrap" alignItems="center" sx={{ columnGap: 1.5 }}>
                      <Link
                        href={e.url} target="_blank" rel="noopener noreferrer"
                        onClick={(ev) => ev.preventDefault()}
                        title="デモのため開きません"
                        underline="hover"
                        sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, minHeight: 44, wordBreak: 'break-all', color: tokens.color.muted }}
                      >
                        <DevMono size="sm">{e.url.replace('https://', '')}</DevMono>
                        <ExternalLink size={13} style={{ flexShrink: 0 }} />
                      </Link>
                      <Typography variant="caption">{d ? `${relativeTime(d.at)}・${d.by}` : 'まだデプロイしていません'}</Typography>
                    </Stack>
                  </Box>
                );
              })}
            </Stack>
          </Surface>

          <Surface>
            <SectionTitle title="最近のエラー" sub={<StatusPill tone="neutral" dot={false}>デモデータ</StatusPill>} />
            <Stack component="ul" spacing={1.5} sx={{ listStyle: 'none', m: 0, p: 0 }}>
              {errors.map((e) => (
                <Stack component="li" key={e.id} direction="row" spacing={1.25} alignItems="flex-start">
                  <Box sx={{ color: e.level === 'error' ? tokens.color.danger : tokens.color.warning, pt: 0.25, flexShrink: 0 }}>
                    {e.level === 'error' ? <CircleAlert size={17} aria-hidden /> : <AlertTriangle size={17} aria-hidden />}
                  </Box>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{e.message}</Typography>
                    <Stack direction="row" useFlexGap flexWrap="wrap" alignItems="center" sx={{ gap: 0.75, mt: 0.5 }}>
                      <StatusPill tone={ENV_TONE[e.env]} dot={false}>{envDef(e.env).label}</StatusPill>
                      <Typography variant="caption">{e.level === 'error' ? 'エラー' : '警告'}・{relativeTime(e.at)}</Typography>
                      <Typography variant="caption"><DevMono size="sm">{e.count}</DevMono> 回</Typography>
                    </Stack>
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
