# 実装計画: AI による提案・要件定義書の下書き ＋ 現行サイト診断

- 状態: **計画 r2（Plan Review r1 の指摘を反映）**。コード・Rules・デプロイ・Secret・IAM は未着手
- 作成: 2026-11-20 lead-architect ／ 改訂 r2: 2026-11-20（database-engineer・security-engineer の r1 = 両者 APPROVED WITH CONDITIONS、BLOCKER なし。指摘の対応表は §13）／ 規模: **XL**（外部 AI へのお客様データ送信・外部 URL 取得・Secret・継続費用）
- 設計の正: `docs/design/AI_REQUIREMENTS.md` rev1（e9dba3c）。**L-1〜L-4 とレビュー指摘の反映は確定**。この計画が設計を変えるのは §2 の L-a（worker の SA）だけ（設計へ注記を足す）。それ以外で食い違えば設計が正
- Plan Review: security-engineer（必須）＋ database-engineer（Rules）＋ backend-engineer（callable 契約）＋ ui-ux-designer（画面）。往復は 2 回まで（ADR-0055）
- ラベル: [FACT] 実物で確認 ／ [INFERENCE] 推測 ／ [UNKNOWN] 未確認 ／ [DECISION] 決定（誰が）／ [TARGET] 根拠のない目標値

## 1. 目的

ヒアリング回答と現行トップページの実際の取得結果から、Claude が提案と要件定義書の**下書き**を作り、担当開発者が直してから既存の「承認を依頼する」で出す。現行テンプレート（`src/features/requirements/buildProposal.ts:38-66`）の根拠のない並べ替えを置き換える。お客様は AI の生出力を見ない（D-4）。

## 2. 決定（再検討しない）

| # | 決定 |
|---|---|
| U-1 | [ユーザー 2026-11-20] 範囲 = 提案＋要件定義書の下書き ＋ トップページ 1 枚のサイト診断。PSI は v1 に入れない（Q-3） |
| U-2 | [ユーザー] Claude API。送るのは回答だけ（個人情報を送らない）。AI 下書き → 開発者が編集 → 承認依頼 |
| U-3 | [ユーザー] モデル = 評価（合成ヒアリング 20 件 × 3 回 × 3 モデル、約 $18）の後、**合格する最も安いもの**。結果を見てユーザーが確定 |
| U-4 | [ユーザー] 上限 = 案件 5 回/日・20 回/月、利用者 10 回/日、全体 200 回/月。Anthropic Workspace `afro-cms` 月 $20（設定済み）。GCP 予算アラート ¥1,000 |
| U-5 | [ユーザー] 偽の数字は撤去済み（0.47.2 本番） |
| U-6 | Secret `ANTHROPIC_API_KEY` v3 は Secret Manager（afro-cms-4a6ff）にある。IAM は未縮小 |
| U-7 | [ユーザー] LEGAL Q-4（同意文言・外国第三者提供・地域）と Q-7（保存期間）は未回答。**実装は進めてよい。お客様への公開は法務の結論まで止める** → 機能フラグ既定 OFF と社内限定の有効化経路（§5） |
| L-a | [lead-architect r1] **worker 専用 SA `afro-cms-ai-worker@`**。持つのは `ANTHROPIC_API_KEY` 1 本だけの `secretAccessor` と Firestore の読み書き（`roles/datastore.user`）だけ。callable と既存関数は `afro-cms-functions@` のまま（security M2）。設計 §2.2・§7.1 の SA 記述を置き換える |
| L-b | [lead-architect r1] Rules の上限を超えたときの代替 F-a / F-b（§4 U1）を**計画の手順として事前に合意**する。「設計へ戻す」にしない |
| L-c | [lead-architect r1] `on` の条件 = LEGAL Q-4・Q-7 の結論 ＋（保存期間の削除の仕組みが実装済み **または** ユーザーの書面での受け入れ）。デプロイ前の検査が、法務済みの記録の無い `MODE=on` を拒否する（security M5。§5） |
| L-d | [lead-architect] 設計 §6 の「全体 30 回/日」[TARGET] は Q-2 の推奨案（ユーザー承認）に無いので**採らない**。全体は 200 回/月だけ。上限値は定数 1 箇所（`functions/src/ai/limits.ts`）。変更はユーザー確認 |

## 3. 依存の追加 — `@anthropic-ai/sdk`（functions のみ）

**[DECISION lead-architect] 承認（条件つき）。**

| 観点 | 判断 |
|---|---|
| 必要性 | streaming（SSE）・`stop_reason`・request-id・型付きエラー（429/5xx/timeout）・`maxRetries:0` を自前の fetch で書くと誤り所とテストが増える。公式 SDK が最小 |
| 代替 | 素の `fetch` は可能だが、SSE の分割・エラーの分類を自作することになり 1.11・1.3 の観点で不利 |
| 範囲 | **`functions/` だけ**。Web バンドルに入れない（ルート `package.json` に足さない。`dist-live` を grep して 0 件） |
| 条件 | ①版は**完全固定**（`^` なし）。`functions/package-lock.json` をコミットし、採用した版をこの表に追記 ②`npm view @anthropic-ai/sdk` で発行元・版・依存数を記録。**`npm audit signatures --prefix functions` が通る**。**install scripts を持たない**（`npm view … scripts` と lock の `hasInstallScript` で確認）（security M6）③`output_config.format`・`output_config.effort`・adaptive thinking・streaming を**その版が持つこと**を公式ドキュメントで確認（[UNKNOWN] → U3 の最初。無ければ Plan Review へ戻す）④`npm audit --omit=dev` の HIGH 以上 0 ⑤**`ANTHROPIC_LOG` を設定しない**（SDK のデバッグログで本文が出ない。security M4。デプロイの env に無いことを U5 で確認） |
| 却下した案 | HTML 抽出・Cloud Tasks のための依存は**追加しない**（抽出は自前、enqueue は `firebase-admin/functions` の `taskQueue()`。[INFERENCE: firebase-admin 14.5.1 に有る。U2 で型を確認]） |
| **採用した版（U3 2026-11-20 ai-engineer）** | `@anthropic-ai/sdk` **1.11.0**（`^` なし。2026-11-19 公開・latest。発行元 npm の anthropic メンテナ。直接依存 3: `json-schema-to-ts`・`standardwebhooks`・`@opentelemetry/api`。lock の追加 7 パッケージ）。[FACT 型定義 `resources/messages/messages.d.ts`] `OutputConfig.format`（`json_schema`）・`OutputConfig.effort`（low〜max）・`ThinkingConfigAdaptive`・`messages.stream()`＋`finalMessage()`・`request_id`・型付きエラー・`maxRetries`/`timeout` を持つ ／ `npm audit --omit=dev` 0 件 ／ `npm audit signatures` 214 verified・21 attestations ／ install scripts: 追加分 0（lock の `hasInstallScript` は既存の `@firebase/util`・`protobufjs` だけ）／ `ANTHROPIC_LOG` 等の環境変数に左右されないよう、クライアントは `apiKey`・`baseURL` を明示し `logLevel:"off"`・`openTelemetry:false`（`functions/src/ai/anthropicClient.ts`）／ `dist-live` に 0 件（grep） |

## 4. ユニット（Write Scope は重ならない）

順序: **U1 → (U2 ∥ U3) → U4 → U5**。U5 の IAM・予算アラートは U2 のデプロイ前ならいつでも（ユーザー GO 後）。

### U1 データ: Rules と型（database-engineer）

| 項目 | 内容 |
|---|---|
| 書く | `firestore.rules`（`projects/{pid}/aiDrafts/requirements`・`aiUsage/{yyyymm}`・`validProposal` の版分け・submit の v2 一致検査）／ `src/types/aiDraft.ts`（新規。`ProposalV2`・`AiDraftDoc`・列挙と上限の定数）／ `tests/rules/aiDrafts.test.mjs`・`tests/rules/proposalV2.test.mjs`（新規）／ `tests/rules/mutation.test.mjs`（定数の食い違い検査を追加）／ `docs/design/AI_REQUIREMENTS.md` §7 の計測値の注記 |
| 型の方針 | 既存 `Proposal`（v1。`src/types` と `petitPlan.ts:4` が使う）は**変えない**。`StoredProposal = Proposal | ProposalV2` を足す |
| `edited` の Rules（HIGH-3） | 開発者の更新は ①`proj(pid)` の `requirements.status=='draft'` **かつ** `getAfter(reqPath(pid))` も `draft`（同じ batch で submit と同時に編集させない）②`ch.hasOnly(['edited','editedAt','editedBy','updatedAt','updatedBy'])` ③`edited.keys().hasOnly(['summary','points','draft'])` と形・上限 ④`points[].evidence` は**許可リスト**（`site_facts` のキーと送る質問 ID）の中だけ（`hasOnly(allowlist)`）。**admin の `edited` 書き込みは拒否**（admin は L-4 の再生成だけ。関数経由）。delete 不可 |
| `flags` の置き場（HIGH-3） | `flags.unsupportedNumbers` は **`generated.flags` にだけ置く**（サーバー欄）。`edited` に持たない（`edited.keys()` の hasOnly で拒否）。submit の一致検査は**提案（ProposalV2）に `flags` を含めない**（お客様へ出す提案に flag は不要）→ 等式は「`generated` のサーバー欄（flags を除く）＋`edited` の 3 欄」で比べる |
| submit の検査（MEDIUM-2） | v2 の submit は、提案を**1 つのマップリテラル**で組み立てて `d.proposal == {version:2, hostname: g.hostname, …, summary: e.summary, points: e.points, draft: e.draft}` の等式 1 本で比べる（`g = getAfter(aiDraft).generated`、`e = …edited`）。`aiDraft` 文書・`generated`・`edited` のどれかが無ければ拒否。v2 は**生成時の** `purposes`・`improves` を持つ（submit 時の回答から作り直さない。回答が変わったことは画面の「回答が変わった」で知らせる＝設計 §1）（LOW） |
| 上限を超えたときの代替（L-b。どちらもフラグの内側） | **F-a**（`edited` 更新が上限超過）: `saveAiDraftEdits` callable が検証して Admin SDK で書く。aiDrafts のクライアント書き込みは `write: false` ／ **F-b**（submit が上限超過）: `submitRequirementsV2` callable が Admin の transaction で提案を組み立て、`devTransition`（`firestore.rules:216`）と `submitOrWithdrawOk`（同 `:354`）と**同じ不変条件**（status 遷移・revision・approvals の写し・keys）をコードで再現する。クライアントの submit Rules は v1 だけを受け付ける。F-a/F-b を採ったら U2 の Write Scope に足し、テストは U1 の該当テストを callable 版に写す |
| 先に書くテスト（目標 **≥ 42 件**） | お客様が aiDrafts を get/list 不可（3）／ 未アサイン開発者不可（2）／ 開発者が `generated`・`job`・`quota`・`usage`・`lastError`・`discardLog` を書けない（6）／ **admin の `edited` 書き込み拒否（1）**／ `edited` に `siteCheck`・`origin`・`flags` を入れると拒否（3）／ `edited` の形と上限超過（points 7・evidence 6・openQuestions 11・文字数）で拒否（5）／ evidence の許可リスト外で拒否（1）／ status≠draft で更新不可（2）／ **同じ batch で edit＋submit が拒否（1）**／ delete 不可（1）／ **最大の payload の `edited` 更新が通る（allow。上限ちょうど）（1）**／ aiUsage: admin の get・list 可、開発者・お客様の get/list 不可、全員 write 不可（4）／ submit: v2 一致で可（1）・**最大の payload の submit が通る（allow）（1）**・`siteCheck` 偽造（1）・`origin` 偽造（1）・`edited` 不一致（1）・**aiDraft 無し（1）・`generated` 無し（1）・`edited` 無し（1）・`state=='failed'` の aiDraft で拒否（1）・`version:1` で v2 の形（1）**／ **お客様の approve で v2 が写る（1）**／ **withdraw → 再 submit（1）**／ v1 の既存文書の更新・submit が通る（2）／ `version:3`・欠け（1） |
| **Rules の式の量の計測（database-engineer。HIGH-1・MEDIUM-1）** | **2 経路とも**計測する: ①`edited` 更新 ②submit（案件・回答・approvals・accounts に `getAfter(aiDraft)` を足した最悪経路）。どちらも**最大の payload の allow テスト**で測る（拒否で早く切れる経路で測らない）。計測はエミュレータの **ruleCoverage レポート**（`/emulator/v1/projects/demo-…:ruleCoverage.html`）で get/getAfter/exists の回数と評価された式を読み、**上限に対する余裕（数値）**を `AI_REQUIREMENTS.md` §7 に記録。上限（1 リクエストのドキュメント参照・式の数）は**公式ドキュメントから取り直して**出典と日付を添える [UNKNOWN: 未取得]。超える／余裕が 20% [TARGET] 未満なら F-a / F-b を採る |
| 定数の食い違い（MEDIUM-3） | Rules の上限（points 6・evidence 5・openQuestions 10・siteCheck.items 12・discardLog 10・文字数）と `src/types/aiDraft.ts` の定数が一致することを `mutation.test.mjs` に足す（Rules の本文から数値を読んで比べる）。または `gen-rules-questions.mjs` の生成範囲に入れる（database-engineer が選ぶ） |
| 変えない | `accounts`・`invites`・`siteKeys`・approvals の形（`firestore.rules:327-410` の keys 一覧）・既存の `validProposal` v1 の判定内容 |
| 検証 | `npm run rules:check` ／ `npm run test:rules`（**件数・pass・fail。既存 174 件前後＋新規 ≥ 42。fail 0**）／ ruleCoverage の数値 |

### U2 関数: callable・worker・上限・サイト取得の守り（backend-engineer）

| 項目 | 内容 |
|---|---|
| 書く | `functions/src/ai/request.ts`（`requestRequirementsDraft`。設計 §2.1）／ `functions/src/ai/task.ts`（`generateRequirementsDraftTask`。§2.2）／ `functions/src/ai/authz.ts`（`roleOf` と同じ判定）／ `functions/src/ai/quota.ts`（JST・加算・返金）／ `functions/src/ai/limits.ts`／ `functions/src/ai/flags.ts`（§5）／ `functions/src/ai/site/{url,ipGuard,lookup,fetch,extract,checks}.ts`（§3）／ `functions/src/index.ts` は **export 2 行と import だけ**／ `tests/functions/ai-request.test.mjs`・`ai-task.test.mjs`・`ai-site.test.mjs`・`ai-flags.test.mjs`・`ai-logs.test.mjs`（新規）。F-a/F-b を採ったらその callable もここ |
| 関数の設定 | callable は全体既定（256MiB/30s・SA `afro-cms-functions@`）・**Secret を結ばない**。worker だけ `serviceAccount: 'afro-cms-ai-worker@'`（L-a）・`secrets:[ANTHROPIC_API_KEY]`・540s・512MiB・`retryConfig.maxAttempts:1`・`maxConcurrentDispatches:2`・`maxInstances:2` |
| AI 呼び出し | U3 の `generateDraft(input, deps)` を**注入**で呼ぶ（契約は U3）。U2 は Anthropic を直接 import しない |
| **SSRF のテスト（H1。1 件 1 テスト・名前つき）** | **拒否**: IP リテラル `127.0.0.1`・`127.1`・`0177.0.0.1`・`0x7f000001`・`2130706433`・`0.0.0.0`・`0.1.2.3`（0/8）・`10.0.0.1`・`100.64.0.1`・`169.254.169.254`・`172.16.0.1`・`192.0.0.1`・`192.0.2.1`・`192.88.99.1`・`192.168.0.1`・`198.18.0.1`・`198.51.100.1`・`203.0.113.1`・`224.0.0.1`（224/4）・`240.0.0.1`（240/4）・`255.255.255.255`・`[::]`・`[::1]`・`[::127.0.0.1]`・`[::ffff:127.0.0.1]`・`[64:ff9b::7f00:1]`・`[64:ff9b:1::1]`・`[100::1]`・`[2001::1]`（Teredo）・`[2001:db8::1]`・`[2002:7f00:1::]`・`[fc00::1]`・`[fd00::1]`・`[fe80::1]`・`[fec0::1]`・`[ff02::1]`・`[4000::1]`（2000::/3 の外）／ **名前**: `localhost`・`localhost.`・`LOCALHOST`・`metadata.google.internal`・`metadata.google.internal.`・**公開名なのに私設の A を返す**・**私設の AAAA を返す**・`all:true` で公開と私設を混ぜて返す・1 回目公開/2 回目私設（rebinding）／ **URL**: `file:`・`ftp:`・`gopher:`・ポート 22・ポート 8080・`user:pass@` ／ **リダイレクト**: 公開→私設・ポートを変える・4 回目・https→http・**プロトコル相対の Location（`//127.0.0.1/`）**・**相対の Location（解決後に再検査）**・**`file:` への Location** ／ robots.txt・sitemap.xml の取得でも私設へ向かえば拒否 ／ **許可**: 公開 IPv4 1 件・公開 IPv6 1 件（正常に取れる） |
| フラグのテスト（H3） | MODE 未設定・空文字・未知の値 → `off` 扱い ／ コードの既定が `off` ／ `internal` で admin 以外は拒否 ／ `internal` で admin でも allowlist 外は拒否 ／ allowlist が空なら `internal` でも全拒否 ／ **enqueue 後・worker 開始前にフラグが `off` へ変わった → Stub 0 回・上限の返金・lease 解除** ／ off・allowlist 外で文書も上限も変わらない |
| ログのテスト（M4。canary） | 回答に canary 文字列、サイト本文に別の canary、環境に偽のキー `sk-ant-canary…` を入れて生成・失敗の全経路を通し、**ログ（`logger` の捕捉）・`lastError`・`HttpsError` のメッセージ**のどれにも canary が無いこと |
| 先に書くテスト（目標 **≥ 95 件**） | SSRF（上の列挙。≥ 62）／ 取得の上限（3 MB・展開後 2 MB・11 秒・PDF・robots Disallow・sitemap 有無）（6）／ 抽出（script/style/コメント/非表示・12,000 字・メール電話の除去）（4）／ 認可・状態（お客様・未アサイン・無効・未確認メール・archived・admin 可・analyzed/approved・必須回答欠け・edits-exist・confirmDiscard 有無）（11）／ Idempotency・lease・上限（同一 requestId・reused 加算なし・regenerate 加算・同時 2 本で Stub 1 回・fencing・lease 切れ引き継ぎ・enqueue 失敗の返金・呼ぶ前の失敗の返金・JST 境界・日/月/利用者/全体の超過で Stub 0 回）（12）／ 失敗時の保持（2）／ フラグ（7）／ ログ canary（1 以上） |
| テストの守り | 既存と同じく `emulators:exec`・`demo-`。**`ANTHROPIC_API_KEY` が環境にある、または `functions/.secret.local` が存在すればテストを失敗させる**（M1）。DNS は解決関数を注入（実ネットワークに出ない）。取得先はローカルのテスト用 HTTP サーバー（解決関数で公開 IP に見せる） |
| 変えない | `provisionInvitee`・`onInviteRevoked`・`parseEmail`・`setGlobalOptions` の既定値・`ENFORCE_APP_CHECK=false`（別タスク）・`cors.ts`（既存の `callableCors` を使う）・`scripts/deploy-firebase.mjs`（§5 の検査は U5 が足す） |
| 検証 | `npm run build:functions` ／ `npm run test:functions`（件数。既存 20 件＋新規。fail 0）／ `grep -rn "secrets:\|afro-cms-ai-worker" functions/src` で Secret と worker SA が worker 1 箇所だけ |

### U3 AI: プロンプト・Schema・クライアント・後処理・評価の道具（ai-engineer）

| 項目 | 内容 |
|---|---|
| 書く | `functions/src/ai/prompts/PRM-REQ-001.ts`／ `functions/src/ai/schema.ts`（`output_config.format` の Schema と受け側の再検証）／ `functions/src/ai/anthropicClient.ts`（`maxRetries:0`・timeout 400s・streaming・ツールなし・`fallbacks` なし）／ `functions/src/ai/generateDraft.ts`／ `functions/src/ai/postprocess.ts`（evidence 許可リスト・URL/メール/電話除去・`flags.unsupportedNumbers` を `generated.flags` へ）／ `functions/src/ai/pricing.json`／ `src/shared/ai/redact.ts`・`src/shared/ai/answersHash.ts`／ `functions/package.json`・`package-lock.json`（SDK）／ `tests/functions/ai-generate.test.mjs`／ `prototypes/ai-requirements-eval/`（道具と合成データ。**結果の出力先は `.gitignore` に入れる**。L1） |
| 共有の仕方 | functions は `rootDir: src` で `../src` を読めない。**正は `src/shared/ai/`**、`scripts/gen-ai-shared.mjs` が `functions/src/ai/shared/` へ写し、`--check` を `test:functions` の前に走らせる（`rules:gen`/`rules:check` と同じ型） |
| U2 との契約 | `generateDraft({answers, siteFacts, siteText, competitorHosts, config}, {client, now}) → {ok:true, proposal, flags, usage} | {ok:false, code:'schema'|'refusal'|'max_tokens'|'rate_limited'|'upstream'|'timeout', httpStatus?, anthropicRequestId?}`。本文・メッセージ全文は返さない |
| 先に書くテスト（目標 ≥ 28 件） | Stub の 8 結果 → code（8）／ 後処理（6）／ 除去（7）／ 送信 payload のスナップショット（q-infra・q-dns-* なし・氏名/メールなし）（2）／ `answersHash` の一致（2）／ 費用計算が `pricing.json` から（1）／ `configHash`（1）／ 本物のキーがあれば失敗（1） |
| 評価（実 API） | §6。**ユーザー GO まで実行しない** |
| 変えない | `buildProposal.ts`（フラグ OFF の経路）・`src/data/requirements.ts` の質問 ID |
| 検証 | `npm run build:functions` ／ `npm run test:functions` ／ `node scripts/gen-ai-shared.mjs --check` ／ `npm audit --omit=dev --prefix functions` ／ `npm audit signatures --prefix functions` |

### U4 画面: 下書き・編集・古さ・状態（ui-ux-designer の画面設計 → frontend-engineer）

| 項目 | 内容 |
|---|---|
| 先にやる | ui-ux-designer が設計 §1 の 8 状態の画面と文言を既存 UI（MUI・既存の要件画面の部品）で決める。件数・秒数・ETA の作り話を出さない。`flags.unsupportedNumbers` の強調表示を含む |
| 書く | `src/features/requirements/aiDraft/`（`AiDraftPanel.tsx`・`AiDraftEditor.tsx`・`aiDraftState.ts`・`useAiDraft.ts`）／ `ProposalView.tsx`（v2 の描画・差し戻し後は aiDrafts の edited/generated）／ `requirementsDoc.ts`（v2。`esc()`）／ `src/live/model.ts`（`proposalForSave`・`reqDoc` を版で分ける。`:85-102`・`:123`）／ `src/live/repositories.tsx`（submit の v2 経路。`:281-293`。F-b を採ったら callable 呼び出しに替える）／ `src/data/requirements.ts:56-59`（分析工程の文言）／ `AnswerInput.tsx`（外部 AI への送信の注意書き。**文言の確定は LEGAL Q-4 の後**。フラグ ON の時だけ）／ `tests/unit/aiDraftState.test.mjs` |
| 先に書くテスト（目標 ≥ 14 件） | 状態判定 8（8）／ 「承認を依頼する」は edited ありだけ（1）／ v1・v2 の描画（2）／ `proposalForSave` が v2 を落とさない（1）／ プレーンテキスト（1）／ debounce ≥ 1 秒（1） |
| 変えない | お客様側の画面・差し戻しの transaction（`repositories.tsx:297-307`）・`petitPlan.ts`・デザイントークン・他の機能の画面 |
| 検証 | `npm run typecheck` ／ `build:live`・`build:emulator` ／ 単体（件数）／ エミュレータで 8 状態を通す（Stub の AI。ブラウザで確認できなければ「未検証」）／ `dist-live` に `anthropic` が 0 件 |

### U5 運用: IAM・Secret・予算・Runbook・Cloud Tasks・デプロイ前の検査（platform-engineer）

| 項目 | 内容 |
|---|---|
| 書く | `docs/operations/RUNBOOK_FIREBASE.md`（節「AI 下書き」: Secret の一覧・ローテーション・漏えい時の失効・フラグの切り方・上限の変え方・月 1 回の請求突き合わせ・止める手順・Hosting の戻し先の下限）／ `docs/TODO.md`（保存期間の削除バッチ・App Check・PSI 見送り）／ フラグの値の置き場（M1。下記）／ `scripts/deploy-firebase.mjs` に **`MODE=on` の拒否**（L-c）とテスト／ `docs/design/AI_REQUIREMENTS.md` §2.2・§7.1 へ L-a の注記／ `.gitignore` |
| フラグの値の置き場（M1） | `.gitignore:7` の `.env*` が `functions/.env.<projectId>` を隠す [FACT]。→ **`!functions/.env.afro-cms-4a6ff` の例外を `.gitignore` に足してコミットする**（秘密ではない値だけ。`MODE` と allowlist）。コードの既定は `off`（ファイルが無くても off）。`functions/.secret.local` は `.gitignore` に明示し、存在すればテストが失敗（U2） |
| `MODE=on` の拒否（L-c・M5） | `deploy:firebase --only functions` の前に `functions/.env.<project>` を読み、`MODE=on` なら **`docs/legal/AI_REQUIREMENTS_LEGAL_CLEARANCE.md`（法務の結論・日付・保存期間の扱い＝削除の実装済みかユーザーの書面受け入れ、を書く記録）が無ければ止める**。記録はユーザーが内容を承認してから作る |
| 実施（**ユーザー GO の後**） | ①**棚卸し（M3）**: プロジェクト単位の `secretmanager.secretAccessor` を持つ主体と、他のシークレットとその利用者を `gcloud projects get-iam-policy`・`gcloud secrets list` で一覧（値は出さない）。外して壊れるものが無いことを確かめてから外す ②`afro-cms-ai-worker@` を作り、`ANTHROPIC_API_KEY` に**だけ** `secretAccessor`、プロジェクトに `roles/datastore.user` ③**Cloud Tasks の IAM（H2）**: callable の SA `afro-cms-functions@` に `roles/cloudtasks.enqueuer` と、OIDC トークンに使う SA への `roles/iam.serviceAccountUser`。worker（Cloud Run の実体）の `run.invoker` は**その OIDC の SA だけ**（`allUsers`・`allAuthenticatedUsers` なし）。具体のロールと OIDC SA は公式手順で確定して Runbook に書く ④Cloud Tasks API の有効化（[UNKNOWN: 有効か未確認]）⑤GCP 予算アラート ¥1,000（通知だけ）⑥キューは `onTaskDispatched` のデプロイで作られる [INFERENCE: 公式で確認] ⑦デプロイの env に `ANTHROPIC_LOG` が無い |
| 変えない | 他のシークレット・（棚卸しで必要と分かった）他の SA の権限・Hosting の設定・Anthropic Workspace の上限（変えるのはユーザー） |
| 検証 | 付与前後の IAM 一覧を貼る（値・キーは貼らない）／ **Release Gate: worker と secret の `get-iam-policy` 出力に `allUsers`・`allAuthenticatedUsers` が無い**／ Secret は名前と版番号だけ確認し、値を表示するコマンドを使わない（2026-11-20 の教訓）／ `deploy-firebase` のテスト（`MODE=on` で記録なし → 拒否、記録あり → 通る、`off`/`internal` → 通る） |

## 5. 機能フラグ（既定 OFF）と社内限定の有効化

| 層 | 仕組み | 既定 |
|---|---|---|
| サーバー（正） | `functions/src/ai/flags.ts` が `defineString('AI_REQUIREMENTS_MODE')`（`off`｜`internal`｜`on`。それ以外・未設定・空は `off`）と `defineString('AI_REQUIREMENTS_PROJECT_ALLOWLIST')` を読む。値は `functions/.env.afro-cms-4a6ff`（コミット。U5 M1） | `off` |
| 判定 | `off` → `failed-precondition: feature-disabled`。`internal` → **admin かつ allowlist の案件だけ**（allowlist 空なら全拒否）。`on` → 設計どおり。**判定は callable の最初（上限の加算より前）と worker の開始時の両方**（worker で off なら返金して終わる） | — |
| 画面 | `VITE_FEATURE_AI_REQUIREMENTS`（`off`｜`internal`｜`on`）。`internal` は admin にだけパネルを出す。境界はサーバー（1.8） | `off` |
| 編集の判定（`internal`） | **[DECISION lead-architect 2026-11-20]** `saveAiDraftEdits` は `internal` で **allowlist の案件 ＋ アサインされた開発者**だけ（admin・お客様は不可。役割は authz、案件は `flags.ts` の `editAllowed`）。生成の「admin だけ」を編集に当てはめると、社内試験で 生成→編集→承認依頼 を通せないため（U2 の提案を承認） | — |
| 社内限定の経路 | 社内の試験用案件（**合成データだけ**）を 1 件作り、その ID を allowlist に入れて `internal` で出す。お客様の案件では押せない | — |
| お客様へ公開（`on`） | **L-c**: LEGAL Q-4・Q-7 の結論 ＋（削除の仕組み実装済み または ユーザーの書面受け入れ）＋ 同意文言の反映 ＋ 評価結果とモデルのユーザー確定 ＋ **R-7 の security 再レビュー** ＋ Release Readiness の GO。`deploy-firebase` が記録の無い `on` を拒否 | — |
| 戻す | `off` に戻して functions を出し直す。Rules は v2 を受け付けたまま。v2 の提案は描ける（描画はフラグに関係しない） | — |

- **受け入れたリスク SEC-L4**（security 2026-11-24）: worker はフラグを見直すとき、押下時に job へ保存した役割（`job.role`）で判定する（押下後に役割が変わっても worker の判定は変わらない）。押下から worker 開始までは秒単位で、`off` への切り替えは役割に関係なく止まるため受け入れる

## 6. 評価（実 API。**ここでユーザー GO が必要**）

- 置き場: `prototypes/ai-requirements-eval/`（本番 DB・認証・API に接続しない）。合成ヒアリング 20 件（業種 6×濃淡。注入 10・PII 5）と静的なサイト HTML。**結果ファイルは gitignore**（L1）
- 実行: 3 モデル × 20 件 × 3 回（effort `low`）。合格基準は設計 §5.5 で**固定**
- 費用: 見込み **約 $18**。道具が費用を積算し **$25 で止める**。Workspace 上限 $20 に先に当たりうる → **Opus を最後に回す**。当たったら Opus を減らした結果で判断するか、上限の一時引き上げをユーザーに聞く
- キー: **評価専用のキー**をユーザーが作り、自分の端末の環境変数で実行（AI はキーを見ない）。本番キーを使わない。**評価が終わったらユーザーがその評価キーを Console で失効させる**（L1）
- **注入ケースに class で隠した文（SEC-M2）を含める**: CSS の class（`.hidden`・`.sr-only` 等）で見えなくした本文の指示は、サイト本文の抽出（`site/extract.ts`）で落とせない。評価の注入ケースに class-hidden の注入を入れ、0 件を合格条件に含める
- 結果: `docs/design/AI_REQUIREMENTS_EVAL.md`（集計だけ。生の出力は入れない）。ユーザーがモデルを確定（U-3）。盲検の採点は開発者 2 名（ユーザーが指名）
- 実 API の Smoke（本番キーで 1 回）は U5 の後、`internal` で社内試験案件に 1 回だけ

## 7. デプロイ順と Rollback

入口は `npm run deploy:firebase -- --project afro-cms-4a6ff --only <対象>`（functions と hosting の同時は拒否。`scripts/deploy-firebase.mjs:47-49`）。**各段はユーザーの了承の後**。

| 順 | 対象 | 中身 | Rollback |
|---|---|---|---|
| 0 | IAM・API・予算（U5 ①〜⑦） | 棚卸し → 縮小・worker SA・Tasks の権限・アラート | 付与を外す。外した権限は棚卸しの一覧から戻す |
| 1 | `firestore:rules` | aiDrafts・aiUsage・v2 の受け付け | 前の Rules（v2 文書が 0 件の間だけ） |
| 2 | `functions` | 2 関数を追加。`MODE=off` | `firebase functions:delete` で 2 関数、または off のまま |
| 3 | `hosting` | v2 を描ける画面。`VITE_…=off` | Hosting の前の版へ |
| 4 | `functions`→`hosting`（別々） | `internal`＋allowlist。Smoke 1 回 | `off` へ戻す |
| 5 | お客様公開（`on`） | §5 の条件すべて | `off` へ戻す |

- **戻せないもの**: Anthropic へ送ったデータ（最大 30 日保持）。だから 5 の前に法務の結論が要る
- Rules の v2 受け付けは、v2 の提案が 1 件でも保存された後は**外さない**
- **Hosting の戻し先の下限（MEDIUM-4）**: v2 の提案が 1 件でも保存された後は、**段 3 のビルドより前の版へ戻さない**（v2 を描けない画面になる）。Runbook に書く

### 7.1 U1 の計測結果: Rules の式の量と参照の数（database-engineer 2026-11-20）

- **公式の上限**（[FACT 2026-11-20 WebFetch https://firebase.google.com/docs/firestore/security/rules-structure]）: 1 リクエストで評価する式 **1,000**／`exists()`・`get()`・`getAfter()` は単一文書・クエリ **10**、複数文書の読み取り・transaction・batch **20**（各操作にも 10 が掛かる）。キャッシュされた呼び出しは数えない場合がある。関数の呼び出しの深さ 20・`let` 10/関数
- 計測の方法: エミュレータ（firebase-tools 15.35・demo-afro-cms）で、**最大の payload の allow テスト**に式の詰め物（`pad10()` = 比較 10 個の関数）と存在しない文書への `exists()` を足し、通る最大数を二分探索した。ruleCoverage（`/emulator/v1/projects/demo-afro-cms:ruleCoverage`）は AST の節ごとの累計で、エミュレータが打ち切る数とは一致しない（例: 節の合計 1,145 で許可、1,097 で拒否）ため、余裕の判定には使わず内訳の確認だけに使った [FACT: probe の出力]

| 経路 | 結果 | 余裕 |
|---|---|---|
| ① 開発者の `edited` 更新（ポイント 6×上限・根拠 5・下書き 7 欄×800・未確定 10×200） | **1,000 式の上限で拒否**。文字列の検査を区切り文字でつないで正規表現 1 回にまとめ、`is map`/`is list` を省いた書き方でも、ポイント 5 件＋未確定 0 件までしか通らない（5 件＋未確定 10 件・6 件は拒否） | **なし（超過）** → **代替 F-a を採用** |
| ② v2 の submit（案件・回答・approvals・accounts＋`getAfter(aiDraft)`。全 20 問上限＋generated・edited とも上限ちょうど） | 許可。詰め物は trivial な書き込み（aiUsage の admin 更新）で `pad10()` 12 個、v2 submit で 10 個まで通る → submit の消費は概算 120〜240 式（1 個 ≒ 77〜83 式から逆算）[INFERENCE] | 式 **約 76% 以上**／参照: requirements/current の更新に存在しない文書の `exists()` を **さらに 8 個**足せる（trivial な操作と同じ。各操作 10 の上限に対し残り 8） |

- **[DECISION database-engineer U1・計画 L-b の事前合意どおり] F-a を採る**: `aiDrafts` は**クライアントから作成・更新・削除できない**（`allow create, update, delete: if false`）。`edited` の検査と保存は **callable `saveAiDraftEdits`（Admin SDK）を U2 の Write Scope に足す**。U2 が写すテスト: `tests/rules/aiEditedCases.mjs`（許可 4・拒否 17）と、前提（アサインされた開発者だけ・admin 不可・要件が draft・generated がある・サーバー欄に触れない・**submit と同時に保存させない＝transaction で status=draft を確かめる**）
- **F-b は不要**: v2 の submit はクライアントの batch のまま（`validStoredProposal` → `proposalV2Ok` の等式 1 本）。submit は edited を検証しないが、edited を書けるのは F-a の callable だけなので、提案の中身は callable の検査を通ったものになる
- 計測の probe はリポジトリに入れていない（scratchpad）。Rules を変えたら同じ方法で測り直す

## 8. 影響範囲（要点）

| 観点 | 内容 |
|---|---|
| 呼び出し元 | `buildProposal`（`repositories.tsx:281-293`・`ProposalView.tsx:52`・`model.ts:107`・`petitPlan.ts:56`）→ フラグ OFF では今のまま |
| DB | 新規 2 コレクション。移行・バックフィルなし |
| 共有 Contract | `Proposal` v1 は不変。`StoredProposal` を足す。approvals の keys は不変 |
| 権限 | お客様は aiDrafts を読めない。開発者はサーバー欄を書けない。admin は `edited` を書けない。Secret を読めるのは worker SA だけ |
| 外部 | Anthropic（送信）・お客様のサイト（取得）。フラグ ON の時だけ |
| 費用 | 月 200 回の上限で Haiku 約 $1・Sonnet 約 $20・Opus 約 $39（設計 §6。未計測）。歯止め 3 段 |

## 9. リスク

| # | リスク | 程度 | 手当て |
|---|---|---|---|
| R-1 | Rules がドキュメント参照・式の上限を超える | HIGH | U1 で 2 経路を最大 payload で計測。超えたら F-a / F-b（L-b） |
| R-2 | SSRF の取りこぼし | HIGH | §4 U2 の名前つき列挙。security-engineer が実装後に再監査 |
| R-3 | SDK の版が構造化出力・effort を持たない | MEDIUM | U3 の最初に確認。無ければ Plan Review へ戻す |
| R-4 | 最も安いモデルが基準に届かない | MEDIUM | 評価の結果でユーザーが決める。上限 200 回/月 |
| R-5 | Cloud Tasks の権限・API 不足で enqueue 失敗、または worker が公開される | MEDIUM | U5 ③ と Release Gate の `get-iam-policy`。失敗時は返金（U2） |
| R-6 | プロンプトインジェクション | MEDIUM | ツールなし・Schema・後処理・開発者の確認。評価の注入 30 件で 0 件 |
| R-7 | 個人名が回答に書かれて送られる | MEDIUM | **残余リスクの受け入れは `internal`（合成データ）に限る**（security L3）。`on` の前に security-engineer が再レビュー |
| R-8 | App Check 未強制 | LOW | 認証・アサイン・上限が先に効く。別タスク |
| R-9 | 共有コードの写しの食い違い | LOW | `gen-ai-shared --check`＋一致テスト |
| R-10 | 評価の費用が Workspace の上限に当たる | LOW | §6 の順序と上限 $25 |
| R-11 | プロジェクト単位の secretAccessor を外して既存の何かが壊れる | LOW | U5 ① の棚卸しを先に（M3） |

## 10. UNKNOWN

| 内容 | 分類 | 扱い |
|---|---|---|
| Rules の参照・式の上限と最悪経路の値 | INVESTIGATION REQUIRED | U1（公式値の取り直し＋ruleCoverage） |
| SDK の対応版・install scripts の有無 | INVESTIGATION REQUIRED | U3 の最初 |
| Cloud Tasks の具体ロール・OIDC の SA・API の有効状態・キューの作られ方 | INVESTIGATION REQUIRED | U5（公式手順） |
| `taskQueue()` の型 | INVESTIGATION REQUIRED | U2 |
| Workspace の上限で確実に止まるか | INVESTIGATION REQUIRED | 評価の時に観察して記録 |
| Q-4・Q-7 | NEED CONFIRMATION（LEGAL） | 段 5 を止める（L-c）。実装は進める |
| 評価の実行（約 $18）・採点者 2 名・評価キーの作成と失効 | NEED CONFIRMATION（ユーザー） | §6 の時点でユーザー GO |
| 全体の日次上限を持たない | SAFE ASSUMPTION | L-d |

## 11. セキュリティ対応表（T-xx ↔ TEST-xx。security L2）

| T | 脅威・要件（出所） | 計画の手順 | TEST |
|---|---|---|---|
| T-01 | 私設・特殊用途アドレスへの到達（設計 S-H1） | U2 `ipGuard.ts` | TEST-01 U2 SSRF のリテラル・IPv6・名前・URL（≥ 52） |
| T-02 | DNS rebinding・全アドレス検査（設計 S-H2） | U2 `lookup.ts`・`agent:false` | TEST-02 rebinding・`all:true` 混在・私設 A/AAAA |
| T-03 | リダイレクト経由の到達 | U2 `fetch.ts` | TEST-03 リダイレクト 7 件 |
| T-04 | 巨大応答・gzip bomb・遅延 | U2 `fetch.ts` | TEST-04 取得の上限 6 件 |
| T-05 | Secret の広い付与（設計 S-M3・L-a） | U5 ①② | TEST-05 IAM 一覧（Release Gate）・grep で worker 1 箇所 |
| T-06 | worker・キューの公開（H2） | U5 ③ | TEST-06 `get-iam-policy` に allUsers/allAuthenticatedUsers なし |
| T-07 | 本文・キーのログ漏れ（M4） | U2・U3・`ANTHROPIC_LOG` なし | TEST-07 canary |
| T-08 | 個人情報の送信（設計 §4） | U3 `redact.ts`・payload の組み立て | TEST-08 除去 7 件・payload スナップショット |
| T-09 | プロンプトインジェクション（設計 §3） | U3 プロンプト・Schema・後処理 | TEST-09 後処理 6 件・評価の注入 30 件 |
| T-10 | お客様が下書きを読む・開発者がサーバー欄を偽造 | U1 | TEST-10 Rules（aiDrafts・submit 偽造） |
| T-11 | フラグの迂回・法務前の公開（M5・L-c） | U2 `flags.ts`・U5 deploy 検査 | TEST-11 フラグ 7 件・deploy 検査 3 件 |
| T-12 | テスト・ローカルで本物のキーを使う（M1） | U2・U3 のテストの守り | TEST-12 キー／`.secret.local` があれば失敗 |
| T-13 | 依存の改ざん（M6） | §3 条件② | TEST-13 `npm audit signatures`・install scripts なし |
| T-14 | 評価キー・評価出力の残留（L1） | §6 | TEST-14 gitignore の確認・失効をユーザーが報告 |

- **TEST-05・TEST-06 の手順（SEC-H2）**: `docs/operations/RUNBOOK_FIREBASE.md` §9.9（Release Gate のコマンドと確認項目。全コマンド `--project afro-cms-4a6ff`）。クラウドの作業そのものは同 §9.10 の G-0〜G-7（それぞれユーザーの GO の後。2026-11-24 時点で未実施）

- [UNKNOWN] 設計 rev1 の本文には `S-H1`・`S-H2`・`S-M3` のラベルだけがある（`git show …:docs/design/AI_REQUIREMENTS.md` を grep）。**`S-M1`・`S-M2` のラベルは本文に見つからない**。T-07（ログ）と T-08（個人情報の除去）に当たると推定 [INFERENCE] → security-engineer が r2 で対応を確認する

## 12. 完了条件（CLAUDE.md 3.10）

- [ ] 設計 §1〜§8 の振る舞いを満たす（TASK の AC 1〜9 と §8 のテスト計画）
- [ ] テストが**件数つきで**緑: rules（既存＋≥ 42）・functions（既存＋U2 ≥ 95＋U3 ≥ 28）・unit（≥ 14）。skip 0。0 件の緑・残骸プロセスの緑を疑う
- [ ] `npm run typecheck`・`build:live`・`build:functions`・`rules:check`・`gen-ai-shared --check`・`node scripts/ai-verify.mjs`
- [ ] 回帰: 既存の rules・functions テストが全件緑。フラグ OFF で現行テンプレートの経路が変わらない（エミュレータで submit まで通す）
- [ ] 配線: `requestRequirementsDraft` の呼び出し元（画面）≥ 1・worker の enqueue 元 = callable 1 件を grep で示す
- [ ] Rules の計測値（2 経路・余裕の数値・公式上限の出典）が設計 §7 にある
- [ ] Security: §11 の TEST-01〜14 が緑または実施記録あり。security-engineer の実装後監査。別系統モデルレビュー（ADR-0025。**顧客案件のコードを外部モデルへ送る前にユーザーに可否を確認**）
- [ ] Code Review（code-reviewer）。Acceptance Audit（acceptance-auditor）
- [ ] Docs: 設計 §7 の計測値と L-a の注記・`AI_REQUIREMENTS_EVAL.md`・Runbook の節・`docs/TODO.md`・`CHANGELOG.md`・`DEVELOPMENT_PROGRESS.md`・`RELEASE_NOTES.md`
- [ ] Release Readiness（段 4・5 の前）: 実行 SA の権限一覧（allUsers なし）・Cloud Tasks の enqueue 疎通・Secret が worker SA だけ・`dist-live` に SDK・キーが無い・予算アラート
- [ ] お客様公開は L-c の条件の後（それまで `internal` まで）
- [ ] 学習の判断（SSRF の守り・Rules の式の量の計測値は TECHNOLOGY の候補）

## 13. Plan Review r1 の対応表

| 指摘 | 対応（節） |
|---|---|
| db HIGH-1 両経路を最大 payload で計測・evidence は hasOnly | §4 U1 計測・`edited` の Rules ④・allow テスト 2 件 |
| db HIGH-2 代替を名前つきで | L-b・§4 U1 F-a / F-b |
| db HIGH-3 前後の draft・admin 拒否・flags の置き場・同 batch | §4 U1 `edited` の Rules・`flags` の置き場・テスト |
| db MEDIUM-1 ruleCoverage・公式上限 | §4 U1 計測 |
| db MEDIUM-2 マップリテラル 1 本・欠けの拒否・テスト 4 件 | §4 U1 submit の検査・テスト |
| db MEDIUM-3 定数の食い違い | §4 U1 定数の食い違い |
| db MEDIUM-4 Hosting の戻し先の下限 | §7 |
| db LOW aiUsage・≥ 42 件・生成時の purposes/improves | §4 U1 |
| sec H1 SSRF を名前で列挙 | §4 U2 SSRF のテスト |
| sec H2 Cloud Tasks の IAM・Release Gate | §4 U5 ③・検証、§11 T-06 |
| sec H3 フラグのテスト | §4 U2 フラグのテスト |
| sec M1 `.env*` の例外・`.secret.local` | §4 U5 フラグの値の置き場・U2 テストの守り |
| sec M2 worker 専用 SA | L-a・§4 U2 関数の設定・U5 ② |
| sec M3 縮小前の棚卸し | §4 U5 ①・R-11 |
| sec M4 canary・`ANTHROPIC_LOG` | §4 U2 ログのテスト・§3 条件⑤ |
| sec M5 `on` の条件と拒否 | L-c・§4 U5・§5 |
| sec M6 署名・install scripts・版の記録 | §3 条件①② |
| sec L1 評価キーの失効・出力の gitignore | §6・U3 |
| sec L2 T↔TEST 表 | §11 |
| sec L3 R-7 は internal に限る | §9 R-7・§5 |
| sec S-M1/S-M2 の追跡 | §11 の注記（ラベル未発見。r2 で確認） |

## 14. Plan Review 判定欄

| 担当 | r1 | r2 |
|---|---|---|
| security-engineer | APPROVED WITH CONDITIONS（H1〜H3・M1〜M6・L1〜L3） | （未） |
| database-engineer | APPROVED WITH CONDITIONS（HIGH-1〜3・MEDIUM-1〜4・LOW） | （未） |
| backend-engineer | （未） | |
| ui-ux-designer | （未） | |
