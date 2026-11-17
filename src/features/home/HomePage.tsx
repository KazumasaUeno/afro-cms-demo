import { Box, Button, LinearProgress, Stack, Typography } from '@mui/material';
import { ArrowRight, ArrowUpRight, CalendarCheck, FolderKanban, MessageCircle } from 'lucide-react';
import { type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRepositories } from '@/repositories';
import { useDemo, currentProject } from '@/store/DemoStore';
import { isSiteLive } from '@/data/projectContent';
import { workOf } from '@/store/projectWork';
import { AiBadge, AiMark, CountUp, MemberAvatar, Reveal, SectionTitle, StageTrack, Surface } from '@/components/ui';
import { formatDate, nowIso, relativeTime } from '@/services/time';
import { tokens } from '@/theme/tokens';
import { nextBestAction, stageLabel } from '@/features/projects/projectHelpers';
import { unansweredOf } from '@/features/chat/unanswered';
import { todayYmd, ymdToIso } from '@/features/projects/projectForm';
import type { Project } from '@/types';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'こんばんは';
  if (h < 11) return 'おはようございます';
  if (h < 17) return 'こんにちは';
  return 'こんばんは';
}

/** KPI 帯の 1 項目（ラベル／数値／補足） */
function KpiItem({ label, value, suffix, foot }: { label: string; value: number | null; suffix?: string; foot: ReactNode }) {
  return (
    <Box>
      <Typography component="dt" variant="caption" sx={{ display: 'block', color: tokens.color.inkSoft, fontWeight: 600 }}>{label}</Typography>
      <Typography component="dd" sx={{ m: 0, mt: 0.5, fontSize: 22, fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
        {value === null ? '—' : <CountUp value={value} />}
        {value !== null && suffix && <Box component="span" sx={{ fontSize: 13, fontWeight: 600, color: tokens.color.muted, ml: 0.5 }}>{suffix}</Box>}
      </Typography>
      <Typography component="dd" variant="caption" sx={{ m: 0, mt: 0.25, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{foot}</Typography>
    </Box>
  );
}

/** KPI の下の短い一覧（相談の未対応・今月の納品予定。2026-11-17 会議）。行を押すとプロジェクト詳細を開く */
function ShortList({ title, icon, empty, rows, onOpen }: {
  title: string; icon: ReactNode; empty: string;
  rows: { p: Project; sub: string }[];
  onOpen: (p: Project) => void;
}) {
  return (
    <Surface padding={{ xs: 2, md: 2.5 }} sx={{ minWidth: 0 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.25 }}>
        {icon}
        <Typography variant="h5" component="h2">{title}</Typography>
        <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums' }}>{rows.length}件</Typography>
      </Stack>
      {rows.length === 0 ? (
        <Typography variant="body2" color="text.secondary">{empty}</Typography>
      ) : (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {rows.map(({ p, sub }) => (
            <Box component="li" key={p.id} sx={{ '& + &': { borderTop: `1px solid ${tokens.color.border}` } }}>
              <Box
                component="button"
                type="button"
                onClick={() => onOpen(p)}
                aria-label={`${p.siteName} の詳細を開く`}
                sx={{
                  all: 'unset', boxSizing: 'border-box', width: '100%', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 1.25,
                  minHeight: 44, py: 1, px: 0.5, borderRadius: '8px',
                  '&:hover': { bgcolor: tokens.color.primarySoft },
                  '&:focus-visible': { outline: `2px solid ${tokens.color.primary}`, outlineOffset: 2 },
                }}
              >
                <Box aria-hidden sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: p.accent, flexShrink: 0 }} />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{p.siteName}</Typography>
                  <Typography variant="caption" noWrap sx={{ display: 'block' }}>{sub}</Typography>
                </Box>
                <ArrowRight size={15} color={tokens.color.muted} style={{ flexShrink: 0 }} aria-hidden />
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Surface>
  );
}

/** ホームダッシュボード */
export default function HomePage() {
  const { state } = useDemo();
  const { projects, accounts } = useRepositories();
  const { data: devAll } = accounts.useDevProjects();
  const { data: people } = accounts.useDevPeople();
  const navigate = useNavigate();
  const project = currentProject(state);

  const active = state.projects.filter((p) => p.progress < 100);
  const pendingTotal = state.projects.reduce((s, p) => s + p.pendingApprovals, 0);
  // ページ・お知らせは案件ごと（0.30.0）。公開予定はサイトを公開済み（運用・改善の段階）の全案件の分を、近い順に数える
  const scheduled = state.projects.filter((p) => isSiteLive(p.stage))
    .flatMap((p) => workOf(state, p.id).pages.filter((x) => x.status === 'scheduled'))
    .sort((a, b) => (a.scheduledAt ?? '').localeCompare(b.scheduledAt ?? ''));
  // 「今月の問い合わせ」は外した（2026-11-17 会議）。代わりに、PMO として見たい「相談の未対応」と「今月の納品予定」を出す
  // 開発担当の名前（プロジェクト詳細と同じ: ユーザー管理の担当。無効にした人は除く）
  const devNamesOf = (projectId: string) => people.filter((m) => !m.disabled && devAll[m.id]?.includes(projectId)).map((m) => m.name);
  // 相談の未対応: 会話の最後がお客様の案件（全案件。どの開発者のところで止まっているかを見る）
  const unanswered = state.projects.filter((p) => unansweredOf(state, p.id))
    .map((p) => {
      const devs = devNamesOf(p.id);
      return { p, sub: `開発担当: ${devs.length ? devs.join('・') : '未割り当て'}` };
    });
  // 今月の納品予定: 日程（schedule）の納品予定日が今月の案件。日程の無い案件は数えない。近い順
  const month = todayYmd().slice(0, 7);
  const deliveries = state.projects
    .map((p) => ({ p, date: workOf(state, p.id).schedule?.deliveryDate }))
    .filter((x): x is { p: Project; date: string } => !!x.date && x.date.slice(0, 7) === month)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(({ p, date }) => ({ p, day: formatDate(ymdToIso(date) ?? undefined), sub: `納品予定日 ${formatDate(ymdToIso(date) ?? undefined)}` }));
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
              m: 0, display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0,1fr))', md: 'repeat(5, minmax(0,1fr))' },
              '& > div': { px: { xs: 2, md: 2.5 }, py: { xs: 1.5, md: 2 }, minWidth: 0 },
              '& > div + div': { borderLeft: { md: `1px solid ${tokens.color.border}` } },
              '& > div:nth-of-type(even)': { borderLeft: { xs: `1px solid ${tokens.color.border}` } },
              '& > div:nth-of-type(n+3)': { borderTop: { xs: `1px solid ${tokens.color.border}`, md: 'none' } },
            }}
          >
            <KpiItem label="進行中プロジェクト" value={active.length} suffix="件" foot={`全 ${state.projects.length} 件中`} />
            <KpiItem label="承認待ち" value={pendingTotal} suffix="件" foot="顧客・社内の承認を含む" />
            <KpiItem label="公開予定ページ" value={scheduled.length} suffix="件" foot={scheduled[0] ? `次回 ${relativeTime(scheduled[0].scheduledAt)}` : '予約はありません'} />
            <KpiItem label="相談の未対応" value={unanswered.length} suffix="件" foot={unanswered.length ? 'お客様の相談に未返信のプロジェクト' : '未対応の相談はありません'} />
            <KpiItem label="今月の納品予定" value={deliveries.length} suffix="件" foot={deliveries[0] ? `次回 ${deliveries[0].day}` : '今月の納品はありません'} />
          </Box>
        </Surface>
      </Reveal>

      {/* 相談の未対応・今月の納品予定の内訳（2026-11-17 会議。管理者画面に相談の画面は無いので、プロジェクト詳細を開く） */}
      <Reveal delay={0.09}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', md: 'repeat(2, minmax(0,1fr))' }, gap: { xs: 2, md: 3 }, mb: { xs: 2, md: 3 }, alignItems: 'start' }}>
          <ShortList
            title="相談の未対応" icon={<MessageCircle size={18} color={tokens.color.muted} aria-hidden />}
            empty="お客様からの相談は、すべて返信済みです。" rows={unanswered}
            onOpen={(p) => open(p.id, `/projects/${p.id}`)}
          />
          <ShortList
            title="今月の納品予定" icon={<CalendarCheck size={18} color={tokens.color.muted} aria-hidden />}
            empty="今月が納品予定日のプロジェクトはありません（スケジュールを入れた案件だけを数えます）。" rows={deliveries}
            onOpen={(p) => open(p.id, `/projects/${p.id}`)}
          />
        </Box>
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
