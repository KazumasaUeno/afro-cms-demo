/**
 * afro-cms の Cloud Functions（BACKEND_FIREBASE.md §2.4。2026-11-19 ユーザー決定）。
 * 招待した人の Auth アカウントをサーバー（Admin SDK）で作る。これで Console の「作成（登録）を許可」を OFF にできる
 * （他人が招待より前に同じメールで登録しておく余地を無くす。security re-audit 2026-11-19 MEDIUM）。
 *
 * - 呼べるのは有効な管理者だけ。判定は firestore.rules の isAdmin() と同じ（email_verified・accounts/{uid} が active・
 *   accounts.email == token.email・role == 'admin'）
 * - invites/{小文字のメール} が status 'invited' で存在するときだけ作る（招待の文書が先。文書はクライアントが Rules を通して作る）
 * - 0.47.0（docs/design/INVITE_EXISTING_ACCOUNT.md 案 B。2026-11-20 ユーザー承認）: uid を関数が決めて invites/{email}.provisionedUid に
 *   書いてから、その uid でアカウントを作る。Rules の受け取り（claimOk）は provisionedUid == 自分の uid を必須にする
 *   → 関数がこの招待のために作ったアカウントだけが招待を受け取れる（Console 追加・他プロバイダ・招待前の登録は受け取れない）
 * - 同じメールのアカウントが既にあるとき: uid が provisionedUid と同じなら 'resent'（正常な送り直し）。違えば 'already-exists' の
 *   エラーで拒否し、何も書かない（管理者が Console でそのアカウントを削除してから送り直す。パスワード設定のメールも送らない）
 * - パスワード設定のメールはクライアントが送る（sendPasswordResetEmail。src/live/invite.ts。created / resent のときだけ）
 * - 招待を取り消したら、関数が作った Auth アカウントを消す（onInviteRevoked。accounts がある＝受け取り済みなら消さない）
 */
import { randomBytes } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onDocumentUpdated } from 'firebase-functions/firestore';
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

/**
 * 実行のサービスアカウント（既定の compute SA は権限が広い。security audit 2026-11-20 MEDIUM）。
 * 末尾が '@' の形は firebase-tools がデプロイ先のプロジェクト ID で `<名前>@<projectId>.iam.gserviceaccount.com` に補う
 * （firebase-tools 15.35 lib/gcp/proto.js formatServiceAccount）。読み込み時に環境変数を読まないので、デプロイの解析（discovery）で
 * 落ちない（discovery に渡る環境変数は FIREBASE_CONFIG・GCLOUD_PROJECT だけ）。エミュレータでは使われない。
 * SA は先に作って役割を付けておく（docs/TODO.md の「関数を専用のサービスアカウントで動かす」）。無いとデプロイが失敗する
 */
export const FUNCTIONS_SERVICE_ACCOUNT = 'afro-cms-functions@';

// 費用の上限: 同時に動くインスタンスは最大 2（招待は管理者の手作業なので十分）
setGlobalOptions({ region: REGION, maxInstances: 2, memory: '256MiB', timeoutSeconds: 30, serviceAccount: FUNCTIONS_SERVICE_ACCOUNT });

export type ProvisionResult = 'created' | 'resent';

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

/** 招待のために関数が決める uid（Firebase の uid は 128 文字以内の任意の文字列。27 文字の乱数） */
function newProvisionedUid(): string {
  return randomBytes(20).toString('base64url');
}

const errCode = (e: unknown): string => (e as { code?: string } | null)?.code ?? 'unknown';

/** そのメールの Auth アカウントの uid（無ければ null） */
async function uidByEmail(email: string): Promise<string | null> {
  try {
    return (await getAuth().getUserByEmail(email)).uid;
  } catch (e) {
    if (errCode(e) === 'auth/user-not-found') return null;
    throw e;
  }
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
  const db = getFirestore();
  const ref = db.doc(`invites/${email}`);
  const log = (level: 'info' | 'warn' | 'error', msg: string, extra: Record<string, unknown>) =>
    logger[level](msg, { event: 'invite.provision', callerUid, durationMs: Date.now() - started, ...extra });
  const noInvite = () => {
    log('warn', 'invite.provision rejected: no open invite', { status: 'no_invite' });
    return new HttpsError('failed-precondition', 'no open invite for this email');
  };
  // 握り潰さない: 他から来たアカウントは受け付けない。何も書かず、メールも送らせない（管理者が Console で削除してから送り直す）
  const rejectExisting = (uid: string) => {
    log('warn', 'invite.provision rejected: account not provisioned for this invite', { status: 'existing', uid });
    return new HttpsError('already-exists', 'an account that was not created for this invite already exists');
  };

  try {
    const invite = await ref.get();
    if (!invite.exists || invite.get('status') !== 'invited') throw noInvite();

    // 1) 既にアカウントがあるなら、この招待のために関数が作ったもの（uid == provisionedUid）だけを送り直しとして扱う
    const existingUid = await uidByEmail(email);
    if (existingUid !== null) {
      if (existingUid === invite.get('provisionedUid')) {
        log('info', 'invite.provision resent', { status: 'resent', uid: existingUid });
        return 'resent';
      }
      throw rejectExisting(existingUid);
    }

    // 2) uid を決めて招待に書く（招待中のときだけ）。前の呼び出しで書いた uid のアカウントが無い（作成の失敗・Console で削除）なら
    //    同じ uid を使う（その uid のアカウントは Admin SDK でしか作れないので、使い回しても他人は受け取れない。
    //    同時に 2 回呼ばれても同じ uid になり、片方が created・もう片方が resent になる）
    const uid = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists || snap.get('status') !== 'invited') throw noInvite();
      const current = snap.get('provisionedUid');
      if (typeof current === 'string' && current.length > 0) return current;
      const fresh = newProvisionedUid();
      tx.update(ref, { provisionedUid: fresh });
      return fresh;
    });

    // テスト専用（エミュレータだけ）: 予約と作成のあいだに招待が取り消される競合を再現する。本番では読まない（FUNCTIONS_EMULATOR）
    if (process.env.FUNCTIONS_EMULATOR === 'true' && invite.get('testRevokeAfterReserve') === true) {
      await ref.update({ status: 'revoked' });
    }

    // 3) その uid でアカウントを作る。間に同じメールのアカウントができていたら 1) と同じ判定
    try {
      await getAuth().createUser({ uid, email, password: throwawayPassword(), emailVerified: false, disabled: false });
    } catch (e) {
      const code = errCode(e);
      if (code !== 'auth/email-already-exists' && code !== 'auth/uid-already-exists') throw e;
      const raced = await uidByEmail(email);
      if (raced === uid) {
        log('info', 'invite.provision resent (concurrent call created it)', { status: 'resent', uid });
        return 'resent';
      }
      if (code === 'auth/uid-already-exists') {
        // その uid が別のメールのアカウントに使われている（乱数の衝突・手作業）。既存アカウントの案内は出さない
        log('error', 'invite.provision uid conflict', { status: 'uid_conflict', uid });
        throw new HttpsError('aborted', 'could not create the account');
      }
      throw rejectExisting(raced ?? 'unknown');
    }
    // 4) 作成の間に招待が取り消されていたら、作ったアカウントを消して失敗にする（取り消しのトリガーより先に作った場合の取り残しを防ぐ）
    // 消すのは「取り消し済み（または文書が無い）」かつ accounts/{uid} が無いときだけ。受け取り済み（claimed）は本人が使い始めているので消さない
    // （同時に呼ばれた片方が resent でメールを送り、本人が先に受け取る場合。Codex 2026-11-20 P1）
    const after = await ref.get();
    const status = after.exists ? after.get('status') : null;
    if (status === 'claimed') {
      log('info', 'invite.provision created (already claimed by a concurrent resend)', { status: 'created', uid });
      return 'created';
    }
    if (status !== 'invited' && !(await getFirestore().doc(`accounts/${uid}`).get()).exists) {
      try {
        await getAuth().deleteUser(uid);
      } catch (e) {
        if (errCode(e) !== 'auth/user-not-found') throw e;
      }
      log('warn', 'invite.provision revoked during create; account removed', { status: 'revoked_during_create', uid });
      throw new HttpsError('failed-precondition', 'no open invite for this email');
    }
    log('info', 'invite.provision created', { status: 'created', uid });
    return 'created';
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    log('error', 'invite.provision failed', { status: 'error', errorCode: errCode(e) });
    throw new HttpsError('internal', 'could not create the account');
  }
});

/**
 * 招待の取り消し（invited → revoked）で、関数がこの招待のために作った Auth アカウントを消す（security audit 2026-11-20 MEDIUM）。
 * - provisionedUid が無い（0.47.0 より前の招待）なら何もしない
 * - accounts/{uid} がある＝受け取り済みなら消さない（Rules では invited → revoked と受け取りは両立しないが、念のため）
 * - 既に無ければ（Console で削除済み）何もしない。ログは uid だけ（メールは出さない）
 * - 一時的な失敗は throw して再試行させる（retry: true。上の「消さない／既に無い」は成功として終える）。再試行の期間を過ぎた失敗は
 *   ログ（status: error）に残る。取り残しの棚卸しは docs/TODO.md
 */
export const onInviteRevoked = onDocumentUpdated({ document: 'invites/{email}', region: REGION, retry: true }, async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after || before.status !== 'invited' || after.status !== 'revoked') return;
  const uid = after.provisionedUid;
  if (typeof uid !== 'string' || uid.length === 0) {
    logger.info('invite.revoke no provisioned account', { event: 'invite.revoke', status: 'no_uid' });
    return;
  }
  if ((await getFirestore().doc(`accounts/${uid}`).get()).exists) {
    logger.warn('invite.revoke account doc exists; auth user kept', { event: 'invite.revoke', status: 'kept_has_account', uid });
    return;
  }
  try {
    await getAuth().deleteUser(uid);
    logger.info('invite.revoke auth user deleted', { event: 'invite.revoke', status: 'deleted', uid });
  } catch (e) {
    if (errCode(e) === 'auth/user-not-found') {
      logger.info('invite.revoke auth user already gone', { event: 'invite.revoke', status: 'not_found', uid });
      return;
    }
    logger.error('invite.revoke delete failed', { event: 'invite.revoke', status: 'error', uid, errorCode: errCode(e) });
    throw e;
  }
});
