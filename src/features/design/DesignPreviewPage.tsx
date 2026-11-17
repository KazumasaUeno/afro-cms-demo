import { Box, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DESIGN_VARIANTS, offeredVariants } from '@/data/designs';
import { tokens } from '@/theme/tokens';
import type { DesignId } from '@/types';
import { DeviceFrame } from './DeviceFrame';
import { DeviceToggle, ScreenToggle } from './DesignStudioPage';
import { personalize, useDesignContext } from './designContext';
import type { Device } from './previews/shared';

const BAR_H = 56;
const DEVICES: Device[] = ['pc', 'tablet', 'phone'];

/**
 * デザイン案の全画面プレビュー（0.39.4。お客様ポータルの確認・承認から新しいタブで開く）。
 * 管理画面の枠（AppShell）の外に置き、デザイン案・画面・端末を切り替えて見る。
 * URL: /design-preview?project=p3&design=minimal&screen=1&device=pc（不正な値は既定値に戻す）
 * 表示だけで、デザインの選択・承認は記録しない（承認は元の画面で行う）
 */
export default function DesignPreviewPage() {
  const [params, setParams] = useSearchParams();
  const projectId = params.get('project') ?? undefined;
  const ctx = useDesignContext(projectId);
  const design: DesignId = (DESIGN_VARIANTS.find((v) => v.id === params.get('design'))?.id ?? 'minimal') as DesignId;
  const screen = Math.min(Math.max(0, Number(params.get('screen')) || 0), ctx.pages.length);
  const device: Device = DEVICES.find((d) => d === params.get('device')) ?? 'pc';
  const variant = personalize(DESIGN_VARIANTS.find((v) => v.id === design)!, ctx);
  // 最初に開いた案（C = premium の選択済み案件から開いた場合も、切り替えた後に選択肢から消さない）
  const [openedWith] = useState<DesignId>(design);

  // 窓の高さに合わせて見本の高さを決める（上の操作バー・ブラウザ風の枠・余白を除く）
  const [winH, setWinH] = useState(() => window.innerHeight);
  useEffect(() => {
    const onResize = () => setWinH(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    document.title = `${variant.name}（${variant.label}）のプレビュー — ${ctx.siteName}`;
  }, [variant.name, variant.label, ctx.siteName]);

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next, { replace: true });
  };

  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: tokens.color.bgSubtle }}>
      <Stack
        direction="row"
        alignItems="center"
        spacing={1.5}
        useFlexGap
        sx={{ minHeight: BAR_H, px: 2, py: 1, flexWrap: 'wrap', bgcolor: tokens.color.surface, borderBottom: `1px solid ${tokens.color.border}`, position: 'sticky', top: 0, zIndex: 1 }}
      >
        <Typography variant="body2" sx={{ fontWeight: 650, mr: 1 }} noWrap>{ctx.siteName} のデザイン案</Typography>
        <ToggleButtonGroup exclusive size="small" value={design} onChange={(_, v) => v && set('design', v)} aria-label="表示するデザイン案">
          {/* 切り替えの選択肢は A・B（2026-11-17 会議）。URL で C（premium。選択済みの案件）を開いたときは C も出す */}
          {offeredVariants(openedWith === 'premium' ? openedWith : design).map((v0) => {
            const v = personalize(v0, ctx);
            return <ToggleButton key={v.id} value={v.id}>{v.label}・{v.name}</ToggleButton>;
          })}
        </ToggleButtonGroup>
        {ctx.pages.length > 0 && <ScreenToggle ctx={ctx} value={screen} onChange={(n) => set('screen', String(n))} />}
        <DeviceToggle value={device} onChange={(d) => set('device', d)} />
        <Typography variant="caption" sx={{ ml: 'auto' }}>見本の表示だけです。承認は元の画面で行ってください。</Typography>
      </Stack>
      <Box sx={{ p: { xs: 1, sm: 2 } }}>
        <DeviceFrame
          design={design}
          device={device}
          screen={screen}
          projectId={projectId}
          viewportHeight={Math.max(400, winH - BAR_H - 34 - 40)}
          label={`${variant.name}のプレビュー`}
        />
      </Box>
    </Box>
  );
}
