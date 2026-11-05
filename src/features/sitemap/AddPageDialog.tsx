import { Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField } from '@mui/material';
import { useEffect, useState } from 'react';
import type { SitemapNode, SitemapNodeData, SitemapVariant } from '@/types';
import { validateLabel, validatePath } from './metrics';
import { KIND_META } from './PageNode';

export interface NewPageInput {
  label: string;
  path: string;
  kind: SitemapNodeData['kind'];
  parentId: string;
  reason: string;
}

interface Props {
  open: boolean;
  variant: SitemapVariant;
  nodes: SitemapNode[];
  defaultParentId?: string;
  onClose: () => void;
  onAdd: (input: NewPageInput) => void;
}

const KINDS: SitemapNodeData['kind'][] = ['page', 'section', 'new', 'cta'];

export function AddPageDialog({ open, variant, nodes, defaultParentId, onClose, onAdd }: Props) {
  const home = nodes.find((n) => n.data.kind === 'home');
  const [form, setForm] = useState<NewPageInput>({ label: '', path: '/', kind: 'new', parentId: '', reason: '' });
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({ label: '', path: '/', kind: variant === 'after' ? 'new' : 'page', parentId: defaultParentId ?? home?.id ?? '', reason: '' });
      setTouched(false);
    }
  }, [open, variant, defaultParentId, home?.id]);

  const labelErr = validateLabel(form.label);
  const pathErr = validatePath(form.path, nodes);
  const submit = () => {
    setTouched(true);
    if (labelErr || pathErr) return;
    onAdd({ ...form, label: form.label.trim(), path: form.path.trim(), reason: form.reason.trim().slice(0, 140) });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth aria-labelledby="add-page-title">
      <DialogTitle id="add-page-title">ページを追加</DialogTitle>
      <DialogContent>
        <Stack
          component="form"
          spacing={2}
          sx={{ pt: 1 }}
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <TextField label="ページ名" value={form.label} autoFocus onChange={(e) => setForm({ ...form, label: e.target.value })}
            error={touched && !!labelErr} helperText={touched && labelErr ? labelErr : '例：採用情報'} inputProps={{ maxLength: 30 }} />
          <TextField label="URLパス" value={form.path} onChange={(e) => setForm({ ...form, path: e.target.value })}
            error={touched && !!pathErr} helperText={touched && pathErr ? pathErr : '例：/recruit'} inputProps={{ maxLength: 70, spellCheck: false }} />
          <TextField select label="種類" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as SitemapNodeData['kind'] })}>
            {KINDS.map((k) => <MenuItem key={k} value={k}>{KIND_META[k].label}</MenuItem>)}
          </TextField>
          <TextField select label="親ページ（つなぐ先）" value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })}>
            <MenuItem value="">つながない</MenuItem>
            {nodes.map((n) => <MenuItem key={n.id} value={n.id}>{n.data.label}（{n.data.path}）</MenuItem>)}
          </TextField>
          {variant === 'after' && (
            <TextField label="改善理由（任意）" value={form.reason} multiline minRows={2} onChange={(e) => setForm({ ...form, reason: e.target.value })}
              inputProps={{ maxLength: 140 }} helperText={`${form.reason.length} / 140`} />
          )}
          <button type="submit" hidden aria-hidden tabIndex={-1} />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button variant="outlined" onClick={onClose}>キャンセル</Button>
        <Button variant="contained" onClick={submit}>追加する</Button>
      </DialogActions>
    </Dialog>
  );
}
