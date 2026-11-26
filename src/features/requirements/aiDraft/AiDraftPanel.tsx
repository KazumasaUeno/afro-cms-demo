import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, Stack, Typography } from '@mui/material';
import { AlertTriangle, Info, RefreshCw, Sparkles } from 'lucide-react';
import { AiMark, Surface } from '@/components/ui';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { tokens } from '@/theme/tokens';
import { AI_DRAFT_COPY, AI_SEND_NOTICE, errorMessage, type AiViewerRole } from './aiDraftState';
import { AiDraftEditor } from './AiDraftEditor';
import type { AiDraftHook } from './useAiDraft';

/**
 * AI 下書きのパネル（画面設計 AI_REQUIREMENTS_UI.md §2・§3.5・§5）。状態 1〜4 の面と、状態 5・6 の AiDraftEditor。
 * 生成・再試行・作り直しのボタンは view.canGenerate のときだけ（internal の開発者には出さない。DEC lead F5）
 */

const hhmm = (iso: string | undefined) => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '';
};

/** §5 外部 AI への送信の注意（DRAFT。閉じるボタンなし） */
export function AiSendNotice({ text = AI_SEND_NOTICE.button }: { text?: string }) {
  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', bgcolor: tokens.color.infoSoft, color: tokens.color.infoInk, borderRadius: '12px', px: 1.5, py: 1.25 }}>
      <Info size={16} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
      <Typography variant="caption" component="p" sx={{ color: 'inherit', fontWeight: 550, overflowWrap: 'anywhere' }}>{text}</Typography>
    </Box>
  );
}

function Note({ tone, children, role = 'status' }: { tone: 'info' | 'warning' | 'danger'; children: ReactNode; role?: 'status' | 'alert' }) {
  const c = tone === 'info'
    ? { bg: tokens.color.infoSoft, ink: tokens.color.infoInk, line: 'transparent' }
    : tone === 'warning' ? { bg: tokens.color.warningSoft, ink: tokens.color.warningInk, line: 'transparent' }
      : { bg: tokens.color.dangerSoft, ink: tokens.color.dangerInk, line: tokens.color.dangerLine };
  return (
    <Box role={role} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', bgcolor: c.bg, color: c.ink, border: `1px solid ${c.line}`, borderRadius: '12px', px: 1.5, py: 1.25 }}>
      {tone === 'info' ? <Info size={16} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} /> : <AlertTriangle size={16} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />}
      <Box sx={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 550, overflowWrap: 'anywhere' }}>{children}</Box>
    </Box>
  );
}

const aiButtonSx = { background: tokens.aiGradient, color: '#fff', '&:hover': { background: tokens.aiGradient, filter: 'brightness(1.06)' } } as const;

export interface AiDraftPanelProps {
  ai: AiDraftHook;
  role: AiViewerRole;
  isAssignedDeveloper: boolean;
  reqStatus: 'draft' | 'analyzed' | 'approved';
  /** 必須回答の欠け（質問名）。空なら押せる */
  missing: readonly string[];
  /** 必須回答が欠けているときに押した（ヒアリングの画面へ戻す） */
  onMissing: () => void;
  onRequestApproval: () => Promise<boolean>;
  /** ヒアリングの「要件定義へ進む」（AI_DRAFT_COPY.goToRequirements）から来た（読み込み後に 1 回だけ生成を始め、onAutoStarted で戻す） */
  autoStart?: boolean;
  onAutoStarted?: () => void;
  /** 未生成・生成中・失敗の面の外枠（live の要件定義書は demo の空の状態の Surface。REQDOC_U4_UI.md §3.1）。既定は Surface */
  frame?: (body: ReactNode) => ReactNode;
  /** 下書きの主操作（内容を確認した／承認を依頼する・保存の状態・作り直す）を描く先（PageHeader の右。v3 だけ） */
  actionsSlot?: HTMLElement | null;
}

export function AiDraftPanel({ ai, role, isAssignedDeveloper, reqStatus, missing, onMissing, onRequestApproval, autoStart, onAutoStarted, frame, actionsSlot }: AiDraftPanelProps) {
  const { view, doc } = ai;
  const reduced = useReducedMotion();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [regen, setRegen] = useState(false);
  const [dismissAnswers, setDismissAnswers] = useState(false);

  const start = (retry = false) => {
    if (missing.length) { onMissing(); return; }
    titleRef.current?.focus();
    void ai.generate({ retry });
  };

  useEffect(() => {
    if (!autoStart || ai.loading || !ai.available) return;
    onAutoStarted?.();
    // 下書きが既にあるときは作り直さない（作り直しは確認ダイアログを経る。§3.5）
    if (view.canGenerate && (view.key === 'none' || view.key === 'failed' || view.key === 'stalled')) start(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, ai.loading, ai.available]);

  if (!ai.available || view.key === 'hidden' || view.key === 'notDraft') return null;
  if (ai.loading) return frame ? <>{frame(<LinearProgress aria-label="読み込み中" sx={{ width: '100%' }} />)}</> : <Surface padding={2.5}><LinearProgress aria-label="読み込み中" /></Surface>;

  const startErr = ai.startError && (
    <Note tone="danger" role="alert">
      {ai.startError.message}
      {ai.startError.retry === 'same' && view.canGenerate && (
        <Box sx={{ mt: 1 }}><Button size="small" variant="outlined" onClick={() => start(true)}>{AI_DRAFT_COPY.failed.retry}</Button></Box>
      )}
      {ai.startError.retry === 'dialog' && view.canGenerate && (
        <Box sx={{ mt: 1 }}><Button size="small" variant="outlined" onClick={() => setRegen(true)}>{AI_DRAFT_COPY.answersChanged.regenerate}</Button></Box>
      )}
    </Note>
  );

  const discard = view.hasEdited;
  const regenDialog = (
    <Dialog open={regen} onClose={() => setRegen(false)} maxWidth="xs" fullWidth aria-labelledby="ai-regen-title">
      <DialogTitle id="ai-regen-title">{discard ? AI_DRAFT_COPY.regenerate.discardTitle : AI_DRAFT_COPY.regenerate.plainTitle}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5}>
          <Typography variant="body2">{discard ? AI_DRAFT_COPY.regenerate.discardBody : AI_DRAFT_COPY.regenerate.plainBody}</Typography>
          {discard && role === 'admin' && <Typography variant="body2">{AI_DRAFT_COPY.regenerate.adminLog}</Typography>}
          <AiSendNotice />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setRegen(false)}>{AI_DRAFT_COPY.regenerate.cancel}</Button>
        <Button
          variant="contained" color={discard ? 'error' : 'primary'}
          onClick={() => {
            setRegen(false);
            void ai.generate({ regenerate: true, discardEdits: discard, confirmDiscard: discard && role === 'admin' });
          }}
        >
          {discard ? AI_DRAFT_COPY.regenerate.discardAction : AI_DRAFT_COPY.regenerate.plainAction}
        </Button>
      </DialogActions>
    </Dialog>
  );

  const g = doc?.generated;
  if ((view.key === 'ready' || view.key === 'confirmed' || (view.key === 'running' && g)) && g) {
    const notes = (
      <>
        {view.key === 'running' && (
          <Box>
            <LinearProgress aria-label={AI_DRAFT_COPY.running.progressLabel} variant={reduced ? 'determinate' : 'indeterminate'} value={reduced ? 0 : undefined} />
            <Typography variant="caption" component="p" sx={{ mt: 0.75 }}>
              {AI_DRAFT_COPY.running.progressLabel}・{AI_DRAFT_COPY.running.startedAt(hhmm(doc?.job.startedAt))}
              {view.startedByOther ? ` ${AI_DRAFT_COPY.running.byOther}` : ''}
            </Typography>
          </Box>
        )}
        {view.answersChanged && !dismissAnswers && view.key !== 'running' && (
          <Note tone="info">
            {AI_DRAFT_COPY.answersChanged.body}
            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
              {view.canGenerate && <Button size="small" variant="outlined" onClick={() => setRegen(true)}>{AI_DRAFT_COPY.answersChanged.regenerate}</Button>}
              <Button size="small" onClick={() => setDismissAnswers(true)}>{AI_DRAFT_COPY.answersChanged.dismiss}</Button>
            </Stack>
          </Note>
        )}
        {view.lastErrorNote && view.key !== 'running' && <Note tone="warning">{view.lastErrorNote}</Note>}
        {startErr}
      </>
    );
    return (
      <Box aria-live="polite">
        <AiDraftEditor
          ai={ai} view={view} generated={g} role={role} isAssignedDeveloper={isAssignedDeveloper} reqStatus={reqStatus}
          onRegenerate={view.canGenerate ? () => setRegen(true) : undefined} onRequestApproval={onRequestApproval} notes={notes}
          actionsSlot={actionsSlot}
        />
        {regenDialog}
      </Box>
    );
  }

  let body: ReactNode;
  if (view.key === 'running') {
    body = (
      <Stack spacing={1.5}>
        <Typography ref={titleRef} tabIndex={-1} variant="h4" component="h2">{AI_DRAFT_COPY.running.title}</Typography>
        <LinearProgress aria-label={AI_DRAFT_COPY.running.progressLabel} variant={reduced ? 'determinate' : 'indeterminate'} value={reduced ? 0 : undefined} />
        <Typography variant="body2">{AI_DRAFT_COPY.running.body}</Typography>
        <Stack component="ol" spacing={0.25} sx={{ m: 0, pl: 2.5 }}>
          {AI_DRAFT_COPY.running.steps.map((s) => <Typography key={s} component="li" variant="body2">{s}</Typography>)}
        </Stack>
        <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums' }}>{AI_DRAFT_COPY.running.startedAt(hhmm(doc?.job.startedAt))}</Typography>
        {view.startedByOther && <Typography variant="body2">{AI_DRAFT_COPY.running.byOther}</Typography>}
      </Stack>
    );
  } else if (view.key === 'failed' || view.key === 'stalled') {
    const stalled = view.key === 'stalled';
    const err = doc?.lastError;
    body = (
      <Stack spacing={1.5}>
        <Box role={stalled ? 'status' : 'alert'} sx={{
          bgcolor: stalled ? tokens.color.warningSoft : tokens.color.dangerSoft, color: stalled ? tokens.color.warningInk : tokens.color.dangerInk,
          border: `1px solid ${stalled ? 'transparent' : tokens.color.dangerLine}`, borderRadius: '12px', p: 2,
        }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.75 }}>
            <AlertTriangle size={18} aria-hidden />
            <Typography ref={titleRef} tabIndex={-1} variant="h5" component="h2" sx={{ color: 'inherit' }}>{stalled ? AI_DRAFT_COPY.stalled.title : AI_DRAFT_COPY.failed.title}</Typography>
          </Stack>
          <Typography variant="body2" sx={{ color: 'inherit' }}>{stalled ? AI_DRAFT_COPY.stalled.body : errorMessage(err?.code)}</Typography>
          {!stalled && err && (
            <Typography variant="caption" component="p" sx={{ mt: 1, color: 'inherit', userSelect: 'all', overflowWrap: 'anywhere' }}>
              {AI_DRAFT_COPY.failed.support(err.code, err.anthropicRequestId)}
            </Typography>
          )}
        </Box>
        {startErr}
        {view.canGenerate ? (
          <>
            <AiSendNotice />
            <Box>
              <Button variant="contained" startIcon={<RefreshCw size={16} />} onClick={() => start(false)} disabled={ai.starting} sx={aiButtonSx}>
                {stalled ? AI_DRAFT_COPY.stalled.action : AI_DRAFT_COPY.failed.retry}
              </Button>
            </Box>
          </>
        ) : <Typography variant="body2">{AI_DRAFT_COPY.none.waitAdmin}</Typography>}
      </Stack>
    );
  } else {
    body = (
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={1.25} alignItems="center">
          <AiMark size={36} />
          <Typography ref={titleRef} tabIndex={-1} variant="h4" component="h2">{AI_DRAFT_COPY.none.title}</Typography>
        </Stack>
        <Typography variant="body2">{AI_DRAFT_COPY.none.body}</Typography>
        {startErr}
        {view.canGenerate ? (
          <>
            {!!missing.length && (
              <Typography variant="body2" sx={{ color: tokens.color.dangerInk, fontWeight: 600 }}>{AI_DRAFT_COPY.none.missing(missing)}</Typography>
            )}
            <AiSendNotice />
            <Box>
              <Button variant="contained" endIcon={<Sparkles size={16} />} onClick={() => start(false)} disabled={ai.starting} sx={aiButtonSx}>
                {AI_DRAFT_COPY.generate}
              </Button>
            </Box>
          </>
        ) : <Typography variant="body2">{AI_DRAFT_COPY.none.waitAdmin}</Typography>}
      </Stack>
    );
  }

  return (
    <Box aria-live="polite">
      {frame ? frame(body) : <Surface padding={{ xs: 2, md: 3 }}>{body}</Surface>}
      {regenDialog}
    </Box>
  );
}
