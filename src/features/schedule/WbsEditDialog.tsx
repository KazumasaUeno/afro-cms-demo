import { Button, Checkbox, Dialog, DialogActions, DialogContent, FormControlLabel, Stack, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import type { WbsItem } from '@/types';
import { WBS_ASSIGNEE_MAX, validateWbs, type WbsErrors } from '@/data/schedule';

/**
 * WBS の 1 作業の入力（2026-11-17 ユーザー指示「横棒のダブルクリックで入力画面を表示」）。開発者画面だけ。
 * 「反映」は下書きへ入れるだけで保存はしない（保存は図の下の「WBS を保存」）。
 * 開くたびに key で作り直す前提（初期値は開いたときの下書き）。
 * live だけ（LIVE_SCHEDULE_PLAN U3。demo は渡さない）: validate（年の範囲・担当名の文字数も）と done（完了印。付けた／外した人と日時は note）
 */
export function WbsEditDialog({ item, label, onClose, onApply, validate = validateWbs, done }: {
  item: WbsItem | null; label: string; onClose: () => void; onApply: (item: WbsItem, done?: boolean) => void;
  validate?: (items: WbsItem[]) => WbsErrors; done?: { checked: boolean; note?: string };
}) {
  const [v, setV] = useState({ start: item?.start ?? '', end: item?.end ?? '', assignee: item?.assignee ?? '' });
  const [checked, setChecked] = useState(!!done?.checked);
  const [tried, setTried] = useState(false);
  if (!item) return null;
  const e = tried ? validate([{ id: item.id, ...v }])[item.id] : undefined;

  const apply = () => {
    setTried(true);
    if (validate([{ id: item.id, ...v }])[item.id]) return;
    const assignee = v.assignee.trim();
    onApply({ id: item.id, start: v.start.trim(), end: v.end.trim(), ...(assignee ? { assignee } : {}) }, done ? checked : undefined);
  };

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth aria-labelledby="wbs-edit-title">
      <DialogContent sx={{ pt: 3 }}>
        <Stack spacing={2} component="form" noValidate onSubmit={(ev) => { ev.preventDefault(); apply(); }}>
          <Typography id="wbs-edit-title" variant="h3">{label}</Typography>
          <Typography variant="body2" color="text.secondary">反映すると図に出ます。保存は「WBS を保存」で行います。</Typography>
          <TextField
            autoFocus size="small" type="date" label="開始日" value={v.start} InputLabelProps={{ shrink: true }}
            onChange={(ev) => setV((x) => ({ ...x, start: ev.target.value }))} error={!!e?.start} helperText={e?.start}
          />
          <TextField
            size="small" type="date" label="終了日" value={v.end} InputLabelProps={{ shrink: true }}
            onChange={(ev) => setV((x) => ({ ...x, end: ev.target.value }))} error={!!e?.end} helperText={e?.end ?? '開始日以降'}
          />
          <TextField
            size="small" label="担当（任意）" value={v.assignee} inputProps={{ maxLength: WBS_ASSIGNEE_MAX }}
            onChange={(ev) => setV((x) => ({ ...x, assignee: ev.target.value }))} error={!!e?.assignee}
            helperText={e?.assignee ?? `${WBS_ASSIGNEE_MAX}文字以内`}
          />
          {done && (
            <Stack spacing={0.25}>
              <FormControlLabel
                control={<Checkbox checked={checked} onChange={(ev) => setChecked(ev.target.checked)} />}
                label="この作業は完了（完了印）"
              />
              <Typography variant="caption" color="text.secondary">
                {done.note ?? '付けた人と日時が記録されます。外すこともできます。'}
              </Typography>
            </Stack>
          )}
          {/* Enter で反映できるように（ボタンは下の DialogActions） */}
          <button type="submit" hidden aria-hidden tabIndex={-1} />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
        <Button variant="outlined" onClick={onClose}>キャンセル</Button>
        <Button variant="contained" onClick={apply}>反映</Button>
      </DialogActions>
    </Dialog>
  );
}
