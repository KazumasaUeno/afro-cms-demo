import type { ChatMessage, DemoState } from '@/types';
import { hoursAgo } from '@/services/time';
import { memberById } from './members';

/**
 * 担当者への相談チャット（0.38.0。案件ごとに 1 本の会話。2026-11-16 ユーザー指示）。
 * - お客様ポータル（/portal/chat）: お客様が担当者に相談する
 * - 管理者画面（/chat）・開発者画面（/dev/chat）: アフロ側が同じ会話を見て返信する
 * デモのため、このブラウザの中だけに保存する（実際の送信・通知はしない。live の repositories には無い）。
 * 保存データに無い案件は、担当者のあいさつ 1 件の見本から始まる（最初に送ったときに保存する）
 */
export const CHAT_LIMITS = { text: 1000, messages: 200 } as const;

/** 送る文の検査（エラーの文。問題なければ null）。画面と reducer の両方で使う */
export function validateChat(text: string): string | null {
  const t = text.trim();
  if (!t) return 'メッセージを入力してください';
  if (t.length > CHAT_LIMITS.text) return `メッセージは${CHAT_LIMITS.text}文字以内にしてください`;
  return null;
}

// 見本は描画のたびに作り直さない（日時・id を同じにする）。案件ごとに 1 回だけ作る
const seedCache = new Map<string, ChatMessage[]>();

function seedChat(state: Pick<DemoState, 'projects'>, projectId: string): ChatMessage[] {
  const p = state.projects.find((x) => x.id === projectId);
  if (!p) return [];
  const owner = memberById(p.ownerId);
  return [{
    id: `chat-${projectId}-seed`, at: hoursAgo(48), side: 'afro', author: owner.name,
    text: `${p.clientName} ご担当者様\nアフロ株式会社の${owner.name}です。制作についてのご質問・ご相談は、こちらからお気軽にお送りください。`,
  }];
}

/** 案件の会話（古い順。保存に無ければ見本） */
export function chatOf(state: Pick<DemoState, 'chats' | 'projects'>, projectId: string): ChatMessage[] {
  const saved = state.chats?.[projectId];
  if (saved) return saved;
  let seeded = seedCache.get(projectId);
  if (!seeded) {
    seeded = seedChat(state, projectId);
    seedCache.set(projectId, seeded);
  }
  return seeded;
}
