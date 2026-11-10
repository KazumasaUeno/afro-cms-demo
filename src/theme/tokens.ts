/**
 * デザイントークン（値の正はここ。MUI テーマと独自コンポーネントの両方がここを参照する）
 *
 * Material Design 3（ベースライン配色 #6750A4）。
 * 旧キー（bg / surface / ink / primarySoft …）は既存画面のために残し、M3 の役割（Color roles）へ割り当てている。
 * 新しいコードは M3 名（primaryContainer / onSurfaceVariant / surfaceContainer* …）を優先して使う。
 */
const m3 = {
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
  errorContainer: '#F9DEDC',
  onErrorContainer: '#410E0B',
  surface: '#FEF7FF',
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
} as const;

export const tokens = {
  color: {
    ...m3,
    // ── 旧キー（既存画面の互換）→ M3 の役割 ──
    bg: m3.surfaceContainerLow, // 画面の地
    bgSubtle: m3.surfaceContainerHighest, // セグメント・トラック（Dialog の面 = High と区別できる段）
    surface: m3.surfaceContainerLowest, // カード・入力欄
    surfaceMuted: m3.surfaceContainer,
    border: m3.outlineVariant,
    borderStrong: m3.outline,
    ink: m3.onSurface,
    inkSoft: m3.onSurfaceVariant,
    muted: '#625B71', // 補足（地に対して 4.5:1 以上）
    faint: m3.outline,
    navy: '#4F378B', // primary 30
    primaryHover: '#56408F',
    primarySoft: m3.primaryContainer,
    accent: m3.tertiary, // AI 関連の印（M3 の tertiary = 補助アクセント）
    accentSoft: m3.tertiaryContainer,
    accentInk: '#633B48',
    // 状態色（M3 に無い success / warning / info は同じ明度設計で追加。Ink は Soft の上の文字色で 4.5:1 以上）
    success: '#146C2E',
    successSoft: '#C4EED0',
    successInk: '#0F5223',
    successLine: '#8CCB9C', // Soft の面を囲む罫線（Soft より一段濃い）
    warning: '#7A5900',
    warningSoft: '#FFDF9E',
    warningInk: '#5C4300',
    danger: m3.error,
    dangerSoft: m3.errorContainer,
    dangerInk: '#8C1D18',
    dangerLine: '#E8A6A1',
    info: '#00639B',
    infoSoft: '#CEE5FF',
    infoInk: '#004A77',
  },
  /** AI 関連の印（primary→tertiary。小さな面積だけに使う） */
  aiGradient: 'linear-gradient(135deg, #6750A4 0%, #7D5260 100%)',
  /** M3 Shape scale: XS 4 / S 8 / M 12 / L 16 / XL 28 / Full（lg はカード用で M3 の Medium=12） */
  radius: { xs: 4, sm: 8, md: 12, lg: 12, xl: 28, full: 999 },
  /** M3 Elevation（xs=Level0 は面の色で区別、sm=Level1、md=Level2、lg=Level3） */
  shadow: {
    xs: 'none',
    sm: '0 1px 2px rgba(0,0,0,0.3), 0 1px 3px 1px rgba(0,0,0,0.15)',
    md: '0 1px 2px rgba(0,0,0,0.3), 0 2px 6px 2px rgba(0,0,0,0.15)',
    lg: '0 1px 3px rgba(0,0,0,0.3), 0 4px 8px 3px rgba(0,0,0,0.15)',
    focus: '0 0 0 3px rgba(103, 80, 164, 0.35)',
  },
  /** M3 State layer の不透明度 */
  state: { hover: 0.08, focus: 0.1, pressed: 0.1, dragged: 0.16 },
  font: {
    sans: 'Roboto, "Noto Sans JP", system-ui, -apple-system, "Hiragino Sans", "Segoe UI", sans-serif',
    mono: '"Roboto Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  },
  /** M3 Motion: emphasized easing / medium duration */
  motion: {
    fast: 0.15,
    base: 0.3,
    slow: 0.4,
    ease: [0.2, 0, 0, 1] as [number, number, number, number],
    easeCss: 'cubic-bezier(0.2, 0, 0, 1)',
  },
  layout: { sidebar: 264, sidebarCollapsed: 80, topbar: 64, contentMax: 1320 },
} as const;

export type Tokens = typeof tokens;
