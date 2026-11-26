/**
 * 相談の会話（ChatLog）を描き直したときのスクロールの決め方（2026-11-25 U3 レビュー Major-1）。
 * - bottom: 一番下へ（最初の表示・会話の切り替え・新しいメッセージが末尾に増えた）。demo の ChatPage はいつもこれ（末尾にしか増えない）
 * - keep: 見ている位置を保つ（「前のメッセージを読む」で古いメッセージだけが先頭に増えた。末尾は同じ）
 * - none: 何もしない（メッセージが変わっていない）
 * 以前の ChatLog は [件数・最後の ID・scrollKey] が変わるたびに一番下へ送っていた。keep 以外はそれと同じ結果になる
 */
export interface ChatLogShape {
  key: string;
  firstId: string | undefined;
  lastId: string | undefined;
  count: number;
}

export type ChatScrollMode = 'bottom' | 'keep' | 'none';

export function chatScrollMode(prev: ChatLogShape | null, next: ChatLogShape): ChatScrollMode {
  if (!prev || prev.key !== next.key) return 'bottom';
  if (prev.lastId !== next.lastId) return 'bottom';
  if (prev.count === next.count && prev.firstId === next.firstId) return 'none';
  // 末尾が同じで、先頭が変わって件数が増えた＝古いメッセージを読み足した
  if (next.count > prev.count && prev.firstId !== next.firstId && prev.count > 0) return 'keep';
  return 'bottom';
}
