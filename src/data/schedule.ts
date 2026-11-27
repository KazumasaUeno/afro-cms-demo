import type { DemoState, Project, ProjectSchedule, ProjectWork, WbsId, WbsItem } from '@/types';
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

/* ---------- WBS（2026-11-17 ユーザー指示「作ってみて」。制作〜公開の作業ごとに開始・終了・担当を持つ） ---------- */

export const WBS_ITEMS: { id: WbsId; label: string; help: string }[] = [
  { id: 'sitemap', label: 'サイトマップ', help: '作成〜お客様承認' },
  { id: 'design', label: 'デザイン', help: '要件定義〜お客様承認' },
  { id: 'build', label: '全ページの構築', help: '構築タスク' },
  { id: 'buildApproval', label: '制作の完了の承認', help: 'お客様の承認' },
  { id: 'quality', label: '品質チェック・納品検収', help: '納品予定日まで' },
  { id: 'release', label: '公開', help: '承認〜公開' },
];

export const WBS_ASSIGNEE_MAX = 30;

/** WBS の行の状態 */
export type WbsStatus = 'done' | 'doing' | 'todo' | 'late';

/**
 * 状態: 完了 / 遅れ（今日が終了日より後で未完了）/ 進行中（開始日を過ぎた・実績がある）/ 未着手。
 * demo（features/schedule/wbsProgress.ts）と live（src/live/schedule.ts）の両方が使う（同じ規則を 2 か所に持たない）
 */
export function statusOf(item: { start: string; end: string }, actual: { done: boolean; percent: number }, today: string): WbsStatus {
  if (actual.done) return 'done';
  if (today > item.end) return 'late';
  if (today >= item.start || actual.percent > 0) return 'doing';
  return 'todo';
}

const ymdMs = (ymd: string) => new Date(ymdToIso(ymd) ?? ymd).getTime();
/** a から b までの日数（b が後なら正） */
export const daysBetween = (a: string, b: string) => Math.round((ymdMs(b) - ymdMs(a)) / DAY);
export { shiftYmd };
const maxYmd = (a: string, b: string) => (a > b ? a : b);
const minYmd = (a: string, b: string) => (a < b ? a : b);

/**
 * 3 つの予定日から導く WBS（保存が無いときの初期値）。startYmd は要件定義書の承認の翌日（無ければ日程を保存した日）。
 * 制作の完了予定（無ければ納品予定日の 14 日前）までを サイトマップ 約15% / デザイン 約25% / 構築 残り に分け、
 * 制作の完了の承認は構築の終わりの翌日から 3 日、品質チェックはその後〜納品予定日、公開は納品予定日の翌日〜公開予定日。
 * どの作業も開始 ≦ 終了になるよう寄せる
 */
export function defaultWbs(schedule: Pick<ProjectSchedule, 'buildDue' | 'deliveryDate' | 'releaseDate'>, startYmd: string, assignee?: string): WbsItem[] {
  const start = startYmd;
  const buildEnd = maxYmd(start, schedule.buildDue || shiftYmd(schedule.deliveryDate, -14));
  const span = daysBetween(start, buildEnd) + 1;
  const sitemapEnd = minYmd(buildEnd, shiftYmd(start, Math.max(1, Math.round(span * 0.15)) - 1));
  const designStart = minYmd(buildEnd, shiftYmd(sitemapEnd, 1));
  const designEnd = minYmd(buildEnd, maxYmd(designStart, shiftYmd(designStart, Math.max(1, Math.round(span * 0.25)) - 1)));
  const buildStart = minYmd(buildEnd, shiftYmd(designEnd, 1));
  const apprStart = shiftYmd(buildEnd, 1);
  const apprEnd = shiftYmd(buildEnd, 3);
  const qStart = shiftYmd(apprEnd, 1);
  const qEnd = maxYmd(qStart, schedule.deliveryDate);
  const rStart = maxYmd(shiftYmd(schedule.deliveryDate, 1), shiftYmd(qEnd, 1));
  const rEnd = maxYmd(rStart, schedule.releaseDate);
  const who = assignee?.trim() ? { assignee: assignee.trim() } : {};
  return [
    { id: 'sitemap', start, end: sitemapEnd, ...who },
    { id: 'design', start: designStart, end: designEnd, ...who },
    { id: 'build', start: buildStart, end: buildEnd, ...who },
    { id: 'buildApproval', start: apprStart, end: apprEnd, ...who },
    { id: 'quality', start: qStart, end: qEnd, ...who },
    { id: 'release', start: rStart, end: rEnd, ...who },
  ];
}

/**
 * 案件の WBS（保存があれば保存の値、無い作業・読めない作業は初期値で補う。順番は WBS_ITEMS の順）。
 * 古い保存データ（wbs が無い）もここで導くので移行はしない
 */
export function wbsOf(schedule: ProjectSchedule, startYmd: string, assignee?: string): WbsItem[] {
  const base = defaultWbs(schedule, startYmd, assignee);
  const saved = new Map((schedule.wbs ?? []).map((w) => [w.id, w]));
  return base.map((d) => {
    const s = saved.get(d.id);
    return s && ymdToIso(s.start) && ymdToIso(s.end) && s.start <= s.end ? { ...s } : d;
  });
}

export type WbsErrors = Partial<Record<WbsId, { start?: string; end?: string; assignee?: string }>>;

/** WBS の入力の検査（画面と reducer の両方で使う） */
export function validateWbs(items: WbsItem[]): WbsErrors {
  const e: WbsErrors = {};
  for (const w of items) {
    const r: { start?: string; end?: string; assignee?: string } = {};
    if (!w.start.trim()) r.start = '開始日を入れてください';
    else if (!ymdToIso(w.start.trim())) r.start = '日付の形式を確認してください';
    if (!w.end.trim()) r.end = '終了日を入れてください';
    else if (!ymdToIso(w.end.trim())) r.end = '日付の形式を確認してください';
    if (!r.start && !r.end && w.start.trim() > w.end.trim()) r.end = '開始日以降の日付にしてください';
    if ((w.assignee ?? '').trim().length > WBS_ASSIGNEE_MAX) r.assignee = `${WBS_ASSIGNEE_MAX}文字以内で入力してください`;
    if (Object.keys(r).length > 0) e[w.id] = r;
  }
  return e;
}

/** WBS のバーをドラッグ・キーで動かす向き（2026-11-17 ユーザー指示「表自体を伸縮で移動できるように」） */
export type WbsDragMode = 'move' | 'start' | 'end';

/**
 * WBS のバーを deltaDays 日動かした結果（日単位）。move は開始・終了を一緒に（日数は保つ）、
 * start / end は片方だけ。開始 ≦ 終了（最短 1 日）を保つ
 */
export function dragWbs(orig: { start: string; end: string }, mode: WbsDragMode, deltaDays: number): { start: string; end: string } {
  const d = Math.round(deltaDays) || 0;
  if (mode === 'move') return { start: shiftYmd(orig.start, d), end: shiftYmd(orig.end, d) };
  if (mode === 'start') return { start: minYmd(shiftYmd(orig.start, d), orig.end), end: orig.end };
  return { start: orig.start, end: maxYmd(shiftYmd(orig.end, d), orig.start) };
}

/** 予定日（節目）の下書き（2026-11-17 ユーザー指示「制作完了、納品、公開もドラッグ移動可能に」） */
export interface MilestoneDates { buildDue?: string; deliveryDate: string; releaseDate: string }
export type MilestoneKey = keyof MilestoneDates;

/**
 * 節目を ymd へ動かした結果。制作の完了予定 ≦ 納品予定日 ≦ 公開予定日 を保つよう、隣の節目で止める（日単位）。
 * 制作の完了予定が無いときは動かさない（カードの入力画面で入れる）
 */
export function moveMilestone(ms: MilestoneDates, key: MilestoneKey, ymd: string): MilestoneDates {
  if (key === 'buildDue') return ms.buildDue ? { ...ms, buildDue: minYmd(ymd, ms.deliveryDate) } : ms;
  if (key === 'deliveryDate') {
    const lo = ms.buildDue ? maxYmd(ymd, ms.buildDue) : ymd;
    return { ...ms, deliveryDate: minYmd(lo, ms.releaseDate) };
  }
  return { ...ms, releaseDate: maxYmd(ymd, ms.deliveryDate) };
}
