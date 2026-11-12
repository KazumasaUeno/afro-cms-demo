import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  createUserWithEmailAndPassword, onAuthStateChanged, sendEmailVerification, signInWithEmailAndPassword, signOut as fbSignOut, type User,
} from 'firebase/auth';
import { doc, getDoc, onSnapshot, serverTimestamp, writeBatch, type DocumentData } from 'firebase/firestore';
import { normalizeEmail } from '@/data/users';
import { auth, db } from './firebase';
import type { LiveAccount, LiveSession } from './session';

/**
 * live のログイン（BACKEND_FIREBASE §2.3〜§2.4）。demo の SESSION_KEY・DemoStore は読まない（C3）。
 * - メール＋パスワード、メール確認必須（Rules が email_verified を要求する）
 * - 確認済みで accounts/{uid} が無ければ、invites/{自分のメール} を読んで 1 つのバッチで受け取る（accounts 作成＋招待を claimed）
 * - accounts を購読し続ける: 無効にされた・メールが一致しない・読めなくなったら、その場でログアウトして理由を出す（§13.3）
 */

export type AuthState =
  | { kind: 'loading' }
  | { kind: 'signedOut'; reason?: string }
  | { kind: 'unverified'; email: string }
  | { kind: 'noInvite'; email: string }
  | { kind: 'active'; session: LiveSession };

interface AuthValue {
  state: AuthState;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  /** 確認メールのリンクを開いた後に押す（ユーザー情報と ID トークンを取り直す） */
  recheck: () => Promise<void>;
  signOut: (reason?: string) => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function useLiveAuth(): AuthValue {
  const v = useContext(AuthContext);
  if (!v) throw new Error('LiveAuthProvider の内側で使う');
  return v;
}

function toAccount(uid: string, d: DocumentData): LiveAccount {
  const opt = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : undefined);
  return {
    uid,
    role: d.role === 'admin' || d.role === 'developer' ? d.role : 'client',
    status: d.status === 'active' ? 'active' : 'disabled',
    email: String(d.email ?? ''),
    name: String(d.name ?? ''),
    company: opt('company'), projectId: opt('projectId'), partnerCompany: opt('partnerCompany'), devRole: opt('devRole'),
    affiliation: d.affiliation === 'internal' || d.affiliation === 'partner' ? d.affiliation : undefined,
  };
}

/** 招待の受け取り（§28.2 claimOk。招待の項目をそのまま写す。値を変えると Rules が拒否する） */
async function claimInvite(user: User): Promise<boolean> {
  const email = user.email ?? '';
  const inv = await getDoc(doc(db, 'invites', email));
  if (!inv.exists()) return false;
  const d = inv.data();
  if (d.status !== 'invited') return false;
  const copy: Record<string, unknown> = { role: d.role, name: d.name };
  for (const k of ['company', 'projectId', 'affiliation', 'partnerCompany', 'devRole']) if (k in d) copy[k] = d[k];
  const batch = writeBatch(db);
  batch.set(doc(db, 'accounts', user.uid), {
    schemaVersion: 1, ...copy, status: 'active', email,
    activatedAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: user.uid,
  });
  batch.update(doc(db, 'invites', email), { status: 'claimed', claimedBy: user.uid, claimedAt: serverTimestamp() });
  await batch.commit();
  return true;
}

export function LiveAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  // 確認メールのリンクを開いた後は User を取り直す（同じ User オブジェクトのままでは描画し直されない）
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<AuthState>({ kind: 'loading' });
  const [reason, setReason] = useState<string | undefined>(undefined);

  useEffect(() => onAuthStateChanged(auth, (u) => setUser(u)), []);

  const signOut = useCallback(async (why?: string) => {
    setReason(why);
    await fbSignOut(auth);
  }, []);

  useEffect(() => {
    if (user === undefined) return undefined;
    if (user === null) {
      setState({ kind: 'signedOut', reason });
      return undefined;
    }
    const email = user.email ?? '';
    if (!user.emailVerified) {
      setState({ kind: 'unverified', email });
      return undefined;
    }
    setState({ kind: 'loading' });
    let alive = true;
    let claiming = false;
    // includeMetadataChanges: 受け取りのバッチは端末側で先に反映される（hasPendingWrites）。サーバーに確定する前に
    // 画面を出すと、他の購読（案件の一覧など）が accounts の無い状態で Rules に評価されて拒否されるので、確定を待つ
    const unsub = onSnapshot(doc(db, 'accounts', user.uid), { includeMetadataChanges: true }, async (s) => {
      if (!alive) return;
      if (s.metadata.hasPendingWrites) return;
      if (!s.exists()) {
        if (claiming) return;
        claiming = true;
        try {
          const ok = await claimInvite(user);
          if (alive && !ok) setState({ kind: 'noInvite', email });
        } catch (e) {
          console.warn('invite claim failed', e);
          if (alive) setState({ kind: 'noInvite', email });
        }
        return;
      }
      const account = toAccount(user.uid, s.data());
      // M-8: Auth 側のメールと accounts のメールが違えば Rules はすべて拒否する。画面も同じ扱い
      if (account.status !== 'active' || account.email !== email) {
        void signOut(account.status !== 'active' ? 'このアカウントは管理者が無効にしました。アフロの担当者にお問い合わせください' : 'アカウントの情報が一致しないためログアウトしました');
        return;
      }
      setReason(undefined);
      setState({ kind: 'active', session: { uid: user.uid, email, account } });
    }, (e) => {
      console.warn('account listener failed', e);
      if (alive) void signOut('権限を確認できなかったためログアウトしました。もう一度ログインしてください');
    });
    return () => {
      alive = false;
      unsub();
    };
    // reason は signedOut の表示にだけ使う（変わっても購読し直さない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, tick, signOut]);

  const value = useMemo<AuthValue>(() => ({
    state,
    signIn: async (email, password) => {
      setReason(undefined);
      await signInWithEmailAndPassword(auth, normalizeEmail(email), password);
    },
    signUp: async (email, password) => {
      setReason(undefined);
      // 招待の文書 ID は小文字のメール。登録の前に小文字にそろえる（§28.2 大文字混在のメール）
      const cred = await createUserWithEmailAndPassword(auth, normalizeEmail(email), password);
      await sendEmailVerification(cred.user);
    },
    resendVerification: async () => {
      if (auth.currentUser) await sendEmailVerification(auth.currentUser);
    },
    recheck: async () => {
      const u = auth.currentUser;
      if (!u) return;
      await u.reload();
      // Rules は ID トークンの email_verified を見るので、トークンも取り直す
      await u.getIdToken(true);
      setUser(auth.currentUser);
      setTick((n) => n + 1);
    },
    signOut,
  }), [state, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Firebase Auth のエラーを画面の文言に（どのメールが登録済みかを推測させない言い方にする） */
export function authErrorMessage(e: unknown): string {
  const code = typeof e === 'object' && e && 'code' in e ? String((e as { code: unknown }).code) : '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      return 'メールアドレスまたはパスワードが正しくありません';
    case 'auth/email-already-in-use':
      return 'このメールアドレスは登録済みです。「ログイン」からお進みください';
    case 'auth/weak-password':
    case 'auth/password-does-not-meet-requirements':
      return 'パスワードは 8 文字以上で入力してください';
    case 'auth/too-many-requests':
      return '試行回数が多すぎます。しばらく待ってからお試しください';
    case 'auth/network-request-failed':
      return '通信できませんでした。接続を確かめてもう一度お試しください';
    default:
      return 'うまくいきませんでした。もう一度お試しください';
  }
}
