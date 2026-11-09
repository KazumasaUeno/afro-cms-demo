import type { DemoState, Member, Project } from '@/types';
import { MEMBERS, memberById } from '@/data/members';
import { DEV_USER_ID } from '@/data/dev';
import { normalizeEmail } from '@/data/users';
import { useSessions } from '@/services/session';
import { devProjectsState, useDemo } from '@/store/DemoStore';

/**
 * 開発者画面にログインしているメンバー。ログインしたメールアドレスから探す。
 * メンバーに当たらないメール（デモの初期セッションなど）は、従来どおり DEV_USER_ID（黒田）とみなす
 */
export function devMemberFor(email: string | undefined): Member {
  const e = email ? normalizeEmail(email) : '';
  return MEMBERS.find((m) => m.email && normalizeEmail(m.email) === e) ?? memberById(DEV_USER_ID);
}

export function useDevUser(): Member {
  return devMemberFor(useSessions().dev?.email);
}

/** メンバーが担当するプロジェクト（プロジェクト一覧の並び順） */
export function devProjectsOf(state: DemoState, memberId: string): Project[] {
  const ids = devProjectsState(state)[memberId] ?? [];
  return state.projects.filter((p) => ids.includes(p.id));
}

/** 開発者画面にログインしているメンバーの担当プロジェクト */
export function useDevProjects(): Project[] {
  const me = useDevUser();
  const { state } = useDemo();
  return devProjectsOf(state, me.id);
}
