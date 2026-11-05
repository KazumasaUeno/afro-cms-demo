/** デザイントークン（値の正はここ。MUI テーマと独自コンポーネントの両方がここを参照する） */
export const tokens = {
  color: {
    bg: '#FAFAFB',
    bgSubtle: '#F4F5F8',
    surface: '#FFFFFF',
    surfaceMuted: '#F7F8FA',
    border: '#E7E9EF',
    borderStrong: '#D5D9E2',
    ink: '#0F172A',
    inkSoft: '#334155',
    muted: '#64748B',
    faint: '#94A3B8',
    navy: '#1E3A8A',
    primary: '#3B5BDB',
    primaryHover: '#2F4BC4',
    primarySoft: '#EEF2FF',
    accent: '#7C5CFA',
    accentSoft: '#F3F0FF',
    success: '#0F9D74',
    successSoft: '#E7F7F1',
    warning: '#C27803',
    warningSoft: '#FEF5E3',
    danger: '#D93F4C',
    dangerSoft: '#FDECEE',
    info: '#0E7FC0',
    infoSoft: '#E7F3FB',
  },
  /** AI 関連の印（控えめなブルー→パープル。多用しない） */
  aiGradient: 'linear-gradient(135deg, #4F7CFF 0%, #7C5CFA 100%)',
  radius: { sm: 10, md: 14, lg: 18, xl: 24 },
  shadow: {
    xs: '0 1px 2px rgba(15, 23, 42, 0.04)',
    sm: '0 1px 2px rgba(15, 23, 42, 0.04), 0 2px 8px rgba(15, 23, 42, 0.04)',
    md: '0 2px 4px rgba(15, 23, 42, 0.04), 0 8px 24px rgba(15, 23, 42, 0.06)',
    lg: '0 8px 16px rgba(15, 23, 42, 0.06), 0 24px 48px rgba(15, 23, 42, 0.10)',
    focus: '0 0 0 3px rgba(59, 91, 219, 0.28)',
  },
  font: {
    sans: '"Inter Variable", "Inter", "Noto Sans JP", system-ui, -apple-system, "Hiragino Sans", sans-serif',
    mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  },
  motion: {
    fast: 0.16,
    base: 0.24,
    slow: 0.34,
    /** easeOutQuint 系 */
    ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
    easeCss: 'cubic-bezier(0.22, 1, 0.36, 1)',
  },
  layout: { sidebar: 248, sidebarCollapsed: 76, topbar: 64, contentMax: 1320 },
} as const;

export type Tokens = typeof tokens;
