import { motion } from 'motion/react';
import type { CSSProperties, ReactNode } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { tokens } from '@/theme/tokens';

/**
 * カード出現（フェード＋移動。移動は M3 Expressive の spring）。Motion が担当する。
 * ※ 同じ要素を GSAP で動かさないこと（GSAP はステップ演出・タイムラインの内側の要素だけ）。
 */
export function Reveal({ children, delay = 0, y = 16, style }: { children: ReactNode; delay?: number; y?: number; style?: CSSProperties }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduced ? { duration: 0 } : {
        opacity: { duration: tokens.motion.slow, delay, ease: tokens.motion.ease },
        y: { ...tokens.motion.spring.slow, delay },
      }}
      style={{ minWidth: 0, ...style }}
    >
      {children}
    </motion.div>
  );
}
