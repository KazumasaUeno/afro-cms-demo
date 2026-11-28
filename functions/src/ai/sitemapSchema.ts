/**
 * サイトマップの AI の構造化出力（output_config.format: json_schema）と、受け側の形の検査（LIVE_SITEMAP_AI.md §3.1・§3.2 ①）。
 * - additionalProperties:false・全項目 required・列挙は enum（schema.ts と同じ書き方）
 * - 長さ・件数は Schema に頼らない（maxItems・maxLength の強制は [UNKNOWN] UK-3。サーバーの sitemapPostprocess が切る・捨てる）
 * - 形が違えば null（呼び出し側は 'schema' の失敗にする。再要求しない＝X-1）
 */
export const SITEMAP_OUT_KINDS = ['home', 'section', 'page', 'new', 'cta'] as const;
export const SITEMAP_OUT_CHANGES = ['keep', 'rename', 'move', 'merge', 'split', 'new'] as const;
export type SitemapOutKind = (typeof SITEMAP_OUT_KINDS)[number];
export type SitemapOutChange = (typeof SITEMAP_OUT_CHANGES)[number];

const str = { type: 'string' } as const;
const ROOT_KEYS = ['summary', 'beforeIssues', 'after', 'openQuestions'] as const;
const ISSUE_KEYS = ['key', 'issue'] as const;
const PAGE_KEYS = ['key', 'label', 'path', 'kind', 'parentKey', 'change', 'fromBeforeKeys', 'reason'] as const;

export const SITEMAP_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [...ROOT_KEYS],
  properties: {
    summary: str,
    beforeIssues: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: [...ISSUE_KEYS], properties: { key: str, issue: str } },
    },
    after: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [...PAGE_KEYS],
        properties: {
          key: str,
          label: str,
          path: str,
          kind: { type: 'string', enum: [...SITEMAP_OUT_KINDS] },
          parentKey: { anyOf: [str, { type: 'null' }] },
          change: { type: 'string', enum: [...SITEMAP_OUT_CHANGES] },
          fromBeforeKeys: { type: 'array', items: str },
          reason: str,
        },
      },
    },
    openQuestions: { type: 'array', items: str },
  },
};

export interface RawSitemapPage {
  key: string; label: string; path: string; kind: SitemapOutKind; parentKey: string | null;
  change: SitemapOutChange; fromBeforeKeys: string[]; reason: string;
}
export interface RawSitemapOutput {
  summary: string;
  beforeIssues: { key: string; issue: string }[];
  after: RawSitemapPage[];
  openQuestions: string[];
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const exactKeys = (o: Obj, keys: readonly string[]) => Object.keys(o).length === keys.length && keys.every((k) => k in o);
const isStrList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');
const inList = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === 'string' && (list as readonly string[]).includes(v);

/**
 * 入れすぎの防御（Schema が件数を強制しない前提で、巨大な出力を後段に渡さない）。上限を超える配列は形の不正として扱わず、
 * 後処理が切る。ここでは極端な値（1,000 件超）だけを形の不正にする
 */
const HARD_MAX_ITEMS = 1_000;

/** 形（キー完全一致・型・列挙）だけを確かめる（AI 設計 §3.2 ①）。違えば null */
export function validateSitemapOutput(v: unknown): RawSitemapOutput | null {
  if (!isObj(v) || !exactKeys(v, ROOT_KEYS)) return null;
  const { summary, beforeIssues, after, openQuestions } = v;
  if (typeof summary !== 'string' || !Array.isArray(beforeIssues) || !Array.isArray(after) || !isStrList(openQuestions)) return null;
  if (beforeIssues.length > HARD_MAX_ITEMS || after.length > HARD_MAX_ITEMS || openQuestions.length > HARD_MAX_ITEMS) return null;
  const issues: RawSitemapOutput['beforeIssues'] = [];
  for (const i of beforeIssues) {
    if (!isObj(i) || !exactKeys(i, ISSUE_KEYS) || typeof i.key !== 'string' || typeof i.issue !== 'string') return null;
    issues.push({ key: i.key, issue: i.issue });
  }
  const pages: RawSitemapPage[] = [];
  for (const p of after) {
    if (!isObj(p) || !exactKeys(p, PAGE_KEYS)) return null;
    if (typeof p.key !== 'string' || typeof p.label !== 'string' || typeof p.path !== 'string' || typeof p.reason !== 'string') return null;
    if (!inList(SITEMAP_OUT_KINDS, p.kind) || !inList(SITEMAP_OUT_CHANGES, p.change)) return null;
    if (!(p.parentKey === null || typeof p.parentKey === 'string')) return null;
    if (!isStrList(p.fromBeforeKeys) || p.fromBeforeKeys.length > HARD_MAX_ITEMS) return null;
    pages.push({
      key: p.key, label: p.label, path: p.path, kind: p.kind, parentKey: p.parentKey,
      change: p.change, fromBeforeKeys: [...p.fromBeforeKeys], reason: p.reason,
    });
  }
  return { summary, beforeIssues: issues, after: pages, openQuestions: [...openQuestions] };
}
