import type { DemoState, Project } from '@/types';
import { DEV_USER_ID } from '@/data/dev';
import { personByEmail, personById, type DevPerson } from '@/data/people';
import { useSessions } from '@/services/session';
import { devProjectsState, useDemo } from '@/store/DemoStore';

/**
 * 開発者画面にログインしている人。ログインしたメールアドレスから、固定のメンバーと登録した開発者の両方を探す（data/people）。
 * どちらにも当たらないメール（デモの初期セッションなど）は、従来どおり DEV_USER_ID（黒田）とみなす
 */
export function devMemberFor(state: DemoState, email: string | undefined): DevPerson {
  return personByEmail(state, email) ?? (personById(state, DEV_USER_ID) as DevPerson);
}

export function useDevUser(): DevPerson {
  const { state } = useDemo();
  return devMemberFor(state, useSessions().dev?.email);
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

/**
 * メンバーが担当ディレクター（Project.ownerId）のプロジェクト（2026-11-17 ユーザー指示「担当ディレクターがチャット対応できる、担当開発者は複数選択可」）。
 * 相談チャットの返信・未対応の数はこの案件だけ。開発担当（devProjects）でなくても、開発者画面の相談（/dev/chat）だけは開ける
 */
export function directorProjectsOf(state: DemoState, memberId: string): Project[] {
  return state.projects.filter((p) => p.ownerId === memberId);
}

/** 開発者画面にログインしているメンバーが担当ディレクターのプロジェクト */
export function useDirectorProjects(): Project[] {
  const me = useDevUser();
  const { state } = useDemo();
  return directorProjectsOf(state, me.id);
}
