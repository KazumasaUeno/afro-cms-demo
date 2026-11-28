/**
 * AI 下書きの上限と時間の定数（実装計画 L-d: 上限値はここ 1 箇所。変更はユーザー確認）。
 * - 回数（Q-2 の推奨案。ユーザー承認 2026-11-20）: 案件 5 回/日・20 回/月、利用者 10 回/日、全体 200 回/月。全体の日次上限は持たない（L-d）
 * - 日付は JST（quota.ts）
 */
export const AI_QUOTA = {
  projectPerDay: 5,
  projectPerMonth: 20,
  userPerDay: 10,
  globalPerMonth: 200,
} as const;

/** callable が付ける lease（設計 §2.1: now + 630 秒）と、worker の開始時に延ばす長さ（540 + 30 秒） */
export const AI_LEASE = {
  requestSeconds: 630,
  workerSeconds: 540 + 30,
} as const;

/** worker（onTaskDispatched）の設定（設計 §2.2） */
export const AI_WORKER = {
  timeoutSeconds: 540,
  memory: '512MiB',
  maxInstances: 2,
  maxConcurrentDispatches: 2,
  /** Cloud Tasks がワーカーの応答を待つ時間（timeoutSeconds 以上） */
  dispatchDeadlineSeconds: 600,
} as const;

/** サイト取得の上限（設計 §3） */
export const SITE_LIMITS = {
  connectMs: 5_000,
  totalMs: 10_000,
  /** 展開後のバイト数（gzip bomb 対策。受信した生のバイト数も同じ上限） */
  maxBytes: 2 * 1024 * 1024,
  maxRedirects: 3,
  /** AI へ渡す本文の最大文字数 */
  maxTextChars: 12_000,
  maxNavLinks: 50,
  userAgent: 'AfroCMS-SiteCheck/1.0',
} as const;

/**
 * 基本チェックの合格の目安 [TARGET: 根拠のない目安。お客様へは「基本チェック m/n 項目」としてだけ出す]
 */
export const SITE_CHECK_THRESHOLDS = {
  titleMin: 10,
  titleMax: 60,
  /** alt の無い画像の割合（%）の上限 */
  altMissingMaxPercent: 10,
  pageMaxBytes: 1_000_000,
  responseMaxMs: 1_500,
} as const;

/**
 * 出力トークンの上限（max_tokens）を提案の版ごとに（REQUIREMENTS_DOC_TEMPLATE.md §4.2）。
 * v2 は DEFAULT_AI_CONFIG.maxTokens と同じ 12,000（変えない）。v3 はひな型の項目の文が増えるので 24,000（設計の最悪の見込み）。
 * 上げ下げは費用の上限に効く（1 回の最悪 = 出力 24,000 × 出力単価。pricing.json）。変更はユーザー確認
 */
export const AI_MAX_TOKENS = {
  v2: 12_000,
  v3: 24_000,
  /** サイトマップの AI 下書き（LIVE_SITEMAP_AI.md §5・IMPL_PLAN P-9。最悪 1 回 約 $0.12。評価（L-5）の p99 で見直す。上げるならユーザー確認） */
  sitemap: 8_000,
} as const;

/**
 * サイトマップの AI 下書きの回数の上限（ユーザー決定 OQ-N3 2026-11-28）: 案件 5/日・20/月・利用者 10/日は要件定義書と**別枠**（値は同じ）。
 * 全体 200 回/月は AI_QUOTA.globalPerMonth を**共用**（aiUsage.count。ここには持たない）
 */
export const AI_QUOTA_SITEMAP = {
  projectPerDay: 5,
  projectPerMonth: 20,
  userPerDay: 10,
} as const;

/** サイトマップの AI へ送る量と出力の上限（LIVE_SITEMAP_AI.md §1.1・§3.2 [TARGET]。ページ数は SITEMAP_LIMITS.aiPages と同じ 30） */
export const SITEMAP_AI_LIMITS = {
  /** 改善後のページ（トップを含む） */
  afterPages: 30,
  /** 要件定義書から送る文字の合計 */
  requirementsChars: 8_000,
  /** 回答 1 問あたりの文字 */
  answerChars: 1_000,
  /** 現行サイトのナビ（件） */
  navItems: 50,
  summary: 300,
  reason: 140,
  issue: 140,
  openQuestions: 5,
  openQuestion: 200,
} as const;
