import { sendPasswordResetEmail } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable, type HttpsCallable } from 'firebase/functions';
import { normalizeEmail } from '@/data/users';
import { app, auth, EMULATOR } from './firebase';

/**
 * 招待のアカウント作成とパスワード設定メール（BACKEND_FIREBASE §2.4。security M1 の対策）。
 * - アカウントはサーバー（Cloud Functions の provisionInvitee。functions/src/index.ts）が Admin SDK で作る。
 *   クライアントの SDK では作らないので、Console の「作成（登録）を許可」を OFF にできる（0.46.0）
 * - 呼べるのは有効な管理者だけ。invites/{小文字のメール} が招待中でなければ作らない（判定はサーバー側）
 * - 同じメールのアカウントが既にあれば、サーバーは何も変えずに 'existing' を返す。メールだけ送る
 * - 本人はパスワード再設定のメール（＝招待メール）で自分のパスワードを決める
 */

export type InviteAccountResult = 'created' | 'existing';

const REGION = 'asia-northeast1'; // functions/src/index.ts の REGION と同じ

let callable: HttpsCallable<{ email: string }, InviteAccountResult> | null = null;

function provisionCallable(): HttpsCallable<{ email: string }, InviteAccountResult> {
  if (!callable) {
    const functions = getFunctions(app, REGION);
    if (EMULATOR) connectFunctionsEmulator(functions, '127.0.0.1', 5001);
    callable = httpsCallable<{ email: string }, InviteAccountResult>(functions, 'provisionInvitee', { timeout: 30_000 });
  }
  return callable;
}

async function createAccount(email: string): Promise<InviteAccountResult> {
  const { data } = await provisionCallable()({ email });
  if (data !== 'created' && data !== 'existing') throw new Error(`invite: unexpected result ${String(data)}`);
  // 握り潰さない: 呼び出し元が「既にあった」を管理者へ伝える
  if (data === 'existing') console.warn('invite: auth account already exists; sending password email only');
  return data;
}

/** パスワード設定（再設定）のメール。リンクの後はこのアプリのログイン画面へ戻す */
async function sendSetupEmail(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email, { url: `${window.location.origin}/login` });
}

/**
 * 招待した人のアカウントを用意してパスワード設定メールを送る。invites の文書を作った後に呼ぶ。
 * 送り直しにも使う（アカウントが既にあればメールだけ送る）。
 */
export async function provisionInvitee(rawEmail: string): Promise<InviteAccountResult> {
  const email = normalizeEmail(rawEmail);
  const result = await createAccount(email);
  await sendSetupEmail(email);
  return result;
}
