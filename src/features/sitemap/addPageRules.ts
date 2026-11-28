import type { SitemapNode, SitemapNodeData, SitemapVariant } from '@/types';

/** ページの追加で選べる種類（トップは 1 図に 1 件だけ。validateSitemapDoc の home_count と同じ規則） */
const KINDS: SitemapNodeData['kind'][] = ['page', 'section', 'new', 'cta'];

/**
 * 「ページを追加」の種類の選択肢と既定。トップが無い図（手で作った現在の図など＝空）では、最初のページはトップだけ（QA D-1b）。
 * トップがある図（demo・AI の下書き・手で作った改善後）は従来どおり（改善後は「新規」、現在は「ページ」が既定）
 */
export function addPageKindOptions(variant: SitemapVariant, nodes: readonly SitemapNode[]): { kinds: SitemapNodeData['kind'][]; kind: SitemapNodeData['kind'] } {
  if (!nodes.some((n) => n.data.kind === 'home')) return { kinds: ['home'], kind: 'home' };
  return { kinds: KINDS, kind: variant === 'after' ? 'new' : 'page' };
}
