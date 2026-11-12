import { initializeApp, type FirebaseApp } from 'firebase/app';
import { browserSessionPersistence, connectAuthEmulator, initializeAuth, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, initializeFirestore, memoryLocalCache, type Firestore } from 'firebase/firestore';

/**
 * Firebase の初期化（live モードだけ。src/live/ は main.tsx の live 分岐からだけ読み込まれ、demo のビルドには入らない）。
 * - Auth は sessionStorage に保存（タブを閉じると消える。BACKEND_FIREBASE §28.8）。getAuth() を先に呼ばない（IndexedDB で初期化されるため）
 * - Firestore はメモリキャッシュだけ（端末に回答を残さない。§13.4）
 * - エミュレータへの接続は `--mode emulator` のビルドだけ（VITE_FIREBASE_EMULATOR はビルド時定数。live のビルドではこの分岐ごと消える）
 */

export const EMULATOR = import.meta.env.VITE_FIREBASE_EMULATOR === '1';
const EMULATOR_PROJECT_ID = 'demo-afro-cms';

function config() {
  if (EMULATOR) {
    // エミュレータは実在のプロジェクトに接続しない demo- の ID だけ（キーは何でもよい）
    return { apiKey: 'demo-api-key', authDomain: `${EMULATOR_PROJECT_ID}.firebaseapp.com`, projectId: EMULATOR_PROJECT_ID, appId: 'demo-app' };
  }
  const c = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? '',
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '',
    appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '',
  };
  if (!c.apiKey || !c.projectId || c.projectId.startsWith('demo-')) throw new Error('Firebase の設定がありません（.env.live.local）');
  return c;
}

export const app: FirebaseApp = initializeApp(config());
export const auth: Auth = initializeAuth(app, { persistence: browserSessionPersistence });
export const db: Firestore = initializeFirestore(app, { localCache: memoryLocalCache() });

if (EMULATOR) {
  if (!app.options.projectId?.startsWith('demo-')) throw new Error('エミュレータには demo- のプロジェクトだけ接続する');
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
