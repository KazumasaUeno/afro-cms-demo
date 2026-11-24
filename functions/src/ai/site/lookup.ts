/**
 * 名前解決の守り（設計 §3「接続（S-H2）」。T-02）。node:http(s) の `lookup` に渡す。
 * - 解決した**全部の**アドレスを検査し、1 つでも拒否範囲なら失敗にする（all:true で呼ばれる場合も同じ）
 * - 検査したアドレスだけを返す → そのアドレスにだけ接続する（DNS rebinding 対策。`agent: false` で接続を使い回さない）
 * - 解決関数は注入できる（テストは実ネットワークに出ない）。既定は dns.lookup(all, verbatim)
 */
import { promises as dns, type LookupAddress } from 'node:dns';
import { isPublicAddress } from './ipGuard';
import { isBlockedHostname } from './url';

export type Resolver = (hostname: string) => Promise<LookupAddress[]>;

export const systemResolver: Resolver = (hostname) => dns.lookup(hostname, { all: true, verbatim: true });

export class SiteAddressError extends Error {
  constructor(readonly code: 'blocked-address' | 'resolve-failed' | 'blocked-name') {
    super(`site address rejected: ${code}`);
    this.name = 'SiteAddressError';
    (this as { errno?: string }).errno = 'ESITEBLOCKED';
  }
}

/** 解決して全アドレスを検査する。通ったアドレスの一覧を返す */
export async function resolveChecked(hostname: string, resolve: Resolver): Promise<LookupAddress[]> {
  if (isBlockedHostname(hostname)) throw new SiteAddressError('blocked-name');
  let list: LookupAddress[];
  try {
    list = await resolve(hostname);
  } catch {
    throw new SiteAddressError('resolve-failed');
  }
  if (!Array.isArray(list) || list.length === 0) throw new SiteAddressError('resolve-failed');
  for (const a of list) {
    if (!a || typeof a.address !== 'string' || !isPublicAddress(a.address)) throw new SiteAddressError('blocked-address');
  }
  return list.map((a) => ({ address: a.address, family: a.family === 6 ? 6 : 4 }));
}

/**
 * テスト専用の `route` を本番で使わせない（SEC-L2）。NODE_ENV=production、またはエミュレータ外の Cloud Run / Functions（K_SERVICE あり）なら throw。
 * エミュレータの判定は既存と同じ FUNCTIONS_EMULATOR === 'true'（functions/src/cors.ts・index.ts）
 */
export function assertTestRouteAllowed(route: unknown, env: NodeJS.ProcessEnv = process.env): void {
  if (route === undefined || route === null) return;
  const deployed = !!env.K_SERVICE && env.FUNCTIONS_EMULATOR !== 'true';
  if (env.NODE_ENV === 'production' || deployed) throw new Error('site route is test-only');
}

type LookupCb = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/**
 * http.request の `lookup` オプションの形。`onResolved` は検査を通ったアドレスを受け取る（記録用）。
 * `route` はテスト専用の宛先の付け替え（検査の後でだけ効く。本番の呼び出しは渡さない）
 */
export function guardedLookup(resolve: Resolver, opts: { route?: { address: string } } = {}) {
  assertTestRouteAllowed(opts.route);
  return (hostname: string, options: { all?: boolean } | number | undefined, cb: LookupCb): void => {
    const all = typeof options === 'object' && options !== null && options.all === true;
    resolveChecked(hostname, resolve).then(
      (list) => {
        const out = opts.route ? [{ address: opts.route.address, family: 4 }] : list;
        if (all) cb(null, out);
        else cb(null, out[0].address, out[0].family);
      },
      (e: NodeJS.ErrnoException) => cb(e, '', 4),
    );
  };
}
