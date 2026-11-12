/** ビルド時に vite が文字列へ置き換える環境変数（BACKEND_PLAN C2。既定は demo）。VITE_DATA_MODE・VITE_FIREBASE_EMULATOR は vite.config.ts の define（--mode だけで決まる） */
interface ImportMetaEnv {
  readonly VITE_DATA_MODE?: string;
  readonly VITE_FIREBASE_EMULATOR?: string;
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
}
