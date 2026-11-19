import { Box, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DESIGN_VARIANTS, offeredVariants } from '@/data/designs';
import { tokens } from '@/theme/tokens';
import type { DesignId } from '@/types';
import { DeviceFrame } from './DeviceFrame';
import { FloatingDeviceSwitch, ScreenToggle } from './DesignStudioPage';
import { personalize, useDesignContext } from './designContext';
import type { Device } from './previews/shared';

const BAR_H = 56;
const DEVICES: Device[] = ['pc', 'tablet', 'phone'];

/**
 * デザイン案の全画面プレビュー（0.39.4。お客様ポータルの確認・承認から新しいタブで開く）。
 * 管理画面の枠（AppShell）の外に置き、デザイン案・画面・端末を切り替えて見る。
 * URL: /design-preview?project=p3&design=minimal&screen=1&device=pc（不正な値は既定値に戻す）
 * 表示だけで、デザインの選択・承認は記録しない（承認は元の画面で行う）
 * mode=site（2026-11-18）: 品質チェックの「制作中のサイトを見る」から開く。採用したデザインだけを出し、案の切り替えは出さない
 */
export default function DesignPreviewPage() {
  const [params, setParams] = useSearchParams();
  const projectId = params.get('project') ?? undefined;
  const ctx = useDesignContext(projectId);
  const design: DesignId = (DESIGN_VARIANTS.find((v) => v.id === params.get('design'))?.id ?? 'minimal') as DesignId;
  const screen = Math.min(Math.max(0, Number(params.get('screen')) || 0), ctx.pages.length);
  const device: Device = DEVICES.find((d) => d === params.get('device')) ?? 'pc';
  const variant = personalize(DESIGN_VARIANTS.find((v) => v.id === design)!, ctx);
  const site = params.get('mode') === 'site';
  // チェックする画面の名前（管理者・開発者は「品質チェック」、お客様は「品質確認」）。表示に使うだけなので許す値に絞る
  const checkScreen = params.get('check') === '品質確認' ? '品質確認' : '品質チェック';

  // 窓の高さに合わせて見本の高さを決める（上の操作バー・ブラウザ風の枠・余白を除く）
  const [winH, setWinH] = useState(() => window.innerHeight);
  useEffect(() => {
    const onResize = () => setWinH(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  // 上の操作バーの実際の高さ（折り返し・枠線で BAR_H より高くなる。決め打ちだとページが数 px はみ出し、
  // ページと見本の両方にスクロールバーが出る。2026-11-19「右側にあるバーが２つある」）
  const barRef = useRef<HTMLDivElement>(null);
  const [barH, setBarH] = useState(BAR_H);
  useLayoutEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBarH(Math.ceil(el.getBoundingClientRect().height)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    document.title = site ? `制作中のサイト — ${ctx.siteName}` : `${variant.name}（${variant.label}）のプレビュー — ${ctx.siteName}`;
  }, [site, variant.name, variant.label, ctx.siteName]);

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next, { replace: true });
  };

  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: tokens.color.bgSubtle }}>
      <Stack
        ref={barRef}
        direction="row"
        alignItems="center"
        spacing={1.5}
        useFlexGap
        sx={{ minHeight: BAR_H, px: 2, py: 1, flexWrap: 'wrap', bgcolor: tokens.color.surface, borderBottom: `1px solid ${tokens.color.border}`, position: 'sticky', top: 0, zIndex: 1 }}
      >
        <Typography variant="body2" sx={{ fontWeight: 650, mr: 1 }} noWrap>{ctx.siteName} の{site ? '制作中のサイト' : 'デザイン案'}</Typography>
        {!site && <ToggleButtonGroup exclusive size="small" value={design} onChange={(_, v) => v && set('design', v)} aria-label="表示するデザイン案">
          {/* 切り替えの選択肢は A・B・C（2026-11-19 ユーザー指示） */}
          {offeredVariants(design).map((v0) => {
            const v = personalize(v0, ctx);
            return <ToggleButton key={v.id} value={v.id}>{v.label}・{v.name}</ToggleButton>;
          })}
        </ToggleButtonGroup>}
        {ctx.pages.length > 0 && <ScreenToggle ctx={ctx} value={screen} onChange={(n) => set('screen', String(n))} />}
        <Typography variant="caption" sx={{ ml: 'auto' }}>{site ? `公開前の制作中のサイトです（デモの見本）。チェックは${checkScreen}の画面で行ってください。` : '見本の表示だけです。承認は元の画面で行ってください。'}</Typography>
      </Stack>
      {/* 端末の切り替えは帯の下の右端に、アイコンだけで浮かせる（2026-11-18 ユーザー指示）。サイトをスクロールしても同じ位置 */}
      <FloatingDeviceSwitch value={device} onChange={(d) => set('device', d)} top={barH + 12} />
      {/* PC 表示は枠なしで画面いっぱい（制作中のサイトは 2026-11-18、デザイン案も 2026-11-19 ユーザー指示「全画面表示した時は PC 画面いっぱいに」）。タブレット・スマホは端末の幅で中央に出す */}
      <Box sx={{ p: device === 'pc' ? 0 : { xs: 1, sm: 2 } }}>
        <DeviceFrame
          bare
          design={design}
          device={device}
          screen={screen}
          projectId={projectId}
          viewportHeight={device === 'pc' ? Math.max(400, winH - barH) : Math.max(400, winH - barH - 48)}
          label={`${variant.name}のプレビュー`}
        />
      </Box>
    </Box>
  );
}
