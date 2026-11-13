import { Box, type SxProps, type Theme } from '@mui/material';
import type { SignageOrientation, Slide } from '@/types';
import { accentOf, formatPrice, imageOf, TEMPLATE_LABEL } from '@/data/signage';
import { tokens } from '@/theme/tokens';
import { currentProject, useDemoOptional } from '@/store/DemoStore';

/** 行数で切る（長い文でも枠からはみ出さない） */
const clamp = (lines: number) => ({ display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden', overflowWrap: 'anywhere' as const });

const INK = '#1A1410';

/**
 * スライド 1 枚の表示。サムネイル・編集のプレビュー・再生（プレビュー）のすべてで使う。
 * 幅いっぱいの 16:9（横）/ 9:16（縦）の枠に描き、文字の大きさは枠の幅に合わせる（コンテナクエリの cqw）。
 * 画像以外は HTML と CSS だけで描く。
 */
export function SlideView({ slide, orientation, sx, decorative = false }: { slide: Slide; orientation: SignageOrientation; sx?: SxProps<Theme>; decorative?: boolean }) {
  const portrait = orientation === 'portrait';
  // 縦置きは幅が狭いので、幅に対する文字の比率を上げる
  const k = portrait ? 1.75 : 1;
  const fs = (n: number) => `${(n * k).toFixed(2)}cqw`;
  const a = accentOf(slide.accent);
  const img = imageOf(slide.image);
  // 右下のサイト名は選んでいる案件のもの（サイネージは 0.30.0 から案件ごと）
  const store = useDemoOptional();
  const siteName = store ? currentProject(store.state).siteName.toUpperCase() : 'MINAMO COFFEE';

  const brand = (
    <Box sx={{ position: 'absolute', right: fs(2.2), bottom: fs(1.6), fontSize: fs(1.3), fontWeight: 700, letterSpacing: '0.12em', opacity: 0.7 }}>
      {siteName}
    </Box>
  );
  const label = (light: boolean) => (
    <Box sx={{
      alignSelf: 'flex-start', px: fs(1), py: fs(0.35), borderRadius: fs(0.6), fontSize: fs(1.4), fontWeight: 700, letterSpacing: '0.06em',
      bgcolor: light ? 'rgba(255,255,255,.2)' : a.color, color: '#fff',
    }}>
      {TEMPLATE_LABEL[slide.template]}
    </Box>
  );
  const picture = img
    ? <Box component="img" src={img.src} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
    : <Box sx={{ width: '100%', height: '100%', background: `radial-gradient(circle at 70% 30%, rgba(255,255,255,.35) 0 18%, transparent 19%), linear-gradient(135deg, ${a.color} 0%, ${a.soft} 100%)` }} />;

  let content;
  if (slide.template === 'promo') {
    content = (
      <Box sx={{ position: 'absolute', inset: 0, display: 'grid', ...(portrait ? { gridTemplateRows: '52% 48%' } : { gridTemplateColumns: '46% 54%' }) }}>
        <Box sx={{ order: portrait ? 0 : 1, minWidth: 0, minHeight: 0 }}>{picture}</Box>
        <Box sx={{ order: portrait ? 1 : 0, bgcolor: a.color, color: '#fff', p: fs(3.2), display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: fs(1.4), minWidth: 0, minHeight: 0 }}>
          {label(true)}
          <Box sx={{ fontSize: fs(4.6), fontWeight: 800, lineHeight: 1.25, ...clamp(3) }}>{slide.title}</Box>
          {slide.body && <Box sx={{ fontSize: fs(2), lineHeight: 1.6, opacity: 0.92, ...clamp(portrait ? 4 : 3) }}>{slide.body}</Box>}
        </Box>
      </Box>
    );
  } else if (slide.template === 'menu') {
    const items = slide.items ?? [];
    const twoCols = !portrait && items.length > 3;
    content = (
      <Box sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', bgcolor: a.soft, color: INK }}>
        <Box sx={{ bgcolor: a.color, color: '#fff', px: fs(3.2), py: fs(2), display: 'flex', flexDirection: 'column', gap: fs(0.8) }}>
          {label(true)}
          <Box sx={{ fontSize: fs(3.8), fontWeight: 800, lineHeight: 1.25, ...clamp(2) }}>{slide.title}</Box>
        </Box>
        <Box sx={{ flex: 1, minHeight: 0, px: fs(3.2), py: fs(2), display: 'grid', gridTemplateColumns: twoCols ? '1fr 1fr' : '1fr', columnGap: fs(4), alignContent: 'center', rowGap: fs(portrait ? 2 : 1.2) }}>
          {items.map((it, i) => (
            <Box key={i} sx={{ display: 'flex', alignItems: 'baseline', gap: fs(1), fontSize: fs(2.6), minWidth: 0 }}>
              <Box sx={{ fontWeight: 700, minWidth: 0, ...clamp(1) }}>{it.name}</Box>
              <Box sx={{ flex: 1, minWidth: fs(2), borderBottom: `0.3cqw dotted ${a.color}`, opacity: 0.5, transform: 'translateY(-0.4em)' }} />
              <Box sx={{ fontWeight: 800, color: a.color, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{formatPrice(it.price)}</Box>
            </Box>
          ))}
        </Box>
        {slide.body && <Box sx={{ px: fs(3.2), pb: fs(4), fontSize: fs(1.8), opacity: 0.75, ...clamp(2) }}>{slide.body}</Box>}
      </Box>
    );
  } else {
    content = (
      <Box sx={{ position: 'absolute', inset: 0, display: 'grid', bgcolor: '#FFFDF9', color: INK, ...(img ? (portrait ? { gridTemplateRows: '34% 66%' } : { gridTemplateColumns: '64% 36%' }) : {}) }}>
        <Box sx={{ order: 1, p: fs(3.6), display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: fs(1.6), minWidth: 0, minHeight: 0, borderLeft: portrait ? 'none' : `${fs(0.8)} solid ${a.color}` }}>
          {label(false)}
          <Box sx={{ fontSize: fs(4.2), fontWeight: 800, lineHeight: 1.3, ...clamp(3) }}>{slide.title}</Box>
          {slide.body && <Box sx={{ fontSize: fs(2.1), lineHeight: 1.7, color: '#4A3F36', ...clamp(portrait ? 6 : 4) }}>{slide.body}</Box>}
        </Box>
        {img && <Box sx={{ order: portrait ? 0 : 2, minWidth: 0, minHeight: 0 }}>{picture}</Box>}
      </Box>
    );
  }

  return (
    <Box
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : `${TEMPLATE_LABEL[slide.template]}「${slide.title}」`}
      sx={[
        {
          position: 'relative', width: '100%', aspectRatio: portrait ? '9 / 16' : '16 / 9', overflow: 'hidden', containerType: 'inline-size',
          fontFamily: tokens.font.sans, userSelect: 'none', bgcolor: a.soft, color: slide.template === 'promo' ? '#fff' : INK,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {content}
      <Box sx={{ color: slide.template === 'promo' ? '#fff' : a.color }}>{brand}</Box>
    </Box>
  );
}

/** 何も流していない画面（未配信・期間外） */
export function EmptyScreen({ orientation, text, sx }: { orientation: SignageOrientation; text: string; sx?: SxProps<Theme> }) {
  return (
    <Box sx={[
      {
        width: '100%', aspectRatio: orientation === 'portrait' ? '9 / 16' : '16 / 9', containerType: 'inline-size', display: 'grid', placeItems: 'center',
        bgcolor: '#111827', color: 'rgba(255,255,255,.7)', textAlign: 'center', p: 1,
      },
      ...(Array.isArray(sx) ? sx : [sx]),
    ]}>
      <Box component="span" sx={{ fontSize: orientation === 'portrait' ? '7cqw' : '4cqw', fontWeight: 600 }}>{text}</Box>
    </Box>
  );
}
