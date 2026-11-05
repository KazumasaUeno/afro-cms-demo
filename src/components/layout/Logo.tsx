import { Box, Stack, Typography } from '@mui/material';
import { tokens } from '@/theme/tokens';

export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <Box component="svg" viewBox="0 0 32 32" sx={{ width: size, height: size, flexShrink: 0, display: 'block' }} aria-hidden>
      <rect width="32" height="32" rx="9" fill={tokens.color.navy} />
      <circle cx="16" cy="14" r="6.5" fill="none" stroke="#fff" strokeWidth="2.4" />
      <circle cx="10.5" cy="9.5" r="3.2" fill="#8B7CF6" />
      <circle cx="21.5" cy="9.5" r="3.2" fill="#4F7CFF" />
      <path d="M10.5 25h11" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
    </Box>
  );
}

export function Logo({ collapsed }: { collapsed?: boolean }) {
  return (
    <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0 }}>
      <LogoMark />
      {!collapsed && (
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 750, fontSize: 15, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
            アフロ<Box component="span" sx={{ color: tokens.color.primary }}>CMS</Box>
          </Typography>
          <Typography sx={{ fontSize: 10.5, color: tokens.color.muted, letterSpacing: '0.04em', lineHeight: 1.3 }}>AI Web Production</Typography>
        </Box>
      )}
    </Stack>
  );
}
