import type { ReactNode } from 'react';
import { Hammer, PackageCheck, Rocket } from 'lucide-react';
import { ymdToIso } from '@/features/projects/projectForm';
import { daysBetween, type ScheduleDraft } from '@/data/schedule';
import { tokens } from '@/theme/tokens';

/**
 * スケジュールの画面で共有する表示の部品（予定日のカードの定義・日付の文言）。
 * SchedulePage.tsx（demo の配線）から分けた（LIVE_SCHEDULE_PLAN U3-a）。live の画面・案件詳細・ポータルはここを import する
 * （SchedulePage.tsx は DemoStore を読むので live から import しない。tests/unit/liveNoDemoStore.test.mjs）
 */

export type DateKey = Exclude<keyof ScheduleDraft, 'note'>;

/** 予定日のカード（色はトークンだけ。節目ごとに色を分ける） */
export const MILESTONES: { key: DateKey; label: string; icon: ReactNode; soft: string; ink: string; accent: string }[] = [
  { key: 'buildDue', label: '制作の完了予定', icon: <Hammer size={20} />, soft: tokens.color.primarySoft, ink: tokens.color.onPrimaryContainer, accent: tokens.color.primary },
  { key: 'deliveryDate', label: '納品予定日', icon: <PackageCheck size={20} />, soft: tokens.color.infoSoft, ink: tokens.color.infoInk, accent: tokens.color.info },
  { key: 'releaseDate', label: '公開予定日', icon: <Rocket size={20} />, soft: tokens.color.successSoft, ink: tokens.color.successInk, accent: tokens.color.success },
];

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
/** yyyy-mm-dd → 12月4日(木) */
export function jpDate(ymd: string): string {
  const iso = ymdToIso(ymd);
  if (!iso) return ymd;
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日(${WEEKDAYS[d.getDay()]})`;
}
/** 今日からの残り（あと N 日 / 今日 / N 日過ぎ） */
export function untilText(ymd: string, today: string): string {
  const n = daysBetween(today, ymd);
  return n === 0 ? '今日' : n > 0 ? `あと ${n} 日` : `${-n} 日過ぎ`;
}
