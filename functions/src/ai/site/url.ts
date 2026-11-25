/**
 * サイト取得の URL の検査（設計 §3「URL の解釈」。T-01・T-03）。
 * - WHATWG URL で解釈。http: / https: だけ。ポートは既定（80/443）だけ。user:pass@ は拒否
 * - ホストが IP リテラルなら拒否（10 進・16 進・8 進・短縮表記は URL の解釈で a.b.c.d に正規化されてから net.isIP で判定）
 * - 名前 localhost・*.localhost・metadata.google.internal・*.internal は拒否（末尾の . と大文字小文字を無視）
 * - リダイレクトの Location は現在の URL を基準に解決してから同じ検査を通す。https → http へ降りない
 */
import { isIP } from 'node:net';

export type UrlRejectCode = 'invalid-url' | 'bad-scheme' | 'bad-port' | 'credentials' | 'ip-literal' | 'blocked-name' | 'downgrade';

export class SiteUrlError extends Error {
  constructor(readonly code: UrlRejectCode) {
    super(`site url rejected: ${code}`);
    this.name = 'SiteUrlError';
  }
}

const BLOCKED_NAMES = new Set(['localhost', 'metadata.google.internal', 'metadata', 'metadata.goog']);

/** 名前としての拒否（末尾の . を外し小文字で比べる） */
export function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.+$/, '');
  if (h.length === 0) return true;
  if (BLOCKED_NAMES.has(h)) return true;
  return h.endsWith('.localhost') || h.endsWith('.internal') || h.endsWith('.local');
}

/** URL のホスト部（[] を外した形）が IP リテラルか */
export function isIpLiteralHost(hostname: string): boolean {
  const h = hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
  return isIP(h) !== 0;
}

/** 取得してよい URL に正規化する（だめなら SiteUrlError） */
export function parseSiteUrl(raw: string, base?: URL): URL {
  let u: URL;
  try {
    u = base ? new URL(raw, base) : new URL(raw.trim());
  } catch {
    throw new SiteUrlError('invalid-url');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new SiteUrlError('bad-scheme');
  if (u.username !== '' || u.password !== '') throw new SiteUrlError('credentials');
  // WHATWG URL は既定のポート（http 80・https 443）を '' にする。それ以外は拒否（http の 443・https の 80 も拒否）
  if (u.port !== '') throw new SiteUrlError('bad-port');
  if (isIpLiteralHost(u.hostname)) throw new SiteUrlError('ip-literal');
  if (isBlockedHostname(u.hostname)) throw new SiteUrlError('blocked-name');
  u.hash = '';
  return u;
}

/** リダイレクト先を検査する（相対・プロトコル相対も現在の URL で解決してから） */
export function parseRedirect(location: string, current: URL): URL {
  const next = parseSiteUrl(location, current);
  if (current.protocol === 'https:' && next.protocol === 'http:') throw new SiteUrlError('downgrade');
  return next;
}
