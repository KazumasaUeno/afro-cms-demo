import { Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

export function SectionTitle({ title, action, icon, sub }: { title: ReactNode; action?: ReactNode; icon?: ReactNode; sub?: ReactNode }) {
  return (
    <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mb: 2, minHeight: 32 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0 }}>
        {icon}
        <Typography variant="h4" component="h2" noWrap>{title}</Typography>
        {sub}
      </Stack>
      {action}
    </Stack>
  );
}
