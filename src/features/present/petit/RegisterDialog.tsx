import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';
import { tokens } from '@/theme/tokens';
import type { ProjectDraft } from '@/types';

const c = tokens.color;

/** 「案件として登録」の確認（作る内容を見せてから作る。押している間は二重に作らない） */
export function RegisterDialog({ open, draft, answerCount, ownerName, saving, onClose, onConfirm }: {
  open: boolean; draft: ProjectDraft; answerCount: number; ownerName: string; saving: boolean; onClose: () => void; onConfirm: () => void;
}) {
  const rows: [string, string][] = [
    ['お客様・サイト名', draft.clientName],
    ['URL', draft.siteUrl],
    ['業種', draft.industry],
    ['担当', ownerName],
    ['ヒアリングに入れる回答', `${answerCount} 問`],
  ];
  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="xs" aria-labelledby="petit-register-title">
      <DialogTitle id="petit-register-title">案件として登録しますか？</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: c.muted, mb: 2 }}>
          ヒアリングの段階のプロジェクトを作り、いま入力した回答をヒアリングに入れます。サイトマップ・デザインは本契約の流れで改めて作ります。
        </Typography>
        <Stack spacing={1}>
          {rows.map(([k, v]) => (
            <Box key={k} sx={{ display: 'grid', gridTemplateColumns: '9em 1fr', gap: 1 }}>
              <Typography variant="body2" sx={{ color: c.muted }}>{k}</Typography>
              <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{v}</Typography>
            </Box>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>キャンセル</Button>
        <Button variant="contained" onClick={onConfirm} disabled={saving}>{saving ? '登録しています…' : '登録する'}</Button>
      </DialogActions>
    </Dialog>
  );
}
