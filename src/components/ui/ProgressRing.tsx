import { Box } from '@mui/material';
import type { ReactNode } from 'react';
import { tokens } from '@/theme/tokens';

interface Props {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  children?: ReactNode;
  label?: string;
}

/** 円形の進捗。値の変化は CSS transition で滑らかにする */
export function ProgressRing({ value, size = 56, stroke = 6, color = tokens.color.primary, track = tokens.color.bgSubtle, children, label }: Props) {
  const r = (size - stroke) / 2;
  const len = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <Box
      role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-label={label}
      sx={{ position: 'relative', width: size, height: size, flexShrink: 0 }}
    >
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', display: 'block' }} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={len} strokeDashoffset={len * (1 - v / 100)}
          style={{ transition: `stroke-dashoffset .6s ${tokens.motion.easeCss}` }}
        />
      </svg>
      <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: size > 70 ? 18 : 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
        {children ?? `${Math.round(v)}%`}
      </Box>
    </Box>
  );
}
