import { Box, Button, ButtonBase, Stack, Typography } from '@mui/material';
import { ArrowLeft, ArrowRight, BadgeCheck, CalendarDays, Check, CheckCircle2, Clock, Send, Code2, FolderSearch, Globe, Mail, MapPin, Pencil, Phone, User, UserRound } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { SitePreviewButton } from '@/features/quality/SitePreviewButton';
import type { Project, Stage } from '@/types';
import { useDemo } from '@/store/DemoStore';
import { workView } from '@/store/projectWork';
import { RouteLoader } from '@/components/layout/RouteLoader';
import { useRepositories } from '@/repositories';
import { STAGES, stageIndex } from '@/data/projects';
import { memberById } from '@/data/members';
import { REQUIREMENT_QUESTIONS } from '@/data/requirements';
import { isAnswered } from '@/features/requirements/validation';
import { TOTAL_QUALITY_QUESTIONS } from '@/data/quality';
import { MemberAvatar, ProgressRing, Reveal, StatusPill, Surface } from '@/components/ui';
import { formatDate, formatDateTime, relativeTime } from '@/services/time';
import { tokens } from '@/theme/tokens';
import { TOUCH } from '@/theme/media';
import { DevProjectGate } from '@/features/dev/DevProjectGate';
import { useDevProjects } from '@/features/dev/useDevUser';
import { nextBestAction, qualityCompletion } from './projectHelpers';
import { devNextWork, useProjectRoutes } from './projectRoutes';
import { ClientStatusPanel } from './ClientStatusPanel';
import { ProjectScheduleSection } from '@/features/schedule/ProjectScheduleSection';
import { ApprovalHistory } from './ApprovalHistory';
import { sitemapCreated } from '@/data/sitemap';
import { useWrite } from '@/hooks/useWrite';
import { EditProjectDialog } from './EditProjectDialog';
import { FollowUpLinks } from './FollowUpLinks';
import { projectDevIds, ymdToIso, type ProjectDraft } from './projectForm';
import { releaseDateOf } from '@/data/schedule';
import { approvalSteps, type ApprovalKey } from '@/features/portal/portalSteps';
import { RequestApprovalButton } from '@/features/portal/RequestApprovalButton';

/** 段階の最後のお客様の承認（2026-11-17 ユーザー指示「各段階で最後に承認。ヒアリングは要らない、リリースまで」） */
const STAGE_APPROVAL: Partial<Record<Stage, ApprovalKey>> = { requirements: 'requirements', schedule: 'schedule', build: 'build', quality: 'quality', release: 'release' };

function Fact({ label, value, ok }: { label: string; value: ReactNode; ok?: boolean }) {
  // 進行中の段階の状況（ラベルの下に値。2026-11-17「8段階が見にくい」で、左右に離れた 1 行から小さな枠に）
  return (
    <Box sx={{ px: 1.75, py: 1.25, borderRadius: 2.5, bgcolor: tokens.color.surfaceMuted, minWidth: 0 }}>
      <Typography variant="caption" component="p" sx={{ color: tokens.color.muted }}>{label}</Typography>
      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.25, minWidth: 0 }}>
        {ok && <CheckCircle2 size={16} color={tokens.color.success} style={{ flexShrink: 0 }} aria-hidden />}
        <Typography variant="body1" sx={{ fontWeight: 700, color: tokens.color.ink }} noWrap>{value}</Typography>
      </Stack>
    </Box>
  );
}

function NotFound({ list }: { list: string }) {
  return (
    <Surface sx={{ textAlign: 'center', py: 8, maxWidth: 560, mx: 'auto' }}>
      <Stack alignItems="center" spacing={1.5}>
        <FolderSearch size={36} color={tokens.color.faint} />
        <Typography variant="h3" component="h1">プロジェクトが見つかりません</Typography>
        <Typography variant="body2" color="text.secondary">URLが間違っているか、デモの初期化で削除された可能性があります。</Typography>
        <Button component={RouterLink} to={list} variant="contained" startIcon={<ArrowLeft size={16} />} sx={{ mt: 1 }}>
          プロジェクト一覧へ戻る
        </Button>
      </Stack>
    </Surface>
  );
}

/**
 * プロジェクト詳細（ヘッダーの直下に8段階のパイプライン、その下にお客様の対応状況）。
 * 管理者画面（/projects/:id）と開発者画面（/dev/projects/:id。0.26.0）で同じ画面。開発者画面では
 * URL の案件が担当かを確かめ（担当外は DevProjectGate の案内。転送はしない）、行き先は開発者画面の中だけにする（useProjectRoutes）
 */
export default function ProjectDetailPage() {
  const { projectId } = useParams();
  const routes = useProjectRoutes();
  const { projects } = useRepositories();
  const { data: list, loading } = projects.useList();
  const navigate = useNavigate();
  const p = list.find((x) => x.id === projectId);
  const currentId = projects.useCurrentId();
  const mine = useDevProjects();
  // 開発者画面: URL で開いた案件が担当なら、上部の表示中の案件をそれに揃える（ブラウザの戻る・URL 直打ちでも上部と本文を食い違わせない）。
  // 揃えた後は currentId が一致して syncId が null になるので繰り返さない（上部の切替は詳細へ移動するので URL も変わる）。担当外・存在しない id は選ばない。
  // 管理者画面は従来どおり開いただけでは選ばない（routes.dev の時だけ）
  const syncId = routes.dev && p && p.id !== currentId && mine.some((m) => m.id === p.id) ? p.id : null;
  useEffect(() => {
    if (syncId) projects.select(syncId);
  }, [syncId]);
  // 読み込み中は「見つからない」と判定しない（repositories/types.ts の決まり）
  if (loading) return <RouteLoader label="プロジェクト" />;
  if (!p) return <NotFound list={routes.list} />;
  if (routes.dev) {
    return (
      <DevProjectGate project={p} onOpen={(id) => { projects.select(id); navigate(routes.detail(id)); }}>
        <Detail p={p} />
      </DevProjectGate>
    );
  }
  return <Detail p={p} />;
}

function Detail({ p }: { p: Project }) {
  const routes = useProjectRoutes();
  // サイトマップ・デザイン・品質・CMS・診断は repository の範囲外（live では隠す。§14）なので DemoStore から読む
  // 制作データ（ヒアリング〜品質チェック）は案件ごと（0.29.0）。管理者画面は開いただけでは案件を選ばないので、この案件の分を差し込んで読む
  const { state: demoState } = useDemo();
  const state = workView(demoState, p.id);
  const { projects, accounts } = useRepositories();
  const req = state.requirements;
  const { data: devAll } = accounts.useDevProjects();
  const { data: people } = accounts.useDevPeople();
  const navigate = useNavigate();
  const { data: allProjects } = projects.useList();
  const write = useWrite();
  // 情報の編集は管理者画面の demo だけ（live の repository は update を持たない。2026-11-12）
  const update = !routes.dev ? projects.update : undefined;
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveInfo = (draft: ProjectDraft) => {
    if (!update) return;
    setSaving(true);
    void write(update(p.id, draft), 'プロジェクトの情報を更新しました').then((ok) => {
      setSaving(false);
      if (ok) setEditing(false);
    });
  };

  const cur = stageIndex(p.stage);
  // 制作の8段階で押した段階（無ければいまの段階）。別の案件を開いたら戻す
  const [picked, setPicked] = useState<Stage | null>(null);
  useEffect(() => setPicked(null), [p.id]);
  const selIndex = stageIndex(picked ?? p.stage);
  const sel = STAGES[selIndex] ?? STAGES[cur] ?? STAGES[0];
  const selDone = selIndex < cur;
  const selActive = selIndex === cur;
  const selFuture = selIndex > cur;
  const steps = approvalSteps(state);
  // 段階の最後のお客様の承認（無い段階は undefined）
  const stepOf = (id: Stage) => steps.find((x) => x.key === STAGE_APPROVAL[id]);
  const finalStep = stepOf(sel.id);
  // 柱に出す承認日（短く。例 10/3）
  const shortDate = (iso?: string) => { if (!iso) return ''; const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()}`; };
  const owner = memberById(p.ownerId);
  // 開発担当（ユーザー管理で決める。開発者画面の権限の有無は問わない。登録した開発者も含め、無効にした人は除く）
  const devPeople = people.filter((m) => !m.disabled);
  const devNames = devPeople.filter((m) => devAll[m.id]?.includes(p.id)).map((m) => m.name);
  const q = qualityCompletion(state.qualityChecks);
  const remainingQuestions = REQUIREMENT_QUESTIONS.filter((question) => !isAnswered(req.answers[question.id])).length;
  const published = state.pages.filter((x) => x.status === 'published').length;
  const scheduled = state.pages.filter((x) => x.status === 'scheduled').length;
  const latest = state.diagnoses[0];
  const reqStatus = { draft: '入力中', analyzed: 'AI分析済み', approved: '承認済み' }[req.status];
  // 運用（ページ）・改善（診断）も案件ごと（0.30.0）なので、どの案件でもその案件の数値と次の作業を出す
  const demoAction = nextBestAction(state);
  // 開発者画面はダッシュボードのカードと同じ「次の作業」（行き先は開発者画面の中だけ）
  const devWork = routes.dev ? devNextWork(p, state) : null;
  const next = devWork
    ? { label: devWork.next, to: devWork.to }
    : { label: demoAction.cta, to: demoAction.to };

  const facts: Record<Stage, ReactNode> = {
    hearing: (
      <>
        <Fact label="回答" value={remainingQuestions === 0 ? 'すべて回答済み' : `残り ${remainingQuestions} 問`} ok={req.status !== 'draft'} />
        <Fact label="状態" value={req.status === 'draft' ? '入力中' : '回答済み'} ok={req.status !== 'draft'} />
      </>
    ),
    requirements: (
      <>
        <Fact label="状態" value={reqStatus} ok={req.status === 'approved'} />
        <Fact label="承認日時" value={formatDateTime(req.approvedAt)} />
      </>
    ),
    // 制作〜公開の日程（2026-11-17 会議）
    schedule: (
      <>
        <Fact label="納品予定日" value={state.schedule ? formatDate(ymdToIso(state.schedule.deliveryDate) ?? undefined) : '未入力'} ok={!!state.schedule} />
        <Fact label="公開予定日" value={state.schedule ? formatDate(ymdToIso(state.schedule.releaseDate) ?? undefined) : '未入力'} ok={!!state.schedule} />
      </>
    ),
    build: (
      <>
        <Fact label="サイトマップ" value={state.sitemap.approvedAt ? '承認済み' : sitemapCreated(state.sitemap) ? '未承認' : '未作成'} ok={!!state.sitemap.approvedAt} />
        <Fact label="デザイン" value={state.design.approvedAt ? '採用済み' : state.design.selected ? '選択中' : '未選択'} ok={!!state.design.approvedAt} />
        <Fact label="全ページ構築" value={state.design.buildCompletedAt ? '完了' : '未実施'} ok={!!state.design.buildCompletedAt} />
      </>
    ),
    quality: (
      <>
        <Fact label="双方確認済み" value={`${q.done} / ${q.total}項目`} ok={q.percent === 100} />
        <Fact label="完了率" value={`${q.percent}%`} />
        <Fact label="資料上の問数" value={`${TOTAL_QUALITY_QUESTIONS}問`} />
      </>
    ),
    // リリース（公開。2026-11-17 会議）
    release: (
      <>
        <Fact label="納品検収" value={state.design.qualityApprovedAt ? `完了 ${formatDateTime(state.design.qualityApprovedAt)}` : '未完了'} ok={!!state.design.qualityApprovedAt} />
        <Fact label="公開予定日" value={formatDate(releaseDateOf(state, p))} />
      </>
    ),
    operation: (
      <>
        {/* ページとお知らせは別物（2026-11-18 ユーザー指示）なので件数も分ける */}
        <Fact label="ページ・お知らせ" value={`${state.pages.filter((p) => p.type !== 'news').length}件・${state.pages.filter((p) => p.type === 'news').length}件`} />
        <Fact label="公開中" value={`${published}件`} />
        <Fact label="予約公開" value={`${scheduled}件`} />
      </>
    ),
    improvement: (
      <>
        <Fact label="診断回数" value={`${state.diagnoses.length}回`} />
        <Fact label="最新スコア" value={latest ? `${latest.score}点` : '—'} />
        <Fact label="最新診断" value={latest ? relativeTime(latest.at) : '—'} />
      </>
    ),
  };

  const go = (to: string) => {
    projects.select(p.id);
    navigate(to);
  };

  return (
    <Box>
      <Button component={RouterLink} to={routes.list} size="small" startIcon={<ArrowLeft size={16} />} sx={{ mb: 2, ml: -1 }}>
        プロジェクト一覧
      </Button>

      {/* ヘッダー */}
      <Reveal>
        <Surface padding={{ xs: 2.5, md: 3.5 }} sx={{ mb: { xs: 3, md: 4 }, overflow: 'hidden' }}>
          <Box aria-hidden sx={{ position: 'absolute', inset: '0 0 auto 0', height: 4, bgcolor: p.accent }} />
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} alignItems={{ md: 'center' }}>
            <Box sx={{ width: 64, height: 64, borderRadius: '18px', bgcolor: p.accent, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 26, fontWeight: 750, flexShrink: 0 }}>
              {p.siteName.slice(0, 1)}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" spacing={1.5} alignItems="flex-start" justifyContent="space-between">
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="overline">{p.clientName}・{p.industry}</Typography>
                  <Typography variant="h1" component="h1">{p.siteName}</Typography>
                </Box>
                <Stack direction="row" spacing={1} sx={{ flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end', rowGap: 1 }}>
                  {/* 制作中のサイト（2026-11-18 ユーザー指示「プロジェクトに入ったところで見えるように」）。デザイン採用前は押せない */}
                  <SitePreviewButton projectId={p.id} size="small" />
                  {update && (
                    <Button variant="outlined" size="small" startIcon={<Pencil size={15} />} onClick={() => setEditing(true)} sx={{ flexShrink: 0, minHeight: 36, [TOUCH]: { minHeight: 44 } }}>
                      編集
                    </Button>
                  )}
                </Stack>
              </Stack>
              <Stack direction="row" sx={{ mt: 1.5, flexWrap: 'wrap', gap: { xs: 1, sm: 2.5 }, color: tokens.color.muted }}>
                <Stack direction="row" spacing={0.75} alignItems="center"><Globe size={15} /><Typography variant="body2">{p.siteUrl.replace(/^https?:\/\//, '')}</Typography></Stack>
                {/* 担当ディレクター（相談の窓口）と開発担当は別のもの（2026-11-17 ユーザー指示「担当ディレクターがチャット対応できる、担当開発者は複数選択可」） */}
                <Stack direction="row" spacing={0.75} alignItems="center"><User size={15} aria-hidden /><Typography variant="body2">担当ディレクター（相談の窓口）: {owner.name}</Typography></Stack>
                <Stack direction="row" spacing={0.75} alignItems="center"><Code2 size={15} aria-hidden /><Typography variant="body2">開発担当: {devNames.length ? devNames.join('・') : 'なし'}</Typography></Stack>
                <Stack direction="row" spacing={0.75} alignItems="center"><Clock size={15} /><Typography variant="body2">更新 {relativeTime(p.updatedAt)}</Typography></Stack>
                {releaseDateOf(state, p) && <Stack direction="row" spacing={0.75} alignItems="center"><CalendarDays size={15} /><Typography variant="body2">公開予定 {formatDate(releaseDateOf(state, p))}</Typography></Stack>}
              </Stack>
              {/* お客様の連絡先（2026-11-17 会議。管理者が作成・編集で入れる。無い案件は出さない） */}
              {p.client && (
                <Box sx={{ mt: 1.5, pt: 1.5, borderTop: `1px dashed ${tokens.color.border}` }}>
                  <Typography variant="caption" component="p" sx={{ fontWeight: 600, mb: 0.75 }}>お客様の連絡先</Typography>
                  <Stack direction="row" sx={{ flexWrap: 'wrap', gap: { xs: 1, sm: 2.5 }, color: tokens.color.muted }}>
                    {p.client.contactName && <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}><UserRound size={15} aria-hidden /><Typography variant="body2">{p.client.contactName} 様</Typography></Stack>}
                    {p.client.email && <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}><Mail size={15} aria-label="メールアドレス" /><Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{p.client.email}</Typography></Stack>}
                    {p.client.phone && <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}><Phone size={15} aria-label="電話番号" /><Typography variant="body2">{p.client.phone}</Typography></Stack>}
                    {p.client.address && <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}><MapPin size={15} aria-label="住所" /><Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{p.client.address}</Typography></Stack>}
                  </Stack>
                </Box>
              )}
            </Box>
            <Stack direction="row" spacing={2} alignItems="center">
              <ProgressRing value={p.progress} size={88} stroke={8} color={p.accent} label="全体の進捗" />
              <Box sx={{ minWidth: 0, flex: { xs: 1, md: 'none' } }}>
                {/* 「次に必要な作業」は開発者画面だけ（管理者画面は見るだけ。2026-11-17 ユーザー指示） */}
                {routes.dev && (
                  <>
                    <Typography variant="caption" component="p" sx={{ mb: 0.75 }}>次に必要な作業</Typography>
                    <Button
                      variant="contained"
                      endIcon={<ArrowRight size={16} />}
                      onClick={() => go(next.to)}
                      sx={{ minHeight: 44, maxWidth: { md: 260 }, textAlign: 'left', justifyContent: 'space-between', lineHeight: 1.4, py: 1 }}
                    >
                      {next.label}
                    </Button>
                  </>
                )}
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: routes.dev ? 1 : 0 }}>
                  <MemberAvatar id={p.ownerId} size={24} />
                  {p.pendingApprovals > 0 && <StatusPill tone="warning">承認待ち {p.pendingApprovals}</StatusPill>}
                </Stack>
              </Box>
            </Stack>
          </Stack>
        </Surface>
      </Reveal>

      {/* 追加開発のつながり（0.31.0）。元の案件・追加開発の詳細を開く（開発者画面では詳細を開くと上部の案件も揃う） */}
      <FollowUpLinks p={p} projects={allProjects} onOpen={(id) => navigate(routes.detail(id))} />

      <Typography variant="h3" component="h2" sx={{ mb: 2 }}>制作の8段階</Typography>

      {/* 2026-11-17 ユーザー指示「バーのクリックした部分が大きくなって下に項目が表示される」: 8 段階を 1 本のバーにし、
          押した段階がバーの中で広がって、その中に項目（説明・状況・作業画面・お客様の承認）を出す（横のアコーディオン。初めはいまの段階）。
          狭い画面（lg 未満）は縦に広がる。始まっていない段階も説明は見られるが、作業画面は開けない（2026-11-12 ユーザー指示） */}
      <Reveal delay={0.06}>
        <Box
          component="ol"
          aria-label="制作の8段階"
          sx={{
            listStyle: 'none', m: 0, p: 0, mb: 3, display: 'flex', flexDirection: { xs: 'column', lg: 'row' }, gap: 1,
            minHeight: { lg: 280 },
          }}
        >
          {STAGES.map((s, i) => {
            const done = i < cur;
            const active = i === cur;
            const open = s.id === sel.id;
            const tone = done ? tokens.color.success : active ? tokens.color.primary : tokens.color.borderStrong;
            const status = done ? '完了' : active ? '進行中' : 'これから';
            return (
              <Box
                component="li" key={s.id} aria-current={active ? 'step' : undefined}
                sx={{
                  position: 'relative', overflow: 'hidden', minWidth: 0, borderRadius: `${tokens.radius.lg}px`,
                  flex: { xs: '0 0 auto', lg: open ? '1 1 0px' : '0 0 68px' },
                  transition: `flex .55s ${tokens.motion.easeSpringCss}, background-color .3s, box-shadow .3s`,
                  bgcolor: open ? tokens.color.surface : active ? tokens.color.primarySoft : tokens.color.surfaceMuted,
                  border: `1px solid ${open ? (active ? tokens.color.primary : tokens.color.border) : 'transparent'}`,
                  boxShadow: open ? (active ? `0 0 0 3px ${tokens.color.primarySoft}, ${tokens.shadow.md}` : tokens.shadow.md) : 'none',
                  // バーの上（狭い画面では左）の色の帯で、全体の進み具合が 1 本の線に見える
                  '&::before': { content: '""', position: 'absolute', left: 0, top: 0, width: { xs: 4, lg: '100%' }, height: { xs: '100%', lg: 4 }, bgcolor: tone },
                  '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
                }}
              >
                {open ? (
                  <Box
                    sx={{
                      p: { xs: 2, md: 3 }, pt: { xs: 2, lg: 3.5 }, minWidth: { lg: 560 },
                      '@keyframes stageOpen': { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'none' } },
                      animation: 'stageOpen .45s .12s both ease-out',
                      '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
                    }}
                  >
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'flex-start' }} justifyContent="space-between">
                      {/* 見出しは最低 220px を保ち、ボタンが多い段階（制作は 4 つ。2026-11-18 素材ドライブを移した）はボタンの側を折り返す */}
                      <Box sx={{ minWidth: 0, flex: { md: '1 0 220px' } }}>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                          <Typography variant="overline" sx={{ color: tokens.color.muted }}>段階 {sel.no} / {STAGES.length}</Typography>
                          <StatusPill tone={selDone ? 'success' : selActive ? 'primary' : 'neutral'}>{selDone ? '完了' : selActive ? '進行中' : 'これから'}</StatusPill>
                        </Stack>
                        <Typography variant="h2" component="h3" sx={{ fontSize: { xs: 22, md: 26 } }}>{sel.label}</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{sel.description}</Typography>
                      </Box>
                      {selFuture ? (
                        <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>前の段階が終わると始まります</Typography>
                      ) : routes.stageLinks[sel.id].length > 0 && (
                        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1, flexShrink: 1, minWidth: 0, justifyContent: { md: 'flex-end' } }}>
                          {routes.stageLinks[sel.id].map((l, k) => (
                            <Button key={l.to} variant={selActive && k === 0 ? 'contained' : 'outlined'} endIcon={<ArrowRight size={16} />} onClick={() => go(l.to)}>
                              {/* ヒアリングを終えた（AI 分析済み）案件は入力ではなく確認（2026-11-12 ユーザー指示） */}
                              {sel.id === 'hearing' && req.status !== 'draft' ? 'ヒアリングを確認' : l.label}
                            </Button>
                          ))}
                        </Stack>
                      )}
                    </Stack>
                    {!selFuture && (
                      <Box sx={{ mt: 2.5, display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', sm: 'repeat(3, minmax(0,1fr))' }, gap: 1.25 }}>
                        {facts[sel.id]}
                      </Box>
                    )}
                    {finalStep && !selFuture && (() => {
                      // お客様の承認の欄（2026-11-17「承認日も見やすいように」: 承認日を大きく、状態ごとに色を分ける）
                      const ok = finalStep.status === 'approved';
                      const wait = finalStep.status === 'waiting';
                      const ink = ok ? tokens.color.successInk : wait ? tokens.color.warningInk : tokens.color.inkSoft;
                      return (
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} sx={{ mt: 2, px: 2, py: 1.5, borderRadius: 3, bgcolor: ok ? tokens.color.successSoft : wait ? tokens.color.warningSoft : tokens.color.surfaceMuted }}>
                          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flex: 1, minWidth: 0 }}>
                            <Box sx={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', bgcolor: tokens.color.surface, color: ink }}>
                              {ok ? <BadgeCheck size={20} /> : wait ? <Clock size={18} /> : <Send size={17} />}
                            </Box>
                            <Box sx={{ minWidth: 0 }}>
                              <Typography variant="caption" component="p" sx={{ color: ink, fontWeight: 600 }}>この段階の最後に、お客様の承認 ・ {finalStep.title}</Typography>
                              {ok ? (
                                <Typography sx={{ color: ink, fontWeight: 750, fontSize: { xs: 17, md: 19 }, fontVariantNumeric: 'tabular-nums' }}>
                                  {formatDateTime(finalStep.approvedAt)} <Box component="span" sx={{ fontSize: 13, fontWeight: 650 }}>に承認</Box>
                                </Typography>
                              ) : (
                                <Typography variant="body2" sx={{ color: ink, fontWeight: 700 }}>
                                  {wait ? `承認待ち（${formatDateTime(finalStep.requestedAt)} に依頼）`
                                    : finalStep.awaitingRequest ? 'まだ依頼していません（依頼するまで、お客様には承認ボタンを出しません）'
                                    : 'この段階の作業が終わると依頼できます'}
                                </Typography>
                              )}
                            </Box>
                          </Stack>
                          {/* 依頼は開発者画面だけ（管理者は見るだけ）。表示中の案件の分だけ（RequestApprovalButton は選んでいる案件を見る） */}
                          {routes.dev && finalStep.awaitingRequest && <RequestApprovalButton approvalKey={finalStep.key} />}
                        </Stack>
                      );
                    })()}
                  </Box>
                ) : (
                  <ButtonBase
                    onClick={() => setPicked(s.id)}
                    aria-expanded={false}
                    aria-label={`${s.no}. ${s.label}（${status}）を開く`}
                    sx={{
                      width: '100%', height: '100%', display: 'flex', flexDirection: { xs: 'row', lg: 'column' }, alignItems: 'center',
                      justifyContent: 'flex-start', gap: { xs: 1.5, lg: 1.5 }, px: { xs: 2, lg: 0 }, py: { xs: 1.25, lg: 2.5 }, pt: { lg: 3 },
                      color: done ? tokens.color.success : active ? tokens.color.primary : tokens.color.muted,
                      transition: 'background-color .2s', '&:hover': { bgcolor: 'rgba(0,0,0,0.04)' },
                    }}
                  >
                    <Box sx={{ width: 30, height: 30, flexShrink: 0, borderRadius: '50%', display: 'grid', placeItems: 'center', fontWeight: 750, fontSize: 13, bgcolor: tokens.color.surface, border: `2px solid ${tone}` }}>
                      {done ? <Check size={15} strokeWidth={3} /> : s.no}
                    </Box>
                    <Typography
                      component="span"
                      sx={{
                        // 広い画面は縦書き（狭い柱に段階の名前を収める）
                        writingMode: { lg: 'vertical-rl' }, letterSpacing: { lg: '0.12em' }, fontWeight: active ? 750 : 600, fontSize: 14,
                        color: done || active ? tokens.color.ink : tokens.color.inkSoft, whiteSpace: 'nowrap',
                      }}
                    >
                      {s.label}
                    </Typography>
                    <Box sx={{ ml: { xs: 'auto', lg: 0 }, mt: { lg: 'auto' }, textAlign: { xs: 'right', lg: 'center' } }}>
                      <Typography component="span" variant="caption" sx={{ display: 'block', fontWeight: 650, color: 'inherit' }}>{status}</Typography>
                      {/* 承認日（2026-11-17 ユーザー指示「承認日も見やすいように」） */}
                      {stepOf(s.id)?.status === 'approved' ? (
                        <Typography component="span" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.25, mt: 0.25, fontSize: 12, fontWeight: 750, color: tokens.color.successInk, fontVariantNumeric: 'tabular-nums' }}>
                          <BadgeCheck size={12} aria-label="承認" />{shortDate(stepOf(s.id)?.approvedAt)}
                        </Typography>
                      ) : s.id === 'hearing' && done && req.analyzedAt ? (
                        // ヒアリングはお客様の承認が無いので、終えた日（AI 分析の日）
                        <Typography component="span" sx={{ display: 'block', mt: 0.25, fontSize: 12, fontWeight: 750, color: tokens.color.successInk, fontVariantNumeric: 'tabular-nums' }}>{shortDate(req.analyzedAt)}</Typography>
                      ) : null}
                    </Box>
                  </ButtonBase>
                )}
              </Box>
            );
          })}
        </Box>
      </Reveal>

      {/* プロジェクト全体（ヘッダー）→ 制作の段階 → お客様の対応状況の順に、全体像から細部へ */}
      {/* どの案件でも出す（案件ごとの制作データから導く。2026-11-12 ユーザー決定） */}
      <Reveal delay={0.03}>
        {/* スケジュール（2026-11-17 ユーザー指示「プロジェクト選択後にスケジュールを表示しておきたい」）。見るだけ。編集はスケジュール画面へ */}
        {/* スケジュールの段階まで来ていない案件（ヒアリング・要件定義）は出さない（同日ユーザー指示） */}
        {cur >= stageIndex('schedule') && <Box sx={{ mb: { xs: 3, md: 4 } }}><ProjectScheduleSection view={state} dev={!!routes.dev} onOpen={() => go(routes.dev ? '/dev/schedule' : '/schedule')} /></Box>}
        <ClientStatusPanel project={p} />
      </Reveal>
      <Box sx={{ mt: { xs: 3, md: 4 } }}><ApprovalHistory projectId={p.id} siteName={p.siteName} /></Box>
      {update && (
        <EditProjectDialog
          project={editing ? p : null} projects={allProjects}
          devOptions={devPeople} devIds={projectDevIds(devAll, p.id, devPeople)}
          onClose={() => setEditing(false)} onSave={saveInfo} saving={saving} />
      )}
    </Box>
  );
}
