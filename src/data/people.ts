import type { DemoState, DevAffiliation, DevUser, Member } from '@/types';
import { MEMBERS } from './members';
import { normalizeEmail } from './users';

/**
 * 開発者画面に関わる人（固定のメンバー MEMBERS ＋ 管理者が登録した開発者 devUsers）を 1 か所で引く。
 * ログイン可否・ログイン中の人・担当プロジェクト・アクティビティの操作者・プロジェクト詳細の開発担当はここを通す。
 * memberById は固定のメンバー専用のまま（ディレクター・ページの作成者・構築タスクの担当など）
 */
export interface DevPerson extends Member {
  /** member=固定のメンバー（編集・無効化できない） / registered=ユーザー管理で登録した開発者 */
  kind: 'member' | 'registered';
  affiliation: DevAffiliation;
  partnerCompany?: string;
  /** 管理者が無効にした（ログインできない） */
  disabled: boolean;
  createdAt?: string;
}

/** 0.15.0 より前の保存データには無い。描画のたびに作り直さないよう同じ空配列を返す */
const NO_DEV_USERS: DevUser[] = [];
export function devUsersState(state: DemoState): DevUser[] {
  return state.devUsers ?? NO_DEV_USERS;
}

/** 登録した開発者のアバター色（白い文字が読める濃さの色から id で選ぶ。固定のメンバーの色とは重ねない） */
const DEV_USER_COLORS = ['#2563EB', '#0F766E', '#7C3AED', '#B45309', '#BE185D', '#475569'];

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const latin = /^[A-Za-z]/.test(parts[0]);
  if (parts.length >= 2) return latin ? (parts[0][0] + parts[1][0]).toUpperCase() : parts[0][0];
  return latin ? parts[0].slice(0, 2).toUpperCase() : parts[0][0];
}

function colorOf(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return DEV_USER_COLORS[h % DEV_USER_COLORS.length];
}

const fromMember = (m: Member): DevPerson => ({ ...m, kind: 'member', affiliation: 'internal', disabled: false });
const MEMBER_PEOPLE: DevPerson[] = MEMBERS.map(fromMember);

export function devUserToPerson(u: DevUser): DevPerson {
  return {
    id: u.id, name: u.name, role: u.role, email: u.email, color: colorOf(u.id), initials: initialsOf(u.name),
    kind: 'registered', affiliation: u.affiliation, partnerCompany: u.partnerCompany, disabled: u.status === 'disabled', createdAt: u.createdAt,
  };
}

// devUsers の配列ごとに 1 回だけ作る（同じ state なら同じ配列を返す）
const cache = new WeakMap<DevUser[], DevPerson[]>();

/** 固定のメンバー → 登録した開発者（登録の古い順）の順に並べる。無効の人も含む */
export function allDevPeople(state: DemoState): DevPerson[] {
  const users = devUsersState(state);
  if (!users.length) return MEMBER_PEOPLE;
  let list = cache.get(users);
  if (!list) {
    list = [...MEMBER_PEOPLE, ...users.map(devUserToPerson)];
    cache.set(users, list);
  }
  return list;
}

export function personById(state: DemoState, id: string | undefined): DevPerson | undefined {
  return id ? allDevPeople(state).find((p) => p.id === id) : undefined;
}

export function personByEmail(state: DemoState, email: string | undefined): DevPerson | undefined {
  const e = email ? normalizeEmail(email) : '';
  return e ? allDevPeople(state).find((p) => normalizeEmail(p.email) === e) : undefined;
}
