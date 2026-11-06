import { Box, Button, Link, Stack, Typography } from '@mui/material';
import { AlertTriangle, ArrowRight, CircleAlert, ExternalLink, Gauge, LayoutDashboard } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader, Reveal, SectionTitle, StatusPill, Surface } from '@/components/ui';
import { useDemo, devState } from '@/store/DemoStore';
import { formatDateTime, relativeTime } from '@/services/time';
import { DEV_ENVS, DEV_TASK_STATUSES, DEV_USER_ID, devRecentErrors, latestDeploy } from '@/data/dev';
import { QUALITY_ITEMS } from '@/data/quality';
import { tokens } from '@/theme/tokens';
import { AREAS } from '@/components/layout/nav';
import { ENV_TONE, TASK_TONE, envDef } from './devUi';

const AREA = AREAS.dev;

export default function DevDashboardPage() {
  const { state } = useDemo();
  const navigate = useNavigate();
  const dev = devState(state);
  const errors = useMemo(() => devRecentErrors(), []);
  const mine = dev.tasks.filter((t) => t.assigneeId === DEV_USER_ID && t.status !== 'done').length;
  const aItems = QUALITY_ITEMS.filter((i) => i.priority === 'A');
  const aChecked = aItems.filter((i) => state.qualityChecks[i.id]?.afroAt).length;

  return (
    <>
      <PageHeader
        eyebrow="開発者画面"
        icon={<LayoutDashboard size={15} />}
        title="今日の作業"
        description={`MINAMO COFFEE の構築状況です。あなたの担当で未完了のタスクは ${mine} 件です。`}
        actions={<Button variant="contained" startIcon={<Gauge size={16} />} onClick={() => navigate('/dev/checks')}>自動チェックへ</Button>}
      />

      <Stack spacing={{ xs: 2.5, md: 3 }}>
        <Box>
          <SectionTitle title="構築タスク" sub={<Typography variant="caption">全 {dev.tasks.length} 件</Typography>} action={<Button size="small" onClick={() => navigate('/dev/tasks')}>一覧へ</Button>} />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0,1fr))', md: 'repeat(4, minmax(0,1fr))' }, gap: { xs: 1.5, md: 2 } }}>
            {DEV_TASK_STATUSES.map((s, i) => (
              <Reveal key={s.id} delay={i * 0.04}>
                <Surface>
                  <StatusPill tone={TASK_TONE[s.id]}>{s.label}</StatusPill>
                  <Typography sx={{ mt: 1, fontSize: 28, fontWeight: 750, fontVariantNumeric: 'tabular-nums' }}>
                    {dev.tasks.filter((t) => t.status === s.id).length}
                    <Box component="span" sx={{ fontSize: 13, fontWeight: 600, color: tokens.color.muted, ml: 0.5 }}>件</Box>
                  </Typography>
                </Surface>
              </Reveal>
            ))}
          </Box>
        </Box>

        <Box>
          <SectionTitle title="環境" sub={<Typography variant="caption">シミュレーション</Typography>} action={<Button size="small" onClick={() => navigate('/dev/deploys')}>デプロイへ</Button>} />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0,1fr))' }, gap: { xs: 1.5, md: 2 } }}>
            {DEV_ENVS.map((e) => {
              const d = latestDeploy(dev.deploys, e.id);
              return (
                <Surface key={e.id}>
                  <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                    <Typography variant="h6" component="h3">{e.label}</Typography>
                    {d ? <StatusPill tone={d.status === 'success' ? 'success' : 'danger'}>{d.status === 'success' ? '成功' : '失敗'}</StatusPill> : <StatusPill>未デプロイ</StatusPill>}
                  </Stack>
                  <Typography sx={{ mt: 1, fontSize: 22, fontWeight: 750, fontVariantNumeric: 'tabular-nums' }}>{d ? `v${d.version}` : '—'}</Typography>
                  <Typography variant="caption" sx={{ display: 'block' }}>{d ? `${relativeTime(d.at)}・${d.by}` : 'まだデプロイしていません'}</Typography>
                  <Link
                    href={e.url} target="_blank" rel="noopener noreferrer"
                    onClick={(ev) => ev.preventDefault()}
                    aria-label={`${e.label}の URL（デモのため開きません）`}
                    sx={{ mt: 1, display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: 13, minHeight: 32, wordBreak: 'break-all' }}
                  >
                    {e.url.replace('https://', '')}
                    <ExternalLink size={13} style={{ flexShrink: 0 }} />
                  </Link>
                </Surface>
              );
            })}
          </Box>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0,1fr) minmax(0,1fr)' }, gap: { xs: 2.5, md: 3 }, alignItems: 'start' }}>
          <Surface>
            <SectionTitle title="最近のデプロイ" />
            <Stack component="ul" spacing={1.25} sx={{ listStyle: 'none', m: 0, p: 0 }}>
              {dev.deploys.slice(0, 5).map((d) => (
                <Stack component="li" key={d.id} direction="row" spacing={1.5} alignItems="flex-start">
                  <StatusPill tone={ENV_TONE[d.env]} dot={false}>{envDef(d.env).label}</StatusPill>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 650 }}>
                      v{d.version}
                      {d.status === 'failed' && <Box component="span" sx={{ color: tokens.color.danger, ml: 1 }}>失敗</Box>}
                    </Typography>
                    <Typography variant="caption" sx={{ display: 'block' }}>{d.note}・{d.by}・{formatDateTime(d.at)}</Typography>
                  </Box>
                </Stack>
              ))}
            </Stack>
          </Surface>

          <Stack spacing={{ xs: 2.5, md: 3 }}>
            <Surface>
              <SectionTitle title="最近のエラー" sub={<StatusPill tone="neutral" dot={false}>デモデータ</StatusPill>} />
              <Stack component="ul" spacing={1.25} sx={{ listStyle: 'none', m: 0, p: 0 }}>
                {errors.map((e) => (
                  <Stack component="li" key={e.id} direction="row" spacing={1.25} alignItems="flex-start">
                    <Box sx={{ color: e.level === 'error' ? tokens.color.danger : tokens.color.warning, pt: 0.25, flexShrink: 0 }}>
                      {e.level === 'error' ? <CircleAlert size={17} aria-label="エラー" /> : <AlertTriangle size={17} aria-label="警告" />}
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{e.message}</Typography>
                      <Typography variant="caption">{envDef(e.env).label}・{e.count} 回・{relativeTime(e.at)}</Typography>
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
              <Button fullWidth variant="outlined" endIcon={<ArrowRight size={16} />} sx={{ mt: 2, borderColor: AREA.color, color: AREA.color }} onClick={() => navigate('/dev/checks')}>
                自動チェックを開く
              </Button>
            </Surface>
          </Stack>
        </Box>
      </Stack>
    </>
  );
}
