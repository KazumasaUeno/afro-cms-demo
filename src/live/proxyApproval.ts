/**
 * 管理者の代理承認の理由（note）の整え方と検査（docs/design/ADMIN_FULL_RIGHTS_PLAN.md L-2・§7-2）。
 * firestore.rules は trim 後 1〜200 字（. はコードポイント）で、向きの制御（U+202A〜202E・U+2066〜2069）と C0 制御文字・DEL（改行も）を拒否する。
 * 画面は送る前に同じ文字を除く（改行・タブは空白にしてから除く＝語がつながらない）。React・Firebase を import しない（単体テストが直接読む）
 */

export const PROXY_NOTE_MAX = 200;

const PROXY_NOTE_STRIP = /[\u202A-\u202E\u2066-\u2069\u0000-\u001F\u007F]/g;

/** 送る値（制御文字を除いて trim）。改行・タブは空白 1 つにする */
export function cleanProxyNote(raw: string): string {
  return raw.replace(/\r\n|[\r\n\t]/g, ' ').replace(PROXY_NOTE_STRIP, '').trim();
}

/** 文字数（Rules の . と同じコードポイントで数える） */
export const proxyNoteLength = (note: string): number => [...note].length;

/** 検査（cleanProxyNote の後の値。問題なければ null） */
export function validateProxyNote(note: string): string | null {
  if (!note) return '代理で承認する理由を入力してください';
  if (proxyNoteLength(note) > PROXY_NOTE_MAX) return `理由は${PROXY_NOTE_MAX}文字以内にしてください`;
  return null;
}

/** 代理承認の時点の版が、ダイアログを開いた時点と同じか（確認依頼の日時で比べる。空・不一致は不可。Codex P2 2026-11-26） */
export const proxyVersionOk = (expected: string | undefined, current: string | undefined): boolean => !!expected && expected === current;
