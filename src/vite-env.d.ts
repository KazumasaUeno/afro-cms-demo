/** ビルド時に vite が文字列へ置き換える環境変数（BACKEND_PLAN C2。既定は demo） */
interface ImportMetaEnv {
  readonly VITE_DATA_MODE?: string;
}
