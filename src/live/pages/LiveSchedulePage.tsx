import { Button, Dialog, DialogActions, DialogContent, Stack, TextField, Typography } from '@mui/material';
import { BadgeCheck, Undo2, UserCheck } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import type { DemoState } from '@/types';
import { RouteLoader } from '@/components/layout/RouteLoader';
import { StatusPill } from '@/components/ui';
import { useToast } from '@/hooks/useToast';
import { useRepositories } from '@/repositories';
import { formatDateTime } from '@/services/time';
import { blankWork } from '@/store/projectWork';
import type { ScheduleDraft } from '@/data/schedule';
import { ScheduleView } from '@/features/schedule/ScheduleView';
import { changedDone, type WbsSource } from '@/features/schedule/scheduleSource';
import { wbsStartOf } from '@/features/schedule/wbsProgress';
import {
  liveWbsDone, liveWbsItems, liveWbsRows, markNotes, scheduleButtons, scheduleOpened, scheduleSaveKind, scheduleTokenOf,
  SCHEDULE_BLOCKED_TEXT, SCHEDULE_REQUESTED_WBS_NOTE, wbsOpened, wbsTaskListOf, wbsTokenOf,
} from '@/features/schedule/liveScheduleUi';
import { ApprovalRequestedPill, RequestApprovalAction } from '@/features/portal/RequestApprovalButtonView';
import { cleanProxyNote, PROXY_NOTE_MAX, proxyNoteLength, validateProxyNote } from '../proxyApproval';
import {
  cleanScheduleReason, liveScheduleState, validateScheduleInput, validateScheduleReason, validateWbsInput, type ScheduleCurrent,
} from '../schedule';
import { toProject, type ProjectDoc } from '../model';
import { useAccountPeople, useLiveProjects, useLiveSchedule, useLiveScheduleActions, useLiveTasks, type LiveScheduleQuery } from '../repositories';
import { liveProjectView } from '../projectView';
import { useLiveSession } from '../session';
import { LoadError } from './shared';

/**
 * live のスケジュール（管理者 /schedule・担当の開発者 /dev/schedule。LIVE_SCHEDULE_PLAN U3-b）。
 * 見た目は demo と同じ部品（ScheduleView・WbsSection。L-13）に Firestore の値と操作を渡す。管理者は全案件で開発者と同じ操作（L-14）。
 * アーカイブ中・要件定義書の承認前は見るだけ。取り下げ・再計画の理由は必須でお客様にも見える（L-8）。表示の出し分けで、権限の実体は firestore.rules。
 * HearingGate の内側に置く（選んでいる案件。再読み込みしても保たれる。L-20）
 */
export default function LiveSchedulePage() {
  const currentId = useRepositories().projects.useCurrentId();
  const doc = useLiveProjects().data.find((p) => p.id === currentId);
  if (!doc) return null;
  return <LiveSchedule key={doc.id} doc={doc} />;
}

const errText = (e: unknown) => (e instanceof Error ? e.message : '保存できませんでした。接続を確かめてください');

/** アフロ側（管理者・担当の開発者）が変えられるか（要件定義書の承認後・アーカイブでない） */
export function useCanEditSchedule(doc: ProjectDoc): boolean {
  const { account } = useLiveSession();
  return (account.role === 'admin' || account.role === 'developer') && doc.requirements.status === 'approved' && !doc.archived;
}

/** WBS のデータ源（スケジュールの画面と案件詳細で共用）。保存は canEdit のときだけ */
export function useLiveWbsSource(pid: string, sch: LiveScheduleQuery, view: DemoState, canEdit: boolean): WbsSource {
  const { account } = useLiveSession();
  const afro = account.role === 'admin' || account.role === 'developer';
  const tasks = useLiveTasks(afro ? pid : null);
  const actions = useLiveScheduleActions(pid);
  const toast = useToast();
  const markUids = Object.values(sch.internal?.marks ?? {}).map((m) => m?.by ?? '').filter(Boolean);
  const people = useAccountPeople(markUids);
  const start = wbsStartOf(view);
  const items = useMemo(() => liveWbsItems(view.schedule, start), [view.schedule, start]);
  const done = useMemo(() => liveWbsDone(sch.current), [sch.current]);
  const taskList = wbsTaskListOf(afro, tasks);
  return useMemo<WbsSource>(() => ({
    items, done,
    rows: (list, today, d) => liveWbsRows(list, d, taskList, today),
    validate: validateWbsInput,
    markNote: markNotes(sch.internal, Object.fromEntries(Object.entries(people).map(([uid, p]) => [uid, p.name]))),
    token: wbsTokenOf(sch.current, sch.internal),
    ...(canEdit ? {
      save: async (list, d, token) => {
        try {
          await actions.saveWbs(list, changedDone(d, done), wbsOpened(token, sch.internal));
          return true;
        } catch (e) {
          toast(errText(e), 'error');
          return false;
        }
      },
    } : {}),
  }), [items, done, taskList, sch.internal, sch.current, people, canEdit, actions, toast]);
}

type NoteDialog = { kind: 'withdraw' | 'reopen' | 'proxy'; shown?: ScheduleCurrent; requestedAt?: string; draft?: ScheduleDraft; opened?: number | null; resolve?: (ok: boolean) => void };

function LiveSchedule({ doc }: { doc: ProjectDoc }) {
  const { account } = useLiveSession();
  const toast = useToast();
  const pid = doc.id;
  const { requirements } = useRepositories();
  const req = requirements.useCurrent(pid);
  const sch = useLiveSchedule(pid);
  const actions = useLiveScheduleActions(pid);
  const canEdit = useCanEditSchedule(doc);
  const project = useMemo(() => toProject(doc), [doc]);
  const st = useMemo(() => liveScheduleState(sch.summary, sch.current, sch.internal), [sch.summary, sch.current, sch.internal]);
  const view = useMemo(() => liveProjectView(project, req.data, [], blankWork(pid), st), [project, req.data, pid, st]);
  const wbsBase = useLiveWbsSource(pid, sch, view, canEdit);
  // 依頼中も WBS は変えられる（2026-11-27 lead 判断）。変えるとお客様は開き直してから承認することになる（L-18）ので、その旨を出す
  const requested = sch.summary?.status === 'requested';
  const wbs = useMemo<WbsSource>(() => (canEdit && requested ? { ...wbsBase, notice: SCHEDULE_REQUESTED_WBS_NOTE } : wbsBase), [wbsBase, canEdit, requested]);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [note, setNote] = useState<NoteDialog | null>(null);
  const [noteText, setNoteText] = useState('');

  /** 1 操作ずつ（二重送信しない）。失敗は文言を出して false */
  const run = async (fn: () => Promise<void>, done: string): Promise<boolean> => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    try {
      await fn();
      toast(done);
      return true;
    } catch (e) {
      toast(errText(e), 'error');
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  if (sch.loading || req.loading) return <RouteLoader label="スケジュール" />;
  if (sch.error || req.error) return <LoadError what="スケジュール" />;

  const status = sch.summary?.status;
  const saved = st?.schedule;
  const save = (draft: ScheduleDraft, token: string): Promise<boolean> | boolean => {
    const kind = scheduleSaveKind(status, sch.internal, draft);
    if (kind === 'blocked') { toast(SCHEDULE_BLOCKED_TEXT, 'error'); return false; }
    const opened = scheduleOpened(token, sch.internal);
    if (kind === 'reopen') {
      // 承認済みの予定日を変える＝再計画（理由が要る）。理由の入力が終わるまで入力画面は開いたまま
      return new Promise<boolean>((resolve) => { setNoteText(''); setNote({ kind: 'reopen', draft, opened, resolve }); });
    }
    return run(() => actions.save(draft, opened), saved ? 'スケジュールを変更しました' : 'スケジュールを保存しました。お客様へスケジュールの承認を依頼できます');
  };

  const b = scheduleButtons(status, account.role, canEdit, !!sch.internal?.draft);
  const approval = (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 1 }}>
      {b.requested && sch.summary?.requestedAt && <ApprovalRequestedPill requestedAt={sch.summary.requestedAt} />}
      {b.approved && (
        <StatusPill tone="success" icon={<BadgeCheck size={13} />}>
          {sch.summary?.approvedVia === 'proxy' ? '代理で承認済み' : 'お客様が承認済み'}（{formatDateTime(sch.summary?.approvedAt)}）
        </StatusPill>
      )}
      {b.withdraw && (
        <Button variant="outlined" startIcon={<Undo2 size={16} />} disabled={busy} onClick={() => { setNoteText(''); setNote({ kind: 'withdraw' }); }}>
          依頼を取り下げる
        </Button>
      )}
      {b.proxy && sch.current && (
        <Button
          variant="outlined" startIcon={<UserCheck size={16} />} disabled={busy}
          onClick={() => { setNoteText(''); setNote({ kind: 'proxy', shown: sch.current ?? undefined, requestedAt: sch.summary?.requestedAt }); }}
        >
          代理で承認
        </Button>
      )}
      {b.request && <RequestApprovalAction busy={busy} onClick={() => { void run(() => actions.submit(), 'お客様へ承認を依頼しました'); }} />}
    </Stack>
  );

  const closeNote = (ok: boolean) => {
    note?.resolve?.(ok);
    setNote(null);
  };
  const proxy = note?.kind === 'proxy';
  const cleaned = proxy ? cleanProxyNote(noteText) : cleanScheduleReason(noteText);
  const noteError = proxy ? validateProxyNote(cleaned) : validateScheduleReason(cleaned);
  const submitNote = async () => {
    if (!note || noteError) return;
    // 開いた時点の版が無い再計画は送らない（-1 で代用しない。internal が無い＝記録が読めていない）
    if (note.kind === 'reopen' && typeof note.opened !== 'number') {
      toast('スケジュールの記録を読み込めませんでした。画面を開き直してください', 'error');
      closeNote(false);
      return;
    }
    const ok = note.kind === 'withdraw'
      ? await run(() => actions.withdraw(cleaned), 'お客様への承認の依頼を取り下げました')
      : note.kind === 'reopen' && note.draft && typeof note.opened === 'number'
        ? await run(() => actions.reopenAndSave(note.draft!, cleaned, note.opened as number), '予定日を変えました（再計画）。もう一度お客様へ承認を依頼してください')
        : note.shown
          ? await run(() => actions.proxyApprove({ ...note.shown!, requestedAt: note.requestedAt }, cleaned), 'スケジュールを代理で承認しました')
          : false;
    if (ok) closeNote(true);
  };
  const TEXT = {
    withdraw: { title: '承認の依頼を取り下げますか？', body: 'お客様の承認待ちを取り下げ、下書きに戻します。直した後にもう一度依頼してください。', label: '取り下げる理由', go: '取り下げる' },
    reopen: { title: '承認済みの予定日を変えますか？', body: 'お客様が承認した予定日を変えると、承認が外れて下書きに戻ります（再計画）。変えた後にもう一度お客様へ承認を依頼してください。', label: '予定日を変える理由', go: '予定日を変える' },
    proxy: { title: 'お客様の代わりに承認しますか？', body: '承認すると、表示している予定日と WBS でお客様の承認済みになります。「アフロ（あなたの名前）が代理で承認」と理由・日時が承認の履歴に残り、お客様ポータルにも表示されます。', label: '代理で承認する理由', go: '代理で承認する' },
  } as const;
  const t = note ? TEXT[note.kind] : null;

  return (
    <>
      <ScheduleView
        source={{
          projectId: pid, saved, approved: doc.requirements.status === 'approved', editable: canEdit,
          ...(doc.archived ? { readOnlyNote: 'アーカイブ中のプロジェクトのため、スケジュールは見るだけです。' } : {}),
          validate: validateScheduleInput, save, token: scheduleTokenOf(sch.internal), approval, wbs, view,
        }}
      />
      {note && t && (
        <Dialog open onClose={() => !busy && closeNote(false)} maxWidth="xs" fullWidth aria-labelledby="sched-note-title">
          <DialogContent sx={{ pt: 3 }}>
            <Typography id="sched-note-title" variant="h3" sx={{ mb: 1 }}>{t.title}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{t.body}</Typography>
            <TextField
              label={t.label} required fullWidth size="small" autoFocus value={noteText} disabled={busy}
              onChange={(e) => setNoteText(e.target.value)} error={!!noteText && !!noteError}
              helperText={noteText && noteError ? noteError : `${proxy ? '例：11/26 の打ち合わせで口頭で承認をいただいた' : '理由を入力してください（お客様にも表示されます）'}（${proxyNoteLength(cleaned)}/${PROXY_NOTE_MAX}字）`}
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
            <Button variant="outlined" disabled={busy} onClick={() => closeNote(false)}>キャンセル</Button>
            <Button variant="contained" disabled={busy || !!noteError} onClick={() => { void submitNote(); }}>{busy ? '送っています…' : t.go}</Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  );
}
