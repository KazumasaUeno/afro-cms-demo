import type { DemoState, Project, ProjectSchedule, ProjectWork } from '@/types';
import { isoToYmd, ymdToIso } from '@/features/projects/projectForm';

/**
 * 制作〜公開の日程（2026-11-17 会議「要件定義のあと、開発担当者がスケジュールを入れる。入れるまで制作へ進めない」）。
 * 日付は yyyy-mm-dd（端末の日付）。制作の完了予定 ≦ 納品予定日（品質管理・納品検収の終了日）≦ 公開予定日
 */

export interface ScheduleDraft { buildDue: string; deliveryDate: string; releaseDate: string; note: string }

export const SCHEDULE_NOTE_MAX = 200;

export type ScheduleErrors = Partial<Record<keyof ScheduleDraft, string>>;

/** 入力の検査（画面と reducer の両方で使う） */
export function validateSchedule(d: ScheduleDraft): ScheduleErrors {
  const e: ScheduleErrors = {};
  const build = d.buildDue.trim();
  const delivery = d.deliveryDate.trim();
  const release = d.releaseDate.trim();
  if (build && !ymdToIso(build)) e.buildDue = '日付の形式を確認してください';
  if (!delivery) e.deliveryDate = '納品予定日を入れてください';
  else if (!ymdToIso(delivery)) e.deliveryDate = '日付の形式を確認してください';
  if (!release) e.releaseDate = '公開予定日を入れてください';
  else if (!ymdToIso(release)) e.releaseDate = '日付の形式を確認してください';
  if (!e.buildDue && !e.deliveryDate && build && build > delivery) e.buildDue = '納品予定日より前の日付にしてください';
  if (!e.deliveryDate && !e.releaseDate && delivery > release) e.releaseDate = '納品予定日以降の日付にしてください';
  if (d.note.trim().length > SCHEDULE_NOTE_MAX) e.note = `${SCHEDULE_NOTE_MAX}文字以内で入力してください`;
  return e;
}

export const scheduleToDraft = (s?: ProjectSchedule): ScheduleDraft => ({
  buildDue: s?.buildDue ?? '', deliveryDate: s?.deliveryDate ?? '', releaseDate: s?.releaseDate ?? '', note: s?.note ?? '',
});

const DAY = 86_400_000;
const shiftYmd = (ymd: string, days: number) => isoToYmd(new Date(new Date(ymdToIso(ymd) ?? ymd).getTime() + days * DAY).toISOString());

/**
 * 初期データ・古い保存データの日程（2026-11-17。要件定義書を承認済みで日程の無い案件に入れる）。
 * 公開予定日は案件の公開予定日（launchDate）、無ければ品質チェックの完了の翌日（公開済みの案件）、それも無ければ承認の 120 日後。
 * 納品予定日はその 7 日前、制作の完了予定は 30 日前。保存した日時は要件定義書の承認の翌日（今より後にはしない）
 */
export function seedSchedule(work: Pick<ProjectWork, 'requirements' | 'design'>, launchDate: string | undefined, savedBy: string): ProjectSchedule {
  const approved = work.requirements.approvedAt ?? new Date().toISOString();
  const release = launchDate
    ? isoToYmd(launchDate)
    : work.design.qualityApprovedAt
      ? shiftYmd(isoToYmd(work.design.qualityApprovedAt), 1)
      : shiftYmd(isoToYmd(approved), 120);
  const savedAt = new Date(Math.min(Date.now(), new Date(approved).getTime() + DAY)).toISOString();
  return { buildDue: shiftYmd(release, -30), deliveryDate: shiftYmd(release, -7), releaseDate: release, savedAt, savedBy };
}

/**
 * 案件の公開予定日（表示用。2026-11-17）。日程を入れていれば日程の公開予定日、無ければ案件の公開予定日（launchDate）。
 * 日程は案件ごとの制作データ（選んでいる案件は上の schedule、ほかは projectWork）にある
 */
export function releaseDateOf(state: Pick<DemoState, 'requirements' | 'schedule' | 'projectWork'>, p: Pick<Project, 'id' | 'launchDate'>): string | undefined {
  const schedule = p.id === state.requirements.projectId ? state.schedule : state.projectWork?.[p.id]?.schedule;
  return (schedule?.releaseDate ? ymdToIso(schedule.releaseDate) ?? undefined : undefined) ?? p.launchDate;
}
