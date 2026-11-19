import { Box } from '@mui/material';
import { LightThemeOnly } from '@/theme/ThemeMode';
import { useLayoutEffect, useRef, useState, type ComponentType } from 'react';
import type { DesignId } from '@/types';
import { tokens } from '@/theme/tokens';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { DEVICE_HEIGHT, DEVICE_WIDTH, type Device, type PreviewProps } from './previews/shared';
import { MinimalPreview } from './previews/MinimalPreview';
import { CreativePreview } from './previews/CreativePreview';
import { PremiumPreview } from './previews/PremiumPreview';
import { useDesignContext, type DesignContext } from './designContext';

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
  /** 表示する画面（0 = トップ、1・2 = 改善後サイトマップの主要ページ。0.29.5） */
  screen?: number;
  /** 案件（省略時は選んでいる案件） */
  projectId?: string;
  /** 中身を直接渡す（ストアに無い見込み客のプチ要件定義。0.32.0）。省略時は projectId の案件 */
  ctx?: DesignContext;
  /**
   * 枠なしで描く（2026-11-18 ユーザー指示「制作中のサイトは全画面で」）。
   * PC は角丸・影・枠線も付けず置き場所の幅いっぱいに描き、広い画面では等倍より大きくもする（最大 1.5 倍）
   */
  bare?: boolean;
}

/**
 * 実寸（1280/820/390px）でレンダリングし、置き場所の幅に合わせて縮小表示する。
 * プレビュー自体は device によってレイアウトを切り替える（実際の HTML/CSS）。
 */
export function DeviceFrame({ design, device, thumbnail, viewportHeight, label, screen = 0, projectId, ctx: ctxProp, bare }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(0);
  const reduced = useReducedMotion();
  const storeCtx = useDesignContext(projectId);
  const ctx = ctxProp ?? storeCtx;
  const page = screen > 0 ? ctx.pages[screen - 1] : undefined;
  const w = DEVICE_WIDTH[device];
  // 枠なしは、拡大しても見える高さ（viewportHeight）が変わらないよう、描く高さを倍率で割る（下の useLayoutEffect の後で決める）
  const baseH = viewportHeight ?? DEVICE_HEIGHT[device];

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setAvail(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // PC は画面いっぱい（拡大も可）、タブレット・スマホは端末の幅のまま中央（アドレスバーだけ外す。2026-11-18「アドレスバーもいらない」）
  const fill = !!bare && device === 'pc';
  const scale = avail ? Math.min(fill ? 1.5 : 1, avail / w) : 0;
  const h = fill && scale > 0 ? Math.round(baseH / scale) : baseH;
  const Preview = PREVIEWS[design];
  // ブラウザ風の上の帯（アドレスバー）はどの表示でも付けない（2026-11-19 ユーザー指示「上のアドレスバーは要らない」。11-18 は制作中のサイトだけ外していた）

  return (
    // 顧客サイトの見本なので、アプリの配色（ダーク）に関わらずライトで描く
    <LightThemeOnly>
    <Box ref={ref} data-theme="light" sx={{ width: '100%' }}>
      <Box
        sx={{
          width: w * scale, height: h * scale, mx: 'auto', overflow: 'hidden', bgcolor: '#fff',
          borderRadius: fill ? 0 : device === 'phone' && !thumbnail ? '28px' : thumbnail ? '10px' : '14px',
          border: fill ? 'none' : `1px solid ${tokens.color.border}`, boxShadow: thumbnail || fill ? 'none' : tokens.shadow.md,
          // 最初の採寸の前（幅 0）から広がる動きと、画面いっぱい（fill）の表示の伸び縮みは見せない（2026-11-19「最大画面を開いたら変な動き」）
          transition: reduced || fill || !avail ? 'none' : `width .34s ${tokens.motion.easeCss}, height .34s ${tokens.motion.easeCss}`,
        }}
      >
        {scale > 0 && (
          <Box
            key={page?.key ?? 'top'}
            role={thumbnail ? undefined : 'region'}
            aria-label={label}
            aria-hidden={thumbnail || undefined}
            tabIndex={thumbnail ? -1 : 0}
            sx={{
              width: w, height: h, transform: `scale(${scale})`, transformOrigin: 'top left',
              overflowY: thumbnail ? 'hidden' : 'auto', overflowX: 'hidden', pointerEvents: thumbnail ? 'none' : 'auto',
            }}
          >
            <Preview device={device} still={thumbnail || reduced} ctx={ctx} page={page} />
          </Box>
        )}
      </Box>
    </Box>
    </LightThemeOnly>
  );
}
