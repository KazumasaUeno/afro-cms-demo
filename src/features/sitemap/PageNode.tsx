import { Box, Stack, Typography } from '@mui/material';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { FileText, FolderTree, House, Lightbulb, MousePointerClick, Sparkles, type LucideIcon } from 'lucide-react';
import { memo } from 'react';
import type { SitemapNodeData } from '@/types';
import { tokens } from '@/theme/tokens';

export type PageFlowNode = Node<SitemapNodeData, 'page'>;

const KIND: Record<SitemapNodeData['kind'], { icon: LucideIcon; bg: string; fg: string; label: string }> = {
  home: { icon: House, bg: tokens.color.ink, fg: '#fff', label: 'トップ' },
  section: { icon: FolderTree, bg: tokens.color.primarySoft, fg: tokens.color.primary, label: 'セクション' },
  page: { icon: FileText, bg: tokens.color.bgSubtle, fg: tokens.color.inkSoft, label: 'ページ' },
  cta: { icon: MousePointerClick, bg: tokens.color.primary, fg: '#fff', label: 'CTA' },
  new: { icon: Sparkles, bg: tokens.color.accentSoft, fg: '#5B3FD6', label: '新設' },
};

export const KIND_META = KIND;

const handleSx = { width: 9, height: 9, background: '#fff', border: `2px solid ${tokens.color.borderStrong}` };

/** サイトマップのページカード */
export const PageNode = memo(function PageNode({ data, selected }: NodeProps<PageFlowNode>) {
  const k = KIND[data.kind];
  const Icon = k.icon;
  const accent = data.kind === 'cta' ? tokens.color.primary : data.kind === 'new' ? tokens.color.accent : data.kind === 'home' ? tokens.color.ink : tokens.color.border;
  return (
    <Box
      sx={{
        position: 'relative', width: 184, p: 1.25, borderRadius: '14px', bgcolor: tokens.color.surface,
        border: `1.5px solid ${selected ? tokens.color.primary : data.kind === 'new' || data.kind === 'cta' ? accent : tokens.color.border}`,
        borderStyle: data.kind === 'new' ? 'dashed' : 'solid',
        boxShadow: selected ? `0 0 0 4px ${tokens.color.primarySoft}, ${tokens.shadow.md}` : tokens.shadow.sm,
        transition: 'box-shadow .16s, border-color .16s, transform .16s',
        '&:hover': { boxShadow: selected ? undefined : tokens.shadow.md },
      }}
    >
      <Handle type="target" position={Position.Top} style={handleSx} />
      <Stack direction="row" spacing={1.25} alignItems="center">
        <Box sx={{ width: 32, height: 32, borderRadius: '9px', bgcolor: k.bg, color: k.fg, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <Icon size={16} />
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 650, lineHeight: 1.3, color: tokens.color.ink }} noWrap>{data.label}</Typography>
          <Typography sx={{ fontSize: 11, fontFamily: tokens.font.mono, color: tokens.color.muted, lineHeight: 1.4 }} noWrap>{data.path}</Typography>
        </Box>
        {data.reason && (
          <Box title="改善理由あり" sx={{ width: 22, height: 22, borderRadius: '7px', bgcolor: tokens.color.warningSoft, color: tokens.color.warning, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Lightbulb size={13} />
          </Box>
        )}
      </Stack>
      {(data.kind === 'new' || data.kind === 'cta') && (
        <Box
          sx={{
            position: 'absolute', top: -10, right: 10, px: 0.75, height: 18, borderRadius: '6px', fontSize: 10, fontWeight: 750, letterSpacing: '.04em',
            display: 'flex', alignItems: 'center', bgcolor: data.kind === 'new' ? tokens.color.accent : tokens.color.primary, color: '#fff',
          }}
        >
          {data.kind === 'new' ? 'NEW' : 'CTA'}
        </Box>
      )}
      <Handle type="source" position={Position.Bottom} style={handleSx} />
    </Box>
  );
});
