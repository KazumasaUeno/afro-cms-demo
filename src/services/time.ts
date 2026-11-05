import type { ISODate } from '@/types';

const H = 3_600_000;
const D = 24 * H;

export const nowIso = (): ISODate => new Date().toISOString();
export const hoursAgo = (h: number): ISODate => new Date(Date.now() - h * H).toISOString();
export const daysAgo = (d: number): ISODate => new Date(Date.now() - d * D).toISOString();
export const daysFromNow = (d: number): ISODate => new Date(Date.now() + d * D).toISOString();

const rtf = new Intl.RelativeTimeFormat('ja', { numeric: 'auto' });

/** 「3時間前」「明日」など */
export function relativeTime(iso: ISODate | undefined): string {
  if (!iso) return '—';
  const diff = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diff);
  if (abs < 60_000) return 'たった今';
  if (abs < H) return rtf.format(Math.round(diff / 60_000), 'minute');
  if (abs < D) return rtf.format(Math.round(diff / H), 'hour');
  if (abs < 30 * D) return rtf.format(Math.round(diff / D), 'day');
  return formatDate(iso);
}

/** 2026/11/05 14:32 */
export function formatDateTime(iso: ISODate | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 11月5日（木） */
export function formatDate(iso: ISODate | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' });
}
