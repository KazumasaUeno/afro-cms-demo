import {
  Autocomplete, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import { Info } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import type { Project } from '@/types';
import { MEMBERS } from '@/data/members';
import type { DevPerson } from '@/data/people';
import { industryOptions, PROJECT_LIMITS, todayInput, validateProject, type ProjectDraft, type ProjectField } from '@/data/projects';
import { MemberAvatar } from '@/components/ui';
import { useFullScreenDialog } from '@/hooks/useMediaQueries';
import { TOUCH } from '@/theme/media';
import { tokens } from '@/theme/tokens';

interface Props {
  /** 開いている間の入力の初期値（新規は id なし）。null で閉じる */
  draft: ProjectDraft | null;
  projects: Project[];
  /** 開発担当に選べる人（無効にした人を除く） */
  people: DevPerson[];
  /** 開発者画面の権限（権限の無い人には注記を出す） */
  access: Record<string, boolean>;
  onClose: () => void;
  onSave: (draft: ProjectDraft) => void;
}

const FIELDS: ProjectField[] = ['siteName', 'clientName', 'industry', 'siteUrl', 'ownerId', 'launchDate'];
const OWNER_IDS = MEMBERS.map((m) => m.id);

/** プロジェクトの登録・編集（入力チェックは reducer と同じ validateProject） */
export function ProjectDialog({ draft: initial, projects, people, access, onClose, onSave }: Props) {
  const fullScreen = useFullScreenDialog();
  const [draft, setDraft] = useState<ProjectDraft | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const refs = useRef<Partial<Record<ProjectField, HTMLElement | null>>>({});
  // 開くたびに入力を作り直す。閉じたときは draft を残し、閉じるアニメーションの間も内容を表示する
  const [source, setSource] = useState<ProjectDraft | null>(null);
  if (initial !== source) {
    setSource(initial);
    if (initial) {
      setDraft(initial);
      setSubmitted(false);
    }
  }

  const errors = useMemo(() => (draft ? validateProject(draft, projects, OWNER_IDS) : {}), [draft, projects]);
  const industries = useMemo(() => industryOptions(projects), [projects]);
  if (!draft) return <Dialog open={false} />;

  const isNew = !draft.id;
  const set = (patch: Partial<ProjectDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const show = (k: ProjectField) => (submitted ? errors[k] : undefined);
  const toggleDev = (id: string) => set({ devIds: draft.devIds.includes(id) ? draft.devIds.filter((x) => x !== id) : [...draft.devIds, id] });
  const count = (v: string, max: number) => `${v.trim().length} / ${max}文字`;

  const submit = () => {
    setSubmitted(true);
    const first = FIELDS.find((k) => errors[k]);
    if (first) {
      refs.current[first]?.focus();
      return;
    }
    onSave(draft);
  };

  return (
    <Dialog open={!!initial} onClose={onClose} maxWidth="sm" fullWidth fullScreen={fullScreen} aria-labelledby="project-title">
      <DialogTitle id="project-title">{isNew ? 'プロジェクトを登録' : 'プロジェクトの登録内容を編集'}</DialogTitle>
      <DialogContent dividers>
        <Box component="form" id="project-form" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <Stack spacing={2.25}>
            {isNew && (
              <Stack direction="row" spacing={1.25} sx={{ p: 1.5, borderRadius: `${tokens.radius.sm}px`, bgcolor: tokens.color.infoSoft, color: tokens.color.inkSoft }}>
                <Info size={18} color={tokens.color.info} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden />
                <Typography variant="body2" sx={{ color: 'inherit' }}>
                  登録すると「1. 要件定義」の段階（進捗 0%）から始まります。ブランド色は自動で割り当てます。
                  <Box component="span" sx={{ display: 'block', mt: 0.5 }}>要件定義・サイトマップなどの作業データは、デモでは MINAMO COFFEE の分だけです。</Box>
                </Typography>
              </Stack>
            )}
            <TextField
              fullWidth required label="サイト名" value={draft.siteName} placeholder="例: MINAMO COFFEE"
              onChange={(e) => set({ siteName: e.target.value })}
              error={!!show('siteName')} helperText={show('siteName') ?? count(draft.siteName, PROJECT_LIMITS.siteName)}
              inputRef={(el: HTMLElement | null) => { refs.current.siteName = el; }}
              inputProps={{ maxLength: PROJECT_LIMITS.siteName + 10, autoComplete: 'off' }}
            />
            <TextField
              fullWidth required label="お客様の会社名" value={draft.clientName} placeholder="例: 株式会社ミナモ珈琲"
              onChange={(e) => set({ clientName: e.target.value })}
              error={!!show('clientName')} helperText={show('clientName') ?? count(draft.clientName, PROJECT_LIMITS.clientName)}
              inputRef={(el: HTMLElement | null) => { refs.current.clientName = el; }}
              inputProps={{ maxLength: PROJECT_LIMITS.clientName + 10, autoComplete: 'organization' }}
            />
            <Autocomplete
              freeSolo options={industries} value={draft.industry} inputValue={draft.industry}
              onInputChange={(_, v) => set({ industry: v })}
              onChange={(_, v) => set({ industry: typeof v === 'string' ? v : '' })}
              renderInput={(params) => (
                <TextField
                  {...params} fullWidth required label="業種" placeholder="候補から選ぶか、入力してください"
                  error={!!show('industry')} helperText={show('industry') ?? count(draft.industry, PROJECT_LIMITS.industry)}
                  inputRef={(el: HTMLElement | null) => { refs.current.industry = el; }}
                  inputProps={{ ...params.inputProps, maxLength: PROJECT_LIMITS.industry + 10 }}
                />
              )}
            />
            <TextField
              fullWidth required label="現行サイトのURL" type="url" value={draft.siteUrl} placeholder="https://example.jp"
              onChange={(e) => set({ siteUrl: e.target.value })}
              error={!!show('siteUrl')} helperText={show('siteUrl') ?? 'http:// または https:// から始まるURL'}
              inputRef={(el: HTMLElement | null) => { refs.current.siteUrl = el; }}
              inputProps={{ maxLength: PROJECT_LIMITS.siteUrl + 10, inputMode: 'url', autoComplete: 'off', spellCheck: false, autoCapitalize: 'none' }}
            />
            <TextField
              select fullWidth required label="担当ディレクター" value={draft.ownerId}
              onChange={(e) => set({ ownerId: e.target.value })}
              error={!!show('ownerId')} helperText={show('ownerId') ?? 'プロジェクトの窓口になるメンバー'}
              inputRef={(el: HTMLElement | null) => { refs.current.ownerId = el; }}
            >
              {MEMBERS.map((m) => (
                <MenuItem key={m.id} value={m.id}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                    <MemberAvatar id={m.id} size={22} />
                    <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{m.name}</Typography>
                    <Typography variant="caption" noWrap sx={{ minWidth: 0 }}>{m.role}</Typography>
                  </Stack>
                </MenuItem>
              ))}
            </TextField>
            <TextField
              fullWidth type="date" label="公開予定日（任意）" value={draft.launchDate}
              onChange={(e) => set({ launchDate: e.target.value })}
              error={!!show('launchDate')} helperText={show('launchDate') ?? '未定なら空のままにしてください'}
              inputRef={(el: HTMLElement | null) => { refs.current.launchDate = el; }}
              // 編集で保存済みの日付が過去のときは min を付けない（今の値が不正に見えないように）
              inputProps={!draft.launchDate || draft.launchDate >= todayInput() ? { min: todayInput() } : {}}
              InputLabelProps={{ shrink: true }}
            />
            <Box>
              <Typography variant="body2" component="h3" sx={{ fontWeight: 650, fontSize: 13, color: tokens.color.inkSoft }}>開発担当（任意・複数選べます）</Typography>
              <Typography variant="caption" component="p" sx={{ mb: 0.5 }}>チェックした人は、開発者画面でこのプロジェクトを開けます（開発者画面の権限がある人のみ）。</Typography>
              <Box component="ul" role="group" aria-label="開発担当（複数選べます）" sx={{ listStyle: 'none', m: 0, p: 0, border: `1px solid ${tokens.color.border}`, borderRadius: `${tokens.radius.sm}px`, px: 1 }}>
                {people.map((m) => (
                  <Box component="li" key={m.id} sx={{ borderTop: `1px solid ${tokens.color.border}`, '&:first-of-type': { borderTop: 'none' }, minWidth: 0 }}>
                    <FormControlLabel
                      control={<Checkbox checked={draft.devIds.includes(m.id)} onChange={() => toggleDev(m.id)} />}
                      label={
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="body2" component="span" sx={{ display: 'block', fontWeight: 650, overflowWrap: 'anywhere' }}>{m.name}</Typography>
                          <Typography variant="caption" component="span" sx={{ display: 'block', overflowWrap: 'anywhere' }}>
                            {m.role}{m.partnerCompany ? `・${m.partnerCompany}` : ''}{access[m.id] ? '' : '（開発者画面の権限なし）'}
                          </Typography>
                        </Box>
                      }
                      sx={{ m: 0, py: 0.5, width: '100%', minHeight: 44, '& .MuiFormControlLabel-label': { minWidth: 0, flex: 1 }, [TOUCH]: { minHeight: 52 } }}
                    />
                  </Box>
                ))}
              </Box>
            </Box>
          </Stack>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button variant="outlined" onClick={onClose}>キャンセル</Button>
        <Button type="submit" form="project-form" variant="contained">{isNew ? '登録する' : '保存'}</Button>
      </DialogActions>
    </Dialog>
  );
}
