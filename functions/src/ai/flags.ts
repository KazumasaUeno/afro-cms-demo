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
 * 編集の保存（saveAiDraftEdits）を許すか。編集はアサインされた開発者だけ（admin は不可）なので、
 * 'internal' では「allowlist の案件」だけで判定する（役割の判定は authz 側）。
 * [DECISION backend-engineer U2] 'internal' を「admin だけ」にすると社内試験で編集→承認依頼を通せないため
 */
export function editAllowed(flags: AiFlags, projectId: string): boolean {
  if (flags.mode === 'on') return true;
  if (flags.mode === 'internal') return flags.allowlist.includes(projectId);
  return false;
}
