import type { QualityCheck, QualityItem } from '@/types';

export interface QualityStats {
  total: number;
  afro: number;
  client: number;
  complete: number;
  /** 0-100 */
  afroRate: number;
  clientRate: number;
  completeRate: number;
  open: number;
}

export const isComplete = (c: QualityCheck | undefined) => !!c?.afroAt && !!c?.clientAt;

export function computeStats(items: QualityItem[], checks: Record<string, QualityCheck>): QualityStats {
  let afro = 0;
  let client = 0;
  let complete = 0;
  for (const i of items) {
    const c = checks[i.id];
    if (c?.afroAt) afro++;
    if (c?.clientAt) client++;
    if (isComplete(c)) complete++;
  }
  const total = items.length;
  const pct = (n: number) => (total ? (n / total) * 100 : 0);
  return { total, afro, client, complete, afroRate: pct(afro), clientRate: pct(client), completeRate: pct(complete), open: total - complete };
}

/** 「11/05 14:32」 */
export function shortStamp(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 「藤井 慎」→「藤井」 */
export const surname = (name?: string) => (name ?? '').split(/\s+/)[0] ?? '';
