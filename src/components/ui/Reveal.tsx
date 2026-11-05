import { motion } from 'motion/react';
import type { CSSProperties, ReactNode } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { tokens } from '@/theme/tokens';

/**
 * カード出現（フェード＋移動）。Motion が担当する。
 * ※ 同じ要素を GSAP で動かさないこと（GSAP はステップ演出・タイムラインの内側の要素だけ）。
 */
export function Reveal({ children, delay = 0, y = 10, style }: { children: ReactNode; delay?: number; y?: number; style?: CSSProperties }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: tokens.motion.slow, delay: reduced ? 0 : delay, ease: tokens.motion.ease }}
      style={{ minWidth: 0, ...style }}
    >
      {children}
    </motion.div>
  );
}
