import { useId, useState } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { Surface } from '@/components/ui';
import { tokens } from '@/theme/tokens';
import { isEditableV3, type AiEditableV3, type AiGeneratedV3, type ProposalV3 } from '@/types/aiDraft';
import { AI_DRAFT_COPY, APPROVAL_BLOCK_COPY, approvalBlock } from './aiDraftState';
import { ProposalV2Body, ProposalV2Summary } from './ProposalV2Body';
import { ReqDocChapters } from './ReqDocChapters';
import { buildReqDocView, flagsFor, remainingFlaggedV3, REQ_DOC_COPY, reqDocSubmitBlock, submitBlockText } from './reqDocView';
import type { AiDraftEditorProps } from './AiDraftEditor';

/**
 * 提案 v3 の下書きの確認（docs/design/REQDOC_U4_UI.md §3.2 の「表示」）。
 * - 開発者だけの画面: 要確認の数字は <mark>（flags は「項目 id:数字」と「数字」が混ざる＝flagsFor）。お客様の表示では渡さない
 * - 「内容を確認した」→「承認を依頼する」。必須の章（01・02・19・21）の未確定・対象外の理由の欠け・版のカタログ無しは押せない（reqDocSubmitBlock）
 * - TODO(U4b): §3.2 の「編集」（項目の状態・文・特記事項・表紙・AI追加の編集と削除）と、操作を PageHeader の右へ移すこと。
 *   純粋関数（setItem・setAdded・removeAdded・setNote・setCover・missingNaReasons）は reqDocView.ts にあり単体テスト済み
 */
export function AiDraftReviewV3({ ai, view, generated, role, isAssignedDeveloper, reqStatus, onRegenerate, onRequestApproval, notes }: AiDraftEditorProps & { generated: AiGeneratedV3 }) {
  const reasonId = useId();
  const [dialog, setDialog] = useState(false);
  const [busy, setBusy] = useState(false);
  const version = generated.template?.version ?? '';
  const local: AiEditableV3 = ai.local && isEditableV3(ai.local) ? ai.local : { summary: generated.summary, points: generated.points, doc: generated.doc };
  const flags = generated.flags?.unsupportedNumbers;
  const remaining = remainingFlaggedV3(local, flags, version);
  const confirmed = view.key === 'confirmed';
  const block = approvalBlock({ hasEdited: view.hasEdited, save: ai.save, running: ai.running, reqStatus, role, isAssignedDeveloper });
  const shownBlock = block && block !== 'not-allowed' && block !== 'not-draft' ? block : null;
  const docBlock = reqDocSubmitBlock(local, version);
  const { flags: _f, ...base } = generated;
  void _f;
  const preview: ProposalV3 = { ...base, ...local, version: 3 };
  const counts = buildReqDocView(local.doc, version).counts;
  const topFlags = flagsFor(flags);

  const primary = !view.canEdit ? null : !confirmed ? (
    <Button variant="contained" onClick={() => void ai.confirm()} disabled={ai.running || ai.save === 'saving'} startIcon={<CheckCircle2 size={16} />}>
      {remaining.length ? AI_DRAFT_COPY.ready.confirmWithFlags : AI_DRAFT_COPY.ready.confirm}
    </Button>
  ) : (
    <Box>
      <Button variant="contained" disabled={block !== null || docBlock !== null} aria-describedby={shownBlock || docBlock ? reasonId : undefined} onClick={() => setDialog(true)}>
        {AI_DRAFT_COPY.approval.action}
      </Button>
      {(shownBlock || docBlock) && (
        <Typography id={reasonId} variant="caption" component="p" sx={{ mt: 0.5, maxWidth: 320 }}>
          {shownBlock ? APPROVAL_BLOCK_COPY[shownBlock] : docBlock ? submitBlockText(docBlock) : ''}
        </Typography>
      )}
    </Box>
  );

  const submit = async () => {
    setBusy(true);
    const ok = await onRequestApproval();
    setBusy(false);
    if (ok) setDialog(false);
  };

  return (
    <Stack spacing={2.5}>
      <Surface padding={{ xs: 2, md: 2.5 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'flex-start' }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h4" component="h2" id="ai-draft-title">{confirmed ? AI_DRAFT_COPY.confirmed.title : AI_DRAFT_COPY.ready.title}</Typography>
            {view.readOnly && <Typography variant="body2" sx={{ mt: 0.5, color: tokens.color.inkSoft }}>{AI_DRAFT_COPY.readOnly}</Typography>}
            {remaining.length > 0 && (
              <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 1 }}>
                <AlertTriangle size={16} color={tokens.color.warningInk} aria-hidden />
                <Typography variant="body2" sx={{ color: tokens.color.warningInk, fontWeight: 650 }}>{AI_DRAFT_COPY.ready.flagged(remaining.length)}</Typography>
              </Stack>
            )}
          </Box>
          <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ flexShrink: 0, flexWrap: 'wrap', rowGap: 1 }}>
            {onRegenerate && view.canGenerate && (
              <Button variant="outlined" startIcon={<RefreshCw size={15} />} onClick={onRegenerate} disabled={ai.running || ai.starting}>{AI_DRAFT_COPY.answersChanged.regenerate}</Button>
            )}
            {primary}
          </Stack>
        </Stack>
        {notes && <Stack spacing={1} sx={{ mt: 1.5 }}>{notes}</Stack>}
      </Surface>
      <Surface>
        <ProposalV2Summary proposal={preview} highlight={topFlags} />
      </Surface>
      <ProposalV2Body proposal={preview} highlight={topFlags} />
      <ReqDocChapters proposal={preview} approval={{ status: reqStatus }} flags={flags} />

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
