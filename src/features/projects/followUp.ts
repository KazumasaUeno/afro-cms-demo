import type { Project } from '@/types';
import { PROJECT_LIMITS } from './projectForm';

/**
 * 追加開発（0.31.0。2026-11-13 ユーザー決定「追加開発として起こす」）。
 * 改善の段階の案件の AI 改善提案から、採用する提案を選んで、元の案件とつながった別の案件を作る。
 * 元の案件は運用・改善のまま（アクセスの数値・診断も続く）。小さな修正は従来どおり CMS で行う（この仕組みは使わない）
 */

export const FOLLOW_UP_SUFFIX = '追加開発';

/**
 * 追加開発の案件のサイト名。「（元の案件） 追加開発」、同じ名前の案件があれば「追加開発 2」「追加開発 3」…。
 * サイト名の上限（40 文字）を超えるときは、元の案件の名前の後ろを削る（編集の入力チェックで止まらないように）
 */
export function followUpName(parent: Project, projects: Project[]): string {
  const taken = new Set(projects.map((p) => p.siteName));
  for (let n = 1; ; n++) {
    const suffix = ` ${FOLLOW_UP_SUFFIX}${n === 1 ? '' : ` ${n}`}`;
    const name = `${parent.siteName.slice(0, Math.max(1, PROJECT_LIMITS.siteName - suffix.length))}${suffix}`;
    if (!taken.has(name)) return name;
  }
}

/** その案件から起こした追加開発の案件（一覧の並び順） */
export const followUpsOf = (projects: Project[], id: string): Project[] => projects.filter((p) => p.parentProjectId === id);
