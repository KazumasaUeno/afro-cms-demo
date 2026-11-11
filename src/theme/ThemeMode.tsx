import { CssBaseline, ThemeProvider } from '@mui/material';
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { loadJson, saveJson } from '@/services/storage';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { lightTheme, makeTheme } from './theme';
import { palette, tokens, type ThemeMode } from './tokens';

/**
 * 配色（ライト / ダーク）の切替。
 * - 設定は「システム（端末の設定に従う）/ ライト / ダーク」。既定はシステム
 * - 保存先は DemoState とは別のキー（デモの初期化で消えないように。形の検査 seed.ts とも独立）
 * - <html data-theme> を付け替えると、tokens.color（CSS 変数）を使う全画面が切り替わる。
 *   最初の描画前の付与は index.html のインラインスクリプトが行う（ちらつき防止。キー名を合わせること）
 */
export type ThemePref = 'system' | ThemeMode;
export const THEME_STORAGE_KEY = 'afro-cms-demo:theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

const isPref = (v: unknown): v is ThemePref => v === 'system' || v === 'light' || v === 'dark';
const systemDark = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(DARK_QUERY).matches;

interface ThemeModeValue {
  pref: ThemePref;
  mode: ThemeMode;
  /** origin を渡すと、その位置から新しい配色を円で広げる（View Transitions。動きを減らす設定では即時） */
  setPref: (p: ThemePref, origin?: { x: number; y: number }) => void;
  /** 画面全体を一時的にライトに固定する（営業プレゼンモード。戻り値で解除） */
  forceLight: () => () => void;
}

const Ctx = createContext<ThemeModeValue | null>(null);

type VTDocument = Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };

export function ThemeModeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(() => loadJson(THEME_STORAGE_KEY, isPref) ?? 'system');
  const [system, setSystem] = useState<ThemeMode>(() => (systemDark() ? 'dark' : 'light'));
  const [forced, setForced] = useState(0);
  const reduced = useReducedMotion();
  const mode: ThemeMode = forced > 0 ? 'light' : pref === 'system' ? system : pref;
  const forceLight = useCallback(() => {
    setForced((n) => n + 1);
    return () => setForced((n) => n - 1);
  }, []);

  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(DARK_QUERY);
    const on = () => setSystem(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  // 別のタブで配色を変えたら、このタブも追従する（storage イベントは変更したタブ以外にだけ届く）
  useEffect(() => {
    const on = (e: StorageEvent) => {
      if (e.key !== THEME_STORAGE_KEY) return;
      setPrefState(loadJson(THEME_STORAGE_KEY, isPref) ?? 'system');
    };
    window.addEventListener('storage', on);
    return () => window.removeEventListener('storage', on);
  }, []);

  // 描画前に <html> へ反映する（CSS 変数とブラウザのアドレスバーの色）
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = mode;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', palette[mode].bg);
  }, [mode]);

  // 設定画面の「動きを減らす」を CSS の transition にも効かせる（theme.ts の [data-reduced-motion]）
  useLayoutEffect(() => {
    document.documentElement.dataset.reducedMotion = reduced ? 'true' : 'false';
  }, [reduced]);

  const setPref = useCallback<ThemeModeValue['setPref']>((p, origin) => {
    saveJson(THEME_STORAGE_KEY, p);
    const doc = document as VTDocument;
    const nextMode = p === 'system' ? (systemDark() ? 'dark' : 'light') : p;
    if (reduced || !doc.startViewTransition || nextMode === document.documentElement.dataset.theme) {
      setPrefState(p);
      return;
    }
    const vt = doc.startViewTransition(() => flushSync(() => setPrefState(p)));
    const x = origin?.x ?? window.innerWidth / 2;
    const y = origin?.y ?? 0;
    const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    vt.ready
      .then(() => {
        document.documentElement.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
          { duration: 500, easing: tokens.motion.easeCss, pseudoElement: '::view-transition-new(root)' },
        );
      })
      .catch(() => { /* 切替そのものは完了している */ });
  }, [reduced]);

  const theme = useMemo(() => (mode === 'light' ? lightTheme : makeTheme('dark')), [mode]);
  const value = useMemo(() => ({ pref, mode, setPref, forceLight }), [pref, mode, setPref, forceLight]);

  return (
    <Ctx.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </Ctx.Provider>
  );
}

/** この部品を表示している間、画面全体（Dialog などのポータルを含む）をライトにする */
export function useForceLightMode(): void {
  const { forceLight } = useThemeMode();
  useLayoutEffect(() => forceLight(), [forceLight]);
}

export function useThemeMode(): ThemeModeValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useThemeMode は ThemeModeProvider の中で使う');
  return v;
}

/**
 * ライトに固定する部分（顧客サイトの見本・端末の枠・公開プレビュー）。中の MUI 部品をライトのテーマで描く。
 * CSS 変数は呼び出し側の要素に data-theme="light" を付けて上書きする（囲みの要素を増やさないため）。
 */
export function LightThemeOnly({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider theme={lightTheme}>{children}</ThemeProvider>
  );
}
