import { Box, InputAdornment, LinearProgress, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { Clock, FolderKanban, Globe, Search, SearchX } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Project, Stage } from '@/types';
import { useDemo } from '@/store/DemoStore';
import { STAGES } from '@/data/projects';
import { memberById } from '@/data/members';
import { MemberAvatar, PageHeader, Reveal, StageTrack, StatusPill, Surface } from '@/components/ui';
import { relativeTime } from '@/services/time';
import { tokens } from '@/theme/tokens';
import { stageLabel } from './projectHelpers';

const MAX_QUERY = 50;
type Filter = Stage | 'all';

/** 検索語の正規化（前後空白・全角空白・大小文字を吸収） */
const normalize = (s: string) => s.replace(/　/g, ' ').trim().toLowerCase();

function ProjectCard({ p, onOpen }: { p: Project; onOpen: () => void }) {
  const owner = memberById(p.ownerId);
  return (
    <Surface
      interactive
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
      padding={0}
      sx={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
    >
      {/* ブランド色の帯＋サイトのミニプレビュー */}
      <Box sx={{ position: 'relative', height: 96, background: `linear-gradient(135deg, ${p.accent} 0%, ${p.accent}B3 100%)`, overflow: 'hidden' }} aria-hidden>
        <Box sx={{ position: 'absolute', left: 20, right: 20, bottom: -18, height: 82, borderRadius: '12px 12px 0 0', bgcolor: 'rgba(255,255,255,0.94)', boxShadow: tokens.shadow.md, p: 1.25 }}>
          <Stack direction="row" spacing={0.5} sx={{ mb: 1 }}>
            {[0, 1, 2].map((i) => <Box key={i} sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: tokens.color.borderStrong }} />)}
          </Stack>
          <Box sx={{ width: '46%', height: 7, borderRadius: 4, bgcolor: p.accent, opacity: 0.85, mb: 0.75 }} />
          <Box sx={{ width: '70%', height: 5, borderRadius: 4, bgcolor: tokens.color.border, mb: 0.5 }} />
          <Box sx={{ width: '58%', height: 5, borderRadius: 4, bgcolor: tokens.color.border }} />
        </Box>
        <Box sx={{ position: 'absolute', top: 12, right: 12 }}>
          <StatusPill tone="neutral">{p.industry}</StatusPill>
        </Box>
      </Box>

      <Box sx={{ p: { xs: 2, md: 2.5 }, pt: 3, display: 'flex', flexDirection: 'column', gap: 1.75, flex: 1 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="caption" noWrap sx={{ display: 'block' }}>{p.clientName}</Typography>
          <Typography variant="h4" component="h2" noWrap>{p.siteName}</Typography>
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ color: tokens.color.muted, mt: 0.25 }}>
            <Globe size={13} style={{ flexShrink: 0 }} />
            <Typography variant="caption" noWrap>{p.siteUrl.replace(/^https?:\/\//, '')}</Typography>
          </Stack>
        </Box>

        <Box>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
            <StatusPill tone={p.stage === 'improvement' ? 'success' : p.stage === 'requirements' ? 'accent' : 'primary'}>
              {STAGES.find((s) => s.id === p.stage)?.no}. {stageLabel(p.stage)}
            </StatusPill>
            <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{p.progress}%</Typography>
          </Stack>
          <LinearProgress variant="determinate" value={p.progress} aria-label="進捗率" sx={{ mb: 1.5, '& .MuiLinearProgress-bar': { bgcolor: p.accent } }} />
          <StageTrack stage={p.stage} compact />
        </Box>

        <Box sx={{ p: 1.25, borderRadius: 2.5, bgcolor: tokens.color.surfaceMuted, border: `1px solid ${tokens.color.border}` }}>
          <Typography variant="overline" sx={{ display: 'block', lineHeight: 1.4 }}>次に必要な作業</Typography>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>{p.nextAction}</Typography>
        </Box>

        <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 'auto' }}>
          <MemberAvatar id={p.ownerId} size={26} />
          <Typography variant="caption" noWrap sx={{ flex: 1, minWidth: 0 }}>{owner.name}</Typography>
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: tokens.color.muted, flexShrink: 0 }}>
            <Clock size={13} />
            <Typography variant="caption">{relativeTime(p.updatedAt)}</Typography>
          </Stack>
          {p.pendingApprovals > 0 && <StatusPill tone="warning">承認 {p.pendingApprovals}</StatusPill>}
        </Stack>
      </Box>
    </Surface>
  );
}

/** プロジェクト一覧（カード） */
export default function ProjectsPage() {
  const { state, dispatch } = useDemo();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const q = normalize(query);
  const list = useMemo(
    () =>
      state.projects.filter(
        (p) =>
          (filter === 'all' || p.stage === filter) &&
          (!q || [p.clientName, p.siteName, p.siteUrl, p.industry].some((v) => v.toLowerCase().includes(q))),
      ),
    [state.projects, filter, q],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: state.projects.length };
    state.projects.forEach((p) => (c[p.stage] = (c[p.stage] ?? 0) + 1));
    return c;
  }, [state.projects]);

  const open = (p: Project) => {
    dispatch({ type: 'setCurrentProject', id: p.id });
    navigate(`/projects/${p.id}`);
  };

  return (
    <Box>
      <PageHeader
        eyebrow="Projects"
        icon={<FolderKanban size={15} />}
        title="プロジェクト"
        description="顧客ごとのWebサイト制作を、要件定義から改善まで5つの段階で管理します。カードを開くと各段階の作業に進めます。"
      />

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }} justifyContent="space-between" sx={{ mb: 3 }}>
        <Box sx={{ overflowX: 'auto', mx: { xs: -2, sm: 0 }, px: { xs: 2, sm: 0 }, pb: 0.5 }}>
          <ToggleButtonGroup
            value={filter}
            exclusive
            onChange={(_, v: Filter | null) => v && setFilter(v)}
            aria-label="段階で絞り込む"
            size="small"
          >
            <ToggleButton value="all">すべて <Box component="span" sx={{ ml: 0.75, color: tokens.color.faint }}>{counts.all}</Box></ToggleButton>
            {STAGES.map((s) => (
              <ToggleButton key={s.id} value={s.id} sx={{ whiteSpace: 'nowrap' }}>
                {s.label}
                <Box component="span" sx={{ ml: 0.75, color: tokens.color.faint }}>{counts[s.id] ?? 0}</Box>
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>
        <TextField
          size="small"
          placeholder="顧客名・サイト名・URLで検索"
          value={query}
          onChange={(e) => setQuery(e.target.value.slice(0, MAX_QUERY))}
          inputProps={{ 'aria-label': 'プロジェクトを検索', maxLength: MAX_QUERY }}
          InputProps={{ startAdornment: <InputAdornment position="start"><Search size={16} color={tokens.color.muted} /></InputAdornment> }}
          sx={{ width: { xs: '100%', md: 300 } }}
        />
      </Stack>

      <Typography variant="caption" role="status" sx={{ display: 'block', mb: 1.5 }}>
        {list.length} 件のプロジェクト{q && `（「${query.trim()}」で検索）`}
      </Typography>

      {list.length === 0 ? (
        <Surface sx={{ textAlign: 'center', py: 6 }}>
          <Stack alignItems="center" spacing={1.5}>
            <SearchX size={32} color={tokens.color.faint} />
            <Typography variant="h4">該当するプロジェクトがありません</Typography>
            <Typography variant="body2" color="text.secondary">検索語や段階の絞り込みを変えてみてください。</Typography>
          </Stack>
        </Surface>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', sm: 'repeat(2, minmax(0,1fr))', xl: 'repeat(3, minmax(0,1fr))' }, gap: { xs: 2, md: 2.5 } }}>
          {list.map((p, i) => (
            <Reveal key={p.id} delay={i * 0.04} style={{ height: '100%' }}>
              <ProjectCard p={p} onOpen={() => open(p)} />
            </Reveal>
          ))}
        </Box>
      )}
    </Box>
  );
}
