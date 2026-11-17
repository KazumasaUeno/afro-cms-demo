import { Box, Button, ButtonBase, Chip, CircularProgress, Dialog, DialogContent, DialogTitle, IconButton, Stack, Typography } from '@mui/material';
import { Check, Upload, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { PageType } from '@/types';
import { assetsOf, assetSrc, IMAGE_MIMES } from '@/data/assets';
import { assetFolderList } from '@/data/assetFolders';
import { areaOf } from '@/components/layout/nav';
import { useDemo } from '@/store/DemoStore';
import { tokens } from '@/theme/tokens';
import { useFullScreenDialog } from '@/hooks/useMediaQueries';
import { useDevUser } from '@/features/dev/useDevUser';
import { useAssetUpload } from '@/features/assets/useAssetUpload';

interface Props {
  open: boolean;
  title?: string;
  selected?: string;
  /** 編集中のページの種類（アップロード先のカテゴリーの既定に使う。お知らせ → 「お知らせ」） */
  pageType?: PageType;
  onClose: () => void;
  onPick: (img: { src: string; label: string }) => void;
}

const ALL = '__all__';
/** カテゴリーを選ばずにアップロードしたときの入れ先（2026-11-17 会議） */
const defaultFolder = (t?: PageType) => (t === 'news' ? 'お知らせ' : 'ページ');

/**
 * 素材ドライブ（選んでいる案件の画像。0.36.0。以前は固定のデモ画像）から選ぶ。
 * 2026-11-17 会議: メディアライブラリのように、ここから画像をアップロードして（素材ドライブの画面と同じ検査・同じ保存先。useAssetUpload）そのまま選べる。
 * アップロードは開発者画面とお客様ポータルだけ（管理者画面は見るだけ）。削除・名前の変更は開発者画面の素材ドライブ
 */
export function ImagePickerDialog({ open, title = '画像を挿入', selected, pageType, onClose, onPick }: Props) {
  const fullScreen = useFullScreenDialog();
  const { state } = useDemo();
  const area = areaOf(useLocation().pathname);
  const me = useDevUser();
  const canUpload = area !== 'admin';
  const { upload, busy } = useAssetUpload(area === 'dev' ? { devBy: me.id } : { by: 'client' }, { imagesOnly: true });
  const fileRef = useRef<HTMLInputElement>(null);
  const [folder, setFolder] = useState(ALL);
  const drive = assetsOf(state);
  const images = useMemo(
    () => drive.items.flatMap((a) => {
      const src = a.kind === 'image' ? assetSrc(a) : undefined;
      return src ? [{ id: a.id, label: a.name, src, folder: a.folder }] : [];
    }),
    [drive],
  );
  // 画像の入っているカテゴリーだけ絞り込みに出す
  const folders = useMemo(() => assetFolderList(drive).filter((f) => images.some((i) => i.folder === f)), [drive, images]);
  const shown = folder === ALL ? images : images.filter((i) => i.folder === folder);
  const into = folder === ALL ? defaultFolder(pageType) : folder;

  const onFile = async (file: File) => {
    const img = await upload(file, into);
    if (img) onPick(img);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth fullScreen={fullScreen} aria-labelledby="img-picker-title">
      <DialogTitle id="img-picker-title" sx={{ pr: 6 }}>
        {title}
        <Typography variant="caption" sx={{ display: 'block' }}>
          {canUpload ? '素材ドライブの画像から選ぶか、お手元の画像をアップロードして使います' : '素材ドライブの画像から選択します（追加・削除は開発者画面の「素材ドライブ」で行います）'}
        </Typography>
        <IconButton onClick={onClose} aria-label="閉じる" sx={{ position: 'absolute', right: 12, top: 12 }}><X size={18} /></IconButton>
      </DialogTitle>
      <DialogContent>
        {canUpload && (
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} sx={{ mb: 2 }}>
            <input ref={fileRef} type="file" accept={IMAGE_MIMES.join(',')} hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void onFile(f); }} />
            <Button variant="contained" startIcon={busy ? <CircularProgress size={15} color="inherit" /> : <Upload size={16} />} disabled={busy} onClick={() => fileRef.current?.click()} sx={{ flexShrink: 0 }}>
              {busy ? '縮小しています…' : '画像をアップロード'}
            </Button>
            <Typography variant="caption">PNG・JPEG・WebP・GIF（10MB まで）。素材ドライブの「{into}」に入ります</Typography>
          </Stack>
        )}
        {folders.length > 1 && (
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1, mb: 1.5 }} role="group" aria-label="カテゴリー">
            {[ALL, ...folders].map((f) => (
              <Chip key={f} size="small" label={f === ALL ? 'すべて' : f} onClick={() => setFolder(f)} color={folder === f ? 'primary' : 'default'} variant={folder === f ? 'filled' : 'outlined'} aria-pressed={folder === f} />
            ))}
          </Stack>
        )}
        {shown.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
            {canUpload ? '画像がありません。「画像をアップロード」から追加できます。' : '素材ドライブに画像がありません。'}
          </Typography>
        )}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(2, 1fr)' }, gap: 1.5, pb: 1 }}>
          {shown.map((img) => {
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
                  <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 0 }} noWrap>{img.label}</Typography>
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
