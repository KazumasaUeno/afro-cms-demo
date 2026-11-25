import { Autocomplete, Box, Button, ButtonBase, Stack, TextField, Typography } from '@mui/material';
import { ArrowLeft, Check, FolderPlus } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { PageHeader, Surface } from '@/components/ui';
import { useRepositories } from '@/repositories';
import { useWrite } from '@/hooks/useWrite';
import { MAX_URL } from '@/features/requirements/validation';
import {
  ACCENT_PRESETS, emptyProjectDraft, INDUSTRY_SUGGESTIONS, PROJECT_LIMITS, todayYmd, validateProject, type ProjectDraft, type ProjectField,
} from '@/features/projects/projectForm';
import { tokens } from '@/theme/tokens';
import type { DevUser } from '@/types';
import { INVITE_PREFIX, MAX_MEMBERS } from '../model';
import { useLiveSession } from '../session';

/** live で入力する項目（担当ディレクター・次の作業は live に無い。担当は memberUids、次の作業は状態から導く。§5.7） */
const FIELDS = ['clientName', 'siteName', 'siteUrl', 'industry', 'launchDate', 'accent'] as const satisfies readonly ProjectField[];
type LiveField = (typeof FIELDS)[number];

/**
 * 新しいプロジェクト（live の開発者画面と管理者画面）。
 * - 開発者: 作成者が担当になる（従来どおり）
 * - 管理者（2026-11-25 ユーザー決定「管理者もプロジェクトを作れるように」）: 担当の開発者を 0〜20 人選ぶ（draft.devIds → memberUids）。
 *   選ばなくても作れ、後から「ユーザー」の「担当を変更」で割り当てる
 * 入力の検査は demo と同じ validateProject（URL の重複は見えている案件だけ。全体の重複は siteKeys で Rules が拒否する）
 */
export default function LiveNewProjectPage() {
  const admin = useLiveSession().account.role === 'admin';
  const listPath = admin ? '/projects' : '/dev/projects';
  const { projects: repo } = useRepositories();
  const { data: projects } = repo.useList();
  const navigate = useNavigate();
  const write = useWrite();
  const [draft, setDraft] = useState<ProjectDraft>(() => emptyProjectDraft());
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  // 作成を押した時点の一覧で重複を見る（作成中・作成後は自分の案件が一覧に先に出て「すでにあります」と誤って出るため）
  const [frozen, setFrozen] = useState<typeof projects | null>(null);
  const refs = useRef<Partial<Record<LiveField, HTMLElement | null>>>({});
  const errors = useMemo(() => {
    const e = validateProject(draft, frozen ?? projects);
    delete e.ownerId;
    delete e.nextAction;
    return e;
  }, [draft, projects, frozen]);
  const set = (patch: Partial<ProjectDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const show = (k: LiveField) => (submitted ? errors[k] : undefined);
  const counter = (k: 'clientName' | 'siteName' | 'industry') => `${draft[k].trim().length} / ${PROJECT_LIMITS[k]}文字`;

  const submit = () => {
    setSubmitted(true);
    const first = FIELDS.find((k) => errors[k]);
    if (first) {
      refs.current[first]?.focus();
      return;
    }
    if (saving) return;
    setSaving(true);
    setFrozen(projects);
    void write(repo.create(draft), 'プロジェクトを作成しました').then((ok) => {
      setSaving(false);
      if (!ok) setFrozen(null);
      // 作成した案件は作業中の案件になる（create の中で select 済み）。開発者はヒアリングの入力へ、管理者は一覧へ戻る
      if (ok) navigate(admin ? listPath : '/dev/hearing', { replace: true });
    });
  };

  return (
    <Box sx={{ maxWidth: 720 }}>
      <Button component={RouterLink} to={listPath} size="small" startIcon={<ArrowLeft size={16} />} sx={{ mb: 2, ml: -1 }}>
        プロジェクトの一覧
      </Button>
      <PageHeader
        eyebrow={admin ? '管理者画面' : '開発者画面'} icon={<FolderPlus size={14} />} title="新しいプロジェクト"
        description={admin ? '担当の開発者を選んで作成します。担当は後から「ユーザー」でも割り当てられます。' : '作成すると、あなたが担当のプロジェクトになり、ヒアリングの入力に進みます。'}
      />
      <Surface padding={{ xs: 2, md: 3 }}>
        <Box component="form" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <Stack spacing={2.25}>
            <TextField
              fullWidth required label="お客様の会社名" value={draft.clientName} onChange={(e) => set({ clientName: e.target.value })}
              error={!!show('clientName')} helperText={show('clientName') ?? counter('clientName')}
              inputRef={(el: HTMLElement | null) => { refs.current.clientName = el; }}
              inputProps={{ maxLength: PROJECT_LIMITS.clientName + 10, autoComplete: 'organization' }}
            />
            <TextField
              fullWidth required label="サイト名" value={draft.siteName} onChange={(e) => set({ siteName: e.target.value })}
              error={!!show('siteName')} helperText={show('siteName') ?? counter('siteName')}
              inputRef={(el: HTMLElement | null) => { refs.current.siteName = el; }}
              inputProps={{ maxLength: PROJECT_LIMITS.siteName + 10, autoComplete: 'off' }}
            />
            <TextField
              fullWidth required label="現在のサイトの URL" value={draft.siteUrl} onChange={(e) => set({ siteUrl: e.target.value })} placeholder="https://example.co.jp"
              error={!!show('siteUrl')} helperText={show('siteUrl') ?? '作成後は変更できません'}
              inputRef={(el: HTMLElement | null) => { refs.current.siteUrl = el; }}
              inputProps={{ maxLength: MAX_URL + 10, inputMode: 'url', autoComplete: 'url', spellCheck: false, autoCapitalize: 'none' }}
            />
            <Autocomplete
              freeSolo options={INDUSTRY_SUGGESTIONS} inputValue={draft.industry} onInputChange={(_, v) => set({ industry: v })}
              renderInput={(params) => (
                <TextField
                  {...params} required label="業種" error={!!show('industry')} helperText={show('industry') ?? counter('industry')}
                  inputRef={(el: HTMLElement | null) => { refs.current.industry = el; }}
                />
              )}
            />
            <TextField
              fullWidth type="date" label="公開予定日（任意）" value={draft.launchDate} onChange={(e) => set({ launchDate: e.target.value })}
              error={!!show('launchDate')} helperText={show('launchDate') ?? '未定なら空欄'}
              inputRef={(el: HTMLElement | null) => { refs.current.launchDate = el; }}
              InputLabelProps={{ shrink: true }} inputProps={{ min: todayYmd() }}
            />
            <Box role="radiogroup" aria-label="ブランド色">
              <Typography variant="body2" sx={{ fontWeight: 650, fontSize: 13, color: tokens.color.inkSoft, mb: 1 }}>ブランド色</Typography>
              <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
                {ACCENT_PRESETS.map((a, i) => {
                  const on = draft.accent === a.value;
                  return (
                    <ButtonBase
                      key={a.value} role="radio" aria-checked={on} aria-label={a.name} onClick={() => set({ accent: a.value })}
                      ref={(el: HTMLButtonElement | null) => { if (i === 0) refs.current.accent = el; }}
                      sx={{ width: 44, height: 44, borderRadius: '12px', bgcolor: a.value, color: '#fff', outline: on ? `2px solid ${tokens.color.ink}` : 'none', outlineOffset: 2 }}
                    >
                      {on && <Check size={18} />}
                    </ButtonBase>
                  );
                })}
              </Stack>
              {show('accent') && <Typography variant="caption" sx={{ color: tokens.color.dangerInk }}>{show('accent')}</Typography>}
            </Box>
            {admin && <DevPicker value={draft.devIds ?? []} onChange={(devIds) => set({ devIds })} />}
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button variant="outlined" component={RouterLink} to={listPath}>キャンセル</Button>
              <Button type="submit" variant="contained" disabled={saving}>{saving ? '作成しています…' : '作成する'}</Button>
            </Stack>
          </Stack>
        </Box>
      </Surface>
    </Box>
  );
}

/**
 * 担当の開発者（管理者だけ。任意・複数）。一覧は「ユーザー」画面と同じ useDevUsers（accounts＋招待中）から、
 * 受け取り済みで有効な人だけ（招待中の人は uid がまだ無いので選べない。無効の人は割り当てない）
 */
function DevPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const { accounts } = useRepositories();
  const { data, loading, error } = accounts.useDevUsers();
  const options = useMemo(() => data.filter((u) => u.status === 'active' && !u.id.startsWith(INVITE_PREFIX)), [data]);
  const selected = useMemo(() => options.filter((u) => value.includes(u.id)), [options, value]);
  const over = value.length > MAX_MEMBERS;
  return (
    <Autocomplete<DevUser, true>
      multiple options={options} value={selected} loading={loading} disableCloseOnSelect filterSelectedOptions
      onChange={(_, v) => onChange(v.map((u) => u.id))}
      getOptionLabel={(u) => (u.role ? `${u.name}（${u.role}）` : u.name)}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      noOptionsText="選べる開発者がいません"
      renderInput={(params) => (
        <TextField
          {...params} label="担当の開発者（任意・複数）"
          error={!!error || over}
          helperText={error ? '開発者の一覧を読み込めませんでした。担当は後から「ユーザー」で割り当てられます' : over ? `${MAX_MEMBERS}人までです` : '選ばなくても作成できます（招待中の人は受け取り後に割り当てます）'}
        />
      )}
    />
  );
}
