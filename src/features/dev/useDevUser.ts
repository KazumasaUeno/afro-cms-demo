import type { Member } from '@/types';
import { MEMBERS, memberById } from '@/data/members';
import { DEV_USER_ID } from '@/data/dev';
import { normalizeEmail } from '@/data/users';
import { useSessions } from '@/services/session';

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
