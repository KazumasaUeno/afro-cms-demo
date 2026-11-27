import { Box, Button, ButtonBase, Stack, Typography, useMediaQuery, useTheme } from '@mui/material';
import { ChevronDown, GanttChart, RotateCcw, Save } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { DemoState, DevTaskStatus, WbsId, WbsItem } from '@/types';
import { Reveal, SectionTitle, StatusPill, Surface, type PillTone } from '@/components/ui';
import { useDemoOptional } from '@/store/DemoStore';
import { useToast } from '@/hooks/useToast';
import { todayYmd, ymdToIso } from '@/features/projects/projectForm';
import { DEV_TASK_STATUSES } from '@/data/dev';
import { WBS_ITEMS, daysBetween, dragWbs, moveMilestone, shiftYmd, validateWbs, type MilestoneDates, type MilestoneKey, type WbsDragMode } from '@/data/schedule';
import { tokens } from '@/theme/tokens';
import { WBS_STATUS_LABEL, currentWbs, wbsRows, type WbsRow, type WbsStatus } from './wbsProgress';
import { WbsEditDialog } from './WbsEditDialog';
import { sameDone, type WbsDone, type WbsSource } from './scheduleSource';

/**
 * 制作〜公開の WBS（2026-11-17 ユーザー指示「作ってみて」）。作業ごとの開始・終了・担当を横のガントで見せ、
 * バーの中の塗りが実績（制作データから導く）。全ページの構築の下に構築タスクを開ける。
 * 入力・保存は開発者画面だけ（管理者画面は見るだけ）。スマホでは図だけ横にスクロールし、作業名の列は固定。
 * 開発者画面ではバーをドラッグして動かせる（2026-11-17 ユーザー指示「表自体を伸縮で移動できるようにしたい」）:
 * 本体＝移動（日数は保つ）、左右の端＝開始日・終了日。日単位でそろえ、Esc で元に戻す。キーボードは ←→（Shift＝終了日、Alt＝開始日）。
 * 動かすのは下書き（日付の入力欄と同じ）で、保存は「WBS を保存」
 */

const STATUS_TONE: Record<WbsStatus, PillTone> = { done: 'success', doing: 'primary', late: 'warning', todo: 'neutral' };
const BAR_COLOR: Record<WbsStatus, { track: string; fill: string }> = {
  done: { track: tokens.color.successSoft, fill: tokens.color.success },
  doing: { track: tokens.color.primarySoft, fill: tokens.color.primary },
  late: { track: tokens.color.warningSoft, fill: tokens.color.warning },
  todo: { track: tokens.color.bgSubtle, fill: tokens.color.faint },
};
const TASK_TONE: Record<DevTaskStatus, PillTone> = { done: 'success', review: 'info', doing: 'primary', todo: 'neutral' };
const taskLabel = (s: DevTaskStatus) => DEV_TASK_STATUSES.find((x) => x.id === s)?.label ?? s;
const labelOf = (id: WbsId) => WBS_ITEMS.find((i) => i.id === id)?.label ?? id;

/** yyyy-mm-dd → M/D */
const md = (ymd: string) => {
  const [, m, d] = ymd.split('-');
  return `${Number(m)}/${Number(d)}`;
};
const weekday = (ymd: string) => new Date(ymdToIso(ymd) ?? ymd).getDay();
const spanDays = (start: string, end: string) => daysBetween(start, end) + 1;

interface Milestone { key: MilestoneKey; label: string; short: string; date: string }

/** 節目（◆）のドラッグ中の情報（2026-11-17 ユーザー指示「制作完了、納品、公開もドラッグ移動可能に」） */
interface MsDragState {
  key: MilestoneKey; pointerId: number; x0: number; orig: MilestoneDates;
  from: string; dayPx: number; chartW: number; days: number;
}

/** ドラッグ中の情報（2026-11-17）。図の目盛り（from・dayPx・幅）はドラッグの間だけ固定して、バーが揺れないようにする */
interface DragState {
  id: WbsId; mode: WbsDragMode; pointerId: number; x0: number;
  orig: { start: string; end: string };
  from: string; dayPx: number; chartW: number; days: number;
  /** 4px より動いたか（動いたらダブルクリック・ダブルタップとして数えない） */
  moved?: boolean;
}

const NO_DONE: WbsDone = {};
/** 完了印の集合を比べる鍵（付いている行の id を WBS の順に） */
const doneKeyOf = (d: WbsDone) => WBS_ITEMS.filter((w) => d[w.id]).map((w) => w.id).join(',');
const doneOfKey = (key: string): WbsDone => Object.fromEntries(key ? key.split(',').map((id) => [id, true]) : []) as WbsDone;
/** view も DemoStore も無い（live で view を渡し忘れた）ときは分かる形で落とす */
function noState(): never {
  throw new Error('WbsSection: live では view（案件の state）を渡してください');
}

/** ダブルクリック・ダブルタップとみなす間隔と距離（2026-11-17） */
const DOUBLE_TAP_MS = 400;
const DOUBLE_TAP_PX = 12;

/**
 * ms: 節目の下書き（無ければ保存の値）。onMsChange があるとき（開発者画面）は ◆ をドラッグ・←→ で動かせる。
 * 保存は親（SchedulePage の「予定日を保存」）
 */
/** client: お客様ポータル（2026-11-17）。見るだけ・担当と構築タスクを出さない・「遅れ」は「調整中」と出す */
/** view: 表示する案件のデータ（プロジェクト詳細は選んでいる案件と違うことがある。無ければ選んでいる案件。2026-11-17） */
/**
 * source: live のデータ源（LIVE_SCHEDULE_PLAN L-13・U3-a。WBS の行・実績・検査・保存・完了印）。無ければ従来どおり DemoStore。
 * live は DemoStore が無いので view も渡す。完了印（demo に無い）は source があるときだけ入力画面に出す
 */
export function WbsSection({ editable, devBy, ms, onMsChange, client = false, view, source }: {
  editable: boolean; devBy?: string; ms?: MilestoneDates; onMsChange?: (next: MilestoneDates) => void; client?: boolean; view?: DemoState; source?: WbsSource;
}) {
  const demo = useDemoOptional();
  const state = view ?? demo?.state ?? noState();
  const dispatch = demo?.dispatch;
  const toast = useToast();
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const schedule = state.schedule;
  const items = useMemo(() => (source ? source.items : currentWbs(state)), [source, state]);
  const today = todayYmd();
  const [draft, setDraft] = useState<WbsItem[]>(items);
  // 予定日を保存し直すと初期値（保存の無い WBS）が変わる。下書きを触っていなければ新しい初期値にそろえる
  // （以前は key で作り直していたが、それだと予定日の保存で WBS の未保存の変更が消える。2026-11-17）
  const itemsJson = JSON.stringify(items);
  const prevItems = useRef(itemsJson);
  useEffect(() => {
    if (prevItems.current === itemsJson) return;
    const before = prevItems.current;
    prevItems.current = itemsJson;
    setDraft((d) => (JSON.stringify(d) === before ? (JSON.parse(itemsJson) as WbsItem[]) : d));
  }, [itemsJson]);
  // 完了印の下書き（live だけ。demo は使わない）。保存済みが変わったら、触っていなければそろえる（日付の下書きと同じ）
  const savedDone = source?.done ?? NO_DONE;
  const [doneDraft, setDoneDraft] = useState<WbsDone>(savedDone);
  const doneKey = doneKeyOf(savedDone);
  const prevDone = useRef(doneKey);
  useEffect(() => {
    if (prevDone.current === doneKey) return;
    const before = prevDone.current;
    prevDone.current = doneKey;
    setDoneDraft((d) => (doneKeyOf(d) === before ? doneOfKey(doneKey) : d));
  }, [doneKey]);
  // 下書きを始めた時点の版（live の競合の検出。触っていない間は最新に追従する）と、保存中か
  const [token, setToken] = useState(source?.token ?? '');
  const [saving, setSaving] = useState(false);
  const [msDrag, setMsDrag] = useState<MsDragState | null>(null);
  const msDragRef = useRef<MsDragState | null>(null);
  msDragRef.current = msDrag;
  const msEditable = editable && !!onMsChange;
  // 図の枠の幅（2026-11-17）。期間が短いときは枠いっぱいに伸ばす（1 日の幅を枠から決める）
  const [box, setBox] = useState<HTMLElement | null>(null);
  const [availW, setAvailW] = useState(0);
  useEffect(() => {
    if (!box || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => setAvailW(Math.floor(entry.contentRect.width)));
    ro.observe(box);
    return () => ro.disconnect();
  }, [box]);
  const [openTasks, setOpenTasks] = useState(false);
  const [drag, setDrag] = useState<DragState | null>(null);
  // 入力画面（ダブルクリック・ダブルタップ・Enter で開く。2026-11-17 ユーザー指示「横棒のダブルクリックで入力画面を表示」）
  const [editing, setEditing] = useState<{ id: WbsId; key: number } | null>(null);
  const lastTap = useRef<{ id: WbsId; at: number; x: number; y: number } | null>(null);
  // 選んでいる作業（2026-11-17 ユーザー指示「クリックでフォーカスを移動」）。クリック・タップ・フォーカスで選び、ポインターが離れても表示を残す
  const [selected, setSelected] = useState<WbsId | null>(null);
  const barRefs = useRef(new Map<WbsId, HTMLElement>());
  /** 作業を選ぶ。開発者画面はそのバーへフォーカスを移す（←→・Enter をすぐ使えるように）。管理者画面は強調だけ */
  const selectRow = (id: WbsId) => {
    setSelected(id);
    if (!editable) return;
    const el = barRefs.current.get(id);
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;
  const errors = source ? source.validate(draft) : validateWbs(draft);
  // 開発者画面では図も下書きを描く（ドラッグ・入力がすぐ図に出る）。日付が読めない作業だけ保存の値で描く
  const chartItems = editable ? draft.map((w, i) => (errors[w.id]?.start || errors[w.id]?.end ? items[i] : w)) : items;
  const rows = source ? source.rows(chartItems, today, doneDraft) : wbsRows(state, chartItems, today);
  const dirty = editable && (JSON.stringify(draft) !== JSON.stringify(items) || (!!source && !sameDone(doneDraft, savedDone)));
  const liveToken = source?.token;
  useEffect(() => {
    if (liveToken !== undefined && !dirty) setToken(liveToken);
  }, [liveToken, dirty]);

  const setTimes = (id: WbsId, t: { start: string; end: string }) =>
    setDraft((list) => (list.some((w) => w.id === id && (w.start !== t.start || w.end !== t.end))
      ? list.map((w) => (w.id === id ? { ...w, ...t } : w)) : list));

  // Esc でドラッグをやめて、元の日付に戻す
  useEffect(() => {
    if (!drag) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const d = dragRef.current;
      if (d) setTimes(d.id, d.orig);
      setDrag(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drag]);
  // 節目のドラッグも Esc で元に戻す
  useEffect(() => {
    if (!msDrag) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const d = msDragRef.current;
      if (d) onMsChange?.(d.orig);
      setMsDrag(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [msDrag, onMsChange]);

  if (!schedule) {
    return (
      <Surface padding={{ xs: 2, md: 3 }} sx={{ mt: 3 }}>
        <SectionTitle title="制作〜公開の WBS" icon={<GanttChart size={18} />} />
        <Typography variant="body2" role="status" sx={{ color: 'text.secondary' }}>
          上の予定日を保存すると、作業ごとの予定（WBS）が作られます。
        </Typography>
      </Surface>
    );
  }

  const msv: MilestoneDates = ms ?? { buildDue: schedule.buildDue, deliveryDate: schedule.deliveryDate, releaseDate: schedule.releaseDate };
  const milestones: Milestone[] = [
    ...(msv.buildDue ? [{ key: 'buildDue' as const, label: '制作の完了予定', short: '制作完了', date: msv.buildDue }] : []),
    { key: 'deliveryDate', label: '納品予定日', short: '納品', date: msv.deliveryDate },
    { key: 'releaseDate', label: '公開予定日', short: '公開', date: msv.releaseDate },
  ];

  // 表示する期間（作業と節目の全部＋前後の余白。今日が 30 日以内なら今日も入れる）。開発者画面はドラッグ用に余白を広く
  const dates = [...rows.flatMap((r) => [r.start, r.end]), ...milestones.map((m) => m.date)].sort();
  let lo = dates[0];
  let hi = dates[dates.length - 1];
  if (today < lo && daysBetween(today, lo) <= 30) lo = today;
  if (today > hi && daysBetween(hi, today) <= 30) hi = today;
  const pad = editable ? 14 : 3;
  lo = shiftYmd(lo, -pad);
  hi = shiftYmd(hi, pad);
  const nameW = phone ? 132 : 232;
  // ドラッグの間は目盛りを固定する
  const frozen = drag ?? msDrag;
  const from = frozen?.from ?? lo;
  const days = frozen?.days ?? spanDays(lo, hi);
  // 枠の幅が分かれば枠いっぱい（最小 1 日 = スマホ 6px / PC 4px。足りなければ図だけ横にスクロール）
  const minPx = phone ? 6 : 4;
  const dayPx = frozen?.dayPx ?? (availW > nameW
    ? Math.max(minPx, (availW - nameW) / days)
    : Math.max(minPx, Math.min(16, (phone ? 520 : 820) / days)));
  const chartW = frozen?.chartW ?? Math.floor(days * dayPx);
  const x = (ymd: string) => daysBetween(from, ymd) * dayPx;
  const showToday = today >= from && today < shiftYmd(from, days);

  // 月の見出しと週の目盛り（月曜）
  const months: { at: number; label: string }[] = [];
  const weeks: { at: number; label: string }[] = [];
  for (let i = 0; i < days; i++) {
    const ymd = shiftYmd(from, i);
    const [y, m, d] = ymd.split('-').map(Number);
    if (i === 0 || d === 1) months.push({ at: i * dayPx, label: i === 0 || m === 1 ? `${y}年${m}月` : `${m}月` });
    if (weekday(ymd) === 1) weeks.push({ at: i * dayPx, label: md(ymd) });
  }
  const firstMonday = weeks[0]?.at ?? 0;
  const grid = {
    backgroundImage: `repeating-linear-gradient(to right, ${tokens.color.outlineVariant} 0 1px, transparent 1px ${7 * dayPx}px)`,
    backgroundPositionX: `${firstMonday}px`,
  };

  const nameCell = {
    position: 'sticky', left: 0, zIndex: 2, bgcolor: tokens.color.surface, borderRight: `1px solid ${tokens.color.outlineVariant}`,
    px: 1.25, py: 1, minWidth: 0,
  } as const;
  const rowLine = { borderTop: `1px solid ${tokens.color.outlineVariant}` };

  /* ---------- ドラッグ・キー操作（開発者画面だけ） ---------- */

  const startDrag = (id: WbsId, e: ReactPointerEvent<HTMLElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const w = chartItems.find((v) => v.id === id);
    if (!w) return;
    const handle = (e.target as HTMLElement).closest('[data-handle]')?.getAttribute('data-handle');
    const mode: WbsDragMode = handle === 'start' ? 'start' : handle === 'end' ? 'end' : 'move';
    e.preventDefault();
    e.currentTarget.focus({ preventScroll: true });
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ id, mode, pointerId: e.pointerId, x0: e.clientX, orig: { start: w.start, end: w.end }, from, dayPx, chartW, days });
  };
  const moveDrag = (e: ReactPointerEvent<HTMLElement>) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    if (Math.abs(e.clientX - d.x0) > 4) d.moved = true;
    setTimes(d.id, dragWbs(d.orig, d.mode, (e.clientX - d.x0) / d.dayPx));
  };
  const endDrag = (e: ReactPointerEvent<HTMLElement>, cancel = false) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    if (cancel) setTimes(d.id, d.orig);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    setDrag(null);
    // 動かさずに 2 回押したら入力画面（マウスもタッチも同じ判定。ネイティブの dblclick はタッチで当てにならないので使わない）
    if (cancel || d.moved) { lastTap.current = null; return; }
    const prev = lastTap.current;
    const now = Date.now();
    if (prev && prev.id === d.id && now - prev.at <= DOUBLE_TAP_MS && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) <= DOUBLE_TAP_PX) {
      lastTap.current = null;
      setEditing({ id: d.id, key: now });
    } else {
      lastTap.current = { id: d.id, at: now, x: e.clientX, y: e.clientY };
    }
  };
  /* ---------- 節目（◆）のドラッグ・キー操作（開発者画面だけ。2026-11-17） ---------- */

  const startMsDrag = (key: MilestoneKey, e: ReactPointerEvent<HTMLElement>) => {
    if (!onMsChange || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    e.currentTarget.focus({ preventScroll: true });
    e.currentTarget.setPointerCapture(e.pointerId);
    setMsDrag({ key, pointerId: e.pointerId, x0: e.clientX, orig: msv, from, dayPx, chartW, days });
  };
  const moveMsDrag = (e: ReactPointerEvent<HTMLElement>) => {
    const d = msDragRef.current;
    if (!d || e.pointerId !== d.pointerId || !onMsChange) return;
    const base = d.orig[d.key];
    if (!base) return;
    const next = moveMilestone(d.orig, d.key, shiftYmd(base, Math.round((e.clientX - d.x0) / d.dayPx) || 0));
    if (next[d.key] !== msv[d.key]) onMsChange(next);
  };
  const endMsDrag = (e: ReactPointerEvent<HTMLElement>, cancel = false) => {
    const d = msDragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    if (cancel) onMsChange?.(d.orig);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    setMsDrag(null);
  };
  const onMsKey = (key: MilestoneKey, e: ReactKeyboardEvent<HTMLElement>) => {
    if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || !onMsChange) return;
    const base = msv[key];
    if (!base) return;
    e.preventDefault();
    onMsChange(moveMilestone(msv, key, shiftYmd(base, e.key === 'ArrowLeft' ? -1 : 1)));
  };

  const onBarKey = (id: WbsId, e: ReactKeyboardEvent<HTMLElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); setEditing({ id, key: Date.now() }); return; }
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const w = chartItems.find((v) => v.id === id);
    if (!w) return;
    e.preventDefault();
    const mode: WbsDragMode = e.shiftKey ? 'end' : e.altKey ? 'start' : 'move';
    setTimes(id, dragWbs(w, mode, e.key === 'ArrowLeft' ? -1 : 1));
  };

  const bar = (r: Pick<WbsRow, 'start' | 'end' | 'percent' | 'status' | 'percentUnknown'>, label: string, thin = false, id?: WbsId) => {
    // live で割合が分からない行（構築タスクが読めない構築）は「実績 ○%」を言わない・塗らない（demo は常に数値）
    const actualText = r.percentUnknown ? '' : `・実績 ${r.percent}%`;
    const c = BAR_COLOR[r.status];
    const edit = editable && !thin && !!id;
    const n = spanDays(r.start, r.end);
    const text = `${md(r.start)}〜${md(r.end)}・${n}日`;
    const dragging = edit && drag?.id === id;
    const isSel = !thin && !!id && selected === id;
    const a11y = edit && id
      ? {
        role: 'slider', tabIndex: 0,
        'aria-label': `${label}の予定。←→ で移動、Shift＋←→ で終了日、Alt＋←→ で開始日、Enter で日付・担当を入力`,
        'aria-valuemin': 0, 'aria-valuemax': days - 1, 'aria-valuenow': daysBetween(from, r.start),
        'aria-valuetext': `${label} ${text}${actualText}・${client && r.status === 'late' ? '調整中' : WBS_STATUS_LABEL[r.status]}`,
        onPointerDown: (e: ReactPointerEvent<HTMLElement>) => startDrag(id, e),
        onPointerMove: moveDrag,
        onPointerUp: (e: ReactPointerEvent<HTMLElement>) => endDrag(e),
        onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => endDrag(e, true),
        onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => onBarKey(id, e),
        onFocus: () => setSelected(id),
        ref: (el: HTMLElement | null) => { if (el) barRefs.current.set(id, el); else barRefs.current.delete(id); },
      }
      : {
        role: 'img', 'aria-label': `${label} 予定 ${text}${actualText}・${client && r.status === 'late' ? '調整中' : WBS_STATUS_LABEL[r.status]}`,
        ...(id && !thin ? { onClick: () => setSelected(id) } : {}),
      };
    return (
      <Box
        {...a11y}
        title={r.percentUnknown ? `${label} ${text}` : `${label} ${text}（実績 ${r.percent}%）`}
        sx={{
          position: 'absolute', zIndex: dragging ? 3 : isSel ? 2 : 1, top: '50%', transform: 'translateY(-50%)', left: x(r.start),
          width: Math.max(dayPx, n * dayPx), height: thin ? 6 : edit ? 20 : 16,
          ...(edit ? {
            // 図の他の所は横スクロールできるよう、指で動かすのはバーと端だけ
            touchAction: 'none', cursor: dragging ? 'grabbing' : 'grab', borderRadius: `${tokens.radius.xs}px`, userSelect: 'none',
            // クリックでもフォーカスが分かるよう :focus で輪を出す（:focus-visible だけだとマウスでは出ない）
            '&:focus': { outline: 'none' },
            '&:hover .wbs-grip, &:focus .wbs-grip': { opacity: 1 },
          } : {}),
          // 選んでいる作業は輪＋少し浮かせる（ポインターが離れても残す）
          ...(isSel ? { borderRadius: `${tokens.radius.xs}px`, boxShadow: `${tokens.shadow.focus}, ${tokens.shadow.md}` } : {}),
        }}
      >
        <Box
          sx={{
            height: '100%', borderRadius: `${tokens.radius.xs}px`, bgcolor: c.track, overflow: 'hidden',
            outline: r.status === 'late' ? `1px solid ${tokens.color.warning}` : undefined,
          }}
        >
          {!r.percentUnknown && <Box sx={{ width: `${r.percent}%`, height: '100%', bgcolor: c.fill }} />}
        </Box>
        {edit && (['start', 'end'] as const).map((side) => (
          <Box
            key={side} data-handle={side} aria-hidden
            sx={{
              position: 'absolute', top: -6, bottom: -6, [side === 'start' ? 'left' : 'right']: -5, width: 10,
              cursor: 'ew-resize', touchAction: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Box
              className="wbs-grip"
              sx={{
                width: 4, height: 14, borderRadius: '2px', bgcolor: tokens.color.ink, pointerEvents: 'none',
                opacity: dragging ? 1 : 0, transition: `opacity ${tokens.motion.fast}s`,
                '@media (hover: none)': { opacity: 0.6 },
                '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
              }}
            />
          </Box>
        ))}
        {dragging && (
          <Box
            aria-hidden
            sx={{
              position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, px: 0.75, py: 0.25, whiteSpace: 'nowrap', pointerEvents: 'none',
              bgcolor: tokens.color.inverseSurface, color: tokens.color.inverseOnSurface, borderRadius: `${tokens.radius.xs}px`,
              fontSize: 12, fontWeight: 600, boxShadow: tokens.shadow.sm,
            }}
          >
            {md(r.start)} → {md(r.end)}・{n}日
          </Box>
        )}
      </Box>
    );
  };

  const build = rows.find((r) => r.id === 'build');

  const save = () => {
    // 日付はドラッグで変える（開始 ≦ 終了は dragWbs が保つ）。念のため検査に通らなければ保存しない
    if (Object.keys(errors).length > 0) { toast('日付に誤りがあるため保存できません。「元に戻す」で保存済みの日付に戻せます'); return; }
    // 保存と同じ形にそろえる（前後の空白・空の担当）。そろえないと「未保存の変更」が残って見える
    const settle = () => setDraft((list) => list.map((w) => {
      const assignee = (w.assignee ?? '').trim();
      return { id: w.id, start: w.start.trim(), end: w.end.trim(), ...(assignee ? { assignee } : {}) };
    }));
    if (source) {
      // live: 書き込みの後（失敗・競合の文言は source.save が出す）
      if (!source.save || saving) return;
      setSaving(true);
      void source.save(draft, doneDraft, token).then((ok) => {
        setSaving(false);
        if (!ok) return;
        settle();
        toast('WBS を保存しました');
      });
      return;
    }
    dispatch?.({ type: 'saveWbs', wbs: draft, devBy });
    settle();
    toast('WBS を保存しました');
  };
  const reset = () => {
    setDraft(items);
    if (source) setDoneDraft(savedDone);
  };

  return (
    <Reveal>
      <Surface padding={{ xs: 2, md: 3 }} sx={{ mt: 3 }}>
        <SectionTitle title="制作〜公開の WBS" icon={<GanttChart size={18} />} />
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
          作業ごとの予定（バーの長さ）と実績（バーの中の塗り）を並べています。{client ? '' : '終了日を過ぎて終わっていない作業は「遅れ」になります。'}
          {editable && ' バーをドラッグすると移動、両端をドラッグすると開始日・終了日を変えられます（Esc で取り消し）。ダブルクリック（スマホはダブルタップ、キーボードは Enter）で日付・担当を入力できます。'}
          {editable && source && ' 完了印（全ページの構築を除く）も同じ入力画面で付け外しできます。'}
        </Typography>
        {source?.notice && (
          <Typography
            variant="body2" role="note"
            sx={{ mb: 2, px: 1.5, py: 1, borderRadius: `${tokens.radius.sm}px`, bgcolor: tokens.color.warningSoft, color: tokens.color.warningInk }}
          >
            {source.notice}
          </Typography>
        )}

        {/* 図だけ横にスクロールする（ページは横にスクロールさせない） */}
        <Box
          ref={setBox} role="region" aria-label="WBS のガントチャート" tabIndex={0}
          sx={{
            overflowX: 'auto', maxWidth: '100%', border: `1px solid ${tokens.color.outlineVariant}`, borderRadius: `${tokens.radius.md}px`,
            '&:focus-visible': { outline: 'none', boxShadow: tokens.shadow.focus },
          }}
        >
          <Box sx={{ position: 'relative', width: nameW + chartW }}>
            {/* 見出し: 月・週・節目 */}
            <Box sx={{ display: 'grid', gridTemplateColumns: `${nameW}px ${chartW}px` }}>
              <Box sx={{ ...nameCell, display: 'flex', alignItems: 'flex-end' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>作業・担当・状態</Typography>
              </Box>
              <Box sx={{ position: 'relative', height: 58 }}>
                {months.map((m) => (
                  <Typography key={`m${m.at}`} variant="caption" sx={{ position: 'absolute', top: 4, left: m.at + 4, fontWeight: 700, whiteSpace: 'nowrap', color: 'text.primary' }}>
                    {m.label}
                  </Typography>
                ))}
                {7 * dayPx >= 30 && weeks.filter((w) => !showToday || w.at + 36 < x(today) + dayPx / 2 - 20 || w.at > x(today) + dayPx / 2 + 20).map((w) => (
                  <Typography key={`w${w.at}`} variant="caption" sx={{ position: 'absolute', top: 22, left: w.at + 2, fontSize: 11, color: 'text.secondary', whiteSpace: 'nowrap' }}>
                    {w.label}
                  </Typography>
                ))}
                {milestones.map((m) => {
                  const dragging = msDrag?.key === m.key;
                  const ctl = msEditable ? {
                    role: 'slider', tabIndex: 0,
                    'aria-label': `${m.label}。←→ で 1 日ずつ動かせます`,
                    'aria-valuemin': 0, 'aria-valuemax': days - 1, 'aria-valuenow': daysBetween(from, m.date),
                    'aria-valuetext': `${m.label} ${md(m.date)}`,
                    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => startMsDrag(m.key, e),
                    onPointerMove: moveMsDrag,
                    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => endMsDrag(e),
                    onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => endMsDrag(e, true),
                    onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => onMsKey(m.key, e),
                  } : { 'aria-hidden': true };
                  return (
                    <Box
                      key={m.key} {...ctl}
                      sx={{
                        position: 'absolute', top: 36, left: x(m.date) + dayPx / 2, transform: 'translateX(-50%)', zIndex: dragging ? 3 : 1,
                        display: 'flex', alignItems: 'center', gap: 0.5, whiteSpace: 'nowrap', px: 0.5, minHeight: 20,
                        ...(msEditable ? {
                          touchAction: 'none', userSelect: 'none', cursor: dragging ? 'grabbing' : 'ew-resize', borderRadius: `${tokens.radius.xs}px`,
                          '&:hover': { bgcolor: tokens.color.dangerSoft },
                          '&:focus': { outline: 'none', boxShadow: tokens.shadow.focus, bgcolor: tokens.color.dangerSoft },
                        } : {}),
                      }}
                    >
                      <Box sx={{ width: 8, height: 8, bgcolor: tokens.color.danger, transform: 'rotate(45deg)', flexShrink: 0 }} />
                      <Typography variant="caption" sx={{ fontSize: 11, fontWeight: 600, color: tokens.color.dangerInk }}>{m.short}</Typography>
                      {dragging && msDrag && (
                        <Box
                          aria-hidden
                          sx={{
                            position: 'absolute', top: 'calc(100% + 4px)', left: '50%', transform: 'translateX(-50%)', px: 0.75, py: 0.25, pointerEvents: 'none',
                            bgcolor: tokens.color.inverseSurface, color: tokens.color.inverseOnSurface, borderRadius: `${tokens.radius.xs}px`,
                            fontSize: 12, fontWeight: 600, boxShadow: tokens.shadow.sm, whiteSpace: 'nowrap',
                          }}
                        >
                          {m.short} {md(msDrag.orig[m.key] ?? m.date)} → {md(m.date)}
                        </Box>
                      )}
                    </Box>
                  );
                })}
              </Box>
            </Box>

            {/* 作業の行 */}
            {rows.map((r) => (
              <Box key={r.id}>
                <Box sx={{ display: 'grid', gridTemplateColumns: `${nameW}px ${chartW}px`, ...rowLine }}>
                  <Box
                    onClick={() => selectRow(r.id)}
                    sx={{ ...nameCell, cursor: 'pointer', ...(selected === r.id ? { bgcolor: tokens.color.secondaryContainer, boxShadow: `inset 3px 0 0 ${tokens.color.primary}` } : {}) }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.35 }}>{labelOf(r.id)}</Typography>
                    <Typography variant="caption" component="p" sx={{ color: 'text.secondary', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {md(r.start)}〜{md(r.end)}{r.assignee && !client ? `・${r.assignee}` : ''}
                    </Typography>
                    <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.5, flexWrap: 'wrap', rowGap: 0.5 }}>
                      <StatusPill tone={STATUS_TONE[r.status]}>{client && r.status === 'late' ? '調整中' : WBS_STATUS_LABEL[r.status]}{(r.id === 'build' || r.id === 'quality') && !r.percentUnknown ? ` ${r.percent}%` : ''}</StatusPill>
                      {!client && r.id === 'build' && r.tasks && r.tasks.total > 0 && (
                        <ButtonBase
                          onClick={(ev) => { ev.stopPropagation(); setOpenTasks((v) => !v); }} aria-expanded={openTasks} aria-controls="wbs-build-tasks"
                          sx={{
                            gap: 0.25, px: 0.75, minHeight: 24, borderRadius: `${tokens.radius.sm}px`, fontSize: 12, fontWeight: 600,
                            color: tokens.color.primary, '&:focus-visible': { boxShadow: tokens.shadow.focus },
                          }}
                        >
                          タスク {r.tasks.done}/{r.tasks.total}
                          <Box component="span" sx={{ display: 'inline-flex', transform: openTasks ? 'rotate(180deg)' : 'none', transition: `transform ${tokens.motion.fast}s`, '@media (prefers-reduced-motion: reduce)': { transition: 'none' } }}>
                            <ChevronDown size={14} />
                          </Box>
                        </ButtonBase>
                      )}
                    </Stack>
                  </Box>
                  <Box sx={{ position: 'relative', minHeight: 64, ...grid }}>{bar(r, labelOf(r.id), false, r.id)}</Box>
                </Box>

                {/* 全ページの構築の下に構築タスク（開いたときだけ） */}
                {r.id === 'build' && openTasks && build?.tasks && (
                  <Box id="wbs-build-tasks" role="list" aria-label="構築タスク">
                    {build.tasks.list.map((t) => (
                      <Box key={t.id} role="listitem" sx={{ display: 'grid', gridTemplateColumns: `${nameW}px ${chartW}px`, borderTop: `1px dashed ${tokens.color.outlineVariant}` }}>
                        <Box sx={{ ...nameCell, pl: 2.5, py: 0.75, bgcolor: tokens.color.surfaceMuted }}>
                          <Typography variant="caption" component="p" sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.title}>
                            {t.title}
                          </Typography>
                          <Box sx={{ mt: 0.25 }}><StatusPill tone={TASK_TONE[t.status]}>{taskLabel(t.status)}</StatusPill></Box>
                        </Box>
                        <Box sx={{ position: 'relative', minHeight: 48, bgcolor: tokens.color.surfaceMuted, ...grid }}>
                          {bar({ start: r.start, end: r.end, percent: t.status === 'done' ? 100 : 0, status: t.status === 'done' ? 'done' : r.status }, t.title, true)}
                        </Box>
                      </Box>
                    ))}
                  </Box>
                )}
              </Box>
            ))}

            {/* 今日・節目の縦線（作業名の列の下を通す） */}
            {milestones.map((m) => (
              <Box key={`l${m.key}`} aria-hidden sx={{ position: 'absolute', top: 54, bottom: 0, left: nameW + x(m.date) + dayPx / 2, borderLeft: `1px dashed ${tokens.color.danger}`, zIndex: 0, pointerEvents: 'none' }} />
            ))}
            {showToday && (
              <Box aria-hidden sx={{ position: 'absolute', top: 0, bottom: 0, left: nameW + x(today) + dayPx / 2 - 1, width: 2, bgcolor: tokens.color.info, zIndex: 1, pointerEvents: 'none' }}>
                <Typography variant="caption" sx={{ position: 'absolute', top: 20, left: 1, transform: 'translateX(-50%)', fontSize: 11, fontWeight: 700, color: tokens.color.infoInk, bgcolor: tokens.color.infoSoft, px: 0.5, borderRadius: `${tokens.radius.xs}px`, whiteSpace: 'nowrap' }}>
                  今日
                </Typography>
              </Box>
            )}
          </Box>
        </Box>

        {/* 凡例（色だけに頼らず文字でも伝える） */}
        <Stack direction="row" sx={{ mt: 1.5, flexWrap: 'wrap', columnGap: 2, rowGap: 0.75 }} aria-label="凡例">
          {milestones.map((m) => (
            <Typography key={m.key} variant="caption" sx={{ color: 'text.secondary' }}>◆ {m.label} {md(m.date)}</Typography>
          ))}
          {showToday && <Typography variant="caption" sx={{ color: 'text.secondary' }}>｜ 今日 {md(today)}</Typography>}
        </Stack>

        {/* 開発者画面だけ: 保存（図のすぐ下）。日付はバーのドラッグで変える（2026-11-17 ユーザー指示で入力欄「日付と担当を入力して編集」を外した） */}
        {editable && (
          <Box sx={{ mt: 2 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
              <Button variant="contained" startIcon={<Save size={16} />} onClick={save} {...(saving ? { disabled: true } : {})}>WBS を保存</Button>
              {dirty ? (
                <>
                  <Typography variant="body2" role="status" sx={{ color: tokens.color.warningInk, fontWeight: 600 }}>未保存の変更があります</Typography>
                  <Button variant="text" startIcon={<RotateCcw size={16} />} onClick={reset}>元に戻す</Button>
                </>
              ) : schedule.wbs
                ? <StatusPill tone="success">保存済み</StatusPill>
                : <StatusPill tone="neutral">予定日から作った初期値</StatusPill>}
            </Stack>

          </Box>
        )}
        {editable && editing && (
          <WbsEditDialog
            key={editing.key}
            item={draft.find((w) => w.id === editing.id) ?? null}
            label={labelOf(editing.id)}
            onClose={() => setEditing(null)}
            onApply={(it, done) => {
              setDraft((list) => list.map((w) => (w.id === it.id ? it : w)));
              if (done !== undefined) setDoneDraft((d) => ({ ...d, [it.id]: done }));
              setEditing(null);
            }}
            {...(source ? { validate: source.validate } : {})}
            {...(source && editing.id !== 'build' ? { done: { checked: !!doneDraft[editing.id], note: source.markNote?.[editing.id] } } : {})}
          />
        )}
      </Surface>
    </Reveal>
  );
}
