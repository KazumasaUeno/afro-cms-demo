/**
 * 相談チャットの上限（demo の画面・reducer と、live の Firestore Rules の両方の正）。
 * firestore.rules の reMaxChat() は scripts/gen-rules-questions.mjs がここから作る（npm run rules:gen）。
 * 依存の無い単独のファイルにしておく（生成スクリプトが Node の型除去で直接読むため。devTaskLimits.ts と同じ）
 * - text: 1 件の本文（trim 後 1〜1000 字）
 * - messages: demo の保存件数（古い分は捨てる。live は捨てずに CONSULT_MAX_MESSAGES まで）
 */
export const CHAT_LIMITS = { text: 1000, messages: 200 } as const;

/** live の 1 案件のメッセージの上限（firestore.rules consultOk の count <= 5000。docs/design/LIVE_DASHBOARD_TASKS_CONSULT.md §2.2） */
export const CONSULT_MAX_MESSAGES = 5000;

/** live の連投の間隔（同じ案件へ 2 秒に 1 件まで。firestore.rules consultOk の duration.value(2, 's')） */
export const CONSULT_MIN_INTERVAL_MS = 2000;
