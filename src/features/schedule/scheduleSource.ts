import type { ReactNode } from 'react';
import type { DemoState, ProjectSchedule, WbsId, WbsItem } from '@/types';
import type { ScheduleDraft, ScheduleErrors, WbsErrors } from '@/data/schedule';
import type { WbsRow } from './wbsProgress';

/**
 * スケジュールの部品（ScheduleView・WbsSection・ProjectScheduleSection）のデータ源（LIVE_SCHEDULE_PLAN §2・L-13・U3-a）。
 * 渡さなければ従来どおり DemoStore（demo の DOM・挙動は変えない）。live は src/live/pages/LiveSchedulePage.tsx が組み立てる。
 * ここは型と React・Firebase に依存しない純関数だけ（demo の build に Firebase を入れない・単体テストが直接読む）
 */

/** 完了印（行ごと。true＝付いている）。build の行は持たない */
export type WbsDone = Partial<Record<WbsId, boolean>>;

export interface WbsSource {
  /** 保存済みの WBS（担当つき・完了印の日時は持たない）。保存が無ければ予定日から導いた初期値 */
  items: WbsItem[];
  /** 保存済みの完了印 */
  done: WbsDone;
  /** 実績（構築タスク・完了印から導く）。done は下書きの完了印 */
  rows: (items: WbsItem[], today: string, done: WbsDone) => WbsRow[];
  /** 入力の検査（live は年の範囲・担当名の文字数も） */
  validate: (items: WbsItem[]) => WbsErrors;
  /** 完了印の最後の操作（行ごとの説明。入力画面に出す） */
  markNote?: Partial<Record<WbsId, string>>;
  /** 保存（成功で true）。token は下書きを始めた時点の版（競合の検出） */
  save?: (items: WbsItem[], done: WbsDone, token: string) => Promise<boolean>;
  /** いまの版（変わったとき、下書きを触っていなければ追従する） */
  token: string;
  /** live だけ: 説明の下に出す注意（依頼中に WBS を変えるとき等）。demo は持たない */
  notice?: string;
}

export interface ScheduleSource {
  /** 表示している案件（「プロジェクト詳細」へ戻る先） */
  projectId: string;
  saved: ProjectSchedule | undefined;
  /** 要件定義書が承認済み */
  approved: boolean;
  /** 予定日・メモ・WBS を変えられる */
  editable: boolean;
  /** 変えられないときの説明（live。無ければ demo の「管理者画面は見るだけ」） */
  readOnlyNote?: string;
  /** 予定日の検査 */
  validate: (d: ScheduleDraft) => ScheduleErrors;
  /** 保存（true で入力画面を閉じる）。token は入力を始めた時点の版 */
  save: (draft: ScheduleDraft, token: string) => boolean | Promise<boolean>;
  /** いまの版（入力画面を開いた・◆ を動かし始めた時点の値を save に渡す） */
  token: string;
  /** 「保存済み」の行の右（承認の依頼・取り下げ・代理承認） */
  approval: ReactNode;
  /** demo: 開発者画面の操作者 */
  devBy?: string;
  /** live: WBS のデータ源と表示する案件の state */
  wbs?: WbsSource;
  view?: DemoState;
}

/** 下書きの完了印のうち、保存済みと違う行だけ（saveWbs に渡す形。true＝付ける・false＝外す） */
export function changedDone(draft: WbsDone, saved: WbsDone): WbsDone {
  const out: WbsDone = {};
  const ids = new Set([...Object.keys(draft), ...Object.keys(saved)] as WbsId[]);
  for (const id of ids) if (!!draft[id] !== !!saved[id]) out[id] = !!draft[id];
  return out;
}

/** 完了印が同じか（付いている行の集合で比べる） */
export const sameDone = (a: WbsDone, b: WbsDone): boolean => Object.keys(changedDone(a, b)).length === 0;
