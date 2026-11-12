import { Box, Button, ButtonBase, InputAdornment, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { ArrowLeft, Check, FolderPlus, Globe } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import type { Project } from '@/types';
import { useRepositories } from '@/repositories';
import { useWrite } from '@/hooks/useWrite';
import { MEMBERS } from '@/data/members';
import { MAX_URL } from '@/features/requirements/validation';
import { MemberAvatar, PageHeader, Reveal, Surface } from '@/components/ui';
import { nowIso } from '@/services/time';
import { tokens } from '@/theme/tokens';
import { TOUCH } from '@/theme/media';
import { useToast } from '@/hooks/useToast';
import { ProjectCard } from './ProjectCard';
import {
  ACCENT_PRESETS, DEFAULT_NEXT_ACTION, emptyProjectDraft, INDUSTRY_SUGGESTIONS, PROJECT_LIMITS, projectFromDraft, todayYmd, validateProject,
  type ProjectDraft, type ProjectField,
} from './projectForm';

/** エラーがあるとき、最初にフォーカスを移す順（画面の上から） */
const FIELDS: ProjectField[] = ['clientName', 'siteName', 'siteUrl', 'industry', 'ownerId', 'launchDate', 'nextAction', 'accent'];

function Section({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <Surface padding={{ xs: 2, md: 3 }}>
      <Typography variant="h4" component="h2">{title}</Typography>
      {sub && <Typography variant="caption" component="p" sx={{ mt: 0.25 }}>{sub}</Typography>}
      <Stack spacing={2.25} sx={{ mt: 2.25 }}>{children}</Stack>
    </Surface>
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
  const accentRefs = useRef<(HTMLButtonElement | null)[]>([]);
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
    const first = FIELDS.find((k) => fresh[k]);
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

  const accentIndex = Math.max(0, ACCENT_PRESETS.findIndex((a) => a.value === draft.accent));
  const onAccentKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + ACCENT_PRESETS.length) % ACCENT_PRESETS.length;
    set({ accent: ACCENT_PRESETS[next].value });
    accentRefs.current[next]?.focus();
  };

  const counter = (k: 'clientName' | 'siteName' | 'industry' | 'nextAction') => `${draft[k].trim().length} / ${PROJECT_LIMITS[k]}文字`;

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
          <Reveal>
            <Section title="お客様・サイト">
              <TextField
                fullWidth required label="お客様の会社名" value={draft.clientName} placeholder="例：株式会社ミナモ珈琲"
                onChange={(e) => set({ clientName: e.target.value })}
                error={!!show('clientName')} helperText={show('clientName') ?? counter('clientName')}
                inputRef={(el: HTMLElement | null) => { refs.current.clientName = el; }}
                inputProps={{ maxLength: PROJECT_LIMITS.clientName + 10, autoComplete: 'organization' }}
              />
              <TextField
                fullWidth required label="サイト名" value={draft.siteName} placeholder="例：MINAMO COFFEE"
                onChange={(e) => set({ siteName: e.target.value })}
                error={!!show('siteName')} helperText={show('siteName') ?? counter('siteName')}
                inputRef={(el: HTMLElement | null) => { refs.current.siteName = el; }}
                inputProps={{ maxLength: PROJECT_LIMITS.siteName + 10, autoComplete: 'off' }}
              />
              <TextField
                fullWidth required label="サイトのURL" type="url" value={draft.siteUrl} placeholder="https://example.jp"
                onChange={(e) => set({ siteUrl: e.target.value })}
                error={!!show('siteUrl')} helperText={show('siteUrl') ?? '公開中・公開予定のサイトのURL'}
                inputRef={(el: HTMLElement | null) => { refs.current.siteUrl = el; }}
                inputProps={{ maxLength: MAX_URL + 20, inputMode: 'url', autoComplete: 'off', spellCheck: false, autoCapitalize: 'none' }}
                InputProps={{ startAdornment: <InputAdornment position="start"><Globe size={18} color={tokens.color.muted} /></InputAdornment> }}
              />
              <Box>
                <TextField
                  fullWidth required label="業種" value={draft.industry} placeholder="例：飲食・EC"
                  onChange={(e) => set({ industry: e.target.value })}
                  error={!!show('industry')} helperText={show('industry') ?? counter('industry')}
                  inputRef={(el: HTMLElement | null) => { refs.current.industry = el; }}
                  inputProps={{ maxLength: PROJECT_LIMITS.industry + 10, autoComplete: 'off' }}
                />
                <Stack direction="row" sx={{ mt: 1, flexWrap: 'wrap', gap: 0.75 }} role="group" aria-label="業種の候補">
                  {INDUSTRY_SUGGESTIONS.map((s) => {
                    const active = draft.industry.trim() === s;
                    return (
                      <ButtonBase
                        key={s}
                        aria-pressed={active}
                        onClick={() => set({ industry: s })}
                        sx={{
                          px: 1.25, height: 30, [TOUCH]: { height: 44 }, borderRadius: '9px', fontSize: 12.5, fontWeight: 600,
                          color: active ? tokens.color.primary : tokens.color.muted,
                          border: `1px ${active ? 'solid' : 'dashed'} ${active ? tokens.color.primary : tokens.color.borderStrong}`,
                          bgcolor: active ? tokens.color.primarySoft : 'transparent',
                          '&:hover': { color: tokens.color.primary, borderColor: tokens.color.primary },
                        }}
                      >
                        {active ? s : `+ ${s}`}
                      </ButtonBase>
                    );
                  })}
                </Stack>
              </Box>
            </Section>
          </Reveal>

          <Reveal delay={0.04}>
            <Section title="担当・予定">
              <TextField
                select fullWidth required label="担当ディレクター" value={draft.ownerId}
                onChange={(e) => set({ ownerId: e.target.value })}
                error={!!show('ownerId')} helperText={show('ownerId') ?? 'カードと詳細画面に表示します'}
                inputRef={(el: HTMLElement | null) => { refs.current.ownerId = el; }}
                SelectProps={{
                  renderValue: (id) => {
                    const m = MEMBERS.find((x) => x.id === id);
                    return m ? (
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                        <MemberAvatar id={m.id} size={24} />
                        <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{m.name}</Typography>
                        <Typography variant="caption" noWrap>{m.role}</Typography>
                      </Stack>
                    ) : '';
                  },
                }}
              >
                {MEMBERS.map((m) => (
                  <MenuItem key={m.id} value={m.id} sx={{ minHeight: 44 }}>
                    <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0 }}>
                      <MemberAvatar id={m.id} size={28} />
                      <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{m.name}</Typography>
                      <Typography variant="caption" noWrap>{m.role}</Typography>
                    </Stack>
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                fullWidth label="公開予定日" type="date" value={draft.launchDate}
                onChange={(e) => set({ launchDate: e.target.value })}
                error={!!show('launchDate')} helperText={show('launchDate') ?? '未定なら空のまま'}
                inputRef={(el: HTMLElement | null) => { refs.current.launchDate = el; }}
                inputProps={{ min: todayYmd() }}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                fullWidth label="次に必要な作業" value={draft.nextAction} placeholder={DEFAULT_NEXT_ACTION}
                onChange={(e) => set({ nextAction: e.target.value })}
                error={!!show('nextAction')} helperText={show('nextAction') ?? `空なら「${DEFAULT_NEXT_ACTION}」（${counter('nextAction')}）`}
                inputRef={(el: HTMLElement | null) => { refs.current.nextAction = el; }}
                inputProps={{ maxLength: PROJECT_LIMITS.nextAction + 10, autoComplete: 'off' }}
              />
            </Section>
          </Reveal>

          <Reveal delay={0.08}>
            <Section title="見た目" sub="カードと詳細画面で使うブランド色">
              <Box>
                <Typography id="accent-label" variant="subtitle2" sx={{ mb: 1 }}>ブランド色</Typography>
                <Stack direction="row" role="radiogroup" aria-labelledby="accent-label" sx={{ flexWrap: 'wrap', gap: 1 }}>
                  {ACCENT_PRESETS.map((a, i) => {
                    const active = draft.accent === a.value;
                    return (
                      <ButtonBase
                        key={a.value}
                        ref={(el: HTMLButtonElement | null) => {
                          accentRefs.current[i] = el;
                          if (i === accentIndex) refs.current.accent = el;
                        }}
                        role="radio"
                        aria-checked={active}
                        aria-label={a.name}
                        tabIndex={i === accentIndex ? 0 : -1}
                        onClick={() => set({ accent: a.value })}
                        onKeyDown={(e) => onAccentKey(e, i)}
                        sx={{
                          width: 44, height: 44, borderRadius: '12px', bgcolor: a.value, color: '#fff',
                          boxShadow: active ? `0 0 0 2px ${tokens.color.surface}, 0 0 0 4px ${a.value}` : 'none',
                          transition: `box-shadow .16s ${tokens.motion.easeCss}`,
                          '&.Mui-focusVisible': { outline: `2px solid ${tokens.color.ink}`, outlineOffset: 4 },
                        }}
                      >
                        {active && <Check size={18} strokeWidth={3} aria-hidden />}
                      </ButtonBase>
                    );
                  })}
                </Stack>
                <Typography variant="caption" component="p" sx={{ mt: 1 }} color={show('accent') ? 'error' : undefined}>
                  {show('accent') ?? ACCENT_PRESETS[accentIndex].name}
                </Typography>
              </Box>
            </Section>
          </Reveal>

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
