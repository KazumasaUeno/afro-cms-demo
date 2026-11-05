import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';

interface Props {
  value: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
}

/** 数値のカウントアップ（rAF。アンマウント時に必ず止める） */
export function CountUp({ value, duration = 900, decimals = 0, prefix = '', suffix = '' }: Props) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced ? value : 0);
  const from = useRef(0);

  useEffect(() => {
    if (reduced) {
      setShown(value);
      from.current = value;
      return;
    }
    let raf = 0;
    const start = performance.now();
    const origin = from.current;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 4);
      setShown(origin + (value - origin) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      from.current = value;
    };
  }, [value, duration, reduced]);

  const fmt = (n: number) => n.toLocaleString('ja-JP', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return (
    <span style={{ fontVariantNumeric: 'tabular-nums' }} role="text" aria-label={`${prefix}${fmt(value)}${suffix}`}>
      <span aria-hidden>{prefix}{fmt(shown)}{suffix}</span>
    </span>
  );
}
