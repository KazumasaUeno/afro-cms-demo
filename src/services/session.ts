/**
 * デモのログイン状態（立場＝エリアごと）。
 * - 実際の認証は行わない。どのエリアに「ログイン済み」かだけをこのブラウザに保存する
 * - デモデータ（DemoState）とは別のキーに置く。「デモを初期化」してもログアウトしない
 */
import { useSyncExternalStore } from 'react';
import { loadJson, saveJson } from './storage';
import { AREAS, areaOf, type AreaId } from '@/components/layout/nav';

export const SESSION_KEY = 'afro-cms-demo:session';

export interface AreaSession { loggedInAt: string; email: string }
export type Sessions = Partial<Record<AreaId, AreaSession>>;

const EVENT = 'afro-cms-demo:session-change';

function isSessions(v: unknown): v is Sessions {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  return Object.entries(v as Record<string, unknown>).every(([k, s]) =>
    k in AREAS && !!s && typeof s === 'object'
    && typeof (s as AreaSession).loggedInAt === 'string' && typeof (s as AreaSession).email === 'string');
}

// useSyncExternalStore は同じ参照を返す必要があるので、生の文字列が変わったときだけ作り直す
let cacheRaw: string | null | undefined;
let cache: Sessions = {};
function read(): Sessions {
  let raw: string | null = null;
  try { raw = window.localStorage.getItem(SESSION_KEY); } catch { raw = null; }
  if (raw === cacheRaw) return cache;
  cacheRaw = raw;
  cache = loadJson(SESSION_KEY, isSessions) ?? {};
  return cache;
}

function write(next: Sessions) {
  saveJson(SESSION_KEY, next);
  window.dispatchEvent(new Event(EVENT));
}

export function loginArea(area: AreaId, email: string) {
  write({ ...read(), [area]: { loggedInAt: new Date().toISOString(), email } });
}

export function logoutArea(area: AreaId) {
  const next = { ...read() };
  delete next[area];
  write(next);
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener('storage', cb);
  };
}

export function useSessions(): Sessions {
  return useSyncExternalStore(subscribe, read, () => ({}));
}

/** エリアごとのログイン画面のパス */
export const LOGIN_PATH: Record<AreaId, string> = { admin: '/login', dev: '/dev/login', portal: '/portal/login' };

/** ログイン不要のパス（ログイン画面そのものと、旧 /cms の転送） */
export function isPublicPath(pathname: string): boolean {
  // 末尾の「/」は同じパスとして扱う（/login/ を戻り先として通さない）
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return Object.values(LOGIN_PATH).includes(p) || p === '/cms' || p.startsWith('/cms/');
}

/**
 * ログイン後の戻り先として安全か。
 * 同じエリアのアプリ内パスだけを許す（`//evil.com`・`\\`・スキーム付き・別エリア・ログイン画面は捨てる）
 */
export function safeNext(area: AreaId, next: string | null): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return null;
  let url: URL;
  try {
    url = new URL(next, 'https://app.invalid');
  } catch {
    return null;
  }
  if (url.origin !== 'https://app.invalid') return null;
  if (isPublicPath(url.pathname) || areaOf(url.pathname) !== area) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}
