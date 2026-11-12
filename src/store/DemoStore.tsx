import { createContext, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import type { DemoState } from '@/types';
import { loadJson, removeKey, saveJson, STORAGE_KEY } from '@/services/storage';
import { createSeedState, isDemoState } from './seed';
import { reducer, type Action } from './reducer';
import { syncDemoProject } from './demoProject';
import { moveDesignAnswers } from '@/features/design/designReq';

interface StoreValue {
  state: DemoState;
  dispatch: React.Dispatch<Action>;
  resetDemo: () => void;
  /** いまの状態をすぐに保存する（「保存」ボタン用）。保存できたら true（プライベートモード・容量超過では false） */
  flush: () => boolean;
}

const StoreContext = createContext<StoreValue | null>(null);

/**
 * 受託開発ではアフロがヒアリングして全問を入力する（2026-11-10 決定）。
 * 0.17 までの保存データには「共同」「お客様が入力」が残っているので、読み込み時にアフロの入力にそろえる。
 * 分担の仕組み（features/requirements/assignment.ts）は将来の Web 版のために残し、画面からは切り替えない
 */
function withAfroMode(state: DemoState): DemoState {
  return state.requirements.mode === 'afro' ? state : { ...state, requirements: { ...state.requirements, mode: 'afro' } };
}

function init(): DemoState {
  // 保存済みのデータに古い進捗が残っていても、デモのデータに合わせ直す。
  // 0.27 までのヒアリングにあったデザインの 3 問の回答は、デザイン要件定義へ移す（0.28.0。版は上げない）
  return syncDemoProject(moveDesignAnswers(withAfroMode(loadJson(STORAGE_KEY, isDemoState) ?? createSeedState())));
}

export function DemoStoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, init);
  const timer = useRef<number | undefined>(undefined);

  // 書き込みはまとめて行う（ドラッグ中などの連続更新で localStorage を叩きすぎない）
  useEffect(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => saveJson(STORAGE_KEY, state), 250);
    return () => window.clearTimeout(timer.current);
  }, [state]);

  // 250ms 以内にタブを閉じた・再読み込みした場合も、最後の操作を失わない
  const latest = useRef(state);
  latest.current = state;
  useEffect(() => {
    const flush = () => saveJson(STORAGE_KEY, latest.current);
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);

  const value = useMemo<StoreValue>(
    () => ({
      state,
      dispatch,
      resetDemo: () => {
        removeKey(STORAGE_KEY);
        dispatch({ type: 'reset' });
      },
      flush: () => saveJson(STORAGE_KEY, latest.current),
    }),
    [state],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

/** DemoStoreProvider の外（live モード）では null。モードに関係なく使う部品（動きを減らす設定など）だけが使う */
export function useDemoOptional(): StoreValue | null {
  return useContext(StoreContext);
}

export function useDemo(): StoreValue {
  const v = useContext(StoreContext);
  if (!v) throw new Error('useDemo must be used inside DemoStoreProvider');
  return v;
}

export { clientAccountsState, currentProject, devAccessState, devProjectsState, devState, signageState } from './reducer';
export { devUsersState } from '@/data/people';
