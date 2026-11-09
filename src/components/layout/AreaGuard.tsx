import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { areaOf } from './nav';
import { isPublicPath, LOGIN_PATH, useSessions } from '@/services/session';
import { useDemo } from '@/store/DemoStore';
import { isRevoked } from '@/store/access';

/**
 * エリア（管理者 / 開発者 / お客様ポータル）ごとのログイン確認。
 * ユーザー管理で権限を外された・無効にされたメールアドレスのセッションは、そのエリアのログイン画面へ戻す
 * （ログアウトはログイン画面で行う。ここで消すと、消した直後の再描画で「未ログイン」の転送に上書きされ、理由が出せない）。
 * デモのため見た目の制御だけで、セキュリティ境界ではない（データはすべてこのブラウザ内）。
 */
export function AreaGuard({ children }: { children: ReactNode }) {
  const { pathname, search, hash } = useLocation();
  const sessions = useSessions();
  const { state } = useDemo();
  if (isPublicPath(pathname)) return <>{children}</>;
  const area = areaOf(pathname);
  const session = sessions[area];
  const next = encodeURIComponent(`${pathname}${search}${hash}`);
  // 権限を戻して再ログインしたら、元の画面へ戻れるよう next も渡す
  if (session && isRevoked(area, session.email, state)) return <Navigate to={`${LOGIN_PATH[area]}?reason=revoked&next=${next}`} replace />;
  if (session) return <>{children}</>;
  return <Navigate to={`${LOGIN_PATH[area]}?next=${next}`} replace />;
}
