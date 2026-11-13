import { Box, Button, Stack, Typography } from '@mui/material';
import { ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { tokens } from '@/theme/tokens';
import { Surface } from './Surface';

/**
 * 「まだ使えません」の案内（案件の段階がその画面より前のとき）。インサイトの案内（0.29）と同じ見た目を、
 * ページ編集・公開承認・サイネージ・レポートでも使うために部品にした（0.30.0。2026-11-13 ユーザー指示）。
 * 行き先（ボタン）は呼び出し側が決める（お客様ポータルはホーム、管理者・開発者はプロジェクト詳細）
 */
export function NotYetPanel({ icon, title, description, actionLabel, onAction }: {
  icon: ReactNode;
  title: ReactNode;
  description: ReactNode;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <Surface padding={{ xs: 3, md: 5 }} sx={{ textAlign: 'center' }}>
      <Stack alignItems="center" spacing={1.5}>
        <Box aria-hidden sx={{ display: 'grid', placeItems: 'center', width: 56, height: 56, borderRadius: '50%', bgcolor: tokens.color.surfaceMuted, color: tokens.color.inkSoft }}>
          {icon}
        </Box>
        <Typography variant="h5" component="h2">{title}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 460 }}>{description}</Typography>
        <Button variant="contained" endIcon={<ArrowUpRight size={16} />} onClick={onAction} sx={{ mt: 1 }}>
          {actionLabel}
        </Button>
      </Stack>
    </Surface>
  );
}
