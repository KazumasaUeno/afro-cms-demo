import { Box, type BoxProps } from '@mui/material';
import { forwardRef } from 'react';
import { tokens } from '@/theme/tokens';

export interface SurfaceProps extends BoxProps {
  /** ホバーで浮く（クリックできるカード） */
  interactive?: boolean;
  padding?: BoxProps['p'];
  tone?: 'default' | 'muted' | 'ink';
}

/** すべてのカードの土台。M3 Outlined card（outlineVariant の罫線＋角丸 Medium 12px）。クリックできるカードはホバーで Level1 に上がる */
export const Surface = forwardRef<HTMLDivElement, SurfaceProps>(function Surface(
  { interactive, padding = { xs: 2, md: 2.5 }, tone = 'default', sx, children, ...rest },
  ref,
) {
  const bg = tone === 'muted' ? tokens.color.surfaceContainerHighest : tone === 'ink' ? tokens.color.inverseSurface : tokens.color.surfaceContainerLowest;
  return (
    <Box
      ref={ref}
      sx={[
        {
          position: 'relative', bgcolor: bg, color: tone === 'ink' ? tokens.color.inverseOnSurface : undefined,
          border: `1px solid ${tone === 'default' ? tokens.color.outlineVariant : 'transparent'}`,
          borderRadius: `${tokens.radius.lg}px`, boxShadow: tokens.shadow.xs, p: padding, minWidth: 0,
        },
        !!interactive && {
          cursor: 'pointer',
          transition: `box-shadow .2s ${tokens.motion.easeCss}, background-color .2s`,
          '&:hover': { boxShadow: tokens.shadow.sm },
          '&:active': { boxShadow: 'none' },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      {...rest}
    >
      {children}
    </Box>
  );
});
