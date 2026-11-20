/**
 * 後処理（設計 §5.3）: evidence を許可リスト（実際に送ったキー）に絞る・出力の URL/メール/電話を除く・入力に無い数字を flags へ。
 * 数字は消さずに印を付ける（開発者が判断）。flags は generated にだけ置き、提案には写さない（計画 U1 HIGH-3）
 */
import { AI_DRAFT_LIMITS as L } from './shared/aiDraft';
import type { AiEditable, AiEvidenceKey, ProposalV2Point } from './shared/aiDraft';
import { redactText } from './shared/redact';
import { DRAFT_FIELDS, type RawOutput } from './schema';

const toHalf = (s: string) => s.replace(/[０-９．，]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
/** 数字の並び（3,000 → 3000、1.5 → 1.5）。1 桁の数字も数える */
export function numbersIn(s: string): string[] {
  return (toHalf(s).match(/\d+(?:[.,]\d+)*/g) ?? []).map((n) => n.replace(/,/g, ''));
}

export function postprocess(raw: RawOutput, ctx: { allowedEvidence: ReadonlySet<string>; inputText: string }): { editable: AiEditable; unsupportedNumbers: string[] } {
  const known = new Set(numbersIn(ctx.inputText));
  const unsupported = new Set<string>();
  const clean = (s: string) => {
    const t = redactText(s);
    for (const n of numbersIn(t)) if (!known.has(n)) unsupported.add(n);
    return t;
  };
  const points: ProposalV2Point[] = raw.points.map((p, i) => ({
    id: `p${i + 1}`,
    area: p.area,
    priority: p.priority,
    title: clean(p.title),
    detail: clean(p.detail),
    impact: clean(p.impact),
    evidence: [...new Set(p.evidence.filter((e) => ctx.allowedEvidence.has(e)))].slice(0, L.evidence) as AiEvidenceKey[],
  }));
  const draft = Object.fromEntries(DRAFT_FIELDS.map((k) => [k, clean(raw.draft[k])])) as unknown as AiEditable['draft'];
  draft.openQuestions = raw.draft.openQuestions.map(clean);
  return { editable: { summary: clean(raw.summary), points, draft }, unsupportedNumbers: [...unsupported].slice(0, 50) };
}
