import type { DemoState } from '@/types';
import { chatOf } from '@/data/chat';

/**
 * 相談チャットの「未対応」（2026-11-17 会議: 開発者が複数の案件を持つと、どこに相談が来たか分からないため）。
 * 未対応 = その案件の会話の最後のメッセージがお客様（side === 'client'）。アフロ側が返信すると消える。
 * 既読の状態は持たない（「対応済みにする」操作も無い）。会話が無い案件は見本（担当者のあいさつ）なので未対応にならない。
 * 開発者画面の相談（features/chat/ChatPage）と、サイドバーの件数バッジで使う。
 */
export function unansweredOf(state: Pick<DemoState, 'chats' | 'projects'>, projectId: string): boolean {
  const messages = chatOf(state, projectId);
  return messages.length > 0 && messages[messages.length - 1].side === 'client';
}

/**
 * 未対応の案件の数（メッセージの数ではない）。
 * projectIds を渡すとその案件だけ。省略時は全案件。
 * 開発者画面は、ログイン中の人が担当ディレクターの案件（useDirectorProjects() の id）を渡す
 * （2026-11-17 ユーザー指示「担当ディレクターがチャット対応できる」。開発担当だけの案件は閲覧のみなので数えない）
 */
export function unansweredCount(state: Pick<DemoState, 'chats' | 'projects'>, projectIds?: string[]): number {
  const ids = projectIds ?? state.projects.map((p) => p.id);
  return ids.filter((id) => unansweredOf(state, id)).length;
}
