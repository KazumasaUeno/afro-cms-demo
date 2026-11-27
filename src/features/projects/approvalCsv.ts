import type { ApprovalLog } from '@/types';
import { jstStamp } from '@/services/csv';

/**
 * 承認の履歴（ApprovalHistory）の立場の名前と CSV の行（ApprovalHistory.tsx から分けた。React を import しない＝tests/unit が直接読む）。
 * 代理承認の理由・スケジュールの取り下げ／再計画の理由（live だけ。LIVE_SCHEDULE_PLAN L-8・U4）を操作の欄に足す
 */

export const SIDE_LABEL: Record<ApprovalLog['side'], string> = { client: 'お客様', afro: 'アフロ' };

/** CSV の操作の欄に足す代理承認の理由（代理でなければ空） */
const proxyCsv = (p: ApprovalLog['proxy']) => (p ? `（代理の理由：${p.note}${p.sameAsRequester ? '・確認の依頼と同じ人が代理で承認' : ''}）` : '');

/** CSV の操作の欄に足すスケジュールの取り下げ・再計画の理由（無ければ空。OQ-D1・L-8） */
const noteCsv = (note: ApprovalLog['note']) => (note ? `（理由：${note}）` : '');

/** 見出しつきの CSV の行（toCsv に渡す） */
export function approvalCsvRows(logs: readonly ApprovalLog[]): string[][] {
  return [
    ['日時（日本時間）', '立場', '操作した人', '操作', '対象'],
    ...logs.map((l) => [jstStamp(l.at), SIDE_LABEL[l.side], l.actor, l.action + proxyCsv(l.proxy) + noteCsv(l.note), l.target]),
  ];
}
