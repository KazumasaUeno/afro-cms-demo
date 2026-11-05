import type { AnswerValue, RequirementQuestion } from '@/types';

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
