import {
  Box, Button, ButtonBase, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputAdornment, Slider, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { Check, ImageOff, LayoutList, Megaphone, Monitor, Plus, Smartphone, Sparkles, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { SignageOrientation, Slide, SlideAccent, SlideTemplate } from '@/types';
import { SIGNAGE_IMAGES, SLIDE_ACCENTS, SLIDE_LIMITS, SLIDE_TEMPLATES, validateSlide, type SlideField } from '@/data/signage';
import { useFullScreenDialog } from '@/hooks/useMediaQueries';
import { AREAS } from '@/components/layout/nav';
import { tokens } from '@/theme/tokens';
import { SlideView } from './SlideView';

const AREA = AREAS.portal;
const TEMPLATE_ICON: Record<SlideTemplate, typeof Sparkles> = { promo: Sparkles, menu: LayoutList, news: Megaphone };

/** 入力中の形（価格は入力欄の文字のまま持ち、保存時に数値にする） */
interface Draft extends Omit<Slide, 'items'> {
  items: { name: string; price: string }[];
}

const PRICE = /^\d{1,5}$/;

function toDraft(s: Slide): Draft {
  const items = (s.items ?? []).map((i) => ({ name: i.name, price: String(i.price) }));
  // メニューは空の 1 行から書き始める
  return { ...s, body: s.body ?? '', startAt: s.startAt ?? '', endAt: s.endAt ?? '', items: s.template === 'menu' && items.length === 0 ? [{ name: '', price: '' }] : items };
}

function toSlide(d: Draft): Slide {
  return {
    ...d,
    items: d.template === 'menu' ? d.items.map((i) => ({ name: i.name, price: PRICE.test(i.price.trim()) ? Number(i.price.trim()) : Number.NaN })) : undefined,
  };
}

interface Props {
  /** 開いている間の編集対象（新規のときは初期値）。null で閉じる */
  slide: Slide | null;
  isNew: boolean;
  /** このスライドを再生順に入れている端末の名前 */
  usedBy: string[];
  onClose: () => void;
  onSave: (slide: Slide) => void;
}

export function SlideEditorDialog({ slide, isNew, usedBy, onClose, onSave }: Props) {
  const fullScreen = useFullScreenDialog();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [orientation, setOrientation] = useState<SignageOrientation>('landscape');
  const [submitted, setSubmitted] = useState(false);
  // 開くたびに入力を作り直す（描画中に合わせ、前の内容が一瞬見えないようにする）。
  // 閉じたときは draft を残し、閉じるアニメーションの間も内容を表示する
  const [source, setSource] = useState<Slide | null>(null);
  if (slide !== source) {
    setSource(slide);
    if (slide) {
      setDraft(toDraft(slide));
      setSubmitted(false);
    }
  }

  const preview = useMemo(() => (draft ? toSlide(draft) : null), [draft]);
  const errors = useMemo<Partial<Record<SlideField, string>>>(() => {
    if (!draft || !preview) return {};
    const e = validateSlide(preview);
    // 価格は数値にする前の文字で確かめる（「1,000」「千円」などを分かる文言で止める）
    if (!e.items && draft.template === 'menu' && draft.items.some((i) => !PRICE.test(i.price.trim()))) e.items = '価格は半角数字（0〜99999）で入力してください';
    return e;
  }, [draft, preview]);

  if (!draft || !preview) return <Dialog open={false} />;

  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const setItem = (i: number, patch: Partial<Draft['items'][number]>) => set({ items: draft.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
  const show = (k: SlideField) => (submitted ? errors[k] : undefined);

  const submit = () => {
    setSubmitted(true);
    if (Object.keys(errors).length > 0) return;
    onSave(toSlide(draft));
  };

  const chooseTemplate = (t: SlideTemplate) => set({ template: t, items: t === 'menu' && draft.items.length === 0 ? [{ name: '', price: '' }] : draft.items });

  return (
    <Dialog open={!!slide} onClose={onClose} maxWidth="lg" fullWidth fullScreen={fullScreen} aria-labelledby="slide-editor-title">
      <DialogTitle id="slide-editor-title">{isNew ? 'コンテンツを作成' : 'コンテンツを編集'}</DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', md: 'minmax(0,1fr) 380px' }, gap: { xs: 2.5, md: 3 }, alignItems: 'start' }}>
          {/* プレビュー（スマホでは上、PC では右に追従） */}
          <Box sx={{ order: { xs: 0, md: 1 }, position: { md: 'sticky' }, top: { md: 0 }, minWidth: 0 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mb: 1 }}>
              <Typography variant="overline" sx={{ color: tokens.color.muted }}>プレビュー</Typography>
              <ToggleButtonGroup
                size="small" exclusive value={orientation} aria-label="画面の向き"
                onChange={(_, v: SignageOrientation | null) => v && setOrientation(v)}
              >
                <ToggleButton value="landscape" aria-label="横向き" sx={{ px: 1.25, gap: 0.5 }}><Monitor size={15} />横</ToggleButton>
                <ToggleButton value="portrait" aria-label="縦向き" sx={{ px: 1.25, gap: 0.5 }}><Smartphone size={15} />縦</ToggleButton>
              </ToggleButtonGroup>
            </Stack>
            <Box sx={{ mx: 'auto', maxWidth: orientation === 'portrait' ? { xs: 180, md: 240 } : '100%', borderRadius: '8px', overflow: 'hidden', border: `1px solid ${tokens.color.border}`, bgcolor: tokens.color.bgSubtle }}>
              <SlideView slide={{ ...preview, title: preview.title || 'タイトル', items: preview.items?.map((i) => ({ name: i.name || '品名', price: Number.isNaN(i.price) ? 0 : i.price })) }} orientation={orientation} />
            </Box>
            {!isNew && usedBy.length > 0 && (
              <Typography variant="caption" component="p" sx={{ mt: 1.25, px: 1.25, py: 1, borderRadius: 2, bgcolor: tokens.color.infoSoft, color: '#0B6699' }}>
                {usedBy.join('・')} で使っています。保存しても、配信するまで店頭の画面は変わりません。
              </Typography>
            )}
          </Box>

          <Box
            component="form" id="slide-editor-form" noValidate sx={{ order: { xs: 1, md: 0 }, minWidth: 0 }}
            onSubmit={(e) => { e.preventDefault(); submit(); }}
          >
            <Typography variant="h6" component="p" id="slide-template-label" sx={{ mb: 1 }}>種類</Typography>
            <Box role="radiogroup" aria-labelledby="slide-template-label" sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 1, mb: 3 }}>
              {SLIDE_TEMPLATES.map((t) => {
                const Icon = TEMPLATE_ICON[t.id];
                const active = draft.template === t.id;
                return (
                  <ButtonBase
                    key={t.id} role="radio" aria-checked={active} onClick={() => chooseTemplate(t.id)}
                    sx={{
                      flexDirection: 'column', alignItems: 'flex-start', gap: 0.5, p: 1.5, minHeight: 44, borderRadius: '14px', textAlign: 'left',
                      border: `1.5px solid ${active ? AREA.color : tokens.color.border}`, bgcolor: active ? AREA.soft : tokens.color.surface, transition: 'all .16s',
                    }}
                  >
                    <Icon size={18} color={active ? AREA.color : tokens.color.muted} />
                    <Typography variant="h6" component="span">{t.label}</Typography>
                    <Typography variant="caption" sx={{ display: { xs: 'none', sm: 'block' } }}>{t.description}</Typography>
                  </ButtonBase>
                );
              })}
            </Box>

            <Stack spacing={2.5}>
              <TextField
                label="タイトル" required value={draft.title} autoFocus={isNew}
                onChange={(e) => set({ title: e.target.value })}
                error={!!show('title')}
                helperText={show('title') || `${draft.title.trim().length} / ${SLIDE_LIMITS.title}`}
                inputProps={{ maxLength: SLIDE_LIMITS.title + 20 }}
                placeholder={draft.template === 'menu' ? '例：モーニング 8:00–10:30' : '例：冬のメープルラテ はじめました'}
              />
              <TextField
                label={draft.template === 'menu' ? '補足（任意）' : '本文（任意）'} multiline minRows={2} value={draft.body ?? ''}
                onChange={(e) => set({ body: e.target.value })}
                error={!!show('body')}
                helperText={show('body') || `${(draft.body ?? '').trim().length} / ${SLIDE_LIMITS.body}`}
                inputProps={{ maxLength: SLIDE_LIMITS.body + 40 }}
              />

              {draft.template === 'menu' && (
                <Box>
                  <Typography variant="h6" component="p" sx={{ mb: 1 }}>品目（{draft.items.length} / {SLIDE_LIMITS.items}）</Typography>
                  <Stack spacing={1}>
                    {draft.items.map((it, i) => (
                      <Box key={i} sx={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 112px 44px', gap: 1, alignItems: 'start' }}>
                        <TextField
                          size="small" value={it.name} placeholder="品名" inputProps={{ 'aria-label': `${i + 1} 品目の品名`, maxLength: SLIDE_LIMITS.itemName + 10 }}
                          onChange={(e) => setItem(i, { name: e.target.value })}
                          error={submitted && !!errors.items && (!it.name.trim() || it.name.trim().length > SLIDE_LIMITS.itemName)}
                        />
                        <TextField
                          size="small" value={it.price} placeholder="580"
                          inputProps={{ 'aria-label': `${i + 1} 品目の価格（円）`, inputMode: 'numeric', maxLength: 7 }}
                          InputProps={{ startAdornment: <InputAdornment position="start">¥</InputAdornment> }}
                          onChange={(e) => setItem(i, { price: e.target.value.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)) })}
                          error={submitted && !!errors.items && !PRICE.test(it.price.trim())}
                        />
                        <IconButton aria-label={`${i + 1} 品目を削除`} disabled={draft.items.length <= 1} onClick={() => set({ items: draft.items.filter((_, j) => j !== i) })}>
                          <Trash2 size={16} />
                        </IconButton>
                      </Box>
                    ))}
                  </Stack>
                  {show('items') && <Typography variant="caption" role="alert" sx={{ display: 'block', mt: 0.75, color: tokens.color.danger }}>{show('items')}</Typography>}
                  <Button
                    size="small" startIcon={<Plus size={14} />} sx={{ mt: 1 }} disabled={draft.items.length >= SLIDE_LIMITS.items}
                    onClick={() => set({ items: [...draft.items, { name: '', price: '' }] })}
                  >
                    品目を追加
                  </Button>
                </Box>
              )}

              {draft.template !== 'menu' && (
                <Box>
                  <Typography variant="h6" component="p" id="slide-image-label" sx={{ mb: 1 }}>画像</Typography>
                  <Box role="radiogroup" aria-labelledby="slide-image-label" sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(76px, 1fr))', gap: 1 }}>
                    {[{ id: '', label: 'なし', src: '' }, ...SIGNAGE_IMAGES].map((img) => {
                      const active = (draft.image ?? '') === img.id;
                      return (
                        <ButtonBase
                          key={img.id || 'none'} role="radio" aria-checked={active} aria-label={img.label}
                          onClick={() => set({ image: img.id || undefined })}
                          sx={{
                            position: 'relative', aspectRatio: '16 / 9', minHeight: 44, borderRadius: '10px', overflow: 'hidden',
                            border: `2px solid ${active ? AREA.color : tokens.color.border}`, bgcolor: tokens.color.bgSubtle, color: tokens.color.muted,
                          }}
                        >
                          {img.src ? <Box component="img" src={img.src} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Stack alignItems="center" spacing={0.25}><ImageOff size={16} /><Typography variant="caption">なし</Typography></Stack>}
                          {active && (
                            <Box sx={{ position: 'absolute', top: 4, right: 4, width: 18, height: 18, borderRadius: '50%', bgcolor: AREA.color, color: '#fff', display: 'grid', placeItems: 'center' }}>
                              <Check size={11} strokeWidth={3} />
                            </Box>
                          )}
                        </ButtonBase>
                      );
                    })}
                  </Box>
                  <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>デモ用の画像から選べます</Typography>
                </Box>
              )}

              <Box>
                <Typography variant="h6" component="p" id="slide-accent-label" sx={{ mb: 1 }}>色</Typography>
                <Stack direction="row" role="radiogroup" aria-labelledby="slide-accent-label" sx={{ gap: 1, flexWrap: 'wrap' }}>
                  {SLIDE_ACCENTS.map((a) => {
                    const active = draft.accent === a.id;
                    return (
                      <ButtonBase
                        key={a.id} role="radio" aria-checked={active} aria-label={a.label} title={a.label}
                        onClick={() => set({ accent: a.id as SlideAccent })}
                        sx={{ width: 44, height: 44, borderRadius: '50%', bgcolor: a.color, color: '#fff', boxShadow: active ? `0 0 0 3px ${tokens.color.surface}, 0 0 0 5px ${a.color}` : 'none' }}
                      >
                        {active && <Check size={18} strokeWidth={3} />}
                      </ButtonBase>
                    );
                  })}
                </Stack>
              </Box>

              <Box>
                <Typography variant="h6" component="p" id="slide-duration-label">表示する秒数: <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums' }}>{draft.durationSec} 秒</Box></Typography>
                <Box sx={{ px: 1 }}>
                  <Slider
                    value={draft.durationSec} min={SLIDE_LIMITS.durationMin} max={SLIDE_LIMITS.durationMax} step={1}
                    marks={[5, 10, 15, 20, 25, 30].map((v) => ({ value: v, label: `${v}` }))}
                    onChange={(_, v) => set({ durationSec: v as number })}
                    aria-labelledby="slide-duration-label"
                    getAriaValueText={(v) => `${v} 秒`}
                    sx={{ color: AREA.color }}
                  />
                </Box>
                {show('durationSec') && <Typography variant="caption" role="alert" sx={{ color: tokens.color.danger }}>{show('durationSec')}</Typography>}
              </Box>

              <Box>
                <Typography variant="h6" component="p" sx={{ mb: 1 }}>掲載期間（任意）</Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', sm: 'repeat(2, minmax(0,1fr))' }, gap: 1.5 }}>
                  <TextField
                    type="date" label="開始日" value={draft.startAt ?? ''} InputLabelProps={{ shrink: true }}
                    onChange={(e) => set({ startAt: e.target.value })}
                    error={!!show('period')}
                  />
                  <TextField
                    type="date" label="終了日" value={draft.endAt ?? ''} InputLabelProps={{ shrink: true }}
                    onChange={(e) => set({ endAt: e.target.value })}
                    error={!!show('period')}
                  />
                </Box>
                <Typography variant="caption" role={show('period') ? 'alert' : undefined} sx={{ display: 'block', mt: 0.5, color: show('period') ? tokens.color.danger : undefined }}>
                  {show('period') || '期間外のあいだは、配信していても店頭の画面には出ません。空欄なら常に表示します'}
                </Typography>
              </Box>
            </Stack>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, flexWrap: 'wrap', gap: 1 }}>
        {submitted && Object.keys(errors).length > 0 && (
          <Typography variant="caption" role="alert" sx={{ flex: 1, minWidth: 160, color: tokens.color.danger }}>入力内容をご確認ください（{Object.keys(errors).length} 件）</Typography>
        )}
        <Button variant="outlined" onClick={onClose}>キャンセル</Button>
        <Button variant="contained" type="submit" form="slide-editor-form">保存する</Button>
      </DialogActions>
    </Dialog>
  );
}
