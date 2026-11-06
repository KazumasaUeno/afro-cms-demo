import { Box, type BoxProps } from '@mui/material';
import type { ReactNode } from 'react';
import { tokens } from '@/theme/tokens';

const SIZES = {
  lg: { fontSize: 22, fontWeight: 700 },
  md: { fontSize: 14, fontWeight: 600 },
  sm: { fontSize: 12, fontWeight: 500, color: tokens.color.muted },
} as const;

/**
 * 技術的な識別子（バージョン・URL・ホスト名・日時）を等幅で示す。開発者画面だけの小部品。
 * 本文・見出し・ボタン文言には使わない。
 */
export function DevMono({ size = 'md', children, sx, ...rest }: { size?: keyof typeof SIZES; children: ReactNode } & Omit<BoxProps, 'children'>) {
  return (
    <Box
      component="span"
      sx={[{ fontFamily: tokens.font.mono, fontVariantNumeric: 'tabular-nums', letterSpacing: 0, lineHeight: 1.35, ...SIZES[size] }, ...(Array.isArray(sx) ? sx : [sx])]}
      {...rest}
    >
      {children}
    </Box>
  );
}
