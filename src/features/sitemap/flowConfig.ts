import { MarkerType } from '@xyflow/react';
import type { SitemapNode } from '@/types';
import { tokens } from '@/theme/tokens';
import { PageNode, type PageFlowNode } from './PageNode';

/** サイトマップのキャンバスの共通設定（編集画面 SitemapPage と閲覧用 SitemapViewer で同じ見た目にする。0.39.5） */
export const nodeTypes = { page: PageNode };
export const defaultEdgeOptions = {
  type: 'smoothstep',
  style: { stroke: tokens.color.outline, strokeWidth: 1.5 },
  markerEnd: { type: MarkerType.ArrowClosed, color: tokens.color.outline, width: 16, height: 16 },
};
export const toFlow = (n: SitemapNode): PageFlowNode => ({ id: n.id, type: 'page', position: n.position, data: n.data, deletable: n.data.kind !== 'home' });
