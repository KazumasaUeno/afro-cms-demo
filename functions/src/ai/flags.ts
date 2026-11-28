/**
 * AI 下書きの機能フラグ（実装計画 §5。サーバーが正。画面の VITE_FEATURE_AI_REQUIREMENTS は表示だけ）。
 * - AI_REQUIREMENTS_MODE: 'off' | 'internal' | 'on'。未設定・空・それ以外は 'off'（コードの既定も 'off'）
 * - AI_REQUIREMENTS_PROJECT_ALLOWLIST: 'internal' のときに使える案件 ID（カンマ区切り）。空なら 'internal' でも全部拒否
 * - 値の置き場は functions/.env.<projectId>（秘密ではない値だけ。U5）。ファイルが無くても 'off'
 * - 判定は callable の最初（上限の加算より前）と worker の開始時の両方
 */
import { defineString } from 'firebase-functions/params';

export type AiMode = 'off' | 'internal' | 'on';

export const AI_MODE_DEFAULT: AiMode = 'off';

const modeParam = defineString('AI_REQUIREMENTS_MODE', { default: AI_MODE_DEFAULT });
const allowlistParam = defineString('AI_REQUIREMENTS_PROJECT_ALLOWLIST', { default: '' });

/**
 * サイトマップの AI 下書きのフラグ（LIVE_SITEMAP_AI.md §7・IMPL_PLAN §4 U-F2）。意味は要件定義書と同じ（off / internal / on。未設定・不明は off）。
 * 要件定義書のフラグとは別の値（AI_REQUIREMENTS_MODE の意味と判定は変えない）。'on' は deploy-firebase.mjs が法務の記録の行 'AI-SCOPE: sitemap' を要求する。
 * 置き場は functions/.env.<projectId>（非対話デプロイで値が要るため off も明示する）
 */
const sitemapModeParam = defineString('AI_SITEMAP_MODE', { default: AI_MODE_DEFAULT });
const sitemapAllowlistParam = defineString('AI_SITEMAP_PROJECT_ALLOWLIST', { default: '' });

/**
 * 生成する提案の版（REQUIREMENTS_DOC_TEMPLATE.md §7 Rollback「プロンプト版を設定で選ぶ」）。
 * - AI_REQUIREMENTS_PROPOSAL_VERSION: '2'（PRM-REQ-001@1.0.0・今の 4 節の形）| '3'（PRM-REQ-001@2.0.0・会社標準ひな型の章立て）
 * - 未設定・それ以外は 2（fail-closed。v3 の表示（U4）と Rules（U3）が揃うまで 3 にしない）。値の置き場は functions/.env.<projectId>
 * - callable（configHash）と worker（生成器）の両方がこの値を読む。版が変わると configHash が変わるので、同じ回答でも作り直せる
 */
export const PROPOSAL_VERSION_DEFAULT = 2 as const;
const proposalVersionParam = defineString('AI_REQUIREMENTS_PROPOSAL_VERSION', { default: String(PROPOSAL_VERSION_DEFAULT) });
export type ProposalVersion = 2 | 3;

export function parseProposalVersion(raw: unknown): ProposalVersion {
  const v = typeof raw === 'string' ? raw.trim() : typeof raw === 'number' ? String(raw) : '';
  return v === '3' ? 3 : 2;
}

/** 実行時の値（関数の中でだけ呼ぶ） */
export function readProposalVersion(): ProposalVersion {
  return parseProposalVersion(proposalVersionParam.value());
}

export interface AiFlags {
  mode: AiMode;
  allowlist: string[];
}

/** 文字列を AiMode にする（知らない値は 'off'。fail-closed） */
export function parseMode(raw: unknown): AiMode {
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return v === 'internal' || v === 'on' ? v : 'off';
}

export function parseAllowlist(raw: unknown): string[] {
  if (typeof raw !== 'string') return [];
  return [...new Set(raw.split(',').map((s) => s.trim()).filter((s) => /^[A-Za-z0-9_-]{1,128}$/.test(s)))];
}

/** 実行時の値（関数の中でだけ呼ぶ。読み込み時に .value() を呼ばない） */
export function readFlags(): AiFlags {
  return { mode: parseMode(modeParam.value()), allowlist: parseAllowlist(allowlistParam.value()) };
}

/** サイトマップの AI のフラグ（関数の中でだけ呼ぶ）。判定は generationAllowed をそのまま使う */
export function readSitemapFlags(): AiFlags {
  return { mode: parseMode(sitemapModeParam.value()), allowlist: parseAllowlist(sitemapAllowlistParam.value()) };
}

export type FlagRole = 'admin' | 'developer' | 'client' | 'none';

/**
 * 生成（requestRequirementsDraft と worker）を許すか。
 * 'internal' は admin かつ allowlist の案件だけ（社内の試験用案件。合成データだけ）
 */
export function generationAllowed(flags: AiFlags, role: FlagRole, projectId: string): boolean {
  if (flags.mode === 'on') return true;
  if (flags.mode === 'internal') return role === 'admin' && flags.allowlist.includes(projectId);
  return false;
}

/**
 * 編集の保存（saveAiDraftEdits）を許すか。役割（admin・アサインされた開発者。2026-11-26 に admin を追加）の判定は authz 側なので、
 * 'internal' では「allowlist の案件」だけで判定する（役割の判定は authz 側）。
 * [DECISION backend-engineer U2] 'internal' を「admin だけ」にすると社内試験で編集→承認依頼を通せないため
 */
export function editAllowed(flags: AiFlags, projectId: string): boolean {
  if (flags.mode === 'on') return true;
  if (flags.mode === 'internal') return flags.allowlist.includes(projectId);
  return false;
}
