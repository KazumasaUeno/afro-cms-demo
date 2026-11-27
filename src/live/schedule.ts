import type { DocumentData } from 'firebase/firestore';
import type { ProjectSchedule, WbsId, WbsItem } from '@/types';
import { validateSchedule, validateWbs, WBS_ASSIGNEE_MAX, WBS_ITEMS, SCHEDULE_NOTE_MAX, type ScheduleDraft, type ScheduleErrors, type WbsErrors } from '@/data/schedule';
import { ymdToIso } from '@/features/projects/projectForm';
import { cleanProxyNote, proxyNoteLength, PROXY_NOTE_MAX } from './proxyApproval';
import { TASK_LIMIT } from './tasks';
import { toIso, type TaskDoc } from './model';

/**
 * live のスケジュール（予定日＋WBS。docs/design/LIVE_SCHEDULE_WBS_DATA.md §2・§4・§5、LIVE_SCHEDULE_PLAN.md §1・§2）の純関数。
 * 文書 ⇔ 画面の値・保存する値の写像・お客様の表示・進捗・競合判定。React・Firebase の実体を import しない（単体テストが直接読む。
 * Firestore の値は型だけ。serverTimestamp は呼び出し側＝repositories.tsx が now として渡す）。
 * 権限の実体は firestore.rules の schedCreateOk / schedCurUpdateOk / schedIntUpdateOk / schedProjOk / schedApprOk
 */

export type ScheduleStatus = 'draft' | 'requested' | 'approved';

/** projects/{pid}.schedule（要約。状態の正。§2.1） */
export interface ScheduleSummary {
  status: ScheduleStatus;
  revision: number;
  /** submit 済みの公開予定日（yyyy-mm-dd） */
  releaseDate?: string;
  requestedAt?: string;
  approvedRevision?: number;
  approvedAt?: string;
  approvedBy?: string;
  approvalId?: string;
  approvedVia?: 'proxy';
}

/** 予定日 3 つ（yyyy-mm-dd。buildDue は任意） */
export interface ScheduleDates { buildDue?: string; deliveryDate: string; releaseDate: string }

/** current の WBS の行（doneAt は完了印の日時 ISO。build の行は持たない） */
export interface LiveWbsItem extends WbsItem { doneAt?: string }

/** schedule/current（お客様は revision >= 1 のときだけ読める。§2.2） */
export interface ScheduleCurrent {
  revision: number;
  editSeq: number;
  /** submit 済みの予定日（revision 0 は無い） */
  dates?: ScheduleDates;
  /** WBS（WBS_ITEMS の順。読めない行は捨てる。無ければ画面が予定日から導く） */
  wbs?: LiveWbsItem[];
  updatedAt?: string;
  updatedBy: string;
  /**
   * 承認の記録に写す値（buildDue・deliveryDate・releaseDate・wbs を**読んだ値のまま**。Timestamp も変換しない）。
   * Rules（schedCopyOk）はマップの等式で比べるので、表示に使ったこの値から承認の記録を組む（L-18）
   */
  copy: Record<string, unknown>;
}

export interface WbsMark { state: 'done' | 'undone'; at?: string; by: string }

/** schedule/internal（管理者・担当の開発者だけ。§2.3・L-9） */
export interface ScheduleInternal {
  draft?: ScheduleDates;
  note: string;
  assignees: Partial<Record<WbsId, string>>;
  marks: Partial<Record<WbsId, WbsMark>>;
  savedByName: string;
  editSeq: number;
  updatedAt?: string;
  updatedBy: string;
}

/** Rules の reYmd（2000〜2099 年）と同じ形 ＋ 暦にある日（2/30 は画面だけで止める。S-14・L-12） */
const YMD_RE = /^20[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/;
export const scheduleYmdOk = (v: unknown): v is string => typeof v === 'string' && YMD_RE.test(v) && ymdToIso(v) !== null;

/** 改訂の上限（firestore.rules schedAfroMove の s.revision <= 50。L-6） */
export const SCHEDULE_REVISION_MAX = 50;

const WBS_IDS: readonly WbsId[] = WBS_ITEMS.map((w) => w.id);
/** 完了印を持てる行（build は構築タスクから導く） */
export const MARK_IDS: readonly WbsId[] = WBS_IDS.filter((id) => id !== 'build');

const obj = (v: unknown): DocumentData | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as DocumentData) : null);
const int = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

/** 予定日 3 つ（壊れていれば null。順序も Rules の validDates と同じ） */
export function datesOf(v: unknown): ScheduleDates | null {
  const d = obj(v);
  if (!d || !scheduleYmdOk(d.deliveryDate) || !scheduleYmdOk(d.releaseDate) || d.deliveryDate > d.releaseDate) return null;
  if (d.buildDue !== undefined && (!scheduleYmdOk(d.buildDue) || d.buildDue > d.deliveryDate)) return null;
  return { ...(d.buildDue !== undefined ? { buildDue: d.buildDue as string } : {}), deliveryDate: d.deliveryDate, releaseDate: d.releaseDate };
}

/** 案件の schedule（無い・壊れた値は null＝未作成） */
export function scheduleSummaryOf(v: unknown): ScheduleSummary | null {
  const s = obj(v);
  if (!s || (s.status !== 'draft' && s.status !== 'requested' && s.status !== 'approved') || !int(s.revision)) return null;
  return {
    status: s.status,
    revision: s.revision,
    ...(scheduleYmdOk(s.releaseDate) ? { releaseDate: s.releaseDate } : {}),
    ...(toIso(s.requestedAt) ? { requestedAt: toIso(s.requestedAt) } : {}),
    ...(int(s.approvedRevision) ? { approvedRevision: s.approvedRevision } : {}),
    ...(toIso(s.approvedAt) ? { approvedAt: toIso(s.approvedAt) } : {}),
    ...(typeof s.approvedBy === 'string' ? { approvedBy: s.approvedBy } : {}),
    ...(typeof s.approvalId === 'string' ? { approvalId: s.approvalId } : {}),
    ...(s.approvedVia === 'proxy' ? { approvedVia: 'proxy' as const } : {}),
  };
}

/** WBS のマップ → 行（WBS_ITEMS の順。日付が読めない・start > end の行は捨てる。build の doneAt は読まない） */
export function wbsItemsOf(v: unknown): LiveWbsItem[] | undefined {
  const m = obj(v);
  if (!m) return undefined;
  const out: LiveWbsItem[] = [];
  for (const id of WBS_IDS) {
    const r = obj(m[id]);
    if (!r || !scheduleYmdOk(r.start) || !scheduleYmdOk(r.end) || r.start > r.end) continue;
    const doneAt = id === 'build' ? undefined : toIso(r.doneAt);
    out.push({ id, start: r.start, end: r.end, ...(doneAt ? { doneAt } : {}) });
  }
  return out.length ? out : undefined;
}

const COPY_KEYS = ['buildDue', 'deliveryDate', 'releaseDate', 'wbs'] as const;

/**
 * schedule/current（d は表示用＝serverTimestamps: 'estimate' の値、raw は写し用の読んだままの値。無ければ d）。
 * 文書なし・版や editSeq が読めない → null（未作成）
 */
export function scheduleDoc(d: DocumentData | null | undefined, raw?: DocumentData | null): ScheduleCurrent | null {
  if (!d || !int(d.revision) || !int(d.editSeq)) return null;
  const src = raw ?? d;
  const copy: Record<string, unknown> = {};
  for (const k of COPY_KEYS) if (src[k] !== undefined) copy[k] = src[k];
  const dates = datesOf(d);
  const wbs = wbsItemsOf(d.wbs);
  return {
    revision: d.revision,
    editSeq: d.editSeq,
    ...(dates ? { dates } : {}),
    ...(wbs ? { wbs } : {}),
    ...(toIso(d.updatedAt) ? { updatedAt: toIso(d.updatedAt) } : {}),
    updatedBy: String(d.updatedBy ?? ''),
    copy,
  };
}

/** schedule/internal（文書なし・editSeq が読めない → null） */
export function scheduleInternalDoc(d: DocumentData | null | undefined): ScheduleInternal | null {
  if (!d || !int(d.editSeq)) return null;
  const assignees: Partial<Record<WbsId, string>> = {};
  const a = obj(d.assignees);
  for (const id of WBS_IDS) if (a && typeof a[id] === 'string' && a[id]) assignees[id] = a[id];
  const marks: Partial<Record<WbsId, WbsMark>> = {};
  const m = obj(d.marks);
  for (const id of MARK_IDS) {
    const x = obj(m?.[id]);
    if (!x || (x.state !== 'done' && x.state !== 'undone')) continue;
    const at = toIso(x.at);
    marks[id] = { state: x.state, ...(at ? { at } : {}), by: String(x.by ?? '') };
  }
  const draft = datesOf(d.draft);
  return {
    ...(draft ? { draft } : {}),
    note: typeof d.note === 'string' ? d.note : '',
    assignees,
    marks,
    savedByName: String(d.savedByName ?? ''),
    editSeq: d.editSeq,
    ...(toIso(d.updatedAt) ? { updatedAt: toIso(d.updatedAt) } : {}),
    updatedBy: String(d.updatedBy ?? ''),
  };
}

/** 承認の記録（schedule-r{rev}-approve）の写し → 表示（お客様の「調整中」の表示に使う。§5） */
export interface ScheduleApprovedCopy { revision: number; dates: ScheduleDates; wbs?: LiveWbsItem[] }
export function scheduleApprovedCopyOf(d: DocumentData | null | undefined): ScheduleApprovedCopy | null {
  if (!d || d.kind !== 'schedule' || d.action !== 'approve' || !int(d.revision)) return null;
  const dates = datesOf(d);
  if (!dates) return null;
  const wbs = wbsItemsOf(d.wbs);
  return { revision: d.revision, dates, ...(wbs ? { wbs } : {}) };
}

/* ---------- お客様の表示（§5・要件 §6.2・L-2） ---------- */

export type ClientScheduleView =
  | { kind: 'none' }
  | { kind: 'shown'; status: 'requested' | 'approved' | 'adjusting'; revision: number; dates: ScheduleDates; wbs?: LiveWbsItem[] };

/**
 * お客様に見せるスケジュール。未作成・rev 0 → none ／ 依頼中・承認済み → current ／
 * 下書き（差し戻し・再計画）で承認歴あり → current の版が承認の版と同じなら current、違えば承認の記録の写し（どちらも「調整中」）／
 * 下書きで承認歴なし → none（current に差し戻された版が残っていても出さない）
 */
export function clientScheduleView(
  summary: ScheduleSummary | null, current: ScheduleCurrent | null, approvedCopy?: ScheduleApprovedCopy | null,
): ClientScheduleView {
  const none = { kind: 'none' } as const;
  if (!summary || summary.revision < 1) return none;
  const fromCurrent = (status: 'requested' | 'approved' | 'adjusting'): ClientScheduleView =>
    current?.dates ? { kind: 'shown', status, revision: current.revision, dates: current.dates, ...(current.wbs ? { wbs: current.wbs } : {}) } : none;
  if (summary.status === 'requested' || summary.status === 'approved') {
    return current && current.revision === summary.revision ? fromCurrent(summary.status) : none;
  }
  const ar = summary.approvedRevision;
  if (ar === undefined) return none;
  if (current && current.revision === ar) return fromCurrent('adjusting');
  if (approvedCopy && approvedCopy.revision === ar) {
    return { kind: 'shown', status: 'adjusting', revision: ar, dates: approvedCopy.dates, ...(approvedCopy.wbs ? { wbs: approvedCopy.wbs } : {}) };
  }
  return none;
}

/** お客様が承認の記録の写しを読む必要があるか（下書きで、current の版が最後に承認された版と違う）。読む ID は schedule-r{approvedRevision}-approve */
export function clientNeedsApprovedCopy(summary: ScheduleSummary | null, current: ScheduleCurrent | null): number | null {
  if (!summary || summary.status !== 'draft' || summary.approvedRevision === undefined) return null;
  return current && current.revision === summary.approvedRevision ? null : summary.approvedRevision;
}

/* ---------- 入力の検査と保存の写像（SU-06・SU-07） ---------- */

const OUT_OF_RANGE = '2000年〜2099年の日付にしてください';
const inRange = (ymd: string) => !ymd.trim() || /^20[0-9]{2}-/.test(ymd.trim());

/** 予定日の検査（demo の validateSchedule ＋ Rules の年の範囲） */
export function validateScheduleInput(d: ScheduleDraft): ScheduleErrors {
  const e = validateSchedule(d);
  for (const k of ['buildDue', 'deliveryDate', 'releaseDate'] as const) if (!e[k] && !inRange(d[k])) e[k] = OUT_OF_RANGE;
  if (!e.note && [...cleanScheduleNote(d.note)].length > SCHEDULE_NOTE_MAX) e.note = `${SCHEDULE_NOTE_MAX}文字以内で入力してください`;
  return e;
}

/** WBS の検査（demo の validateWbs ＋ 年の範囲・担当名は Rules と同じコードポイントで数える） */
export function validateWbsInput(items: readonly WbsItem[]): WbsErrors {
  const e = validateWbs([...items]);
  for (const w of items) {
    const r = { ...(e[w.id] ?? {}) };
    if (!r.start && !inRange(w.start)) r.start = OUT_OF_RANGE;
    if (!r.end && !inRange(w.end)) r.end = OUT_OF_RANGE;
    if (!r.assignee && [...cleanAssignee(w.assignee ?? '')].length > WBS_ASSIGNEE_MAX) r.assignee = `${WBS_ASSIGNEE_MAX}文字以内で入力してください`;
    if (Object.keys(r).length) e[w.id] = r;
  }
  return e;
}

/** internal.note（改行は残す。他の C0・DEL・向きの制御は除く＝Rules の reChatControl。trim） */
export function cleanScheduleNote(raw: string): string {
  return raw.replace(/\r\n?/g, '\n').replace(/[‪-‮⁦-⁩\u0000-\u0009\u000B-\u001F\u007F]/g, '').trim();
}

/** 担当名（改行・タブは空白にしてから制御文字を除く。trim。Rules の reNoteControl） */
export const cleanAssignee = (raw: string): string => cleanProxyNote(raw);

/** 取り下げ・再計画の理由（代理承認の理由と同じ整え方と範囲。お客様にも見える。L-8） */
export const cleanScheduleReason = (raw: string): string => cleanProxyNote(raw);
export function validateScheduleReason(note: string): string | null {
  if (!note) return '理由を入力してください（お客様にも表示されます）';
  if (proxyNoteLength(note) > PROXY_NOTE_MAX) return `理由は${PROXY_NOTE_MAX}文字以内にしてください`;
  return null;
}

/** 保存する予定日の下書きとメモ（Rules の validInternal が受けるキーだけ。buildDue は空なら持たない。note は空なら消す＝''） */
export function scheduleForSave(d: ScheduleDraft): { draft: ScheduleDates; note: string } {
  const buildDue = d.buildDue.trim();
  return {
    draft: { ...(buildDue ? { buildDue } : {}), deliveryDate: d.deliveryDate.trim(), releaseDate: d.releaseDate.trim() },
    note: cleanScheduleNote(d.note),
  };
}

export const sameDates = (a: ScheduleDates | undefined, b: ScheduleDates | undefined): boolean =>
  !!a && !!b && (a.buildDue ?? '') === (b.buildDue ?? '') && a.deliveryDate === b.deliveryDate && a.releaseDate === b.releaseDate;

/** current の WBS の 1 行（書く値） */
export interface WbsRowWrite { start: string; end: string; doneAt?: unknown }
export interface WbsMarkWrite { state: 'done' | 'undone'; at: unknown; by: string }

/**
 * WBS の保存の写像（Rules の validWbs・marksOk と同じ形）。
 * - wbs: 6 行ちょうど。build の行は start・end だけ
 * - done[id] が true で前に完了印が無い → doneAt = now・marks[id] = done ／ false で前にある → doneAt を外す・marks[id] = undone ／
 *   それ以外（undefined・前と同じ）→ 前の doneAt を**読んだ値のまま**残す（Rules は前の値との等式）
 * - assignees: 担当名を整えて、空はキーごと省く
 * before は TX で読んだ current.wbs（読んだままの値）。now は serverTimestamp()
 */
export function wbsForSave(
  items: readonly WbsItem[], before: unknown, done: Partial<Record<WbsId, boolean>>, now: unknown, uid: string,
): { wbs: Record<WbsId, WbsRowWrite>; marks: Partial<Record<WbsId, WbsMarkWrite>>; assignees: Partial<Record<WbsId, string>> } {
  const b = obj(before);
  const wbs = {} as Record<WbsId, WbsRowWrite>;
  const marks: Partial<Record<WbsId, WbsMarkWrite>> = {};
  const assignees: Partial<Record<WbsId, string>> = {};
  for (const id of WBS_IDS) {
    const it = items.find((w) => w.id === id);
    if (!it) throw new Error('WBS の行が足りません');
    const row: WbsRowWrite = { start: it.start.trim(), end: it.end.trim() };
    if (id !== 'build') {
      const had = obj(b?.[id])?.doneAt;
      const want = done[id];
      if (want === true && had == null) {
        row.doneAt = now;
        marks[id] = { state: 'done', at: now, by: uid };
      } else if (want === false && had != null) {
        marks[id] = { state: 'undone', at: now, by: uid };
      } else if (had != null) {
        row.doneAt = had;
      }
    }
    wbs[id] = row;
    const who = cleanAssignee(it.assignee ?? '');
    if (who) assignees[id] = who;
  }
  return { wbs, marks, assignees };
}

/** current の WBS が前と変わるか（日付・完了印。before は読んだままの値） */
export function wbsWriteChanged(next: Record<WbsId, WbsRowWrite>, before: unknown, marks: Partial<Record<WbsId, unknown>>): boolean {
  const b = obj(before);
  if (!b) return true;
  if (Object.keys(marks).length) return true;
  return WBS_IDS.some((id) => {
    const r = obj(b[id]);
    return !r || r.start !== next[id].start || r.end !== next[id].end;
  });
}

export const sameAssignees = (a: Partial<Record<WbsId, string>>, b: Partial<Record<WbsId, string>>): boolean =>
  WBS_IDS.every((id) => (a[id] ?? '') === (b[id] ?? ''));

/* ---------- 競合（SU-09。L-4・L-18） ---------- */

export type ScheduleConflict = 'changed' | 'revision' | null;

/**
 * 開いた時点（表示した時点）の値と、TX 内で読んだ値を比べる。editSeq が違えば中身が変わった（保存・WBS・submit のどれでも +1。Rules）、
 * revision が違えば別の版。どちらも保存・承認を送らない
 */
export function scheduleConflict(
  shown: { editSeq: number | null | undefined; revision?: number }, actual: { editSeq: number | null | undefined; revision?: number },
): ScheduleConflict {
  if (shown.revision !== undefined && shown.revision !== actual.revision) return 'revision';
  if ((shown.editSeq ?? null) !== (actual.editSeq ?? null)) return 'changed';
  return null;
}

export const SCHEDULE_CONFLICT_TEXT: Record<'save' | 'approve', string> = {
  save: 'ほかの人が先に保存しました。最新を読み込みました',
  approve: '内容が変わりました。最新を読み込みました',
};

/* ---------- 進捗（SU-08・AC-10） ---------- */

export type LiveWbsStatus = 'done' | 'doing' | 'todo' | 'late';

export interface LiveWbsProgress extends LiveWbsItem {
  done: boolean;
  percent: number;
  status: LiveWbsStatus;
  /** 構築の行だけ（お客様には出さない） */
  tasks?: { done: number; total: number; limited: boolean };
}

/** 状態（demo の features/schedule/wbsProgress.ts statusOf と同じ規則。あちらは DemoStore 側を import するので単体テストから読めず、同じ式をここに置く） */
export function liveStatusOf(item: { start: string; end: string }, actual: { done: boolean; percent: number }, today: string): LiveWbsStatus {
  if (actual.done) return 'done';
  if (today > item.end) return 'late';
  if (today >= item.start || actual.percent > 0) return 'doing';
  return 'todo';
}

/**
 * WBS の実績。構築の行は構築タスク（done / 全件。0 件は 0%。上限 TASK_LIMIT 件に達したら limited）、他の行は完了印（doneAt）。
 * tasks が null（お客様は読めない）のときの構築の行は日付だけで状態を出す
 */
export function wbsProgressLive(items: readonly LiveWbsItem[], tasks: readonly Pick<TaskDoc, 'status'>[] | null, today: string): LiveWbsProgress[] {
  return items.map((w) => {
    if (w.id === 'build') {
      const total = tasks?.length ?? 0;
      const doneCount = tasks?.filter((t) => t.status === 'done').length ?? 0;
      const done = total > 0 && doneCount === total;
      const percent = total === 0 ? 0 : Math.round((doneCount / total) * 100);
      return {
        ...w, done, percent, status: liveStatusOf(w, { done, percent }, today),
        ...(tasks ? { tasks: { done: doneCount, total, limited: total >= TASK_LIMIT } } : {}),
      };
    }
    const done = !!w.doneAt;
    const percent = done ? 100 : 0;
    return { ...w, done, percent, status: liveStatusOf(w, { done, percent }, today) };
  });
}

/** お客様に出す状態の文言（「遅れ」は「調整中」。構築タスク・担当は出さない） */
export const CLIENT_WBS_STATUS_LABEL: Record<LiveWbsStatus, string> = { done: '完了', doing: '進行中', todo: '未着手', late: '調整中' };

/* ---------- 一覧・段階（SU-05。C-01・NC-4・L-21） ---------- */

/** Timestamp の ISO → 日本時間の暦日（UTC 15:00 で日付が変わる） */
export function jstYmd(iso: string): string {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? '' : new Date(t + 9 * 3_600_000).toISOString().slice(0, 10);
}

/** 一覧の公開予定日（yyyy-mm-dd）: submit 済みのスケジュールの公開予定日、無ければ案件の launchDate の日本時間の暦日。launchDate は変えない */
export function releaseYmdOf(summary: ScheduleSummary | null | undefined, launchDate: string | undefined): string | undefined {
  return summary?.releaseDate ?? (launchDate ? jstYmd(launchDate) || undefined : undefined);
}

/* ---------- 案件詳細の state（projectView.ts。ProjectDetailView が state.schedule を読む） ---------- */

/** liveProjectView に渡すスケジュール（demo の ProjectSchedule の形）と、依頼中なら依頼の日時 */
export interface LiveScheduleState { schedule: ProjectSchedule; requestedAt?: string }

/**
 * アフロ側の表示用（管理者・担当の開発者）: 予定日は下書き（internal.draft）、無ければ current の submit 済みの値。
 * approvedAt は承認済みの状態のときだけ（再計画・差し戻し中は立てない）。WBS は current の行に担当名を重ねる
 */
export function liveScheduleState(summary: ScheduleSummary | null, current: ScheduleCurrent | null, internal: ScheduleInternal | null): LiveScheduleState | null {
  if (!summary) return null;
  const dates = internal?.draft ?? current?.dates;
  if (!dates) return null;
  const wbs = current?.wbs?.map((w) => (internal?.assignees[w.id] ? { ...w, assignee: internal.assignees[w.id] } : w));
  const schedule: ProjectSchedule = {
    ...dates,
    ...(internal?.note ? { note: internal.note } : {}),
    savedAt: internal?.updatedAt ?? current?.updatedAt ?? '',
    savedBy: internal?.savedByName ?? '',
    ...(summary.status === 'approved' && summary.approvedAt ? { approvedAt: summary.approvedAt } : {}),
    ...(wbs ? { wbs } : {}),
  };
  return { schedule, ...(summary.status === 'requested' && summary.requestedAt ? { requestedAt: summary.requestedAt } : {}) };
}
