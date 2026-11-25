/**
 * 現行サイトの診断（設計 §3）。トップページ 1 枚・同じホストの robots.txt・sitemap.xml（有無だけ）。競合は取得しない。
 * - robots.txt で `/` が Disallow（`*` か自分の UA）なら取得せず status 'blocked'
 * - 基本チェック（AI ではない）は AI_SITE_CHECK_KEYS の 10 項目。合格の目安は limits.ts（[TARGET]）
 * - 失敗しても例外にしない（提案は回答だけで作る）。結果の code は種別だけ（URL・本文を入れない）
 */
import { SITE_CHECK_THRESHOLDS, SITE_LIMITS } from '../limits';
import { AI_SITE_CHECK_KEYS, type SiteCheck, type SiteCheckItem } from '../shared/aiDraft';
import { extractHtml, type Extracted } from './extract';
import { fetchFollow, SiteFetchError, type FetchDeps } from './fetch';
import { SiteAddressError } from './lookup';
import { parseSiteUrl, SiteUrlError } from './url';

export interface SiteCheckResult {
  siteCheck: SiteCheck;
  siteFacts: Record<string, string | number | boolean | null>;
  siteText: string;
  /** 失敗・拒否の種別（'site-…'）。成功なら null */
  code: string | null;
}

/** 例外を種別の文字列にする（メッセージ・URL を使わない） */
export function siteErrorCode(e: unknown): string {
  if (e instanceof SiteUrlError) return `site-url-${e.code}`;
  if (e instanceof SiteAddressError) return `site-${e.code}`;
  if (e instanceof SiteFetchError) return `site-${e.code}`;
  return 'site-error';
}

/** robots.txt が `/` を禁じているか（`*` と自分の UA のグループだけを見る） */
export function robotsDisallowsRoot(body: string, ua: string = SITE_LIMITS.userAgent): boolean {
  const name = ua.split('/')[0].toLowerCase();
  let applies = false;
  let inAgents = false;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === 'user-agent') {
      const a = val.toLowerCase();
      const hit = a === '*' || a === name || name.startsWith(a);
      applies = inAgents ? applies || hit : hit;
      inAgents = true;
      continue;
    }
    inAgents = false;
    if (applies && key === 'disallow' && val === '/') return true;
  }
  return false;
}

const failed = (code: string, status: SiteCheck['status'] = 'failed'): SiteCheckResult => ({
  siteCheck: { status, passed: 0, total: 0, items: [] },
  siteFacts: {},
  siteText: '',
  code,
});

/** 基本チェックの 10 項目 */
export function basicChecks(x: { https: boolean; extracted: Extracted; bytes: number; elapsedMs: number; sitemap: boolean }): SiteCheckItem[] {
  const t = SITE_CHECK_THRESHOLDS;
  const e = x.extracted;
  const titleLen = [...e.title].length;
  const h1 = e.headings.filter((h) => h.level === 1).length;
  const altPct = e.images === 0 ? 0 : Math.round((e.imagesMissingAlt / e.images) * 100);
  const items: Record<(typeof AI_SITE_CHECK_KEYS)[number], SiteCheckItem> = {
    https: { key: 'https', ok: x.https, value: x.https },
    viewport: { key: 'viewport', ok: /width\s*=\s*device-width/i.test(e.viewport), value: e.viewport.length > 0 },
    'title-length': { key: 'title-length', ok: titleLen >= t.titleMin && titleLen <= t.titleMax, value: titleLen },
    description: { key: 'description', ok: e.description.length > 0, value: e.description.length > 0 },
    'h1-count': { key: 'h1-count', ok: h1 === 1, value: h1 },
    'alt-missing': { key: 'alt-missing', ok: altPct <= t.altMissingMaxPercent, value: altPct },
    'page-size': { key: 'page-size', ok: x.bytes <= t.pageMaxBytes, value: x.bytes },
    'response-time': { key: 'response-time', ok: x.elapsedMs <= t.responseMaxMs, value: x.elapsedMs },
    sitemap: { key: 'sitemap', ok: x.sitemap, value: x.sitemap },
    'structured-data': { key: 'structured-data', ok: e.hasStructuredData, value: e.hasStructuredData },
  };
  return AI_SITE_CHECK_KEYS.map((k) => items[k]);
}

/** AI へ渡す本文（見出し・ナビ・本文。除去済み。最大 12,000 文字） */
export function siteTextOf(e: Extracted): string {
  const parts = [
    e.title && `title: ${e.title}`,
    e.description && `description: ${e.description}`,
    ...e.headings.map((h) => `h${h.level}: ${h.text}`),
    e.navLinks.length > 0 && `nav: ${e.navLinks.join(' | ')}`,
    e.text && `body: ${e.text}`,
  ].filter((x): x is string => typeof x === 'string' && x.length > 0);
  return [...parts.join('\n')].slice(0, SITE_LIMITS.maxTextChars).join('');
}

/** 診断を 1 回行う */
export async function runSiteCheck(siteUrl: string, deps: FetchDeps & { nowIso: () => string }): Promise<SiteCheckResult> {
  let top: URL;
  try {
    top = parseSiteUrl(siteUrl);
  } catch (e) {
    return failed(siteErrorCode(e));
  }
  const origin = `${top.protocol}//${top.host}`;
  try {
    // robots.txt（同じ守りを通す。取れない・404 は「禁止なし」）。私設へ向かう等の拒否は全体の失敗
    try {
      const r = await fetchFollow(`${origin}/robots.txt`, deps);
      if (r.status === 200 && robotsDisallowsRoot(r.body.toString('utf8'))) return failed('site-robots-disallow', 'blocked');
    } catch (e) {
      if (!(e instanceof SiteFetchError)) throw e;
    }
    const page = await fetchFollow(top, deps);
    if (page.status < 200 || page.status >= 300) return failed(`site-http-${page.status}`);
    if (!/^text\/html\b|^application\/xhtml\+xml\b/.test(page.contentType)) return failed('site-not-html');
    let sitemap = false;
    try {
      const s = await fetchFollow(`${origin}/sitemap.xml`, deps);
      sitemap = s.status === 200;
    } catch (e) {
      if (!(e instanceof SiteFetchError)) throw e;
    }
    const extracted = extractHtml(page.body.toString('utf8'));
    const items = basicChecks({ https: page.url.protocol === 'https:', extracted, bytes: page.bytes, elapsedMs: page.elapsedMs, sitemap });
    const siteFacts = Object.fromEntries(items.map((i) => [i.key, i.value]));
    return {
      siteCheck: { status: 'ok', fetchedAt: deps.nowIso(), passed: items.filter((i) => i.ok).length, total: items.length, items },
      siteFacts,
      siteText: siteTextOf(extracted),
      code: null,
    };
  } catch (e) {
    return failed(siteErrorCode(e));
  }
}
