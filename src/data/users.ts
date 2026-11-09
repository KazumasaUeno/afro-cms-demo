import type { ClientAccount, ClientAccountStatus, DevAffiliation, DevUser, Project } from '@/types';
import { MEMBERS } from './members';
import { daysAgo, hoursAgo } from '@/services/time';

/**
 * ユーザー管理（お客様アカウント・開発者画面の権限）。
 * デモのため、ログイン画面での照合と画面の出し分けだけを行う。セキュリティ境界ではない（データはすべてこのブラウザ内）。
 */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** メールアドレスは前後の空白を除き、小文字にそろえて扱う（重複の判定・ログインの照合を同じ形で行う） */
export const normalizeEmail = (v: string) => v.trim().toLowerCase();

export const CLIENT_LIMITS = { company: 40, name: 30, email: 254 } as const;

export const CLIENT_STATUS: Record<ClientAccountStatus, { label: string; tone: 'info' | 'success' | 'neutral' }> = {
  invited: { label: '招待中', tone: 'info' },
  active: { label: '有効', tone: 'success' },
  disabled: { label: '無効', tone: 'neutral' },
};

/** 登録・編集ダイアログの入力 */
export interface ClientAccountDraft {
  id?: string;
  company: string;
  name: string;
  email: string;
  projectId: string;
}
export type ClientField = 'company' | 'name' | 'email' | 'projectId';

/** 画面と reducer の両方で使う入力チェック（重複は id が違うアカウントとだけ比べる。無効のアカウントも含める） */
export function validateClientAccount(d: ClientAccountDraft, accounts: ClientAccount[], projects: Project[]): Partial<Record<ClientField, string>> {
  const e: Partial<Record<ClientField, string>> = {};
  const company = d.company.trim();
  const name = d.name.trim();
  const email = normalizeEmail(d.email);
  if (!company) e.company = '会社名を入力してください';
  else if (company.length > CLIENT_LIMITS.company) e.company = `${CLIENT_LIMITS.company}文字以内で入力してください`;
  if (!name) e.name = '担当者名を入力してください';
  else if (name.length > CLIENT_LIMITS.name) e.name = `${CLIENT_LIMITS.name}文字以内で入力してください`;
  if (!email) e.email = 'メールアドレスを入力してください';
  else if (email.length > CLIENT_LIMITS.email || !EMAIL_RE.test(email)) e.email = 'メールアドレスの形式が正しくありません（例: name@example.com）';
  else if (accounts.some((a) => a.id !== d.id && a.email === email)) e.email = 'このメールアドレスはすでに登録されています';
  if (!projects.some((p) => p.id === d.projectId)) e.projectId = '担当案件を選んでください';
  return e;
}

export const DEV_USER_LIMITS = { name: 30, role: 24, partnerCompany: 40, email: 254 } as const;

export const DEV_AFFILIATION: Record<DevAffiliation, string> = { internal: '社内', partner: '外部パートナー' };

/** 開発者の登録・編集ダイアログの入力（projectIds は新規登録のときだけ使う。登録後の担当は「担当を変更」で変える） */
export interface DevUserDraft {
  id?: string;
  name: string;
  role: string;
  email: string;
  affiliation: DevAffiliation;
  partnerCompany: string;
  projectIds: string[];
}
export type DevUserField = 'name' | 'role' | 'email' | 'partnerCompany';

/**
 * 画面と reducer の両方で使う開発者の入力チェック。
 * メールアドレスの重複は、固定のメンバー・登録した開発者（自分以外。無効も含む）・お客様アカウントのすべてと比べる（ログイン画面の照合先が 1 人に決まるようにする）
 */
export function validateDevUser(d: DevUserDraft, devUsers: DevUser[], accounts: ClientAccount[]): Partial<Record<DevUserField, string>> {
  const e: Partial<Record<DevUserField, string>> = {};
  const name = d.name.trim();
  const role = d.role.trim();
  const email = normalizeEmail(d.email);
  const company = d.partnerCompany.trim();
  if (!name) e.name = '氏名を入力してください';
  else if (name.length > DEV_USER_LIMITS.name) e.name = `${DEV_USER_LIMITS.name}文字以内で入力してください`;
  if (!role) e.role = '役割を入力してください';
  else if (role.length > DEV_USER_LIMITS.role) e.role = `${DEV_USER_LIMITS.role}文字以内で入力してください`;
  if (!email) e.email = 'メールアドレスを入力してください';
  else if (email.length > DEV_USER_LIMITS.email || !EMAIL_RE.test(email)) e.email = 'メールアドレスの形式が正しくありません（例: name@example.com）';
  else if (MEMBERS.some((m) => normalizeEmail(m.email) === email) || devUsers.some((u) => u.id !== d.id && u.email === email)) e.email = 'このメールアドレスはすでに開発者として登録されています';
  else if (accounts.some((a) => a.email === email)) e.email = 'このメールアドレスはお客様として登録されています。別のメールアドレスを入力してください';
  if (d.affiliation === 'partner') {
    if (!company) e.partnerCompany = 'パートナーの会社名を入力してください';
    else if (company.length > DEV_USER_LIMITS.partnerCompany) e.partnerCompany = `${DEV_USER_LIMITS.partnerCompany}文字以内で入力してください`;
  }
  return e;
}

/** 初期のお客様アカウント（架空。MINAMO COFFEE の担当者はお客様ポータルのデモ用アカウントと同じ） */
export function seedClientAccounts(): ClientAccount[] {
  return [
    { id: 'ca1', company: '株式会社ミナモ珈琲', name: 'ミナモ珈琲 担当者', email: 'tanaka@minamo-coffee.example', projectId: 'p1', status: 'active', createdAt: daysAgo(21), activatedAt: daysAgo(20) },
    { id: 'ca2', company: '北条建設株式会社', name: '北条 健一', email: 'hojo@hojo-kensetsu.example', projectId: 'p2', status: 'invited', createdAt: hoursAgo(26) },
    { id: 'ca3', company: 'Lumière Atelier', name: '白石 真央', email: 'shiraishi@lumiere-bridal.example', projectId: 'p4', status: 'invited', createdAt: daysAgo(3) },
  ];
}

/** 初期の開発者画面の権限（上野・黒田のみ） */
export function seedDevAccess(): Record<string, boolean> {
  return Object.fromEntries(MEMBERS.map((m) => [m.id, m.id === 'm1' || m.id === 'm3']));
}

/** 初期の開発担当（黒田は MINAMO COFFEE と北条建設、上野は MINAMO COFFEE。ほかは未担当） */
export function seedDevProjects(): Record<string, string[]> {
  return Object.fromEntries(MEMBERS.map((m) => [m.id, m.id === 'm3' ? ['p1', 'p2'] : m.id === 'm1' ? ['p1'] : []]));
}

export const accountByEmail = (accounts: ClientAccount[], email: string) => {
  const e = normalizeEmail(email);
  return accounts.find((a) => a.email === e);
};
