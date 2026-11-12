import {
  Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, FormControlLabel, FormLabel, Radio, RadioGroup, Stack, TextField, Typography,
} from '@mui/material';
import { Info } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import type { ClientAccount, DevAffiliation, DevUser, Project } from '@/types';
import { DEV_AFFILIATION, DEV_USER_LIMITS, validateDevUser, type DevUserDraft, type DevUserField } from '@/data/users';
import { useFullScreenDialog } from '@/hooks/useMediaQueries';
import { TOUCH } from '@/theme/media';
import { tokens } from '@/theme/tokens';
import { DATA_MODE } from '@/repositories/mode';

interface Props {
  /** 開いている間の入力の初期値（新規は id なし）。null で閉じる */
  draft: DevUserDraft | null;
  devUsers: DevUser[];
  accounts: ClientAccount[];
  projects: Project[];
  onClose: () => void;
  onSave: (draft: DevUserDraft) => void;
}

const FIELDS: DevUserField[] = ['name', 'role', 'email', 'partnerCompany'];

/** 開発者の登録・編集（入力チェックは reducer と同じ validateDevUser。担当プロジェクトは新規登録のときだけここで選ぶ） */
export function DevUserDialog({ draft: initial, devUsers, accounts, projects, onClose, onSave }: Props) {
  const fullScreen = useFullScreenDialog();
  const [draft, setDraft] = useState<DevUserDraft | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const refs = useRef<Partial<Record<DevUserField, HTMLElement | null>>>({});
  // 開くたびに入力を作り直す。閉じたときは draft を残し、閉じるアニメーションの間も内容を表示する
  const [source, setSource] = useState<DevUserDraft | null>(null);
  if (initial !== source) {
    setSource(initial);
    if (initial) {
      setDraft(initial);
      setSubmitted(false);
    }
  }

  const live = DATA_MODE === 'live';
  const lockEmail = live && !!draft?.id;
  const errors = useMemo(() => (draft ? validateDevUser(draft, devUsers, accounts) : {}), [draft, devUsers, accounts]);
  if (!draft) return <Dialog open={false} />;

  const isNew = !draft.id;
  const partner = draft.affiliation === 'partner';
  const set = (patch: Partial<DevUserDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const show = (k: DevUserField) => (submitted ? errors[k] : undefined);
  const toggleProject = (id: string) => set({ projectIds: draft.projectIds.includes(id) ? draft.projectIds.filter((x) => x !== id) : [...draft.projectIds, id] });

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
    <Dialog open={!!initial} onClose={onClose} maxWidth="sm" fullWidth fullScreen={fullScreen} aria-labelledby="dev-user-title">
      <DialogTitle id="dev-user-title">{isNew ? '開発者を登録' : '開発者の登録内容を編集'}</DialogTitle>
      <DialogContent dividers>
        <Box component="form" id="dev-user-form" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <Stack spacing={2.25}>
            {isNew && (
              <Stack direction="row" spacing={1.25} sx={{ p: 1.5, borderRadius: `${tokens.radius.sm}px`, bgcolor: tokens.color.infoSoft, color: tokens.color.inkSoft }}>
                <Info size={18} color={tokens.color.info} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden />
                {live ? (
                  // live: 招待は invites の文書を作るだけ。このアプリは招待メールを送らない（届くのは登録後の確認メールだけ。§2.4）
                  <Typography variant="body2" sx={{ color: 'inherit' }}>
                    登録すると「招待中」になります。このアプリから招待メールは送りません。
                    <Box component="span" sx={{ display: 'block', mt: 0.5 }}>本人に、ログイン画面の「初めての方」から、このメールアドレスで登録するよう伝えてください。届いた確認メールのリンクを開くと「有効」になり、開発者画面にログインできます。</Box>
                  </Typography>
                ) : (
                  <Typography variant="body2" sx={{ color: 'inherit' }}>
                    登録すると開発者画面の権限がオンになり、入力したメールアドレスで開発者画面にログインできます。開けるのは選んだ担当プロジェクトだけです。
                    <Box component="span" sx={{ display: 'block', mt: 0.5 }}>デモのため、実際の招待メールの送信・認証は行いません。</Box>
                  </Typography>
                )}
              </Stack>
            )}
            <TextField
              fullWidth required label="氏名" value={draft.name}
              onChange={(e) => set({ name: e.target.value })}
              error={!!show('name')} helperText={show('name') ?? `${draft.name.trim().length} / ${DEV_USER_LIMITS.name}文字`}
              inputRef={(el: HTMLElement | null) => { refs.current.name = el; }}
              inputProps={{ maxLength: DEV_USER_LIMITS.name + 10, autoComplete: 'off' }}
            />
            <TextField
              fullWidth required label="役割" value={draft.role} placeholder="例: フロントエンドエンジニア"
              onChange={(e) => set({ role: e.target.value })}
              error={!!show('role')} helperText={show('role') ?? `${draft.role.trim().length} / ${DEV_USER_LIMITS.role}文字`}
              inputRef={(el: HTMLElement | null) => { refs.current.role = el; }}
              inputProps={{ maxLength: DEV_USER_LIMITS.role + 10, autoComplete: 'off' }}
            />
            <TextField
              fullWidth required label="メールアドレス" type="email" value={draft.email}
              onChange={(e) => set({ email: e.target.value })}
              // live: メールの変更は作らない（ログインの ID のため。§28.8）。招待のときだけ入力する
              disabled={lockEmail}
              error={!!show('email')} helperText={show('email') ?? (lockEmail ? 'ログインに使うため変更できません' : live ? '本人がこのメールアドレスで登録し、開発者画面のログインに使います' : '開発者画面のログインに使います')}
              inputRef={(el: HTMLElement | null) => { refs.current.email = el; }}
              inputProps={{ maxLength: DEV_USER_LIMITS.email + 10, inputMode: 'email', autoComplete: 'off', spellCheck: false, autoCapitalize: 'none' }}
            />
            <FormControl component="fieldset">
              <FormLabel component="legend" sx={{ fontSize: 13, fontWeight: 650, color: tokens.color.inkSoft, mb: 0.5 }}>所属</FormLabel>
              <RadioGroup
                row value={draft.affiliation} onChange={(e) => set({ affiliation: e.target.value as DevAffiliation })}
                sx={{ columnGap: 2 }}
              >
                {(Object.keys(DEV_AFFILIATION) as DevAffiliation[]).map((k) => (
                  <FormControlLabel key={k} value={k} control={<Radio />} label={DEV_AFFILIATION[k]} sx={{ mr: 0, minHeight: 40, [TOUCH]: { minHeight: 44 } }} />
                ))}
              </RadioGroup>
            </FormControl>
            {partner && (
              <TextField
                fullWidth required label="パートナーの会社名" value={draft.partnerCompany}
                onChange={(e) => set({ partnerCompany: e.target.value })}
                error={!!show('partnerCompany')} helperText={show('partnerCompany') ?? `${draft.partnerCompany.trim().length} / ${DEV_USER_LIMITS.partnerCompany}文字`}
                inputRef={(el: HTMLElement | null) => { refs.current.partnerCompany = el; }}
                inputProps={{ maxLength: DEV_USER_LIMITS.partnerCompany + 10, autoComplete: 'organization' }}
              />
            )}
            {isNew && live ? (
              <Typography variant="caption" component="p">担当プロジェクトは、招待を受け取ってアカウントができた後に、一覧の「担当を変更」から割り当てます。</Typography>
            ) : isNew ? (
              <Box>
                <Typography variant="body2" component="h3" sx={{ fontWeight: 650, fontSize: 13, color: tokens.color.inkSoft }}>担当プロジェクト（複数選べます）</Typography>
                <Typography variant="caption" component="p" sx={{ mb: 0.5 }}>チェックしたプロジェクトだけを開発者画面で開けます。あとから「担当を変更」で変えられます。</Typography>
                <Box component="ul" role="group" aria-label="担当プロジェクト（複数選べます）" sx={{ listStyle: 'none', m: 0, p: 0, border: `1px solid ${tokens.color.border}`, borderRadius: `${tokens.radius.sm}px`, px: 1 }}>
                  {projects.map((p) => (
                    <Box component="li" key={p.id} sx={{ borderTop: `1px solid ${tokens.color.border}`, '&:first-of-type': { borderTop: 'none' }, minWidth: 0 }}>
                      <FormControlLabel
                        control={<Checkbox checked={draft.projectIds.includes(p.id)} onChange={() => toggleProject(p.id)} />}
                        label={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                            <Box sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: p.accent, flexShrink: 0 }} aria-hidden />
                            <Box sx={{ minWidth: 0 }}>
                              <Typography variant="body2" component="span" sx={{ display: 'block', fontWeight: 650, overflowWrap: 'anywhere' }}>{p.siteName}</Typography>
                              <Typography variant="caption" component="span" sx={{ display: 'block', overflowWrap: 'anywhere' }}>{p.clientName}</Typography>
                            </Box>
                          </Box>
                        }
                        sx={{ m: 0, py: 0.5, width: '100%', minHeight: 44, '& .MuiFormControlLabel-label': { minWidth: 0, flex: 1 }, [TOUCH]: { minHeight: 52 } }}
                      />
                    </Box>
                  ))}
                </Box>
              </Box>
            ) : (
              <Typography variant="caption" component="p">担当プロジェクトは、一覧の「担当を変更」から変えられます。</Typography>
            )}
          </Stack>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button variant="outlined" onClick={onClose}>キャンセル</Button>
        <Button type="submit" form="dev-user-form" variant="contained">{isNew ? '登録する' : '保存'}</Button>
      </DialogActions>
    </Dialog>
  );
}
