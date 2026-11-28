/**
 * HTML → AI へ渡す材料（設計 §3「HTML → 入力」）。依存を増やさない決定的な抽出（完全な HTML パーサーではない）。
 * - 取り出す: title・meta description・viewport・canonical・h1〜h3・ナビのリンク文字列（最大 50）・本文（最大 12,000 文字）
 * - 除く: script / style / noscript / template / コメント / 非表示の要素（hidden 属性・aria-hidden="true"・style の display:none / visibility:hidden）
 * - 本文と見出しにも連絡先の除去（shared/redact.ts）をかける。生 HTML は返さない・保存しない
 * - 基本チェック用の事実（画像の数と alt の欠け・構造化データの有無）もここで数える（script を除く前に）
 * - navItems（サイトマップの「現在」。LIVE_SITEMAP_AI.md §1.3）: baseUrl を渡したときだけ、ナビの <a> の href を parseRedirect で解釈し、
 *   取得したトップと同じホストのパスだけを残す（クエリ・フラグメントは捨てる・小文字・末尾 / 除去・validatePath を通るものだけ）。navLinks は不変
 */
import { SITE_LIMITS } from '../limits';
import { redactText } from '../shared/redact';
import { SITEMAP_LIMITS, validatePath } from '../shared/sitemapRules';
import { parseRedirect } from './url';

export interface NavItem {
  text: string;
  path: string;
}

export interface Extracted {
  title: string;
  description: string;
  viewport: string;
  canonical: string;
  headings: { level: 1 | 2 | 3; text: string }[];
  navLinks: string[];
  /** ナビの文字と同一ホストのパス（baseUrl を渡したときだけ。渡さなければ []） */
  navItems: NavItem[];
  text: string;
  images: number;
  imagesMissingAlt: number;
  hasStructuredData: boolean;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const squash = (s: string) => decodeEntities(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  if (!m) return new RegExp(`\\s${name}(?=[\\s/>])`, 'i').test(tag) ? '' : null;
  return decodeEntities(m[1] ?? m[2] ?? m[3] ?? '');
}

const isHiddenTag = (tag: string) => {
  if (attr(tag, 'hidden') !== null) return true;
  if ((attr(tag, 'aria-hidden') ?? '').toLowerCase() === 'true') return true;
  const style = (attr(tag, 'style') ?? '').toLowerCase().replace(/\s+/g, '');
  return style.includes('display:none') || style.includes('visibility:hidden');
};

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

/** 非表示の要素を中身ごと除く（同じ名前の入れ子も数えて閉じる） */
function stripHidden(html: string): string {
  const open = /<([a-z][a-z0-9-]*)\b[^>]*>/gi;
  let out = '';
  let pos = 0;
  let m: RegExpExecArray | null;
  while ((m = open.exec(html))) {
    const name = m[1].toLowerCase();
    if (!isHiddenTag(m[0]) || /\/>$/.test(m[0]) || VOID.has(name)) continue;
    const re = new RegExp(`<(/?)${name}\\b[^>]*>`, 'gi');
    re.lastIndex = m.index + m[0].length;
    let depth = 1;
    // 閉じタグが無ければタグだけを除く（以降を丸ごと消さない）
    let end = m.index + m[0].length;
    let t: RegExpExecArray | null;
    while ((t = re.exec(html))) {
      depth += t[1] === '/' ? -1 : 1;
      if (depth === 0) {
        end = t.index + t[0].length;
        break;
      }
    }
    out += html.slice(pos, m.index) + ' ';
    pos = end;
    open.lastIndex = end;
  }
  return out + html.slice(pos);
}

/** ナビの href → 同一ホストのパス（取れなければ null。例外を投げない） */
export function navPathOf(href: string | null, base: URL): string | null {
  if (!href || !href.trim()) return null;
  let u: URL;
  try {
    u = parseRedirect(href.trim(), base);
  } catch {
    return null;
  }
  if (u.hostname !== base.hostname) return null;
  let path = u.pathname.toLowerCase();
  if (path.length > 1) path = path.replace(/\/+$/, '') || '/';
  return validatePath(path, []) === null ? path : null;
}

function toBase(baseUrl: URL | string | undefined): URL | null {
  if (baseUrl === undefined) return null;
  try {
    return baseUrl instanceof URL ? baseUrl : new URL(baseUrl);
  } catch {
    return null;
  }
}

export function extractHtml(html: string, maxChars: number = SITE_LIMITS.maxTextChars, baseUrl?: URL | string): Extracted {
  const hasStructuredData = /<script\b[^>]*type\s*=\s*["']?application\/ld\+json/i.test(html) || /\sitemscope(?=[\s>=])/i.test(html);
  let h = html
    .replace(/<!--[\s\S]*?(-->|$)/g, ' ')
    .replace(/<(script|style|noscript|template)\b[\s\S]*?(<\/\1\s*>|$)/gi, ' ');
  const head = /<head\b[\s\S]*?<\/head>/i.exec(h)?.[0] ?? h;
  const title = squash(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1] ?? '');
  const metas = head.match(/<meta\b[^>]*>/gi) ?? [];
  const meta = (name: string) => {
    for (const t of metas) if ((attr(t, 'name') ?? '').toLowerCase() === name) return (attr(t, 'content') ?? '').trim();
    return '';
  };
  const links = head.match(/<link\b[^>]*>/gi) ?? [];
  const canonical = links.map((t) => ((attr(t, 'rel') ?? '').toLowerCase().split(/\s+/).includes('canonical') ? attr(t, 'href') ?? '' : '')).find((x) => x) ?? '';

  h = stripHidden(h.replace(/<head\b[\s\S]*?<\/head>/i, ' '));
  const imgs = h.match(/<img\b[^>]*>/gi) ?? [];
  const imagesMissingAlt = imgs.filter((t) => (attr(t, 'alt') ?? null) === null).length;
  const headings: Extracted['headings'] = [];
  for (const m of h.matchAll(/<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi)) {
    const text = redactText(squash(m[2]));
    if (text) headings.push({ level: Number(m[1]) as 1 | 2 | 3, text: text.slice(0, 200) });
  }
  const navLinks: string[] = [];
  const navItems: NavItem[] = [];
  const base = toBase(baseUrl);
  for (const nav of h.matchAll(/<nav\b[^>]*>([\s\S]*?)<\/nav\s*>/gi)) {
    for (const a of nav[1].matchAll(/<a\b[^>]*>([\s\S]*?)<\/a\s*>/gi)) {
      const t = redactText(squash(a[1]));
      if (t && navLinks.length < SITE_LIMITS.maxNavLinks) navLinks.push(t.slice(0, 100));
      if (!base || !t || navItems.length >= SITE_LIMITS.maxNavLinks) continue;
      const openTag = /^<a\b[^>]*>/i.exec(a[0])?.[0] ?? '';
      const path = navPathOf(attr(openTag, 'href'), base);
      if (path) navItems.push({ text: t.slice(0, 100), path: path.slice(0, SITEMAP_LIMITS.path) });
    }
  }
  const body = /<body\b[^>]*>([\s\S]*)/i.exec(h)?.[1] ?? h;
  const text = [...redactText(squash(body.replace(/<\/(p|div|li|h[1-6]|br|tr|section|article)\s*>/gi, ' ')))].slice(0, maxChars).join('');
  return {
    title: redactText(title),
    description: redactText(meta('description')),
    viewport: meta('viewport'),
    canonical,
    headings,
    navLinks,
    navItems,
    text,
    images: imgs.length,
    imagesMissingAlt,
    hasStructuredData,
  };
}
