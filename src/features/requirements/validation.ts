import type { AnswerValue, RequirementQuestion } from '@/types';
import { REQUIREMENT_QUESTIONS } from '@/data/requirements';

export const MAX_URL = 200;
export const MAX_TEXT = 120;
export const MAX_LONGTEXT = 600;
export const MAX_COMPETITORS = 3;

/** http(s) で始まり、URL として解釈でき、ドメインに "." を含む */
export function validateUrl(raw: string, required = true): string | null {
  const v = raw.trim();
  if (!v) return required ? 'URLを入力してください' : null;
  if (v.length > MAX_URL) return `URLは${MAX_URL}文字以内で入力してください`;
  if (!/^https?:\/\//i.test(v)) return 'https:// または http:// から入力してください';
  try {
    const u = new URL(v);
    if (!u.hostname.includes('.') || u.hostname.startsWith('.') || u.hostname.endsWith('.')) return 'ドメインの形式を確認してください（例: example.co.jp）';
  } catch {
    return 'URLの形式を確認してください';
  }
  return null;
}

export function validateAnswer(q: RequirementQuestion, value: AnswerValue | undefined, required = true): string | null {
  switch (q.kind) {
    case 'url':
      return validateUrl(typeof value === 'string' ? value : '', required);
    case 'multi':
      return required && (!Array.isArray(value) || value.length === 0) ? '1つ以上選んでください' : null;
    case 'single':
      return required && !value ? '1つ選んでください' : null;
    case 'text': {
      const v = typeof value === 'string' ? value.trim() : '';
      if (required && !v) return '入力してください';
      return v.length > MAX_TEXT ? `${MAX_TEXT}文字以内で入力してください` : null;
    }
    case 'longtext': {
      const v = typeof value === 'string' ? value.trim() : '';
      if (required && v.length < 4) return '4文字以上で入力してください';
      return v.length > MAX_LONGTEXT ? `${MAX_LONGTEXT}文字以内で入力してください` : null;
    }
    default:
      return null;
  }
}

export function isAnswered(value: AnswerValue | undefined): boolean {
  return Array.isArray(value) ? value.length > 0 : typeof value === 'string' && value.trim().length > 0;
}

/** 回答を 1 行の文字列にする（一覧・確認用の表示。複数選択・URL の配列は「、」でつなぐ） */
export function answerText(v: AnswerValue | undefined): string {
  if (Array.isArray(v)) return v.join('、');
  return v ?? '';
}

/** AI 分析に使う主要な質問（旧ウィザードの 5 問） */
export const KEY_QUESTIONS = REQUIREMENT_QUESTIONS.filter((q) => q.featured);
/** AI 分析の前に必ず答える質問（競合サイトは任意。旧ウィザードと同じ判定） */
export const REQUIRED_FOR_ANALYSIS = KEY_QUESTIONS.filter((q) => q.id !== 'q-competitor');

/** AI 分析を実行できるか（必須の主要な質問がそろい、競合サイトの URL に誤りが無い）。足りない質問を返す */
export function analysisBlockers(answers: Record<string, AnswerValue>): RequirementQuestion[] {
  const missing = REQUIRED_FOR_ANALYSIS.filter((q) => validateAnswer(q, answers[q.id]));
  const comp = answers['q-competitor'];
  const compBad = Array.isArray(comp) && comp.some((u) => validateUrl(u, false));
  return compBad ? [...missing, ...KEY_QUESTIONS.filter((q) => q.id === 'q-competitor')] : missing;
}
