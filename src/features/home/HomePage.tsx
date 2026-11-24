import { Box, Button, Stack, Typography } from '@mui/material';
import { ArrowRight, CalendarCheck, Hammer, PackageCheck, Rocket, CalendarDays, Clock, FolderKanban, MessageCircle, Stamp } from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRepositories } from '@/repositories';
import { useDemo } from '@/store/DemoStore';
import { isSiteLive } from '@/data/projectContent';
import { workOf } from '@/store/projectWork';
import { CountUp, MemberAvatar, Reveal, SectionTitle, Surface } from '@/components/ui';
import { formatDate, nowIso, relativeTime } from '@/services/time';
import { tokens } from '@/theme/tokens';
import { unansweredOf } from '@/features/chat/unanswered';
import { isoToYmd, ymdToIso } from '@/features/projects/projectForm';
import { buildDues, deliveryDues, monthDeliveries, releaseDues, type DueRow } from './homeDues';
import { memberById } from '@/data/members';
import { STAGES } from '@/data/projects';
import { releaseDateOf } from '@/data/schedule';
import { TOUCH } from '@/theme/media';
import type { Project } from '@/types';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'こんばんは';
  if (h < 11) return 'おはようございます';
  if (h < 17) return 'こんにちは';
  return 'こんばんは';
}


/** KPI のタイルの色（淡い面と、その上の文字色。4.5:1 以上の組み合わせ） */
const KPI_TONES = {
  primary: { bg: tokens.color.primarySoft, ink: tokens.color.onPrimaryContainer },
  warning: { bg: tokens.color.warningSoft, ink: tokens.color.warningInk },
  info: { bg: tokens.color.infoSoft, ink: tokens.color.infoInk },
  danger: { bg: tokens.color.dangerSoft, ink: tokens.color.dangerInk },
  success: { bg: tokens.color.successSoft, ink: tokens.color.successInk },
} as const;

/**
 * KPI の 1 枚（2026-11-17 ユーザー指示「進行中プロジェクト、承認待ち、公開予定ページ・・・の欄」。進行中のプロジェクトのカードにそろえる）:
 * 淡い色のタイル・白い丸の印・大きな数（等幅）・ラベル・補足。onOpen があれば押せる（キーボードは Enter / Space）。ホバーで少し浮く（動きを減らす設定では浮かない）
 */
function KpiItem({ label, value, suffix, foot, icon, tone, onOpen, wide = false }: {
  label: string; value: number | null; suffix?: string; foot: ReactNode;
  icon: ReactNode; tone: keyof typeof KPI_TONES; onOpen?: () => void; wide?: boolean;
}) {
  const c = KPI_TONES[tone];
  return (
    <Box
      {...(onOpen ? {
        role: 'link', tabIndex: 0, 'aria-label': `${label} ${value ?? '—'}${suffix ?? ''}を開く`, onClick: onOpen,
        onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } },
      } : {})}
      sx={{
        gridColumn: wide ? { xs: '1 / -1', md: 'auto' } : undefined,
        minWidth: 0, p: { xs: 1.75, md: 2 }, borderRadius: `${tokens.radius.lg}px`, bgcolor: c.bg, color: c.ink,
        display: 'flex', flexDirection: 'column', gap: 1,
        ...(onOpen ? {
          cursor: 'pointer',
          transition: `transform .2s ${tokens.motion.easeCss}, box-shadow .2s ${tokens.motion.easeCss}`,
          '&:hover': { transform: 'translateY(-2px)', boxShadow: tokens.shadow.sm },
          '&:focus-visible': { outline: `2px solid ${tokens.color.primary}`, outlineOffset: 2 },
          '@media (prefers-reduced-motion: reduce)': { transition: 'none', '&:hover': { transform: 'none' } },
        } : {}),
      }}
    >
      <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0 }}>
        <Box aria-hidden sx={{ width: 40, height: 40, borderRadius: '50%', bgcolor: tokens.color.surface, color: c.ink, display: 'grid', placeItems: 'center', flexShrink: 0, boxShadow: tokens.shadow.sm }}>
          {icon}
        </Box>
        <Typography component="dt" variant="caption" sx={{ color: 'inherit', fontWeight: 700, minWidth: 0 }}>{label}</Typography>
      </Stack>
      <Typography component="dd" sx={{ m: 0, color: 'inherit', fontSize: 26, fontWeight: 700, lineHeight: 1.15, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
        {value === null ? '—' : <CountUp value={value} />}
        {value !== null && suffix && <Box component="span" sx={{ fontSize: 13, fontWeight: 600, ml: 0.5 }}>{suffix}</Box>}
      </Typography>
      <Typography component="dd" variant="caption" sx={{ m: 0, color: 'inherit', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{foot}</Typography>
    </Box>
  );
}

/**
 * KPI の下の短い一覧（相談の未対応・今月の納品予定。2026-11-17 会議）。行を押すと onOpen（プロジェクト詳細・相談）を開く。
 * action: 見出しの右のボタン（相談の「一覧を表示」。0 件でも出す）。openLabel: 行の読み上げ（例「の相談を開く」）
 * limit: 先に出す行の数。超える分は見出しの右の「すべて見る」で開く（2026-11-24 会議「最大 4 件＋すべて見る」）。badge: 行の印（例「納品済み」）
 */
function ShortList({ title, icon, empty, rows, onOpen, action, openLabel = 'の詳細を開く', limit }: {
  title: string; icon: ReactNode; empty: string;
  rows: { p: Project; sub: string; badge?: string }[];
  onOpen: (p: Project) => void;
  action?: ReactNode;
  openLabel?: string;
  limit?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const overflow = limit !== undefined && rows.length > limit;
  const shown = overflow && !expanded ? rows.slice(0, limit) : rows;
  return (
    <Surface padding={{ xs: 2, md: 2.5 }} sx={{ minWidth: 0 }}>
      <Stack direction="row" alignItems="center" flexWrap="wrap" useFlexGap sx={{ gap: 1, mb: 1.25, minHeight: 32 }}>
        {icon}
        <Typography variant="h5" component="h2">{title}</Typography>
        <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums', flex: 1 }}>{rows.length}件</Typography>
        {action}
        {overflow && (
          <Button size="small" aria-expanded={expanded} aria-controls={listId} aria-label={expanded ? `${title}を閉じる` : undefined} onClick={() => setExpanded((v) => !v)} sx={{ flexShrink: 0, [TOUCH]: { minHeight: 44 } }}>
            {expanded ? '閉じる' : `すべて見る（${rows.length}件）`}
          </Button>
        )}
      </Stack>
      {rows.length === 0 ? (
        <Typography variant="body2" color="text.secondary">{empty}</Typography>
      ) : (
        <Box component="ul" id={listId} sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {shown.map(({ p, sub, badge }) => (
            <Box component="li" key={p.id} sx={{ '& + &': { borderTop: `1px solid ${tokens.color.border}` } }}>
              <Box
                component="button"
                type="button"
                onClick={() => onOpen(p)}
                aria-label={`${p.siteName}${badge ? `（${badge}）` : ''} ${openLabel}`}
                sx={{
                  all: 'unset', boxSizing: 'border-box', width: '100%', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 1.25,
                  minHeight: 44, py: 1, px: 0.5, borderRadius: '8px',
                  '&:hover': { bgcolor: tokens.color.primarySoft },
                  '&:focus-visible': { outline: `2px solid ${tokens.color.primary}`, outlineOffset: 2 },
                }}
              >
                <Box aria-hidden sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: p.accent, flexShrink: 0 }} />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
                    <Typography variant="body2" noWrap sx={{ fontWeight: 600, minWidth: 0 }}>{p.siteName}</Typography>
                    {badge && (
                      <Box component="span" sx={{ px: 0.75, borderRadius: 999, bgcolor: tokens.color.successSoft, color: tokens.color.successInk, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {badge}
                      </Box>
                    )}
                  </Stack>
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

/**
 * 進行中のプロジェクトのカード（2026-11-17 ユーザー指示「進行中プロジェクトの列をお洒落に」）。
 * 上にブランド色の帯、白い丸の印、いまの段階の淡い色のチップ、8 段階の区切りバー（済み＝緑・いま＝主色・これから＝灰）、
 * 公開予定日（スケジュール。無ければ出さない）・承認待ち・担当ディレクター・更新日時。押すとプロジェクト詳細を開く。
 * 管理者画面は見るだけなので「次の一手」は出さない（2026-11-17 ユーザー指示）
 */
function ActiveProjectCard({ p, release, onOpen }: { p: Project; release?: string; onOpen: () => void }) {
  const owner = memberById(p.ownerId);
  const cur = Math.max(0, STAGES.findIndex((s) => s.id === p.stage));
  const stage = STAGES[cur];
  return (
    <Surface
      interactive
      padding={0}
      role="link"
      tabIndex={0}
      aria-label={`${p.siteName}（${p.clientName}）の詳細を開く`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      sx={{
        height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column',
        transition: `transform .2s ${tokens.motion.easeCss}, box-shadow .2s ${tokens.motion.easeCss}`,
        '&:hover': { transform: 'translateY(-2px)', boxShadow: tokens.shadow.sm },
        '&:focus-visible': { outline: `2px solid ${tokens.color.primary}`, outlineOffset: 2 },
        '@media (prefers-reduced-motion: reduce)': { transition: 'none', '&:hover': { transform: 'none' } },
      }}
    >
      {/* ブランド色の帯 */}
      <Box aria-hidden sx={{ height: 6, bgcolor: p.accent, flexShrink: 0 }} />
      <Box sx={{ p: { xs: 2, md: 2.5 }, display: 'flex', flexDirection: 'column', gap: 1.75, flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
          <Box
            aria-hidden
            sx={{
              width: 40, height: 40, borderRadius: '50%', bgcolor: tokens.color.surface, border: `2px solid ${p.accent}`,
              display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 15, color: tokens.color.ink, flexShrink: 0, boxShadow: tokens.shadow.sm,
            }}
          >
            {p.siteName.slice(0, 1)}
          </Box>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="h5" component="h3" noWrap>{p.siteName}</Typography>
            <Typography variant="caption" noWrap sx={{ display: 'block' }}>{p.clientName}</Typography>
          </Box>
          <Typography component="span" variant="h5" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
            {p.progress}<Box component="span" sx={{ fontSize: 12, fontWeight: 600, color: tokens.color.muted, ml: 0.25 }}>%</Box>
          </Typography>
        </Stack>

        {/* いまの段階（淡い色のチップ）と 8 段階の区切りバー */}
        <Box>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1, minWidth: 0 }}>
            <Box component="span" sx={{ px: 1.25, py: 0.25, borderRadius: 999, bgcolor: tokens.color.primarySoft, color: tokens.color.onPrimaryContainer, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
              {stage?.label ?? p.stage}
            </Box>
            <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums' }}>段階 {cur + 1} / {STAGES.length}</Typography>
          </Stack>
          <Box role="img" aria-label={`制作の${STAGES.length}段階のうち ${cur + 1} 段階目（${stage?.label ?? p.stage}）・進捗 ${p.progress}%`} sx={{ display: 'flex', gap: '4px' }}>
            {STAGES.map((s, idx) => (
              <Box
                key={s.id}
                sx={{
                  flex: 1, height: 6, borderRadius: 3,
                  bgcolor: idx < cur ? tokens.color.success : idx === cur ? tokens.color.primary : tokens.color.bgSubtle,
                }}
              />
            ))}
          </Box>
        </Box>

        {/* 日付・承認待ち（1 行目）／担当ディレクター・更新（2 行目。名前が切れないように分ける） */}
        <Stack spacing={1.25} sx={{ mt: 'auto', color: tokens.color.muted, minWidth: 0 }}>
        {(release || p.pendingApprovals > 0) && (
        <Stack direction="row" alignItems="center" sx={{ flexWrap: 'wrap', columnGap: 1, rowGap: 0.75 }}>
          {release && (
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ px: 1, py: 0.25, borderRadius: 999, bgcolor: tokens.color.successSoft, color: tokens.color.successInk }}>
              <CalendarDays size={13} aria-hidden />
              <Typography variant="caption" sx={{ color: 'inherit', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>公開予定 {formatDate(release)}</Typography>
            </Stack>
          )}
          {p.pendingApprovals > 0 && (
            <Box component="span" sx={{ px: 1, py: 0.25, borderRadius: 999, bgcolor: tokens.color.warningSoft, color: tokens.color.warningInk, fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              承認待ち {p.pendingApprovals}
            </Box>
          )}
        </Stack>
        )}
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0, flex: 1 }}>
            <MemberAvatar id={p.ownerId} size={22} tooltip={false} />
            <Typography variant="caption" noWrap sx={{ minWidth: 0 }}>ディレクター {owner.name}</Typography>
          </Stack>
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexShrink: 0 }}>
            <Clock size={13} aria-hidden />
            <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums' }}>更新 {relativeTime(p.updatedAt)}</Typography>
          </Stack>
        </Stack>
        </Stack>
      </Box>
    </Surface>
  );
}

/** ホームダッシュボード */
export default function HomePage() {
  const { state } = useDemo();
  const { projects } = useRepositories();
  const navigate = useNavigate();

  // 進行中 = 全案件（改善の段階も契約が続いているので含める。2026-11-17 ユーザー指摘「進行中のプロジェクトは８じゃない？」。以前は進捗 100% の改善の段階を除いていた）
  const active = state.projects;
  const liveCount = state.projects.filter((p) => isSiteLive(p.stage)).length;
  const pendingTotal = state.projects.reduce((s, p) => s + p.pendingApprovals, 0);
  // ページ・お知らせは案件ごと（0.30.0）。公開予定はサイトを公開済み（運用・改善の段階）の全案件の分を、近い順に数える
  const scheduled = state.projects.filter((p) => isSiteLive(p.stage))
    .flatMap((p) => workOf(state, p.id).pages.filter((x) => x.status === 'scheduled'))
    .sort((a, b) => (a.scheduledAt ?? '').localeCompare(b.scheduledAt ?? ''));
  // 「今月の問い合わせ」は外した（2026-11-17 会議）。代わりに、PMO として見たい「相談の未対応」と「今月の納品予定」を出す
  // 相談の未対応: 会話の最後がお客様の案件（全案件）。返信するのは担当ディレクターなので、誰のところで止まっているかはディレクターで見る
  // （2026-11-17 ユーザー指示「担当ディレクターがチャット対応できる、担当開発者は複数選択可」。以前は開発担当の名前）
  const unanswered = state.projects.filter((p) => unansweredOf(state, p.id))
    .map((p) => ({ p, sub: `担当ディレクター: ${memberById(p.ownerId).name}` }));
  // 予定の集計は homeDues.ts（純粋関数。2026-11-24 会議の指摘で切り出し、今日・今月を日本時間に固定）
  const dueRows: DueRow<Project>[] = state.projects.map((p) => {
    const w = workOf(state, p.id);
    return { p, stage: p.stage, schedule: w.schedule, launchDate: p.launchDate ? isoToYmd(p.launchDate) || undefined : undefined, buildCompleted: !!w.design?.buildCompletedAt, qualityApproved: !!w.design?.qualityApprovedAt };
  });
  // 今月の納品予定: 日程（schedule）の納品予定日が日本時間の今月の案件。日程の無い案件は数えない。
  // 納品済み（納品検収済み・公開済み）も含めて「納品済み」の印を付ける（2026-11-24 会議「終了済みと見分けられない」。含めるのは SAFE ASSUMPTION lead 2026-11-24）
  const deliveries = monthDeliveries(dueRows, new Date())
    .map(({ p, date, delivered }) => ({ p, sub: `納品予定日 ${formatDate(ymdToIso(date) ?? undefined)}`, badge: delivered ? '納品済み' : undefined }));
  // 制作の完了予定（2026-11-17 ユーザー指示「制作の完了予定を追加」）: スケジュールに制作の完了予定があり、まだ全ページの構築が終わっていない案件。近い順
  const buildDueList = buildDues(dueRows);
  // 納品完了予定・公開予定（同日ユーザー指示「制作完了予定、納品完了予定、公開予定の順に追加」）: まだ済んでいない案件の数と、いちばん近い日
  const deliveryDueList = deliveryDues(dueRows);
  const releaseDueList = releaseDues(dueRows);
  const nextText = (list: { p: Project; date: string }[], none: string) => (list[0] ? `次回 ${formatDate(ymdToIso(list[0].date) ?? undefined)}・${list[0].p.siteName}` : none);

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

      {/* KPI（2026-11-17 ユーザー指示で 1 本の帯から 5 枚の淡い色のタイルに。xs は 2 列で最後の 1 枚は横いっぱい、md 以上は 5 列。数え方は変えていない） */}
      <Reveal delay={0.06}>
        <Box
          component="dl"
          sx={{ m: 0, mb: { xs: 2, md: 3 }, display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0,1fr))', md: 'repeat(3, minmax(0,1fr))', xl: 'repeat(5, minmax(0,1fr))' }, gap: { xs: 1.5, md: 2 } }}
        >
          <KpiItem label="進行中プロジェクト" value={active.length} suffix="件" foot={`うち公開済み（運用・改善）${liveCount} 件`}
            icon={<FolderKanban size={18} />} tone="primary" onOpen={() => navigate('/projects')} />
          <KpiItem label="承認待ち" value={pendingTotal} suffix="件" foot="顧客・社内の承認を含む" icon={<Stamp size={18} />} tone="warning" />
          {/* 「公開予定ページ」のタイルは外した（同日ユーザー指示「公開予定ページは要らない」） */}
          {/* 「相談の未対応」のタイルは外した（下の「相談の未対応」の欄と重なるため。2026-11-17 ユーザー指示「編集した欄の相談の未対応は要らない」） */}
          {/* 「今月の納品予定」のタイルも外した（下の「今月の納品予定」の欄と重なるため。同日ユーザー指示） */}
          <KpiItem label="制作の完了予定" value={buildDueList.length} suffix="件" foot={nextText(buildDueList, '制作中の案件はありません')}
            icon={<Hammer size={18} />} tone="success" />
          <KpiItem label="納品完了予定" value={deliveryDueList.length} suffix="件" foot={nextText(deliveryDueList, '納品前の案件はありません')} icon={<PackageCheck size={18} />} tone="info" />
          <KpiItem label="公開予定" value={releaseDueList.length} suffix="件" foot={nextText(releaseDueList, '公開前の案件はありません')} icon={<Rocket size={18} />} tone="primary" />
        </Box>
      </Reveal>

      {/* 相談の未対応・今月の納品予定の内訳（2026-11-17 会議）。
          相談は同日ユーザー指示「管理者は全てのチャット一覧が見れる」「相談の未対応の欄に一覧を表示を追加。サイドに入らない」:
          「一覧を表示」で全案件の相談（/chat。見るだけ）を開き、未対応の行はその案件の会話を開く */}
      <Reveal delay={0.09}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', md: 'repeat(2, minmax(0,1fr))' }, gap: { xs: 2, md: 3 }, mb: { xs: 2, md: 3 }, alignItems: 'start' }}>
          <ShortList
            title="相談の未対応" icon={<MessageCircle size={18} color={tokens.color.muted} aria-hidden />}
            empty="お客様からの相談は、すべて返信済みです。" rows={unanswered}
            onOpen={(p) => navigate(`/chat?p=${encodeURIComponent(p.id)}`)}
            openLabel="の相談を開く" limit={4}
            action={<Button size="small" endIcon={<ArrowRight size={15} />} onClick={() => navigate('/chat')} sx={{ flexShrink: 0, [TOUCH]: { minHeight: 44 } }}>一覧を表示</Button>}
          />
          <ShortList
            title="今月の納品予定" icon={<CalendarCheck size={18} color={tokens.color.muted} aria-hidden />}
            empty="今月が納品予定日のプロジェクトはありません（スケジュールを入れた案件だけを数えます）。" rows={deliveries} limit={4}
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
            {/* 2026-11-17 ユーザー指示「進行中プロジェクトの列をお洒落に」: プロジェクト詳細の新しい見た目（色の帯・淡い色の面・白い丸の印・等幅の日付）にそろえる */}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', sm: 'repeat(2, minmax(0,1fr))', xl: 'repeat(3, minmax(0,1fr))' }, gap: 2 }}>
              {active.map((p, i) => (
                <Reveal key={p.id} delay={0.16 + i * 0.05} style={{ height: '100%' }}>
                  <ActiveProjectCard p={p} release={releaseDateOf(state, p)} onOpen={() => open(p.id, `/projects/${p.id}`)} />
                </Reveal>
              ))}
            </Box>
          </Box>

        </Stack>
      </Box>
    </Box>
  );
}
