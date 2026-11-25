import { Autocomplete, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, ListItemText, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { ListPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { tokens } from '@/theme/tokens';
import { useFullScreenDialog } from '@/hooks/useMediaQueries';
import { memberById } from '@/data/members';
import { DEV_TASK_TITLE_MAX as TITLE_MAX } from '@/data/dev';
import { DEV_TASK_PAGE_MAX as PAGE_MAX, WHOLE_SITE } from '@/data/devTaskLimits';

/** ページに紐づかないタスク（共通部品・環境の準備など）の「対象ページ」（値の正は data/devTaskLimits.ts） */
export { WHOLE_SITE };

interface Props {
  open: boolean;
  /** 対象ページの候補（その案件の構築タスクのページ） */
  pages: string[];
  /** 担当の候補（その案件の開発担当。先頭が既定＝ログイン中の人）。複数選べる（2026-11-19 ユーザー指示） */
  assigneeIds: string[];
  onClose: () => void;
  onCreate: (task: { title: string; page: string; assigneeIds: string[] }) => void;
  /** 担当の名前（既定は demo の固定メンバー memberById。live は accounts から引いた名前を渡す） */
  nameOf?: (id: string) => string;
  /**
   * 対象ページを自由入力にする（live はサイトマップが無い。1〜40 文字。pages は候補として出す。
   * docs/design/LIVE_DASHBOARD_TASKS_CONSULT.md §1.2）。既定（demo）は候補からの選択だけ
   */
  freePage?: boolean;
  /** 保存中（ボタンを無効にして二重送信を防ぐ） */
  busy?: boolean;
}

/** 構築タスクの追加（2026-11-19 ユーザー指示「タスクの新規作成がない」）。追加したタスクは未着手から始まる */
export function NewDevTaskDialog({ open, pages, assigneeIds, onClose, onCreate, nameOf = (id) => memberById(id).name, freePage = false, busy = false }: Props) {
  const fullScreen = useFullScreenDialog();
  const [title, setTitle] = useState('');
  const [page, setPage] = useState(WHOLE_SITE);
  const [selected, setSelected] = useState<string[]>(assigneeIds.slice(0, 1));
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle('');
      setPage(WHOLE_SITE);
      setSelected(assigneeIds.slice(0, 1));
      setSubmitted(false);
    }
    // 開いたときだけ初期化する（候補の配列は描画ごとに作り直されるため依存に入れない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const trimmed = title.trim();
  const titleErr = !trimmed ? 'タスク名を入力してください' : trimmed.length > TITLE_MAX ? `${TITLE_MAX} 文字以内で入力してください` : '';
  const pageTrimmed = page.trim();
  const pageErr = !freePage ? '' : !pageTrimmed ? '対象ページを入力してください' : pageTrimmed.length > PAGE_MAX ? `${PAGE_MAX} 文字以内で入力してください` : '';
  const submit = () => {
    setSubmitted(true);
    if (busy || titleErr || pageErr || !selected.length) return;
    // 並びは候補の順（先頭が主担当）
    onCreate({ title: trimmed, page: freePage ? pageTrimmed : page, assigneeIds: assigneeIds.filter((id) => selected.includes(id)) });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth fullScreen={fullScreen} aria-labelledby="new-dev-task-title">
      <DialogTitle id="new-dev-task-title">
        <Stack direction="row" spacing={1} alignItems="center">
          <ListPlus size={20} color={tokens.color.primary} aria-hidden />
          <span>タスクを追加</span>
        </Stack>
        <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>追加したタスクは「未着手」に入ります。</Typography>
      </DialogTitle>
      <DialogContent>
        <Box
          component="form"
          id="new-dev-task-form"
          noValidate
          onSubmit={(e) => { e.preventDefault(); submit(); }}
          sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}
        >
          <TextField
            label="タスク名"
            required
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例: お問い合わせフォームの送信テスト"
            error={submitted && !!titleErr}
            helperText={submitted && titleErr ? titleErr : `${trimmed.length}/${TITLE_MAX}`}
            inputProps={{ maxLength: TITLE_MAX + 20 }}
          />
          {freePage ? (
            <Autocomplete
              freeSolo
              options={[WHOLE_SITE, ...pages.filter((p) => p !== WHOLE_SITE)]}
              inputValue={page}
              onInputChange={(_, v) => setPage(v)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="対象ページ"
                  required
                  error={submitted && !!pageErr}
                  helperText={submitted && pageErr ? pageErr : `ページ名を入力するか候補から選びます（${pageTrimmed.length}/${PAGE_MAX}）`}
                  inputProps={{ ...params.inputProps, maxLength: PAGE_MAX + 20 }}
                />
              )}
            />
          ) : (
            <TextField select label="対象ページ" value={page} onChange={(e) => setPage(e.target.value)}>
              <MenuItem value={WHOLE_SITE}>{WHOLE_SITE}（ページに紐づかない作業）</MenuItem>
              {pages.map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}
            </TextField>
          )}
          <TextField
            select
            label="担当（複数選べます）"
            value={selected}
            onChange={(e) => { const v = e.target.value as unknown; setSelected(typeof v === 'string' ? v.split(',') : (v as string[])); }}
            SelectProps={{ multiple: true, renderValue: (v) => (v as string[]).map(nameOf).join('・') }}
            error={submitted && !selected.length}
            helperText={submitted && !selected.length ? '担当を 1 人以上選んでください' : undefined}
          >
            {assigneeIds.map((id) => (
              <MenuItem key={id} value={id} sx={{ minHeight: 44 }}>
                <Checkbox size="small" checked={selected.includes(id)} sx={{ p: 0.5, mr: 1 }} />
                <ListItemText primary={nameOf(id)} />
              </MenuItem>
            ))}
          </TextField>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={{ minHeight: 44 }}>キャンセル</Button>
        <Button type="submit" form="new-dev-task-form" variant="contained" disabled={busy} sx={{ minHeight: 44 }}>追加する</Button>
      </DialogActions>
    </Dialog>
  );
}
