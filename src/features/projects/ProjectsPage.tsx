import { Box, Button, InputAdornment, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { Plus, Search, SearchX } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import type { Project, Stage } from '@/types';
import { useRepositories } from '@/repositories';
import { STAGES } from '@/data/projects';
import { PageHeader, Reveal, Surface } from '@/components/ui';
import { tokens } from '@/theme/tokens';
import { useDevProjects } from '@/features/dev/useDevUser';
import { ProjectCard } from './ProjectCard';
import { useProjectRoutes } from './projectRoutes';

const MAX_QUERY = 50;
type Filter = Stage | 'all';

/** 検索語の正規化（前後空白・全角空白・大小文字を吸収） */
const normalize = (s: string) => s.replace(/　/g, ' ').trim().toLowerCase();

/**
 * プロジェクト一覧（カード）。管理者画面（/projects）と開発者画面（/dev/projects。0.26.0）で同じ画面。
 * 開発者画面ではログイン中のメンバーの担当案件だけを出し（件数も担当分）、新しいプロジェクトは出さない（表示の出し分けだけ。実体はルール）
 */
export default function ProjectsPage() {
  const { projects: repo } = useRepositories();
  const { data: all } = repo.useList();
  const routes = useProjectRoutes();
  const mine = useDevProjects();
  // useDevProjects は描画のたびに新しい配列を返すので、担当の id を文字列にして依存を安定させる
  const mineKey = mine.map((m) => m.id).join('\n');
  const projects = useMemo(() => {
    if (!routes.dev) return all;
    const ids = new Set(mineKey.split('\n'));
    return all.filter((p) => ids.has(p.id));
  }, [all, mineKey, routes.dev]);
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const q = normalize(query);
  const list = useMemo(
    () =>
      projects.filter(
        (p) =>
          (filter === 'all' || p.stage === filter) &&
          (!q || [p.clientName, p.siteName, p.siteUrl, p.industry].some((v) => v.toLowerCase().includes(q))),
      ),
    [projects, filter, q],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: projects.length };
    projects.forEach((p) => (c[p.stage] = (c[p.stage] ?? 0) + 1));
    return c;
  }, [projects]);

  const open = (p: Project) => {
    repo.select(p.id);
    navigate(routes.detail(p.id));
  };

  return (
    <Box>
      <PageHeader
        title="プロジェクト"
        description={routes.dev
          ? 'あなたが担当しているプロジェクトです。ヒアリングから改善まで6つの段階で進み具合を確認できます。カードを開くと各段階の作業に進めます。'
          : '顧客ごとのWebサイト制作を、ヒアリングから改善まで6つの段階で管理します。カードを開くと各段階の作業に進めます。'}
        actions={routes.dev ? undefined : <Button variant="contained" startIcon={<Plus size={16} />} component={RouterLink} to="/projects/new">新しいプロジェクト</Button>}
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
            {projects.length === 0 && routes.dev ? (
              <>
                <Typography variant="h4">担当しているプロジェクトがありません</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>管理者に担当の追加を依頼してください（管理者画面の「ユーザー管理」で設定します）。</Typography>
              </>
            ) : (
              <>
                <Typography variant="h4">該当するプロジェクトがありません</Typography>
                <Typography variant="body2" color="text.secondary">検索語や段階の絞り込みを変えてみてください。</Typography>
              </>
            )}
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
