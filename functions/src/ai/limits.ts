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
