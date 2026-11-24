import { useId, useState } from 'react';
import {
  Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup,
  Typography, useMediaQuery, useTheme,
} from '@mui/material';
import { AlertTriangle, Check, CheckCircle2, Copy, Eye, EyeOff, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { StatusPill, Surface } from '@/components/ui';
import { tokens } from '@/theme/tokens';
import { AI_DRAFT_LIMITS, AI_POINT_AREAS, type AiEditable, type AiGenerated, type AiPointArea, type AiPointPriority, type ProposalV2 } from '@/types/aiDraft';
import {
  AI_DRAFT_COPY, APPROVAL_BLOCK_COPY, approvalBlock, evidenceLabel, findFlaggedNumbers, remainingFlaggedNumbers, type AiDraftView,
  type AiViewerRole,
} from './aiDraftState';
import { DRAFT_FIELDS, DRAFT_OPEN_QUESTIONS_TITLE, DRAFT_SECTION_TITLE, PRIORITY_TEXT } from './proposalV2Format';
import { ProposalV2Body, ProposalV2Summary } from './ProposalV2Body';
import type { AiDraftHook } from './useAiDraft';

/**
 * AI 下書きの編集画面（画面設計 AI_REQUIREMENTS_UI.md §3。状態 5・6）。
 * - 表示はプレーンテキスト（TextField の値と文字ノードだけ。dangerouslySetInnerHTML を使わない）
 * - 要確認の数字: 各欄の直下に「要確認の数字」の行、プレビューでは <mark>（ProposalV2Body の highlight）
 * - 改善ポイントの追加・削除はしない（DEC lead Q-U4）。未確定事項は追加・削除できる（≤ 10 件）
 */

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
function mdhm(iso: string | undefined): string {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}/${d.getDate()} ${hhmm(d)}`;
}

const longText = { overflowWrap: 'anywhere', lineBreak: 'strict' } as const;

function FlagLine({ text, flags }: { text: string; flags?: readonly string[] }) {
  const hit = findFlaggedNumbers(text, flags);
  if (!hit.length) return null;
  return (
    <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.75, flexWrap: 'wrap', rowGap: 0.5 }}>
      <AlertTriangle size={14} color={tokens.color.warningInk} aria-hidden />
      <Typography variant="caption" sx={{ color: tokens.color.warningInk, fontWeight: 650 }}>{AI_DRAFT_COPY.flaggedLine(hit)}</Typography>
      {hit.map((n) => <StatusPill key={n} tone="warning" dot={false}>{n}</StatusPill>)}
    </Stack>
  );
}

function Field({ label, value, max, onChange, flags, readOnly, multiline = true, minRows = 2 }: {
  label: string; value: string; max: number; onChange: (v: string) => void; flags?: readonly string[]; readOnly: boolean; multiline?: boolean; minRows?: number;
}) {
  return (
    <Box>
      <TextField
        fullWidth label={label} value={value} multiline={multiline} minRows={multiline ? minRows : undefined}
        onChange={(e) => onChange(e.target.value.slice(0, max))}
        helperText={`${value.length} / ${max}文字`}
        InputProps={{ readOnly }} inputProps={{ maxLength: max }}
        sx={{ '& textarea': longText }}
      />
      <FlagLine text={value} flags={flags} />
    </Box>
  );
}

export interface AiDraftEditorProps {
  ai: AiDraftHook;
  view: AiDraftView;
  generated: AiGenerated;
  role: AiViewerRole;
  isAssignedDeveloper: boolean;
  reqStatus: 'draft' | 'analyzed' | 'approved';
  /** 作り直す（ダイアログは AiDraftPanel） */
  onRegenerate?: () => void;
  /** 承認を依頼する（completeAnalysis(pid,{proposal:'aiDraft'})）。成功で true */
  onRequestApproval: () => Promise<boolean>;
  /** 注記（answersChanged・再生成失敗）は AiDraftPanel が出す */
  notes?: React.ReactNode;
}

export function AiDraftEditor({ ai, view, generated, role, isAssignedDeveloper, reqStatus, onRegenerate, onRequestApproval, notes }: AiDraftEditorProps) {
  const wide = useMediaQuery(useTheme().breakpoints.up('lg'));
  const mdUp = useMediaQuery(useTheme().breakpoints.up('md'));
  const reasonId = useId();
  const [showPreview, setShowPreview] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [busy, setBusy] = useState(false);
  const local: AiEditable = ai.local ?? { summary: generated.summary, points: generated.points, draft: generated.draft };
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

  const saveStatus = (
    <Box role="status" aria-live="polite" sx={{ minHeight: 24, display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
      {ai.save === 'idle' && confirmed && <Typography variant="caption">{AI_DRAFT_COPY.confirmed.editedAt(mdhm(ai.doc?.editedAt))}</Typography>}
      {ai.save === 'pending' && <Typography variant="caption">{AI_DRAFT_COPY.autosave.pending}</Typography>}
      {ai.save === 'saving' && <><CircularProgress size={16} aria-hidden /><Typography variant="caption">{AI_DRAFT_COPY.autosave.saving}</Typography></>}
      {ai.save === 'saved' && ai.savedAt && <><Check size={15} color={tokens.color.successInk} aria-hidden /><Typography variant="caption" sx={{ color: tokens.color.successInk }}>{AI_DRAFT_COPY.autosave.saved(hhmm(ai.savedAt))}</Typography></>}
      {ai.save === 'failed' && ai.saveError && (
        <>
          <Typography variant="caption" sx={{ color: tokens.color.dangerInk, fontWeight: 650, ...longText }}>{ai.saveError.message}</Typography>
          {!ai.running && <Button size="small" variant="outlined" onClick={() => void ai.flush()}>{AI_DRAFT_COPY.autosave.retry}</Button>}
          {ai.saveError.offerCopy && (
            <Button size="small" startIcon={<Copy size={14} />} onClick={() => void navigator.clipboard?.writeText(ai.pendingText())}>{AI_DRAFT_COPY.autosave.copy}</Button>
          )}
        </>
      )}
    </Box>
  );

  const primary = !showActions ? null : !confirmed ? (
    <Button variant="contained" onClick={() => void ai.confirm()} disabled={ai.running || ai.save === 'saving'} startIcon={<CheckCircle2 size={16} />}>
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
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: '1fr' } }}>
          {local.points.map((p, idx) => (
            <Surface key={p.id || idx} padding={2} component="section" aria-label={`改善ポイント ${idx + 1}`}>
              <Stack spacing={1.5}>
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
                  <TextField select size="small" label="分野" value={p.area} onChange={(e) => setPoint(idx, { area: e.target.value as AiPointArea })} InputProps={{ readOnly }} sx={{ minWidth: 150 }}>
                    {AI_POINT_AREAS.map((a) => <MenuItem key={a} value={a}>{a}</MenuItem>)}
                  </TextField>
                  <ToggleButtonGroup size="small" exclusive value={p.priority} disabled={readOnly} aria-label="優先度"
                    onChange={(_, v: AiPointPriority | null) => v && setPoint(idx, { priority: v })}>
                    {(['high', 'medium', 'low'] as const).map((k) => <ToggleButton key={k} value={k} sx={{ px: 1.25 }}>{PRIORITY_TEXT[k]}</ToggleButton>)}
                  </ToggleButtonGroup>
                </Stack>
                <Field label="見出し" value={p.title} max={AI_DRAFT_LIMITS.pointTitle} multiline={false} readOnly={readOnly} flags={flags} onChange={(v) => setPoint(idx, { title: v })} />
                <Field label="内容" value={p.detail} max={AI_DRAFT_LIMITS.pointDetail} minRows={3} readOnly={readOnly} flags={flags} onChange={(v) => setPoint(idx, { detail: v })} />
                <Box>
                  <Field label="効果" value={p.impact} max={AI_DRAFT_LIMITS.pointImpact} readOnly={readOnly} flags={flags} onChange={(v) => setPoint(idx, { impact: v })} />
                  <Typography variant="caption" component="p" sx={{ mt: 0.25 }}>定性で書く。根拠の無い数字を書かない</Typography>
                </Box>
                {!!p.evidence.length && (
                  <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.5 }} aria-label="根拠">
                    <Typography variant="caption" sx={{ mr: 0.5 }}>根拠</Typography>
                    {p.evidence.map((k) => <StatusPill key={k} tone="neutral" dot={false}>{evidenceLabel(k)}</StatusPill>)}
                  </Stack>
                )}
              </Stack>
            </Surface>
          ))}
        </Box>
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
