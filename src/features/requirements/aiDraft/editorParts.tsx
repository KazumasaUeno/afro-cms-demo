import type { ReactNode } from 'react';
import { Box, Button, CircularProgress, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { AlertTriangle, Check, Copy, Info } from 'lucide-react';
import { StatusPill, Surface } from '@/components/ui';
import { tokens } from '@/theme/tokens';
import { AI_DRAFT_LIMITS, AI_POINT_AREAS, type AiEditable, type AnyAiGenerated, type AiPointArea, type AiPointPriority } from '@/types/aiDraft';
import { AI_DRAFT_COPY, evidenceLabel, findFlaggedNumbers, type AiDraftView, type AiViewerRole } from './aiDraftState';
import { PRIORITY_TEXT } from './proposalV2Format';
import type { AiDraftHook } from './useAiDraft';

/**
 * AI 下書きの編集の部品（v2 の AiDraftEditor・v3 の AiDraftReviewV3／ReqDocV3Edit で共有する葉のモジュール）。
 * 編集の画面（AiDraftEditor・AiDraftReviewV3・ReqDocV3Edit）を import しない（循環を作らない・表示だけの画面の chunk に編集を引き込まない）。
 * - 表示はプレーンテキスト（TextField の値と文字ノードだけ。dangerouslySetInnerHTML を使わない）
 */

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
function mdhm(iso: string | undefined): string {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}/${d.getDate()} ${hhmm(d)}`;
}

const longText = { overflowWrap: 'anywhere', lineBreak: 'strict' } as const;

export function FlagLine({ text, flags }: { text: string; flags?: readonly string[] }) {
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

/** 画面の中の短い注記（情報・注意・失敗）。AI 下書きのパネルと v3 の状態の行で共有する。action は右端（狭い画面では下）に並べる */
export function Note({ tone, children, role = 'status', action, id }: { tone: 'info' | 'warning' | 'danger'; children: ReactNode; role?: 'status' | 'alert'; action?: ReactNode; id?: string }) {
  const c = tone === 'info'
    ? { bg: tokens.color.infoSoft, ink: tokens.color.infoInk, line: 'transparent' }
    : tone === 'warning' ? { bg: tokens.color.warningSoft, ink: tokens.color.warningInk, line: 'transparent' }
      : { bg: tokens.color.dangerSoft, ink: tokens.color.dangerInk, line: tokens.color.dangerLine };
  return (
    <Box id={id} role={role} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: { xs: 'wrap', sm: 'nowrap' }, bgcolor: c.bg, color: c.ink, border: `1px solid ${c.line}`, borderRadius: '12px', px: 1.5, py: 1.25 }}>
      {tone === 'info' ? <Info size={16} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} /> : <AlertTriangle size={16} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />}
      <Box sx={{ flex: action ? { xs: '1 1 calc(100% - 24px)', sm: 1 } : 1, minWidth: 0, fontSize: 13.5, fontWeight: 550, overflowWrap: 'anywhere', alignSelf: 'center' }}>{children}</Box>
      {action && <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0, ml: { xs: 3, sm: 0 }, my: -0.5 }}>{action}</Stack>}
    </Box>
  );
}

export function Field({ label, value, max, onChange, flags, readOnly, multiline = true, minRows = 2, error, helper }: {
  label: string; value: string; max: number; onChange: (v: string) => void; flags?: readonly string[]; readOnly: boolean; multiline?: boolean; minRows?: number;
  /** 入力の誤り（helperText の頭に出し、欄を error にする） */
  error?: string;
  /** 補足（helperText の頭。error が優先） */
  helper?: string;
}) {
  const count = `${value.length} / ${max}文字`;
  const head = error ?? helper;
  return (
    <Box>
      <TextField
        fullWidth label={label} value={value} multiline={multiline} minRows={multiline ? minRows : undefined}
        onChange={(e) => onChange(e.target.value.slice(0, max))}
        helperText={head ? `${head}・${count}` : count} error={!!error}
        InputProps={{ readOnly }} inputProps={{ maxLength: max }}
        sx={{ '& textarea': longText, '& .MuiFormHelperText-root': { mx: 0, mt: 0.5 } }}
      />
      <FlagLine text={value} flags={flags} />
    </Box>
  );
}

/** 自動保存の状態（v2 の編集と v3 の主操作の横で共有）。held＝対象外・不採用の理由が未入力で送るのを止めている件数（v3。REQDOC_U4_UI.md §3.2） */
export function SaveStatus({ ai, confirmed, held = 0, heldText }: { ai: AiDraftHook; confirmed: boolean; held?: number; heldText?: (n: number) => string }) {
  if (held > 0 && heldText && ai.save === 'pending') {
    return (
      <Box role="status" aria-live="polite" sx={{ minHeight: 24, display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
        <Typography variant="caption" sx={{ color: tokens.color.warningInk, fontWeight: 650, ...longText }}>{heldText(held)}</Typography>
      </Box>
    );
  }
  return (
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
}

/** 改善ポイントの欄（分野・優先度・見出し・内容・効果・根拠。v2 の編集と v3 の編集で共有。追加・削除はしない） */
export function PointsFields({ points, readOnly, flags, onChange, columns = { xs: '1fr', sm: 'repeat(2, 1fr)', lg: '1fr' } }: {
  points: AiEditable['points']; readOnly: boolean; flags?: readonly string[];
  onChange: (idx: number, patch: Partial<AiEditable['points'][number]>) => void;
  columns?: Record<string, string>;
}) {
  const setPoint = onChange;
  return (
    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: columns }}>
      {points.map((p, idx) => (
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
            <Field label="効果" value={p.impact} max={AI_DRAFT_LIMITS.pointImpact} readOnly={readOnly} flags={flags} helper="定性で書く。根拠の無い数字を書かない" onChange={(v) => setPoint(idx, { impact: v })} />
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
  );
}

export interface AiDraftEditorProps {
  ai: AiDraftHook;
  view: AiDraftView;
  generated: AnyAiGenerated;
  role: AiViewerRole;
  isAssignedDeveloper: boolean;
  reqStatus: 'draft' | 'analyzed' | 'approved';
  /** 作り直す（ダイアログは AiDraftPanel） */
  onRegenerate?: () => void;
  /** 承認を依頼する（completeAnalysis(pid,{proposal:'aiDraft'})）。成功で true */
  onRequestApproval: () => Promise<boolean>;
  /** 注記（answersChanged・再生成失敗）は AiDraftPanel が出す */
  notes?: ReactNode;
  /** 主操作を描く先（v3 だけ。AiDraftPanel の actionsSlot） */
  actionsSlot?: HTMLElement | null;
}

