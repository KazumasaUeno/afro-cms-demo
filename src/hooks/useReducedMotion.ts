import { useEffect, useState } from 'react';
import { useDemo } from '@/store/DemoStore';

const QUERY = '(prefers-reduced-motion: reduce)';

function systemPrefersReduced(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(QUERY).matches;
}

/**
 * 動きを減らすべきか。OS 設定（prefers-reduced-motion）と、設定画面の手動切替の両方を見る。
 * GSAP・Motion・カウントアップはすべてこのフックで判定する。
 */
export function useReducedMotion(): boolean {
  const { state } = useDemo();
  const [system, setSystem] = useState(systemPrefersReduced);

  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(QUERY);
    const on = () => setSystem(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const pref = state.settings.reducedMotion;
  return pref === 'on' ? true : pref === 'off' ? false : system;
}
