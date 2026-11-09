import { Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Stack, Typography } from '@mui/material';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { useState } from 'react';
import type { Display, Slide } from '@/types';
import { StatusPill } from '@/components/ui';
import { DISPLAY_SLIDES_MAX, periodLabel, periodState, TEMPLATE_LABEL } from '@/data/signage';
import { useFullScreenDialog } from '@/hooks/useMediaQueries';
import { tokens } from '@/theme/tokens';
import { SlideView } from './SlideView';

/** 端末で流すコンテンツ（チェック）と順番（上下）を決める。保存しても、配信するまで端末には届かない */
export function DisplaySlidesDialog({ display, slides, onClose, onSave }: { display: Display | null; slides: Slide[]; onClose: () => void; onSave: (ids: string[]) => void }) {
  const fullScreen = useFullScreenDialog();
  const [ids, setIds] = useState<string[]>([]);
  // 開いた端末が変わったときだけ選択を作り直す（閉じるアニメーションの間は最後の端末を表示）
  const [openId, setOpenId] = useState<string | null>(null);
  const [last, setLast] = useState<Display | null>(null);
  const currentId = display?.id ?? null;
  if (currentId !== openId) {
    setOpenId(currentId);
    if (display) {
      setLast(display);
      setIds(display.slideIds.filter((id) => slides.some((s) => s.id === id)));
    }
  }
  const shown = display ?? last;
  if (!shown) return <Dialog open={false} />;

  const selected = ids.map((id) => slides.find((s) => s.id === id)).filter((s): s is Slide => !!s);
  const others = slides.filter((s) => !ids.includes(s.id));
  const full = ids.length >= DISPLAY_SLIDES_MAX;
  const move = (i: number, d: -1 | 1) => setIds((list) => {
    const next = [...list];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    return next;
  });
  const toggle = (id: string) => setIds((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));

  const row = (s: Slide, i: number | null) => {
    const checked = i !== null;
    const st = periodState(s);
    const labelId = `display-slide-${s.id}`;
    return (
      <Box
        component="li" key={s.id}
        sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1, px: 0.5, borderTop: `1px solid ${tokens.color.border}`, minWidth: 0 }}
      >
        <Checkbox checked={checked} disabled={!checked && full} onChange={() => toggle(s.id)} inputProps={{ 'aria-labelledby': labelId }} />
        <Box sx={{ width: shown.orientation === 'portrait' ? 34 : 72, flexShrink: 0, borderRadius: '4px', overflow: 'hidden', border: `1px solid ${tokens.color.border}` }}>
          <SlideView slide={s} orientation={shown.orientation} decorative />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography id={labelId} variant="body2" sx={{ fontWeight: 650, overflowWrap: 'anywhere' }}>
            {checked && <Box component="span" sx={{ color: tokens.color.muted, fontVariantNumeric: 'tabular-nums', mr: 0.75 }}>{i + 1}.</Box>}
            {s.title}
          </Typography>
          <Stack direction="row" sx={{ gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
            <StatusPill tone="neutral" dot={false}>{TEMPLATE_LABEL[s.template]}・{s.durationSec}秒</StatusPill>
            {st !== 'active' && <StatusPill tone={st === 'upcoming' ? 'info' : 'neutral'}>{st === 'upcoming' ? '掲載前' : '掲載終了'}（{periodLabel(s)}）</StatusPill>}
          </Stack>
        </Box>
        {checked && (
          <Stack direction="row" sx={{ flexShrink: 0 }}>
            <IconButton aria-label={`「${s.title}」を上へ`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={16} /></IconButton>
            <IconButton aria-label={`「${s.title}」を下へ`} disabled={i === ids.length - 1} onClick={() => move(i, 1)}><ArrowDown size={16} /></IconButton>
          </Stack>
        )}
      </Box>
    );
  };

  return (
    <Dialog open={!!display} onClose={onClose} maxWidth="sm" fullWidth fullScreen={fullScreen} aria-labelledby="display-slides-title">
      <DialogTitle id="display-slides-title">「{shown.name}」で流す内容</DialogTitle>
      <DialogContent dividers>
        <Typography variant="caption" component="p" sx={{ mb: 1.5 }}>
          チェックしたコンテンツを上から順に繰り返し表示します。保存したあと「配信する」を押すと、店頭の画面に反映されます。
        </Typography>
        <Typography variant="h6" component="h3" sx={{ mb: 0.5 }}>再生する順番（{selected.length} / {DISPLAY_SLIDES_MAX}）</Typography>
        {selected.length ? (
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, mb: 2.5 }}>{selected.map((s, i) => row(s, i))}</Box>
        ) : (
          <Typography variant="body2" sx={{ mb: 2.5, px: 1.5, py: 1.25, borderRadius: 2, bgcolor: tokens.color.warningSoft, color: '#8A5402' }}>
            流すコンテンツがありません。このまま配信すると、店頭の画面には何も表示されません。
          </Typography>
        )}
        {others.length > 0 && (
          <>
            <Typography variant="h6" component="h3" sx={{ mb: 0.5 }}>追加できるコンテンツ</Typography>
            <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>{others.map((s) => row(s, null))}</Box>
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button variant="outlined" onClick={onClose}>キャンセル</Button>
        <Button variant="contained" onClick={() => onSave(ids)}>保存する</Button>
      </DialogActions>
    </Dialog>
  );
}
