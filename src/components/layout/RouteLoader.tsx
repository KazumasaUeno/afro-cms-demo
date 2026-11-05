import { Box, Stack, Typography } from '@mui/material';
import { keyframes } from '@emotion/react';
import { tokens } from '@/theme/tokens';
import { LogoMark } from './Logo';

const slide = keyframes`
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(250%); }
`;
const pulse = keyframes`
  0%, 100% { transform: scale(1); }
  50%      { transform: scale(1.06); }
`;

/**
 * ページ移動時のローディング画面（内容エリアだけを覆う）。
 * 動きは CSS keyframes のみ（GSAP / Motion とは別の要素）。reduced motion では止める。
 */
export function RouteLoader({ label, reduced }: { label?: string; reduced?: boolean }) {
  return (
    <Stack
      role="status"
      aria-live="polite"
      aria-label={label ? `${label}を読み込み中` : '読み込み中'}
      alignItems="center"
      justifyContent="center"
      spacing={2.5}
      sx={{ minHeight: { xs: 'calc(100dvh - 220px)', md: 'calc(100dvh - 180px)' }, py: 6, textAlign: 'center' }}
    >
      <Box sx={{ animation: reduced ? 'none' : `${pulse} 1.2s ${tokens.motion.easeCss} infinite` }}>
        <LogoMark size={52} />
      </Box>
      <Box>
        <Typography variant="overline" sx={{ display: 'block', color: tokens.color.primary }}>Loading</Typography>
        <Typography variant="h4" component="p">{label ?? 'アフロCMS'}</Typography>
      </Box>
      <Box sx={{ width: 180, height: 4, borderRadius: 99, bgcolor: tokens.color.bgSubtle, overflow: 'hidden', position: 'relative' }} aria-hidden>
        <Box
          sx={{
            position: 'absolute', inset: 0, width: '40%', borderRadius: 99, background: tokens.aiGradient,
            animation: reduced ? 'none' : `${slide} 0.9s ${tokens.motion.easeCss} infinite`,
            ...(reduced && { width: '100%', opacity: 0.6 }),
          }}
        />
      </Box>
    </Stack>
  );
}
