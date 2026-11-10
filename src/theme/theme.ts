import { alpha, createTheme, type Shadows } from '@mui/material/styles';
import { tokens as t } from './tokens';
import { TOUCH as touch } from './media';

/**
 * Material Design 3 テーマ（MUI v5 の上に M3 の Color roles / Type scale / Shape / Elevation / State layer を載せる）
 * 値は tokens.ts が正。ここに色・角丸の生値を書かない。
 */
const c = t.color;
const s = t.state;

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: c.primary, dark: c.primaryHover, light: c.primaryContainer, contrastText: c.onPrimary },
    secondary: { main: c.secondary, light: c.secondaryContainer, contrastText: c.onSecondary },
    success: { main: c.success, light: c.successSoft },
    warning: { main: c.warning, light: c.warningSoft },
    error: { main: c.error, light: c.errorContainer },
    info: { main: c.info, light: c.infoSoft },
    background: { default: c.bg, paper: c.surface },
    text: { primary: c.onSurface, secondary: c.muted, disabled: alpha(c.onSurface, 0.38) },
    divider: c.outlineVariant,
    action: {
      hover: alpha(c.onSurface, s.hover),
      selected: c.secondaryContainer,
      focus: alpha(c.onSurface, s.focus),
      disabled: alpha(c.onSurface, 0.38),
      disabledBackground: alpha(c.onSurface, 0.12),
    },
  },
  // M3 Shape: Extra small = 4px。sx の borderRadius: 1/2/3/4/7 → 4/8/12/16/28px（M3 の角丸の段と一致する）
  shape: { borderRadius: t.radius.xs },
  // M3 Type scale（h1-3 = Headline L/M/S、h4-6 = Title L/M/S、body1/2 = Body L/M、caption = Body S、button = Label L、overline = Label M）
  typography: {
    fontFamily: t.font.sans,
    htmlFontSize: 16,
    h1: { fontSize: 'clamp(1.75rem, 2.4vw, 2rem)', fontWeight: 400, lineHeight: 1.25, letterSpacing: 0 },
    h2: { fontSize: 'clamp(1.5rem, 2vw, 1.75rem)', fontWeight: 400, lineHeight: 1.29, letterSpacing: 0 },
    h3: { fontSize: '1.5rem', fontWeight: 400, lineHeight: 1.33, letterSpacing: 0 },
    h4: { fontSize: '1.375rem', fontWeight: 400, lineHeight: 1.27, letterSpacing: 0 },
    h5: { fontSize: '1rem', fontWeight: 500, lineHeight: 1.5, letterSpacing: '0.009em' },
    h6: { fontSize: '0.875rem', fontWeight: 500, lineHeight: 1.43, letterSpacing: '0.007em' },
    subtitle1: { fontSize: '1rem', color: c.onSurfaceVariant, lineHeight: 1.5, letterSpacing: '0.031em' },
    subtitle2: { fontSize: '0.875rem', fontWeight: 500, color: c.onSurfaceVariant, letterSpacing: '0.007em' },
    body1: { fontSize: '1rem', lineHeight: 1.5, letterSpacing: '0.031em' },
    body2: { fontSize: '0.875rem', lineHeight: 1.43, letterSpacing: '0.018em' },
    caption: { fontSize: '0.75rem', color: c.onSurfaceVariant, lineHeight: 1.33, letterSpacing: '0.033em' },
    overline: { fontSize: '0.75rem', fontWeight: 500, letterSpacing: '0.042em', lineHeight: 1.33, color: c.onSurfaceVariant, textTransform: 'none' },
    button: { fontSize: '0.875rem', textTransform: 'none', fontWeight: 500, letterSpacing: '0.007em' },
  },
  shadows: [
    'none', t.shadow.sm, t.shadow.md, t.shadow.lg,
    ...Array(21).fill(t.shadow.lg),
  ] as Shadows,
  transitions: {
    easing: { easeInOut: t.motion.easeCss, easeOut: t.motion.easeCss, easeIn: 'cubic-bezier(0.3, 0, 1, 1)', sharp: t.motion.easeCss },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        ':root': { colorScheme: 'light' },
        html: { WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', textRendering: 'optimizeLegibility' },
        body: { backgroundColor: c.bg, color: c.onSurface },
        '::selection': { background: alpha(c.primary, 0.2) },
        // M3 Focus indicator: 3px の輪郭線を 2px 離して出す
        '*:focus-visible': { outline: `3px solid ${c.secondary}`, outlineOffset: 2 },
        // 入力欄は外枠（Mui-focused）でフォーカスを示すので、内側の輪郭線を消す
        'input:focus-visible, textarea:focus-visible': { outline: 'none' },
        '@media (prefers-reduced-motion: reduce)': {
          '*, *::before, *::after': { animationDuration: '0.01ms !important', transitionDuration: '0.01ms !important', scrollBehavior: 'auto !important' },
        },
      },
    },
    // M3 Common buttons: 高さ 40・角丸 Full。Filled / Outlined / Text
    MuiButton: {
      // キーボードフォーカスは 3px の輪郭線で示す（フォーカス時の ripple と二重にしない）
      defaultProps: { disableElevation: true, disableFocusRipple: true },
      styleOverrides: {
        root: {
          borderRadius: t.radius.full, minHeight: 40, paddingInline: 24,
          transition: `background-color .2s ${t.motion.easeCss}, box-shadow .2s ${t.motion.easeCss}, border-color .2s`,
          [touch]: { minHeight: 44 },
        },
        startIcon: { marginLeft: -8, marginRight: 8 },
        endIcon: { marginLeft: 8, marginRight: -8 },
        sizeSmall: { minHeight: 32, paddingInline: 16, fontSize: '0.8125rem', [touch]: { minHeight: 44 } },
        sizeLarge: { minHeight: 48, paddingInline: 28, fontSize: '0.9375rem' },
        contained: {
          boxShadow: 'none',
          '&:hover': { boxShadow: t.shadow.sm },
          '&:active': { boxShadow: 'none' },
        },
        containedPrimary: { '&:hover': { backgroundColor: c.primaryHover } },
        outlined: {
          borderColor: c.outline,
          '&:hover': { borderColor: c.outline, backgroundColor: alpha(c.primary, s.hover) },
        },
        outlinedInherit: { borderColor: c.outline },
        text: { paddingInline: 12, '&:hover': { backgroundColor: alpha(c.primary, s.hover) } },
        textInherit: { '&:hover': { backgroundColor: alpha(c.onSurface, s.hover) } },
      },
    },
    MuiIconButton: {
      defaultProps: { disableFocusRipple: true },
      styleOverrides: {
        root: {
          borderRadius: t.radius.full, color: c.onSurfaceVariant,
          '&:hover': { backgroundColor: alpha(c.onSurfaceVariant, s.hover) },
          [touch]: { minWidth: 44, minHeight: 44 },
        },
      },
    },
    MuiFab: { styleOverrides: { root: { borderRadius: 16, boxShadow: t.shadow.lg, textTransform: 'none' } } },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: { root: { backgroundImage: 'none' }, outlined: { borderColor: c.outlineVariant } },
    },
    // M3 Outlined card: 角丸 Medium（12px）＋ outlineVariant の罫線
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: { root: { borderRadius: t.radius.md, border: `1px solid ${c.outlineVariant}`, boxShadow: 'none', backgroundColor: c.surfaceContainerLowest } },
    },
    // M3 Chips: 高さ 32・角丸 Small（8px）
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: t.radius.sm, fontWeight: 500, fontSize: '0.875rem', height: 32 },
        filled: { '&.MuiChip-colorDefault': { backgroundColor: c.secondaryContainer, color: c.onSecondaryContainer } },
        outlined: { '&.MuiChip-colorDefault': { borderColor: c.outline, color: c.onSurfaceVariant } },
        sizeSmall: { height: 24, fontSize: '0.75rem' },
      },
    },
    // M3 Plain tooltip
    MuiTooltip: {
      defaultProps: { arrow: false, enterDelay: 300 },
      styleOverrides: {
        tooltip: { backgroundColor: c.inverseSurface, color: c.inverseOnSurface, fontSize: '0.75rem', fontWeight: 400, borderRadius: t.radius.xs, padding: '4px 8px' },
      },
    },
    // M3 Outlined text field: 高さ 56・角丸 Extra small・フォーカスで 2px の primary
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: t.radius.xs, backgroundColor: 'transparent',
          '& .MuiOutlinedInput-notchedOutline': { borderColor: c.outline, transition: 'border-color .15s' },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: c.onSurface },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: c.primary, borderWidth: 2 },
          '&.Mui-error .MuiOutlinedInput-notchedOutline': { borderColor: c.error },
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: { root: { color: c.onSurfaceVariant, '&.Mui-focused': { color: c.primary }, '&.Mui-error': { color: c.error } } },
    },
    MuiFormHelperText: { styleOverrides: { root: { color: c.onSurfaceVariant, marginInline: 16 } } },
    // M3 Dialog: 角丸 Extra large（28px）・surfaceContainerHigh・Level3
    MuiDialog: {
      styleOverrides: {
        paper: { borderRadius: t.radius.xl, boxShadow: t.shadow.lg, backgroundColor: c.surfaceContainerHigh },
        // 全画面のときは角丸を外し、操作ボタンをホームインジケーター（safe-area）の上に出す
        paperFullScreen: {
          borderRadius: 0, backgroundColor: c.surface,
          '& .MuiDialogActions-root': { paddingBottom: 'max(16px, env(safe-area-inset-bottom))' },
          '& .MuiDialogContent-root:last-child': { paddingBottom: 'max(20px, calc(env(safe-area-inset-bottom) + 12px))' },
        },
      },
    },
    MuiDialogTitle: { styleOverrides: { root: { fontSize: '1.5rem', fontWeight: 400, lineHeight: 1.33, padding: '24px 24px 16px' } } },
    MuiDialogContent: { styleOverrides: { root: { paddingInline: 24 } } },
    MuiDialogActions: { styleOverrides: { root: { padding: '16px 24px 24px', gap: 8, '& > :not(style) ~ :not(style)': { marginLeft: 0 } } } },
    MuiBackdrop: {
      styleOverrides: { root: { '&:not(.MuiBackdrop-invisible)': { backgroundColor: alpha(c.scrim, 0.32) } } },
    },
    // M3 Navigation drawer（モーダル）: 角丸は開く側だけ 16px
    MuiDrawer: {
      styleOverrides: { paper: { backgroundColor: c.surfaceContainerLow, borderRight: 'none' }, paperAnchorLeft: { borderRadius: '0 16px 16px 0' } },
    },
    // M3 Linear progress: 太さ 4・トラックは surfaceContainerHighest
    MuiLinearProgress: {
      styleOverrides: {
        root: { height: 4, borderRadius: t.radius.full, backgroundColor: c.surfaceContainerHighest },
        bar: { borderRadius: t.radius.full },
      },
    },
    // M3 Primary tabs: 高さ 48・インジケーター 3px（上だけ角丸）
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none', fontWeight: 500, minHeight: 48, fontSize: '0.875rem', color: c.onSurfaceVariant,
          '&.Mui-selected': { color: c.primary },
          '&:hover': { backgroundColor: alpha(c.onSurface, s.hover) },
        },
      },
    },
    MuiTabs: { styleOverrides: { root: { minHeight: 48, borderBottom: `1px solid ${c.surfaceContainerHighest}` }, indicator: { height: 3, borderRadius: '3px 3px 0 0' } } },
    // M3 Segmented buttons: 角丸 Full の外枠、選択中は secondaryContainer
    MuiToggleButtonGroup: {
      styleOverrides: {
        root: { borderRadius: t.radius.full, border: `1px solid ${c.outline}`, overflow: 'hidden', backgroundColor: 'transparent' },
        grouped: { border: 0, borderRadius: '0 !important', margin: 0 },
        groupedHorizontal: { '&:not(:first-of-type)': { borderLeft: `1px solid ${c.outline}`, marginLeft: 0 } },
        groupedVertical: { '&:not(:first-of-type)': { borderTop: `1px solid ${c.outline}`, marginTop: 0 } },
      },
    },
    MuiToggleButton: {
      defaultProps: { disableFocusRipple: true },
      styleOverrides: {
        root: {
          // 外枠が overflow:hidden なのでフォーカス枠はボタンの内側に出す
          '&.Mui-focusVisible': { outlineOffset: -3 },
          textTransform: 'none', border: 0, fontWeight: 500, color: c.onSurface, paddingInline: 12, minHeight: 40,
          [touch]: { minHeight: 44, minWidth: 44 },
          '&:hover': { backgroundColor: alpha(c.onSurface, s.hover) },
          '&.Mui-selected': {
            backgroundColor: c.secondaryContainer, color: c.onSecondaryContainer,
            '&:hover': { backgroundColor: alpha(c.onSecondaryContainer, 0.12) },
          },
        },
      },
    },
    // M3 Switch: トラック 52×32、つまみは OFF 16px / ON 24px
    MuiSwitch: {
      styleOverrides: {
        // overflow:hidden は MUI 既定のまま（透明な input が左右にはみ出して押せる範囲が広がるのを防ぐ）。
        // 左 11px は FormControlLabel の -11px 補正と相殺させるため
        root: {
          width: 52, height: 32, padding: 0, margin: '6px 6px 6px 11px', overflow: 'hidden',
          // size="small" も同じ M3 の形にする（MUI 既定の small 用の値の方が詳細度が高いので明示する）
          '&.MuiSwitch-sizeSmall': {
            width: 52, height: 32, padding: 0,
            '& .MuiSwitch-switchBase': { padding: 8, '&.Mui-checked': { padding: 4, transform: 'translateX(20px)' } },
            '& .MuiSwitch-thumb': { width: 16, height: 16 },
            '& .Mui-checked .MuiSwitch-thumb': { width: 24, height: 24 },
          },
        },
        switchBase: {
          padding: 8, color: c.outline,
          '&.Mui-checked': {
            padding: 4, transform: 'translateX(20px)', color: c.onPrimary,
            '& + .MuiSwitch-track': { backgroundColor: c.primary, borderColor: c.primary, opacity: 1 },
            '& .MuiSwitch-thumb': { width: 24, height: 24 },
          },
          '&.Mui-disabled + .MuiSwitch-track': { opacity: 0.12 },
        },
        thumb: { width: 16, height: 16, boxShadow: 'none', transition: `width .2s ${t.motion.easeCss}, height .2s ${t.motion.easeCss}` },
        track: {
          borderRadius: t.radius.full, backgroundColor: c.surfaceContainerHighest, border: `2px solid ${c.outline}`,
          boxSizing: 'border-box', opacity: 1,
        },
      },
    },
    MuiSnackbar: { defaultProps: { anchorOrigin: { vertical: 'bottom', horizontal: 'center' } } },
    MuiSnackbarContent: { styleOverrides: { root: { backgroundColor: c.inverseSurface, color: c.inverseOnSurface, borderRadius: t.radius.xs } } },
    // M3 Menu: 角丸 Extra small・surfaceContainer・Level2
    MuiMenu: {
      styleOverrides: { paper: { borderRadius: t.radius.xs, backgroundColor: c.surfaceContainer, boxShadow: t.shadow.md, marginTop: 4 } },
    },
    MuiPopover: { styleOverrides: { paper: { borderRadius: t.radius.xs, boxShadow: t.shadow.md } } },
    MuiMenuItem: {
      styleOverrides: {
        root: { fontSize: '0.875rem', minHeight: 48, paddingInline: 12, '&.Mui-selected': { backgroundColor: c.secondaryContainer } },
        dense: { minHeight: 40, [touch]: { minHeight: 44 } },
      },
    },
    MuiCheckbox: { styleOverrides: { root: { color: c.onSurfaceVariant, borderRadius: t.radius.full, [touch]: { padding: 11 } } } },
    MuiRadio: { styleOverrides: { root: { color: c.onSurfaceVariant } } },
    // スイッチ・チェックは文言ごと押せる（FormControlLabel）。その行を 44px 以上にする
    MuiFormControlLabel: { styleOverrides: { root: { [touch]: { minHeight: 44 } } } },
    MuiAvatar: { styleOverrides: { root: { fontSize: '0.75rem', fontWeight: 500 } } },
    MuiDivider: { styleOverrides: { root: { borderColor: c.outlineVariant } } },
  },
});
