import type { ReactNode } from 'react';
import { Box, Stack, Typography } from '@mui/material';
import { SectionTitle, StatusPill, Surface } from '@/components/ui';
import { tokens } from '@/theme/tokens';
import type { ProposalV3 } from '@/types/aiDraft';
import { KeyValueRows, muted } from '../RequirementsDocSections';
import { FlaggedText } from './ProposalV2Body';
import { buildReqDocView, countChips, flagsFor, REQ_DOC_COPY, type ReqDocApprovalState, type ReqDocRow } from './reqDocView';

/**
 * 編集の描き方（開発者の下書きだけ。REQDOC_U4_UI.md §3.2）。入力の部品は ReqDocV3Edit の useReqDocChaptersEditor が作って渡す。
 * ここ（表示の部品）は編集の部品を import しない（お客様の承認画面・demo の要件定義書の chunk に編集を引き込まない）
 */
export interface ReqDocChaptersEditor {
  /** 行の値を入力にする（null＝固定・旧版・カタログに無い項目は表示のまま） */
  cell: (r: ReqDocRow) => ReactNode | null;
  /** 章末の特記事項の入力（特記欄のある章だけ呼ぶ） */
  notes: (chapterId: string) => ReactNode;
  /** 確認ダイアログ等（一覧の後ろに描く） */
  overlay?: ReactNode;
}

/**
 * 提案 v3 の「AI 要件定義（会社標準ひな型）」（docs/design/REQDOC_U4_UI.md §2・最終節）。「1. 改善提案」タブの中、改善ポイントの下。
 * - 文は Word のひな型の文章のまま（表紙 → 本書の目的と利用方法 → 01〜22 章 → 23 章。全章・全項目をひな型の順に。文の正は shared/ai/reqDocCatalog.ts の REQ_DOC_TEXT）
 * - 枠はデモの「2. ヒアリングの回答」と同じ: 章ごとに Surface＋SectionTitle（sub に「確定 n / m」）＋KeyValueRows（見出し「項目  ｜ 区分」→ ひな型の文）。開閉・目次は作らない
 * - 表示はプレーンテキスト（文字ノードだけ）。行に根拠・書いた元・「AI追加」は無い（buildReqDocView が入れない＝お客様に出さない。Q-8）。状態のチップは文の横に出すだけ
 * - `flags`（要確認の数字）は開発者の下書きの確認からだけ渡す。お客様・承認後の表示では渡さない
 */
export function ReqDocChapters({ proposal, approval, flags, editor }: {
  proposal: ProposalV3; approval: ReqDocApprovalState; flags?: readonly string[];
  /** 「編集」（開発者の下書きだけ）。同じ Surface・SectionTitle・KeyValueRows のまま値を入力にする */
  editor?: ReqDocChaptersEditor;
}) {
  const editing = editor;
  const version = proposal.template?.version ?? '';
  const view = buildReqDocView(proposal.doc, version, approval);
  const line = (s: string, key?: string) => <Typography key={key ?? s} variant="body2" sx={{ color: tokens.color.ink }}>{s}</Typography>;
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
  const cell = (r: ReqDocRow) => (editing ? editing.cell(r) ?? value(r) : value(r));
  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h4" component="h2" sx={{ mb: 1 }}>{REQ_DOC_COPY.sectionTitle}</Typography>
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
          {countChips(view.counts).map((c) => <StatusPill key={c.label} tone={c.tone} dot={false}>{c.label}</StatusPill>)}
        </Stack>
      </Box>
      {view.catalogMissing || !view.cover || !view.purpose || !view.closing ? (
        <Surface>{muted(REQ_DOC_COPY.catalogMissing(version))}</Surface>
      ) : (
        <>
          {/* 表紙（ひな型の 1 行目・版・案件名〜改訂履歴） */}
          <Surface>
            <SectionTitle title={view.cover.title} />
            <Stack spacing={0.5}>
              <Typography variant="caption" sx={{ display: 'block' }}>{view.cover.versionLine}</Typography>
              {view.cover.lines.map((l) => line(l))}
            </Stack>
          </Surface>
          <Surface>
            <SectionTitle title={view.purpose.title} />
            <Stack spacing={1}>
              {line(view.purpose.body)}
              {line(view.purpose.legend)}
            </Stack>
          </Surface>
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
              <Box sx={{ mb: 1.5 }}>{line(ch.intro)}</Box>
              <KeyValueRows form={!!editing} rows={[
                ...ch.rows.map((r) => ({ k: r.label, v: cell(r) })),
                // 編集では特記事項の欄を入力にする（16 章は欄なし）
                ...(editing && ch.hasNotes ? [{ k: REQ_DOC_COPY.notesLabel, v: editing.notes(ch.id) }] : []),
              ]} />
              {!editing && ch.notesLine && <Box sx={{ mt: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{line(ch.notesLine)}</Box>}
            </Surface>
          ))}
          {view.legacy.length > 0 && (
            <Surface>
              <SectionTitle title={REQ_DOC_COPY.legacy} />
              <KeyValueRows rows={view.legacy.map((r) => ({ k: r.label, v: value(r) }))} />
            </Surface>
          )}
          <Surface>
            <SectionTitle title={view.closing.heading} />
            <Stack spacing={1}>
              {line(view.closing.body)}
              {view.closing.lines.map((l) => line(l))}
              {line(view.closing.approvalLine)}
            </Stack>
            {view.closing.status && <Typography variant="caption" sx={{ display: 'block', mt: 1.5 }}>{view.closing.status}</Typography>}
            <Typography variant="caption" sx={{ display: 'block', mt: 1.5, color: tokens.color.muted }}>{REQ_DOC_COPY.ch23.overlap}</Typography>
          </Surface>
        </>
      )}
      {editing?.overlay}
    </Stack>
  );
}
