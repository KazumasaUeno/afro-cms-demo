import { useId, useState } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography, useMediaQuery, useTheme } from '@mui/material';
import { AlertTriangle, CheckCircle2, Eye, EyeOff, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Surface } from '@/components/ui';
import { tokens } from '@/theme/tokens';
import { AI_DRAFT_LIMITS, isProposalV3, type AiEditable, type AiGenerated, type ProposalV2 } from '@/types/aiDraft';
import { AiDraftReviewV3 } from './AiDraftReviewV3';
import { AI_DRAFT_COPY, APPROVAL_BLOCK_COPY, approvalBlock, canConfirmGenerated, remainingFlaggedNumbers } from './aiDraftState';
import { Field, PointsFields, SaveStatus, type AiDraftEditorProps } from './editorParts';
import { DRAFT_FIELDS, DRAFT_OPEN_QUESTIONS_TITLE, DRAFT_SECTION_TITLE } from './proposalV2Format';
import { ProposalV2Body, ProposalV2Summary } from './ProposalV2Body';

/** 部品は editorParts（葉のモジュール）。ここから import していた呼び出し元のために型だけ再び出す */
export type { AiDraftEditorProps } from './editorParts';

/**
 * AI 下書きの編集画面（画面設計 AI_REQUIREMENTS_UI.md §3。状態 5・6）。
 * - 表示はプレーンテキスト（TextField の値と文字ノードだけ。dangerouslySetInnerHTML を使わない）
 * - 要確認の数字: 各欄の直下に「要確認の数字」の行、プレビューでは <mark>（ProposalV2Body の highlight）
 * - 改善ポイントの追加・削除はしない（DEC lead Q-U4）。未確定事項は追加・削除できる（≤ 10 件）
 */

/** 版で分ける（v3 → v2）。v3 の下書きを v2 の編集画面で開くと draft が無く落ちる（U4 の持ち越し） */
export function AiDraftEditor(props: AiDraftEditorProps) {
  const g = props.generated;
  if (isProposalV3(g)) return <AiDraftReviewV3 {...props} generated={g} />;
  return <AiDraftEditorV2 {...props} generated={g as AiGenerated} />;
}

function AiDraftEditorV2({ ai, view, generated, role, isAssignedDeveloper, reqStatus, onRegenerate, onRequestApproval, notes }: AiDraftEditorProps & { generated: AiGenerated }) {
  const wide = useMediaQuery(useTheme().breakpoints.up('lg'));
  const mdUp = useMediaQuery(useTheme().breakpoints.up('md'));
  const reasonId = useId();
  const [showPreview, setShowPreview] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [busy, setBusy] = useState(false);
  const local: AiEditable = (ai.local && 'draft' in ai.local ? ai.local : null) ?? { summary: generated.summary, points: generated.points, draft: generated.draft };
  const flags = generated.flags?.unsupportedNumbers;
  const readOnly = !view.canEdit || ai.running;
  const remaining = remainingFlaggedNumbers(local, flags);
  const confirmed = view.key === 'confirmed';
  const block = approvalBlock({ hasEdited: view.hasEdited, save: ai.save, running: ai.running, reqStatus, role, isAssignedDeveloper });
  const showActions = view.canEdit;
  // 生成中は編集できない（view.canEdit=false）が、保存の失敗（generation-running）と「変更をコピー」は見せる。未保存の変更を控える手段を消さない
  const showSaveStatus = showActions || (ai.running && ai.save !== "idle");

  const set = (patch: Partial<AiEditable>) => ai.update({ ...local, ...patch });
  const setPoint = (idx: number, patch: Partial<AiEditable['points'][number]>) =>
    set({ points: local.points.map((p, i) => (i === idx ? { ...p, ...patch } : p)) });
  const setDraft = (patch: Partial<AiEditable['draft']>) => set({ draft: { ...local.draft, ...patch } });

  const { flags: _flags, ...base } = generated;
  void _flags;
  const preview: ProposalV2 = { ...base, ...local, version: 2 };

  const saveStatus = <SaveStatus ai={ai} confirmed={confirmed} />;

  const primary = !showActions ? null : !confirmed ? (
    <Button variant="contained" onClick={() => void ai.confirm()} disabled={!canConfirmGenerated({ save: ai.save, hold: ai.hold, running: ai.running })} startIcon={<CheckCircle2 size={16} />}>
      {remaining.length ? AI_DRAFT_COPY.ready.confirmWithFlags : AI_DRAFT_COPY.ready.confirm}
    </Button>
  ) : (
    <Box>
      <Button variant="contained" disabled={block !== null} aria-describedby={block ? reasonId : undefined} onClick={() => setDialog(true)}>
        {AI_DRAFT_COPY.approval.action}
      </Button>
      {block && block !== 'not-allowed' && block !== 'not-draft' && (
        <Typography id={reasonId} variant="caption" component="p" sx={{ mt: 0.5, maxWidth: 320 }}>{APPROVAL_BLOCK_COPY[block]}</Typography>
      )}
    </Box>
  );

  const header = (
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'flex-start' }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="h4" component="h2" tabIndex={-1} id="ai-draft-title">{confirmed ? AI_DRAFT_COPY.confirmed.title : AI_DRAFT_COPY.ready.title}</Typography>
        {!confirmed && <Typography variant="body2" sx={{ mt: 0.5, color: tokens.color.inkSoft }}>{AI_DRAFT_COPY.ready.body}</Typography>}
        {view.readOnly && <Typography variant="body2" sx={{ mt: 0.5, color: tokens.color.inkSoft }}>{AI_DRAFT_COPY.readOnly}</Typography>}
        {ai.running && view.hasGenerated && <Typography variant="body2" sx={{ mt: 0.5, color: tokens.color.inkSoft }}>{AI_DRAFT_COPY.running.withDraft}</Typography>}
        {!!flags?.length && (
          remaining.length ? (
            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 1 }}>
              <AlertTriangle size={16} color={tokens.color.warningInk} aria-hidden />
              <Typography variant="body2" sx={{ color: tokens.color.warningInk, fontWeight: 650 }}>{AI_DRAFT_COPY.ready.flagged(remaining.length)}</Typography>
            </Stack>
          ) : (
            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 1 }}>
              <CheckCircle2 size={16} color={tokens.color.successInk} aria-hidden />
              <Typography variant="body2" sx={{ color: tokens.color.successInk, fontWeight: 650 }}>{AI_DRAFT_COPY.ready.flaggedCleared}</Typography>
            </Stack>
          )
        )}
      </Box>
      <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ flexShrink: 0, flexWrap: 'wrap', rowGap: 1 }}>
        {onRegenerate && view.canGenerate && (
          <Button variant="outlined" startIcon={<RefreshCw size={15} />} onClick={onRegenerate} disabled={ai.running || ai.starting}>{AI_DRAFT_COPY.answersChanged.regenerate}</Button>
        )}
        {mdUp && primary}
      </Stack>
    </Stack>
  );

  const fields = (
    <Stack spacing={2.5}>
      <Field label="要約" value={local.summary} max={AI_DRAFT_LIMITS.summary} minRows={3} readOnly={readOnly} flags={flags} onChange={(v) => set({ summary: v })} />
      <Box>
        <Typography variant="h5" component="h3" sx={{ mb: 1.25 }}>改善ポイント</Typography>
        <PointsFields points={local.points} readOnly={readOnly} flags={flags} onChange={setPoint} />
      </Box>
      <Box>
        <Typography variant="h5" component="h3" sx={{ mb: 1.25 }}>{DRAFT_SECTION_TITLE}</Typography>
        <Stack spacing={2}>
          {DRAFT_FIELDS.map((f) => (
            <Field key={f.key} label={f.label} value={local.draft[f.key]} max={AI_DRAFT_LIMITS.draftField} readOnly={readOnly} flags={flags} onChange={(v) => setDraft({ [f.key]: v })} />
          ))}
          <Box>
            <Typography variant="h6" component="h4" sx={{ mb: 1 }}>{DRAFT_OPEN_QUESTIONS_TITLE}</Typography>
            <Stack spacing={1.25}>
              {local.draft.openQuestions.map((q, idx) => (
                <Stack key={idx} direction="row" spacing={1} alignItems="flex-start">
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Field label={`未確定事項 ${idx + 1}`} value={q} max={AI_DRAFT_LIMITS.openQuestion} multiline={false} readOnly={readOnly} flags={flags}
                      onChange={(v) => setDraft({ openQuestions: local.draft.openQuestions.map((x, j) => (j === idx ? v : x)) })} />
                  </Box>
                  {!readOnly && (
                    <Button aria-label={`未確定事項 ${idx + 1} を削除`} onClick={() => setDraft({ openQuestions: local.draft.openQuestions.filter((_, j) => j !== idx) })} sx={{ minWidth: 44, minHeight: 44, mt: 0.5 }}>
                      <Trash2 size={16} />
                    </Button>
                  )}
                </Stack>
              ))}
              {!readOnly && local.draft.openQuestions.length < AI_DRAFT_LIMITS.openQuestions && (
                <Button size="small" startIcon={<Plus size={15} />} sx={{ alignSelf: 'flex-start' }} onClick={() => setDraft({ openQuestions: [...local.draft.openQuestions, ''] })}>
                  未確定事項を追加
                </Button>
              )}
            </Stack>
          </Box>
        </Stack>
      </Box>
    </Stack>
  );

  const previewBox = (
    <Surface padding={{ xs: 2, md: 2.5 }} aria-label="確認用プレビュー">
      <Typography variant="overline" component="p" sx={{ color: tokens.color.muted, mb: 1 }}>確認用プレビュー（お客様には印は出ません）</Typography>
      <ProposalV2Summary proposal={preview} highlight={flags} />
      <ProposalV2Body proposal={preview} highlight={flags} />
    </Surface>
  );

  const submit = async () => {
    setBusy(true);
    const ok = await onRequestApproval();
    setBusy(false);
    if (ok) setDialog(false);
  };

  return (
    <Stack spacing={2}>
      <Surface padding={{ xs: 2, md: 2.5 }}>
        {header}
        {notes && <Stack spacing={1} sx={{ mt: 1.5 }}>{notes}</Stack>}
        {showSaveStatus && <Box sx={{ mt: 1.5 }}>{saveStatus}</Box>}
      </Surface>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '7fr 5fr' }, alignItems: 'start' }}>
        <Box sx={{ minWidth: 0, pb: { xs: showActions ? 'calc(88px + env(safe-area-inset-bottom))' : 0, md: 0 } }}>{fields}</Box>
        {wide ? (
          <Box sx={{ position: 'sticky', top: tokens.layout.topbar + 16, maxHeight: `calc(100vh - ${tokens.layout.topbar + 32}px)`, overflow: 'auto' }}>{previewBox}</Box>
        ) : (
          <Box>
            <Button variant="text" startIcon={showPreview ? <EyeOff size={16} /> : <Eye size={16} />} aria-expanded={showPreview} onClick={() => setShowPreview((v) => !v)}>
              {showPreview ? 'プレビューを閉じる' : 'プレビューを見る'}
            </Button>
            {showPreview && <Box sx={{ mt: 1 }}>{previewBox}</Box>}
          </Box>
        )}
      </Box>
      {!mdUp && primary && (
        <Box sx={{
          position: 'sticky', bottom: 0, zIndex: 2, mx: -2, px: 2, pt: 1.25, pb: 'calc(10px + env(safe-area-inset-bottom))',
          bgcolor: tokens.color.surface, borderTop: `1px solid ${tokens.color.border}`, '& .MuiButton-root': { width: '100%' },
        }}>
          {primary}
        </Box>
      )}

      <Dialog open={dialog} onClose={() => !busy && setDialog(false)} maxWidth="xs" fullWidth aria-labelledby="ai-approval-title">
        <DialogTitle id="ai-approval-title">{AI_DRAFT_COPY.approval.title}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: remaining.length ? 1.5 : 0 }}>{AI_DRAFT_COPY.approval.body}</Typography>
          {!!remaining.length && (
            <Box sx={{ bgcolor: tokens.color.warningSoft, color: tokens.color.warningInk, borderRadius: '12px', p: 1.5, display: 'flex', gap: 1 }}>
              <AlertTriangle size={16} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
              <Typography variant="body2" sx={{ color: 'inherit' }}>{AI_DRAFT_COPY.approval.flagged(remaining)}</Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(false)} disabled={busy}>{AI_DRAFT_COPY.approval.cancel}</Button>
          <Button variant="contained" onClick={() => void submit()} disabled={busy}>{busy ? AI_DRAFT_COPY.approval.busy : AI_DRAFT_COPY.approval.action}</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
