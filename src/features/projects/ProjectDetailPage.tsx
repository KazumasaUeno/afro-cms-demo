import { Box, Button, Stack, Typography } from '@mui/material';
import { ArrowLeft, ArrowRight, CalendarDays, Check, Clock, FolderSearch, Globe, User } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import type { Stage } from '@/types';
import { useDemo } from '@/store/DemoStore';
import { STAGES, stageIndex } from '@/data/projects';
import { memberById } from '@/data/members';
import { TOTAL_REQUIREMENT_QUESTIONS } from '@/data/requirements';
import { TOTAL_QUALITY_QUESTIONS } from '@/data/quality';
import { MemberAvatar, ProgressRing, Reveal, StatusPill, Surface } from '@/components/ui';
import { formatDate, formatDateTime, relativeTime } from '@/services/time';
import { tokens } from '@/theme/tokens';
import { qualityCompletion, STAGE_LINKS } from './projectHelpers';

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

function NotFound() {
  return (
    <Surface sx={{ textAlign: 'center', py: 8, maxWidth: 560, mx: 'auto' }}>
      <Stack alignItems="center" spacing={1.5}>
        <FolderSearch size={36} color={tokens.color.faint} />
        <Typography variant="h3" component="h1">プロジェクトが見つかりません</Typography>
        <Typography variant="body2" color="text.secondary">URLが間違っているか、デモの初期化で削除された可能性があります。</Typography>
        <Button component={RouterLink} to="/projects" variant="contained" startIcon={<ArrowLeft size={16} />} sx={{ mt: 1 }}>
          プロジェクト一覧へ戻る
        </Button>
      </Stack>
    </Surface>
  );
}

/** プロジェクト詳細（5段階のパイプライン） */
export default function ProjectDetailPage() {
  const { projectId } = useParams();
  const { state, dispatch } = useDemo();
  const navigate = useNavigate();
  const p = state.projects.find((x) => x.id === projectId);
  if (!p) return <NotFound />;

  const cur = stageIndex(p.stage);
  const owner = memberById(p.ownerId);
  const q = qualityCompletion(state.qualityChecks);
  const answered = Object.values(state.requirements.answers).filter((v) => (Array.isArray(v) ? v.length > 0 : v.trim() !== '')).length;
  const published = state.pages.filter((x) => x.status === 'published').length;
  const scheduled = state.pages.filter((x) => x.status === 'scheduled').length;
  const latest = state.diagnoses[0];
  const reqStatus = { draft: '入力中', analyzed: 'AI分析済み', approved: '承認済み' }[state.requirements.status];

  const facts: Record<Stage, ReactNode> = {
    requirements: (
      <>
        <Fact label="状態" value={reqStatus} ok={state.requirements.status === 'approved'} />
        <Fact label="回答" value={`${answered} / ${TOTAL_REQUIREMENT_QUESTIONS}問`} />
        <Fact label="承認日時" value={formatDateTime(state.requirements.approvedAt)} />
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
    dispatch({ type: 'setCurrentProject', id: p.id });
    navigate(to);
  };

  return (
    <Box>
      <Button component={RouterLink} to="/projects" size="small" startIcon={<ArrowLeft size={16} />} sx={{ mb: 2, ml: -1 }}>
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
                <Stack direction="row" spacing={0.75} alignItems="center"><Clock size={15} /><Typography variant="body2">更新 {relativeTime(p.updatedAt)}</Typography></Stack>
                {p.launchDate && <Stack direction="row" spacing={0.75} alignItems="center"><CalendarDays size={15} /><Typography variant="body2">公開予定 {formatDate(p.launchDate)}</Typography></Stack>}
              </Stack>
            </Box>
            <Stack direction="row" spacing={2} alignItems="center">
              <ProgressRing value={p.progress} size={88} stroke={8} color={p.accent} label="全体の進捗" />
              <Box>
                <Typography variant="caption">次に必要な作業</Typography>
                <Typography variant="h5" sx={{ maxWidth: 220 }}>{p.nextAction}</Typography>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
                  <MemberAvatar id={p.ownerId} size={24} />
                  {p.pendingApprovals > 0 && <StatusPill tone="warning">承認待ち {p.pendingApprovals}</StatusPill>}
                </Stack>
              </Box>
            </Stack>
          </Stack>
        </Surface>
      </Reveal>

      <Typography variant="h3" component="h2" sx={{ mb: 0.5 }}>制作の5段階</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
        作る「まえ」「なか」「あと」をひとつの流れで管理します。各段階から関連する作業画面を開けます。
      </Typography>

      {/* パイプライン */}
      <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', sm: 'repeat(2, minmax(0,1fr))', lg: 'repeat(5, minmax(0,1fr))' }, gap: { xs: 1.5, md: 2 } }}>
        {STAGES.map((s, i) => {
          const done = i < cur;
          const active = i === cur;
          const color = done ? tokens.color.success : active ? tokens.color.primary : tokens.color.faint;
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
                    <Typography variant="overline" sx={{ color }}>{s.en}</Typography>
                    <Typography variant="h4" component="h3">{s.label}</Typography>
                    <Typography variant="caption" sx={{ display: 'block', mt: 0.5, minHeight: { lg: 54 } }}>{s.description}</Typography>
                  </Box>
                  <Box>{facts[s.id]}</Box>
                  <Stack spacing={0.75} sx={{ mt: 'auto' }}>
                    {STAGE_LINKS[s.id].map((l, li) => (
                      <Button
                        key={l.to}
                        size="small"
                        variant={active && li === 0 ? 'contained' : 'outlined'}
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
    </Box>
  );
}
