import { Box, Button, ButtonBase, LinearProgress, Stack, Typography } from '@mui/material';
import {
  ArrowRight, ArrowUpRight, CalendarClock, CheckCircle2, Clock, FolderKanban, ListChecks, MessageCircle,
  PenLine, Rocket, Sparkles, type LucideIcon,
} from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Activity } from '@/types';
import { useDemo, currentProject } from '@/store/DemoStore';
import { MONTHLY_METRICS } from '@/data/insights';
import { AiBadge, AiMark, CountUp, MemberAvatar, Reveal, SectionTitle, StageTrack, StatusPill, Surface } from '@/components/ui';
import { daysFromNow, formatDate, nowIso, relativeTime } from '@/services/time';
import { tokens } from '@/theme/tokens';
import { TOUCH } from '@/theme/media';
import { nextBestAction, stageLabel, stagePrimaryRoute } from '@/features/projects/projectHelpers';
import { ClientStatusPanel } from '@/features/projects/ClientStatusPanel';
import { approvalSteps } from '@/features/portal/portalSteps';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'こんばんは';
  if (h < 11) return 'おはようございます';
  if (h < 17) return 'こんにちは';
  return 'こんばんは';
}

const ACTIVITY_ICON: Record<Activity['kind'], { icon: LucideIcon; color: string; bg: string }> = {
  approve: { icon: CheckCircle2, color: tokens.color.success, bg: tokens.color.successSoft },
  publish: { icon: Rocket, color: tokens.color.primary, bg: tokens.color.primarySoft },
  ai: { icon: Sparkles, color: '#5B3FD6', bg: tokens.color.accentSoft },
  edit: { icon: PenLine, color: tokens.color.inkSoft, bg: tokens.color.bgSubtle },
  check: { icon: ListChecks, color: tokens.color.info, bg: tokens.color.infoSoft },
  comment: { icon: MessageCircle, color: tokens.color.warning, bg: tokens.color.warningSoft },
};

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
  const { state, dispatch } = useDemo();
  const navigate = useNavigate();
  const project = currentProject(state);

  const active = state.projects.filter((p) => p.progress < 100);
  const pendingTotal = state.projects.reduce((s, p) => s + p.pendingApprovals, 0);
  const scheduled = state.pages.filter((p) => p.status === 'scheduled');
  const last = MONTHLY_METRICS[MONTHLY_METRICS.length - 1];
  const prev = MONTHLY_METRICS[MONTHLY_METRICS.length - 2];
  const inquiryDelta = Math.round(((last.inquiries - prev.inquiries) / prev.inquiries) * 100);
  const action = nextBestAction(state);

  /** 承認待ち: デモ状態から導いたもの＋他プロジェクトの承認件数 */
  const approvals = useMemo(() => {
    const list: { id: string; title: string; sub: string; to: string; projectId: string; color: string }[] = [];
    // デモの案件はお客様の承認の節目（ウォーターフォール。前が終わるまで locked）から作る。件数（pendingApprovals）と同じ数え方
    const titles = { requirements: '要件定義書の承認', sitemap: '改善後サイトマップの承認', design: 'トップデザイン案の採用', quality: '品質チェック（お客様）' } as const;
    const routes = { requirements: '/ai-studio', sitemap: '/site', design: '/ai-studio/design', quality: '/quality' } as const;
    approvalSteps(state).filter((s) => s.status === 'waiting').forEach((s) => {
      list.push({ id: s.key, title: titles[s.key], sub: `${project.siteName}・${s.key === 'requirements' ? '要件定義' : s.key === 'quality' ? '品質管理' : '制作'}`, to: routes[s.key], projectId: project.id, color: tokens.color.primary });
    });
    state.pages
      .filter((p) => p.status === 'review')
      .forEach((p) => list.push({ id: p.id, title: `「${p.title}」の公開承認`, sub: `${project.siteName}・ページ公開`, to: '/portal/publish', projectId: project.id, color: tokens.color.warning }));
    state.projects
      .filter((p) => p.id !== project.id && p.pendingApprovals > 0)
      .forEach((p) => list.push({ id: p.id, title: p.nextAction, sub: `${p.siteName}・${stageLabel(p.stage)}（${p.pendingApprovals}件）`, to: stagePrimaryRoute(p.stage), projectId: p.id, color: tokens.color.warning }));
    return list.slice(0, 5);
  }, [state, project]);

  /** 次回のAI改善診断（公開後4か月ごと）。デモ用に段階から日付を導く */
  const diagnosisPlan = useMemo(
    () =>
      state.projects
        .filter((p) => p.stage === 'operation' || p.stage === 'improvement' || p.stage === 'quality')
        .map((p, i) => ({
          project: p,
          at: p.stage === 'quality' && p.launchDate
            ? new Date(new Date(p.launchDate).getTime() + 120 * 86_400_000).toISOString()
            : daysFromNow(6 + i * 17),
          cycle: p.stage === 'improvement' ? 3 : p.stage === 'operation' ? 2 : 1,
        }))
        .sort((a, b) => a.at.localeCompare(b.at)),
    [state.projects],
  );

  const open = (projectId: string, to: string) => {
    dispatch({ type: 'setCurrentProject', id: projectId });
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
            mb: { xs: 2, md: 3 }, overflow: 'hidden', borderColor: '#DCD6FF',
            background: `radial-gradient(120% 140% at 100% 0%, ${tokens.color.accentSoft} 0%, rgba(243,240,255,0) 55%), radial-gradient(90% 120% at 0% 100%, ${tokens.color.primarySoft} 0%, rgba(238,242,255,0) 60%), #fff`,
          }}
        >
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 2, sm: 3 }} alignItems={{ sm: 'center' }}>
            <AiMark size={48} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1, flexWrap: 'wrap', rowGap: 1 }}>
                <Typography variant="overline" sx={{ color: '#5B3FD6' }}>次の一手 — {project.siteName}</Typography>
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

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', lg: 'minmax(0,1fr) 360px' }, gap: { xs: 2, md: 3 }, alignItems: 'start' }}>
        {/* 左カラム */}
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

        {/* 右カラム */}
        <Stack spacing={{ xs: 2, md: 3 }} sx={{ minWidth: 0 }}>
          {/* お客様の対応状況（デモの案件） */}
          <Reveal delay={0.14}>
            <ClientStatusPanel compact />
          </Reveal>

          {/* 承認待ち */}
          <Reveal delay={0.16}>
            <Surface>
              <SectionTitle title="承認待ち" icon={<Clock size={18} color={tokens.color.warning} />} sub={<StatusPill tone="warning" dot={false}>{approvals.length}</StatusPill>} />
              {approvals.length === 0 ? (
                <Stack alignItems="center" spacing={1} sx={{ py: 3, color: tokens.color.muted }}>
                  <CheckCircle2 size={28} color={tokens.color.success} />
                  <Typography variant="body2">承認待ちはありません</Typography>
                </Stack>
              ) : (
                <Stack spacing={0.5}>
                  {approvals.map((a) => (
                    <ButtonBase
                      key={a.id}
                      onClick={() => open(a.projectId, a.to)}
                      sx={{
                        justifyContent: 'flex-start', gap: 1.5, p: 1.25, mx: -1, borderRadius: 2.5, textAlign: 'left',
                        '&:hover': { bgcolor: tokens.color.surfaceMuted }, '&:hover .go, &:focus-visible .go': { opacity: 1, transform: 'translateX(0)' },
                      }}
                    >
                      <Box sx={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, bgcolor: a.color }} />
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{a.title}</Typography>
                        <Typography variant="caption" noWrap sx={{ display: 'block' }}>{a.sub}</Typography>
                      </Box>
                      <Box className="go" sx={{ display: 'flex', opacity: 0.4, transform: 'translateX(-4px)', transition: 'all .16s', flexShrink: 0, color: tokens.color.muted, [TOUCH]: { opacity: 0.8, transform: 'none' } }}>
                        <ArrowRight size={16} />
                      </Box>
                    </ButtonBase>
                  ))}
                </Stack>
              )}
            </Surface>
          </Reveal>

          {/* 公開予定 */}
          <Reveal delay={0.2}>
            <Surface>
              <SectionTitle
                title="公開予定のページ"
                icon={<CalendarClock size={18} color={tokens.color.accent} />}
                action={<Button size="small" onClick={() => navigate('/portal/pages')}>CMSへ</Button>}
              />
              {scheduled.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>予約公開のページはありません。CMSで予約できます。</Typography>
              ) : (
                <Stack spacing={1}>
                  {scheduled.map((p) => {
                    const d = p.scheduledAt ? new Date(p.scheduledAt) : null;
                    return (
                      <ButtonBase key={p.id} onClick={() => navigate(`/portal/pages?page=${p.id}`)} sx={{ justifyContent: 'flex-start', gap: 1.5, textAlign: 'left', borderRadius: 2.5, p: 1, mx: -1, '&:hover': { bgcolor: tokens.color.surfaceMuted } }}>
                        <Box sx={{ width: 48, flexShrink: 0, borderRadius: '12px', border: `1px solid ${tokens.color.border}`, overflow: 'hidden', textAlign: 'center', bgcolor: '#fff' }}>
                          <Box sx={{ bgcolor: tokens.color.accent, color: '#fff', fontSize: 12, fontWeight: 700, py: 0.25 }}>{d ? `${d.getMonth() + 1}月` : '—'}</Box>
                          <Box sx={{ fontSize: 18, fontWeight: 700, py: 0.25 }}>{d ? d.getDate() : '—'}</Box>
                        </Box>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="body2" sx={{ fontWeight: 600, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.title}</Typography>
                          <Typography variant="caption" sx={{ display: 'block' }}>{p.type === 'news' ? 'お知らせ' : 'ページ'}・{relativeTime(p.scheduledAt)}に公開</Typography>
                        </Box>
                      </ButtonBase>
                    );
                  })}
                </Stack>
              )}
            </Surface>
          </Reveal>

          {/* AI改善提案の予定 */}
          <Reveal delay={0.24}>
            <Surface>
              <SectionTitle
                title="AI改善診断の予定"
                icon={<Sparkles size={18} color="#5B3FD6" />}
                action={<Button size="small" onClick={() => navigate('/insights')}>インサイト</Button>}
              />
              <Typography variant="caption" sx={{ display: 'block', mb: 1.5 }}>公開後、4か月ごとに AI がサイトを診断して改善を提案します。</Typography>
              <Stack spacing={1}>
                {diagnosisPlan.map(({ project: p, at, cycle }) => (
                  <ButtonBase
                    key={p.id}
                    onClick={() => open(p.id, '/insights')}
                    sx={{ justifyContent: 'space-between', gap: 1, p: 1.25, borderRadius: 2.5, border: `1px dashed ${tokens.color.borderStrong}`, textAlign: 'left', '&:hover': { borderColor: tokens.color.accent, bgcolor: tokens.color.accentSoft } }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{p.siteName}</Typography>
                      <Typography variant="caption" sx={{ display: 'block' }}>第{cycle}回診断・{formatDate(at)}</Typography>
                    </Box>
                    <StatusPill tone="accent">{relativeTime(at)}</StatusPill>
                  </ButtonBase>
                ))}
              </Stack>
            </Surface>
          </Reveal>

          {/* 最近のアクティビティ */}
          <Reveal delay={0.28}>
            <Surface>
              <SectionTitle title="最近のアクティビティ" icon={<Clock size={18} color={tokens.color.muted} />} />
              <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0, position: 'relative' }}>
                <Box sx={{ position: 'absolute', left: 15, top: 12, bottom: 12, width: 2, bgcolor: tokens.color.border, borderRadius: 1 }} aria-hidden />
                {state.activities.slice(0, 7).map((a) => {
                  const k = ACTIVITY_ICON[a.kind];
                  const Icon = k.icon;
                  return (
                    <Box component="li" key={a.id} sx={{ position: 'relative', display: 'flex', gap: 1.5, py: 1 }}>
                      <Box sx={{ width: 32, height: 32, borderRadius: '50%', bgcolor: k.bg, color: k.color, display: 'grid', placeItems: 'center', flexShrink: 0, border: '3px solid #fff', zIndex: 1 }}>
                        <Icon size={14} />
                      </Box>
                      <Box sx={{ minWidth: 0, pt: 0.25 }}>
                        <Typography variant="body2" sx={{ lineHeight: 1.5 }}>
                          <b>{a.actor}</b> {a.text}
                        </Typography>
                        <Typography variant="caption">{relativeTime(a.at)}</Typography>
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            </Surface>
          </Reveal>
        </Stack>
      </Box>
    </Box>
  );
}
