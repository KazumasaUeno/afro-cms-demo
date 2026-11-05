import type { CSSProperties } from 'react';
import type { DesignId } from '@/types';

export type Device = 'pc' | 'tablet' | 'phone';
export const DEVICE_WIDTH: Record<Device, number> = { pc: 1280, tablet: 820, phone: 390 };
export const DEVICE_HEIGHT: Record<Device, number> = { pc: 800, tablet: 1100, phone: 844 };

export interface PreviewProps {
  device: Device;
  /** 動きのある装飾（マーキー等）を止める */
  still?: boolean;
}

export const SERIF = '"Noto Serif JP", "Yu Mincho", "Hiragino Mincho ProN", serif';
export const SANS = '"Inter Variable", "Noto Sans JP", system-ui, sans-serif';

/** 外部画像を使わない、CSS/SVG だけのイラスト（コーヒー豆の袋） */
export function BagArt({ bg, bag, label, style }: { bg: string; bag: string; label: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 400 480" style={{ width: '100%', height: '100%', display: 'block', ...style }} aria-hidden>
      <rect width="400" height="480" fill={bg} />
      <ellipse cx="200" cy="420" rx="120" ry="16" fill="#000" opacity=".08" />
      <path d="M120 120 L280 120 L300 410 L100 410 Z" fill={bag} />
      <path d="M120 120 L280 120 L272 150 L128 150 Z" fill="#000" opacity=".12" />
      <rect x="150" y="220" width="100" height="120" rx="4" fill="#fff" opacity=".92" />
      <text x="200" y="268" textAnchor="middle" fontFamily="serif" fontSize="22" fill="#1c1c1c">{label}</text>
      <text x="200" y="300" textAnchor="middle" fontFamily="sans-serif" fontSize="10" letterSpacing="3" fill="#777">MINAMO</text>
    </svg>
  );
}

export function CupArt({ bg, cup, style }: { bg: string; cup: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 400 300" style={{ width: '100%', height: '100%', display: 'block', ...style }} preserveAspectRatio="xMidYMid slice" aria-hidden>
      <rect width="400" height="300" fill={bg} />
      <ellipse cx="200" cy="230" rx="130" ry="22" fill="#000" opacity=".12" />
      <path d="M120 120 h160 l-14 100 a20 20 0 0 1 -20 16 h-92 a20 20 0 0 1 -20 -16 z" fill={cup} />
      <path d="M280 140 a28 28 0 0 1 0 56" stroke={cup} strokeWidth="12" fill="none" />
      <ellipse cx="200" cy="122" rx="80" ry="10" fill="#5b3a1e" />
      <path d="M180 90 q10 -20 0 -40 M210 95 q10 -22 0 -44" stroke="#fff" strokeOpacity=".5" strokeWidth="4" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export const PREVIEW_ORDER: DesignId[] = ['minimal', 'creative', 'premium'];
