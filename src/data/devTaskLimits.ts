/**
 * 構築タスクの文字数の上限（demo の追加ダイアログ・reducer と、live の Firestore Rules の両方の正）。
 * firestore.rules の reTaskTitle() / reTaskPage() は scripts/gen-rules-questions.mjs がここから作る（npm run rules:gen）。
 * 依存の無い単独のファイルにしておく（生成スクリプトが Node の型除去で直接読むため）
 */
export const DEV_TASK_TITLE_MAX = 60;
/** 対象ページ名の上限（live はサイトマップが無いので自由入力。docs/design/LIVE_DASHBOARD_TASKS_CONSULT.md §2.1） */
export const DEV_TASK_PAGE_MAX = 40;

/** ページに紐づかないタスク（共通部品・環境の準備など）の「対象ページ」（demo の追加ダイアログと live で共通） */
export const WHOLE_SITE = 'サイト全体';
