// 本案件の Firebase 本番プロジェクト ID の許可リスト（コミットする定数）。
// - このPCの gcloud の既定は「別のお客様の本番」なので、既定や .firebaserc には頼らない（BACKEND_FIREBASE.md §16.1）
// - ユーザーから本番 ID を受け取るまでは 'TBD'。'TBD' のままではデプロイスクリプトは必ず失敗する
// - ID を変えるときは lead-architect の確認を通す（他案件の ID を入れない）
export const PRODUCTION_PROJECT_IDS = Object.freeze(['afro-cms-4a6ff']);

// エミュレータ専用の ID（`demo-` で始まる ID は実在のリソースに接続しない）
export const EMULATOR_PROJECT_ID = 'demo-afro-cms';

// デプロイしてよい対象（Functions・Storage などは使わない）
export const DEPLOY_TARGETS = Object.freeze(['hosting', 'firestore:rules', 'firestore:indexes']);
