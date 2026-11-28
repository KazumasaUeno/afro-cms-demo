import { memo, useMemo, useRef, useState } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { Trash2 } from 'lucide-react';
import { AiBadge, StatusPill } from '@/components/ui';
import type { ReqDocCatalog, ReqDocCatalogItem } from '@/shared/ai/reqDocCatalog';
import { REQ_DOC_LIMITS, type AiEditableV3, type ProposalV3Doc, type ReqDocAddedItem, type ReqDocItem } from '@/types/aiDraft';
import { evidenceLabel } from './aiDraftState';
import { Field } from './editorParts';
import { makeLatestApply, type ApplyEdit } from './latestApply';
import type { ReqDocChaptersEditor } from './ReqDocChapters';
import {
  flagsFor, isKubunEditable, itemTextMax, removeAdded, REQ_DOC_COPY, setAdded, setCover, setItem, setNote, statusOptions, type ReqDocRow,
} from './reqDocView';

/**
 * 提案 v3 の「編集」の欄（docs/design/REQDOC_U4_UI.md §3.2）。表示と同じ Surface・SectionTitle・KeyValueRows の中で、値（v）だけを入力にする。
 * - 固定は入力も状態の操作も出さない（表示と同じ行。検査の正は functions/src/ai/reqDocEditable.ts）
 * - 対象外・不採用で理由が空、AI追加の項目名が空なら欄を error にする（その間は自動保存を送らない＝useAiDraft の saveHoldCount）
 * - AI追加は編集と削除だけ（足すボタンは出さない）。削除の確認は呼び出し側の Dialog
 * - 入力はプレーンテキスト（TextField の値だけ）
 */

export interface ReqDocEdit {
  local: AiEditableV3;
  catalog: ReqDocCatalog | undefined;
  readOnly: boolean;
  /** 要確認の数字（開発者だけ。「項目 id:数字」の形も含む） */
  flags?: readonly string[];
  onChange: (next: AiEditableV3) => void;
  /** AI追加の削除を求める（確認ダイアログを開く） */
  onAskDelete: (id: string) => void;
}

const AI_ADDED_TOOLTIP = 'AI がひな型に無い項目として提案したものです。お客様には「追加項目」と表示されます。';

function Evidence({ keys }: { keys: readonly string[] }) {
  if (!keys.length) return null;
  return (
    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.5 }} aria-label="根拠">
      <Typography variant="caption" sx={{ mr: 0.5 }}>根拠</Typography>
      {keys.map((k) => <StatusPill key={k} tone="neutral" dot={false}>{evidenceLabel(k)}</StatusPill>)}
    </Stack>
  );
}

/**
 * 欄の共通の入力（行の欄は React.memo で包む。1 文字ごとに全 129 項目の TextField を描き直さない＝2026-11-28 の入力の固まり）。
 * 欄には自分の値（項目・AI追加・特記事項）と、最新の文書に当てる apply だけを渡す（edit.local を渡すと毎回変わって memo が効かない）
 */
interface CellCommon {
  readOnly: boolean;
  /** 要確認の数字（全体。欄の中で flagsFor で絞る） */
  flags?: readonly string[];
  apply: ApplyEdit<AiEditableV3>;
}

/** ひな型の項目 1 件の入力（固定・カタログに無い項目は描かない＝呼び出し側 useReqDocChaptersEditor が表示の行を出す） */
export const ItemEditCell = memo(function ItemEditCell({ id, cat, it, readOnly, flags, apply, catalog }: CellCommon & {
  id: string; cat: ReqDocCatalogItem; it: ReqDocItem; catalog: ReqDocCatalog | undefined;
}) {
  const edit = { readOnly, flags, catalog };
  const change = (patch: Parameters<typeof setItem>[2]) => apply((cur) => setItem(cur, id, patch, catalog));
  const na = it.status === 'na';
  const naLabel = cat.kubun === 'optional' ? '不採用' : '対象外';
  return (
    <Stack spacing={1} sx={{ minWidth: 0, whiteSpace: 'normal' }}>
      {/* 区分は行の見出し（「項目 ｜ 区分」）に出ているので、ここでは状態の操作だけ */}
      <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.75 }}>
        <ToggleButtonGroup
          size="small" exclusive value={it.status === 'std_pending' ? null : it.status} disabled={edit.readOnly} aria-label={`${cat.label} の状態`}
          onChange={(_, v: 'proposed' | 'open' | 'na' | null) => v && change({ status: v })}
        >
          {statusOptions(cat.kubun).map((o) => <ToggleButton key={o.value} value={o.value} sx={{ px: 1.25, minHeight: 36 }}>{o.label}</ToggleButton>)}
        </ToggleButtonGroup>
      </Stack>
      <Field
        label={na ? `${naLabel}の理由` : '内容'} value={it.text} max={itemTextMax(id)} readOnly={edit.readOnly}
        flags={flagsFor(edit.flags, id)} onChange={(v) => change({ text: v })}
        error={na && !it.text.trim() ? REQ_DOC_COPY.naReasonRequired : undefined}
      />
      <Typography variant="caption" sx={{ display: 'block' }}>{REQ_DOC_COPY.target(cat.target)}・{REQ_DOC_COPY.by[it.by] ?? it.by}</Typography>
      <Evidence keys={it.evidence} />
    </Stack>
  );
});

/** AI追加 1 件の入力（項目名・採用案／不採用・内容・理由・削除） */
export const AddedEditCell = memo(function AddedEditCell({ item, readOnly, flags, apply, onAskDelete }: CellCommon & {
  item: ReqDocAddedItem; onAskDelete: (id: string) => void;
}) {
  const edit = { readOnly, flags, onAskDelete };
  const na = item.status === 'na';
  const set = (patch: Parameters<typeof setAdded>[2]) => apply((cur) => setAdded(cur, item.id, patch));
  return (
    <Stack spacing={1.5} sx={{ minWidth: 0, whiteSpace: 'normal' }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.75 }}>
        <AiBadge label={REQ_DOC_COPY.addedEditor} tooltip={AI_ADDED_TOOLTIP} />
        <ToggleButtonGroup
          size="small" exclusive value={item.status} disabled={edit.readOnly} aria-label={`${item.label} の採否`}
          onChange={(_, v: 'proposed' | 'na' | null) => v && set({ status: v })}
        >
          <ToggleButton value="proposed" sx={{ px: 1.25, minHeight: 36 }}>採用案</ToggleButton>
          <ToggleButton value="na" sx={{ px: 1.25, minHeight: 36 }}>不採用</ToggleButton>
        </ToggleButtonGroup>
        {!edit.readOnly && (
          <Button size="small" color="error" startIcon={<Trash2 size={15} />} onClick={() => edit.onAskDelete(item.id)} aria-label={`${item.label} を削除`} sx={{ ml: 'auto !important' }}>
            {REQ_DOC_COPY.deleteAction}
          </Button>
        )}
      </Stack>
      <Field label="項目名" value={item.label} max={REQ_DOC_LIMITS.addedLabel} multiline={false} readOnly={edit.readOnly} flags={flagsFor(edit.flags, item.id)} onChange={(v) => set({ label: v })}
        error={!item.label.trim() ? REQ_DOC_COPY.addedLabelRequired : undefined}
      />
      <Field
        label={na ? '不採用の理由' : '内容'} value={item.text} max={REQ_DOC_LIMITS.itemText} readOnly={edit.readOnly} flags={flagsFor(edit.flags, item.id)}
        onChange={(v) => set({ text: v })} error={na && !item.text.trim() ? REQ_DOC_COPY.naReasonRequired : undefined}
      />
      <Field label="追加した理由" value={item.reason} max={REQ_DOC_LIMITS.addedReason} readOnly={edit.readOnly} flags={flagsFor(edit.flags, item.id)} onChange={(v) => set({ reason: v })} />
      <Evidence keys={item.evidence} />
    </Stack>
  );
});

/** 章末の特記事項の入力 */
export const NotesEditCell = memo(function NotesEditCell({ chapterId, value, readOnly, apply }: Omit<CellCommon, 'flags'> & { chapterId: string; value: string }) {
  return (
    <Box sx={{ whiteSpace: 'normal' }}>
      <Field label={REQ_DOC_COPY.notesLabel} value={value} max={REQ_DOC_LIMITS.notes} readOnly={readOnly} onChange={(t) => apply((cur) => setNote(cur, chapterId, t))} />
    </Box>
  );
});

const COVER_KEYS: (keyof ProposalV3Doc['cover'])[] = ['client', 'vendor', 'author', 'approver'];

/** 表紙の 4 欄（編集。会社名と役職まで） */
export function CoverFields({ edit, apply }: { edit: Omit<ReqDocEdit, 'onAskDelete'>; apply: ApplyEdit<AiEditableV3> }) {
  const c = edit.local.doc.cover;
  return (
    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0,1fr))' } }}>
      {COVER_KEYS.map((k) => (
        <Field
          key={k} label={REQ_DOC_COPY.cover[k]} value={c[k]} max={REQ_DOC_LIMITS.coverField} multiline={false} readOnly={edit.readOnly}
          helper={REQ_DOC_COPY.coverHelper} onChange={(v) => apply((cur) => setCover(cur, k, v))}
        />
      ))}
    </Box>
  );
}

/**
 * ReqDocChapters の「編集」の描き方（行の入力・特記事項の入力・AI追加の削除の確認ダイアログ）。
 * 表示の部品（ReqDocChapters）がこのファイルを import しないよう、編集の画面（AiDraftReviewV3）がここで作って渡す
 */
export function useReqDocChaptersEditor(edit: Omit<ReqDocEdit, 'onAskDelete'>): ReqDocChaptersEditor & { apply: ApplyEdit<AiEditableV3> } {
  const [askDelete, setAskDelete] = useState<string | null>(null);
  // 欄の onChange は最新の文書に当てる（memo で描き直さなかった欄が古い文書で他の欄の入力を消さない。latestApply.ts）
  const latest = useRef(edit.local);
  latest.current = edit.local;
  const commit = useRef(edit.onChange);
  commit.current = edit.onChange;
  const apply = useMemo(() => makeLatestApply(latest, commit), []);
  const common = { readOnly: edit.readOnly, flags: edit.flags, apply };
  const deleting = askDelete ? edit.local.doc.added.find((a) => a.id === askDelete) : undefined;
  const cell = (r: ReqDocRow) => {
    if (r.kind === 'item') {
      const cat = edit.catalog?.items.find((i) => i.id === r.id);
      const it = edit.local.doc.items[r.id];
      return cat && isKubunEditable(cat.kubun) && it ? <ItemEditCell id={r.id} cat={cat} it={it} catalog={edit.catalog} {...common} /> : null;
    }
    if (r.kind === 'added') {
      const a = edit.local.doc.added.find((x) => x.id === r.id);
      return a ? <AddedEditCell item={a} onAskDelete={setAskDelete} {...common} /> : null;
    }
    return null;
  };
  const overlay = (
    <Dialog open={!!deleting} onClose={() => setAskDelete(null)} maxWidth="xs" fullWidth aria-labelledby="reqdoc-delete-title">
      <DialogContent sx={{ pt: 3 }}>
        <Typography id="reqdoc-delete-title" variant="h3" sx={{ mb: 1 }}>{REQ_DOC_COPY.deleteTitle}</Typography>
        {deleting && <Typography variant="body2" color="text.secondary">{deleting.label}</Typography>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button variant="outlined" onClick={() => setAskDelete(null)}>{REQ_DOC_COPY.deleteCancel}</Button>
        <Button variant="contained" color="error" onClick={() => {
          if (deleting) apply((cur) => removeAdded(cur, deleting.id));
          setAskDelete(null);
        }}>{REQ_DOC_COPY.deleteAction}</Button>
      </DialogActions>
    </Dialog>
  );
  return {
    cell,
    notes: (chapterId) => <NotesEditCell chapterId={chapterId} value={edit.local.doc.notes[chapterId] ?? ''} readOnly={edit.readOnly} apply={apply} />,
    overlay,
    // 表紙・改善ポイントも同じ apply で当てる（描画時点の文書から作り直さない。code review 2026-11-28 Minor）
    apply,
  };
}
