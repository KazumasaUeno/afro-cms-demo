/**
 * 接続してよい IP か（設計 §3「IP の検査（S-H1）」。T-01）。グローバルユニキャストだけを許す。
 * - IPv4 の拒否範囲は設計の一覧。IPv6 は 2000::/3 の中だけを許し、その中の特殊用途（Teredo・文書用・6to4 など）を拒否
 * - ::ffff:a.b.c.d（対応アドレス）は IPv4 に戻して判定し直す。::/96（IPv4 互換・:: ・::1）は丸ごと拒否
 * - ゾーン ID（fe80::1%eth0）・解釈できない値は拒否（fail-closed）
 */
import { BlockList, isIP } from 'node:net';

const V4_BLOCKED: [string, number][] = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4], ['255.255.255.255', 32],
];
const V6_BLOCKED: [string, number][] = [
  ['::', 96], ['::ffff:0:0', 96], ['64:ff9b::', 96], ['64:ff9b:1::', 48], ['100::', 64],
  // 2001::/23 は IETF のプロトコル用（Teredo 2001::/32・ベンチマーク・ORCHID を含む）
  ['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8],
];

const v4Blocked = new BlockList();
for (const [a, p] of V4_BLOCKED) v4Blocked.addSubnet(a, p, 'ipv4');
const v6Blocked = new BlockList();
for (const [a, p] of V6_BLOCKED) v6Blocked.addSubnet(a, p, 'ipv6');
const v6Global = new BlockList();
v6Global.addSubnet('2000::', 3, 'ipv6');

/** IPv6 を 8 個の 16 ビット値に展開する（末尾の a.b.c.d 表記を含む）。解釈できなければ null */
export function expandIPv6(addr: string): number[] | null {
  if (isIP(addr) !== 6) return null;
  let s = addr.toLowerCase();
  const tail: number[] = [];
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (v4) {
    const o = v4[1].split('.').map(Number);
    tail.push((o[0] << 8) | o[1], (o[2] << 8) | o[3]);
    s = s.slice(0, -v4[1].length);
    if (s.endsWith(':') && !s.endsWith('::')) s = s.slice(0, -1);
  }
  const [head, rest] = s.includes('::') ? s.split('::') : [s, undefined];
  const parse = (part: string | undefined) => (part ? part.split(':').filter((x) => x.length > 0).map((x) => parseInt(x, 16)) : []);
  const h = parse(head);
  const r = parse(rest);
  const need = 8 - tail.length;
  const zeros = rest === undefined ? 0 : need - h.length - r.length;
  if (zeros < 0) return null;
  const out = [...h, ...Array(zeros).fill(0), ...r, ...tail];
  return out.length === 8 && out.every((x) => Number.isInteger(x) && x >= 0 && x <= 0xffff) ? out : null;
}

/** IPv6 が ::ffff:a.b.c.d なら IPv4 の文字列を返す */
export function mappedIPv4(addr: string): string | null {
  const w = expandIPv6(addr);
  if (!w || w.slice(0, 5).some((x) => x !== 0) || w[5] !== 0xffff) return null;
  return `${w[6] >> 8}.${w[6] & 0xff}.${w[7] >> 8}.${w[7] & 0xff}`;
}

/** 接続してよい公開アドレスか */
export function isPublicAddress(address: string): boolean {
  if (typeof address !== 'string' || address.includes('%')) return false;
  const kind = isIP(address);
  if (kind === 4) return !v4Blocked.check(address, 'ipv4');
  if (kind !== 6) return false;
  const v4 = mappedIPv4(address);
  if (v4 !== null) return !v4Blocked.check(v4, 'ipv4');
  if (!v6Global.check(address, 'ipv6')) return false;
  return !v6Blocked.check(address, 'ipv6');
}
