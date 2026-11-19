import { deleteApp, initializeApp } from 'firebase/app';
import {
  connectAuthEmulator, createUserWithEmailAndPassword, initializeAuth, inMemoryPersistence, sendPasswordResetEmail, signOut,
} from 'firebase/auth';
import { normalizeEmail } from '@/data/users';
import { app, auth, EMULATOR } from './firebase';

/**
 * 招待のアカウント作成とパスワード設定メール（BACKEND_FIREBASE §2.4。security M1 の対策）。
 * - 招待のときに Auth のアカウントを先に作る（他人が同じメールで先に登録する余地を無くす）
 * - 作成は 2 つ目の Firebase アプリで行う（同じ auth で作ると管理者がその人に切り替わる）。保存先はメモリだけ・終わったらログアウトして破棄
 * - パスワードは乱数で作り、誰にも見せず保存もしない。本人はパスワード再設定のメール（＝招待メール）で自分のパスワードを決める
 * - 同じメールのアカウントが既にあれば（先に登録された・送り直し）、作らずにメールだけ送る。メールの持ち主が設定すると前のパスワードは使えなくなる
 * - Console の「作成（登録）を許可」が ON であること（クライアントの SDK で作るため）
 */

export type InviteAccountResult = 'created' | 'existing';

/** 誰にも見せない初期パスワード。パスワードポリシー（文字種の要求）を満たすよう 4 種を必ず含める */
function throwawayPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const body = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `Aa1!${body}`;
}

async function createAccount(email: string): Promise<InviteAccountResult> {
  const secondary = initializeApp(app.options, `invite-${crypto.getRandomValues(new Uint32Array(2)).join('')}`);
  try {
    const secondaryAuth = initializeAuth(secondary, { persistence: inMemoryPersistence });
    if (EMULATOR) connectAuthEmulator(secondaryAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
    try {
      await createUserWithEmailAndPassword(secondaryAuth, email, throwawayPassword());
      return 'created';
    } catch (e) {
      if (String((e as { code?: string }).code ?? '') === 'auth/email-already-in-use') {
        // 握り潰さない: 呼び出し元が「既にあった」を管理者へ伝える
        console.warn('invite: auth account already exists; sending password email only');
        return 'existing';
      }
      throw e;
    } finally {
      await signOut(secondaryAuth).catch((e) => console.warn('invite: secondary sign-out failed', e));
    }
  } finally {
    await deleteApp(secondary).catch((e) => console.warn('invite: secondary app cleanup failed', e));
  }
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
