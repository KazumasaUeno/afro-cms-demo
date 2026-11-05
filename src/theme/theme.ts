import { alpha, createTheme } from '@mui/material/styles';
import { tokens as t } from './tokens';

const c = t.color;

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: c.primary, dark: c.primaryHover, light: c.primarySoft, contrastText: '#fff' },
    secondary: { main: c.accent, light: c.accentSoft, contrastText: '#fff' },
    success: { main: c.success, light: c.successSoft },
    warning: { main: c.warning, light: c.warningSoft },
    error: { main: c.danger, light: c.dangerSoft },
    info: { main: c.info, light: c.infoSoft },
    background: { default: c.bg, paper: c.surface },
    text: { primary: c.ink, secondary: c.muted, disabled: c.faint },
    divider: c.border,
  },
  shape: { borderRadius: t.radius.md },
  typography: {
    fontFamily: t.font.sans,
    htmlFontSize: 16,
    h1: { fontSize: 'clamp(1.75rem, 2.4vw, 2.25rem)', fontWeight: 650, letterSpacing: '-0.025em', lineHeight: 1.2 },
    h2: { fontSize: 'clamp(1.4rem, 1.9vw, 1.75rem)', fontWeight: 650, letterSpacing: '-0.02em', lineHeight: 1.25 },
    h3: { fontSize: '1.25rem', fontWeight: 640, letterSpacing: '-0.015em', lineHeight: 1.35 },
    h4: { fontSize: '1.0625rem', fontWeight: 620, letterSpacing: '-0.01em', lineHeight: 1.4 },
    h5: { fontSize: '0.9375rem', fontWeight: 620, lineHeight: 1.45 },
    h6: { fontSize: '0.875rem', fontWeight: 620, lineHeight: 1.45 },
    subtitle1: { fontSize: '0.9375rem', color: c.muted, lineHeight: 1.6 },
    subtitle2: { fontSize: '0.8125rem', fontWeight: 600, color: c.muted },
    body1: { fontSize: '0.9375rem', lineHeight: 1.7 },
    body2: { fontSize: '0.875rem', lineHeight: 1.6 },
    caption: { fontSize: '0.75rem', color: c.muted, lineHeight: 1.5 },
    overline: { fontSize: '0.6875rem', fontWeight: 650, letterSpacing: '0.08em', lineHeight: 1.6, color: c.muted },
    button: { textTransform: 'none', fontWeight: 600, letterSpacing: 0 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        ':root': { colorScheme: 'light' },
        html: { WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', textRendering: 'optimizeLegibility' },
        body: { backgroundColor: c.bg, fontFeatureSettings: '"cv11", "ss01"' },
        '::selection': { background: alpha(c.primary, 0.18) },
        '*:focus-visible': { outline: 'none', boxShadow: t.shadow.focus, borderRadius: 8 },
        // 入力欄は外枠（MuiOutlinedInput の Mui-focused）でフォーカスを示すので、内側の二重リングを消す
        'input:focus-visible, textarea:focus-visible': { boxShadow: 'none' },
        '@media (prefers-reduced-motion: reduce)': {
          '*, *::before, *::after': { animationDuration: '0.01ms !important', transitionDuration: '0.01ms !important', scrollBehavior: 'auto !important' },
        },
      },
    },
    MuiButtonBase: { defaultProps: { disableRipple: true } },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          borderRadius: 12, minHeight: 40, paddingInline: 16,
          transition: `background-color .16s ${t.motion.easeCss}, box-shadow .16s ${t.motion.easeCss}, transform .16s ${t.motion.easeCss}, border-color .16s`,
          '&:active': { transform: 'scale(0.98)' },
        },
        sizeSmall: { minHeight: 32, paddingInline: 12, borderRadius: 10, fontSize: '0.8125rem' },
        sizeLarge: { minHeight: 48, paddingInline: 22, borderRadius: 14, fontSize: '0.9375rem' },
        containedPrimary: {
          boxShadow: `0 1px 0 rgba(255,255,255,.18) inset, 0 1px 2px ${alpha(c.primary, 0.4)}`,
          '&:hover': { backgroundColor: c.primaryHover, boxShadow: `0 1px 0 rgba(255,255,255,.18) inset, 0 4px 12px ${alpha(c.primary, 0.32)}` },
        },
        outlined: {
          borderColor: c.border, color: c.ink, backgroundColor: c.surface,
          '&:hover': { borderColor: c.borderStrong, backgroundColor: c.surfaceMuted },
        },
        text: { color: c.inkSoft, '&:hover': { backgroundColor: c.bgSubtle } },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: { borderRadius: 12, color: c.inkSoft, transition: 'background-color .16s', '&:hover': { backgroundColor: c.bgSubtle } },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: { root: { backgroundImage: 'none' }, outlined: { borderColor: c.border } },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: { root: { borderRadius: t.radius.lg, border: `1px solid ${c.border}`, boxShadow: t.shadow.xs } },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 8, fontWeight: 600, fontSize: '0.75rem', height: 26 },
        sizeSmall: { height: 22, fontSize: '0.6875rem' },
      },
    },
    MuiTooltip: {
      defaultProps: { arrow: false, enterDelay: 300 },
      styleOverrides: {
        tooltip: { backgroundColor: c.ink, fontSize: '0.75rem', fontWeight: 500, borderRadius: 8, padding: '6px 10px' },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 12, backgroundColor: c.surface,
          '& .MuiOutlinedInput-notchedOutline': { borderColor: c.border, transition: 'border-color .16s' },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: c.borderStrong },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: c.primary, borderWidth: 1 },
          '&.Mui-focused': { boxShadow: t.shadow.focus },
        },
        input: { paddingBlock: 11 },
      },
    },
    MuiInputLabel: { styleOverrides: { root: { fontSize: '0.875rem' } } },
    MuiDialog: {
      styleOverrides: {
        paper: { borderRadius: t.radius.xl, boxShadow: t.shadow.lg, border: `1px solid ${c.border}` },
      },
    },
    MuiBackdrop: { styleOverrides: { root: { backgroundColor: alpha(c.ink, 0.32), backdropFilter: 'blur(2px)' } } },
    MuiLinearProgress: {
      styleOverrides: {
        root: { height: 6, borderRadius: 99, backgroundColor: c.bgSubtle },
        bar: { borderRadius: 99 },
      },
    },
    MuiTab: {
      styleOverrides: { root: { textTransform: 'none', fontWeight: 600, minHeight: 40, fontSize: '0.875rem' } },
    },
    MuiTabs: { styleOverrides: { root: { minHeight: 40 }, indicator: { height: 2, borderRadius: 2 } } },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          textTransform: 'none', border: 'none', borderRadius: '10px !important', fontWeight: 600, color: c.muted, paddingInline: 12,
          '&.Mui-selected': { backgroundColor: c.surface, color: c.ink, boxShadow: t.shadow.sm, '&:hover': { backgroundColor: c.surface } },
        },
      },
    },
    MuiToggleButtonGroup: {
      styleOverrides: { root: { backgroundColor: c.bgSubtle, borderRadius: 12, padding: 3, gap: 2 } },
    },
    MuiSwitch: {
      styleOverrides: {
        root: { padding: 8 },
        track: { borderRadius: 99, backgroundColor: c.borderStrong, opacity: 1 },
        thumb: { boxShadow: t.shadow.sm },
      },
    },
    MuiSnackbar: { defaultProps: { anchorOrigin: { vertical: 'bottom', horizontal: 'center' } } },
    MuiMenu: {
      styleOverrides: { paper: { borderRadius: 14, border: `1px solid ${c.border}`, boxShadow: t.shadow.md, marginTop: 6 } },
    },
    MuiMenuItem: { styleOverrides: { root: { borderRadius: 8, marginInline: 6, fontSize: '0.875rem', minHeight: 38 } } },
    MuiAvatar: { styleOverrides: { root: { fontSize: '0.75rem', fontWeight: 650 } } },
  },
});
