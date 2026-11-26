import { Box, Stack, Typography } from '@mui/material';
import { AlertTriangle, CheckCircle2, TrendingUp } from 'lucide-react';
import { Reveal, StatusPill, Surface, type PillTone } from '@/components/ui';
import { tokens } from '@/theme/tokens';
import type { ProposalV2, ProposalV3 } from '@/types/aiDraft';
import { AI_DRAFT_COPY, evidenceLabel, splitFlagged } from './aiDraftState';
import {
  DRAFT_EMPTY, DRAFT_FIELDS, DRAFT_OPEN_QUESTIONS_TITLE, DRAFT_SECTION_TITLE, PRIORITY_TEXT, SITE_CHECK_NG, SITE_CHECK_OK, SITE_CHECK_TITLE,
  siteCheckCaption, siteCheckUnavailable, siteCheckValueText,
} from './proposalV2Format';

/**
 * 提案 v2 の本体（画面設計 AI_REQUIREMENTS_UI.md §6）。承認後の表示と、編集画面の確認用プレビュー（U4b）で同じものを使う。
 * - 表示はプレーンテキスト（React の文字ノードだけ。dangerouslySetInnerHTML・Markdown 変換を使わない）
 * - `highlight`（flags.unsupportedNumbers）は編集画面のプレビューからだけ渡す。お客様・承認後の表示では渡さない（計画 HIGH-3）
 * - サイトスコアは持たない・出さない
 */

const PRIORITY: Record<ProposalV2['points'][number]['priority'], { tone: PillTone; color: string }> = {
  high: { tone: 'danger', color: tokens.color.danger },
  medium: { tone: 'warning', color: tokens.color.warning },
  low: { tone: 'neutral', color: tokens.color.faint },
};

const srOnly = {
  position: 'absolute', width: 1, height: 1, p: 0, m: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
} as const;

const longText = { overflowWrap: 'anywhere', lineBreak: 'strict', whiteSpace: 'pre-wrap' } as const;

/** 文の中の要確認の数字を <mark> で囲む（色＋下線＋読み上げの文字の 3 重。§3.2・§8） */
export function FlaggedText({ text, flags }: { text: string; flags?: readonly string[] }) {
  if (!flags?.length) return <>{text}</>;
  return (
    <>
      {splitFlagged(text, flags).map((s, i) => s.flagged ? (
        <Box key={i} component="mark" sx={{ bgcolor: tokens.color.warningSoft, color: tokens.color.warningInk, textDecoration: 'underline', textDecorationColor: tokens.color.warning, textDecorationThickness: 2, textUnderlineOffset: 2, borderRadius: 0.5, px: 0.25 }}>
          {s.text}<Box component="span" sx={srOnly}>{AI_DRAFT_COPY.flaggedSr}</Box>
        </Box>
      ) : <span key={i}>{s.text}</span>)}
    </>
  );
}

/** 表紙の要約（課題の下） */
export function ProposalV2Summary({ proposal, highlight }: { proposal: Pick<ProposalV2, 'summary'>; highlight?: readonly string[] }) {
  if (!proposal.summary) return null;
  return (
    <Typography variant="body2" sx={{ color: tokens.color.ink, mb: 2, ...longText }}>
      <FlaggedText text={proposal.summary} flags={highlight} />
    </Typography>
  );
}

export function ProposalV2Body({ proposal, highlight, withSummary = false }: { proposal: ProposalV2 | ProposalV3; highlight?: readonly string[]; withSummary?: boolean }) {
  const sc = proposal.siteCheck;
  const unavailable = sc ? siteCheckUnavailable(sc) : null;
  // v3 は「要件定義書（下書き）」7 欄を持たない（ひな型の章は ReqDocChapters。REQDOC_U4_UI.md §2）
  const d = 'draft' in proposal ? proposal.draft : null;
  return (
    <Stack spacing={2.5}>
      {withSummary && proposal.summary && (
        <Surface>
          <Typography variant="h4" component="h2" sx={{ mb: 1 }}>要約</Typography>
          <ProposalV2Summary proposal={proposal} highlight={highlight} />
        </Surface>
      )}

      {/* 改善ポイント（v1 と同じカード＋根拠のチップ） */}
      <Box>
        <Typography variant="h4" component="h2" sx={{ mb: 1.5 }}>改善ポイントと提案内容</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', xl: 'repeat(3, 1fr)' }, gap: 2 }}>
          {proposal.points.map((p, i) => {
            const pr = PRIORITY[p.priority] ?? PRIORITY.low;
            return (
              <Reveal key={p.id || i} delay={0.05 + i * 0.06}>
                <Surface sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 1.25, borderTop: `3px solid ${pr.color}` }}>
                  {/* 狭い列（編集画面のプレビュー）で見出しが 1 文字ずつ折り返さないよう、見出しは縮めず、入らなければ優先度を次の行へ送る */}
                  <Stack direction="row" alignItems="center" justifyContent="space-between" useFlexGap sx={{ flexWrap: 'wrap', columnGap: 1, rowGap: 0.5 }}>
                    <Typography variant="overline" sx={{ color: tokens.color.muted, flex: '1 0 auto', maxWidth: '100%' }}>{String(i + 1).padStart(2, '0')} · {p.area}</Typography>
                    <StatusPill tone={pr.tone}>{PRIORITY_TEXT[p.priority] ?? ''}</StatusPill>
                  </Stack>
                  <Typography variant="h4" component="h3" sx={longText}><FlaggedText text={p.title} flags={highlight} /></Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ flex: 1, ...longText }}><FlaggedText text={p.detail} flags={highlight} /></Typography>
                  <Stack direction="row" spacing={0.75} alignItems="center" sx={{ pt: 1.25, borderTop: `1px dashed ${tokens.color.border}`, color: tokens.color.success }}>
                    <TrendingUp size={15} style={{ flexShrink: 0 }} />
                    <Typography variant="body2" sx={{ fontWeight: 650, color: 'inherit', ...longText }}><FlaggedText text={p.impact} flags={highlight} /></Typography>
                  </Stack>
                  {p.evidence.length > 0 && (
                    <Stack direction="row" alignItems="center" sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                      <Typography variant="caption" sx={{ mr: 0.25 }}>根拠</Typography>
                      {p.evidence.map((k) => <StatusPill key={k} tone="neutral" dot={false}>{evidenceLabel(k)}</StatusPill>)}
                    </Stack>
                  )}
                </Surface>
              </Reveal>
            );
          })}
        </Box>
      </Box>

      {/* 現行サイトの基本チェック（§6.3。実測の件数だけ） */}
      {sc && (
        <Surface>
          <Typography variant="h4" component="h2" sx={{ mb: 0.5 }}>{SITE_CHECK_TITLE}</Typography>
          {unavailable ? (
            <Typography variant="body2" color="text.secondary">{unavailable}</Typography>
          ) : (
            <>
              <Typography variant="caption" sx={{ display: 'block', mb: 1.5, fontVariantNumeric: 'tabular-nums' }}>{siteCheckCaption(sc)}</Typography>
              <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1 }}>
                {sc.items.map((it) => (
                  <Box component="li" key={it.key} sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 1.5, rowGap: 0.25 }}>
                    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: it.ok ? tokens.color.successInk : tokens.color.warningInk, minWidth: 84 }}>
                      {it.ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
                      <Typography variant="body2" sx={{ color: 'inherit', fontWeight: 650 }}>{it.ok ? SITE_CHECK_OK : SITE_CHECK_NG}</Typography>
                    </Stack>
                    <Typography variant="body2" sx={{ color: tokens.color.ink }}>{evidenceLabel(it.key)}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>{siteCheckValueText(it)}</Typography>
                  </Box>
                ))}
              </Box>
            </>
          )}
        </Surface>
      )}

      {/* 要件定義書の下書き（7 欄＋未確定事項。v2 だけ） */}
      {d && <Surface>
        <Typography variant="h4" component="h2" sx={{ mb: 1.5 }}>{DRAFT_SECTION_TITLE}</Typography>
        <Stack spacing={1.75}>
          {DRAFT_FIELDS.map((f) => (
            <Box key={f.key}>
              <Typography variant="subtitle2" component="h3" sx={{ mb: 0.25 }}>{f.label}</Typography>
              <Typography variant="body2" sx={{ color: d[f.key] ? tokens.color.ink : tokens.color.muted, ...longText }}>
                {d[f.key] ? <FlaggedText text={d[f.key]} flags={highlight} /> : DRAFT_EMPTY}
              </Typography>
            </Box>
          ))}
          {d.openQuestions.length > 0 && (
            <Box>
              <Typography variant="subtitle2" component="h3" sx={{ mb: 0.25 }}>{DRAFT_OPEN_QUESTIONS_TITLE}</Typography>
              <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                {d.openQuestions.map((q, i) => (
                  <Typography key={i} component="li" variant="body2" sx={{ color: tokens.color.ink, ...longText }}><FlaggedText text={q} flags={highlight} /></Typography>
                ))}
              </Box>
            </Box>
          )}
        </Stack>
      </Surface>}
    </Stack>
  );
}
