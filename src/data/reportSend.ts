import type { ClientAccount, DemoState, DiagnosisReport, ISODate, Project, ReportSendEntry, ReportSendState } from '@/types';
import { daysFromNow } from '@/services/time';
import { clientActorName } from './projects';

/**
 * 改善レポートの自動送信（0.34.0。2026-11-13 ユーザー指示）。デモのため実際のメールは送らず、送信の記録だけ残す。
 * 送るのは 4 か月ごとの AI サイト診断の後（addDiagnosis）。設定は案件ごと（state.reportSend = 選んでいる案件の分）
 */

/** 保存データ・初期データに無い案件は「オン・履歴なし」（以前の画面のスイッチの初期値がオンだったため） */
const DEFAULT: ReportSendState = { enabled: true, history: [] };
export const reportSendOf = (state: Pick<DemoState, 'reportSend'>): ReportSendState => state.reportSend ?? DEFAULT;

/** 送信の履歴に残す件数 */
export const REPORT_SEND_HISTORY_MAX = 50;

/**
 * 宛先。その案件のお客様アカウント（無効にしたものを除く）。アカウントが無い案件（見本の案件の多く）は、
 * 案件のお客様の担当者名だけ（メールアドレスなし。ユーザー管理で登録すると入る）
 */
export function reportRecipients(accounts: ClientAccount[], project: Pick<Project, 'id' | 'clientName'> | undefined): ReportSendEntry['recipients'] {
  if (!project) return [];
  const mine = accounts.filter((a) => a.projectId === project.id && a.status !== 'disabled');
  return mine.length ? mine.map((a) => ({ name: a.name, email: a.email })) : [{ name: clientActorName(project.clientName) }];
}

/**
 * 次の AI サイト診断の予定日（デモの目安。インサイトの「次回（予定）」と同じ）。自動送信はこの診断の後に行う
 */
export const nextDiagnosisAt = (diagnoses: DiagnosisReport[]): ISODate => daysFromNow(diagnoses.length > 1 ? 120 : 18);
