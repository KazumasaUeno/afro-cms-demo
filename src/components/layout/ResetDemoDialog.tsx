import { Button, Dialog, DialogActions, DialogContent, Stack, Typography, Box } from '@mui/material';
import { RotateCcw } from 'lucide-react';
import { useDemo } from '@/store/DemoStore';
import { useToast } from '@/hooks/useToast';
import { tokens } from '@/theme/tokens';

/** デモの初期化（確認つき。ブラウザの confirm は使わない） */
export function ResetDemoDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone?: () => void }) {
  const { resetDemo } = useDemo();
  const toast = useToast();
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth aria-labelledby="reset-title">
      <DialogContent sx={{ pt: 3 }}>
        <Stack spacing={2}>
          <Box sx={{ width: 44, height: 44, borderRadius: 3, bgcolor: tokens.color.warningSoft, color: tokens.color.warning, display: 'grid', placeItems: 'center' }}>
            <RotateCcw size={22} />
          </Box>
          <Typography id="reset-title" variant="h3">デモを初期状態に戻しますか？</Typography>
          <Typography variant="body2" color="text.secondary">
            入力した回答・サイトマップの編集・品質チェック・CMS のページ・診断履歴がすべて最初の状態に戻ります。
            このブラウザに保存されたデモデータだけが対象です。
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
        <Button variant="outlined" onClick={onClose}>キャンセル</Button>
        <Button
          variant="contained"
          color="warning"
          onClick={() => {
            resetDemo();
            onClose();
            toast('デモデータを初期化しました', 'info');
            onDone?.();
          }}
        >
          初期化する
        </Button>
      </DialogActions>
    </Dialog>
  );
}
