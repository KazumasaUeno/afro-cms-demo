/**
 * サイトマップの AI へ送るデータ（LIVE_SITEMAP_AI.md §1）と「現在」の木（P-4。ルールで決定的に作る）。純粋関数。
 * - 送るのは承認済み要件定義書の一部・回答 9 問（許可リスト）・現行サイトのナビ（文字＋同一ホストのパス）・ホスト名だけ（§1.1）
 * - 送らない: q-infra・q-dns-*・q-competitor・案件名・氏名・メール・社内メモ・サイト本文 ほか（§1.2。スナップショットテストで固定）
 * - 全テキストに redactText。上限は SITEMAP_AI_LIMITS（[TARGET]）
 */
import { SITEMAP_AI_LIMITS as L } from './limits';
import { REQ_DOC_CATALOG } from './shared/reqDocCatalog';
import { hostnameOf, redactText } from './shared/redact';
import { SITEMAP_LIMITS, validateLabel, validatePath } from './shared/sitemapRules';
import type { SitemapSpec } from './shared/sitemapLayout';
import type { NavItem } from './site/extract';

/** サイトマップ用に送る回答（buildSentAnswers を使わない。AI 設計 §1.1） */
export const SITEMAP_SENT_QUESTION_IDS = [
  'q-purpose', 'q-target', 'q-content', 'q-feature', 'q-cv', 'q-improve', 'q-issue', 'q-strength', 'q-seo',
] as const;

/** v3 の要件定義書から送る項目（目的・背景・種別・ターゲット・章 04・機能 07） */
export const SITEMAP_REQ_V3_ITEMS = [
  't01-03', 't01-04', 't03-01', 't03-02', 't04-01', 't04-02', 't04-04', 't04-05',
  't07-01', 't07-02', 't07-03', 't07-04', 't07-05', 't07-06', 't07-07', 't07-08',
] as const;

export type BeforeSource = 'nav' | 'unavailable';

/** 「現在」の 1 ページ（AI へ送る形。key は ^[a-z0-9-]{1,40}$。parentKey null はトップ） */
export interface BeforePage { key: string; label: string; path: string; kind: 'home' | 'section' | 'page' | 'cta'; parentKey: string | null }
export interface BeforeTree { source: BeforeSource; pages: BeforePage[] }

export const KEY_RE = /^[a-z0-9-]{1,40}$/;
/** 制御文字・向きの制御（ページ名は改行も除く） */
export const CONTROL_ALL = /[\u0000-\u001F\u007F‪-‮⁦-⁩]/g;
/** 文の制御文字（改行は残す） */
export const CONTROL_TEXT = /[\u0000-\u0009\u000B-\u001F\u007F‪-‮⁦-⁩]/g;
const cutCp = (s: string, n: number) => [...s].slice(0, n).join('');
/** UTF-16 の長さ（String.length。validateSitemapDoc の判定）で n 以内に切る。サロゲートの途中では切らない */
export function cutUnits(s: string, n: number): string {
  let out = '';
  for (const c of s) {
    if (out.length + c.length > n) break;
    out += c;
  }
  return out;
}
/** 表示するページ名に入っていたら捨てる文字・語（S-16。除去でごまかさない） */
export const UNSAFE_LABEL_RE = /[<>＜＞]|(?:java|vb)\s*script\s*:|data\s*:/i;

/**
 * 表示する文の消毒（AI 設計 §3.2 ②・S-16）: redactText → 制御文字 → `<` `>` → `javascript:` / `data:` / `vbscript:` の除去。
 * 画面はプレーンテキストで描く（U3/U4）。ここは二重の守り
 */
export function sanitizeText(s: string, opts: { singleLine?: boolean } = {}): string {
  let t = redactText(String(s ?? ''));
  t = t.replace(opts.singleLine ? CONTROL_ALL : CONTROL_TEXT, opts.singleLine ? ' ' : '');
  t = t.replace(/[<>＜＞]/g, '');
  // 除去でつながって新しい語ができないよう、無くなるまで繰り返す
  for (let i = 0; i < 5; i += 1) {
    const next = t.replace(/(?:java|vb)\s*script\s*:|data\s*:/gi, '');
    if (next === t) break;
    t = next;
  }
  return t.replace(/[ \t]{2,}/g, ' ').trim();
}

/** パスの正規化（小文字・`//` の圧縮・末尾 `/` 除去） */
export function normalizePath(p: string): string {
  let s = String(p ?? '').trim().toLowerCase().replace(/\/{2,}/g, '/');
  if (s.length > 1) s = s.replace(/\/+$/, '') || '/';
  return s;
}

/** 個人情報らしいパスの段（電話・郵便番号・会員番号など数字 7 桁以上、または redactText が反応するもの）の置き換え */
export const REDACTED_SEGMENT = 'redacted';
const PII_DIGITS = 7;

/**
 * AI へ送るパス（codex P2 PII）: 段ごとに、数字が 7 桁以上ある段・redactText が反応する段を 'redacted' にする（階層は残す）。
 * 例: /customers/090-1234-5678 → /customers/redacted。保存する「現在」の図のパスは変えない（チームが見る値）
 */
export function redactPathForAi(path: string): string {
  return path.split('/').map((seg) => {
    if (!seg) return seg;
    const digits = (seg.match(/[0-9]/g) ?? []).length;
    return digits >= PII_DIGITS || redactText(seg) !== seg ? REDACTED_SEGMENT : seg;
  }).join('/');
}

/** パス → key（'/' は home。英数字以外はハイフン。重複は -2, -3…）。key も AI へ送るので、個人情報らしい段を除いたパスから作る */
function keyFromPath(rawPath: string, used: Set<string>): string {
  const path = redactPathForAi(rawPath);
  const baseRaw = path === '/' ? 'home' : path.slice(1).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 36);
  const base = baseRaw || 'p';
  let k = base;
  for (let i = 2; used.has(k); i += 1) k = `${base}-${i}`;
  used.add(k);
  return k;
}

const CTA_RE = /問い?合わ?せ|問合せ|contact/i;

/**
 * 「現在」の木（AI 設計 §1.3。P-4）: トップ `/` ＋ ナビ。親はパスの 1 段上がナビにあればそれ、無ければトップ。
 * 3 段目以降は 2 段目の親（第 1 階層）へ寄せる。同じパスは先勝ち。kind は第 1 階層 section・第 2 階層 page・問い合わせは cta
 */
export function beforeTreeFromNav(navItems: readonly NavItem[] | null | undefined): BeforeTree {
  const used = new Set<string>(['home']);
  const home: BeforePage = { key: 'home', label: 'トップ', path: '/', kind: 'home', parentKey: null };
  const list = Array.isArray(navItems) ? navItems.slice(0, L.navItems) : [];
  const byPath = new Map<string, BeforePage>([['/', home]]);
  for (const item of list) {
    if (!item || typeof item.text !== 'string' || typeof item.path !== 'string') continue;
    const path = normalizePath(item.path);
    if (byPath.has(path) || validatePath(path, []) !== null) continue;
    const label = cutCp(sanitizeText(item.text, { singleLine: true }), SITEMAP_LIMITS.label);
    if (validateLabel(label) !== null) continue;
    byPath.set(path, { key: keyFromPath(path, used), label, path, kind: 'page', parentKey: null });
  }
  const pages = [...byPath.values()];
  const parentOf = (p: BeforePage): BeforePage | undefined => {
    if (p.path === '/') return undefined;
    const up = p.path.slice(0, p.path.lastIndexOf('/')) || '/';
    return up === '/' ? home : byPath.get(up) ?? home;
  };
  for (const p of pages) {
    if (p === home) continue;
    let parent = parentOf(p) ?? home;
    // 第 3 階層以下: 第 1 階層の祖先へ寄せる
    while (parent !== home && (parentOf(parent) ?? home) !== home) parent = parentOf(parent) ?? home;
    p.parentKey = parent === home ? null : parent.key;
  }
  for (const p of pages) {
    if (p === home) continue;
    p.kind = CTA_RE.test(p.label) ? 'cta' : p.parentKey === null ? 'section' : 'page';
  }
  return { source: pages.length > 1 ? 'nav' : 'unavailable', pages };
}

/** 「現在」の木 → tree() の並び（第 1 階層は parentKey 無し。issue は理由欄へ） */
export function beforeSpecs(tree: BeforeTree, issues: ReadonlyMap<string, string> = new Map()): SitemapSpec[] {
  return tree.pages.map((p) => [p.key, p.label, p.path, p.kind, issues.get(p.key), p.parentKey ?? undefined] as SitemapSpec);
}

/* ---------- 送るデータ ---------- */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v : '');

export interface SitemapRequirementsV2 { version: 2; summary: string; points: string[]; goal: string; target: string; contents: string; features: string }
export interface SitemapRequirementsV3 { version: 3; summary: string; items: { id: string; label: string; text: string }[] }
export type SitemapRequirements = SitemapRequirementsV2 | SitemapRequirementsV3 | null;

/** 予算（合計の文字数）の中で順に切る */
function budget(total: number) {
  let left = total;
  return (s: string) => {
    const t = cutCp(sanitizeText(s), Math.max(0, left));
    left -= [...t].length;
    return t;
  };
}

/** 承認済みの提案（approvals の approve の写し）→ 送る部分（v1・不明は送らない＝null） */
export function requirementsForSitemap(proposal: unknown): SitemapRequirements {
  if (!isObj(proposal)) return null;
  const take = budget(L.requirementsChars);
  if (proposal.version === 3) {
    const doc = isObj(proposal.doc) ? proposal.doc : {};
    const items = isObj(doc.items) ? doc.items : {};
    const tpl = isObj(proposal.template) ? str(proposal.template.version) : '';
    const catalog = REQ_DOC_CATALOG[tpl] ?? Object.values(REQ_DOC_CATALOG)[0];
    const labelOf = (id: string) => catalog?.items.find((i) => i.id === id)?.label ?? '';
    const summary = take(str(proposal.summary));
    const out: SitemapRequirementsV3['items'] = [];
    for (const id of SITEMAP_REQ_V3_ITEMS) {
      const it = items[id];
      if (!isObj(it) || it.status === 'na' || it.status === 'std_pending') continue;
      const text = take(str(it.text));
      if (text) out.push({ id, label: labelOf(id), text });
    }
    return { version: 3, summary, items: out };
  }
  if (proposal.version === 2) {
    const d = isObj(proposal.draft) ? proposal.draft : {};
    const summary = take(str(proposal.summary));
    const points = (Array.isArray(proposal.points) ? proposal.points : []).map((p) => take(isObj(p) ? str(p.title) : '')).filter(Boolean).slice(0, 10);
    return { version: 2, summary, points, goal: take(str(d.goal)), target: take(str(d.target)), contents: take(str(d.contents)), features: take(str(d.features)) };
  }
  return null;
}

/** 回答 → 送る回答（許可リスト 9 問・除去・各 1,000 字） */
export function answersForSitemap(answers: unknown): Record<string, string | string[]> {
  const a = isObj(answers) ? answers : {};
  const out: Record<string, string | string[]> = {};
  for (const id of SITEMAP_SENT_QUESTION_IDS) {
    const v = a[id];
    const take = budget(L.answerChars);
    if (Array.isArray(v)) {
      const list = v.map((x) => take(String(x ?? ''))).filter(Boolean);
      if (list.length) out[id] = list;
    } else if (typeof v === 'string') {
      const t = take(v);
      if (t) out[id] = t;
    }
  }
  return out;
}

export interface SitemapPayload {
  requirements: SitemapRequirements;
  answers: Record<string, string | string[]>;
  currentSite: { hostname: string; beforeSource: BeforeSource; pages: Pick<BeforePage, 'key' | 'label' | 'path' | 'parentKey'>[] };
}

/**
 * AI へ送る payload（送信 payload のスナップショットテストの対象。AC-19）。
 * proposal・answers は承認の写し（サーバーが Firestore から読んだもの。クライアントの本文は使わない＝AC-18）
 */
export function buildSitemapPayload(input: { proposal: unknown; answers: unknown; before: BeforeTree }): SitemapPayload {
  const a = isObj(input.answers) ? input.answers : {};
  const url = Array.isArray(a['q-url']) ? str(a['q-url'][0]) : str(a['q-url']);
  return {
    requirements: requirementsForSitemap(input.proposal),
    answers: answersForSitemap(a),
    currentSite: {
      hostname: hostnameOf(url),
      beforeSource: input.before.source,
      // パスは個人情報らしい段を除いて送る（key は beforeTreeFromNav が除いた後のパスから作っている）
      pages: input.before.pages.map((p) => ({ key: p.key, label: p.label, path: redactPathForAi(p.path), parentKey: p.parentKey })),
    },
  };
}
