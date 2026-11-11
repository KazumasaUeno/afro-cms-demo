import { Box, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { tokens } from '@/theme/tokens';

interface Props {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
}

export function PageHeader({ eyebrow, title, description, actions, icon }: Props) {
  return (
    <Stack
      direction={{ xs: 'column', md: 'row' }}
      spacing={2}
      alignItems={{ xs: 'flex-start', md: 'flex-end' }}
      justifyContent="space-between"
      sx={{ mb: { xs: 3, md: 4 } }}
    >
      <Box sx={{ minWidth: 0 }}>
        {eyebrow && (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1, color: tokens.color.primary }}>
            {icon}
            <Typography variant="overline" sx={{ color: 'inherit' }}>{eyebrow}</Typography>
          </Stack>
        )}
        {/* M3 Expressive: 画面の見出しは md 以上で Display small（36/44） */}
        <Typography variant="h1" component="h1" sx={{ fontSize: { md: '2.25rem' }, lineHeight: { md: 1.22 } }}>{title}</Typography>
        {description && <Typography variant="subtitle1" sx={{ mt: 1, maxWidth: 680 }}>{description}</Typography>}
      </Box>
      {actions && (
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
          {actions}
        </Stack>
      )}
    </Stack>
  );
}
