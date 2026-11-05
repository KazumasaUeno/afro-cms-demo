import { Box, type BoxProps } from '@mui/material';
import { forwardRef } from 'react';
import { tokens } from '@/theme/tokens';

export interface SurfaceProps extends BoxProps {
  /** ホバーで浮く（クリックできるカード） */
  interactive?: boolean;
  padding?: BoxProps['p'];
  tone?: 'default' | 'muted' | 'ink';
}

/** すべてのカードの土台。罫線＋控えめな影＋18px 角丸 */
export const Surface = forwardRef<HTMLDivElement, SurfaceProps>(function Surface(
  { interactive, padding = { xs: 2, md: 2.5 }, tone = 'default', sx, children, ...rest },
  ref,
) {
  const bg = tone === 'muted' ? tokens.color.surfaceMuted : tone === 'ink' ? tokens.color.ink : tokens.color.surface;
  return (
    <Box
      ref={ref}
      sx={[
        {
          position: 'relative', bgcolor: bg, color: tone === 'ink' ? '#fff' : undefined,
          border: `1px solid ${tone === 'ink' ? 'transparent' : tokens.color.border}`,
          borderRadius: `${tokens.radius.lg}px`, boxShadow: tokens.shadow.xs, p: padding, minWidth: 0,
        },
        !!interactive && {
          cursor: 'pointer',
          transition: `transform .24s ${tokens.motion.easeCss}, box-shadow .24s ${tokens.motion.easeCss}, border-color .24s`,
          '&:hover': { transform: 'translateY(-2px)', boxShadow: tokens.shadow.md, borderColor: tokens.color.borderStrong },
          '&:active': { transform: 'translateY(0)' },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      {...rest}
    >
      {children}
    </Box>
  );
});
