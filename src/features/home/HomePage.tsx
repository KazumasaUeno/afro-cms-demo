import { Box, Button, LinearProgress, Stack, Typography } from '@mui/material';
import { ArrowRight, ArrowUpRight, FolderKanban } from 'lucide-react';
import { type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRepositories } from '@/repositories';
import { useDemo, currentProject } from '@/store/DemoStore';
import { MONTHLY_METRICS } from '@/data/insights';
import { AiBadge, AiMark, CountUp, MemberAvatar, Reveal, SectionTitle, StageTrack, Surface } from '@/components/ui';
import { formatDate, nowIso, relativeTime } from '@/services/time';
import { tokens } from '@/theme/tokens';
import { nextBestAction, stageLabel } from '@/features/projects/projectHelpers';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'こんばんは';
  if (h < 11) return 'おはようございます';
  if (h < 17) return 'こんにちは';
  return 'こんばんは';
}

/** KPI 帯の 1 項目（ラベル／数値／補足） */
function KpiItem({ label, value, suffix, foot }: { label: string; value: number; suffix?: string; foot: ReactNode }) {
  return (
    <Box>
      <Typography component="dt" variant="caption" sx={{ display: 'block', color: tokens.color.inkSoft, fontWeight: 600 }}>{label}</Typography>
      <Typography component="dd" sx={{ m: 0, mt: 0.5, fontSize: 22, fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
        <CountUp value={value} />
        {suffix && <Box component="span" sx={{ fontSize: 13, fontWeight: 600, color: tokens.color.muted, ml: 0.5 }}>{suffix}</Box>}
      </Typography>
      <Typography component="dd" variant="caption" sx={{ m: 0, mt: 0.25, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{foot}</Typography>
    </Box>
  );
}

/** ホームダッシュボード */
export default function HomePage() {
  const { state } = useDemo();
  const { projects } = useRepositories();
  const navigate = useNavigate();
  const project = currentProject(state);

  const active = state.projects.filter((p) => p.progress < 100);
  const pendingTotal = state.projects.reduce((s, p) => s + p.pendingApprovals, 0);
  const scheduled = state.pages.filter((p) => p.status === 'scheduled');
  const last = MONTHLY_METRICS[MONTHLY_METRICS.length - 1];
  const prev = MONTHLY_METRICS[MONTHLY_METRICS.length - 2];
  const inquiryDelta = Math.round(((last.inquiries - prev.inquiries) / prev.inquiries) * 100);
  const action = nextBestAction(state);

  const open = (projectId: string, to: string) => {
    projects.select(projectId);
    navigate(to);
  };

  return (
    <Box>
      {/* 挨拶 */}
      <Reveal>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'flex-end' }} spacing={2} sx={{ mb: { xs: 2, md: 3 } }}>
          <Box>
            <Typography variant="overline" sx={{ color: tokens.color.primary }}>{formatDate(nowIso())}</Typography>
            <Typography variant="h1" component="h1" sx={{ mt: 0.5 }}>
              {greeting()}、{state.userName}さん
            </Typography>
            <Typography variant="subtitle1" sx={{ mt: 1 }}>
              今日は承認待ちが <b style={{ color: tokens.color.ink }}>{pendingTotal}件</b>、公開予定のページが <b style={{ color: tokens.color.ink }}>{scheduled.length}件</b> あります。
              {active.length}つのプロジェクトが進行中です。
            </Typography>
          </Box>
        </Stack>
      </Reveal>

      {/* 次の一手（AI） */}
      <Reveal delay={0.03}>
        <Surface
          padding={{ xs: 2.5, md: 3.5 }}
          sx={{
            // M3 Expressive: 画面の主役の面は角丸 Extra large（28px）
            mb: { xs: 2, md: 3 }, overflow: 'hidden', borderColor: tokens.color.outlineVariant, borderRadius: `${tokens.radius.xl}px`,
            background: `radial-gradient(120% 140% at 100% 0%, ${tokens.color.accentSoft} 0%, transparent 55%), radial-gradient(90% 120% at 0% 100%, ${tokens.color.primarySoft} 0%, transparent 60%), ${tokens.color.surface}`,
          }}
        >
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 2, sm: 3 }} alignItems={{ sm: 'center' }}>
            <AiMark size={48} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1, flexWrap: 'wrap', rowGap: 1 }}>
                <Typography variant="overline" sx={{ color: tokens.color.accentInk }}>次の一手 — {project.siteName}</Typography>
                <AiBadge label="AIの提案" />
              </Stack>
              <Typography variant="h2" component="h2" sx={{ fontSize: { xs: 20, md: 24 } }}>{action.title}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1, maxWidth: 560 }}>{action.detail}</Typography>
            </Box>
            <Button variant="contained" size="large" endIcon={<ArrowRight size={18} />} onClick={() => navigate(action.to)} sx={{ flexShrink: 0, alignSelf: { xs: 'stretch', sm: 'center' } }}>
              {action.cta}
            </Button>
          </Stack>
        </Surface>
      </Reveal>

      {/* KPI（1 本の帯） */}
      <Reveal delay={0.06}>
        <Surface padding={0} sx={{ mb: { xs: 2, md: 3 } }}>
          <Box
            component="dl"
            sx={{
              m: 0, display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0,1fr))', md: 'repeat(4, minmax(0,1fr))' },
              '& > div': { px: { xs: 2, md: 2.5 }, py: { xs: 1.5, md: 2 }, minWidth: 0 },
              '& > div + div': { borderLeft: { md: `1px solid ${tokens.color.border}` } },
              '& > div:nth-of-type(even)': { borderLeft: { xs: `1px solid ${tokens.color.border}` } },
              '& > div:nth-of-type(n+3)': { borderTop: { xs: `1px solid ${tokens.color.border}`, md: 'none' } },
            }}
          >
            <KpiItem label="進行中プロジェクト" value={active.length} suffix="件" foot={`全 ${state.projects.length} 件中`} />
            <KpiItem label="承認待ち" value={pendingTotal} suffix="件" foot="顧客・社内の承認を含む" />
            <KpiItem label="公開予定ページ" value={scheduled.length} suffix="件" foot={scheduled[0] ? `次回 ${relativeTime(scheduled[0].scheduledAt)}` : '予約はありません'} />
            <KpiItem
              label="今月の問い合わせ" value={last.inquiries} suffix="件"
              foot={<><Box component="span" sx={{ color: tokens.color.success, fontWeight: 700 }}>{inquiryDelta >= 0 ? '+' : ''}{inquiryDelta}%</Box> 前月比（デモデータ）</>}
            />
          </Box>
        </Surface>
      </Reveal>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: { xs: 2, md: 3 }, alignItems: 'start' }}>
        <Stack spacing={{ xs: 2, md: 3 }} sx={{ minWidth: 0 }}>
          {/* 進行中プロジェクト */}
          <Box>
            <SectionTitle
              title="進行中のプロジェクト"
              icon={<FolderKanban size={18} color={tokens.color.muted} />}
              action={<Button size="small" endIcon={<ArrowRight size={15} />} onClick={() => navigate('/projects')}>すべて見る</Button>}
            />
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', sm: 'repeat(2, minmax(0,1fr))' }, gap: 2 }}>
              {active.map((p, i) => (
                <Reveal key={p.id} delay={0.16 + i * 0.05} style={{ height: '100%' }}>
                  <Surface
                    interactive
                    role="link"
                    tabIndex={0}
                    aria-label={`${p.siteName} の詳細を開く`}
                    onClick={() => open(p.id, `/projects/${p.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        open(p.id, `/projects/${p.id}`);
                      }
                    }}
                    sx={{ height: '100%' }}
                  >
                    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
                      <Box sx={{ width: 40, height: 40, borderRadius: '12px', bgcolor: p.accent, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 15, flexShrink: 0 }}>
                        {p.siteName.slice(0, 1)}
                      </Box>
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography variant="h5" noWrap>{p.siteName}</Typography>
                        <Typography variant="caption" noWrap sx={{ display: 'block' }}>{p.clientName}</Typography>
                      </Box>
                      <MemberAvatar id={p.ownerId} size={28} />
                    </Stack>
                    <StageTrack stage={p.stage} compact />
                    <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mt: 2, mb: 0.75 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{stageLabel(p.stage)}</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{p.progress}%</Typography>
                    </Stack>
                    <LinearProgress variant="determinate" value={p.progress} aria-label={`${p.siteName}の進捗`} sx={{ '& .MuiLinearProgress-bar': { bgcolor: p.accent } }} />
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 2, color: tokens.color.inkSoft }}>
                      <ArrowUpRight size={15} style={{ flexShrink: 0 }} />
                      <Typography variant="body2" sx={{ flex: 1, minWidth: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.nextAction}</Typography>
                      <Typography variant="caption" sx={{ flexShrink: 0 }}>{relativeTime(p.updatedAt)}</Typography>
                    </Stack>
                  </Surface>
                </Reveal>
              ))}
            </Box>
          </Box>

        </Stack>
      </Box>
    </Box>
  );
}
