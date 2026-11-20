/**
 * afro-cms の Cloud Functions（BACKEND_FIREBASE.md §2.4。2026-11-19 ユーザー決定）。
 * 招待した人の Auth アカウントをサーバー（Admin SDK）で作る。これで Console の「作成（登録）を許可」を OFF にできる
 * （他人が招待より前に同じメールで登録しておく余地を無くす。security re-audit 2026-11-19 MEDIUM）。
 *
 * - 呼べるのは有効な管理者だけ。判定は firestore.rules の isAdmin() と同じ（email_verified・accounts/{uid} が active・
 *   accounts.email == token.email・role == 'admin'）
 * - invites/{小文字のメール} が status 'invited' で存在するときだけ作る（招待の文書が先。文書はクライアントが Rules を通して作る）
 * - 既に同じメールのアカウントがあれば、何も変えずに 'existing' を返す（管理画面が「招待より前からあった」と警告する）
 * - パスワード設定のメールはクライアントが送る（sendPasswordResetEmail。src/live/invite.ts）
 */
import { randomBytes } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/https';
import { setGlobalOptions } from 'firebase-functions/options';
import { callableCors } from './cors';

// エミュレータで動くときは、Auth・Firestore もエミュレータでなければ起動しない（本番へ書き込まない。BACKEND_FIREBASE §16.1）
if (process.env.FUNCTIONS_EMULATOR === 'true'
  && (!process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.FIRESTORE_EMULATOR_HOST || !process.env.GCLOUD_PROJECT?.startsWith('demo-'))) {
  throw new Error('functions emulator must run with the auth and firestore emulators on a demo- project');
}

initializeApp();

export const REGION = 'asia-northeast1';

/**
 * App Check の強制。App Check が未設定のうちは false（true にすると App Check のトークンが無い呼び出しをすべて拒否する）。
 * App Check を有効にしてから true にして functions をデプロイし直す（docs/TODO.md）
 */
export const ENFORCE_APP_CHECK = false;

// 費用の上限: 同時に動くインスタンスは最大 2（招待は管理者の手作業なので十分）
setGlobalOptions({ region: REGION, maxInstances: 2, memory: '256MiB', timeoutSeconds: 30 });

export type ProvisionResult = 'created' | 'existing';

// firestore.rules の validInvite と同じ形（小文字・254 文字以内・@ と . を含む）
const EMAIL_RE = /^[^@\s]+@[^@\s]+[.][^@\s]+$/;
const EMAIL_MAX = 254;

/** 入力のメールを検査して小文字にする（クライアントの normalizeEmail と同じ: 前後の空白を除き小文字） */
export function parseEmail(data: unknown): string {
  const raw = (data as { email?: unknown } | null | undefined)?.email;
  if (typeof raw !== 'string') throw new HttpsError('invalid-argument', 'email is required');
  const email = raw.trim().toLowerCase();
  if (email.length === 0 || email.length > EMAIL_MAX || !EMAIL_RE.test(email)) {
    throw new HttpsError('invalid-argument', 'email is invalid');
  }
  return email;
}

/** 誰にも見せない初期パスワード（本人はパスワード設定のメールで自分のものに変える）。パスワード方式の利用者として作るために付ける */
function throwawayPassword(): string {
  return `Aa1!${randomBytes(32).toString('base64url')}`;
}

/** firestore.rules の isAdmin() と同じ判定 */
async function assertActiveAdmin(req: CallableRequest<unknown>): Promise<string> {
  const auth = req.auth;
  if (!auth) throw new HttpsError('unauthenticated', 'sign-in required');
  if (auth.token.email_verified !== true) throw new HttpsError('permission-denied', 'email not verified');
  const tokenEmail = auth.token.email;
  if (typeof tokenEmail !== 'string' || tokenEmail.length === 0) throw new HttpsError('permission-denied', 'no email');
  const snap = await getFirestore().doc(`accounts/${auth.uid}`).get();
  const a = snap.data();
  if (!snap.exists || !a || a.status !== 'active' || a.email !== tokenEmail || a.role !== 'admin') {
    throw new HttpsError('permission-denied', 'admin only');
  }
  return auth.uid;
}

export const provisionInvitee = onCall({ enforceAppCheck: ENFORCE_APP_CHECK, cors: callableCors(process.env) }, async (req): Promise<ProvisionResult> => {
  const started = Date.now();
  const callerUid = await assertActiveAdmin(req);
  const email = parseEmail(req.data);

  const invite = await getFirestore().doc(`invites/${email}`).get();
  if (!invite.exists || invite.get('status') !== 'invited') {
    logger.warn('invite.provision rejected: no open invite', { event: 'invite.provision', status: 'no_invite', callerUid });
    throw new HttpsError('failed-precondition', 'no open invite for this email');
  }

  try {
    const user = await getAuth().createUser({ email, password: throwawayPassword(), emailVerified: false, disabled: false });
    logger.info('invite.provision created', { event: 'invite.provision', status: 'created', callerUid, uid: user.uid, durationMs: Date.now() - started });
    return 'created';
  } catch (e) {
    if ((e as { code?: string }).code === 'auth/email-already-exists') {
      // 握り潰さない: 既存のアカウントは変えずに 'existing' を返し、管理画面が警告を出す
      logger.warn('invite.provision existing account left unchanged', { event: 'invite.provision', status: 'existing', callerUid, durationMs: Date.now() - started });
      return 'existing';
    }
    logger.error('invite.provision failed', { event: 'invite.provision', status: 'error', callerUid, errorCode: (e as { code?: string }).code ?? 'unknown' });
    throw new HttpsError('internal', 'could not create the account');
  }
});
