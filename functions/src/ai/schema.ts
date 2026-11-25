/**
 * 構造化出力（output_config.format）の JSON Schema と受け側の再検証（設計 §5.3）。
 * 文字数・件数は API の Schema で指定できない（minLength/maxLength・配列の件数は非対応）ため、プロンプトで伝えてここで切り詰める
 */
import { AI_DRAFT_LIMITS as L, AI_EVIDENCE_KEYS, AI_POINT_AREAS, AI_POINT_PRIORITIES } from './shared/aiDraft';
import type { AiEvidenceKey, AiPointArea, AiPointPriority } from './shared/aiDraft';

const str = { type: 'string' } as const;
export const DRAFT_FIELDS = ['goal', 'target', 'contents', 'features', 'nonFunctional', 'operation', 'schedule'] as const;
const POINT_KEYS = ['area', 'priority', 'title', 'detail', 'impact', 'evidence'] as const;

export const OUTPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'points', 'draft'],
  properties: {
    summary: str,
    points: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [...POINT_KEYS],
        properties: {
          area: { type: 'string', enum: [...AI_POINT_AREAS] },
          priority: { type: 'string', enum: [...AI_POINT_PRIORITIES] },
          title: str, detail: str, impact: str,
          evidence: { type: 'array', items: { type: 'string', enum: [...AI_EVIDENCE_KEYS] } },
        },
      },
    },
    draft: {
      type: 'object',
      additionalProperties: false,
      required: [...DRAFT_FIELDS, 'openQuestions'],
      properties: { ...Object.fromEntries(DRAFT_FIELDS.map((k) => [k, str])), openQuestions: { type: 'array', items: str } },
    },
  },
};

export interface RawPoint { area: AiPointArea; priority: AiPointPriority; title: string; detail: string; impact: string; evidence: string[] }
export type RawDraft = Record<(typeof DRAFT_FIELDS)[number], string> & { openQuestions: string[] };
export interface RawOutput { summary: string; points: RawPoint[]; draft: RawDraft }

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const exactKeys = (o: Record<string, unknown>, keys: readonly string[]) => Object.keys(o).length === keys.length && keys.every((k) => k in o);
const has = (list: readonly string[], v: unknown) => typeof v === 'string' && list.includes(v);
export const cut = (s: string, n: number) => [...s].slice(0, n).join('');

/** Schema に合わなければ null（形式エラー。再要求しない＝設計 §2.2）。合えば上限で切り詰めた値 */
export function validateOutput(v: unknown): RawOutput | null {
  if (!isObj(v) || !exactKeys(v, ['summary', 'points', 'draft'])) return null;
  const { summary, points, draft } = v;
  if (typeof summary !== 'string' || !Array.isArray(points) || points.length === 0 || !isObj(draft)) return null;
  if (!exactKeys(draft, [...DRAFT_FIELDS, 'openQuestions']) || !DRAFT_FIELDS.every((k) => typeof draft[k] === 'string')) return null;
  const oq = draft.openQuestions;
  if (!Array.isArray(oq) || !oq.every((q) => typeof q === 'string')) return null;
  const out: RawPoint[] = [];
  for (const p of points) {
    if (!isObj(p) || !exactKeys(p, POINT_KEYS) || !has(AI_POINT_AREAS, p.area) || !has(AI_POINT_PRIORITIES, p.priority)) return null;
    if (typeof p.title !== 'string' || typeof p.detail !== 'string' || typeof p.impact !== 'string') return null;
    if (!Array.isArray(p.evidence) || !p.evidence.every((e) => typeof e === 'string')) return null;
    out.push({
      area: p.area as AiPointArea, priority: p.priority as AiPointPriority,
      title: cut(p.title, L.pointTitle), detail: cut(p.detail, L.pointDetail), impact: cut(p.impact, L.pointImpact),
      evidence: p.evidence as AiEvidenceKey[],
    });
  }
  const d = Object.fromEntries(DRAFT_FIELDS.map((k) => [k, cut(draft[k] as string, L.draftField)])) as unknown as RawDraft;
  d.openQuestions = (oq as string[]).slice(0, L.openQuestions).map((q) => cut(q, L.openQuestion));
  return { summary: cut(summary, L.summary), points: out.slice(0, L.points), draft: d };
}
