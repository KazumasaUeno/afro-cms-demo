import { Alert, Button, Dialog, DialogActions, DialogContent, Stack, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import { SCHEDULE_NOTE_MAX, validateSchedule, type ScheduleDraft } from '@/data/schedule';

/**
 * 予定日・メモの入力（2026-11-17 ユーザー指示「カレンダーの表が古いレイアウトなのが嫌だ」）。開発者画面だけ。
 * fields に出す項目だけを入力させ、検査は 3 つの日付を合わせて行う（制作の完了予定 ≦ 納品予定日 ≦ 公開予定日）。
 * 出していない項目の誤り（順序が崩れた等）は上にまとめて出す。開くたびに key で作り直す前提
 */
export const SCHEDULE_FIELD_LABEL: Record<keyof ScheduleDraft, { label: string; help: string }> = {
  buildDue: { label: '制作の完了予定（任意）', help: '全ページの構築を終える日' },
  deliveryDate: { label: '納品予定日', help: '品質管理・納品検収の終了日' },
  releaseDate: { label: '公開予定日', help: '納品予定日以降' },
  note: { label: 'メモ（任意）', help: `${SCHEDULE_NOTE_MAX}文字以内` },
};

export function ScheduleEditDialog({ title, initial, fields, onClose, onSave }: {
  title: string; initial: ScheduleDraft; fields: (keyof ScheduleDraft)[]; onClose: () => void; onSave: (d: ScheduleDraft) => void;
}) {
  const [draft, setDraft] = useState<ScheduleDraft>(initial);
  const [tried, setTried] = useState(false);
  const errors = validateSchedule(draft);
  const hidden = tried ? (Object.keys(errors) as (keyof ScheduleDraft)[]).filter((k) => !fields.includes(k)) : [];

  const save = () => {
    setTried(true);
    if (Object.keys(errors).length > 0) return;
    onSave(draft);
  };

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth aria-labelledby="schedule-edit-title">
      <DialogContent sx={{ pt: 3 }}>
        <Stack spacing={2} component="form" noValidate onSubmit={(ev) => { ev.preventDefault(); save(); }}>
          <Typography id="schedule-edit-title" variant="h3">{title}</Typography>
          {hidden.length > 0 && (
            <Alert severity="warning" variant="outlined">
              {hidden.map((k) => `${SCHEDULE_FIELD_LABEL[k].label}: ${errors[k]}`).join(' / ')}
            </Alert>
          )}
          {fields.map((k, i) => {
            const e = tried ? errors[k] : undefined;
            return k === 'note' ? (
              <TextField
                key={k} autoFocus={i === 0} fullWidth multiline minRows={3} label={SCHEDULE_FIELD_LABEL[k].label} value={draft.note}
                onChange={(ev) => setDraft((d) => ({ ...d, note: ev.target.value }))} error={!!e} helperText={e ?? SCHEDULE_FIELD_LABEL[k].help}
              />
            ) : (
              <TextField
                key={k} autoFocus={i === 0} fullWidth type="date" label={SCHEDULE_FIELD_LABEL[k].label} value={draft[k]} InputLabelProps={{ shrink: true }}
                onChange={(ev) => setDraft((d) => ({ ...d, [k]: ev.target.value }))} error={!!e} helperText={e ?? SCHEDULE_FIELD_LABEL[k].help}
              />
            );
          })}
          <button type="submit" hidden aria-hidden tabIndex={-1} />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
        <Button variant="outlined" onClick={onClose}>キャンセル</Button>
        <Button variant="contained" onClick={save}>保存する</Button>
      </DialogActions>
    </Dialog>
  );
}
