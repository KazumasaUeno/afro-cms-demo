/**
 * edited（開発者が直せる 3 欄）の検査（計画 §4 U1 の代替 F-a: Rules の代わりにここで検査する）。
 * 上限・列挙は src/types/aiDraft.ts（写し: shared/aiDraft.ts）の AI_DRAFT_LIMITS・AI_POINT_AREAS・AI_POINT_PRIORITIES・AI_EVIDENCE_KEYS。
 * - キーは完全一致（余分・欠けは拒否）。文字数はコードポイントで数える（Rules の `.{0,n}` と同じ）
 * - 返すのは検査を通った値の写し（入力のオブジェクトをそのまま保存しない）。失敗の理由は欄の名前だけ（値を入れない）
 */
import { AI_DRAFT_LIMITS, AI_EVIDENCE_KEYS, AI_POINT_AREAS, AI_POINT_PRIORITIES, type AiEditable, type ProposalV2Point } from './shared/aiDraft';

export class EditableError extends Error {
  constructor(readonly field: string) {
    super(`invalid ${field}`);
    this.name = 'EditableError';
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const cpLen = (s: string) => [...s].length;

function exactKeys(o: Record<string, unknown>, keys: readonly string[], field: string): void {
  const got = Object.keys(o);
  if (got.length !== keys.length || !keys.every((k) => Object.prototype.hasOwnProperty.call(o, k))) throw new EditableError(field);
}

function str(v: unknown, min: number, max: number, field: string): string {
  if (typeof v !== 'string' || cpLen(v) < min || cpLen(v) > max) throw new EditableError(field);
  return v;
}

const POINT_KEYS = ['id', 'area', 'priority', 'title', 'detail', 'impact', 'evidence'] as const;
const DRAFT_TEXT_KEYS = ['goal', 'target', 'contents', 'features', 'nonFunctional', 'operation', 'schedule'] as const;
const DRAFT_KEYS = [...DRAFT_TEXT_KEYS, 'openQuestions'] as const;
const AREAS = new Set<string>(AI_POINT_AREAS);
const PRIORITIES = new Set<string>(AI_POINT_PRIORITIES);
const EVIDENCE = new Set<string>(AI_EVIDENCE_KEYS);

function point(v: unknown, i: number): ProposalV2Point {
  const f = `points[${i}]`;
  if (!isObj(v)) throw new EditableError(f);
  exactKeys(v, POINT_KEYS, f);
  if (typeof v.area !== 'string' || !AREAS.has(v.area)) throw new EditableError(`${f}.area`);
  if (typeof v.priority !== 'string' || !PRIORITIES.has(v.priority)) throw new EditableError(`${f}.priority`);
  const ev = v.evidence;
  if (!Array.isArray(ev) || ev.length > AI_DRAFT_LIMITS.evidence || !ev.every((k) => typeof k === 'string' && EVIDENCE.has(k))) {
    throw new EditableError(`${f}.evidence`);
  }
  return {
    id: str(v.id, 1, AI_DRAFT_LIMITS.pointId, `${f}.id`),
    area: v.area as ProposalV2Point['area'],
    priority: v.priority as ProposalV2Point['priority'],
    title: str(v.title, 1, AI_DRAFT_LIMITS.pointTitle, `${f}.title`),
    detail: str(v.detail, 0, AI_DRAFT_LIMITS.pointDetail, `${f}.detail`),
    impact: str(v.impact, 0, AI_DRAFT_LIMITS.pointImpact, `${f}.impact`),
    evidence: [...ev] as ProposalV2Point['evidence'],
  };
}

/** edited を検査して、保存する写しを返す。不正なら EditableError */
export function validateEditable(v: unknown): AiEditable {
  if (!isObj(v)) throw new EditableError('edited');
  exactKeys(v, ['summary', 'points', 'draft'], 'edited');
  const summary = str(v.summary, 0, AI_DRAFT_LIMITS.summary, 'summary');
  if (!Array.isArray(v.points) || v.points.length > AI_DRAFT_LIMITS.points) throw new EditableError('points');
  const points = v.points.map(point);
  const d = v.draft;
  if (!isObj(d)) throw new EditableError('draft');
  exactKeys(d, DRAFT_KEYS, 'draft');
  const oq = d.openQuestions;
  if (!Array.isArray(oq) || oq.length > AI_DRAFT_LIMITS.openQuestions) throw new EditableError('draft.openQuestions');
  const draft = {
    ...Object.fromEntries(DRAFT_TEXT_KEYS.map((k) => [k, str(d[k], 0, AI_DRAFT_LIMITS.draftField, `draft.${k}`)])),
    openQuestions: oq.map((q, i) => str(q, 0, AI_DRAFT_LIMITS.openQuestion, `draft.openQuestions[${i}]`)),
  } as AiEditable['draft'];
  return { summary, points, draft };
}
