/**
 * サイトマップの中身の組み立て（純関数。LIVE_SITEMAP_DATA §2.2・§2.3・D-3）。
 * - cleanDiagram: 検査（validateSitemapDoc）を通った図を、決めた項目だけで組み直す（保存する形を 1 か所に）
 * - toSitemapVersion: 版文書 sitemapVersions/r{N} の allowlist（editSeq・updatedBy・aiRequestId・byUid 等を写さない＝AC-03）
 * - contentHashOf: sha256(canonicalSitemapJson)。版文書のお客様に見える項目を全部覆う（sec L-3。正規化は src/shared/ai/sitemapRules.ts）
 */
import { createHash } from 'node:crypto';
import { canonicalSitemapJson, cleanSitemapDiagram } from '../ai/shared/sitemapRules';
import type { SitemapEdge, SitemapNode } from '../ai/shared/types';

export interface Diagram { nodes: SitemapNode[]; edges: SitemapEdge[] }
export interface StoredDevComment { text: string; at: unknown; byUid?: string; byName: string }

/** 検査済みの図を決めた項目だけで組み直す（reason は文字列があるときだけ。正は共有の cleanSitemapDiagram＝画面が送る前と同じ形） */
export function cleanDiagram(d: unknown): Diagram {
  return cleanSitemapDiagram(d);
}

/** お客様に出すコメント（byUid を写さない。F-6） */
export function publicDevComment(c: unknown): { text: string; at: unknown; byName: string } | undefined {
  const v = c as StoredDevComment | null | undefined;
  if (!v || typeof v.text !== 'string' || v.text.length === 0) return undefined;
  return { text: v.text, at: v.at, byName: typeof v.byName === 'string' ? v.byName : '' };
}

/** contentHash（hex 64）。before・after・devComment（text/at/byName）だけから作る */
export function contentHashOf(doc: { before?: unknown; after?: unknown; devComment?: unknown }): string {
  const devComment = publicDevComment(doc.devComment);
  const json = canonicalSitemapJson({ before: cleanDiagram(doc.before), after: cleanDiagram(doc.after), devComment: devComment ?? null });
  return createHash('sha256').update(json, 'utf8').digest('hex');
}

/** 版文書（不変）。allowlist だけで組む */
export function toSitemapVersion(
  internal: Record<string, unknown>,
  meta: { revision: number; contentHash: string; submittedAt: unknown; submittedBy: string },
): Record<string, unknown> {
  const devComment = publicDevComment(internal.devComment);
  return {
    schemaVersion: 1,
    revision: meta.revision,
    before: cleanDiagram(internal.before),
    after: cleanDiagram(internal.after),
    origin: internal.origin === 'ai' ? 'ai' : 'manual',
    ...(typeof internal.sourceReqRevision === 'number' ? { sourceReqRevision: internal.sourceReqRevision } : {}),
    ...(devComment ? { devComment } : {}),
    contentHash: meta.contentHash,
    submittedAt: meta.submittedAt,
    submittedBy: meta.submittedBy,
  };
}
