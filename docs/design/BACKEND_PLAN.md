# 実装計画: Firebase バックエンド（要件定義まで）

- 規模: **XL**（認証・認可・個人情報・外部サービス）。作成: lead-architect 2026-11-10。状態: **Plan Review 待ち**
- 設計の正: `docs/design/BACKEND_FIREBASE.md`（§25・§27 の決定、§26 のセキュリティレビュー M-1〜M-12）
- 依存の追加（ユーザーが Firebase を選んだ時点で承認済み）: `firebase`、devDependencies `firebase-tools` `@firebase/rules-unit-testing`

## 変更しない部分（宣言）
- 営業用デモ（demo モード）: 画面・localStorage・既存のデモデータと操作は変えない。demo ビルドは Firebase SDK を読み込まない
- GitHub Pages のデプロイ（`.github/workflows`）は demo ビルドのまま
- 制作・品質・CMS・サイネージ・インサイトの機能（live では隠すだけ）
- 他リポジトリ・他案件の Firebase / GCP プロジェクト（gcloud の既定は使わない）

## 段階

### A. 土台と Rules（Firebase プロジェクト ID が無くても進められる）
1. `firebase.json`・`firestore.rules`・`firestore.indexes.json`。`.firebaserc` は default を置かない
2. Rules を設計書 §8 どおりに書く。§26 の M-1〜M-5・M-8 を含める（招待の全項目一致・承認の affectedKeys 制限・devTransition/submitOrWithdrawOk の式・getAfter で draft 要求・admin の無効化禁止・email 一致）
3. Rules テスト（`node --test` ＋ `@firebase/rules-unit-testing`、`firebase emulators:exec --project demo-afro-cms`。`demo-` 以外なら即 throw）。設計書 §26.5 の SEC-1〜7 と、各コレクションの許可・拒否を件数つきで実行
4. `validation.ts` の上限から Rules の質問ごとの検査を生成するスクリプトと `rules:check`
- **完了条件**: Rules テストが全件成功（件数を報告）。M-1〜M-5 の拒否テストを含む

### B. アプリの live モード（プロジェクト ID が必要）
1. repository 層（demo = 既存 reducer/localStorage、live = Firestore）。`VITE_DATA_MODE`、設定は `VITE_FIREBASE_*`（`.env.local`、`.env.example` だけコミット）
2. 認証: メール＋パスワード、メール確認必須、招待の受け取り。3 エリアのログインを live では Firebase Auth に
3. 範囲の画面: プロジェクト（開発者が作成）、ヒアリング（ウィザード・回答一覧・CSV）、分析・要件定義書（承認依頼後は固定、差し戻し）、お客様の承認（本人のみ）、承認の履歴、ユーザー管理（admin: 招待・無効化・割り当て）
4. live では範囲外の画面を隠す。要件定義書の HTML は保存値もエスケープ、点数は number（M-11）。blob: で開かない。CSP（meta）
- **完了条件**: ビルド成功、エミュレータに対して主要フローを画面で通す（招待→受け取り→案件作成→入力→分析→承認依頼→お客様承認→履歴）

### C. 公開と運用
1. Firebase Hosting へのデプロイ（スクリプトは本案件の本番 ID と完全一致のときだけ実行）。GitHub Pages は demo のまま
2. ユーザーの Console 作業の手順書: API キーの制限・承認済みドメイン（localhost を外す）・メール列挙保護 ON・匿名認証 OFF・最初の admin の招待文書（M-9・M-10）
3. 運用手順書: 月 1 回の JSON バックアップ（保存先・世代・SHA-256。M-12）、削除依頼の手順（invites の削除を含む）
- **完了条件**: 社内試用のみ。**外部のお客様を招待する前に App Check を強制**（M-9）。保持期間は LEGAL REVIEW REQUIRED

## 検証
- Rules テスト（件数）／ `npm run build`／エミュレータでの画面確認／ demo モードの回帰（今のデモが変わらないこと）
- 別系統の確認: security-engineer が実装後に再監査（XL）

## ロールバック
- live はまだ利用者がいないので、Hosting を前の版に戻す（`firebase hosting:rollback` 相当）か公開を止める。demo（GitHub Pages）は影響を受けない
