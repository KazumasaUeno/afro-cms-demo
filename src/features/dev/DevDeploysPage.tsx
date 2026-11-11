import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { ArrowDown, ArrowRight, CheckCircle2, ExternalLink, Lock, Rocket } from 'lucide-react';
import { Fragment, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader, Reveal, SectionTitle, StatusPill, Surface } from '@/components/ui';
import { useDemo, devState } from '@/store/DemoStore';
import { useToast } from '@/hooks/useToast';
import { formatDateTime, relativeTime } from '@/services/time';
import { DEV_ENVS, deployGate, latestDeploy, latestSuccess } from '@/data/dev';
import { tokens } from '@/theme/tokens';
import type { DeployEnv } from '@/types';
import { ENV_TONE, envDef, envSync } from './devUi';
import { DevMono } from './DevMono';
import { useDevUser } from './useDevUser';

/** 押せるボタンのうち、どれを「次の 1 手」として強調するか（検証 → 本番 → 開発） */
const PRIMARY_ORDER: DeployEnv[] = ['staging', 'production', 'development'];

const actionLabel = (env: DeployEnv, version: string) =>
  env === 'development' ? `新しい版 v${version} を作る` : env === 'staging' ? `v${version} を検証へ反映` : `v${version} を本番へ公開`;

const PROD_URL = DEV_ENVS.find((e) => e.id === 'production')?.url ?? '';

export default function DevDeploysPage() {
  const { state, dispatch } = useDemo();
  // ログイン中のメンバー（「自分の担当」「あなた」の判定と、操作の記録に使う）
  const me = useDevUser();
  const toast = useToast();
  const navigate = useNavigate();
  const dev = devState(state);
  const [confirm, setConfirm] = useState<string | null>(null);

  const gates = Object.fromEntries(DEV_ENVS.map((e) => [e.id, deployGate(dev, e.id, state.design.approvedAt)])) as Record<DeployEnv, ReturnType<typeof deployGate>>;
  const primaryEnv = PRIMARY_ORDER.find((env) => gates[env].ok);

  const doDeploy = (env: DeployEnv) => {
    const gate = deployGate(dev, env, state.design.approvedAt);
    if (!gate.ok) return;
    dispatch({ type: 'deploy', env, by: me.id });
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
        <Box>
          <SectionTitle title="パイプライン" sub={<StatusPill tone="neutral" dot={false}>シミュレーション</StatusPill>} />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0,1fr) auto minmax(0,1fr) auto minmax(0,1fr)' }, gap: { xs: 1, md: 1.5 }, alignItems: 'stretch' }}>
            {DEV_ENVS.map((e, i) => {
              const last = latestDeploy(dev.deploys, e.id);
              const gate = gates[e.id];
              const sync = envSync(dev, e.id);
              const isProd = e.id === 'production';
              const current = latestSuccess(dev.deploys, e.id);
              return (
                <Fragment key={e.id}>
                  {i > 0 && (
                    <Box aria-hidden sx={{ display: 'grid', placeItems: 'center', color: tokens.color.faint }}>
                      <Box sx={{ display: { xs: 'none', md: 'block' } }}><ArrowRight size={20} /></Box>
                      <Box sx={{ display: { xs: 'block', md: 'none' } }}><ArrowDown size={20} /></Box>
                    </Box>
                  )}
                  <Reveal delay={i * 0.05} style={{ height: '100%' }}>
                    <Surface component="section" aria-labelledby={`env-${e.id}`} data-env={e.id} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                      <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                        <Typography id={`env-${e.id}`} variant="h6" component="h3">{i + 1}. {e.label}</Typography>
                        <StatusPill tone={sync.tone}>{sync.label}</StatusPill>
                      </Stack>
                      <DevMono size="lg" sx={{ display: 'block', mt: 1 }}>{(current ?? last) ? `v${(current ?? last)!.version}` : '—'}</DevMono>
                      <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.25, minWidth: 0, color: tokens.color.muted }}>
                        <DevMono size="sm" sx={{ wordBreak: 'break-all' }}>{e.url.replace('https://', '')}</DevMono>
                        <ExternalLink size={12} aria-hidden style={{ flexShrink: 0 }} />
                      </Stack>
                      <Typography variant="caption" sx={{ display: 'block', mt: 0.25 }}>
                        {last ? `前回: ${last.status === 'success' ? '成功' : '失敗'}・${relativeTime(last.at)}・${last.by}` : 'まだデプロイしていません'}
                      </Typography>
                      <Box sx={{ flex: 1 }} />
                      {gate.ok ? (
                        <Button
                          fullWidth variant={e.id === primaryEnv ? 'contained' : 'outlined'} startIcon={<Rocket size={16} />} sx={{ mt: 2, minHeight: 44 }}
                          onClick={() => (isProd ? setConfirm(gate.version ?? '') : doDeploy(e.id))}
                        >
                          {actionLabel(e.id, gate.version ?? '')}
                        </Button>
                      ) : gate.kind === 'latest' ? (
                        <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mt: 2 }} data-gate="latest">
                          <CheckCircle2 size={16} color={tokens.color.success} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
                          <Typography sx={{ fontSize: 13, color: tokens.color.inkSoft }}>最新の <DevMono size="md" sx={{ fontSize: 13 }}>v{current?.version}</DevMono> が反映済みです</Typography>
                        </Stack>
                      ) : (
                        <Box sx={{ mt: 2 }} data-gate={gate.kind ?? 'blocked'}>
                          <Stack direction="row" spacing={1} alignItems="flex-start">
                            <Lock size={16} color={tokens.color.warning} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
                            <Typography sx={{ fontSize: 13, color: tokens.color.inkSoft }}>{gate.reason}</Typography>
                          </Stack>
                          {gate.kind === 'needsApproval' && (
                            <Button size="small" endIcon={<ArrowRight size={14} />} sx={{ mt: 1, minHeight: 44 }} onClick={() => navigate(`/dev/projects/${state.currentProjectId}`)}>
                              {/* 開発者画面の中のプロジェクト詳細（お客様の対応状況）へ。ポータルへ送ると開発者だけのログインでは /portal/login へ戻される（0.26.0） */}
                              お客様の承認状況を見る
                            </Button>
                          )}
                        </Box>
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
          {/* md 未満: 2 段の一覧 */}
          <Stack component="ul" sx={{ display: { xs: 'flex', md: 'none' }, listStyle: 'none', m: 0, p: 0 }}>
            {dev.deploys.map((d, idx) => (
              <Stack component="li" key={d.id} spacing={0.5} sx={{ py: 1.25, minWidth: 0, borderTop: idx ? `1px solid ${tokens.color.border}` : 'none' }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <StatusPill tone={ENV_TONE[d.env]} dot={false}>{envDef(d.env).label}</StatusPill>
                  <DevMono size="md">v{d.version}</DevMono>
                  <StatusPill tone={d.status === 'success' ? 'success' : 'danger'}>{d.status === 'success' ? '成功' : '失敗'}</StatusPill>
                </Stack>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2">{d.note}</Typography>
                  <Typography variant="caption">{d.by}・<DevMono size="sm">{formatDateTime(d.at)}</DevMono></Typography>
                </Box>
              </Stack>
            ))}
          </Stack>
          {/* md 以上: 表 */}
          <Box sx={{ display: { xs: 'none', md: 'block' }, overflowX: 'auto' }}>
            <Table size="small" aria-label="デプロイ履歴" sx={{ '& td, & th': { borderColor: tokens.color.border, px: 1.25 }, '& th': { color: tokens.color.muted, fontSize: 12, fontWeight: 650, whiteSpace: 'nowrap' } }}>
              <TableHead>
                <TableRow>
                  <TableCell>環境</TableCell>
                  <TableCell>バージョン</TableCell>
                  <TableCell>結果</TableCell>
                  <TableCell>内容</TableCell>
                  <TableCell>実行者</TableCell>
                  <TableCell>日時</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {dev.deploys.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell><StatusPill tone={ENV_TONE[d.env]} dot={false}>{envDef(d.env).label}</StatusPill></TableCell>
                    <TableCell><DevMono size="md">v{d.version}</DevMono></TableCell>
                    <TableCell><StatusPill tone={d.status === 'success' ? 'success' : 'danger'}>{d.status === 'success' ? '成功' : '失敗'}</StatusPill></TableCell>
                    <TableCell sx={{ minWidth: 220 }}><Typography variant="body2">{d.note}</Typography></TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}><Typography variant="body2">{d.by}</Typography></TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}><DevMono size="sm">{formatDateTime(d.at)}</DevMono></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </Surface>
      </Stack>

      <Dialog open={confirm !== null} onClose={() => setConfirm(null)} maxWidth="xs" fullWidth aria-labelledby="prod-confirm-title">
        <DialogTitle id="prod-confirm-title">本番環境へ公開しますか</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            v{confirm} を次の公開先に反映します。公開中のサイトが切り替わります（デモのためシミュレーションです）。
          </Typography>
          <DevMono size="md" sx={{ display: 'block', mt: 1.5, wordBreak: 'break-all' }}>{PROD_URL.replace('https://', '')}</DevMono>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, flexWrap: 'wrap', gap: 1 }}>
          <Button variant="outlined" onClick={() => setConfirm(null)}>キャンセル</Button>
          <Button variant="contained" onClick={() => { setConfirm(null); doDeploy('production'); }}>本番へ公開する（v{confirm}）</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
