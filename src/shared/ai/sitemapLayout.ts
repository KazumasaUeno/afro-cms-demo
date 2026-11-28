/**
 * サイトマップの配置（トップ → 第1階層 → 第2階層の木。LIVE_SITEMAP_IMPL_PLAN P-5）。純粋関数。クライアントとサーバーで共有。
 * src/data/sitemap.ts から移しただけ（配置は移動前と同じ。tests/unit/sitemapRules.test.mjs の同値表）。
 * 正はこのファイル。functions へは scripts/gen-ai-shared.mjs が写す（functions/src/ai/shared/。手で直さない）
 */
import type { SitemapEdge, SitemapNode } from '../../types/index';

/** [キー, ページ名, パス, 種類, AI の理由, 親のキー（省略 = トップの直下）]。先頭はトップ */
export type SitemapSpec = [string, string, string, SitemapNode['data']['kind'], string?, string?];

export const sitemapNode = (id: string, x: number, y: number, label: string, path: string, kind: SitemapNode['data']['kind'], reason?: string): SitemapNode => ({
  id, position: { x, y }, data: { label, path, kind, reason },
});
export const sitemapEdge = (source: string, target: string): SitemapEdge => ({ id: `${source}-${target}`, source, target });

const n = sitemapNode;
const e = sitemapEdge;

/** 仕様の並びから、トップ → 第1階層 → 第2階層の木に配置する（第1階層は 220px 間隔、子は親の下に 160px 間隔） */
export function tree(prefix: 'b' | 'a', specs: SitemapSpec[]): { nodes: SitemapNode[]; edges: SitemapEdge[] } {
  const [home, ...rest] = specs;
  const id = (key: string) => `${prefix}-${key}`;
  const first = rest.filter((s) => !s[5]);
  const pos = new Map<string, number>();
  first.forEach((s, i) => pos.set(s[0], i * 220));
  const nodes: SitemapNode[] = [n(id(home[0]), ((first.length - 1) * 220) / 2, 0, home[1], home[2], home[3], home[4])];
  const edges: SitemapEdge[] = [];
  first.forEach((s) => {
    nodes.push(n(id(s[0]), pos.get(s[0]) ?? 0, 150, s[1], s[2], s[3], s[4]));
    edges.push(e(id(home[0]), id(s[0])));
  });
  first.forEach((parent) => {
    const kids = rest.filter((s) => s[5] === parent[0]);
    kids.forEach((s, j) => {
      nodes.push(n(id(s[0]), (pos.get(parent[0]) ?? 0) + (j - (kids.length - 1) / 2) * 160, 300, s[1], s[2], s[3], s[4]));
      edges.push(e(id(parent[0]), id(s[0])));
    });
  });
  return { nodes, edges };
}
