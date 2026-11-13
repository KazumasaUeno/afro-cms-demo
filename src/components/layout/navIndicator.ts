import { tokens } from '@/theme/tokens';

/**
 * M3 Expressive のナビの印（active indicator）。
 * 選択されると pill が中心から横へ広がる（spring の行き過ぎを近似した曲線）。押すと少し縮む。
 * 印は `.nav-ind` の要素の ::before に描く（中のアイコンは z-index で上に出す）。ホバーは ::after の state layer。
 * レール・ドロワー・スマホ下部のナビで共通。CSS の transition だけなので、動きを減らす設定では theme.ts の規則で止まる。
 */
export function navIndicatorSx(active: boolean, { fill = false, indicator }: { fill?: boolean; indicator?: string } = {}) {
  return {
    // fill: 項目全体が印になる（ドロワーの行）。印は空の要素で、項目の他の子を上に重ねる
    ...(fill && { position: 'relative', isolation: 'isolate', '& > :not(.nav-ind)': { position: 'relative', zIndex: 1 } }),
    '& .nav-ind': {
      position: fill ? 'absolute' : 'relative', inset: fill ? 0 : undefined, isolation: 'isolate', borderRadius: `${tokens.radius.full}px`,
      transition: `transform .4s ${tokens.motion.easeSpringCss}`,
      '& > *': { position: 'relative', zIndex: 1 },
    },
    '& .nav-ind::before': {
      content: '""', position: 'absolute', inset: 0, borderRadius: 'inherit', zIndex: 0,
      bgcolor: indicator ?? tokens.color.secondaryContainer,
      transform: active ? 'scaleX(1)' : 'scaleX(0.32)', opacity: active ? 1 : 0,
      transition: `transform .45s ${tokens.motion.easeSpringCss}, opacity .15s linear`,
    },
    '& .nav-ind::after': {
      content: '""', position: 'absolute', inset: 0, borderRadius: 'inherit', zIndex: 0,
      bgcolor: tokens.color.onSurface, opacity: 0, transition: 'opacity .15s linear',
    },
    '&:hover .nav-ind::after': { opacity: tokens.state.hover },
    '&:active .nav-ind': { transform: 'scale(0.94)' },
    '&:active .nav-ind::after': { opacity: tokens.state.pressed },
  } as const;
}

/** 色を変えた項目（NavItem.tone）の文字とアイコンの色。選択中の印の色は navIndicatorSx の indicator に toneIndicator を渡す（::before を上書きすると印が消えるため） */
export function navToneSx(_tone: 'info') {
  return {
    color: tokens.color.infoInk,
    '& svg': { color: tokens.color.info },
  } as const;
}

export const toneIndicator = (tone: 'info' | undefined): string | undefined => (tone ? tokens.color.infoSoft : undefined);
