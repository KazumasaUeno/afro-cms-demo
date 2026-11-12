import { Box, Button, Stack, Typography } from '@mui/material';
import { ArrowLeft, ArrowRight, CalendarDays, Check, CheckCircle2, Clock, Code2, FolderSearch, Globe, User } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import type { Project, Stage } from '@/types';
import { useDemo } from '@/store/DemoStore';
import { RouteLoader } from '@/components/layout/RouteLoader';
import { useCurrentRequirements, useRepositories } from '@/repositories';
import { STAGES, stageIndex } from '@/data/projects';
import { memberById } from '@/data/members';
import { REQUIREMENT_QUESTIONS } from '@/data/requirements';
import { isAnswered } from '@/features/requirements/validation';
import { TOTAL_QUALITY_QUESTIONS } from '@/data/quality';
import { MemberAvatar, ProgressRing, Reveal, StatusPill, Surface } from '@/components/ui';
import { formatDate, formatDateTime, relativeTime } from '@/services/time';
import { tokens } from '@/theme/tokens';
import { CLIENT_PROJECT_ID } from '@/components/layout/nav';
import { DevProjectGate } from '@/features/dev/DevProjectGate';
import { useDevProjects } from '@/features/dev/useDevUser';
import { nextBestAction, qualityCompletion } from './projectHelpers';
import { devNextWork, useProjectRoutes } from './projectRoutes';
import { ClientStatusPanel } from './ClientStatusPanel';
import { ApprovalHistory } from './ApprovalHistory';

function Fact({ label, value, ok }: { label: string; value: ReactNode; ok?: boolean }) {
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} sx={{ py: 0.75, borderTop: `1px solid ${tokens.color.border}` }}>
      <Typography variant="caption" sx={{ color: tokens.color.muted }}>{label}</Typography>
      <Stack direction="row" spacing={0.5} alignItems="center" sx={{ minWidth: 0 }}>
        {ok && <Check size={13} color={tokens.color.success} strokeWidth={3} />}
        <Typography variant="caption" sx={{ fontWeight: 650, color: tokens.color.ink, textAlign: 'right' }} noWrap>{value}</Typography>
      </Stack>
    </Stack>
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
 * プロジェクト詳細（ヘッダーの直下に6段階のパイプライン、その下にお客様の対応状況）。
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
  const { state } = useDemo();
  const { projects, accounts } = useRepositories();
  const { data: req } = useCurrentRequirements();
  const { data: devAll } = accounts.useDevProjects();
  const { data: people } = accounts.useDevPeople();
  const navigate = useNavigate();

  const cur = stageIndex(p.stage);
  const owner = memberById(p.ownerId);
  // 開発担当（ユーザー管理で決める。開発者画面の権限の有無は問わない。登録した開発者も含め、無効にした人は除く）
  const devNames = people.filter((m) => !m.disabled).filter((m) => devAll[m.id]?.includes(p.id)).map((m) => m.name);
  const q = qualityCompletion(state.qualityChecks);
  const remainingQuestions = REQUIREMENT_QUESTIONS.filter((question) => !isAnswered(req.answers[question.id])).length;
  const published = state.pages.filter((x) => x.status === 'published').length;
  const scheduled = state.pages.filter((x) => x.status === 'scheduled').length;
  const latest = state.diagnoses[0];
  const reqStatus = { draft: '入力中', analyzed: 'AI分析済み', approved: '承認済み' }[req.status];
  /** デモの数値（state）は MINAMO COFFEE の 1 案件分だけ。他の案件では出さない */
  const isDemo = p.id === CLIENT_PROJECT_ID;
  const demoAction = nextBestAction(state);
  // 開発者画面はダッシュボードのカードと同じ「次の作業」（行き先は開発者画面の中だけ）
  const devWork = routes.dev ? devNextWork(p, state) : null;
  const next = devWork
    ? { label: devWork.next, to: devWork.to }
    : isDemo ? { label: demoAction.cta, to: demoAction.to } : { label: p.nextAction, to: routes.stageLinks[p.stage][0].to };

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
    build: (
      <>
        <Fact label="サイトマップ" value={state.sitemap.approvedAt ? '承認済み' : '未承認'} ok={!!state.sitemap.approvedAt} />
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
    operation: (
      <>
        <Fact label="ページ数" value={`${state.pages.length}件`} />
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
              <Typography variant="overline">{p.clientName}・{p.industry}</Typography>
              <Typography variant="h1" component="h1">{p.siteName}</Typography>
              <Stack direction="row" sx={{ mt: 1.5, flexWrap: 'wrap', gap: { xs: 1, sm: 2.5 }, color: tokens.color.muted }}>
                <Stack direction="row" spacing={0.75} alignItems="center"><Globe size={15} /><Typography variant="body2">{p.siteUrl.replace(/^https?:\/\//, '')}</Typography></Stack>
                <Stack direction="row" spacing={0.75} alignItems="center"><User size={15} /><Typography variant="body2">{owner.name}（{owner.role}）</Typography></Stack>
                <Stack direction="row" spacing={0.75} alignItems="center"><Code2 size={15} aria-hidden /><Typography variant="body2">開発担当: {devNames.length ? devNames.join('・') : 'なし'}</Typography></Stack>
                <Stack direction="row" spacing={0.75} alignItems="center"><Clock size={15} /><Typography variant="body2">更新 {relativeTime(p.updatedAt)}</Typography></Stack>
                {p.launchDate && <Stack direction="row" spacing={0.75} alignItems="center"><CalendarDays size={15} /><Typography variant="body2">公開予定 {formatDate(p.launchDate)}</Typography></Stack>}
              </Stack>
            </Box>
            <Stack direction="row" spacing={2} alignItems="center">
              <ProgressRing value={p.progress} size={88} stroke={8} color={p.accent} label="全体の進捗" />
              <Box sx={{ minWidth: 0, flex: { xs: 1, md: 'none' } }}>
                <Typography variant="caption" component="p" sx={{ mb: 0.75 }}>次に必要な作業</Typography>
                <Button
                  variant="contained"
                  endIcon={<ArrowRight size={16} />}
                  onClick={() => go(next.to)}
                  sx={{ minHeight: 44, maxWidth: { md: 260 }, textAlign: 'left', justifyContent: 'space-between', lineHeight: 1.4, py: 1 }}
                >
                  {next.label}
                </Button>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
                  <MemberAvatar id={p.ownerId} size={24} />
                  {p.pendingApprovals > 0 && <StatusPill tone="warning">承認待ち {p.pendingApprovals}</StatusPill>}
                </Stack>
              </Box>
            </Stack>
          </Stack>
        </Surface>
      </Reveal>

      <Typography variant="h3" component="h2" sx={{ mb: 0.5 }}>制作の6段階</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
        作る「まえ」「なか」「あと」をひとつの流れで管理します。各段階から関連する作業画面を開けます。
      </Typography>

      {/* パイプライン */}
      <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', sm: 'repeat(2, minmax(0,1fr))', lg: 'repeat(6, minmax(0,1fr))' }, gap: { xs: 1.5, md: 2 } }}>
        {STAGES.map((s, i) => {
          const done = i < cur;
          const active = i === cur;
          const color = done ? tokens.color.success : active ? tokens.color.primary : tokens.color.muted;
          return (
            <Box component="li" key={s.id} aria-current={active ? 'step' : undefined} sx={{ minWidth: 0 }}>
              <Reveal delay={0.06 + i * 0.06} style={{ height: '100%' }}>
                <Surface
                  sx={{
                    height: '100%', display: 'flex', flexDirection: 'column', gap: 1.5,
                    borderColor: active ? tokens.color.primary : tokens.color.border,
                    boxShadow: active ? `0 0 0 3px ${tokens.color.primarySoft}, ${tokens.shadow.md}` : tokens.shadow.xs,
                    bgcolor: !done && !active ? tokens.color.surfaceMuted : tokens.color.surface,
                  }}
                >
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Box sx={{ width: 34, height: 34, borderRadius: '11px', display: 'grid', placeItems: 'center', fontWeight: 750, fontSize: 14, bgcolor: done ? tokens.color.successSoft : active ? tokens.color.primarySoft : tokens.color.bgSubtle, color }}>
                      {done ? <Check size={17} strokeWidth={3} /> : s.no}
                    </Box>
                    <StatusPill tone={done ? 'success' : active ? 'primary' : 'neutral'}>{done ? '完了' : active ? '進行中' : 'これから'}</StatusPill>
                  </Stack>
                  <Box>
                    <Typography variant="h4" component="h3">{s.label}</Typography>
                    <Typography variant="caption" sx={{ display: 'block', mt: 0.5, minHeight: { lg: 54 } }}>{s.description}</Typography>
                  </Box>
                  {done ? (
                    <Stack direction="row" spacing={0.75} alignItems="flex-start" sx={{ py: 0.75, borderTop: `1px solid ${tokens.color.border}` }}>
                      <CheckCircle2 size={16} color={tokens.color.success} style={{ flexShrink: 0, marginTop: 2 }} />
                      <Typography sx={{ fontSize: 13, lineHeight: 1.5, color: tokens.color.inkSoft }}>この段階は完了しています</Typography>
                    </Stack>
                  ) : !active ? (
                    <Typography variant="caption" sx={{ display: 'block', py: 0.75, borderTop: `1px solid ${tokens.color.border}` }}>
                      前の段階が終わると始まります
                    </Typography>
                  ) : isDemo ? (
                    <Box>{facts[s.id]}</Box>
                  ) : (
                    <Typography variant="caption" sx={{ display: 'block', py: 0.75, borderTop: `1px solid ${tokens.color.border}` }}>
                      詳しい数値は MINAMO COFFEE のデモでご覧いただけます
                    </Typography>
                  )}
                  <Stack spacing={0.75} sx={{ mt: 'auto' }}>
                    {routes.stageLinks[s.id].map((l) => (
                      <Button
                        key={l.to}
                        size="small"
                        variant="outlined"
                        endIcon={<ArrowRight size={15} />}
                        onClick={() => go(l.to)}
                        sx={{ justifyContent: 'space-between' }}
                      >
                        {l.label}
                      </Button>
                    ))}
                  </Stack>
                </Surface>
              </Reveal>
            </Box>
          );
        })}
      </Box>

      {/* プロジェクト全体（ヘッダー）→ 制作の段階 → お客様の対応状況の順に、全体像から細部へ */}
      {isDemo && (
        <Reveal delay={0.03}>
          <Box sx={{ mt: { xs: 3, md: 4 } }}><ClientStatusPanel /></Box>
        </Reveal>
      )}
      <Box sx={{ mt: { xs: 3, md: 4 } }}><ApprovalHistory projectId={p.id} siteName={p.siteName} /></Box>
    </Box>
  );
}
