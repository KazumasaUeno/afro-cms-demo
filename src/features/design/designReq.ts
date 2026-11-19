import type { AnswerValue, DemoState, RequirementQuestion } from '@/types';
import { DESIGN_QUESTIONS, MOVED_FROM_HEARING } from '@/data/designRequirements';
import { isAnswered, validateAnswer } from '@/features/requirements/validation';

/** デザイン要件定義の必須（A）の質問 */
export const DESIGN_REQUIRED = DESIGN_QUESTIONS.filter((q) => q.priority === 'A');

/** デザイン案を作るのに足りない必須（A）の質問（入力の検査は画面と同じ validateAnswer） */
export function designBlockers(answers: Record<string, AnswerValue> | undefined): RequirementQuestion[] {
  return DESIGN_REQUIRED.filter((q) => validateAnswer(q, answers?.[q.id]));
}

/**
 * デザイン案（3 案）を出せるか（demo のシミュレーション）。必須（A）の質問がそろったら出す。
 * 採用・承認済みの保存データ（0.27 まで。デザイン要件定義が無かった）は、回答が無くてもそのまま出す
 */
export function designReady(state: Pick<DemoState, 'design'>): boolean {
  return !!state.design.approvedAt || designBlockers(state.design.answers).length === 0;
}

export const designAnsweredCount = (answers: Record<string, AnswerValue> | undefined) =>
  DESIGN_QUESTIONS.filter((q) => isAnswered(answers?.[q.id])).length;

/**
 * 0.27 までの保存データ: ヒアリング（rc8）にあった 3 問の回答と記録を、デザイン要件定義へ移す（消さずに移す。版は上げない）。
 * デザイン要件定義に同じ質問の回答が既にあるときはそちらを残す。移す回答が無ければ state をそのまま返す
 */
export function moveDesignAnswers(state: DemoState): DemoState {
  const req = state.requirements;
  const meta = req.answerMeta ?? {};
  const ids = MOVED_FROM_HEARING.filter((id) => id in req.answers || id in meta);
  if (ids.length === 0) return state;
  const answers = { ...req.answers };
  const answerMeta = { ...meta };
  const dAnswers = { ...(state.design.answers ?? {}) };
  const dMeta = { ...(state.design.answerMeta ?? {}) };
  for (const id of ids) {
    const keep = isAnswered(dAnswers[id]);
    if (!keep && isAnswered(answers[id])) {
      dAnswers[id] = answers[id];
      if (answerMeta[id]) dMeta[id] = answerMeta[id];
    }
    delete answers[id];
    delete answerMeta[id];
  }
  return {
    ...state,
    requirements: { ...req, answers, answerMeta },
    design: { ...state.design, answers: dAnswers, answerMeta: dMeta },
  };
}
