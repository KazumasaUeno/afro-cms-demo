import { Box, Button, Stack, Typography } from '@mui/material';
import { ArrowLeft, FolderPlus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import type { Project } from '@/types';
import { useRepositories } from '@/repositories';
import { useWrite } from '@/hooks/useWrite';
import { PageHeader, Reveal, Surface } from '@/components/ui';
import { nowIso } from '@/services/time';
import { tokens } from '@/theme/tokens';
import { TOUCH } from '@/theme/media';
import { useToast } from '@/hooks/useToast';
import { ProjectCard } from './ProjectCard';
import { ProjectFields } from './ProjectFields';
import { emptyProjectDraft, PROJECT_FIELD_ORDER, projectFromDraft, validateProject, type ProjectDraft, type ProjectField } from './projectForm';

function Section({ title, sub, index, children }: { title: string; sub?: string; index: number; children: ReactNode }) {
  return (
    <Reveal delay={index * 0.04}>
      <Surface padding={{ xs: 2, md: 3 }}>
        <Typography variant="h4" component="h2">{title}</Typography>
        {sub && <Typography variant="caption" component="p" sx={{ mt: 0.25 }}>{sub}</Typography>}
        <Stack spacing={2.25} sx={{ mt: 2.25 }}>{children}</Stack>
      </Surface>
    </Reveal>
  );
}

/** 新しいプロジェクト（管理者画面）。入力チェックは reducer と同じ validateProject */
export default function NewProjectPage() {
  const { projects: repo } = useRepositories();
  const { data: projects } = repo.useList();
  const currentProjectId = repo.useCurrentId();
  const navigate = useNavigate();
  const toast = useToast();
  const [draft, setDraft] = useState<ProjectDraft>(() => emptyProjectDraft());
  const [submitted, setSubmitted] = useState(false);
  // 作成は確定を待つ（BACKEND_FIREBASE §13.3。待つ間はボタンを止め、二重に作らない）
  const [saving, setSaving] = useState(false);
  const write = useWrite();
  const refs = useRef<Partial<Record<ProjectField, HTMLElement | null>>>({});
  /** 作成を送った時点のプロジェクト id（作成後、これに無い作業中プロジェクトが新しく作ったもの） */
  const before = useRef<Set<string> | null>(null);

  // 「今日以降」の判定は日付で変わるため、作成を押すたびに数え直す（日付をまたいで開いたままでも、画面と保存時の判定をそろえる）
  const [checks, setChecks] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const errors = useMemo(() => validateProject(draft, projects), [draft, projects, checks]);
  const set = (patch: Partial<ProjectDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const show = (k: ProjectField) => (submitted ? errors[k] : undefined);

  // id は reducer が作る。作成が反映されたら、作業中になった新しいプロジェクトを開く
  useEffect(() => {
    if (!before.current || before.current.has(currentProjectId)) return;
    if (!projects.some((p) => p.id === currentProjectId)) return;
    before.current = null;
    toast('プロジェクトを作成しました');
    navigate(`/projects/${currentProjectId}`, { replace: true });
  }, [currentProjectId, projects, navigate, toast]);

  const submit = () => {
    setSubmitted(true);
    setChecks((n) => n + 1);
    const fresh = validateProject(draft, projects);
    const first = PROJECT_FIELD_ORDER.find((k) => fresh[k]);
    if (first) {
      refs.current[first]?.focus();
      return;
    }
    if (saving) return;
    before.current = new Set(projects.map((p) => p.id));
    setSaving(true);
    void write(repo.create(draft)).then((ok) => {
      setSaving(false);
      // 失敗したら作成を待つのをやめる（エラーは useWrite が表示する）。成功は上の effect が開く
      if (!ok) before.current = null;
    });
  };

  // プレビューは入力途中でも崩れないよう、空の項目は仮の文言で埋める
  const preview: Project = {
    id: 'preview',
    ...projectFromDraft(draft),
    clientName: draft.clientName.trim() || 'お客様の会社名',
    siteName: draft.siteName.trim() || 'サイト名',
    siteUrl: draft.siteUrl.trim() || 'https://example.jp',
    industry: draft.industry.trim() || '業種',
    updatedAt: nowIso(),
  };

  return (
    <Box>
      <Button component={RouterLink} to="/projects" size="small" startIcon={<ArrowLeft size={16} />} sx={{ mb: 2, ml: -1 }}>
        プロジェクト一覧
      </Button>
      <PageHeader
        eyebrow="プロジェクト"
        icon={<FolderPlus size={16} />}
        title="新しいプロジェクト"
        description="お客様とサイトの情報を入れて作成します。作成したプロジェクトは「要件定義」から始まります。"
      />

      <Box
        component="form"
        noValidate
        aria-label="新しいプロジェクト"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        sx={{
          display: 'grid', gap: { xs: 2, md: 3 }, alignItems: 'start',
          gridTemplateColumns: { xs: 'minmax(0,1fr)', lg: 'minmax(0,1fr) 360px' },
          // スマホで入力欄を拡大させない（iOS は 16px 未満で拡大する）
          [TOUCH]: { '& .MuiInputBase-input': { fontSize: 16 } },
        }}
      >
        <Stack spacing={{ xs: 2, md: 2.5 }} sx={{ minWidth: 0 }}>
          <ProjectFields draft={draft} set={set} show={show} refs={refs} Group={Section} />

          <Stack direction={{ xs: 'column-reverse', sm: 'row' }} spacing={1} justifyContent="flex-end">
            <Button variant="outlined" component={RouterLink} to="/projects">キャンセル</Button>
            <Button type="submit" variant="contained" startIcon={<FolderPlus size={16} />} disabled={saving}>作成する</Button>
          </Stack>
        </Stack>

        <Box component="aside" aria-label="カードのプレビュー" sx={{ position: { lg: 'sticky' }, top: { lg: tokens.layout.topbar + 16 }, minWidth: 0 }}>
          <Typography variant="overline" component="p" sx={{ mb: 1 }}>プレビュー</Typography>
          <ProjectCard p={preview} />
        </Box>
      </Box>
    </Box>
  );
}
