import { Box, Stack, Typography } from '@mui/material';
import { SectionTitle, StatusPill, Surface } from '@/components/ui';
import { tokens } from '@/theme/tokens';
import type { ProposalV3 } from '@/types/aiDraft';
import { KeyValueRows, muted } from '../RequirementsDocSections';
import { FlaggedText } from './ProposalV2Body';
import { buildReqDocView, chapter23Rows, countChips, flagsFor, REQ_DOC_COPY, type ReqDocApprovalState, type ReqDocRow } from './reqDocView';

/**
 * 提案 v3 の「AI 要件定義（会社標準ひな型）」（docs/design/REQDOC_U4_UI.md §2）。「1. 改善提案」タブの中、改善ポイントの下。
 * - デモの「2. ヒアリングの回答」と同じ形: 章ごとに Surface＋SectionTitle（sub に「確定 n / m」）＋KeyValueRows。全章を開いたまま縦に並べる（開閉・目次は作らない）
 * - 表示はプレーンテキスト（文字ノードだけ）。行に根拠・書いた元・「AI追加」は無い（buildReqDocView が入れない＝お客様に出さない。Q-8）
 * - `flags`（要確認の数字）は開発者の下書きの確認からだけ渡す。お客様・承認後の表示では渡さない
 */
export function ReqDocChapters({ proposal, approval, flags }: { proposal: ProposalV3; approval: ReqDocApprovalState; flags?: readonly string[] }) {
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
              <SectionTitle title={ch.heading} sub={<Typography variant="caption">{REQ_DOC_COPY.chapterSub(ch.confirmed, ch.total)}</Typography>} />
              <KeyValueRows rows={ch.rows.map((r) => ({ k: r.label, v: value(r) }))} />
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
    </Stack>
  );
}
