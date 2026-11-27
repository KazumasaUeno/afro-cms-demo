import type { DevTask, ProjectSchedule, WbsId, WbsItem } from '@/types';
import type { TaskDoc } from '@/live/model';
import { wbsOf } from '@/data/schedule';
import { formatDateTime } from '@/services/time';
import {
  MARK_IDS, sameDates, scheduleForSave, wbsProgressLive,
  type LiveWbsItem, type ScheduleCurrent, type ScheduleInternal, type ScheduleStatus, type WbsMark,
} from '@/live/schedule';
import type { WbsDone } from './scheduleSource';
import type { WbsRow } from './wbsProgress';
import type { ScheduleDraft } from '@/data/schedule';

/**
 * live のスケジュールの画面（src/live/pages/LiveSchedulePage.tsx）の判定（LIVE_SCHEDULE_PLAN U3-b）。
 * React・Firebase の実体を import しない（tests/unit/liveScheduleUi.test.mjs が直接読む）。demo の部品からは import しない
 * （@/live/schedule を demo の bundle に入れない）。権限の実体は firestore.rules
 */

/* ---------- WBS のデータ源 ---------- */

/** WBS の行（保存済みの行＋読めない・無い行は予定日から導いた初期値。完了印の日時は外す＝下書きの比較に入れない） */
export function liveWbsItems(schedule: ProjectSchedule | undefined, startYmd: string): WbsItem[] {
  if (!schedule) return [];
  return wbsOf(schedule, startYmd).map((w) => ({ id: w.id, start: w.start, end: w.end, ...(w.assignee ? { assignee: w.assignee } : {}) }));
}

/** 保存済みの完了印（current.wbs の doneAt がある行。build は持たない） */
export function liveWbsDone(current: ScheduleCurrent | null): WbsDone {
  const out: WbsDone = {};
  for (const w of current?.wbs ?? []) if (w.doneAt && w.id !== 'build') out[w.id] = true;
  return out;
}

const devTask = (t: TaskDoc): DevTask => ({
  id: t.id, page: t.page, title: t.title, assigneeId: t.assigneeUids[0] ?? '', assigneeIds: t.assigneeUids, status: t.status, updatedAt: t.updatedAt,
});

/** 実績（構築の行は構築タスク、他の行は下書きの完了印）。tasks が null（読めない）なら構築の行は後の行の完了印か日付だけで状態を出し、割合は出さない（wbsProgressLive） */
export function liveWbsRows(items: readonly WbsItem[], done: WbsDone, tasks: readonly TaskDoc[] | null, today: string): WbsRow[] {
  const marked: LiveWbsItem[] = items.map((w) => (w.id !== 'build' && done[w.id] ? { ...w, doneAt: 'marked' } : { ...w }));
  return wbsProgressLive(marked, tasks, today).map((r) => {
    const row: WbsRow = {
      id: r.id, start: r.start, end: r.end, ...(r.assignee ? { assignee: r.assignee } : {}), percent: r.percent, done: r.done, status: r.status,
      ...(r.percentUnknown ? { percentUnknown: true as const } : {}),
    };
    if (r.id === 'build' && tasks) row.tasks = { done: r.tasks?.done ?? 0, total: r.tasks?.total ?? 0, list: tasks.map(devTask) };
    return row;
  });
}

/** 完了印の最後の操作（入力画面に出す文）。名前が読めなければ「—」 */
export function markNotes(internal: ScheduleInternal | null, names: Record<string, string | undefined>): Partial<Record<WbsId, string>> {
  const out: Partial<Record<WbsId, string>> = {};
  for (const id of MARK_IDS) {
    const m: WbsMark | undefined = internal?.marks[id];
    if (!m) continue;
    out[id] = `${m.state === 'done' ? '完了印を付けた' : '完了印を外した'}: ${formatDateTime(m.at)}・${names[m.by] ?? '—'}`;
  }
  return out;
}

/** 依頼中に WBS を変えるときの注意（アフロ側の画面だけ。依頼中も WBS は変えられる＝2026-11-27 lead 判断） */
export const SCHEDULE_REQUESTED_WBS_NOTE = '依頼中に WBS を変えると、お客様は画面を開き直してから承認することになります';

/* ---------- 版（開いた時点の値。競合の検出。L-4・AC-08） ---------- */

/** WBS に関わる internal の中身（担当・完了印）。ほかの保存（メモ・予定日）で internal の editSeq が進んでも、WBS の下書きは競合にしない */
const wbsInternalKey = (i: ScheduleInternal | null) =>
  i ? JSON.stringify([Object.entries(i.assignees).sort(), Object.entries(i.marks).map(([k, m]) => [k, m?.state, m?.at, m?.by]).sort()]) : null;

export function wbsTokenOf(current: ScheduleCurrent | null, internal: ScheduleInternal | null): string {
  return JSON.stringify({ c: current?.editSeq ?? null, i: wbsInternalKey(internal) });
}

/**
 * saveWbs に渡す開いた時点の editSeq。current は下書きを始めた時点の値、internal は WBS に関わる中身が変わっていなければいまの値
 * （変わっていれば -1＝必ず競合）
 */
export function wbsOpened(token: string, internal: ScheduleInternal | null): { current: number; internal: number } {
  const t = JSON.parse(token || '{}') as { c?: number | null; i?: string | null };
  return {
    current: typeof t.c === 'number' ? t.c : -1,
    internal: internal && t.i === wbsInternalKey(internal) ? internal.editSeq : -1,
  };
}

/** 予定日・メモに関わる internal の中身 */
const datesKey = (i: ScheduleInternal | null) => (i ? JSON.stringify([i.draft ?? null, i.note]) : null);

export function scheduleTokenOf(internal: ScheduleInternal | null): string {
  return JSON.stringify({ k: datesKey(internal) });
}

/** save / reopenAndSave に渡す開いた時点の editSeq（未作成なら null。開いた後に予定日・メモが変わっていれば -1＝必ず競合） */
export function scheduleOpened(token: string, internal: ScheduleInternal | null): number | null {
  const t = JSON.parse(token || '{}') as { k?: string | null };
  if ((t.k ?? null) !== datesKey(internal)) return -1;
  return internal ? internal.editSeq : null;
}

/* ---------- 予定日の保存の種類・ボタンの出し分け ---------- */

/**
 * 予定日の保存の種類: 承認済みで予定日を変える → 再計画（理由が要る）／ 依頼中に予定日を変える → 止める（先に取り下げ）／ それ以外 → 保存
 */
export function scheduleSaveKind(status: ScheduleStatus | undefined, internal: ScheduleInternal | null, draft: ScheduleDraft): 'save' | 'reopen' | 'blocked' {
  if (!status || !internal?.draft) return 'save';
  const changed = !sameDates(internal.draft, scheduleForSave(draft).draft);
  if (!changed || status === 'draft') return 'save';
  return status === 'approved' ? 'reopen' : 'blocked';
}

export const SCHEDULE_BLOCKED_TEXT = 'お客様に承認を依頼している間は予定日を変えられません。依頼を取り下げてから変えてください';

export interface ScheduleButtons {
  /** 「承認依頼済み（日時）」 */
  requested: boolean;
  /** 「承認を依頼する」 */
  request: boolean;
  /** 「依頼を取り下げる」（理由が要る） */
  withdraw: boolean;
  /** 「代理で承認」（管理者だけ） */
  proxy: boolean;
  /** 「お客様が承認済み」 */
  approved: boolean;
}

/**
 * 「保存済み」の行の右に出すもの。canEdit は アフロ側（管理者・担当の開発者）× 要件定義書の承認後 × アーカイブでない（表示の出し分け。実体は Rules）
 */
export function scheduleButtons(status: ScheduleStatus | undefined, role: 'admin' | 'developer' | 'client', canEdit: boolean, hasDraft: boolean): ScheduleButtons {
  const none: ScheduleButtons = { requested: false, request: false, withdraw: false, proxy: false, approved: false };
  if (!status) return none;
  if (status === 'requested') return { ...none, requested: true, withdraw: canEdit, proxy: canEdit && role === 'admin' };
  if (status === 'approved') return { ...none, approved: true };
  return { ...none, request: canEdit && hasDraft };
}

/* ---------- 案件詳細の「次に必要な作業」（影響分析 3: LiveProjectDetailPage:61-63） ---------- */

/** 要件定義書の承認後はスケジュール（文言は toProject の段階の文言＝p.nextAction）。それ前は demo と同じ判定（devNextWork） */
export function liveDetailNext(
  reqStatus: 'draft' | 'analyzed' | 'approved', nextAction: string, scheduleTo: string, work: { next: string; to: string },
): { label: string; to: string } {
  return reqStatus === 'approved' ? { label: nextAction, to: scheduleTo } : { label: work.next, to: work.to };
}
