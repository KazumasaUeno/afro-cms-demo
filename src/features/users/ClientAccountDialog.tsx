import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { Info } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import type { ClientAccount, Project } from '@/types';
import { CLIENT_LIMITS, validateClientAccount, type ClientAccountDraft, type ClientField } from '@/data/users';
import { useFullScreenDialog } from '@/hooks/useMediaQueries';
import { tokens } from '@/theme/tokens';

interface Props {
  /** 開いている間の入力の初期値（新規は id なし）。null で閉じる */
  draft: ClientAccountDraft | null;
  accounts: ClientAccount[];
  projects: Project[];
  onClose: () => void;
  onSave: (draft: ClientAccountDraft) => void;
}

const FIELDS: ClientField[] = ['projectId', 'company', 'name', 'email'];

/** お客様の登録・編集（入力チェックは reducer と同じ validateClientAccount） */
export function ClientAccountDialog({ draft: initial, accounts, projects, onClose, onSave }: Props) {
  const fullScreen = useFullScreenDialog();
  const [draft, setDraft] = useState<ClientAccountDraft | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const refs = useRef<Partial<Record<ClientField, HTMLElement | null>>>({});
  // 開くたびに入力を作り直す。閉じたときは draft を残し、閉じるアニメーションの間も内容を表示する
  const [source, setSource] = useState<ClientAccountDraft | null>(null);
  if (initial !== source) {
    setSource(initial);
    if (initial) {
      setDraft(initial);
      setSubmitted(false);
    }
  }

  const errors = useMemo(() => (draft ? validateClientAccount(draft, accounts, projects) : {}), [draft, accounts, projects]);
  if (!draft) return <Dialog open={false} />;

  const isNew = !draft.id;
  const set = (patch: Partial<ClientAccountDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const show = (k: ClientField) => (submitted ? errors[k] : undefined);

  const chooseProject = (projectId: string) => {
    const prevClient = projects.find((p) => p.id === draft.projectId)?.clientName ?? '';
    const nextClient = projects.find((p) => p.id === projectId)?.clientName ?? '';
    // 会社名が空か、前に選んでいた案件の会社名のままなら、選んだ案件の会社名を入れる（手で直した会社名は上書きしない）
    const company = !draft.company.trim() || draft.company === prevClient ? nextClient : draft.company;
    set({ projectId, company });
  };

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
    <Dialog open={!!initial} onClose={onClose} maxWidth="sm" fullWidth fullScreen={fullScreen} aria-labelledby="client-account-title">
      <DialogTitle id="client-account-title">{isNew ? 'お客様を登録' : 'お客様の登録内容を編集'}</DialogTitle>
      <DialogContent dividers>
        <Box component="form" id="client-account-form" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <Stack spacing={2.25}>
            {isNew && (
              <Stack direction="row" spacing={1.25} sx={{ p: 1.5, borderRadius: `${tokens.radius.sm}px`, bgcolor: tokens.color.infoSoft, color: tokens.color.inkSoft }}>
                <Info size={18} color={tokens.color.info} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden />
                <Typography variant="body2" sx={{ color: 'inherit' }}>
                  登録すると、入力したメールアドレスに招待メールを送り「招待中」になります。お客様ポータルに初めてログインすると「有効」になります。
                  <Box component="span" sx={{ display: 'block', mt: 0.5 }}>デモのため、実際にはメールを送信しません。</Box>
                </Typography>
              </Stack>
            )}
            <TextField
              select fullWidth required label="担当案件" value={draft.projectId}
              onChange={(e) => chooseProject(e.target.value)}
              error={!!show('projectId')} helperText={show('projectId') ?? 'このお客様の案件（デモのお客様ポータルは、どの案件でも MINAMO COFFEE のデータを表示します）'}
              inputRef={(el: HTMLElement | null) => { refs.current.projectId = el; }}
              SelectProps={{ MenuProps: { PaperProps: { sx: { maxHeight: 320 } } } }}
            >
              {projects.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                    <Box sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: p.accent, flexShrink: 0 }} />
                    <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{p.siteName}</Typography>
                    <Typography variant="caption" noWrap sx={{ minWidth: 0 }}>{p.clientName}</Typography>
                  </Stack>
                </MenuItem>
              ))}
            </TextField>
            <TextField
              fullWidth required label="会社名" value={draft.company}
              onChange={(e) => set({ company: e.target.value })}
              error={!!show('company')} helperText={show('company') ?? `${draft.company.trim().length} / ${CLIENT_LIMITS.company}文字`}
              inputRef={(el: HTMLElement | null) => { refs.current.company = el; }}
              inputProps={{ maxLength: CLIENT_LIMITS.company + 10, autoComplete: 'organization' }}
            />
            <TextField
              fullWidth required label="担当者名" value={draft.name}
              onChange={(e) => set({ name: e.target.value })}
              error={!!show('name')} helperText={show('name') ?? `${draft.name.trim().length} / ${CLIENT_LIMITS.name}文字`}
              inputRef={(el: HTMLElement | null) => { refs.current.name = el; }}
              inputProps={{ maxLength: CLIENT_LIMITS.name + 10, autoComplete: 'off' }}
            />
            <TextField
              fullWidth required label="メールアドレス" type="email" value={draft.email}
              onChange={(e) => set({ email: e.target.value })}
              error={!!show('email')} helperText={show('email') ?? 'お客様ポータルのログインに使います'}
              inputRef={(el: HTMLElement | null) => { refs.current.email = el; }}
              inputProps={{ maxLength: CLIENT_LIMITS.email + 10, inputMode: 'email', autoComplete: 'off', spellCheck: false, autoCapitalize: 'none' }}
            />
          </Stack>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button variant="outlined" onClick={onClose}>キャンセル</Button>
        <Button type="submit" form="client-account-form" variant="contained">{isNew ? '登録して招待する' : '保存'}</Button>
      </DialogActions>
    </Dialog>
  );
}
