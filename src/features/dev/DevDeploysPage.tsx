import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';
import { ArrowDown, ArrowRight, Info, Rocket } from 'lucide-react';
import { Fragment, useState } from 'react';
import { PageHeader, Reveal, SectionTitle, StatusPill, Surface } from '@/components/ui';
import { useDemo, devState } from '@/store/DemoStore';
import { useToast } from '@/hooks/useToast';
import { formatDateTime, relativeTime } from '@/services/time';
import { DEV_ENVS, deployGate, latestDeploy } from '@/data/dev';
import { tokens } from '@/theme/tokens';
import { AREAS } from '@/components/layout/nav';
import type { DeployEnv } from '@/types';
import { ENV_TONE, envDef } from './devUi';

const AREA = AREAS.dev;

export default function DevDeploysPage() {
  const { state, dispatch } = useDemo();
  const toast = useToast();
  const dev = devState(state);
  const [confirm, setConfirm] = useState<string | null>(null);

  const doDeploy = (env: DeployEnv) => {
    const gate = deployGate(dev, env, state.design.approvedAt);
    if (!gate.ok) return;
    dispatch({ type: 'deploy', env });
    toast(`${envDef(env).label}へ v${gate.version} をデプロイしました（シミュレーション）`);
  };

  return (
    <>
      <PageHeader
        eyebrow="開発者画面"
        icon={<Rocket size={15} />}
        title="環境・デプロイ"
        description="開発環境 → 検証環境 → 本番環境 の順に反映します。本番への反映は、検証環境が最新でお客様のトップデザイン承認が済んでいるときだけできます。"
      />

      <Stack spacing={{ xs: 2.5, md: 3 }}>
        <Surface tone="muted" sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
          <Info size={18} color={tokens.color.info} style={{ flexShrink: 0, marginTop: 2 }} />
          <Typography variant="body2" color="text.secondary">シミュレーションです。実際のサーバーへの公開は行いません。</Typography>
        </Surface>

        <Box>
          <SectionTitle title="パイプライン" />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0,1fr) auto minmax(0,1fr) auto minmax(0,1fr)' }, gap: { xs: 1, md: 1.5 }, alignItems: 'stretch' }}>
            {DEV_ENVS.map((e, i) => {
              const last = latestDeploy(dev.deploys, e.id);
              const gate = deployGate(dev, e.id, state.design.approvedAt);
              const isProd = e.id === 'production';
              return (
                <Fragment key={e.id}>
                  {i > 0 && (
                    <Box aria-hidden sx={{ display: 'grid', placeItems: 'center', color: tokens.color.faint }}>
                      <Box sx={{ display: { xs: 'none', md: 'block' } }}><ArrowRight size={20} /></Box>
                      <Box sx={{ display: { xs: 'block', md: 'none' } }}><ArrowDown size={20} /></Box>
                    </Box>
                  )}
                  <Reveal delay={i * 0.05} style={{ height: '100%' }}>
                    <Surface sx={{ height: '100%', display: 'flex', flexDirection: 'column', ...(isProd ? { borderColor: AREA.color } : {}) }}>
                      <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                        <Typography variant="h6" component="h3">{i + 1}. {e.label}</Typography>
                        {last ? <StatusPill tone={last.status === 'success' ? 'success' : 'danger'}>{last.status === 'success' ? '成功' : '失敗'}</StatusPill> : <StatusPill>未デプロイ</StatusPill>}
                      </Stack>
                      <Typography sx={{ mt: 1, fontSize: 22, fontWeight: 750, fontVariantNumeric: 'tabular-nums' }}>{last ? `v${last.version}` : '—'}</Typography>
                      <Typography variant="caption" sx={{ display: 'block', wordBreak: 'break-all' }}>{e.url.replace('https://', '')}</Typography>
                      <Typography variant="caption" sx={{ display: 'block' }}>{last ? `${relativeTime(last.at)}・${last.by}` : 'まだデプロイしていません'}</Typography>
                      <Box sx={{ flex: 1 }} />
                      <Button
                        fullWidth variant={isProd ? 'contained' : 'outlined'} startIcon={<Rocket size={16} />} sx={{ mt: 2 }}
                        disabled={!gate.ok}
                        aria-describedby={!gate.ok ? `gate-${e.id}` : undefined}
                        onClick={() => (isProd ? setConfirm(gate.version ?? '') : doDeploy(e.id))}
                      >
                        {gate.ok ? `v${gate.version} をデプロイ` : 'デプロイできません'}
                      </Button>
                      {!gate.ok && (
                        <Typography id={`gate-${e.id}`} variant="caption" sx={{ display: 'block', mt: 1, color: tokens.color.warning, fontWeight: 600 }}>
                          {gate.reason}
                        </Typography>
                      )}
                    </Surface>
                  </Reveal>
                </Fragment>
              );
            })}
          </Box>
        </Box>

        <Surface>
          <SectionTitle title="デプロイ履歴" sub={<Typography variant="caption">新しい順</Typography>} />
          <Stack component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }} divider={<Box sx={{ borderTop: `1px solid ${tokens.color.border}` }} />}>
            {dev.deploys.map((d) => (
              <Stack component="li" key={d.id} direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 0.5, sm: 1.5 }} alignItems={{ sm: 'center' }} sx={{ py: 1.25, minWidth: 0 }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0, width: { sm: 220 } }}>
                  <StatusPill tone={ENV_TONE[d.env]} dot={false}>{envDef(d.env).label}</StatusPill>
                  <Typography variant="body2" sx={{ fontWeight: 650, fontVariantNumeric: 'tabular-nums' }}>v{d.version}</Typography>
                  <StatusPill tone={d.status === 'success' ? 'success' : 'danger'}>{d.status === 'success' ? '成功' : '失敗'}</StatusPill>
                </Stack>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2">{d.note}</Typography>
                  <Typography variant="caption">{d.by}・{formatDateTime(d.at)}</Typography>
                </Box>
              </Stack>
            ))}
          </Stack>
        </Surface>
      </Stack>

      <Dialog open={confirm !== null} onClose={() => setConfirm(null)} maxWidth="xs" fullWidth aria-labelledby="prod-confirm-title">
        <DialogTitle id="prod-confirm-title">本番環境へデプロイしますか</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            v{confirm} を minamo-coffee.example.jp に反映します。公開中のサイトが切り替わります（デモのためシミュレーションです）。
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button variant="outlined" onClick={() => setConfirm(null)}>キャンセル</Button>
          <Button variant="contained" onClick={() => { setConfirm(null); doDeploy('production'); }}>本番へデプロイ</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
