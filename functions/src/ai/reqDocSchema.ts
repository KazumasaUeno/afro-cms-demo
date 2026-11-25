/**
 * 提案 v3（PRM-REQ-001@2.0.0）の構造化出力の JSON Schema と受け側の再検証（REQUIREMENTS_DOC_TEMPLATE.md §4.1）。
 * - doc.items[].id の enum は fill:'ai' の項目だけ。**固定・server・human の id は enum に無いので AI は出力できない**
 * - 文字数・件数は API の Schema で指定できない（v2 と同じ）ので、ここで切り詰める。未知の id・重複は後処理（reqDocPostprocess.ts）で捨てる
 */
import { REQ_DOC_AI_EVIDENCE_KEYS, REQ_DOC_LIMITS as D } from './shared/aiDraft';
import { OUTPUT_SCHEMA, cut, validateOutput, type RawPoint } from './schema';
import { reqDocAiChapterIds, reqDocAiItems } from './reqDocCatalogView';

const str = { type: 'string' } as const;
/** AI が付けてよい状態（std_pending は固定の項目だけで、サーバーが置く） */
export const AI_ITEM_STATUSES = ['proposed', 'open', 'na'] as const;
export type AiItemStatus = (typeof AI_ITEM_STATUSES)[number];
const ITEM_KEYS = ['id', 'status', 'text', 'evidence'] as const;
const ADDED_KEYS = ['chapterId', 'label', 'text', 'reason', 'evidence'] as const;
const DOC_KEYS = ['items', 'added', 'questions'] as const;
const evidence = { type: 'array', items: { type: 'string', enum: [...REQ_DOC_AI_EVIDENCE_KEYS] } } as const;

const v2Props = (OUTPUT_SCHEMA.properties ?? {}) as Record<string, unknown>;

export const OUTPUT_SCHEMA_V3: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'points', 'doc'],
  properties: {
    summary: v2Props.summary,
    points: v2Props.points,
    doc: {
      type: 'object',
      additionalProperties: false,
      required: [...DOC_KEYS],
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: [...ITEM_KEYS],
            properties: {
              id: { type: 'string', enum: reqDocAiItems().map((i) => i.id) },
              status: { type: 'string', enum: [...AI_ITEM_STATUSES] },
              text: str,
              evidence,
            },
          },
        },
        added: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: [...ADDED_KEYS],
            properties: { chapterId: { type: 'string', enum: reqDocAiChapterIds() }, label: str, text: str, reason: str, evidence },
          },
        },
        questions: { type: 'array', items: str },
      },
    },
  },
};

export interface RawDocItem { id: string; status: AiItemStatus; text: string; evidence: string[] }
export interface RawAddedItem { chapterId: string; label: string; text: string; reason: string; evidence: string[] }
export interface RawOutputV3 { summary: string; points: RawPoint[]; doc: { items: RawDocItem[]; added: RawAddedItem[]; questions: string[] } }

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const exactKeys = (o: Record<string, unknown>, keys: readonly string[]) => Object.keys(o).length === keys.length && keys.every((k) => k in o);
const strList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');
/** AI が返しすぎたときの読み取りの上限（後処理の前に配列を切る。1 項目 1 件なので 41 件＋予備） */
const MAX_RAW_ITEMS = 200;
const MAX_RAW_ADDED = 50;

/** Schema に合わなければ null（形式エラー。再要求しない）。合えば上限で切り詰めた値 */
export function validateOutputV3(v: unknown): RawOutputV3 | null {
  if (!isObj(v) || !exactKeys(v, ['summary', 'points', 'doc'])) return null;
  // summary・points は v2 の検査をそのまま使う（draft の検査を通すため空の draft を足す）
  const base = validateOutput({
    summary: v.summary, points: v.points,
    draft: { goal: '', target: '', contents: '', features: '', nonFunctional: '', operation: '', schedule: '', openQuestions: [] },
  });
  if (!base) return null;
  const doc = v.doc;
  if (!isObj(doc) || !exactKeys(doc, DOC_KEYS)) return null;
  if (!Array.isArray(doc.items) || !Array.isArray(doc.added) || !strList(doc.questions)) return null;
  const items: RawDocItem[] = [];
  for (const it of doc.items.slice(0, MAX_RAW_ITEMS)) {
    if (!isObj(it) || !exactKeys(it, ITEM_KEYS) || typeof it.id !== 'string' || typeof it.text !== 'string' || !strList(it.evidence)) return null;
    if (!(AI_ITEM_STATUSES as readonly string[]).includes(it.status as string)) return null;
    items.push({ id: it.id, status: it.status as AiItemStatus, text: cut(it.text, D.itemText), evidence: it.evidence });
  }
  const added: RawAddedItem[] = [];
  for (const a of doc.added.slice(0, MAX_RAW_ADDED)) {
    if (!isObj(a) || !exactKeys(a, ADDED_KEYS) || !strList(a.evidence)) return null;
    if (typeof a.chapterId !== 'string' || typeof a.label !== 'string' || typeof a.text !== 'string' || typeof a.reason !== 'string') return null;
    added.push({ chapterId: a.chapterId, label: cut(a.label, D.addedLabel), text: cut(a.text, D.itemText), reason: cut(a.reason, D.addedReason), evidence: a.evidence });
  }
  const questions = doc.questions.slice(0, D.openQuestions).map((q) => cut(q, D.openQuestion));
  return { summary: base.summary, points: base.points, doc: { items, added, questions } };
}
