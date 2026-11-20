/**
 * AI 下書きの回数の上限（設計 §2.1 ④・§6、計画 L-d）。日付は JST。
 * - 案件の日/月: aiDrafts/requirements.quota {day, dayCount, month, monthCount}（日・月が変わったら 0 から）
 * - 利用者の日: aiUsage/{yyyymm}.byUid["{yyyy-mm-dd}:{uid}"]（その月の文書の中に日付つきの鍵で持つ。月をまたぐと文書も変わる）
 * - 全体の月: aiUsage/{yyyymm}.count。日ごとの件数は byDay["yyyy-mm-dd"]（表示用。上限には使わない＝全体の日次上限なし）
 * - 返金（enqueue の失敗・AI を呼ぶ前の失敗）は、加算したときの日付の鍵（job.quotaDay）で戻す
 */
import { HttpsError } from 'firebase-functions/https';
import { AI_QUOTA } from './limits';

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

export const userDayKey = (day: string, uid: string) => `${day}:${uid}`;

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
export function reserve(draftQuota: DraftQuota, usage: UsageDoc, uid: string): { quota: DraftQuota; usage: UsageDoc } {
  const day = draftQuota.day;
  const key = userDayKey(day, uid);
  if (draftQuota.dayCount >= AI_QUOTA.projectPerDay) throw new HttpsError('resource-exhausted', 'quota-project-day');
  if (draftQuota.monthCount >= AI_QUOTA.projectPerMonth) throw new HttpsError('resource-exhausted', 'quota-project-month');
  if ((usage.byUid[key] ?? 0) >= AI_QUOTA.userPerDay) throw new HttpsError('resource-exhausted', 'quota-user-day');
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

/** 1 回分を戻す（加算した日 day の鍵で。0 未満にしない） */
export function refund(draftQuota: unknown, usage: UsageDoc, day: string, uid: string): { quota: DraftQuota | null; usage: UsageDoc } {
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
  const key = userDayKey(day, uid);
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
