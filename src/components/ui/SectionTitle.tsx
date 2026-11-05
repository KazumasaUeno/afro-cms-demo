import { Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

export function SectionTitle({ title, action, icon, sub }: { title: ReactNode; action?: ReactNode; icon?: ReactNode; sub?: ReactNode }) {
  return (
    <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mb: 2, minHeight: 32 }}>
      {/* 狭い幅では見出しを省略せず、補足（sub）を次の行へ回す */}
      <Stack direction="row" alignItems="center" sx={{ minWidth: 0, flexWrap: 'wrap', columnGap: 1, rowGap: 0.25 }}>
        {icon}
        <Typography variant="h4" component="h2" sx={{ minWidth: 0 }}>{title}</Typography>
        {sub}
      </Stack>
      {action}
    </Stack>
  );
}
