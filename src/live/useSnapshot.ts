import { useEffect, useMemo, useState } from 'react';
import type { Unsubscribe } from 'firebase/firestore';
import type { Query } from '@/repositories/types';

/**
 * onSnapshot を Query<T>（repositories/types.ts の決まり）に包む。
 * key が変わったら購読し直し、最初の値が届くまでは loading: true と empty を返す。key が null なら購読しない（loading: false・empty）
 */
export function useSnapshot<T>(
  key: string | null,
  subscribe: (next: (v: T) => void, fail: (e: Error) => void) => Unsubscribe,
  empty: T,
): Query<T> {
  const [state, setState] = useState<{ key: string | null; data: T; error: Error | null } | null>(null);
  useEffect(() => {
    if (key === null) return undefined;
    let alive = true;
    const unsub = subscribe(
      (data) => { if (alive) setState({ key, data, error: null }); },
      (error) => {
        console.warn('snapshot failed', key, error);
        if (alive) setState({ key, data: empty, error });
      },
    );
    return () => {
      alive = false;
      unsub();
    };
    // subscribe・empty は key と一緒に決まる（呼び出し側で毎回作っても購読し直さない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  // 同じ値なら同じオブジェクトを返す（LiveDataProvider の value が描画のたびに変わって全画面が描き直されないように）
  const current = key !== null && state?.key === key ? state : null;
  const data = key === null || !current ? empty : current.data;
  const loading = key !== null && !current;
  const error = current?.error ?? null;
  return useMemo(() => ({ data, loading, error }), [data, loading, error]);
}
