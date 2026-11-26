import { useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { AlertTriangle, CheckCircle2, Copy, RefreshCw, Send } from 'lucide-react';
import { Surface } from '@/components/ui';
import { tokens } from '@/theme/tokens';
import { reqDocCatalogOf } from '@/shared/ai/reqDocCatalog';
import { AI_DRAFT_LIMITS, isEditableV3, type AiEditableV3, type AiGeneratedV3, type ProposalV3 } from '@/types/aiDraft';
import { AI_DRAFT_COPY, APPROVAL_BLOCK_COPY, approvalBlock, canConfirmGenerated } from './aiDraftState';
import { Field, Note, PointsFields, SaveStatus, type AiDraftEditorProps } from './editorParts';
import { ProposalV2Body, ProposalV2Summary } from './ProposalV2Body';
import { ReqDocChapters } from './ReqDocChapters';
import { CoverFields, useReqDocChaptersEditor, type ReqDocEdit } from './ReqDocV3Edit';
import { buildReqDocView, flagsFor, remainingFlaggedV3, REQ_DOC_COPY, REQ_DOC_DEFAULT_MODE, reqDocSubmitBlock, saveHoldReasons, saveHoldText, submitBlockText } from './reqDocView';

/**
 * 提案 v3 の下書き（docs/design/REQDOC_U4_UI.md §3.2）。live の要件定義書の「1. 改善提案」タブの中。
 * - 一番上に「表示／編集」。表示＝お客様に出る形そのもの（要確認の数字だけ <mark>）、編集＝同じ Surface・SectionTitle・KeyValueRows の並びで値を入力にする。既定は表示（2026-11-26 ユーザー決定）
 * - 主操作（作り直す・内容を確認した → 承認を依頼する）は actionsSlot（PageHeader の右）へ高さのそろったボタンだけ描く。slot がまだ無い最初の描画だけタブの中に出す
 * - 保存の状態は「表示／編集」の右端、保存の失敗・送るのを止めている理由・依頼できない理由は その下の 1 本の注記（Note）に出す（ボタンの下に説明を置かない。2026-11-26）
 * - 必須の章（01・02・19・21）の未確定・対象外の理由の欠け・AI追加の項目名の欠け・版のカタログ無しは押せない（reqDocSubmitBlock）。理由・項目名が空の間は自動保存を送らない（useAiDraft）
 * - 「内容を確認した」は未保存の編集・欠けがある間は押せない（generated で上書きして手元の編集を失うため。canConfirmGenerated）
 */
export function AiDraftReviewV3({ ai, view, generated, role, isAssignedDeveloper, reqStatus, onRegenerate, onRequestApproval, notes, actionsSlot }: AiDraftEditorProps & { generated: AiGeneratedV3 }) {
  const reasonId = useId();
  const [dialog, setDialog] = useState(false);
  const [busy, setBusy] = useState(false);
  // 開いたときは表示（REQ_DOC_DEFAULT_MODE）。切り替えても編集中の値は ai.local（useAiDraft）にあり、保存の動きは変わらない
  const [mode, setMode] = useState<'view' | 'edit'>(REQ_DOC_DEFAULT_MODE);
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

  // 主操作（PageHeader の右）は高さのそろったボタンだけを 1 行に置く。押せない理由・保存の失敗はボタンの下に出さず、タブの中の状態の行へ（2026-11-26 ユーザー指摘「配置が雑」）
  // 生成中・保存中で押せないときも理由を出す（review 2026-11-26 Minor。以前は APPROVAL_BLOCK_COPY をボタンの下に出していた）
  const blockText = view.canEdit && confirmed && (docBlock || shownBlock) ? (docBlock ? submitBlockText(docBlock) : APPROVAL_BLOCK_COPY[shownBlock!]) : null;
  const showSaveStatus = view.canEdit || (ai.running && ai.save !== 'idle');
  // 保存の失敗は編集できる人（と生成中）にだけ出す（閲覧だけの人に「もう一度保存」を出さない。review 2026-11-26 Minor）
  const failed = showSaveStatus && ai.save === 'failed' && !!ai.saveError;
  const holding = held > 0 && ai.save === 'pending';
  const primary = !view.canEdit ? null : !confirmed ? (
    <Button size="small" variant="contained" onClick={() => void ai.confirm()} disabled={!canConfirmGenerated({ save: ai.save, hold: held, running: ai.running })} startIcon={<CheckCircle2 size={15} />}>
      {remaining.length ? AI_DRAFT_COPY.ready.confirmWithFlags : AI_DRAFT_COPY.ready.confirm}
    </Button>
  ) : (
    <Button size="small" variant="contained" startIcon={<Send size={15} />} disabled={block !== null || docBlock !== null} aria-describedby={failed || holding || blockText ? reasonId : undefined} onClick={() => setDialog(true)}>
      {AI_DRAFT_COPY.approval.action}
    </Button>
  );
  const actions = (
    <>
      {onRegenerate && view.canGenerate && (
        <Button size="small" variant="outlined" startIcon={<RefreshCw size={15} />} onClick={onRegenerate} disabled={ai.running || ai.starting}>{AI_DRAFT_COPY.answersChanged.regenerate}</Button>
      )}
      {primary}
    </>
  );

  // 状態の行（表示／編集の下に 1 本）: 保存の失敗 → 送るのを止めている理由 → 依頼できない理由 の順に 1 つだけ。保存中・保存済みは切り替えの右端に小さく
  const statusNote = failed ? (
    <Note tone="danger" role="alert" id={reasonId} action={!ai.running || ai.saveError?.offerCopy ? (
      <>
        {!ai.running && <Button size="small" variant="outlined" color="inherit" onClick={() => void ai.flush()}>{AI_DRAFT_COPY.autosave.retry}</Button>}
        {ai.saveError?.offerCopy && <Button size="small" color="inherit" startIcon={<Copy size={14} />} onClick={() => void navigator.clipboard?.writeText(ai.pendingText())}>{AI_DRAFT_COPY.autosave.copy}</Button>}
      </>
    ) : undefined}>
      {ai.saveError?.message}{confirmed && REQ_DOC_COPY.saveBeforeRequest}
    </Note>
  ) : holding ? (
    <Note tone="warning" id={reasonId}>{saveHoldText(holdReasons)}</Note>
  ) : blockText ? (
    <Note tone="info" id={reasonId}>{blockText}</Note>
  ) : null;
  const submit = async () => {
    setBusy(true);
    const ok = await onRequestApproval();
    setBusy(false);
    if (ok) setDialog(false);
  };

  return (
    <Stack spacing={2.5}>
      {actionsSlot ? createPortal(actions, actionsSlot) : <Stack direction="row" spacing={1} alignItems="center">{actions}</Stack>}
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 1 }}>
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
        {showSaveStatus && !failed && !holding && <Box sx={{ ml: 'auto !important' }}><SaveStatus ai={ai} confirmed={confirmed} /></Box>}
      </Stack>
      {statusNote}
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
