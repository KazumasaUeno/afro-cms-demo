import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, MenuItem, Stack, Switch, TextField, Typography,
} from '@mui/material';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { FormDef, FormField, FormFieldType } from '@/types';
import { useFullScreenDialog } from '@/hooks/useMediaQueries';
import { tokens } from '@/theme/tokens';
import { FIELD_TYPES, FORM_LIMITS, validateForm, type FormDraft } from '@/data/forms';

interface Props {
  /** 無ければ新しいフォーム */
  form?: FormDef;
  forms: FormDef[];
  defaultRecipients: string[];
  onClose: () => void;
  onSave: (draft: FormDraft) => void;
}

/** 選択肢・通知先は 1 行に 1 つ（カンマ区切りも可） */
const splitLines = (v: string) => v.split(/[\n,、]/).map((x) => x.trim()).filter(Boolean);

/** フォームの作成・編集（0.37.0。開発者画面だけ）。保存の前に validateForm で確かめ、reducer でも同じ検査をする */
export function FormEditorDialog({ form, forms, defaultRecipients, onClose, onSave }: Props) {
  const fullScreen = useFullScreenDialog();
  const [name, setName] = useState(form?.name ?? '');
  const [fields, setFields] = useState<FormField[]>(form?.fields ?? [{ id: '', label: 'お名前', type: 'text', required: true }, { id: '', label: 'メールアドレス', type: 'email', required: true }]);
  // 選択肢は入力途中の空行を消さないよう、文字列のまま持つ
  const [optionText, setOptionText] = useState<string[]>(() => fields.map((f) => (f.options ?? []).join('\n')));
  const [recipients, setRecipients] = useState((form?.recipients ?? defaultRecipients).join('\n'));
  const [tried, setTried] = useState(false);

  const draft: FormDraft = {
    ...(form ? { id: form.id } : {}), name, recipients: splitLines(recipients),
    fields: fields.map((f, i) => ({ ...f, ...(f.type === 'select' ? { options: splitLines(optionText[i] ?? '') } : { options: undefined }) })),
  };
  const errors = validateForm(draft, forms);
  const hasErr = Object.keys(errors).length > 0;
  const show = tried;

  const setField = (i: number, p: Partial<FormField>) => setFields((fs) => fs.map((f, j) => (j === i ? { ...f, ...p } : f)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= fields.length) return;
    const swap = <T,>(arr: T[]) => { const a = [...arr]; [a[i], a[j]] = [a[j], a[i]]; return a; };
    setFields(swap);
    setOptionText(swap);
  };
  const remove = (i: number) => {
    setFields((fs) => fs.filter((_, j) => j !== i));
    setOptionText((os) => os.filter((_, j) => j !== i));
  };
  const add = () => {
    setFields((fs) => [...fs, { id: '', label: '', type: 'text', required: false }]);
    setOptionText((os) => [...os, '']);
  };

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth fullScreen={fullScreen} aria-labelledby="form-editor-title">
      <DialogTitle id="form-editor-title">{form ? 'フォームの編集' : '新しいフォーム'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <TextField label="フォーム名" required value={name} onChange={(e) => setName(e.target.value)} error={show && !!errors.name} helperText={(show && errors.name) || `${name.length} / ${FORM_LIMITS.name}`} />

          <Box>
            <Typography variant="h6" component="h3" sx={{ mb: 1 }}>項目（{fields.length} / {FORM_LIMITS.fields}）</Typography>
            {show && errors.fields && <Typography variant="caption" color="error" role="alert" component="p" sx={{ mb: 1 }}>{errors.fields}</Typography>}
            <Stack spacing={1.25}>
              {fields.map((f, i) => {
                const err = show ? errors.fieldErrors?.[i] : undefined;
                return (
                  <Box key={i} sx={{ p: 1.5, borderRadius: '12px', border: `1px solid ${err ? tokens.color.danger : tokens.color.border}` }}>
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(0,1fr) 180px auto' }, gap: 1.25, alignItems: 'center' }}>
                      <TextField size="small" label={`項目名 ${i + 1}`} value={f.label} onChange={(e) => setField(i, { label: e.target.value })} error={!!err} helperText={err} />
                      <TextField size="small" select label="種類" value={f.type} onChange={(e) => setField(i, { type: e.target.value as FormFieldType })}>
                        {FIELD_TYPES.map((t) => <MenuItem key={t.id} value={t.id}>{t.label}</MenuItem>)}
                      </TextField>
                      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ justifyContent: { xs: 'space-between', sm: 'flex-end' } }}>
                        <FormControlLabel control={<Switch size="small" checked={f.required} onChange={(e) => setField(i, { required: e.target.checked })} />} label="必須" />
                        <Stack direction="row">
                          <IconButton size="small" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`項目 ${i + 1} を上へ`}><ArrowUp size={16} /></IconButton>
                          <IconButton size="small" onClick={() => move(i, 1)} disabled={i === fields.length - 1} aria-label={`項目 ${i + 1} を下へ`}><ArrowDown size={16} /></IconButton>
                          <IconButton size="small" onClick={() => remove(i)} aria-label={`項目 ${i + 1} を削除`}><Trash2 size={16} /></IconButton>
                        </Stack>
                      </Stack>
                    </Box>
                    {f.type === 'select' && (
                      <TextField
                        size="small" fullWidth multiline minRows={2} sx={{ mt: 1.25 }} label="選択肢（1 行に 1 つ）"
                        value={optionText[i] ?? ''} onChange={(e) => setOptionText((os) => os.map((o, j) => (j === i ? e.target.value : o)))}
                      />
                    )}
                  </Box>
                );
              })}
            </Stack>
            <Button startIcon={<Plus size={16} />} onClick={add} disabled={fields.length >= FORM_LIMITS.fields} sx={{ mt: 1 }}>項目を追加</Button>
            {form && <Typography variant="caption" component="p">項目を削除しても、受信済みの問い合わせの値は残ります（「削除した項目」として表示）。</Typography>}
          </Box>

          <TextField
            label="通知先のメールアドレス（1 行に 1 つ）" required multiline minRows={2} value={recipients} onChange={(e) => setRecipients(e.target.value)}
            error={show && !!errors.recipients} helperText={(show && errors.recipients) || `最大 ${FORM_LIMITS.recipients} 件。デモのため実際のメールは送信されません`}
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
        <Button onClick={onClose}>キャンセル</Button>
        <Button variant="contained" onClick={() => { setTried(true); if (!hasErr) onSave(draft); }}>保存</Button>
      </DialogActions>
    </Dialog>
  );
}
