/**
 * Cloud Functions のリージョン（Firestore と同じ東京）。functions/src/index.ts の REGION と一致させる
 * （tests/functions/region.test.mjs が検査する）。vite.config.ts の CSP（connect-src）もこの値を使う
 */
export const FUNCTIONS_REGION = 'asia-northeast1';

/** callable の送り先のオリジン（本番）。CSP の connect-src に入れる */
export function functionsOrigin(projectId: string): string {
  return `https://${FUNCTIONS_REGION}-${projectId}.cloudfunctions.net`;
}
