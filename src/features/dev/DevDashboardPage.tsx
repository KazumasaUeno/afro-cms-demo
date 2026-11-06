import { Box, Button, ButtonBase, Link, Stack, Typography } from '@mui/material';
import { AlertTriangle, ArrowRight, CircleAlert, CircleCheck, ExternalLink, LayoutDashboard, Rocket } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader, SectionTitle, StatusPill, Surface } from '@/components/ui';
import { useDemo, devState } from '@/store/DemoStore';
import { formatDateTime, relativeTime } from '@/services/time';
import { DEV_ENVS, DEV_TASK_STATUSES, DEV_USER_ID, devRecentErrors, latestDeploy } from '@/data/dev';
import { QUALITY_ITEMS } from '@/data/quality';
import { tokens } from '@/theme/tokens';
import type { DevTaskStatus } from '@/types';
import { ENV_TONE, TASK_TONE, envDef, envSync, nextDevAction, taskLabel } from './devUi';
import { DevMono } from './DevMono';

/** 「あなたのタスク」の並び順（作業中 → レビュー待ち → 未着手） */
const MINE_ORDER: Record<DevTaskStatus, number> = { doing: 0, review: 1, todo: 2, done: 3 };

export default function DevDashboardPage() {
  const { state } = useDemo();
  const navigate = useNavigate();
  const dev = devState(state);
  const errors = useMemo(() => devRecentErrors(), []);
  const mineAll = dev.tasks.filter((t) => t.assigneeId === DEV_USER_ID && t.status !== 'done');
  const mine = [...mineAll].sort((a, b) => MINE_ORDER[a.status] - MINE_ORDER[b.status]).slice(0, 5);
  const aItems = QUALITY_ITEMS.filter((i) => i.priority === 'A');
  const aChecked = aItems.filter((i) => state.qualityChecks[i.id]?.afroAt).length;
  const next = nextDevAction(dev);

  return (
    <>
      <PageHeader
        eyebrow="開発者画面"
        icon={<LayoutDashboard size={15} />}
        title="今日の作業"
        description={`MINAMO COFFEE の構築状況です。あなたの担当で未完了のタスクは ${mineAll.length} 件です。`}
      />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', lg: 'minmax(0,1fr) 360px' }, gridTemplateRows: { lg: 'auto 1fr' }, gap: { xs: 2.5, md: 3 }, alignItems: 'start' }}>
        {/* 左列: 次にやること → あなたのタスク → 件数（lg では最近のデプロイが下に続く） */}
        <Stack spacing={{ xs: 2.5, md: 3 }} sx={{ minWidth: 0, gridColumn: { lg: 1 }, gridRow: { lg: 1 } }}>
          <Surface padding={{ xs: 2.5, md: 3 }} component="section" aria-labelledby="next-action-title" data-testid="next-action">
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'stretch', sm: 'center' }}>
              <Stack direction="row" spacing={2} alignItems="center" sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ width: 40, height: 40, borderRadius: '50%', bgcolor: tokens.color.bgSubtle, color: tokens.color.inkSoft, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  {next.to ? <Rocket size={18} aria-hidden /> : <CircleCheck size={18} aria-hidden />}
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="caption" sx={{ display: 'block', fontWeight: 650 }}>次にやること</Typography>
                  <Typography id="next-action-title" variant="h5" component="h2" sx={{ fontSize: 17, fontWeight: 700 }}>{next.title}</Typography>
                </Box>
              </Stack>
              {next.cta && next.to && (
                <Button variant="contained" endIcon={<ArrowRight size={16} />} onClick={() => navigate(next.to!)} sx={{ minHeight: 44, flexShrink: 0 }}>
                  {next.cta}
                </Button>
              )}
            </Stack>
          </Surface>

          <Surface>
            <SectionTitle title="あなたのタスク" sub={<Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums' }}>未完了 {mineAll.length} 件</Typography>} />
            {mine.length === 0 ? (
              <Stack spacing={1.5} alignItems="flex-start">
                <Typography variant="body2" color="text.secondary">担当の未完了タスクはありません</Typography>
                <Button variant="outlined" size="small" sx={{ minHeight: 44 }} onClick={() => navigate('/dev/tasks')}>すべてのタスクを見る</Button>
              </Stack>
            ) : (
              <Stack component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                {mine.map((t, i) => (
                  <Box component="li" key={t.id} sx={{ borderTop: i ? `1px solid ${tokens.color.border}` : 'none' }}>
                    <ButtonBase
                      onClick={() => navigate('/dev/tasks')}
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
          </Surface>

          <Box>
            <SectionTitle
              title="構築タスク"
              sub={<Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums' }}>全 {dev.tasks.length} 件</Typography>}
              action={<Button size="small" sx={{ minHeight: 44, flexShrink: 0 }} onClick={() => navigate('/dev/tasks')}>一覧へ</Button>}
            />
            <Stack direction="row" useFlexGap flexWrap="wrap" sx={{ gap: 1, mt: -1 }} role="list" aria-label="状態ごとの件数">
              {DEV_TASK_STATUSES.map((s) => (
                <Stack role="listitem" key={s.id} direction="row" spacing={0.75} alignItems="center">
                  <StatusPill tone={TASK_TONE[s.id]}>{s.label}</StatusPill>
                  <Typography variant="body2" sx={{ fontWeight: 650, fontVariantNumeric: 'tabular-nums', pr: 1 }}>{dev.tasks.filter((t) => t.status === s.id).length}</Typography>
                </Stack>
              ))}
            </Stack>
          </Box>

        </Stack>

        {/* 右列: 環境 → 最近のエラー → 品質チェック A 区分（390px では左列の直後） */}
        <Stack spacing={{ xs: 2.5, md: 3 }} sx={{ minWidth: 0, gridColumn: { lg: 2 }, gridRow: { lg: '1 / span 2' } }}>
          <Surface>
            <SectionTitle title="環境" sub={<StatusPill tone="neutral" dot={false}>シミュレーション</StatusPill>} />
            <Stack>
              {DEV_ENVS.map((e, i) => {
                const d = latestDeploy(dev.deploys, e.id);
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

          <Surface tone="muted">
            <SectionTitle title="品質チェック A 区分" />
            <Typography variant="body2" color="text.secondary">
              自動で確認できる A 区分 {aItems.length} 項目のうち、<b>{aChecked}</b> 項目をアフロ側で確認済みです。
              {dev.checksRunAt ? `最後の自動チェック: ${formatDateTime(dev.checksRunAt)}` : '自動チェックはまだ実行していません。'}
            </Typography>
            <Button fullWidth variant="outlined" endIcon={<ArrowRight size={16} />} sx={{ mt: 2, minHeight: 44 }} onClick={() => navigate('/dev/checks')}>
              自動チェックを開く
            </Button>
          </Surface>
        </Stack>
        {/* 最近のデプロイ: lg は左列の下、390px は最後 */}
        <Surface sx={{ gridColumn: { lg: 1 }, gridRow: { lg: 2 } }}>
            <SectionTitle title="最近のデプロイ" action={<Button size="small" sx={{ minHeight: 44, flexShrink: 0 }} onClick={() => navigate('/dev/deploys')}>デプロイへ</Button>} />
            <Stack component="ul" spacing={1.25} sx={{ listStyle: 'none', m: 0, p: 0 }}>
              {dev.deploys.slice(0, 5).map((d) => (
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
      </Box>
    </>
  );
}
