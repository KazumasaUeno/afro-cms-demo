import { useState } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, Stack, Typography } from '@mui/material';
import { SectionTitle, StatusPill, Surface } from '@/components/ui';
import { tokens } from '@/theme/tokens';
import type { ProposalV3 } from '@/types/aiDraft';
import { KeyValueRows, muted } from '../RequirementsDocSections';
import { FlaggedText } from './ProposalV2Body';
import { buildReqDocView, chapter23Rows, countChips, flagsFor, isKubunEditable, removeAdded, REQ_DOC_COPY, type ReqDocApprovalState, type ReqDocRow } from './reqDocView';
import { AddedEditCell, ItemEditCell, NotesEditCell, type ReqDocEdit } from './ReqDocV3Edit';

/**
 * 提案 v3 の「AI 要件定義（会社標準ひな型）」（docs/design/REQDOC_U4_UI.md §2）。「1. 改善提案」タブの中、改善ポイントの下。
 * - デモの「2. ヒアリングの回答」と同じ形: 章ごとに Surface＋SectionTitle（sub に「確定 n / m」）＋KeyValueRows。全章を開いたまま縦に並べる（開閉・目次は作らない）
 * - 表示はプレーンテキスト（文字ノードだけ）。行に根拠・書いた元・「AI追加」は無い（buildReqDocView が入れない＝お客様に出さない。Q-8）
 * - `flags`（要確認の数字）は開発者の下書きの確認からだけ渡す。お客様・承認後の表示では渡さない
 */
export function ReqDocChapters({ proposal, approval, flags, edit }: {
  proposal: ProposalV3; approval: ReqDocApprovalState; flags?: readonly string[];
  /** 「編集」（開発者の下書きだけ。REQDOC_U4_UI.md §3.2）。同じ Surface・SectionTitle・KeyValueRows のまま値を入力にする。onAskDelete はここの確認ダイアログが持つ */
  edit?: Omit<ReqDocEdit, 'onAskDelete'>;
}) {
  const [askDelete, setAskDelete] = useState<string | null>(null);
  const editing: ReqDocEdit | undefined = edit ? { ...edit, onAskDelete: setAskDelete } : undefined;
  const version = proposal.template?.version ?? '';
  const view = buildReqDocView(proposal.doc, version);
  const value = (r: ReqDocRow) => (
    <Stack spacing={0.5} sx={{ minWidth: 0 }}>
      {r.chips.length > 0 && (
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.5 }}>
          {r.chips.map((c) => <StatusPill key={c.label} tone={c.tone} dot={false}>{c.label}</StatusPill>)}
        </Stack>
      )}
      <Box>{r.text ? <FlaggedText text={r.text} flags={flags ? flagsFor(flags, r.id) : undefined} /> : muted(r.mutedText ?? '')}</Box>
      {r.captions.map((c) => <Typography key={c} variant="caption" sx={{ display: 'block' }}>{c}</Typography>)}
    </Stack>
  );
  /** 編集のときの値（固定・旧版・カタログに無い項目は表示のまま） */
  const cell = (r: ReqDocRow) => {
    if (!editing) return value(r);
    if (r.kind === 'item') {
      const cat = editing.catalog?.items.find((i) => i.id === r.id);
      return cat && isKubunEditable(cat.kubun) && editing.local.doc.items[r.id] ? <ItemEditCell id={r.id} edit={editing} /> : value(r);
    }
    if (r.kind === 'added') {
      const a = editing.local.doc.added.find((x) => x.id === r.id);
      return a ? <AddedEditCell item={a} edit={editing} /> : value(r);
    }
    return value(r);
  };
  const deleting = editing && askDelete ? editing.local.doc.added.find((a) => a.id === askDelete) : undefined;
  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h4" component="h2" sx={{ mb: 0.5 }}>{REQ_DOC_COPY.sectionTitle}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{REQ_DOC_COPY.sectionBody}</Typography>
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
          {countChips(view.counts).map((c) => <StatusPill key={c.label} tone={c.tone} dot={false}>{c.label}</StatusPill>)}
        </Stack>
      </Box>
      {view.catalogMissing ? (
        <Surface>{muted(REQ_DOC_COPY.catalogMissing(version))}</Surface>
      ) : (
        <>
          {view.chapters.map((ch) => (
            <Surface key={ch.id}>
              <SectionTitle
                title={ch.heading}
                sub={editing && ch.required ? (
                  <Stack direction="row" spacing={0.75} alignItems="center">
                    <Typography variant="caption">{REQ_DOC_COPY.chapterSub(ch.confirmed, ch.total)}</Typography>
                    <StatusPill tone="warning" dot={false}>{REQ_DOC_COPY.required}</StatusPill>
                  </Stack>
                ) : <Typography variant="caption">{REQ_DOC_COPY.chapterSub(ch.confirmed, ch.total)}</Typography>}
              />
              <KeyValueRows rows={[
                ...ch.rows.filter((r) => !editing || r.kind !== 'notes').map((r) => ({ k: r.label, v: cell(r) })),
                // 編集では特記事項の欄を空でも出す（16 章は欄なし）
                ...(editing && ch.hasNotes ? [{ k: REQ_DOC_COPY.notesLabel, v: <NotesEditCell chapterId={ch.id} edit={editing} /> }] : []),
              ]} />
            </Surface>
          ))}
          {view.legacy.length > 0 && (
            <Surface>
              <SectionTitle title={REQ_DOC_COPY.legacy} />
              <KeyValueRows rows={view.legacy.map((r) => ({ k: r.label, v: value(r) }))} />
            </Surface>
          )}
          <Surface>
            <SectionTitle title={REQ_DOC_COPY.ch23.title} />
            <KeyValueRows rows={chapter23Rows(approval).map((r) => ({ k: r.k, v: r.muted ? muted(r.v) : r.v }))} />
            <Typography variant="caption" sx={{ display: 'block', mt: 1.5, color: tokens.color.muted }}>{REQ_DOC_COPY.ch23.overlap}</Typography>
          </Surface>
        </>
      )}
      {editing && (
        <Dialog open={!!deleting} onClose={() => setAskDelete(null)} maxWidth="xs" fullWidth aria-labelledby="reqdoc-delete-title">
          <DialogContent sx={{ pt: 3 }}>
            <Typography id="reqdoc-delete-title" variant="h3" sx={{ mb: 1 }}>{REQ_DOC_COPY.deleteTitle}</Typography>
            {deleting && <Typography variant="body2" color="text.secondary">{deleting.label}</Typography>}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 3 }}>
            <Button variant="outlined" onClick={() => setAskDelete(null)}>{REQ_DOC_COPY.deleteCancel}</Button>
            <Button variant="contained" color="error" onClick={() => {
              if (deleting) editing.onChange(removeAdded(editing.local, deleting.id));
              setAskDelete(null);
            }}>{REQ_DOC_COPY.deleteAction}</Button>
          </DialogActions>
        </Dialog>
      )}
    </Stack>
  );
}
