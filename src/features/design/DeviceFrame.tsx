import { Box } from '@mui/material';
import { useLayoutEffect, useRef, useState, type ComponentType } from 'react';
import type { DesignId } from '@/types';
import { tokens } from '@/theme/tokens';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { DEVICE_HEIGHT, DEVICE_WIDTH, type Device, type PreviewProps } from './previews/shared';
import { MinimalPreview } from './previews/MinimalPreview';
import { CreativePreview } from './previews/CreativePreview';
import { PremiumPreview } from './previews/PremiumPreview';

export const PREVIEWS: Record<DesignId, ComponentType<PreviewProps>> = {
  minimal: MinimalPreview,
  creative: CreativePreview,
  premium: PremiumPreview,
};

interface Props {
  design: DesignId;
  device: Device;
  /** サムネイル（操作不可・スクロールなし） */
  thumbnail?: boolean;
  /** 表示する高さ（論理 px）。省略時は端末の画面高さ */
  viewportHeight?: number;
  label?: string;
}

/**
 * 実寸（1280/820/390px）でレンダリングし、置き場所の幅に合わせて縮小表示する。
 * プレビュー自体は device によってレイアウトを切り替える（実際の HTML/CSS）。
 */
export function DeviceFrame({ design, device, thumbnail, viewportHeight, label }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(0);
  const reduced = useReducedMotion();
  const w = DEVICE_WIDTH[device];
  const h = viewportHeight ?? DEVICE_HEIGHT[device];

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setAvail(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = avail ? Math.min(1, avail / w) : 0;
  const Preview = PREVIEWS[design];
  const chrome = !thumbnail;
  const barH = chrome ? 34 : 0;

  return (
    <Box ref={ref} sx={{ width: '100%' }}>
      <Box
        sx={{
          width: w * scale, height: h * scale + barH, mx: 'auto', overflow: 'hidden', bgcolor: '#fff',
          borderRadius: device === 'phone' && chrome ? '28px' : thumbnail ? '10px' : '14px',
          border: `1px solid ${tokens.color.border}`, boxShadow: thumbnail ? 'none' : tokens.shadow.md,
          transition: reduced ? 'none' : `width .34s ${tokens.motion.easeCss}, height .34s ${tokens.motion.easeCss}`,
        }}
      >
        {chrome && (
          <Box sx={{ height: barH, display: 'flex', alignItems: 'center', gap: 0.75, px: 1.5, bgcolor: tokens.color.bgSubtle, borderBottom: `1px solid ${tokens.color.border}` }}>
            {['#F87171', '#FBBF24', '#34D399'].map((c) => <Box key={c} sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: c, opacity: 0.8 }} />)}
            <Box sx={{ flex: 1, mx: 1, height: 20, borderRadius: '6px', bgcolor: '#fff', fontSize: 11, color: tokens.color.muted, display: 'flex', alignItems: 'center', px: 1, overflow: 'hidden', whiteSpace: 'nowrap' }}>
              minamo-coffee.example.jp
            </Box>
          </Box>
        )}
        {scale > 0 && (
          <Box
            role={thumbnail ? undefined : 'region'}
            aria-label={label}
            aria-hidden={thumbnail || undefined}
            tabIndex={thumbnail ? -1 : 0}
            sx={{
              width: w, height: h, transform: `scale(${scale})`, transformOrigin: 'top left',
              overflowY: thumbnail ? 'hidden' : 'auto', overflowX: 'hidden', pointerEvents: thumbnail ? 'none' : 'auto',
            }}
          >
            <Preview device={device} still={thumbnail || reduced} />
          </Box>
        )}
      </Box>
    </Box>
  );
}
