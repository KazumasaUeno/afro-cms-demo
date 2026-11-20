# 実装計画: AI による提案・要件定義書の下書き ＋ 現行サイト診断

- 状態: **計画案（Plan Review 前）**。コード・Rules・デプロイ・Secret・IAM は未着手
- 作成: 2026-11-20 lead-architect ／ 規模: **XL**（外部 AI へのお客様データ送信・外部 URL 取得・Secret・継続費用）
- 設計の正: `docs/design/AI_REQUIREMENTS.md` rev1（e9dba3c）。**L-1〜L-4 とレビュー指摘の反映は確定**。この計画は設計を変えない。食い違えば設計が正
- Plan Review: security-engineer（必須）＋ database-engineer（Rules）＋ backend-engineer（callable 契約）＋ ui-ux-designer（画面）。往復は 2 回まで（ADR-0055）
- ラベル: [FACT] 実物で確認 ／ [INFERENCE] 推測 ／ [UNKNOWN] 未確認 ／ [DECISION] 決定（誰が）／ [TARGET] 根拠のない目標値

## 1. 目的

ヒアリング回答と現行トップページの実際の取得結果から、Claude が提案と要件定義書の**下書き**を作り、担当開発者が直してから既存の「承認を依頼する」で出す。現行テンプレート（`src/features/requirements/buildProposal.ts:38-66`）の根拠のない並べ替えを置き換える。お客様は AI の生出力を見ない（D-4）。

## 2. ユーザー決定（2026-11-20。再検討しない）

| # | 決定 |
|---|---|
| U-1 | 範囲 = 提案＋要件定義書の下書き ＋ トップページ 1 枚のサイト診断。PSI は v1 に入れない（Q-3） |
| U-2 | Claude API。送るのは回答だけ（個人情報を送らない）。AI 下書き → 開発者が編集 → 承認依頼 |
| U-3 | モデル = 評価（合成ヒアリング 20 件 × 3 回 × 3 モデル、約 $18）の後、**合格する最も安いもの**。結果を見てユーザーが確定 |
| U-4 | 上限 = 案件 5 回/日・20 回/月、利用者 10 回/日、全体 200 回/月。Anthropic Workspace `afro-cms` 月 $20（設定済み）。GCP 予算アラート ¥1,000 |
| U-5 | 偽の数字は撤去済み（0.47.2 本番） |
| U-6 | Secret `ANTHROPIC_API_KEY` v3 は Secret Manager（afro-cms-4a6ff）にある。IAM は未縮小 |
| U-7 | LEGAL Q-4（同意文言・外国第三者提供・地域）と Q-7（保存期間）は未回答。**実装は進めてよい。お客様への公開は法務の結論まで止める** → 機能フラグ既定 OFF と社内限定の有効化経路を持つ（§5） |

- [DECISION lead-architect] 設計 §6 の「全体 30 回/日」[TARGET] は Q-2 の推奨案（ユーザー承認）に無いので**採らない**。全体は 200 回/月だけ。上限値は定数 1 箇所（`functions/src/ai/limits.ts`）に置き、変更はユーザー確認

## 3. 依存の追加 — `@anthropic-ai/sdk`（functions のみ）

**[DECISION lead-architect] 承認（条件つき）。**

| 観点 | 判断 |
|---|---|
| 必要性 | streaming（SSE）・`stop_reason`・request-id・型付きエラー（429/5xx/timeout）・`maxRetries:0` を自前の fetch で書くと、誤り所が増えテストも増える。公式 SDK が最小 |
| 代替 | 素の `fetch` は可能だが、SSE の分割・エラーの分類・ヘッダーの取り扱いを自作することになり、1.11（重複）と 1.3（壊さない）の観点で不利 |
| 範囲 | **`functions/` だけ**。Web バンドルに入れない（`package.json` ルートに足さない。ビルド後の `dist-live` を grep して 0 件を確認） |
| 条件 | ①版は**完全固定**（`^` なし）。`functions/package-lock.json` をコミット ②採用前に `npm view @anthropic-ai/sdk` で発行元・版・依存数を確認し記録 ③`output_config.format`（JSON Schema）・`output_config.effort`・adaptive thinking・streaming を**その版が持つこと**を公式ドキュメントで確認（[UNKNOWN] → U3 の最初の作業。無ければ Plan Review へ戻す）④`npm audit --omit=dev` の HIGH 以上 0 |
| 却下した案 | HTML 抽出・Cloud Tasks のための依存は**追加しない**（抽出は自前の最小実装、enqueue は `firebase-admin/functions` の `getFunctions().taskQueue()`。[INFERENCE: firebase-admin 14.5.1 に有る。U2 で型を確認]） |

## 4. ユニット（Write Scope は重ならない）

順序: **U1 → (U2 ∥ U3) → U4 → U5**。U5 の IAM・予算アラートは U2 のデプロイ前ならいつでも（ユーザー GO 後）。

### U1 データ: Rules と型（database-engineer）

| 項目 | 内容 |
|---|---|
| 書く | `firestore.rules`（`projects/{pid}/aiDrafts/requirements`・`aiUsage/{yyyymm}`・`validProposal` の版分け・submit の v2 一致検査）／ `src/types/aiDraft.ts`（新規。`ProposalV2`・`AiDraftDoc`・列挙と上限の定数）／ `tests/rules/aiDrafts.test.mjs`・`tests/rules/proposalV2.test.mjs`（新規） |
| 型の方針 | 既存 `Proposal`（v1。`src/types` と `petitPlan.ts:4` が使う）は**変えない**。`StoredProposal = Proposal | ProposalV2` を足す |
| 先に書くテスト（目標 ≥ 32 件） | お客様が aiDrafts を get/list 不可（3）／ 未アサイン開発者不可（2）／ 開発者が `generated`・`job`・`quota`・`usage`・`lastError`・`discardLog` を書けない（6）／ `edited` に `siteCheck`・`origin` 等を入れると拒否（3）／ `edited` の形と上限（points 6・evidence 5・openQuestions 10・文字数）超過で拒否（5）／ status≠draft で `edited` 更新不可（2）／ delete 不可（1）／ aiUsage は admin 読みのみ・書き込み全員不可（3）／ submit: v2 が `generated` のサーバー欄＋`edited` に一致すれば可（1）・`siteCheck` 偽造で拒否（1）・`origin` 偽造で拒否（1）・`edited` 不一致で拒否（1）／ v1 の既存文書の更新・submit が通る（2）／ 混在版の拒否（`version:3`・欠け）（1） |
| **Rules の式の量の計測（database-engineer）** | submit の transaction（案件・回答・approvals・accounts に `getAfter(aiDraft)` を足す）について、**最悪経路の `get()/getAfter()/exists()` の回数と式の評価数**を `tests/rules/proposalV2.test.mjs` の中で計測し、結果（回数・上限・余裕）を `docs/design/AI_REQUIREMENTS.md` §7 の注記へ書く。上限（1 リクエストあたりのドキュメント参照の上限・式の数の上限）は**公式ドキュメントの値を取り直して**根拠に添える [UNKNOWN: 値は未取得]。超えるなら設計へ戻す（BLOCKER） |
| 変えない | `accounts`・`invites`・`siteKeys`・approvals の形（`firestore.rules:327-410` の keys 一覧）・既存の `validProposal` v1 の判定内容・`gen-rules-questions.mjs` の生成範囲 |
| 検証 | `npm run rules:check` ／ `npm run test:rules`（**件数・pass・fail を報告。既存 174 件前後＋新規。fail 0**） |

### U2 関数: callable・worker・上限・サイト取得の守り（backend-engineer）

| 項目 | 内容 |
|---|---|
| 書く | `functions/src/ai/request.ts`（`requestRequirementsDraft`。設計 §2.1）／ `functions/src/ai/task.ts`（`generateRequirementsDraftTask`。§2.2）／ `functions/src/ai/authz.ts`（`roleOf` と同じ判定）／ `functions/src/ai/quota.ts`（JST 日付・加算・返金）／ `functions/src/ai/limits.ts`／ `functions/src/ai/flags.ts`（§5）／ `functions/src/ai/site/{url,ipGuard,lookup,fetch,extract,checks}.ts`（§3）／ `functions/src/index.ts` は **export 2 行と import だけ**／ `tests/functions/ai-request.test.mjs`・`ai-task.test.mjs`・`ai-site.test.mjs`（新規） |
| 関数の設定 | callable は全体既定のまま（256MiB/30s）・**Secret を結ばない**。worker だけ `secrets:[ANTHROPIC_API_KEY]`・540s・512MiB・`retryConfig.maxAttempts:1`・`maxConcurrentDispatches:2`・`maxInstances:2`。SA は既定 `afro-cms-functions@` |
| AI 呼び出し | U3 の `generateDraft(input, deps)` を**注入**で呼ぶ（契約は §4 U3）。U2 は Anthropic を直接 import しない |
| 先に書くテスト（目標 ≥ 70 件） | SSRF（設計 §8 の列挙を 1 件 1 テスト。≥ 38）／ 取得の上限（3 MB・展開後 2 MB・11 秒・PDF・robots Disallow・sitemap 有無）（6）／ 抽出（script/style/コメント/非表示の除外・12,000 字・メール電話の除去）（4）／ 認可・状態（お客様・未アサイン・無効・未確認メール・archived・admin 可・analyzed/approved・必須回答欠け・edits-exist・confirmDiscard 有無）（11）／ Idempotency・lease・上限（同一 requestId・reused 加算なし・regenerate 加算・同時 2 本で Stub 1 回・fencing・lease 切れ引き継ぎ・enqueue 失敗の返金・呼ぶ前の失敗の返金・JST 境界・日/月/利用者/全体の超過で Stub 0 回）（12）／ 失敗時の保持（ready のまま lastError・discardEdits 失敗で edited 残る・ログに本文が出ない）（3）／ フラグ OFF・allowlist 外で `failed-precondition: feature-disabled`・文書も上限も変わらない（2） |
| テストの守り | 既存と同じく `emulators:exec`・`demo-` プロジェクト。**`ANTHROPIC_API_KEY` が環境にあればテストを失敗させる**。DNS は解決関数を注入（実ネットワークに出ない）。取得先はローカルのテスト用 HTTP サーバー（解決関数で公開 IP に見せる） |
| 変えない | `provisionInvitee`・`onInviteRevoked`・`parseEmail`・`setGlobalOptions` の既定値・`ENFORCE_APP_CHECK=false`（App Check は別タスク）・`cors.ts`（callable は既存の `callableCors` をそのまま使う）・`scripts/deploy-firebase.mjs` |
| 検証 | `npm run build:functions` ／ `npm run test:functions`（件数。既存 20 件＋新規。fail 0）／ `grep -rn "ANTHROPIC\|secrets:" functions/src` で Secret を結ぶのが worker 1 箇所だけ |

### U3 AI: プロンプト・Schema・クライアント・後処理・評価の道具（ai-engineer）

| 項目 | 内容 |
|---|---|
| 書く | `functions/src/ai/prompts/PRM-REQ-001.ts`（system・user の組み立て。semver）／ `functions/src/ai/schema.ts`（`output_config.format` の JSON Schema と受け側の再検証）／ `functions/src/ai/anthropicClient.ts`（SDK の薄い包み。`maxRetries:0`・timeout 400s・streaming・ツールなし・`fallbacks` なし）／ `functions/src/ai/generateDraft.ts`（入力→呼び出し→検証→後処理。依存は引数で受ける）／ `functions/src/ai/postprocess.ts`（evidence 許可リスト・URL/メール/電話除去・`unsupportedNumbers`）／ `functions/src/ai/pricing.json`（単価。コードに焼かない）／ `src/shared/ai/redact.ts`・`src/shared/ai/answersHash.ts`（クライアントと共有する純粋関数）／ `functions/package.json`・`package-lock.json`（SDK）／ `tests/functions/ai-generate.test.mjs`（新規）／ `prototypes/ai-requirements-eval/`（評価の道具と合成データ） |
| 共有の仕方 | functions は `rootDir: src`（`functions/tsconfig.json`）で `../src` を読めない。**正は `src/shared/ai/`**、`scripts/gen-ai-shared.mjs` が `functions/src/ai/shared/` へ写し、`--check` を `test:functions` の前に走らせる（`rules:gen`/`rules:check` と同じ型）。手で二重に書かない |
| U2 との契約 | `generateDraft({answers, siteFacts, siteText, competitorHosts, config}, {client, now}) → {ok:true, proposal, usage} | {ok:false, code:'schema'|'refusal'|'max_tokens'|'rate_limited'|'upstream'|'timeout', httpStatus?, anthropicRequestId?}`。本文・メッセージ全文は返さない |
| 先に書くテスト（目標 ≥ 28 件） | Stub が 成功・形式エラー・refusal・max_tokens・429・5xx・timeout・遅延 → それぞれの code（8）／ 後処理（evidence 許可リスト・出力中の URL/メール/電話・上限の切り詰め・数字の flag）（6）／ 除去（メール・電話 4 表記・URL・郵便番号）（7）／ 送信 payload のスナップショット（q-infra・q-dns-* なし・氏名/メールなし）（2）／ `answersHash` のクライアント・サーバー一致（2）／ 費用計算が `pricing.json` から（1）／ `configHash` が model・promptVersion・effort で変わる（1）／ 本物のキーがあれば失敗（1） |
| 評価（実 API） | §6。**ユーザー GO まで実行しない** |
| 変えない | `src/features/requirements/buildProposal.ts`（フラグ OFF の経路として残す）・`src/data/requirements.ts` の質問 ID |
| 検証 | `npm run build:functions` ／ `npm run test:functions` ／ `node scripts/gen-ai-shared.mjs --check` ／ `npm audit --omit=dev --prefix functions` |

### U4 画面: 下書き・編集・古さ・状態（ui-ux-designer の画面設計 → frontend-engineer）

| 項目 | 内容 |
|---|---|
| 先にやる | ui-ux-designer が設計 §1 の 8 状態（未生成・生成中・失敗・下書きあり・確認済み・回答が変わった・AI 設定が変わった・止まった）の画面と文言を既存 UI（MUI・既存の要件画面の部品）で決める。件数・秒数・ETA の作り話を出さない |
| 書く | `src/features/requirements/aiDraft/`（新規: `AiDraftPanel.tsx`・`AiDraftEditor.tsx`・`aiDraftState.ts`＝状態の判定の純粋関数・`useAiDraft.ts`）／ `ProposalView.tsx`（v2 の描画・差し戻し後は aiDrafts の edited/generated を出す。§1）／ `requirementsDoc.ts`（v2 の描画。`esc()` を通す）／ `src/live/model.ts`（`proposalForSave`・`reqDoc` を版で分ける。`:85-102`・`:123`）／ `src/live/repositories.tsx`（submit の v2 経路。既存 `:281-293` の transaction に足す）／ `src/data/requirements.ts:56-59`（分析工程の文言を実際の工程へ）／ `AnswerInput.tsx`（「個人名・個人の連絡先を書かない。回答は外部の AI へ送られます」の注意書き。**文言の確定は LEGAL Q-4 の後**。フラグ ON の時だけ出す）／ `tests/unit/aiDraftState.test.mjs`（新規。`node --test --experimental-strip-types`） |
| 先に書くテスト（目標 ≥ 14 件） | 状態判定 8 状態（8）／ 「承認を依頼する」は edited ありの時だけ（1）／ v1・v2 の両方を描ける（`ProposalView`・`requirementsDoc`）（2）／ `proposalForSave` が v2 の欄を落とさない（1）／ AI 文がプレーンテキスト（`<script>` を含む文字列が文字のまま）（1）／ 自動保存の debounce ≥ 1 秒（1） |
| 変えない | お客様側の画面・承認の流れ（`repositories.tsx:297-307` の差し戻しの transaction の中身）・`petitPlan.ts`・デザイントークン・他の機能の画面 |
| 検証 | `npm run typecheck` ／ `npm run build:live`・`build:emulator` ／ 単体（件数）／ エミュレータで 8 状態を実際に通す（`npm run emulators` ＋ `seed:emulator`、Stub の AI。ブラウザで確認できなければ「未検証」）／ `grep -c "anthropic" dist-live` が 0 |

### U5 運用: IAM・Secret の結び付け・予算・Runbook・Cloud Tasks（platform-engineer）

| 項目 | 内容 |
|---|---|
| 書く | `docs/operations/RUNBOOK_FIREBASE.md`（新しい節「AI 下書き」: Secret の一覧・ローテーション・漏えい時の失効・フラグの切り方・上限の変え方・月 1 回の請求突き合わせ・止める手順）／ `docs/TODO.md`（保存期間の削除バッチ未実装・App Check・PSI 見送り）／ `functions/.env.afro-cms-4a6ff`（フラグの値。秘密ではない値だけ。§5） |
| 実施（**ユーザー GO の後。計画の段階では触らない**） | ①`ANTHROPIC_API_KEY` に `roles/secretmanager.secretAccessor` を**そのシークレットだけ・`afro-cms-functions@` だけ**へ（プロジェクト単位の付与が無いことを `gcloud projects get-iam-policy` で確認）②callable が enqueue するための権限（`roles/cloudtasks.enqueuer` 等。**必要なロールは公式手順で確定** [INFERENCE]）と、Cloud Tasks がワーカーを呼ぶ権限（OIDC の invoker）③Cloud Tasks API の有効化（[UNKNOWN: 有効か未確認]）④GCP 予算アラート ¥1,000（通知だけ）⑤キューは `onTaskDispatched` のデプロイで作られる [INFERENCE: 公式で確認] |
| 変えない | 他のシークレット・他の SA の権限・Hosting の設定・Anthropic Workspace の上限（$20。変えるのはユーザー） |
| 検証 | 付与前後の IAM 一覧を貼る（値・キーは貼らない）／ Secret の版は**名前と版番号だけ**を確認し、値を表示するコマンドを使わない（2026-11-20 の教訓）／ 予算アラートの画面確認 |

## 5. 機能フラグ（既定 OFF）と社内限定の有効化

| 層 | 仕組み | 既定 |
|---|---|---|
| サーバー（正） | `functions/src/ai/flags.ts` が `defineString('AI_REQUIREMENTS_MODE')`（`off`｜`internal`｜`on`）と `defineString('AI_REQUIREMENTS_PROJECT_ALLOWLIST')`（カンマ区切りの案件 ID）を読む。値は `functions/.env.<projectId>`（秘密ではない） | `off` |
| 判定 | `off` → 全員 `failed-precondition: feature-disabled`。`internal` → **admin かつ allowlist の案件だけ**。`on` → 設計どおり（開発者・admin）。**判定は callable の最初（上限の加算より前）と worker の開始時の両方** | — |
| 画面 | `VITE_FEATURE_AI_REQUIREMENTS`（`off`｜`internal`｜`on`）。`internal` は admin にだけパネルを出す。画面は見た目だけで、境界はサーバー（1.8） | `off` |
| 社内限定の経路 | 社内の試験用案件（合成データだけ。実在のお客様の回答を入れない）を 1 件作り、その ID を allowlist に入れて `internal` で出す。お客様の案件では押せない（サーバーが拒否） | — |
| お客様へ公開 | `on` は **LEGAL Q-4・Q-7 の結論、同意文言の反映、評価の結果とモデルのユーザー確定の後**。Release Readiness で GO を取る | — |
| 戻す | `off` に戻して functions を出し直す（数分）。Rules は v2 を受け付けたまま残す。v2 で出た提案はそのまま描ける（描画はフラグに関係しない。設計 §7） | — |

## 6. 評価（実 API。**ここでユーザー GO が必要**）

- 置き場: `prototypes/ai-requirements-eval/`（本番 DB・認証・API に接続しない。CLAUDE.md 5章）。合成ヒアリング 20 件（業種 6×濃淡。注入 10・PII 5 を含む）と静的なサイト HTML
- 実行: 3 モデル × 20 件 × 3 回（effort `low`）。合格基準は設計 §5.5 で**固定**（結果を見て緩めない）
- 費用: 見込み **約 $18**。道具が使用量から費用を積算し **$25 で止める**。Workspace の上限 $20 があるため、$20 を超える前に止まる可能性がある → **評価は Opus を最後に回し、Workspace 上限に当たったら Opus を減らした結果で判断するか、上限の一時引き上げをユーザーに聞く**
- キー: 評価用のキーは**ユーザーが自分の端末の環境変数に入れて実行する**（AI はキーを見ない・扱わない）。Secret Manager の本番キーを評価に使わない
- 結果: `観点 × モデル × promptVersion`・件数・失敗率・費用・所要時間を `docs/design/AI_REQUIREMENTS_EVAL.md` に書き、ユーザーに見せてモデルを確定してもらう（U-3）。盲検の採点は開発者 2 名（ユーザーが指名）
- 実 API の Smoke（本番キーで 1 回）は U5 の後、`internal` で社内試験案件に 1 回だけ

## 7. デプロイ順と Rollback

既存の入口 `npm run deploy:firebase -- --project afro-cms-4a6ff --only <対象>` を使う（functions と hosting の同時は拒否される。`scripts/deploy-firebase.mjs:47-49`）。**各段のデプロイはユーザーの了承の後**。

| 順 | 対象 | 中身 | Rollback |
|---|---|---|---|
| 0 | IAM・API・予算（U5 ①〜④） | 権限の縮小・付与・アラート | 付与を外す（追加だけなので戻せる） |
| 1 | `firestore:rules` | aiDrafts・aiUsage・v2 の受け付け（使う経路はまだ無い） | 前の Rules を出し直す（v2 文書がまだ 0 件の間は無害） |
| 2 | `functions` | 2 関数を追加。`AI_REQUIREMENTS_MODE=off` | `firebase functions:delete` で 2 関数を消す、または `off` のまま放置 |
| 3 | `hosting` | v2 を描ける画面。`VITE_FEATURE_AI_REQUIREMENTS=off` | Hosting の前の版へ戻す |
| 4 | `functions`＋`hosting`（別々） | `internal`＋allowlist に社内試験案件。Smoke 1 回 | `off` へ戻す |
| 5 | お客様公開（`on`） | §5 の条件をすべて満たしてから | `off` へ戻す。v2 で出た提案は描画が残るので壊れない |

- **戻せないもの**: Anthropic へ送ったデータ（最大 30 日保持。設計 §4）。だから 5 の前に法務の結論が要る
- Rules の v2 受け付けは、v2 の提案が 1 件でも保存された後は**外さない**（外すと既存文書の更新が拒否される）

## 8. 影響範囲（要点）

| 観点 | 内容 |
|---|---|
| 呼び出し元 | `buildProposal`（`repositories.tsx:281-293`・`ProposalView.tsx:52`・`model.ts:107`・`petitPlan.ts:56`）→ フラグ OFF では今のまま。v2 は追加の経路 |
| DB | 新規 2 コレクション。既存文書の移行・バックフィルなし（設計 §7） |
| 共有 Contract | `Proposal` v1 は不変。`StoredProposal` を足す。approvals の keys は不変 |
| 権限 | お客様は aiDrafts を読めない。開発者はサーバー欄を書けない（Rules で保証。U1） |
| 外部 | Anthropic（送信）・お客様のサイト（取得）。どちらもフラグ ON の時だけ |
| 費用 | 月 200 回の上限で Haiku 約 $1・Sonnet 約 $20・Opus 約 $39（設計 §6。未計測）。歯止めは 3 段 |

## 9. リスク

| # | リスク | 程度 | 手当て |
|---|---|---|---|
| R-1 | submit の Rules がドキュメント参照・式の上限を超える | HIGH | U1 で計測。超えたら設計へ戻す（実装を進めない） |
| R-2 | SSRF の取りこぼし（rebinding・IPv6 の表記・リダイレクト） | HIGH | 設計 §3 の守り＋§8 の列挙を 1 件 1 テスト。security-engineer が実装後に再監査 |
| R-3 | SDK の版が構造化出力・effort を持たない | MEDIUM | U3 の最初に確認。無ければ Plan Review へ戻す |
| R-4 | 最も安いモデルが基準に届かず継続費用が上がる | MEDIUM | 評価の結果でユーザーが決める。上限 200 回/月で月額の上限が決まる |
| R-5 | Cloud Tasks の権限・API が無くデプロイ後に enqueue が失敗 | MEDIUM | U5 で先に付与。失敗時は返金の transaction（U2 のテスト）。Release 前に platform-engineer が確認 |
| R-6 | プロンプトインジェクションで不適切な文が下書きに入る | MEDIUM | ツールなし・Schema・後処理・開発者の確認（D-4）。評価の注入 30 件で 0 件が合格条件 |
| R-7 | 個人名が回答に書かれて送られる | MEDIUM | 機械的に完全には除けない（設計 §4）。注意書き＋残余リスクは security-engineer の受け入れ判断 |
| R-8 | App Check 未強制（`ENFORCE_APP_CHECK=false`）で callable を叩かれる | LOW | 認証・アサイン・上限が先に効く。App Check は別タスク（`docs/TODO.md`） |
| R-9 | 共有コードの写しの食い違い（`answersHash` が両側で違う） | LOW | `gen-ai-shared --check`＋一致テスト |
| R-10 | 評価の費用が Workspace の上限に当たる | LOW | §6 の順序と上限 $25 |

## 10. UNKNOWN

| 内容 | 分類 | 扱い |
|---|---|---|
| Rules の参照・式の上限と最悪経路の値 | INVESTIGATION REQUIRED | U1 で計測（database-engineer） |
| SDK の対応版 | INVESTIGATION REQUIRED | U3 の最初 |
| Cloud Tasks の必要ロール・API の有効状態・キューの作られ方 | INVESTIGATION REQUIRED | U5（公式手順） |
| `firebase-admin/functions` の `taskQueue()` の型 | INVESTIGATION REQUIRED | U2 |
| Workspace の上限で確実に止まるか | INVESTIGATION REQUIRED | 評価の時に観察して記録 |
| 同意文言・外国第三者提供・地域（Q-4）、保存期間（Q-7） | NEED CONFIRMATION（LEGAL） | お客様公開（段 5）を止める。実装は進める |
| 評価の実行（約 $18）・採点者 2 名 | NEED CONFIRMATION（ユーザー） | §6 の時点でユーザー GO |
| 全体の日次上限を持たない | SAFE ASSUMPTION | §2 の DECISION。必要なら定数 1 箇所で足せる |

## 11. 完了条件（CLAUDE.md 3.10）

- [ ] 設計 §1〜§8 の振る舞いを満たす（AC: 設計の TASK の AC 1〜9 と §8 のテスト計画）
- [ ] テストが**件数つきで**緑: rules（既存＋≥ 32）・functions（既存＋U2 ≥ 70＋U3 ≥ 28）・unit（≥ 14）。skip 0。0 件の緑・残骸プロセスの緑を疑う
- [ ] `npm run typecheck`・`build:live`・`build:functions`・`rules:check`・`gen-ai-shared --check`・`node scripts/ai-verify.mjs`
- [ ] 回帰: 既存の rules・functions テストが全件緑。フラグ OFF で現行テンプレートの経路が変わらない（エミュレータで submit まで通す）
- [ ] 配線: `requestRequirementsDraft` の呼び出し元（画面）≥ 1・worker の enqueue 元 = callable 1 件を grep で示す
- [ ] Security: security-engineer の実装後監査（SSRF・Secret の結び付け・ログに本文が出ない・PII payload）。別系統モデルレビュー（ADR-0025。**顧客案件のコードを外部モデルへ送る前にユーザーに可否を確認**）
- [ ] Code Review（code-reviewer）。Acceptance Audit（acceptance-auditor）
- [ ] Docs: `AI_REQUIREMENTS.md` §7 に計測値・`AI_REQUIREMENTS_EVAL.md`・Runbook の節・`docs/TODO.md`・`CHANGELOG.md`・`DEVELOPMENT_PROGRESS.md`・`RELEASE_NOTES.md`
- [ ] Release Readiness（段 4・5 の前）: 実行 SA の権限一覧・Cloud Tasks の enqueue 疎通・Secret が worker だけ・`dist-live` に SDK・キーが無い・予算アラート
- [ ] お客様公開は LEGAL Q-4・Q-7 の結論と同意文言の反映の後（それまで `internal` まで）
- [ ] 学習の判断（SSRF の守り・Rules の式の量の計測値は TECHNOLOGY の候補）

## 12. Plan Review 判定欄

| 担当 | 判定 | 指摘 |
|---|---|---|
| security-engineer | （未） | |
| database-engineer | （未） | |
| backend-engineer | （未） | |
| ui-ux-designer | （未） | |
