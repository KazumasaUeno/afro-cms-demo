/**
 * AI 下書きの回数の上限（設計 §2.1 ④・§6、計画 L-d）。日付は JST。
 * - 案件の日/月: aiDrafts/requirements.quota {day, dayCount, month, monthCount}（日・月が変わったら 0 から）
 * - 利用者の日: aiUsage/{yyyymm}.byUid["{yyyy-mm-dd}:{uid}"]（その月の文書の中に日付つきの鍵で持つ。月をまたぐと文書も変わる）
 * - 全体の月: aiUsage/{yyyymm}.count。日ごとの件数は byDay["yyyy-mm-dd"]（表示用。上限には使わない＝全体の日次上限なし）
 * - 返金（enqueue の失敗・AI を呼ぶ前の失敗）は、加算したときの日付の鍵（job.quotaDay）で戻す
 * - サイトマップ（scope 'sitemap'。LIVE_SITEMAP_DATA.md §8・IMPL_PLAN P-4。ユーザー決定 OQ-N3）: 案件の枠は呼び出し側が aiDrafts/sitemap.quota を渡す（別枠）。
 *   利用者の日は同じ byUid に鍵 "sitemap:{day}:{uid}"（要件定義書の鍵 "{day}:{uid}" は変えない）。上限は AI_QUOTA_SITEMAP。
 *   全体の月 aiUsage.count と byDay は共用（AI_QUOTA.globalPerMonth）。aiUsage に新しい項目を足さない（要件定義書の経路が merge:false で 4 項目を書き戻すため）
 */
import { HttpsError } from 'firebase-functions/https';
import { AI_QUOTA, AI_QUOTA_SITEMAP } from './limits';

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** JST の日付 'yyyy-mm-dd' */
export function jstDay(ms: number): string {
  return new Date(ms + JST_OFFSET_MS).toISOString().slice(0, 10);
}

/** JST の月 'yyyy-mm' */
export function jstMonth(ms: number): string {
  return jstDay(ms).slice(0, 7);
}

/** aiUsage の文書 ID（'yyyymm'） */
export function usageDocId(day: string): string {
  return day.slice(0, 7).replace('-', '');
}

export interface DraftQuota {
  day: string;
  dayCount: number;
  month: string;
  monthCount: number;
}

export interface UsageDoc {
  count: number;
  costMicroUsd: number;
  byDay: Record<string, number>;
  byUid: Record<string, number>;
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

export function readUsage(data: Record<string, unknown> | undefined): UsageDoc {
  const map = (v: unknown): Record<string, number> => {
    const out: Record<string, number> = {};
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = num(x);
    return out;
  };
  return { count: num(data?.count), costMicroUsd: num(data?.costMicroUsd), byDay: map(data?.byDay), byUid: map(data?.byUid) };
}

/** 上限の名前空間。省略は要件定義書（従来どおり） */
export type QuotaScope = 'requirements' | 'sitemap';

/** 利用者の日次の鍵。scope 省略・'requirements' は従来の "{day}:{uid}"（同値）、'sitemap' は "sitemap:{day}:{uid}" */
export const userDayKey = (day: string, uid: string, scope: QuotaScope = 'requirements') =>
  scope === 'sitemap' ? `sitemap:${day}:${uid}` : `${day}:${uid}`;

/** 案件・利用者の上限（全体の月は scope によらず AI_QUOTA.globalPerMonth を共用） */
const scopeCaps = (scope: QuotaScope) => (scope === 'sitemap' ? AI_QUOTA_SITEMAP : AI_QUOTA);

/** 今日の案件の数（日・月が変わっていれば 0） */
export function currentDraftQuota(q: unknown, day: string): DraftQuota {
  const o = (q && typeof q === 'object' ? q : {}) as Record<string, unknown>;
  const month = day.slice(0, 7);
  return {
    day,
    dayCount: o.day === day ? num(o.dayCount) : 0,
    month,
    monthCount: o.month === month ? num(o.monthCount) : 0,
  };
}

/** 上限を確かめて 1 回分を足した値を返す。超えていれば resource-exhausted（理由は種別だけ） */
export function reserve(draftQuota: DraftQuota, usage: UsageDoc, uid: string, scope: QuotaScope = 'requirements'): { quota: DraftQuota; usage: UsageDoc } {
  const day = draftQuota.day;
  const key = userDayKey(day, uid, scope);
  const caps = scopeCaps(scope);
  if (draftQuota.dayCount >= caps.projectPerDay) throw new HttpsError('resource-exhausted', 'quota-project-day');
  if (draftQuota.monthCount >= caps.projectPerMonth) throw new HttpsError('resource-exhausted', 'quota-project-month');
  if ((usage.byUid[key] ?? 0) >= caps.userPerDay) throw new HttpsError('resource-exhausted', 'quota-user-day');
  if (usage.count >= AI_QUOTA.globalPerMonth) throw new HttpsError('resource-exhausted', 'quota-global-month');
  return {
    quota: { ...draftQuota, dayCount: draftQuota.dayCount + 1, monthCount: draftQuota.monthCount + 1 },
    usage: {
      ...usage,
      count: usage.count + 1,
      byDay: { ...usage.byDay, [day]: (usage.byDay[day] ?? 0) + 1 },
      byUid: { ...usage.byUid, [key]: (usage.byUid[key] ?? 0) + 1 },
    },
  };
}

/** 1 回分を戻す（加算した日 day の鍵で。0 未満にしない。scope は reserve と同じ値を渡す） */
export function refund(draftQuota: unknown, usage: UsageDoc, day: string, uid: string, scope: QuotaScope = 'requirements'): { quota: DraftQuota | null; usage: UsageDoc } {
  const o = (draftQuota && typeof draftQuota === 'object' ? draftQuota : {}) as Record<string, unknown>;
  const month = day.slice(0, 7);
  const quota = o.day === day || o.month === month
    ? {
      day: String(o.day ?? day),
      dayCount: o.day === day ? Math.max(0, num(o.dayCount) - 1) : num(o.dayCount),
      month: String(o.month ?? month),
      monthCount: o.month === month ? Math.max(0, num(o.monthCount) - 1) : num(o.monthCount),
    }
    : null;
  const key = userDayKey(day, uid, scope);
  const dec = (v: number | undefined) => Math.max(0, (v ?? 0) - 1);
  return {
    quota,
    usage: {
      ...usage,
      count: dec(usage.count),
      byDay: { ...usage.byDay, [day]: dec(usage.byDay[day]) },
      byUid: { ...usage.byUid, [key]: dec(usage.byUid[key]) },
    },
  };
}
