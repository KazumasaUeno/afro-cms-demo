/**
 * AI 下書きの関数の認可（firestore.rules の roleOf と同じ判定。設計 §2.1「認可」）。
 * - auth あり・email_verified・accounts/{uid} が active で accounts.email == token.email → その role。違えば 'none'
 * - 生成: admin、または developer かつ uid ∈ memberUids。archived の案件は拒否
 * - 編集の保存（saveAiDraftEdits。計画 F-a）: admin、または developer かつ uid ∈ memberUids。archived の案件は拒否
 *   （2026-11-26 ユーザー決定で admin を追加。ADMIN_FULL_RIGHTS_PLAN R-8。旧 DEC F5「admin は不可」を置き換え）。
 *   お客様・担当外の開発者・無効化／メール不一致の admin（role 'none'）は不可
 * - エラーの文言は固定（入力の値を入れない）
 */
import type { Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/https';
import type { FlagRole } from './flags';

export interface AuthLike {
  uid: string;
  token: { email?: unknown; email_verified?: unknown; [k: string]: unknown };
}

export interface Caller {
  uid: string;
  role: FlagRole;
}

/** 呼び出し者の役割（Rules の roleOf と同じ）。未ログインは unauthenticated */
export async function resolveCaller(db: Firestore, auth: AuthLike | undefined | null): Promise<Caller> {
  if (!auth || typeof auth.uid !== 'string' || auth.uid.length === 0) throw new HttpsError('unauthenticated', 'sign-in required');
  if (auth.token?.email_verified !== true) return { uid: auth.uid, role: 'none' };
  const email = auth.token.email;
  if (typeof email !== 'string' || email.length === 0) return { uid: auth.uid, role: 'none' };
  const snap = await db.doc(`accounts/${auth.uid}`).get();
  const a = snap.data();
  if (!snap.exists || !a || a.status !== 'active' || a.email !== email) return { uid: auth.uid, role: 'none' };
  const role = a.role;
  return { uid: auth.uid, role: role === 'admin' || role === 'developer' || role === 'client' ? role : 'none' };
}

export interface ProjectLike {
  memberUids?: unknown;
  archived?: unknown;
  requirements?: { status?: unknown } | null;
}

const isMember = (p: ProjectLike, uid: string) => Array.isArray(p.memberUids) && p.memberUids.includes(uid);

/** 生成できるか（admin、またはアサインされた開発者。archived は不可） */
export function assertCanGenerate(caller: Caller, project: ProjectLike | undefined): void {
  if (!project) throw new HttpsError('permission-denied', 'not allowed');
  const ok = caller.role === 'admin' || (caller.role === 'developer' && isMember(project, caller.uid));
  if (!ok) throw new HttpsError('permission-denied', 'not allowed');
  if (project.archived === true) throw new HttpsError('failed-precondition', 'project-archived');
}

/** 編集を保存できるか（admin、またはアサインされた開発者。お客様・担当外は不可。archived は不可） */
export function assertCanEdit(caller: Caller, project: ProjectLike | undefined): void {
  if (!project) throw new HttpsError('permission-denied', 'not allowed');
  const ok = caller.role === 'admin' || (caller.role === 'developer' && isMember(project, caller.uid));
  if (!ok) throw new HttpsError('permission-denied', 'not allowed');
  if (project.archived === true) throw new HttpsError('failed-precondition', 'project-archived');
}
