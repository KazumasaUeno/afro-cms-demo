/**
 * 文中の数字の並びを取り出す（設計 §5.3「入力に無い数字」・画面設計 AI_REQUIREMENTS_UI.md §3.2）。
 * サーバーの後処理（functions/src/ai/postprocess.ts）が flags.unsupportedNumbers を付けるときと、画面が印を付けるときで同じ正規化を使う。
 * 正はこのファイル。functions へは scripts/gen-ai-shared.mjs が写す
 */

/** 全角の数字・小数点・桁区切りを半角に */
export const toHalfDigits = (s: string): string => s.replace(/[０-９．，]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));

/** 数字の並び（3,000 → 3000、1.5 → 1.5）。1 桁の数字も数える */
export function numbersIn(s: string): string[] {
  return (toHalfDigits(s).match(/\d+(?:[.,]\d+)*/g) ?? []).map((n) => n.replace(/,/g, ''));
}
