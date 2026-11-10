import { Box, Button, InputAdornment, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { Plus, Search, SearchX } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import type { Project, Stage } from '@/types';
import { useDemo } from '@/store/DemoStore';
import { STAGES } from '@/data/projects';
import { PageHeader, Reveal, Surface } from '@/components/ui';
import { tokens } from '@/theme/tokens';
import { ProjectCard } from './ProjectCard';

const MAX_QUERY = 50;
type Filter = Stage | 'all';

/** 検索語の正規化（前後空白・全角空白・大小文字を吸収） */
const normalize = (s: string) => s.replace(/　/g, ' ').trim().toLowerCase();

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
        title="プロジェクト"
        description="顧客ごとのWebサイト制作を、要件定義から改善まで5つの段階で管理します。カードを開くと各段階の作業に進めます。"
        actions={<Button variant="contained" startIcon={<Plus size={16} />} component={RouterLink} to="/projects/new">新しいプロジェクト</Button>}
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
            <ToggleButton value="all" sx={{ whiteSpace: 'nowrap' }}>すべて <Box component="span" sx={{ ml: 0.75, color: tokens.color.muted }}>{counts.all}</Box></ToggleButton>
            {STAGES.map((s) => (
              <ToggleButton key={s.id} value={s.id} sx={{ whiteSpace: 'nowrap' }}>
                {s.label}
                <Box component="span" sx={{ ml: 0.75, color: tokens.color.muted }}>{counts[s.id] ?? 0}</Box>
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
