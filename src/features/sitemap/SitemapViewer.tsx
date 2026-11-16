import { Box, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { Background, BackgroundVariant, Controls, ReactFlow, ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useMemo, useState } from 'react';
import { StatusPill } from '@/components/ui';
import { useThemeMode } from '@/theme/ThemeMode';
import { tokens } from '@/theme/tokens';
import type { SitemapState, SitemapVariant } from '@/types';
import { KIND_META } from './PageNode';
import { defaultEdgeOptions, nodeTypes, toFlow } from './flowConfig';
import { sitemapMetrics } from './metrics';

/**
 * サイトマップの図（閲覧だけ。0.39.5）。お客様ポータルの確認・承認で、編集はできなくても構成を図で見られるようにする。
 * 移動・接続・削除はできない。ページを押すと、そのページの改善理由（現在の図では課題）を下に出す。
 * 編集の正の画面は SitemapPage（管理者・開発者）。見た目の設定は flowConfig で共通
 */
export function SitemapViewer({ sitemap, height = 420 }: { sitemap: SitemapState; height?: number }) {
  const { mode } = useThemeMode();
  const [variant, setVariant] = useState<SitemapVariant>('after');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const data = sitemap[variant];
  const nodes = useMemo(
    () => data.nodes.map((n) => ({ ...toFlow(n), selected: n.id === selectedId, draggable: false, connectable: false, deletable: false })),
    [data.nodes, selectedId],
  );
  const metrics = useMemo(() => sitemapMetrics(data.nodes, data.edges), [data]);
  const selected = data.nodes.find((n) => n.id === selectedId);

  return (
    <Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'flex-start', sm: 'center' }} sx={{ mb: 1.5 }}>
        <ToggleButtonGroup exclusive size="small" value={variant} onChange={(_, v) => { if (v) { setVariant(v); setSelectedId(null); } }} aria-label="表示するサイトマップ">
          <ToggleButton value="before">現在</ToggleButton>
          <ToggleButton value="after">リニューアル後</ToggleButton>
        </ToggleButtonGroup>
        <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', rowGap: 0.5, color: tokens.color.muted, fontSize: 13 }}>
          <span>ページ <b style={{ color: tokens.color.ink }}>{metrics.pages}</b></span>
          <span>最大階層 <b style={{ color: tokens.color.ink }}>{metrics.maxDepth}</b></span>
          <span>問い合わせまで <b style={{ color: tokens.color.ink }}>{metrics.contactClicks ?? '—'}</b> クリック</span>
        </Stack>
      </Stack>
      <Box sx={{ height, borderRadius: 3, overflow: 'hidden', border: `1px solid ${tokens.color.border}`,
        '& .react-flow__controls': { boxShadow: tokens.shadow.sm, borderRadius: '10px', overflow: 'hidden', border: `1px solid ${tokens.color.border}` } }}>
        <ReactFlowProvider key={variant}>
          <ReactFlow
            colorMode={mode}
            nodes={nodes}
            edges={data.edges}
            nodeTypes={nodeTypes}
            defaultEdgeOptions={defaultEdgeOptions}
            nodesDraggable={false}
            nodesConnectable={false}
            edgesFocusable={false}
            deleteKeyCode={null}
            onNodeClick={(_, n) => setSelectedId(n.id)}
            onPaneClick={() => setSelectedId(null)}
            fitView
            fitViewOptions={{ padding: 0.12 }}
            minZoom={0.3}
            maxZoom={2}
            aria-label={`${variant === 'after' ? 'リニューアル後' : '現在'}のサイトマップ（閲覧のみ）`}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1.4} color={tokens.color.outlineVariant} />
            <Controls showInteractive={false} position="bottom-left" />
          </ReactFlow>
        </ReactFlowProvider>
      </Box>
      <Box role="status" sx={{ mt: 1, minHeight: 24 }}>
        {selected ? (
          <Stack direction="row" spacing={1} alignItems="baseline" sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
            <StatusPill tone={selected.data.kind === 'new' ? 'accent' : selected.data.kind === 'cta' ? 'primary' : 'neutral'}>{KIND_META[selected.data.kind].label}</StatusPill>
            <Typography variant="body2" sx={{ fontWeight: 650 }}>{selected.data.label}</Typography>
            <Typography variant="caption" sx={{ fontFamily: tokens.font.mono }}>{selected.data.path}</Typography>
            {selected.data.reason && (
              <Typography variant="body2" sx={{ width: '100%' }}>{variant === 'after' ? '改善理由' : '現状の課題'}：{selected.data.reason}</Typography>
            )}
          </Stack>
        ) : (
          <Typography variant="caption">ページを押すと、{variant === 'after' ? '改善理由' : '現状の課題'}を確認できます。図はドラッグで動かせ、左下のボタンで拡大・縮小できます（編集はできません）。</Typography>
        )}
      </Box>
    </Box>
  );
}
