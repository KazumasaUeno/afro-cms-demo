import { useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { Surface } from '@/components/ui';
import { tokens } from '@/theme/tokens';
import { reqDocCatalogOf } from '@/shared/ai/reqDocCatalog';
import { AI_DRAFT_LIMITS, isEditableV3, type AiEditableV3, type AiGeneratedV3, type ProposalV3 } from '@/types/aiDraft';
import { AI_DRAFT_COPY, APPROVAL_BLOCK_COPY, approvalBlock, canConfirmGenerated } from './aiDraftState';
import { Field, PointsFields, SaveStatus, type AiDraftEditorProps } from './editorParts';
import { ProposalV2Body, ProposalV2Summary } from './ProposalV2Body';
import { ReqDocChapters } from './ReqDocChapters';
import { CoverFields, useReqDocChaptersEditor, type ReqDocEdit } from './ReqDocV3Edit';
import { buildReqDocView, flagsFor, remainingFlaggedV3, REQ_DOC_COPY, reqDocSubmitBlock, saveHoldReasons, saveHoldText, submitBlockText } from './reqDocView';

/**
 * 提案 v3 の下書き（docs/design/REQDOC_U4_UI.md §3.2）。live の要件定義書の「1. 改善提案」タブの中。
 * - 一番上に「表示／編集」。表示＝お客様に出る形そのもの（要確認の数字だけ <mark>）、編集＝同じ Surface・SectionTitle・KeyValueRows の並びで値を入力にする。既定は編集
 * - 主操作（内容を確認した → 承認を依頼する）・保存の状態・作り直すは actionsSlot（PageHeader の右）へ描く。slot がまだ無い最初の描画だけタブの中に出す
 * - 必須の章（01・02・19・21）の未確定・対象外の理由の欠け・AI追加の項目名の欠け・版のカタログ無しは押せない（reqDocSubmitBlock）。理由・項目名が空の間は自動保存を送らない（useAiDraft）
 * - 「内容を確認した」は未保存の編集・欠けがある間は押せない（generated で上書きして手元の編集を失うため。canConfirmGenerated）
 */
export function AiDraftReviewV3({ ai, view, generated, role, isAssignedDeveloper, reqStatus, onRegenerate, onRequestApproval, notes, actionsSlot }: AiDraftEditorProps & { generated: AiGeneratedV3 }) {
  const reasonId = useId();
  const [dialog, setDialog] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'view' | 'edit'>(view.canEdit ? 'edit' : 'view');
  const version = generated.template?.version ?? '';
  const catalog = reqDocCatalogOf(version);
  const local: AiEditableV3 = ai.local && isEditableV3(ai.local) ? ai.local : { summary: generated.summary, points: generated.points, doc: generated.doc };
  const flags = generated.flags?.unsupportedNumbers;
  const remaining = remainingFlaggedV3(local, flags, version);
  const confirmed = view.key === 'confirmed';
  const readOnly = !view.canEdit || ai.running;
  const editing = mode === 'edit' && view.canEdit;
  const block = approvalBlock({ hasEdited: view.hasEdited, save: ai.save, running: ai.running, reqStatus, role, isAssignedDeveloper });
  const docBlock = reqDocSubmitBlock(local, version);
  // 理由・項目名の欠けは保存も止めている（save が pending のまま）ので、保存中より先にその理由を出す
  const shownBlock = docBlock?.kind === 'na-reason' || docBlock?.kind === 'added-label' ? null : block && block !== 'not-allowed' && block !== 'not-draft' ? block : null;
  const { flags: _f, ...base } = generated;
  void _f;
  const preview: ProposalV3 = { ...base, ...local, version: 3 };
  const counts = buildReqDocView(local.doc, version).counts;
  const topFlags = flagsFor(flags);
  const holdReasons = saveHoldReasons(local);
  const held = holdReasons.naReason + holdReasons.addedLabel;

  const edit: Omit<ReqDocEdit, 'onAskDelete'> = { local, catalog, readOnly, flags, onChange: (next) => ai.update(next) };
  const chaptersEditor = useReqDocChaptersEditor(edit);
  const setPoint = (idx: number, patch: Partial<AiEditableV3['points'][number]>) =>
    ai.update({ ...local, points: local.points.map((p, i) => (i === idx ? { ...p, ...patch } : p)) });

  const primary = !view.canEdit ? null : !confirmed ? (
    <Button variant="contained" onClick={() => void ai.confirm()} disabled={!canConfirmGenerated({ save: ai.save, hold: held, running: ai.running })} startIcon={<CheckCircle2 size={16} />}>
      {remaining.length ? AI_DRAFT_COPY.ready.confirmWithFlags : AI_DRAFT_COPY.ready.confirm}
    </Button>
  ) : (
    <Box>
      <Button variant="contained" disabled={block !== null || docBlock !== null} aria-describedby={shownBlock || docBlock ? reasonId : undefined} onClick={() => setDialog(true)}>
        {AI_DRAFT_COPY.approval.action}
      </Button>
      {(shownBlock || docBlock) && (
        <Typography id={reasonId} variant="caption" component="p" sx={{ mt: 0.5, maxWidth: 320 }}>
          {docBlock ? submitBlockText(docBlock) : shownBlock ? APPROVAL_BLOCK_COPY[shownBlock] : ''}
        </Typography>
      )}
    </Box>
  );
  const showSaveStatus = view.canEdit || (ai.running && ai.save !== 'idle');
  const actions = (
    <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ flexWrap: 'wrap', rowGap: 1 }}>
      {showSaveStatus && <Box sx={{ alignSelf: 'center' }}><SaveStatus ai={ai} confirmed={confirmed} held={held} heldText={() => saveHoldText(holdReasons)} /></Box>}
      {onRegenerate && view.canGenerate && (
        <Button variant="outlined" startIcon={<RefreshCw size={15} />} onClick={onRegenerate} disabled={ai.running || ai.starting}>{AI_DRAFT_COPY.answersChanged.regenerate}</Button>
      )}
      {primary}
    </Stack>
  );

  const submit = async () => {
    setBusy(true);
    const ok = await onRequestApproval();
    setBusy(false);
    if (ok) setDialog(false);
  };

  return (
    <Stack spacing={2.5}>
      {actionsSlot ? createPortal(actions, actionsSlot) : actions}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'flex-start', sm: 'center' }} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
        {view.canEdit && (
          <ToggleButtonGroup size="small" exclusive value={mode} aria-label="表示の切り替え" onChange={(_, v: 'view' | 'edit' | null) => v && setMode(v)}>
            <ToggleButton value="view" sx={{ px: 2, minHeight: 40 }}>{REQ_DOC_COPY.view}</ToggleButton>
            <ToggleButton value="edit" sx={{ px: 2, minHeight: 40 }}>{REQ_DOC_COPY.edit}</ToggleButton>
          </ToggleButtonGroup>
        )}
        {view.readOnly && <Typography variant="body2" sx={{ color: tokens.color.inkSoft }}>{AI_DRAFT_COPY.readOnly}</Typography>}
        {ai.running && <Typography variant="body2" sx={{ color: tokens.color.inkSoft }}>{AI_DRAFT_COPY.running.withDraft}</Typography>}
        {remaining.length > 0 && (
          <Stack direction="row" spacing={0.75} alignItems="center">
            <AlertTriangle size={16} color={tokens.color.warningInk} aria-hidden />
            <Typography variant="body2" sx={{ color: tokens.color.warningInk, fontWeight: 650 }}>{AI_DRAFT_COPY.ready.flagged(remaining.length)}</Typography>
          </Stack>
        )}
      </Stack>
      {notes && <Stack spacing={1}>{notes}</Stack>}

      {editing ? (
        <>
          {/* 表紙: 要約と発注者等の 4 欄（ProposalView の表紙の Surface の位置） */}
          <Surface>
            <Stack spacing={2.5}>
              <Field label="要約" value={local.summary} max={AI_DRAFT_LIMITS.summary} minRows={3} readOnly={readOnly} flags={topFlags} onChange={(v) => ai.update({ ...local, summary: v })} />
              <CoverFields edit={edit} />
            </Stack>
          </Surface>
          <Box>
            <Typography variant="h4" component="h2" sx={{ mb: 1.5 }}>改善ポイントと提案内容</Typography>
            <PointsFields points={local.points} readOnly={readOnly} flags={topFlags} onChange={setPoint} columns={{ xs: '1fr', sm: 'repeat(2, 1fr)', xl: 'repeat(3, 1fr)' }} />
          </Box>
          <ReqDocChapters proposal={preview} approval={{ status: reqStatus }} flags={flags} editor={chaptersEditor} />
        </>
      ) : (
        <>
          {/* 表紙の 4 欄はひな型の表紙として ReqDocChapters の先頭に出す */}
          <Surface>
            <ProposalV2Summary proposal={preview} highlight={topFlags} />
          </Surface>
          <ProposalV2Body proposal={preview} highlight={topFlags} />
          <ReqDocChapters proposal={preview} approval={{ status: reqStatus }} flags={flags} />
        </>
      )}

      <Dialog open={dialog} onClose={() => !busy && setDialog(false)} maxWidth="xs" fullWidth aria-labelledby="ai-approval-title-v3">
        <DialogTitle id="ai-approval-title-v3">{AI_DRAFT_COPY.approval.title}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1 }}>{AI_DRAFT_COPY.approval.body}</Typography>
          <Typography variant="body2" sx={{ mb: remaining.length ? 1.5 : 0 }}>{REQ_DOC_COPY.submitNote(counts.open, counts.pending)}</Typography>
          {!!remaining.length && (
            <Box sx={{ bgcolor: tokens.color.warningSoft, color: tokens.color.warningInk, borderRadius: '12px', p: 1.5 }}>
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
