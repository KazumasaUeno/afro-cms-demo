/**
 * デザイントークン（値の正はここ。MUI テーマと独自コンポーネントの両方がここを参照する）
 *
 * Material Design 3（ベースライン配色 #6750A4）＋ M3 Expressive の形と動き。ライト / ダークの 2 つの配色を持つ。
 * - `palette.light` / `palette.dark` が生の値（hex）。MUI の alpha() など色を計算する処理はこちらを使う
 * - `tokens.color.X` は CSS 変数（`var(--md-x)`）。画面はこれを使えば、配色の切替に自動で追従する
 *   （変数は theme.ts の CssBaseline が `:root` / `[data-theme="dark"]` に定義する）
 * 旧キー（bg / surface / ink / primarySoft …）は既存画面のために残し、M3 の役割（Color roles）へ割り当てている。
 * 新しいコードは M3 名（primaryContainer / onSurfaceVariant / surfaceContainer* …）を優先して使う。
 */
const m3Light = {
  primary: '#6750A4',
  onPrimary: '#FFFFFF',
  primaryContainer: '#EADDFF',
  onPrimaryContainer: '#21005D',
  secondary: '#625B71',
  onSecondary: '#FFFFFF',
  secondaryContainer: '#E8DEF8',
  onSecondaryContainer: '#1D192B',
  tertiary: '#7D5260',
  onTertiary: '#FFFFFF',
  tertiaryContainer: '#FFD8E4',
  onTertiaryContainer: '#31111D',
  error: '#B3261E',
  onError: '#FFFFFF',
  errorContainer: '#F9DEDC',
  onErrorContainer: '#410E0B',
  surfaceContainerLowest: '#FFFFFF',
  surfaceContainerLow: '#F7F2FA',
  surfaceContainer: '#F3EDF7',
  surfaceContainerHigh: '#ECE6F0',
  surfaceContainerHighest: '#E6E0E9',
  onSurface: '#1D1B20',
  onSurfaceVariant: '#49454F',
  outline: '#79747E',
  outlineVariant: '#CAC4D0',
  inverseSurface: '#322F35',
  inverseOnSurface: '#F5EFF7',
  inversePrimary: '#D0BCFF',
  scrim: '#000000',
};

/** M3 ベースライン（#6750A4）のダーク配色 */
const m3Dark: typeof m3Light = {
  primary: '#D0BCFF',
  onPrimary: '#381E72',
  primaryContainer: '#4F378B',
  onPrimaryContainer: '#EADDFF',
  secondary: '#CCC2DC',
  onSecondary: '#332D41',
  secondaryContainer: '#4A4458',
  onSecondaryContainer: '#E8DEF8',
  tertiary: '#EFB8C8',
  onTertiary: '#492532',
  tertiaryContainer: '#633B48',
  onTertiaryContainer: '#FFD8E4',
  error: '#F2B8B5',
  onError: '#601410',
  errorContainer: '#8C1D18',
  onErrorContainer: '#F9DEDC',
  surfaceContainerLowest: '#0F0D13',
  surfaceContainerLow: '#1D1B20',
  surfaceContainer: '#211F26',
  surfaceContainerHigh: '#2B2930',
  surfaceContainerHighest: '#36343B',
  onSurface: '#E6E0E9',
  onSurfaceVariant: '#CAC4D0',
  outline: '#938F99',
  outlineVariant: '#49454F',
  inverseSurface: '#E6E0E9',
  inverseOnSurface: '#322F35',
  inversePrimary: '#6750A4',
  scrim: '#000000',
};

function build(m: typeof m3Light, mode: 'light' | 'dark') {
  const light = mode === 'light';
  return {
    ...m,
    /** M3 の surface（ライトは surfaceContainerLow を画面の地にしている。旧キー bg を参照） */
    m3Surface: light ? '#FEF7FF' : '#141218',
    // ── 旧キー（既存画面の互換）→ M3 の役割 ──
    bg: light ? m.surfaceContainerLow : '#141218', // 画面の地（ダークは M3 surface）
    bgSubtle: m.surfaceContainerHighest, // セグメント・トラック（Dialog の面 = High と区別できる段）
    surface: light ? m.surfaceContainerLowest : m.surfaceContainerLow, // カード・入力欄（ダークは地より一段明るい）
    surfaceMuted: m.surfaceContainer,
    border: m.outlineVariant,
    borderStrong: m.outline,
    ink: m.onSurface,
    inkSoft: m.onSurfaceVariant,
    muted: light ? '#625B71' : '#CCC2DC', // 補足（地・カードに対して 4.5:1 以上）
    faint: m.outline,
    navy: '#4F378B', // primary 30（ロゴの地。両モード同じ）
    primaryHover: light ? '#56408F' : '#DCCBFF',
    primarySoft: m.primaryContainer,
    accent: m.tertiary, // AI 関連の印（M3 の tertiary = 補助アクセント）
    accentSoft: m.tertiaryContainer,
    accentInk: light ? '#633B48' : '#FFD8E4',
    // 状態色（M3 に無い success / warning / info は同じ明度設計で追加。Ink は Soft の上の文字色で 4.5:1 以上。on* は塗りの上の文字）
    success: light ? '#146C2E' : '#6DD58C',
    onSuccess: light ? '#FFFFFF' : '#00391A',
    successSoft: light ? '#C4EED0' : '#0F5223',
    successInk: light ? '#0F5223' : '#C4EED0',
    successLine: light ? '#8CCB9C' : '#2F7A45', // Soft の面を囲む罫線
    warning: light ? '#7A5900' : '#F2C14E',
    onWarning: light ? '#FFFFFF' : '#3F2E00',
    warningSoft: light ? '#FFDF9E' : '#5C4300',
    warningInk: light ? '#5C4300' : '#FFDF9E',
    danger: m.error,
    onDanger: m.onError,
    dangerSoft: m.errorContainer,
    dangerInk: light ? '#8C1D18' : '#F9DEDC',
    dangerLine: light ? '#E8A6A1' : '#B3261E',
    info: light ? '#00639B' : '#98CBFF',
    onInfo: light ? '#FFFFFF' : '#003354',
    infoSoft: light ? '#CEE5FF' : '#004A77',
    infoInk: light ? '#004A77' : '#CEE5FF',
    /** 両モードとも暗い面（提案書のスコア表示。上の文字は白） */
    scoreboardBg: '#322F35', // 両モードで暗い面。ダークのカード（#1D1B20）とも区別できる段
  };
}

export type ThemeMode = 'light' | 'dark';
export type ColorKey = keyof ReturnType<typeof build>;

/** 生の配色（hex）。MUI の alpha()・色を計算する処理など、CSS 変数を解釈できない所だけで使う */
export const palette: Record<ThemeMode, Record<ColorKey, string>> = {
  light: build(m3Light, 'light'),
  dark: build(m3Dark, 'dark'),
};

/** camelCase → `--md-kebab-case` */
export const cssVarName = (key: string) => `--md-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

/** CssBaseline に渡す変数の定義（`{ '--md-primary': '#6750A4', … }`） */
export function cssVars(mode: ThemeMode): Record<string, string> {
  const p = palette[mode];
  return Object.fromEntries((Object.keys(p) as ColorKey[]).map((k) => [cssVarName(k), p[k]]));
}

const color = Object.fromEntries((Object.keys(palette.light) as ColorKey[]).map((k) => [k, `var(${cssVarName(k)})`])) as Record<ColorKey, string>;

export const tokens = {
  /** CSS 変数（`var(--md-x)`）。ライト / ダークの切替に追従する */
  color,
  /** AI 関連の印（primary→tertiary。小さな面積だけに使う。上の文字は白なので両モードとも同じ値） */
  aiGradient: 'linear-gradient(135deg, #6750A4 0%, #7D5260 100%)',
  /**
   * M3 Shape scale: XS 4 / S 8 / M 12 / L 16 / XL 28 / Full。
   * M3 Expressive に合わせ、カード（lg）は Large=16、主役の面（xl）は Extra large=28
   */
  radius: { xs: 4, sm: 8, md: 12, lg: 16, xl: 28, full: 999 },
  /** M3 Elevation（xs=Level0 は面の色で区別、sm=Level1、md=Level2、lg=Level3） */
  shadow: {
    xs: 'none',
    sm: '0 1px 2px rgba(0,0,0,0.3), 0 1px 3px 1px rgba(0,0,0,0.15)',
    md: '0 1px 2px rgba(0,0,0,0.3), 0 2px 6px 2px rgba(0,0,0,0.15)',
    lg: '0 1px 3px rgba(0,0,0,0.3), 0 4px 8px 3px rgba(0,0,0,0.15)',
    focus: `0 0 0 3px color-mix(in srgb, var(${cssVarName('primary')}) 40%, transparent)`,
  },
  /** M3 State layer の不透明度 */
  state: { hover: 0.08, focus: 0.1, pressed: 0.1, dragged: 0.16 },
  font: {
    sans: 'Roboto, "Noto Sans JP", system-ui, -apple-system, "Hiragino Sans", "Segoe UI", sans-serif',
    mono: '"Roboto Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  },
  /**
   * M3 Motion。
   * - 時間と easing（emphasized）: CSS の transition・GSAP
   * - spring: M3 Expressive の spatial spring（位置・大きさ・形）。Motion for React の `transition` にそのまま渡す。
   *   damping = 2 × 減衰比 × √stiffness（fast 0.6 / default 0.8 / slow 0.8）
   * - easeSpringCss: CSS で spring の「少し行き過ぎて戻る」を近似する曲線（押下時の形の変化・ナビの印）
   */
  motion: {
    fast: 0.15,
    base: 0.3,
    slow: 0.4,
    ease: [0.2, 0, 0, 1] as [number, number, number, number],
    easeCss: 'cubic-bezier(0.2, 0, 0, 1)',
    spring: {
      fast: { type: 'spring', stiffness: 800, damping: 34 },
      default: { type: 'spring', stiffness: 380, damping: 31 },
      slow: { type: 'spring', stiffness: 200, damping: 23 },
    },
    easeSpringCss: 'cubic-bezier(0.34, 1.45, 0.64, 1)',
  },
  /** sidebar = PC のナビゲーションレール（M3 Expressive の collapsed rail = 96） */
  layout: { sidebar: 96, topbar: 64, contentMax: 1320 },
} as const;

export type Tokens = typeof tokens;
