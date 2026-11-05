import type { SitemapEdge, SitemapNode } from '@/types';

export interface SitemapMetrics {
  pages: number;
  maxDepth: number;
  /** トップから問い合わせまでのクリック数（到達できなければ null） */
  contactClicks: number | null;
  firstLevel: number;
}

/** トップからの階層（BFS）を計算する純関数 */
export function depthMap(nodes: SitemapNode[], edges: SitemapEdge[]): Map<string, number> {
  const home = nodes.find((n) => n.data.kind === 'home') ?? nodes[0];
  const depth = new Map<string, number>();
  if (!home) return depth;
  depth.set(home.id, 0);
  const queue = [home.id];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const e of edges) {
      if (e.source === cur && !depth.has(e.target)) {
        depth.set(e.target, depth.get(cur)! + 1);
        queue.push(e.target);
      }
    }
  }
  return depth;
}

export function sitemapMetrics(nodes: SitemapNode[], edges: SitemapEdge[]): SitemapMetrics {
  const depth = depthMap(nodes, edges);
  const contact = nodes.find((n) => n.data.kind === 'cta') ?? nodes.find((n) => n.data.label.includes('問い合わせ'));
  const contactDepth = contact ? depth.get(contact.id) : undefined;
  return {
    pages: nodes.length,
    maxDepth: Math.max(0, ...depth.values()),
    contactClicks: contactDepth === undefined ? null : contactDepth,
    firstLevel: [...depth.values()].filter((d) => d === 1).length,
  };
}

const PATH_RE = /^\/[a-z0-9\-_/]*$/i;

export function validatePath(path: string, nodes: SitemapNode[], selfId?: string): string | null {
  const p = path.trim();
  if (!p) return 'パスを入力してください';
  if (!p.startsWith('/')) return '「/」から始めてください';
  if (p.length > 60) return '60文字以内で入力してください';
  if (!PATH_RE.test(p)) return '半角英数字・ハイフン・スラッシュで入力してください';
  if (nodes.some((n) => n.id !== selfId && n.data.path === p)) return '同じパスのページがすでにあります';
  return null;
}

export function validateLabel(label: string): string | null {
  const l = label.trim();
  if (!l) return 'ページ名を入力してください';
  if (l.length > 24) return '24文字以内で入力してください';
  return null;
}
