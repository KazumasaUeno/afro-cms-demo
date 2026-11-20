/**
 * callable の CORS（security audit 2026-11-20 LOW）。読み込み時の副作用なし（テストから直接読む）。
 * - 本番: このプロジェクトの Hosting のオリジンだけ（`https://<projectId>.web.app` と `.firebaseapp.com`）
 * - エミュレータ: 確認用の画面（vite の dev / preview）から呼ぶので許可する（demo- のプロジェクトでしか起動しない。index.ts の先頭）
 * - プロジェクトが分からないときは何も許可しない（fail-closed）
 */
export function callableCors(env: NodeJS.ProcessEnv): boolean | string[] {
  if (env.FUNCTIONS_EMULATOR === 'true') return true;
  const project = (env.GCLOUD_PROJECT ?? '').trim();
  if (!/^[a-z0-9-]+$/.test(project)) return false;
  return [`https://${project}.web.app`, `https://${project}.firebaseapp.com`];
}
