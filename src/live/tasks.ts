import { DEV_TASK_PAGE_MAX, DEV_TASK_TITLE_MAX, WHOLE_SITE } from '@/data/devTaskLimits';
import type { ReqStatus, TaskDoc, TaskStatus } from './model';
import type { LiveRole } from './session';

/**
 * live の構築タスクの導出（docs/design/LIVE_DASHBOARD_TASKS_CONSULT.md §1.2・§2.1・U2）。画面（LiveTasksPage・ダッシュボードの構築状況）が使う。
 * 権限の実体は firestore.rules の taskCreateOk / taskUpdateOk（作成・状態変更は担当の開発者と admin（全案件。2026-11-26 ADMIN_FULL_RIGHTS_PLAN U5）、削除なし、お客様は読めない）。
 * ここは表示の絞り込みと、Rules に送る前の入力の検査（Rules と同じ条件）だけ
 */

/**
 * 1 案件の購読の上限（orderBy('createdAt', 'desc') limit(300)。§2.1 [TARGET]）。
 * 新しい順に取るので、超えたら出なくなるのは**最も古い**タスク（新しく追加したタスクは必ず出る）。画面で注記する（taskLimitNote）。
 * Rules で件数を数える上限は置かない（2026-11-25 U2 セキュリティレビュー: 件数の上限を Rules で持つには案件文書へカウンタを足す必要があり、
 * 新しい分が消える問題は新しい順の取得だけで解ける＝より簡単で安全な方を選んだ）
 */
export const TASK_LIMIT = 300;

/** 新しい順に取ったタスクを画面の並び（古い順）へ戻す（同じ時刻は ID で安定させる） */
export function newestTasksInOrder<T extends Pick<TaskDoc, 'createdAt' | 'id'>>(newestFirst: readonly T[]): T[] {
  return [...newestFirst].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export const TASK_STATUS_ORDER: readonly TaskStatus[] = ['todo', 'doing', 'review', 'done'];

/** 状態ごとの件数（どの状態も 0 で出す） */
export function taskCounts(tasks: readonly Pick<TaskDoc, 'status'>[]): Record<TaskStatus, number> {
  const out: Record<TaskStatus, number> = { todo: 0, doing: 0, review: 0, done: 0 };
  for (const t of tasks) out[t.status] += 1;
  return out;
}

export const isAssignee = (t: Pick<TaskDoc, 'assigneeUids'>, uid: string) => t.assigneeUids.includes(uid);

/** 「自分の担当のみ」の絞り込み（画面で絞る。§2.1） */
export function visibleTasks<T extends Pick<TaskDoc, 'assigneeUids'>>(tasks: readonly T[], uid: string, mineOnly: boolean): T[] {
  return mineOnly ? tasks.filter((t) => isAssignee(t, uid)) : [...tasks];
}

/** 対象ページの候補（既存タスクのページ。「サイト全体」は選択肢に固定で出すので外す。初出の順） */
export function taskPages(tasks: readonly Pick<TaskDoc, 'page'>[]): string[] {
  return [...new Set(tasks.map((t) => t.page))].filter((p) => p && p !== WHOLE_SITE);
}

const OPEN_ORDER: Record<TaskStatus, number> = { review: 0, doing: 1, todo: 2, done: 3 };

/** ダッシュボードの「あなたのタスク」: 自分の担当で完了していないもの（レビュー待ち → 作業中 → 未着手、同じ状態は更新の新しい順）の上位 n 件 */
export function myOpenTasks(tasks: readonly TaskDoc[], uid: string, n = 3): TaskDoc[] {
  return tasks
    .filter((t) => t.status !== 'done' && isAssignee(t, uid))
    .sort((a, b) => OPEN_ORDER[a.status] - OPEN_ORDER[b.status] || b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, n);
}

/**
 * タスクを追加・状態を変更できるか（画面の出し分け。実体は Rules）。
 * 担当の開発者（memberUids）と admin（全案件。2026-11-26 ADMIN_FULL_RIGHTS_PLAN U5）。お客様は開けない
 */
export function canEditTasks(role: LiveRole, uid: string, memberUids: readonly string[]): boolean {
  return role === 'admin' || (role === 'developer' && memberUids.includes(uid));
}

/**
 * 追加できない理由（追加できるなら null）。担当は memberUids の中だけ（L-5）なので、担当の開発者が 0 人の案件では admin も追加できない
 */
export function addTaskBlock(memberUids: readonly string[]): string | null {
  return memberUids.length ? null : '担当の開発者がいないため、タスクを追加できません。先に「担当を変更」で開発者を割り当ててください。';
}

export interface BuildAction { title: string; cta?: string; to?: string }

/**
 * ダッシュボードの「構築で次にやること」（demo の nextDevAction の live 版。デプロイの記録は live に無いので見ない＝NC-6）。
 * uid: 開発者は自分の担当のレビュー待ちを数える。null（admin。タスクの担当にならない）は案件の全タスクを数える。
 * admin も担当の開発者と同じ操作ができる（2026-11-26 U5）ので、行き先は管理者画面の URL（/tasks・/ai-studio）で出す
 */
export function nextBuildAction(req: ReqStatus, tasks: readonly TaskDoc[], uid: string | null): BuildAction {
  const admin = uid === null;
  const review = tasks.filter((t) => t.status === 'review' && (admin || isAssignee(t, uid))).length;
  const tasksPath = admin ? '/tasks' : '/dev/tasks';
  if (review > 0) {
    return admin
      ? { title: `レビュー待ちのタスクが ${review} 件あります`, cta: 'タスクを見る', to: tasksPath }
      : { title: `レビュー待ちが ${review} 件あります`, cta: 'タスクを見る', to: tasksPath };
  }
  if (req === 'draft') return { title: 'ヒアリングを入力しましょう', cta: 'ヒアリングを開く', to: admin ? '/ai-studio' : '/dev/hearing' };
  if (req === 'analyzed') return { title: '要件定義書はお客様の承認待ちです' };
  if (tasks.length === 0) return { title: '構築タスクを追加しましょう', cta: 'タスクを追加する', to: tasksPath };
  return { title: '今すぐ対応が必要なものはありません' };
}

export interface NewTaskInput { title: string; page: string; assigneeUids: string[] }

/**
 * 追加の入力を保存する形にする（Rules の validTask・taskCreateOk と同じ条件）。通らなければ理由の文を返す。
 * 担当は案件の memberUids の中だけ・重複なし・1〜20 人。題名・ページは trim 後 1〜60 / 1〜40
 */
export function prepareNewTask(input: NewTaskInput, memberUids: readonly string[]): { ok: true; value: NewTaskInput } | { ok: false; reason: string } {
  const title = input.title.trim();
  const page = input.page.trim();
  const assigneeUids = [...new Set(input.assigneeUids)];
  if (!title) return { ok: false, reason: 'タスク名を入力してください' };
  if (title.length > DEV_TASK_TITLE_MAX) return { ok: false, reason: `タスク名は ${DEV_TASK_TITLE_MAX} 文字以内で入力してください` };
  if (!page) return { ok: false, reason: '対象ページを入力してください' };
  if (page.length > DEV_TASK_PAGE_MAX) return { ok: false, reason: `対象ページは ${DEV_TASK_PAGE_MAX} 文字以内で入力してください` };
  if (!assigneeUids.length) return { ok: false, reason: '担当を 1 人以上選んでください' };
  if (assigneeUids.length > 20) return { ok: false, reason: '担当は 20 人までです' };
  if (assigneeUids.some((u) => !memberUids.includes(u))) return { ok: false, reason: 'この案件の担当ではない人は選べません' };
  return { ok: true, value: { title, page, assigneeUids } };
}

/** 上限に達したときの注記（新しい順に取るので、出ないのは古いタスク。§2.1） */
export function taskLimitNote(count: number): string | null {
  return count >= TASK_LIMIT ? `タスクが上限の ${TASK_LIMIT} 件に達しているため、新しい順に ${TASK_LIMIT} 件だけを表示しています（それより古いタスクは表示されません）。` : null;
}
