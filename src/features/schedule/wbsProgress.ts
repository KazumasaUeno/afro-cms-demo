import type { DemoState, DevTask, WbsId, WbsItem } from '@/types';
import { devOf, devTeamOf } from '@/store/projectWork';
import { personById } from '@/data/people';
import { isoToYmd } from '@/features/projects/projectForm';
import { stageApprovals } from '@/features/portal/portalSteps';
import { qualityCompletion } from '@/features/projects/projectHelpers';
import { shiftYmd, wbsOf } from '@/data/schedule';

/**
 * WBS の実績（2026-11-17 ユーザー指示「作ってみて」）。実績は保存せず、制作データから毎回導く。
 * 予定（WBS の開始・終了）と並べて、遅れが一目で分かるようにする
 */

export type WbsStatus = 'done' | 'doing' | 'todo' | 'late';

export const WBS_STATUS_LABEL: Record<WbsStatus, string> = { done: '完了', doing: '進行中', todo: '未着手', late: '遅れ' };

export interface WbsRow extends WbsItem {
  /** 実績の割合（0-100） */
  percent: number;
  done: boolean;
  status: WbsStatus;
  /** 構築の行だけ: 構築タスクの完了数 / 全数 */
  tasks?: { done: number; total: number; list: DevTask[] };
}

/** WBS の初期値の開始日: 要件定義書の承認の翌日（無ければ日程を保存した日） */
export function wbsStartOf(state: DemoState): string {
  const approved = state.requirements.approvedAt;
  return approved ? shiftYmd(isoToYmd(approved), 1) : isoToYmd(state.schedule?.savedAt ?? new Date().toISOString());
}

/** WBS の担当の初期値: 案件の開発担当の 1 人目（いなければ空） */
export function wbsDefaultAssignee(state: DemoState): string | undefined {
  const id = devTeamOf(state, state.requirements.projectId)[0];
  return personById(state, id)?.name;
}

/** いまの案件の WBS（日程が無ければ空） */
export function currentWbs(state: DemoState): WbsItem[] {
  return state.schedule ? wbsOf(state.schedule, wbsStartOf(state), wbsDefaultAssignee(state)) : [];
}

/** 作業ごとの実績（完了か・割合） */
function actualOf(state: DemoState, id: WbsId): { done: boolean; percent: number; tasks?: WbsRow['tasks'] } {
  const d = state.design;
  const bin = (done: boolean) => ({ done, percent: done ? 100 : 0 });
  switch (id) {
    case 'sitemap': return bin(!!state.sitemap.approvedAt);
    case 'design': return bin(!!d.approvedAt);
    case 'build': {
      const list = devOf(state, state.requirements.projectId).tasks;
      const doneCount = list.filter((t) => t.status === 'done').length;
      const done = !!d.buildCompletedAt;
      const percent = done ? 100 : list.length === 0 ? 0 : Math.round((doneCount / list.length) * 100);
      return { done, percent, tasks: { done: doneCount, total: list.length, list } };
    }
    case 'buildApproval': return bin(!!stageApprovals(state).build);
    case 'quality': {
      const done = !!d.qualityApprovedAt;
      return { done, percent: done ? 100 : qualityCompletion(state.qualityChecks).percent };
    }
    case 'release': {
      const stage = state.projects.find((p) => p.id === state.requirements.projectId)?.stage;
      return bin(stage === 'operation' || stage === 'improvement');
    }
  }
}

/** 状態: 完了 / 遅れ（今日が終了日より後で未完了）/ 進行中（開始日を過ぎた・実績がある）/ 未着手 */
export function statusOf(item: WbsItem, actual: { done: boolean; percent: number }, today: string): WbsStatus {
  if (actual.done) return 'done';
  if (today > item.end) return 'late';
  if (today >= item.start || actual.percent > 0) return 'doing';
  return 'todo';
}

export function wbsRows(state: DemoState, items: WbsItem[], today: string): WbsRow[] {
  return items.map((w) => {
    const a = actualOf(state, w.id);
    return { ...w, ...a, status: statusOf(w, a, today) };
  });
}
