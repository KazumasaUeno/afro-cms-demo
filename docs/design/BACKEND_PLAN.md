# 実装計画: Firebase バックエンド（要件定義まで）

- 規模: **XL**（認証・認可・個人情報・外部サービス）。作成: lead-architect 2026-11-10。状態: **A・B0・B 完了（2026-11-12、エミュレータで検証。ローカルのみ・未 push）。C は未着手（docs/TODO.md の条件）**
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

## Plan Review の反映（impact-analyzer: APPROVE WITH CONDITIONS、2026-11-10）

状態: **承認（条件反映済み）**。以下は上の各段階に優先する。

- **C1 設計書の無効化した記述**: §13.1（同じ URL でモード切替・`afro-cms-demo:mode`）、§15（pages.yml に VITE_FIREBASE_* を渡す・参照元に github.io / localhost）、§16.2（Pages の CI で test:rules）は §27 で無効。Pages の workflow には Firebase の変数・Java・エミュレータを入れない。live は Firebase Hosting 用の別ビルド
- **C2 demo に SDK を入れない方法**: `VITE_DATA_MODE` をビルド時定数にし、live のコードは tree-shake で落とす。検証: env なしの `npm run build` の dist に `firebase` / `googleapis` が無いこと（grep）、bundle サイズを前回と比べる
- **C3 B0 を独立**: B の前に「repository の型と demo 実装だけ入れて画面を差し替える（Firebase なし）」を行い、demo の回帰確認を通してから Auth へ。live の認証は SESSION_KEY と demo の state を読まない別の Guard
- **C4 CSP**: live のビルドの index.html だけに入れる（demo には入れない）
- **C5 M-3**: A2 の前に「A0: devTransition / submitOrWithdrawOk の式を設計書へ明記 → security-engineer がレビュー」
- **C6 公開の前提**: C1（公開）は、A の拒否テスト（M-1〜M-5）全件成功と security-engineer の再監査の後
- A2 に追加: validProposal（M-11）、accounts の読み取り範囲（§27 Low-1）、アーカイブは開発者のみ（§27 Low-2）
- C2 に追加: API キーの参照元は `<projectId>.web.app` / `firebaseapp.com` のみ、「参照元の制限は境界ではない」と記録（M-10）。admin の無効化は Console で行う手順（M-5）。削除依頼の手順
- B に追加: メール変更の UI を作らない（M-8）。大文字混在メールの扱いをエミュレータで確認
- 運用手順（M-12）: PRIVACY_REVIEW に記録。バックアップのファイル名に個人名を入れない
- M-7: 対応済み（0445487）
- **gcloud の既定 = 他社の本番への対策**: `firebase init` は使わず手で作る（`.firebaserc` に default を書かせない）。本番 ID の許可リストはコミットした定数。deploy は `--project <ID> --only hosting,firestore:rules,firestore:indexes` 必須。firebase-admin・gcloud・ADC は使わない。エミュレータ接続の分岐が本番ビルドに残らないことを確認
- firebase-tools は devDependencies。lock の差分と `npm audit` を確認（Pages の `npm ci` が重くなる点は許容）
- [UNKNOWN] Auth の永続化方式（IndexedDB 既定）と §13.4 の方針の整合 → A0 で決める
- **demo の回帰の照合表**（自動テストが無いので手動。qa-engineer が作り、B0・B・C の各段階で回す）: ①env なし build・dist に firebase 無し ②3 エリアのログイン・ログアウト・next・revoked ③既存 localStorage のまま読める・「デモを初期化」でログアウトしない ④ウィザード・CSV 入出力・分析→承認（demo の代理承認を含む）・要件定義書 HTML ⑤CMS・サイネージ・診断レポートのダウンロード ⑥Pages の深いリンク（404.html）と VITE_BASE ⑦`.env.local` があっても demo の挙動が変わらない

## B の着手条件（B0 レビュー 2026-11-10。code-reviewer: Approve with comments、demo の回帰なし）
B（live 実装）に入る前に次を直す。demo では表に出ないため B0 では直していない。
1. 書き込みの完了とエラーを画面が受ける: `void repo.x(); toast()` をやめ、await して成功時だけ toast・catch でエラー表示する共通の形にする（UsersPage・AnswerStatus・ProposalView・PortalApprovalsPage・NewProjectPage ほか全呼び出し）
2. 読み込み中・エラーを扱う: `requirements.useCurrent(projectId)` に揃え、loading 中は描画しない・書き込みを止める方針を repositories/types.ts に明記（ProjectDetailPage の一瞬の NotFound、UsersPage の `projects[0]` 例外を防ぐ）
3. 「選んでいる案件」を `projects.select` に一本化（AppShell・DevDashboardPage・DevProjectGate・HomePage の setCurrentProject の dispatch）
- Minor: PortalApprovalsPage の approvalSteps を repo の値から導く／Wizard の setCompetitors と setAnswer を 1 回の書き込みに／repositories → features の型依存の向き
