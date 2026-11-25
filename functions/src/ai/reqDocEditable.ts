/**
 * 提案 v3 の edited（開発者が直せる欄: summary・points・doc）の検査（REQUIREMENTS_DOC_TEMPLATE.md §3.3）。saveAiDraftEdits と worker の再検証が使う。
 * - 上限は shared/aiDraft.ts の REQ_DOC_LIMITS（summary・points は v2 の validateEditable と同じ検査）
 * - doc.items のキーは generated のひな型の版のカタログと過不足なく一致／固定は std_pending・文は空だけ／固定以外は std_pending にできない／
 *   na は文（理由）が必須／by と evidence は generated のまま（書き換え不可）
 * - AI追加は generated にある id の編集と削除だけ（足せない。章・evidence・source は変えられない）
 * - 失敗の理由は欄の名前だけ（カタログの id か固定の名前。入力のキー・値を入れない）
 */
import { REQ_DOC_ITEM_AUTHORS, REQ_DOC_LIMITS as D, type AiEditableV3, type ProposalV3Doc, type ReqDocAddedItem, type ReqDocItem } from './shared/aiDraft';
import { reqDocCatalogOf } from './shared/reqDocCatalog';
import { EditableError, validateEditable } from './editable';

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const cpLen = (s: string) => [...s].length;
const own = (o: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(o, k);

function exactKeys(o: Record<string, unknown>, keys: readonly string[], field: string): void {
  if (Object.keys(o).length !== keys.length || !keys.every((k) => own(o, k))) throw new EditableError(field);
}
function str(v: unknown, min: number, max: number, field: string): string {
  if (typeof v !== 'string' || cpLen(v) < min || cpLen(v) > max) throw new EditableError(field);
  return v;
}
const sameList = (a: unknown, b: readonly string[]) => Array.isArray(a) && a.length === b.length && a.every((x, i) => x === b[i]);

const ITEM_KEYS = ['status', 'text', 'evidence', 'by'] as const;
const ADDED_KEYS = ['id', 'chapterId', 'label', 'status', 'text', 'reason', 'evidence', 'source'] as const;
const COVER_KEYS = ['client', 'vendor', 'author', 'approver'] as const;
const EDITABLE_STATUSES = new Set(['proposed', 'open', 'na']);
const AUTHORS = new Set<string>(REQ_DOC_ITEM_AUTHORS);
const EMPTY_DRAFT = { goal: '', target: '', contents: '', features: '', nonFunctional: '', operation: '', schedule: '', openQuestions: [] };

/** generated の形（v3 の template と doc だけを見る） */
export interface GeneratedV3Like { version: 3; template: { id: string; version: string }; doc: ProposalV3Doc }

export function isEditedV3Shape(v: unknown): boolean {
  return isObj(v) && own(v, 'doc');
}

/** edited（v3）を generated と照らして検査し、保存する写しを返す。不正なら EditableError */
export function validateEditableV3(v: unknown, generated: GeneratedV3Like): AiEditableV3 {
  if (!isObj(v)) throw new EditableError('edited');
  exactKeys(v, ['summary', 'points', 'doc'], 'edited');
  const { summary, points } = validateEditable({ summary: v.summary, points: v.points, draft: EMPTY_DRAFT });
  const catalog = generated?.template?.id === 'TPL-WEB-REQ' ? reqDocCatalogOf(generated.template.version) : undefined;
  const g = generated?.doc;
  if (!catalog || !isObj(g) || !isObj(g.items) || !Array.isArray(g.added)) throw new EditableError('template');
  const d = v.doc;
  if (!isObj(d)) throw new EditableError('doc');
  exactKeys(d, ['items', 'added', 'notes', 'cover'], 'doc');

  // items
  const ids = catalog.items.map((i) => i.id);
  if (!isObj(d.items)) throw new EditableError('doc.items');
  exactKeys(d.items, ids, 'doc.items');
  const items: Record<string, ReqDocItem> = {};
  for (const cat of catalog.items) {
    const f = `doc.items.${cat.id}`;
    const it = (d.items as Record<string, unknown>)[cat.id];
    const gi = (g.items as Record<string, ReqDocItem | undefined>)[cat.id];
    if (!isObj(it) || !gi) throw new EditableError(f);
    exactKeys(it, ITEM_KEYS, f);
    if (typeof it.by !== 'string' || !AUTHORS.has(it.by) || it.by !== gi.by) throw new EditableError(`${f}.by`);
    if (!sameList(it.evidence, gi.evidence ?? [])) throw new EditableError(`${f}.evidence`);
    const max = cat.id === 't22-01' ? D.openItemsText : D.itemText;
    const text = str(it.text, 0, max, `${f}.text`);
    if (cat.kubun === 'fixed') {
      if (it.status !== 'std_pending' || text !== '') throw new EditableError(`${f}.status`);
    } else if (typeof it.status !== 'string' || !EDITABLE_STATUSES.has(it.status)) {
      throw new EditableError(`${f}.status`);
    }
    if (it.status === 'na' && !text.trim()) throw new EditableError(`${f}.text`);
    items[cat.id] = { status: it.status as ReqDocItem['status'], text, evidence: [...(gi.evidence ?? [])], by: gi.by };
  }

  // added（編集と削除だけ）
  if (!Array.isArray(d.added) || d.added.length > Math.min(D.added, g.added.length)) throw new EditableError('doc.added');
  const gAdded = new Map((g.added as ReqDocAddedItem[]).map((a) => [a.id, a]));
  const used = new Set<string>();
  const added: ReqDocAddedItem[] = d.added.map((a, i) => {
    const f = `doc.added[${i}]`;
    if (!isObj(a)) throw new EditableError(f);
    exactKeys(a, ADDED_KEYS, f);
    const ga = typeof a.id === 'string' ? gAdded.get(a.id) : undefined;
    if (!ga || used.has(ga.id)) throw new EditableError(`${f}.id`);
    used.add(ga.id);
    if (a.chapterId !== ga.chapterId || a.source !== 'ai_added' || !sameList(a.evidence, ga.evidence)) throw new EditableError(`${f}.fixed`);
    if (a.status !== 'proposed' && a.status !== 'na') throw new EditableError(`${f}.status`);
    const text = str(a.text, 0, D.itemText, `${f}.text`);
    if (a.status === 'na' && !text.trim()) throw new EditableError(`${f}.text`);
    return {
      id: ga.id, chapterId: ga.chapterId, label: str(a.label, 1, D.addedLabel, `${f}.label`), status: a.status, text,
      reason: str(a.reason, 0, D.addedReason, `${f}.reason`), evidence: [...ga.evidence], source: 'ai_added',
    };
  });

  // notes（特記欄のある章だけ）
  const noteIds = catalog.chapters.filter((c) => c.hasNotes).map((c) => c.id);
  if (!isObj(d.notes)) throw new EditableError('doc.notes');
  exactKeys(d.notes, noteIds, 'doc.notes');
  const notes = Object.fromEntries(noteIds.map((id) => [id, str((d.notes as Record<string, unknown>)[id], 0, D.notes, `doc.notes.${id}`)]));

  // cover
  if (!isObj(d.cover)) throw new EditableError('doc.cover');
  exactKeys(d.cover, COVER_KEYS, 'doc.cover');
  const cv = d.cover as Record<string, unknown>;
  const cover = Object.fromEntries(COVER_KEYS.map((k) => [k, str(cv[k], 0, D.coverField, `doc.cover.${k}`)])) as unknown as ProposalV3Doc['cover'];

  return { summary, points, doc: { items, added, notes, cover } };
}
