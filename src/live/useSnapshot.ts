import { useEffect, useMemo, useState } from 'react';
import type { Unsubscribe } from 'firebase/firestore';
import type { Query } from '@/repositories/types';

/**
 * onSnapshot を Query<T>（repositories/types.ts の決まり）に包む。
 * key が変わったら購読し直し、最初の値が届くまでは loading: true と empty を返す。key が null なら購読しない（loading: false・empty）。
 * keep: 前の値を出し続けてよい範囲（同じ keep のまま key だけ変わったら、新しい値が届くまで前の値を data に出す。loading は true）。
 *   相談の「前のメッセージを読む」（件数だけ変えて購読し直す）で、読み込み中に会話が消えて空の表示がちらつかないように（U3 レビュー Major-1）。
 *   別の対象（別の案件）では keep を変える（前の案件の値を出さない）
 */
export function useSnapshot<T>(
  key: string | null,
  subscribe: (next: (v: T) => void, fail: (e: Error) => void) => Unsubscribe,
  empty: T,
  keep?: string,
): Query<T> {
  const [state, setState] = useState<{ key: string | null; keep: string | undefined; data: T; error: Error | null } | null>(null);
  useEffect(() => {
    if (key === null) return undefined;
    let alive = true;
    const unsub = subscribe(
      (data) => { if (alive) setState({ key, keep, data, error: null }); },
      (error) => {
        console.warn('snapshot failed', key, error);
        if (alive) setState({ key, keep, data: empty, error });
      },
    );
    return () => {
      alive = false;
      unsub();
    };
    // subscribe・empty・keep は key と一緒に決まる（呼び出し側で毎回作っても購読し直さない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const { data, loading, error } = snapshotView(state, key, keep, empty);
  // 同じ値なら同じオブジェクトを返す（LiveDataProvider の value が描画のたびに変わって全画面が描き直されないように）
  return useMemo(() => ({ data, loading, error }), [data, loading, error]);
}

/** いま出す値（tests/unit/useSnapshotView.test.mjs）。届いた値の key が今の key と違えば loading。keep が同じで失敗していなければ前の値を出す */
export function snapshotView<T>(
  state: { key: string | null; keep: string | undefined; data: T; error: Error | null } | null,
  key: string | null,
  keep: string | undefined,
  empty: T,
): Query<T> {
  if (key === null) return { data: empty, loading: false, error: null };
  if (state?.key === key) return { data: state.data, loading: false, error: state.error };
  const previous = keep !== undefined && state && state.keep === keep && !state.error ? state : null;
  return { data: previous ? previous.data : empty, loading: true, error: null };
}
