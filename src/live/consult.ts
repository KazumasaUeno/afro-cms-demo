import { CHAT_LIMITS, CONSULT_MAX_MESSAGES, CONSULT_MIN_INTERVAL_MS } from '@/data/chatLimits';
import type { ChatMessage } from '@/types';
import type { ConsultSummary, MessageDoc, ProjectDoc } from './model';
import type { LiveRole } from './session';

/**
 * live の相談の導出（docs/design/LIVE_DASHBOARD_TASKS_CONSULT.md §1.3・§2.2・§4・U3）。画面（LiveConsultPage・ダッシュボード）が使う。
 * 権限の実体は firestore.rules の consultOk / msgCreateOk（送れるのはその案件のお客様と担当の開発者全員、admin は見るだけ、
 * 編集・削除なし、アーカイブした案件へは送れない、2 秒に 1 件・1 案件 5,000 件・1 件 1000 字）。
 * ここは表示の出し分けと、Rules に送る前の検査（Rules と同じ条件）だけ。既読は持たない（未対応＝最後がお客様）
 */

/** 会話を一度に読む件数（orderBy('seq') limitToLast。「さらに読む」でこの数ずつ増やす） */
export const MESSAGE_PAGE = 50;

/** メッセージの文書 ID（seq の 6 桁ゼロ埋め。firestore.rules seqId と同じ） */
export function seqId(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > CONSULT_MAX_MESSAGES) throw new Error(`相談のメッセージ番号が範囲外です: ${n}`);
  return String(n).padStart(6, '0');
}

/** 送った側（役割から決まる。firestore.rules sideOf と同じ）。送れない人は null */
export function consultSide(role: LiveRole, uid: string, accountProjectId: string | undefined, p: Pick<ProjectDoc, 'id' | 'memberUids'>): 'client' | 'afro' | null {
  if (role === 'client') return accountProjectId === p.id ? 'client' : null;
  if (role === 'developer') return p.memberUids.includes(uid) ? 'afro' : null;
  return null;
}

/** 未対応（最後のメッセージがお客様）。相談の無い案件は未対応ではない */
export const isUnanswered = (p: Pick<ProjectDoc, 'consult'>): boolean => p.consult?.lastSide === 'client';

/** お客様側の「返信あり」（最後のメッセージがアフロ。NC-5）。既読は持たないので、お客様が送り返すまで出る */
export const hasReply = (p: Pick<ProjectDoc, 'consult'>): boolean => p.consult?.lastSide === 'afro';

/**
 * 未対応の案件の数（メッセージの数ではない。§4）。
 * 開発者は担当の案件（＝返信する案件。全員が返信者）、admin は全案件（見るだけ）。お客様は 0（対象外）。
 * アーカイブした案件は数えない（返信できない＝対応しようがない。2026-11-25 lead SAFE ASSUMPTION。一覧の行の「未対応」の印はそのまま出す）
 */
export function unansweredCount(docs: readonly Pick<ProjectDoc, 'consult' | 'memberUids' | 'archived'>[], role: LiveRole, uid: string): number {
  if (role === 'client') return 0;
  return docs.filter((p) => !p.archived && (role === 'admin' || p.memberUids.includes(uid)) && isUnanswered(p)).length;
}

/** 一覧の並び（最後のメッセージの新しい順。相談の無い案件は元の並びのまま下へ） */
export function consultRows<T extends Pick<ProjectDoc, 'consult'>>(docs: readonly T[]): T[] {
  return docs
    .map((p, i) => ({ p, i }))
    .sort((a, b) => (b.p.consult?.lastAt ?? '').localeCompare(a.p.consult?.lastAt ?? '') || a.i - b.i)
    .map((x) => x.p);
}

/** 一覧の行の 3 段目（本文のプレビューは出さない＝Rules で写しと本文の一致を検査できないため。§1.3） */
export function consultPreview(c: ConsultSummary | null): string {
  if (!c) return 'まだメッセージはありません';
  return c.lastSide === 'client' ? `お客様（${c.lastName}）から` : `${c.lastName}（アフロ）が返信`;
}

/**
 * 送る前に取り除く文字（2026-11-25 セキュリティ L-1）: 文字の向きを変える制御（U+202A〜202E・U+2066〜2069。表示を偽装できる）と、
 * 改行以外の C0 制御文字・DEL。改行は LF にそろえ（CRLF・CR → LF）、タブは空白にする。firestore.rules の reChatControl が同じ文字を拒否する
 */
const CONSULT_STRIP = /[\u202A-\u202E\u2066-\u2069\u0000-\u0008\u000B-\u001F\u007F]/g;
export function cleanConsultText(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/\t/g, ' ').replace(CONSULT_STRIP, '');
}

/** 送る文の検査（trim 後 1〜1000 字。Rules の reMaxChat と同じ数え方の上限側。エラーの文。問題なければ null） */
export function validateConsultText(text: string): string | null {
  const t = text.trim();
  if (!t) return 'メッセージを入力してください';
  if (t.length > CHAT_LIMITS.text) return `メッセージは${CHAT_LIMITS.text}文字以内にしてください`;
  return null;
}

/**
 * いま送れない理由（Rules で拒否される条件を先に見る。送れるなら null）。nowMs は端末の時刻（Rules はサーバーの時刻で見るので、ずれは Rules が拒否する）
 */
export function consultBlock(p: Pick<ProjectDoc, 'archived' | 'consult'>, nowMs: number): string | null {
  if (p.archived) return 'アーカイブしたプロジェクトには送信できません';
  if ((p.consult?.count ?? 0) >= CONSULT_MAX_MESSAGES) return `このプロジェクトの相談は上限の ${CONSULT_MAX_MESSAGES} 件に達しました。担当者へ別の方法でご連絡ください`;
  if (p.consult && nowMs - Date.parse(p.consult.lastAt) <= CONSULT_MIN_INTERVAL_MS) return '続けて送信できません。少し時間をおいてから、もう一度お試しください';
  return null;
}

/** 画面の共有部品（ChatLog）の形へ */
export function toChatMessage(m: MessageDoc): ChatMessage {
  return { id: m.id, at: m.at, side: m.side, author: m.authorName, text: m.text };
}
