import type { ProjectSchedule } from '@/types';
import type { ClientScheduleView, LiveScheduleState, ScheduleCurrent, ScheduleSummary } from './schedule';

/**
 * お客様ポータルのスケジュール（/portal/schedule・確認・承認のスケジュールの区画。LIVE_SCHEDULE_PLAN U4）の純関数。
 * お客様に見せる値は clientScheduleView（src/live/schedule.ts）だけから組む（下書き・メモ・担当・保存者・構築タスクを入れない＝AC-09）。
 * React・Firebase の実体を import しない（tests/unit/livePortalSchedule.test.mjs が直接読む）。権限の実体は firestore.rules
 */

/**
 * clientScheduleView → demo の形の state（liveProjectView に渡す。PortalScheduleView・WbsSection・approvalSteps が読む）。
 * 未作成（none）は null。approvedAt は承認済みのときだけ、requestedAt は依頼中のときだけ（approvalSteps の schedule の段階が demo と同じに決まる）。
 * WBS は日付だけ（担当・完了印の日時を持たない）
 */
export function clientScheduleState(cv: ClientScheduleView, summary: ScheduleSummary | null): LiveScheduleState | null {
  if (cv.kind !== 'shown') return null;
  const schedule: ProjectSchedule = {
    ...(cv.dates.buildDue ? { buildDue: cv.dates.buildDue } : {}),
    deliveryDate: cv.dates.deliveryDate,
    releaseDate: cv.dates.releaseDate,
    savedAt: '',
    savedBy: '',
    ...(cv.status === 'approved' && summary?.approvedAt ? { approvedAt: summary.approvedAt } : {}),
    ...(cv.wbs ? { wbs: cv.wbs.map((w) => ({ id: w.id, start: w.start, end: w.end })) } : {}),
  };
  return { schedule, ...(cv.status === 'requested' && summary?.requestedAt ? { requestedAt: summary.requestedAt } : {}) };
}

/**
 * WBS のデータ源（useLiveWbsSource）に渡す current: お客様に見せる版の WBS（完了印の doneAt つき）だけを持つ形。
 * 再計画中で承認の記録の写しを見せるときも、写しの WBS で完了印を出す。未作成は null。copy は空（承認には使わない＝承認は sch.current で送る）
 */
export function clientWbsCurrent(cv: ClientScheduleView, current: ScheduleCurrent | null): ScheduleCurrent | null {
  if (cv.kind !== 'shown') return null;
  return { revision: cv.revision, editSeq: current?.editSeq ?? 0, dates: cv.dates, ...(cv.wbs ? { wbs: cv.wbs } : {}), updatedBy: '', copy: {} };
}

/** 再計画中（承認の後に下書きへ戻った）の案内。それ以外は undefined（demo に無い要素は出さない） */
export function clientScheduleNotice(cv: ClientScheduleView): string | undefined {
  return cv.kind === 'shown' && cv.status === 'adjusting'
    ? 'アフロが日程を調整しています。下はご承認いただいた日程です。新しい日程ができると、もう一度承認のお願いが届きます。'
    : undefined;
}

/** 承認のボタンを押した時点の版（L-18。この値で approve を送る）。依頼中で current がその版のときだけ */
export function clientApprovalShown(summary: ScheduleSummary | null, current: ScheduleCurrent | null): ScheduleCurrent | null {
  if (summary?.status !== 'requested' || !current || current.revision !== summary.revision) return null;
  return current;
}

/** 読み取りの拒否（お客様が読めない版＝未作成と同じ表示にする。S-1） */
export const isPermissionDenied = (e: unknown): boolean => String((e as { code?: string } | null)?.code ?? '').endsWith('permission-denied');
