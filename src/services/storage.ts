/**
 * localStorage の安全な読み書き。
 * - プライベートモード・容量超過・JSON 破損でも例外を外へ出さない
 * - 形が合わない保存値は捨てて初期値に戻す（validate で判定）
 * Firebase 移行時はこのモジュールと repository（store/）の境界を差し替える。
 */

export const STORAGE_KEY = 'afro-cms-demo:state';

function getStorage(): Storage | null {
  try {
    const s = window.localStorage;
    const probe = '__afro_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export function loadJson<T>(key: string, validate: (v: unknown) => v is T): T | null {
  const s = getStorage();
  if (!s) return null;
  try {
    const raw = s.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return validate(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveJson(key: string, value: unknown): boolean {
  const s = getStorage();
  if (!s) return false;
  try {
    s.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key: string): void {
  const s = getStorage();
  if (!s) return;
  try {
    s.removeItem(key);
  } catch {
    /* 保存できない環境ではメモリ上の状態だけで動く */
  }
}
