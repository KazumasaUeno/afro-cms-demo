import { Box, ButtonBase, Dialog, DialogContent, DialogTitle, IconButton, Stack, Typography } from '@mui/material';
import { Check, X } from 'lucide-react';
import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { assetsOf, assetSrc } from '@/data/assets';
import { areaOf } from '@/components/layout/nav';
import { useDemo } from '@/store/DemoStore';
import { tokens } from '@/theme/tokens';
import { useFullScreenDialog } from '@/hooks/useMediaQueries';

interface Props {
  open: boolean;
  title?: string;
  selected?: string;
  onClose: () => void;
  onPick: (img: { src: string; label: string }) => void;
}

/** 素材ドライブ（選んでいる案件の画像。0.36.0。以前は固定のデモ画像）から選ぶ。管理（アップロード・削除）は開発者画面の素材ドライブ */
export function ImagePickerDialog({ open, title = '画像を挿入', selected, onClose, onPick }: Props) {
  const fullScreen = useFullScreenDialog();
  const { state } = useDemo();
  const dev = areaOf(useLocation().pathname) === 'dev';
  const images = useMemo(
    () => assetsOf(state).items.flatMap((a) => {
      const src = a.kind === 'image' ? assetSrc(a) : undefined;
      return src ? [{ id: a.id, label: a.name, src }] : [];
    }),
    [state],
  );
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth fullScreen={fullScreen} aria-labelledby="img-picker-title">
      <DialogTitle id="img-picker-title" sx={{ pr: 6 }}>
        {title}
        <Typography variant="caption" sx={{ display: 'block' }}>素材ドライブの画像から選択します{dev ? '（追加・削除はプロジェクトの「素材ドライブ」で行います）' : '（画像の追加はアフロの担当者が行います）'}</Typography>
        <IconButton onClick={onClose} aria-label="閉じる" sx={{ position: 'absolute', right: 12, top: 12 }}><X size={18} /></IconButton>
      </DialogTitle>
      <DialogContent>
        {images.length === 0 && <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>素材ドライブに画像がありません。</Typography>}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(2, 1fr)' }, gap: 1.5, pb: 1 }}>
          {images.map((img) => {
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
