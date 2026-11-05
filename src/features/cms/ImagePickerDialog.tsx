import { Box, ButtonBase, Dialog, DialogContent, DialogTitle, IconButton, Stack, Typography } from '@mui/material';
import { Check, X } from 'lucide-react';
import { DEMO_IMAGES } from '@/data/cms';
import { tokens } from '@/theme/tokens';

interface Props {
  open: boolean;
  title?: string;
  selected?: string;
  onClose: () => void;
  onPick: (img: { src: string; label: string }) => void;
}

/** 素材ライブラリ（デモ画像）から選ぶ */
export function ImagePickerDialog({ open, title = '画像を挿入', selected, onClose, onPick }: Props) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth aria-labelledby="img-picker-title">
      <DialogTitle id="img-picker-title" sx={{ pr: 6 }}>
        {title}
        <Typography variant="caption" sx={{ display: 'block' }}>素材ライブラリ（デモ画像）から選択します</Typography>
        <IconButton onClick={onClose} aria-label="閉じる" sx={{ position: 'absolute', right: 12, top: 12 }}><X size={18} /></IconButton>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(2, 1fr)' }, gap: 1.5, pb: 1 }}>
          {DEMO_IMAGES.map((img) => {
            const active = selected === img.src;
            return (
              <ButtonBase
                key={img.id}
                onClick={() => onPick(img)}
                aria-label={`${img.label}を選ぶ`}
                aria-pressed={active}
                sx={{
                  display: 'block', borderRadius: '14px', overflow: 'hidden', textAlign: 'left', position: 'relative',
                  border: `2px solid ${active ? tokens.color.primary : 'transparent'}`,
                  boxShadow: tokens.shadow.xs, transition: 'transform .2s, box-shadow .2s',
                  '&:hover': { transform: 'translateY(-2px)', boxShadow: tokens.shadow.md },
                }}
              >
                <Box component="img" src={img.src} alt="" sx={{ display: 'block', width: '100%', aspectRatio: '16/9', objectFit: 'cover' }} />
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 1.25, py: 1, bgcolor: tokens.color.surface }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{img.label}</Typography>
                  {active && <Check size={16} color={tokens.color.primary} />}
                </Stack>
              </ButtonBase>
            );
          })}
        </Box>
      </DialogContent>
    </Dialog>
  );
}
