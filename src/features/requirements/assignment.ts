import type { AnswerMeta, AnswerSide, RequirementMode, RequirementQuestion, RequirementSession } from '@/types';
import { REQUIREMENT_QUESTIONS } from '@/data/requirements';
import { isAnswered } from './validation';

/**
 * 要件の回答の分担（誰が答えるか）と、各質問の状態を導く。
 * 状態は store の answers / answerMeta / mode から毎回計算する（別に持たない）。
 */

export const DEFAULT_MODE: RequirementMode = 'shared';

export const MODE_LABEL: Record<RequirementMode, { label: string; description: string }> = {
  shared: { label: '共同', description: '事業・好みはお客様、技術・分析はアフロが答えます' },
  afro: { label: 'アフロが入力', description: 'アフロがヒアリングして代わりに入力します' },
  client: { label: 'お客様が入力', description: 'お客様がポータルですべて答えます' },
};

export const SIDE_LABEL: Record<AnswerSide, string> = { afro: 'アフロ', client: 'お客様' };

export const modeOf = (req: RequirementSession): RequirementMode => req.mode ?? DEFAULT_MODE;

/** その質問に答える側 */
export function assigneeOf(q: RequirementQuestion, mode: RequirementMode): AnswerSide {
  return mode === 'shared' ? q.owner : mode;
}

/**
 * unanswered: 未回答 / answered: 担当側が回答 / proxy: 担当ではない側が代わりに回答し、担当側の確認待ち /
 * confirmed: 代理回答を担当側が確認済み
 */
export type AnswerState = 'unanswered' | 'answered' | 'proxy' | 'confirmed';

export interface QuestionStatus {
  assignee: AnswerSide;
  state: AnswerState;
  meta?: AnswerMeta;
}

export function questionStatus(q: RequirementQuestion, req: RequirementSession): QuestionStatus {
  const assignee = assigneeOf(q, modeOf(req));
  const meta = req.answerMeta?.[q.id];
  if (!isAnswered(req.answers[q.id])) return { assignee, state: 'unanswered', meta };
  // 0.9.0 より前の保存データには記録が無い。担当側が答えたものとして扱う
  if (!meta || meta.by === assignee) return { assignee, state: 'answered', meta };
  return { assignee, state: meta.confirmedAt ? 'confirmed' : 'proxy', meta };
}

/** side が確認しなければならない代理回答 */
export function pendingConfirmations(req: RequirementSession, side?: AnswerSide): RequirementQuestion[] {
  return REQUIREMENT_QUESTIONS.filter((q) => {
    const s = questionStatus(q, req);
    return s.state === 'proxy' && (!side || s.assignee === side);
  });
}

/** side が担当する質問 */
export const questionsFor = (req: RequirementSession, side: AnswerSide): RequirementQuestion[] =>
  REQUIREMENT_QUESTIONS.filter((q) => assigneeOf(q, modeOf(req)) === side);

/** 状態の短い表示（担当・状態のバッジ用） */
export function statusLabel(s: QuestionStatus): string {
  switch (s.state) {
    case 'unanswered': return `${SIDE_LABEL[s.assignee]}の回答待ち`;
    case 'answered': return `${SIDE_LABEL[s.meta?.by ?? s.assignee]}が回答`;
    case 'proxy': return `${SIDE_LABEL[s.meta!.by]}が代理入力・${SIDE_LABEL[s.assignee]}の確認待ち`;
    case 'confirmed': return `${SIDE_LABEL[s.meta!.by]}が代理入力・${SIDE_LABEL[s.assignee]}が確認済み`;
  }
}
