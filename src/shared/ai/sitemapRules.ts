/**
 * サイトマップの判定（LIVE_SITEMAP_IMPL_PLAN P-5・P-6・§3、LIVE_SITEMAP_PLAN §7）。純粋関数。クライアントとサーバーで共有。
 * - 指標・ページ名・パスの判定は src/features/sitemap/metrics.ts から移しただけ（demo と同じ判定と文言。metrics.ts は re-export）
 * - validateSitemapDoc は callable・worker・画面（エラー表示と依頼可否の件数）が同じものを使う（C-04）。
 *   エラーは {field, nodeId?, code, count?} だけで、入力の文字列を入れない（ログ・HttpsError の details に出せる形。sec M-6）
 * - canonicalSitemapJson は contentHash の正規化（版文書のお客様に見える項目を全部覆う。sec L-3）
 * 正はこのファイル。functions へは scripts/gen-ai-shared.mjs が写す（functions/src/ai/shared/。手で直さない）
 */
import type { SitemapEdge, SitemapNode } from '../../types/index';
import { canonicalJson } from './answersHash';

/* ---------- 指標・ページ名・パス（demo の metrics.ts から移動。判定と文言は変えない） ---------- */

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

/* ---------- 文書全体の検査（PLAN §7。サーバーで必ず通す） ---------- */

/** 上限（PLAN §7 [ASSUMPTION]）。label・path は validateLabel・validatePath の値と同じ */
export const SITEMAP_LIMITS = {
  /** 1 図あたりのページ */
  pages: 60,
  /** 1 図あたりの接続 */
  edges: 120,
  /** AI の出力の 1 図あたりのページ */
  aiPages: 30,
  /** 座標の絶対値 */
  coord: 100_000,
  label: 24,
  path: 60,
  reason: 140,
  devComment: 500,
} as const;

/** ノード ID（demo の採番 `${a|b}-${Date.now().toString(36)}`・見本の `a-home` が満たす） */
export const SITEMAP_NODE_ID_RE = /^[ab]-[a-z0-9-]{1,40}$/;
/** 接続の ID（demo は `${source}-${target}`） */
const EDGE_ID_RE = /^[ab]-[a-z0-9-]{1,90}$/;
export const SITEMAP_KINDS: readonly SitemapNode['data']['kind'][] = ['home', 'section', 'page', 'cta', 'new'];

/** ページ名の制御文字（改行を含む C0・DEL・向きの制御） */
const LABEL_CONTROL = /[\u0000-\u001F\u007F‪-‮⁦-⁩]/;
/** 改行だけ許す文の制御文字（Rules の reChatControl と同じ文字） */
const TEXT_CONTROL = /[\u0000-\u0009\u000B-\u001F\u007F‪-‮⁦-⁩]/;

export type SitemapIssueCode =
  | 'shape' | 'unknown_key' | 'too_many_pages' | 'too_many_edges' | 'home_count'
  | 'id_format' | 'id_duplicate'
  | 'label_required' | 'label_too_long' | 'label_control'
  | 'path_required' | 'path_slash' | 'path_too_long' | 'path_chars' | 'path_duplicate'
  | 'reason_too_long' | 'reason_control' | 'kind' | 'position'
  | 'edge_id' | 'edge_id_duplicate' | 'edge_endpoint' | 'edge_self' | 'edge_duplicate'
  | 'devComment_too_long' | 'devComment_control';

/** 検査の指摘。nodeId は形の正しい ID のときだけ（入力の文字列を載せない） */
export interface SitemapIssue {
  field: string;
  nodeId?: string;
  code: SitemapIssueCode;
  count?: number;
}

export interface SitemapDocInput {
  before?: unknown;
  after?: unknown;
  devComment?: unknown;
}

const LABEL_CODE: Record<string, SitemapIssueCode> = { 'ページ名を入力してください': 'label_required', '24文字以内で入力してください': 'label_too_long' };
const PATH_CODE: Record<string, SitemapIssueCode> = {
  'パスを入力してください': 'path_required', '「/」から始めてください': 'path_slash', '60文字以内で入力してください': 'path_too_long',
  '半角英数字・ハイフン・スラッシュで入力してください': 'path_chars', '同じパスのページがすでにあります': 'path_duplicate',
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const onlyKeys = (o: Obj, allowed: readonly string[]) => Object.keys(o).every((k) => allowed.includes(k));
const idOk = (v: unknown): v is string => typeof v === 'string' && SITEMAP_NODE_ID_RE.test(v);
const withId = (id: unknown) => (idOk(id) ? { nodeId: id } : {});

function checkDiagram(v: 'before' | 'after', d: unknown, maxPages: number, out: SitemapIssue[]): void {
  if (!isObj(d) || !Array.isArray(d.nodes) || !Array.isArray(d.edges)) { out.push({ field: v, code: 'shape' }); return; }
  if (!onlyKeys(d, ['nodes', 'edges'])) { out.push({ field: v, code: 'unknown_key' }); return; }
  const nodesIn = d.nodes as unknown[];
  const edgesIn = d.edges as unknown[];
  // 上限を超えたら件数だけ返す（ノードごとの検査をしない。巨大な入力で重くしない）
  if (nodesIn.length > maxPages || edgesIn.length > SITEMAP_LIMITS.edges) {
    if (nodesIn.length > maxPages) out.push({ field: `${v}.nodes`, code: 'too_many_pages', count: nodesIn.length });
    if (edgesIn.length > SITEMAP_LIMITS.edges) out.push({ field: `${v}.edges`, code: 'too_many_edges', count: edgesIn.length });
    return;
  }
  // 形の正しいノードだけを重複の判定に使う
  const nodes: SitemapNode[] = [];
  const shapeOk: boolean[] = nodesIn.map((n) => {
    const ok = isObj(n) && typeof n.id === 'string' && isObj(n.position) && isObj(n.data)
      && typeof n.data.label === 'string' && typeof n.data.path === 'string';
    if (ok) nodes.push(n as unknown as SitemapNode);
    return ok;
  });
  const seen = new Set<string>();
  nodesIn.forEach((raw, i) => {
    if (!shapeOk[i]) { out.push({ field: `${v}.nodes`, ...(isObj(raw) ? withId(raw.id) : {}), code: 'shape' }); return; }
    const n = raw as Obj & { id: string; position: Obj; data: Obj & { label: string; path: string } };
    const at = withId(n.id);
    const push = (f: string, code: SitemapIssueCode) => out.push({ field: `${v}.${f}`, ...at, code });
    if (!onlyKeys(n, ['id', 'position', 'data']) || !onlyKeys(n.data, ['label', 'path', 'kind', 'reason'])) { push('nodes', 'unknown_key'); return; }
    if (!idOk(n.id)) push('id', 'id_format');
    else if (seen.has(n.id)) push('id', 'id_duplicate');
    seen.add(n.id);
    const le = validateLabel(n.data.label);
    if (le) push('label', LABEL_CODE[le]);
    else if (LABEL_CONTROL.test(n.data.label)) push('label', 'label_control');
    const pe = validatePath(n.data.path, nodes, n.id);
    if (pe) push('path', PATH_CODE[pe]);
    else if (n.data.path !== n.data.path.trim()) push('path', 'path_chars');
    const r = n.data.reason;
    if (r !== undefined) {
      if (typeof r !== 'string') push('reason', 'shape');
      else if (r.length > SITEMAP_LIMITS.reason) push('reason', 'reason_too_long');
      else if (TEXT_CONTROL.test(r)) push('reason', 'reason_control');
    }
    if (!SITEMAP_KINDS.includes(n.data.kind as SitemapNode['data']['kind'])) push('kind', 'kind');
    const p = n.position;
    const coordOk = (x: unknown) => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= SITEMAP_LIMITS.coord;
    if (!onlyKeys(p, ['x', 'y']) || !coordOk(p.x) || !coordOk(p.y)) push('position', 'position');
  });
  if (nodesIn.length > 0 && nodes.filter((n) => n.data.kind === 'home').length !== 1) out.push({ field: `${v}.nodes`, code: 'home_count' });

  const ids = new Set(nodes.map((n) => n.id));
  const edgeIds = new Set<string>();
  const pairs = new Set<string>();
  for (const raw of edgesIn) {
    if (!isObj(raw) || typeof raw.id !== 'string' || typeof raw.source !== 'string' || typeof raw.target !== 'string') {
      out.push({ field: `${v}.edges`, ...(isObj(raw) ? withId(raw.source) : {}), code: 'shape' });
      continue;
    }
    const { id, source, target } = raw as Obj & SitemapEdge;
    const push = (code: SitemapIssueCode) => out.push({ field: `${v}.edges`, ...withId(source), code });
    const pair = `${source}\u0000${target}`;
    if (!onlyKeys(raw, ['id', 'source', 'target'])) push('unknown_key');
    else if (!EDGE_ID_RE.test(id)) push('edge_id');
    else if (edgeIds.has(id)) push('edge_id_duplicate');
    else if (!ids.has(source) || !ids.has(target)) push('edge_endpoint');
    else if (source === target) push('edge_self');
    else if (pairs.has(pair)) push('edge_duplicate');
    edgeIds.add(id);
    pairs.add(pair);
  }
}

/**
 * サイトマップの文書（{before, after, devComment?}）を PLAN §7 の全項目で検査する。
 * maxPages は AI の出力で SITEMAP_LIMITS.aiPages を渡す。空の図（ページ 0 件）は可（現在のサイトが無い案件。改善後トップ＋1 件は依頼の時に別に見る）
 */
export function validateSitemapDoc(doc: unknown, opts: { maxPages?: number } = {}): { ok: boolean; errors: SitemapIssue[] } {
  const errors: SitemapIssue[] = [];
  if (!isObj(doc)) return { ok: false, errors: [{ field: 'doc', code: 'shape' }] };
  const maxPages = opts.maxPages ?? SITEMAP_LIMITS.pages;
  checkDiagram('before', doc.before, maxPages, errors);
  checkDiagram('after', doc.after, maxPages, errors);
  const c = doc.devComment;
  if (c !== undefined && c !== null) {
    if (!isObj(c) || typeof c.text !== 'string') errors.push({ field: 'devComment', code: 'shape' });
    else if (c.text.trim().length > SITEMAP_LIMITS.devComment) errors.push({ field: 'devComment', code: 'devComment_too_long' });
    else if (TEXT_CONTROL.test(c.text)) errors.push({ field: 'devComment', code: 'devComment_control' });
  }
  return { ok: errors.length === 0, errors };
}

/* ---------- contentHash の正規化（DATA §2.3） ---------- */

/** 日時を ISO 文字列へ（ISO 文字列・Date・Firestore の Timestamp を同じ値にする） */
function isoOf(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (v instanceof Date) return v.toISOString();
  if (isObj(v) && typeof v.toDate === 'function') return (v.toDate as () => Date)().toISOString();
  return null;
}

interface DiagramLike { nodes?: readonly SitemapNode[]; edges?: readonly SitemapEdge[] }
export interface CanonicalSitemapInput {
  before?: DiagramLike;
  after?: DiagramLike;
  devComment?: { text: string; at?: unknown; byName?: string } | null;
}

const diagramOf = (d: DiagramLike | undefined) => ({
  nodes: (d?.nodes ?? []).map((n) => ({
    id: n.id,
    position: { x: n.position?.x, y: n.position?.y },
    data: { label: n.data?.label, path: n.data?.path, kind: n.data?.kind, reason: n.data?.reason },
  })),
  edges: (d?.edges ?? []).map((e) => ({ id: e.id, source: e.source, target: e.target })),
});

/**
 * contentHash の元（sha256 はサーバー＝node:crypto。U-F1 の contentHashOf）。お客様に見える項目
 * （label・path・reason・kind・position・接続・devComment の text/at/byName）だけを、キー順をそろえて並べる。
 * 版文書に項目を足すなら同時にここへ足す（sec L-3）。ページ・接続の並びは保つ
 */
export function canonicalSitemapJson(doc: CanonicalSitemapInput): string {
  const c = doc.devComment;
  return canonicalJson({
    v: 1,
    before: diagramOf(doc.before),
    after: diagramOf(doc.after),
    devComment: c ? { text: c.text, at: isoOf(c.at), byName: c.byName } : undefined,
  });
}
