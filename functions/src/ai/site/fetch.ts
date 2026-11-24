/**
 * サイトの取得（設計 §3。T-02〜T-04）。依存を増やさず node:http / node:https で 1 回ずつ取る。
 * - 毎回 URL・ポート・IP を検査（url.ts・lookup.ts）。リダイレクトは自動で追わず最大 3 回、毎回検査し直す。https → http へ降りない
 * - `agent: false`（接続を使い回さない）・TLS の証明書検証は既定のまま（rejectUnauthorized を変えない）
 * - 接続 5 秒・全体 10 秒。Accept-Encoding は gzip だけ。受信も展開後も 2 MB で打ち切る（gzip bomb 対策）
 * - `route` はテスト専用（ローカルの HTTP サーバーへ付け替える。URL と IP の検査の後でだけ効く。本番の呼び出しは渡さない）
 */
import * as http from 'node:http';
import * as https from 'node:https';
import { createGunzip } from 'node:zlib';
import { SITE_LIMITS } from '../limits';
import { assertTestRouteAllowed, guardedLookup, type Resolver } from './lookup';
import { parseRedirect, parseSiteUrl } from './url';

export type FetchFailCode = 'timeout' | 'too-large' | 'bad-encoding' | 'too-many-redirects' | 'network' | 'bad-redirect';

export class SiteFetchError extends Error {
  constructor(readonly code: FetchFailCode) {
    super(`site fetch failed: ${code}`);
    this.name = 'SiteFetchError';
  }
}

export interface FetchDeps {
  resolve: Resolver;
  limits?: Partial<Pick<typeof SITE_LIMITS, 'connectMs' | 'totalMs' | 'maxBytes' | 'maxRedirects'>>;
  /** テスト専用: 検査の後の接続先（平文の HTTP） */
  route?: { address: string; port: number };
  now?: () => number;
}

export interface FetchResult {
  url: URL;
  status: number;
  contentType: string;
  body: Buffer;
  /** 受け取った（展開後の）バイト数 */
  bytes: number;
  elapsedMs: number;
  redirects: number;
}

function limitsOf(deps: FetchDeps) {
  return { ...SITE_LIMITS, ...(deps.limits ?? {}) };
}

/** 1 回だけ取る（リダイレクトは追わない） */
export function fetchOnce(url: URL, deps: FetchDeps): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer; bytes: number }> {
  assertTestRouteAllowed(deps.route);
  const lim = limitsOf(deps);
  const mod = deps.route ? http : url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (err: Error | null, value?: { status: number; headers: http.IncomingHttpHeaders; body: Buffer; bytes: number }) => {
      if (done) return;
      done = true;
      clearTimeout(totalTimer);
      if (err) reject(err);
      else resolve(value!);
    };
    const req = mod.request({
      protocol: deps.route ? 'http:' : url.protocol,
      hostname: url.hostname.replace(/^\[|\]$/g, ''),
      port: deps.route ? deps.route.port : url.port || (url.protocol === 'https:' ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      method: 'GET',
      agent: false,
      lookup: guardedLookup(deps.resolve, deps.route ? { route: { address: deps.route.address } } : {}) as never,
      headers: {
        Host: url.host,
        'User-Agent': SITE_LIMITS.userAgent,
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
        'Accept-Encoding': 'gzip',
      },
      ...(url.protocol === 'https:' && !deps.route ? { servername: url.hostname } : {}),
    });
    const totalTimer = setTimeout(() => {
      req.destroy();
      finish(new SiteFetchError('timeout'));
    }, lim.totalMs);
    req.on('socket', (sock) => {
      const t = setTimeout(() => {
        req.destroy();
        finish(new SiteFetchError('timeout'));
      }, lim.connectMs);
      sock.once('connect', () => clearTimeout(t));
      sock.once('secureConnect', () => clearTimeout(t));
      sock.once('close', () => clearTimeout(t));
    });
    req.on('error', (e: Error & { code?: string }) => {
      if (e.name === 'SiteAddressError') finish(e);
      else finish(new SiteFetchError('network'));
    });
    req.on('response', (res) => {
      const status = res.statusCode ?? 0;
      const enc = String(res.headers['content-encoding'] ?? 'identity').toLowerCase().trim();
      if (status >= 300 && status < 400) {
        res.resume();
        finish(null, { status, headers: res.headers, body: Buffer.alloc(0), bytes: 0 });
        req.destroy();
        return;
      }
      if (enc !== 'identity' && enc !== 'gzip' && enc !== '') {
        res.destroy();
        req.destroy();
        finish(new SiteFetchError('bad-encoding'));
        return;
      }
      let raw = 0;
      const chunks: Buffer[] = [];
      let size = 0;
      const tooLarge = () => {
        res.destroy();
        req.destroy();
        finish(new SiteFetchError('too-large'));
      };
      res.on('data', (c: Buffer) => {
        raw += c.length;
        if (raw > lim.maxBytes) tooLarge();
      });
      const stream = enc === 'gzip' ? res.pipe(createGunzip()) : res;
      stream.on('data', (c: Buffer) => {
        size += c.length;
        if (size > lim.maxBytes) {
          if (stream !== res) (stream as NodeJS.ReadableStream & { destroy(): void }).destroy();
          tooLarge();
          return;
        }
        chunks.push(c);
      });
      stream.on('end', () => finish(null, { status, headers: res.headers, body: Buffer.concat(chunks), bytes: size }));
      stream.on('error', () => finish(new SiteFetchError(enc === 'gzip' ? 'bad-encoding' : 'network')));
      res.on('error', () => finish(new SiteFetchError('network')));
    });
    req.end();
  });
}

/** リダイレクトを（検査しながら）最大 maxRedirects 回まで追って取る */
export async function fetchFollow(start: string | URL, deps: FetchDeps): Promise<FetchResult> {
  const lim = limitsOf(deps);
  const now = deps.now ?? Date.now;
  const t0 = now();
  let url = typeof start === 'string' ? parseSiteUrl(start) : parseSiteUrl(start.href);
  for (let redirects = 0; ; redirects++) {
    const r = await fetchOnce(url, deps);
    if (r.status >= 300 && r.status < 400) {
      const loc = r.headers.location;
      if (typeof loc !== 'string' || loc.length === 0) throw new SiteFetchError('bad-redirect');
      if (redirects >= lim.maxRedirects) throw new SiteFetchError('too-many-redirects');
      url = parseRedirect(loc, url);
      continue;
    }
    return {
      url,
      status: r.status,
      contentType: String(r.headers['content-type'] ?? '').toLowerCase(),
      body: r.body,
      bytes: r.bytes,
      elapsedMs: Math.max(0, now() - t0),
      redirects,
    };
  }
}
