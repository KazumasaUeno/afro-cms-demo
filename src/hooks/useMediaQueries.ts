import { useMediaQuery, useTheme } from '@mui/material';

export function useBreakpoints() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isTablet = useMediaQuery(theme.breakpoints.between('sm', 'lg'));
  const isDesktop = useMediaQuery(theme.breakpoints.up('lg'));
  return { isMobile, isTablet, isDesktop };
}

/** 入力の多いダイアログを全画面にするか（スマホ縦・横向きのスマホ） */
export function useFullScreenDialog() {
  const theme = useTheme();
  const narrow = useMediaQuery(theme.breakpoints.down('sm'));
  const short = useMediaQuery('(orientation: landscape) and (max-height: 500px)');
  return narrow || short;
}
