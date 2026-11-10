import { Box } from '@mui/material';
import type { ReactNode } from 'react';
import { tokens } from '@/theme/tokens';

export type PillTone = 'neutral' | 'primary' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

const TONES: Record<PillTone, { bg: string; fg: string }> = {
  neutral: { bg: tokens.color.bgSubtle, fg: tokens.color.inkSoft },
  primary: { bg: tokens.color.primarySoft, fg: tokens.color.primary },
  accent: { bg: tokens.color.accentSoft, fg: tokens.color.accentInk },
  success: { bg: tokens.color.successSoft, fg: tokens.color.successInk },
  warning: { bg: tokens.color.warningSoft, fg: tokens.color.warningInk },
  danger: { bg: tokens.color.dangerSoft, fg: tokens.color.dangerInk },
  info: { bg: tokens.color.infoSoft, fg: tokens.color.infoInk },
};

/** 状態表示。色＋文字で伝える（色だけに頼らない） */
export function StatusPill({ tone = 'neutral', children, dot = true, icon }: { tone?: PillTone; children: ReactNode; dot?: boolean; icon?: ReactNode }) {
  const c = TONES[tone];
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex', alignItems: 'center', gap: 0.75, px: 1, height: 24, borderRadius: '8px',
        bgcolor: c.bg, color: c.fg, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', lineHeight: 1, flexShrink: 0,
      }}
    >
      {icon ?? (dot && <Box component="span" sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'currentColor' }} />)}
      {children}
    </Box>
  );
}
