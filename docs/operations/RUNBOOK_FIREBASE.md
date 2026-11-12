# RUNBOOK: Firebase 本番プロジェクト（live 版）

- 正の設計: `docs/design/BACKEND_FIREBASE.md` §2.5（初代管理者）・§15（環境設定）・`docs/TODO.md`（段階 C の条件）
- **このPCの gcloud の既定は別のお客様の本番**。`gcloud`・ADC・`firebase init`・`.firebaserc` の default を使わない。デプロイは必ず `--project <ID>` 付きの `npm run deploy:firebase`
- 作業者の欄: 【ユーザー】＝ご本人の Google アカウントで Console 操作、【開発】＝リポジトリ側

## 1. プロジェクトを作る【ユーザー】

> 2026-11-12 作成済み: **ID `afro-cms-4a6ff`**（作成は別アカウント。普段のアカウントもオーナー）。§2〜4 も設定済み。Console の URL の `/u/<n>/` はブラウザのログイン順で変わるので、操作前に右上のアカウントを確かめる

1. https://console.firebase.google.com →「プロジェクトを作成」
2. 名前: 例 `afro-cms`（プロジェクト ID は自動で付く。**ID は後から変えられない**ので確認する）
3. Google アナリティクス: **オフ**（使わない。個人情報を増やさない）
4. 料金プラン: **Spark（無料）のまま**。Blaze へは上げない（上げる条件は設計書 §21）

## 2. Authentication【ユーザー】

1. 構築 → Authentication →「始める」
2. ログイン方法: **メール / パスワード を有効**（「メールリンク」はオフ）。他のプロバイダ・**匿名はオフ**
3. 設定 → ユーザー アクション: **メール列挙の保護 = オン**
4. 設定 → パスワード ポリシー: **8 文字以上**
5. 設定 → 承認済みドメイン: **`localhost` を削除**（`<ID>.firebaseapp.com`・`<ID>.web.app` は残す）

## 3. Firestore【ユーザー】

1. 構築 → Firestore Database →「データベースを作成」
2. エディション: Standard ／ データベース ID: `(default)`
3. ロケーション: **`asia-northeast1`（東京）**（設計書 §25-10。**後から変えられない**）
4. セキュリティ ルール: **本番モード**（すべて拒否から始める。ルールは【開発】がデプロイする）

## 4. Web アプリを登録【ユーザー】

1. プロジェクトの設定（歯車）→ マイアプリ →「</>（ウェブ）」
2. ニックネーム: `afro-cms-web` ／「Firebase Hosting も設定する」: チェックする
3. 表示される `firebaseConfig` のうち **`apiKey`・`authDomain`・`projectId`・`appId`** の 4 つを開発へ渡す
   - これらは公開される値（秘密ではない）。**サービス アカウントの鍵（JSON）は作らない・渡さない**

## 5. CLI のログイン【ユーザー】

- Claude Code で `! npx firebase login`（ブラウザで同じ Google アカウントを選ぶ）
- 確認: `! npx firebase projects:list` に 1 の ID が出る

## 6. 設定とデプロイ【開発】（デプロイはユーザーの了承の後）

1. `scripts/firebase-projects.mjs` の `PRODUCTION_PROJECT_IDS` を `['<ID>']` に（lead-architect 確認）
2. `.env.live.local`（コミットしない）に 4 の値
3. `npm run build:live` → `npm run deploy:firebase -- --project <ID> --only firestore:rules,firestore:indexes` → `--only hosting`
4. `https://<ID>.web.app` を開いてログイン画面が出ること、応答ヘッダ（X-Frame-Options 等）を確認

## 7. 初代管理者【ユーザー → 開発が確認】（§2.5）

1. Firestore →「コレクションを開始」→ `invites`、文書 ID = 管理者のメール（**小文字**）
   - フィールド: `role`=`admin`（string）、`name`=氏名（string）、`status`=`invited`（string）、`createdAt`=今（timestamp）、`createdBy`=`console`（string）
2. `https://<ID>.web.app` で同じメールで新規登録 → 確認メールのリンク → ログイン → 管理者画面が出る
3. 2 人目以降の管理者も同じ手順（アプリから管理者は招待できない）。開発者・お客様はアプリの「ユーザー」から招待する

## 8. 外部のお客様を招待する前に（`docs/TODO.md` 段階 C）

- App Check（reCAPTCHA）を Firestore・Auth で **enforce**
- Google Cloud Console → API とサービス → 認証情報 → ブラウザ キー: リファラーを `https://<ID>.web.app/*`・`https://<ID>.firebaseapp.com/*` に、API を Identity Toolkit / Token Service / Cloud Firestore に制限
- 招待の方式（再設定リンク方式にするか）と保存期間（LEGAL REVIEW REQUIRED）を決める
