import { Box } from '@mui/material';
import { useId } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * AI アシスタントのアバター。アフロ（緑 → 黄 → 赤のグラデーションの髪）と、笑顔の顔。
 * 会社のアイコンのモチーフを、26〜44px でも読める正面向きの形に描き直したもの（画像ファイルは使わない）。
 * - talking: 回答を作っている間、口を動かす
 * - 時々まばたきする。動きを減らす設定では動かさない
 */

const INK = '#2B2118';
const HAIR = ['#4E9A3A', '#F2B630', '#E5532D'] as const;
/** 髪のかたまり（cx, cy, r）。外側の線 → 塗りの順に重ねて、内側の線を消す */
const PUFFS: [number, number, number][] = [
  [16, 26, 10], [21, 15.5, 10], [32, 11, 10.5], [43, 15.5, 10], [48, 26, 10], [12, 36, 7.5], [52, 36, 7.5], [32, 20, 10],
];

export function AssistantAvatar({ size = 32, talking = false }: { size?: number; talking?: boolean }) {
  const reduced = useReducedMotion();
  const id = useId().replace(/:/g, '');
  const animate = !reduced;
  return (
    <Box
      component="svg"
      viewBox="0 0 64 64"
      aria-hidden
      sx={{
        width: size, height: size, flexShrink: 0, display: 'block', borderRadius: '50%', bgcolor: '#FBF3E6',
        '& .pa-eye': { transformBox: 'fill-box', transformOrigin: 'center', animation: animate ? 'pa-blink 4.8s infinite' : 'none' },
        '& .pa-mouth-talk': { transformBox: 'fill-box', transformOrigin: 'center top', animation: animate && talking ? 'pa-talk .32s infinite alternate ease-in-out' : 'none' },
        '@keyframes pa-blink': { '0%, 92%, 100%': { transform: 'scaleY(1)' }, '95%': { transform: 'scaleY(0.1)' } },
        '@keyframes pa-talk': { from: { transform: 'scaleY(0.35)' }, to: { transform: 'scaleY(1)' } },
      }}
    >
      <defs>
        {/* 髪全体で 1 本のグラデーション（円ごとに付けると縞になる） */}
        <linearGradient id={`hair-${id}`} gradientUnits="userSpaceOnUse" x1="6" y1="0" x2="58" y2="0">
          <stop offset="0" stopColor={HAIR[0]} />
          <stop offset="0.5" stopColor={HAIR[1]} />
          <stop offset="1" stopColor={HAIR[2]} />
        </linearGradient>
      </defs>
      {/* 丸い背景に髪の上端が切れないよう、全体を少し縮めて下げる */}
      <g transform="translate(32 35) scale(0.86) translate(-32 -33)">
      {/* 髪: 線 → 塗り */}
      {PUFFS.map(([cx, cy, r]) => <circle key={`o${cx}${cy}`} cx={cx} cy={cy} r={r + 1.6} fill={INK} />)}
      {PUFFS.map(([cx, cy, r]) => <circle key={`f${cx}${cy}`} cx={cx} cy={cy} r={r} fill={`url(#hair-${id})`} />)}
      {/* 耳と顔 */}
      <circle cx="18.5" cy="43" r="3.4" fill={INK} />
      <circle cx="45.5" cy="43" r="3.4" fill={INK} />
      <ellipse cx="32" cy="42.5" rx="13" ry="13.5" fill={INK} />
      {/* 目 */}
      <ellipse className="pa-eye" cx="27" cy="40" rx="2.1" ry="3" fill="#fff" />
      <ellipse className="pa-eye" cx="37" cy="40" rx="2.1" ry="3" fill="#fff" />
      {/* 口: 話している間は開いた口、ふだんは笑顔 */}
      {talking
        ? <ellipse className="pa-mouth-talk" cx="32" cy="48.5" rx="3.6" ry="2.8" fill="#fff" />
        : <path d="M27 46.5 Q32 52.5 37 46.5 Z" fill="#fff" />}
      </g>
    </Box>
  );
}
