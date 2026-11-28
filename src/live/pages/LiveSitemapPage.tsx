import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, Stack, TextField, Typography } from '@mui/material';
import { RotateCcw, Sparkles, SquarePen, Undo2, UserCheck } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SitemapEdge, SitemapNode, SitemapState, SitemapVariant } from '@/types';
import { RouteLoader } from '@/components/layout/RouteLoader';
import { BuildFlowNavView } from '@/components/layout/BuildFlowNavView';
import { Surface } from '@/components/ui';
import { useToast } from '@/hooks/useToast';
import { useRepositories } from '@/repositories';
import { useProjectRoutes } from '@/features/projects/projectRoutes';
import { NotCreated, ScheduleMissingBanner, SitemapView } from '@/features/sitemap/SitemapView';
import { SitemapDevCommentPanelView } from '@/features/sitemap/DevCommentView';
import {
  sitemapAiPhase, sitemapEditsWith, sitemapLiveButtons, sitemapLiveDescription, sitemapLockedNote, sitemapOverlayAction, sitemapSig,
  SITEMAP_AI_TEXT, type SitemapViewerRole,
} from '@/features/sitemap/liveSitemapUi';
import { parseAiFlagMode, type AiFlagMode } from '@/features/requirements/aiDraft/aiDraftState';
import { RequestApprovalAction } from '@/features/portal/RequestApprovalButtonView';
import { cleanProxyNote, PROXY_NOTE_MAX, proxyNoteLength, validateProxyNote } from '../proxyApproval';
import { cleanScheduleReason, validateScheduleReason } from '../schedule';
import {
  liveSitemapState, sitemapEditable, sitemapSubmitBlock, SitemapConflictError, SITEMAP_CONFLICT_TEXT, type SitemapEdits, type SitemapShown,
} from '../sitemap';
import type { ProjectDoc } from '../model';
import { useLiveProjects, useLiveSitemap, useLiveSitemapActions, useLiveSitemapSaveStatus } from '../repositories';
import { useLiveSession } from '../session';
import { LoadError } from './shared';

/**
 * 画面の AI ボタンの表示フラグ（VITE_FEATURE_AI_SITEMAP。既定 off。表示だけでサーバーの AI_SITEMAP_MODE が正。LIVE_SITEMAP_AI §画面）。
 * 型の宣言（vite-env.d.ts）は U-F2 が足すので、ここは値として読む
 */
const AI_SITEMAP_FLAG: AiFlagMode = parseAiFlagMode((import.meta.env as Record<string, string | undefined>).VITE_FEATURE_AI_SITEMAP);

/** 保存の後、届いた値が古いままのときに手元の値を重ねておく時間（届けば同じになって先に外れる） */
const OVERLAY_GRACE_MS = 2500;

/**
 * live のサイトマップ（管理者 /site・担当の開発者 /dev/sitemap。LIVE_SITEMAP_IMPL_PLAN U3-b）。
 * 見た目は demo と同じ部品（SitemapView・BuildFlowNavView・SitemapDevCommentPanelView。P-13）に Firestore の値と操作を渡す。
 * 中身の書き込みは callable（保存は 1 秒以上まとめる＝repositories の保存のまとめ）。取り下げ・再計画・代理承認は理由必須でお客様にも見える。
 * 表示の出し分けだけで、権限の実体は firestore.rules と callable。HearingGate の内側に置く（選んでいる案件）
 */
export default function LiveSitemapPage() {
  const currentId = useRepositories().projects.useCurrentId();
  const doc = useLiveProjects().data.find((p) => p.id === currentId);
  if (!doc) return null;
  return <LiveSitemap key={doc.id} doc={doc} />;
}

const errText = (e: unknown) => (e instanceof Error ? e.message : '保存できませんでした。接続を確かめてください');
const sigOf = (d: { before: SitemapEdits['before']; after: SitemapEdits['after']; devComment?: { text: string } }) =>
  sitemapSig({ before: d.before, after: d.after, devText: d.devComment?.text });

type NoteKind = 'withdraw' | 'reopen' | 'proxy';
type NoteDialog = { kind: NoteKind; shown?: SitemapShown; requestedAt?: string };

const NOTE_TEXT: Record<NoteKind, { title: string; body: string; label: string; go: string }> = {
  withdraw: { title: '承認の依頼を取り下げますか？', body: 'お客様の承認待ちを取り下げ、下書きに戻します。直した後にもう一度依頼してください。', label: '取り下げる理由', go: '取り下げる' },
  reopen: { title: '承認済みのサイトマップを下書きに戻しますか？', body: 'お客様の承認が外れて下書きに戻ります（再計画）。直した後にもう一度お客様へ承認を依頼してください。', label: '下書きに戻す理由', go: '下書きに戻す' },
  proxy: { title: 'お客様の代わりに承認しますか？', body: '承認すると、表示しているサイトマップでお客様の承認済みになります。「アフロ（あなたの名前）が代理で承認」と理由・日時が承認の履歴に残り、お客様ポータルにも表示されます。', label: '代理で承認する理由', go: '代理で承認する' },
};

function LiveSitemap({ doc }: { doc: ProjectDoc }) {
  const { account } = useLiveSession();
  const toast = useToast();
  const navigate = useNavigate();
  const routes = useProjectRoutes();
  const pid = doc.id;
  const sm = useLiveSitemap(pid);
  const saveSt = useLiveSitemapSaveStatus(pid);
  const actions = useLiveSitemapActions(pid);

  const role = account.role as SitemapViewerRole;
  const afro = role === 'admin' || role === 'developer';
  const summary = sm.summary;
  const internal = sm.internal;
  const status = summary?.status ?? null;
  const reqApproved = doc.requirements.status === 'approved';
  const scheduleApproved = doc.schedule?.approvedRevision !== undefined;
  const aiPhase = sitemapAiPhase(sm.aiDraft);
  const aiRunning = aiPhase === 'running';

  /* ---------- 手元の値の重ね（保存の echo で編集が巻き戻らないように） ---------- */
  const [local, setLocal] = useState<SitemapEdits | null>(null);
  // 開いた時点（手元の値が無いとき）の internal.editSeq。手元の値がある間は固定（ほかの人の保存を競合として検出させる）
  const opened = useRef<number | null>(null);
  if (!local) opened.current = internal?.editSeq ?? null;
  // 競合は 1 回だけ扱う（保存のまとめは次に書けるまで同じ失敗を持ち続ける）
  const handledConflict = useRef<Error | null>(null);
  const toastedError = useRef<Error | null>(null);
  const conflict = saveSt.error instanceof SitemapConflictError && saveSt.error !== handledConflict.current;
  const equal = !!local && !!internal && sigOf(local) === sigOf({ before: internal.before, after: internal.after, devComment: internal.devComment });
  const overlay = sitemapOverlayAction({ hasLocal: !!local, idle: saveSt.idle, error: !!saveSt.error, conflict, equal });

  useEffect(() => {
    if (overlay === 'drop') {
      if (conflict) {
        handledConflict.current = saveSt.error;
        toast(SITEMAP_CONFLICT_TEXT.save, 'error');
      }
      setLocal(null);
      return undefined;
    }
    if (overlay === 'grace') {
      const t = window.setTimeout(() => setLocal(null), OVERLAY_GRACE_MS);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [overlay, conflict, saveSt.error, toast]);

  // 競合以外の保存の失敗は 1 回だけ知らせる（手元の値は残し、下の注記からもう一度保存できる）
  useEffect(() => {
    const e = saveSt.error;
    if (!e || e instanceof SitemapConflictError || toastedError.current === e) return;
    toastedError.current = e;
    toast(errText(e), 'error');
  }, [saveSt.error, toast]);

  const base = useMemo(() => liveSitemapState(summary, internal, sm.approvedVersion ?? sm.version), [summary, internal, sm.approvedVersion, sm.version]);
  const shown = useMemo<SitemapState>(() => {
    if (!local) return base;
    const text = local.devComment?.text.trim() ?? '';
    const devComment = !text ? undefined
      : base.devComment?.text === text ? base.devComment
        : { text, at: new Date().toISOString(), by: account.name };
    const next: SitemapState = { ...base, before: local.before, after: local.after };
    if (devComment) next.devComment = devComment;
    else delete next.devComment;
    return next;
  }, [base, local, account.name]);
  const shownRef = useRef(shown);
  shownRef.current = shown;

  const editable = sitemapEditable({ afro, archived: doc.archived, reqApproved, status, aiRunning }) && !!internal;
  const push = useCallback((edits: SitemapEdits) => {
    if (opened.current === null) {
      toast('サイトマップの記録を読み込めませんでした。画面を開き直してください', 'error');
      return;
    }
    setLocal(edits);
    try {
      actions.save(edits, opened.current);
    } catch (e) {
      toast(errText(e), 'error');
    }
  }, [actions, toast]);
  const onSave = useCallback(
    (variant: SitemapVariant, nodes: SitemapNode[], edges: SitemapEdge[]) => push(sitemapEditsWith(shownRef.current, variant, nodes, edges)),
    [push],
  );
  const onSaveComment = useCallback((text: string) => {
    const s = shownRef.current;
    push({ before: s.before, after: s.after, devComment: { text } });
  }, [push]);

  /* ---------- 操作（1 つずつ。二重送信しない） ---------- */
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const run = async (fn: () => Promise<unknown>, done: string): Promise<boolean> => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    try {
      await fn();
      toast(done);
      return true;
    } catch (e) {
      // 競合（ほかの人が先に保存・内容が変わった）は手元の値を捨てて最新を出す
      if (e instanceof SitemapConflictError) setLocal(null);
      toast(errText(e), 'error');
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const [note, setNote] = useState<NoteDialog | null>(null);
  const [noteText, setNoteText] = useState('');
  const [confirmRegen, setConfirmRegen] = useState(false);

  if (sm.loading) return <RouteLoader label="サイトマップ" />;
  if (sm.error) return <LoadError what="サイトマップ" />;

  const hasVersion = !!sm.version && !!summary && sm.version.revision === summary.revision && !!sm.version.contentHash;
  const b = sitemapLiveButtons({ role, archived: doc.archived, reqApproved, status, aiRunning, hasVersion, aiMode: AI_SITEMAP_FLAG });
  const lockedNote = sitemapLockedNote({ role, archived: doc.archived, reqApproved, status, aiRunning });
  const created = status !== null;
  const block = sitemapSubmitBlock({ before: shown.before, after: shown.after }, scheduleApproved);
  const origin = internal?.origin ?? sm.version?.origin;
  const fromReq = internal?.sourceReqRevision !== undefined;

  const aiStart = () => { void run(() => actions.requestDraft({}), 'AI がサイトマップの下書きを作成しています'); };
  const regenerate = async () => {
    setLocal(null);
    const ok = await run(() => actions.requestDraft({ regenerate: true, discardEdits: true, confirmDiscard: true }), 'AI がサイトマップの下書きを作り直しています');
    if (ok) setConfirmRegen(false);
  };
  const createManual = () => { void run(() => actions.createManual(), 'サイトマップを作成しました。ページを追加して組み立ててください'); };
  const submit = () => {
    if (!summary || opened.current === null) return;
    const seq = opened.current;
    void run(async () => {
      await actions.submit(seq, summary.revision);
      setLocal(null);
    }, 'お客様へサイトマップの承認を依頼しました');
  };

  /* ---------- 見出しの横 ---------- */
  const requestAction: ReactNode = b.request || b.aiRegenerate ? (
    <Stack alignItems={{ xs: 'stretch', sm: 'flex-end' }} spacing={0.5}>
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1, justifyContent: { sm: 'flex-end' } }}>
        {b.aiRegenerate && (
          <Button variant="outlined" startIcon={<Sparkles size={16} />} disabled={busy} onClick={() => setConfirmRegen(true)}>AI で作り直す</Button>
        )}
        {b.request && <RequestApprovalAction busy={busy} blockedReason={block ?? undefined} onClick={submit} />}
      </Stack>
      {b.request && block && <Typography variant="caption" role="note">{block}</Typography>}
    </Stack>
  ) : undefined;

  const requestedAction: ReactNode = b.withdraw || b.proxy ? (
    <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1, justifyContent: { sm: 'flex-end' } }}>
      {b.withdraw && (
        <Button variant="outlined" startIcon={<Undo2 size={16} />} disabled={busy} onClick={() => { setNoteText(''); setNote({ kind: 'withdraw' }); }}>
          依頼を取り下げる
        </Button>
      )}
      {b.proxy && sm.version && (
        <Button
          variant="outlined" startIcon={<UserCheck size={16} />} disabled={busy}
          onClick={() => { setNoteText(''); setNote({ kind: 'proxy', shown: { revision: sm.version!.revision, contentHash: sm.version!.contentHash }, requestedAt: summary?.requestedAt }); }}
        >
          代理で承認
        </Button>
      )}
    </Stack>
  ) : undefined;

  const approvedAction: ReactNode = b.reopen ? (
    <Button variant="outlined" startIcon={<RotateCcw size={16} />} disabled={busy} onClick={() => { setNoteText(''); setNote({ kind: 'reopen' }); }}>
      下書きに戻す
    </Button>
  ) : undefined;

  /* ---------- 見出しとキャンバスの間 ---------- */
  const banner = (
    <>
      {created && aiPhase === 'running' && <AiRunningNote />}
      {created && status === 'draft' && aiPhase === 'failed' && (
        <Alert severity="warning" sx={{ mb: 2 }}>{SITEMAP_AI_TEXT.failed}</Alert>
      )}
      {created && status === 'draft' && saveSt.error && !(saveSt.error instanceof SitemapConflictError) && local && (
        <Alert
          severity="error" sx={{ mb: 2 }}
          action={<Button color="inherit" size="small" disabled={busy} onClick={() => push(local)}>もう一度保存</Button>}
        >
          {errText(saveSt.error)}
        </Alert>
      )}
      {created && fromReq && <Typography variant="caption" role="note" sx={{ display: 'block', mb: 1.5 }}>{SITEMAP_AI_TEXT.fromRequirements}</Typography>}
      {afro && reqApproved && status === 'draft' && !doc.schedule && (
        <ScheduleMissingBanner onOpen={() => navigate(routes.sitemap.startsWith('/dev') ? '/dev/schedule' : '/schedule')} />
      )}
    </>
  );

  /* ---------- まだ作っていない ---------- */
  const notCreated = !reqApproved ? <NotCreated requirementsTo={routes.requirements} /> : (
    <CreatePanel
      phase={aiPhase} busy={busy} lockedNote={lockedNote}
      aiCreate={b.aiCreate} manual={b.createManual} onAi={aiStart} onManual={createManual}
    />
  );

  const proxy = note?.kind === 'proxy';
  const cleaned = proxy ? cleanProxyNote(noteText) : cleanScheduleReason(noteText);
  const noteError = proxy ? validateProxyNote(cleaned) : validateScheduleReason(cleaned);
  const submitNote = async () => {
    if (!note || noteError) return;
    const ok = note.kind === 'withdraw'
      ? await run(() => actions.withdraw(cleaned), 'お客様への承認の依頼を取り下げました')
      : note.kind === 'reopen'
        ? await run(() => actions.reopen(cleaned), 'サイトマップを下書きに戻しました（再計画）。直した後にもう一度お客様へ承認を依頼してください')
        : note.shown
          ? await run(() => actions.proxyApprove({ ...note.shown!, requestedAt: note.requestedAt }, cleaned), 'サイトマップを代理で承認しました')
          : false;
    if (ok) setNote(null);
  };
  const t = note ? NOTE_TEXT[note.kind] : null;

  return (
    <>
      <SitemapView
        source={{
          sitemap: shown,
          locked: !editable,
          ...(lockedNote ? { lockedNote } : {}),
          saveDelayMs: 300,
          onSave,
          // 「AI提案」は AI で作った下書きだけ（OQ-S3）
          aiBadge: origin === 'ai' ? { tooltip: SITEMAP_AI_TEXT.badgeTooltip } : null,
          devCommentPanel: <SitemapDevCommentPanelView saved={shown.devComment} writable={editable} onSave={onSaveComment} />,
          backTo: routes.detail(pid),
          nav: <BuildFlowNavView done={{ requirements: reqApproved, schedule: scheduleApproved, sitemap: status === 'approved', design: false }} designAvailable={false} />,
          created,
          notCreated,
          reqApproved,
          approvedAt: shown.approvedAt,
          ...(summary?.approvedVia === 'proxy' ? { approvedText: '代理で承認済み' } : {}),
          approvedAction,
          requestedAt: status === 'requested' ? summary?.requestedAt : undefined,
          requestedAction,
          requestAction,
          description: sitemapLiveDescription(status, created),
          banner,
        }}
      />
      {confirmRegen && (
        <Dialog open onClose={() => !busy && setConfirmRegen(false)} maxWidth="xs" fullWidth aria-labelledby="site-regen-title">
          <DialogContent sx={{ pt: 3 }}>
            <Typography id="site-regen-title" variant="h3" sx={{ mb: 1 }}>AI で作り直しますか？</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{SITEMAP_AI_TEXT.regenerateConfirm}</Typography>
            <Typography variant="caption" sx={{ display: 'block' }}>{SITEMAP_AI_TEXT.external}</Typography>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
            <Button variant="outlined" disabled={busy} onClick={() => setConfirmRegen(false)}>キャンセル</Button>
            <Button variant="contained" color="error" disabled={busy} onClick={() => { void regenerate(); }}>{busy ? '送っています…' : '置き換えて作り直す'}</Button>
          </DialogActions>
        </Dialog>
      )}
      {note && t && (
        <Dialog open onClose={() => !busy && setNote(null)} maxWidth="xs" fullWidth aria-labelledby="site-note-title">
          <DialogContent sx={{ pt: 3 }}>
            <Typography id="site-note-title" variant="h3" sx={{ mb: 1 }}>{t.title}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{t.body}</Typography>
            <TextField
              label={t.label} required fullWidth size="small" autoFocus value={noteText} disabled={busy}
              onChange={(e) => setNoteText(e.target.value)} error={!!noteText && !!noteError}
              helperText={noteText && noteError ? noteError : `${proxy ? '例：11/26 の打ち合わせで口頭で承認をいただいた（お客様にも表示されます）' : '理由を入力してください（お客様にも表示されます）'}（${proxyNoteLength(cleaned)}/${PROXY_NOTE_MAX}字）`}
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
            <Button variant="outlined" disabled={busy} onClick={() => setNote(null)}>キャンセル</Button>
            <Button variant="contained" disabled={busy || !!noteError} onClick={() => { void submitNote(); }}>{busy ? '送っています…' : t.go}</Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  );
}

/** AI が作成している間（工程だけ。秒数は出さない） */
function AiRunningNote() {
  return (
    <Stack direction="row" spacing={1.5} alignItems="center" role="status" sx={{ mb: 2, px: 2, py: 1.5, borderRadius: 3, bgcolor: 'action.hover' }}>
      <CircularProgress size={18} aria-hidden />
      <Typography variant="body2">{SITEMAP_AI_TEXT.running}</Typography>
    </Stack>
  );
}

/** 要件定義書の承認後で、まだサイトマップが無いとき（AI で作る／手で作る・生成中・失敗） */
function CreatePanel({ phase, busy, lockedNote, aiCreate, manual, onAi, onManual }: {
  phase: 'idle' | 'running' | 'failed'; busy: boolean; lockedNote: string | null;
  aiCreate: boolean; manual: boolean; onAi: () => void; onManual: () => void;
}) {
  return (
    <Surface padding={{ xs: 3, md: 5 }} sx={{ textAlign: 'center' }}>
      <Stack alignItems="center" spacing={1.5}>
        <Typography variant="h5" component="h2">サイトマップはまだ作成されていません</Typography>
        {phase === 'running' ? (
          <Box sx={{ maxWidth: 480 }}><AiRunningNote /></Box>
        ) : (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 480 }}>
              {phase === 'failed' ? SITEMAP_AI_TEXT.failed : '承認済みの要件定義書から、改善後のページ構成を作成します。作成すると、ここで現在のサイトと比べながら組み替えられます。'}
            </Typography>
            {(aiCreate || manual) && (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1 }}>
                {aiCreate && (
                  <Button variant="contained" startIcon={<Sparkles size={16} />} disabled={busy} onClick={onAi}>
                    {phase === 'failed' ? 'もう一度 AI で作る' : 'AI で作る'}
                  </Button>
                )}
                {manual && (
                  <Button variant={aiCreate ? 'outlined' : 'contained'} startIcon={<SquarePen size={16} />} disabled={busy} onClick={onManual}>手で作る</Button>
                )}
              </Stack>
            )}
            {aiCreate && <Typography variant="caption" sx={{ display: 'block', maxWidth: 480 }}>{SITEMAP_AI_TEXT.external}</Typography>}
            {!aiCreate && !manual && lockedNote && <Typography variant="caption">{lockedNote}</Typography>}
          </>
        )}
      </Stack>
    </Surface>
  );
}
