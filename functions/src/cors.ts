/**
 * callable の CORS（security audit 2026-11-20 LOW）。読み込み時の副作用なし（テストから直接読む）。
 * - 本番: このプロジェクトの Hosting のオリジンだけ（`https://<projectId>.web.app` と `.firebaseapp.com`）
 * - エミュレータ: 確認用の画面（vite の dev / preview）から呼ぶので許可する（demo- のプロジェクトでしか起動しない。index.ts の先頭）
 * - プロジェクトが分からないときは何も許可しない（fail-closed）
 * - 独自ドメインを足すときは、ここの許可先にも足す（docs/TODO.md の承認済みドメインの行）
 */
export function callableCors(env: NodeJS.ProcessEnv): boolean | string[] {
  if (env.FUNCTIONS_EMULATOR === 'true') return true;
  // 予備: FIREBASE_CONFIG（JSON）の projectId（code review 2026-11-20 Minor）
  let fromConfig = '';
  try { fromConfig = String((JSON.parse(env.FIREBASE_CONFIG ?? '{}') as { projectId?: unknown }).projectId ?? ''); } catch { fromConfig = ''; }
  const project = (env.GCLOUD_PROJECT || fromConfig).trim();
  if (!/^[a-z0-9-]+$/.test(project)) return false;
  return [`https://${project}.web.app`, `https://${project}.firebaseapp.com`];
}
