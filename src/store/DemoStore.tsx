import { createContext, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import type { DemoState } from '@/types';
import { loadJson, removeKey, saveJson, STORAGE_KEY } from '@/services/storage';
import { createSeedState, isDemoState } from './seed';
import { reducer, type Action } from './reducer';

interface StoreValue {
  state: DemoState;
  dispatch: React.Dispatch<Action>;
  resetDemo: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

function init(): DemoState {
  return loadJson(STORAGE_KEY, isDemoState) ?? createSeedState();
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

  const value = useMemo<StoreValue>(
    () => ({
      state,
      dispatch,
      resetDemo: () => {
        removeKey(STORAGE_KEY);
        dispatch({ type: 'reset' });
      },
    }),
    [state],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useDemo(): StoreValue {
  const v = useContext(StoreContext);
  if (!v) throw new Error('useDemo must be used inside DemoStoreProvider');
  return v;
}

export { currentProject } from './reducer';
