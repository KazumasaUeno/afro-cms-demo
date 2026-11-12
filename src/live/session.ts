import { createContext, useContext } from 'react';

/**
 * live のログイン中の人（accounts/{uid} の写し）。権限の実体は Firestore Rules（ここは表示の出し分けと書き込む値に使う）。
 * 作るのは live/auth.tsx の LiveAuthProvider（Auth と accounts を購読し、active のときだけ値を入れる）
 */
export type LiveRole = 'admin' | 'developer' | 'client';

export interface LiveAccount {
  uid: string;
  role: LiveRole;
  status: 'active' | 'disabled';
  email: string;
  name: string;
  company?: string;
  projectId?: string;
  affiliation?: 'internal' | 'partner';
  partnerCompany?: string;
  devRole?: string;
}

export interface LiveSession {
  uid: string;
  /** ID トークンのメール（Rules の request.auth.token.email。証跡の actorEmail） */
  email: string;
  account: LiveAccount;
}

export const LiveSessionContext = createContext<LiveSession | null>(null);

export function useLiveSession(): LiveSession {
  const s = useContext(LiveSessionContext);
  if (!s) throw new Error('useLiveSession はログイン後の画面（LiveSessionContext の内側）でだけ使う');
  return s;
}
