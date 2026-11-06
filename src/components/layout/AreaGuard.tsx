import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { areaOf } from './nav';
import { isPublicPath, LOGIN_PATH, useSessions } from '@/services/session';

/**
 * エリア（管理者 / 開発者 / お客様ポータル）ごとのログイン確認。
 * デモのため見た目の制御だけで、セキュリティ境界ではない（データはすべてこのブラウザ内）。
 */
export function AreaGuard({ children }: { children: ReactNode }) {
  const { pathname, search, hash } = useLocation();
  const sessions = useSessions();
  if (isPublicPath(pathname)) return <>{children}</>;
  const area = areaOf(pathname);
  if (sessions[area]) return <>{children}</>;
  const next = encodeURIComponent(`${pathname}${search}${hash}`);
  return <Navigate to={`${LOGIN_PATH[area]}?next=${next}`} replace />;
}
