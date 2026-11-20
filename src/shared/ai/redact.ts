/**
 * 外部の AI へ送る前の機械的な除去（docs/design/AI_REQUIREMENTS.md §4「除去」）。純粋関数（画面と関数で同じ結果）。
 * - 正はこのファイル。functions へは scripts/gen-ai-shared.mjs が写す（functions/src/ai/shared/。手で直さない）
 * - 回答の自由記述とサイトの本文に使う。URL → [URL]・メール → [メール]・郵便番号 → [郵便番号]・電話 → [電話]
 * - 個人名は機械的には除けない（設計 §4。入力画面の注意書きで扱う）
 */

export const REDACTED = { url: '[URL]', email: '[メール]', postal: '[郵便番号]', phone: '[電話]' } as const;

// 全角の数字・ハイフンも半角と同じに扱う（置換の判定だけ。置換しない部分の文字は変えない）
const D = '[0-9０-９]';
const H = '[-‐－―ー−\\s]?';
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"'「」（）()]+/gi;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const POSTAL_RE = new RegExp(`(?:〒\\s?)?(?<!${D})${D}{3}[-‐－ー−]${D}{4}(?!${D})`, 'g');
// 日本の固定・携帯・フリーダイヤル（0120/0800）・国際表記（+81）。区切りは任意。桁は 10〜11
const PHONE_RE = new RegExp(
  `(?<!${D})(?:\\+81${H}${D}{1,4}|[0０]${D}{1,4})${H}\\(?${D}{1,4}\\)?${H}${D}{3,4}(?!${D})`,
  'g',
);

function digitCount(s: string): number {
  let n = 0;
  for (const ch of s) if (/[0-9０-９]/.test(ch)) n++;
  return n;
}

/** 1 つの文字列から連絡先の形を除く */
export function redactText(input: string): string {
  return input
    .replace(URL_RE, REDACTED.url)
    .replace(EMAIL_RE, REDACTED.email)
    .replace(POSTAL_RE, REDACTED.postal)
    .replace(PHONE_RE, (m) => {
      const n = digitCount(m);
      // +81 は先頭の 81 を除いた桁で 9〜10、国内表記は 10〜11 桁
      const ok = m.trim().startsWith('+') ? n >= 11 && n <= 12 : n >= 10 && n <= 11;
      return ok ? REDACTED.phone : m;
    });
}
