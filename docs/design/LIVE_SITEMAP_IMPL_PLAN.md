# live のサイトマップ（AI 下書き＋お客様承認）— 実装計画（XL）

- 日付: 2026-11-28 ／ 作成: lead-architect ／ 状態: **Plan Review 前（自己承認しない）**。レビュー: security-engineer（必須・XL）・database-engineer（Rules）・backend-engineer（callable 契約）・ui-ux-designer（demo 同一の確認方法）
- 依頼: REQ-LIVE-SITEMAP-01。入力（正。本書で再導出しない）: 要件 [`LIVE_SITEMAP_PLAN.md`](LIVE_SITEMAP_PLAN.md)（AC-01〜30・ユーザー決定 OQ-N1〜N4・SAFE S1〜S9・**lead 判断 L-1〜L-6 は拘束**）、データ設計 [`LIVE_SITEMAP_DATA.md`](LIVE_SITEMAP_DATA.md)（D-1〜D-5）、AI 設計 [`LIVE_SITEMAP_AI.md`](LIVE_SITEMAP_AI.md)（P-1〜P-5）、脅威モデル [`../reviews/2026-11-28-live-sitemap-threat-model.md`](../reviews/2026-11-28-live-sitemap-threat-model.md)（S-1〜S-20・SM-01〜30）
- 型: [`LIVE_SCHEDULE_PLAN.md`](LIVE_SCHEDULE_PLAN.md)（段 0 → 段 1、U1〜U4＋INT）。**本書はコードを含まない**
- 画面: **demo と全く同じ**（`src/features/sitemap/*`・`PortalApprovalsPage.tsx` のサイトマップ区画）。差分は役割の出し分けと、demo の部品の中に live の props があるときだけ出す要素（AC-27・スケジュール L-13）

---

## 1. DECISION（本計画で追加。L-1〜L-6 は要件書末尾が正）

脅威モデルはデータ設計より前に書かれ、`sitemap/current` を仮定している。条件の**意味**を保ったまま下で読み替える（§2 正誤表）。

| # | 決定 | 理由 |
|---|---|---|
| P-1 | 中身の書き込み（手で作成・保存・submit・AI 結果）は callable／worker（Admin SDK）だけ。Rules は `sitemap/*`・`sitemapVersions/*` のクライアント書き込みを全面拒否（L-1・D-1） | 最大 payload の検査は見積 2,500〜3,600 式（DATA §3.1）。前例 `firestore.rules:841-843` |
| P-2 | 状態だけの遷移（取り下げ・本人承認・代理承認・再計画）は Rules＋クライアント TX（D-2）。**G1（§5）で式数を計測して確定** | 本人のトークンで承認を残す既存の流儀 |
| P-3 | 承認の対象は `{revision, contentHash}`。requested 中は編集不可（OQ-N4）なので editSeq は承認に含めない。お客様の画面は**表示に使った版文書**の `revision`・`contentHash` から送る（L-18 の型） | 版文書は不変・ハッシュは submit 時にサーバーが計算 |
| P-4 | 利用者の日次キーは **`sitemap:{day}:{uid}`**（DATA §8。AI 設計 §9 の `${day}:sitemap:${uid}` は採らない）。`aiUsage` に新しい項目（AI 設計 §8 の `byFeature`）を**足さない**。種類別の件数はログ `kind` で集計 | `request.ts:129`・`task.ts:97` が `merge:false` で 4 項目だけを書き戻すため、足すと要件定義書の経路で消える |
| P-5 | 現在の図はナビから規則で作る（L-2・P-4）。`validateLabel`・`validatePath`・`tree` を `src/shared/ai/` へ**移すだけ**、`metrics.ts`・`src/data/sitemap.ts` は re-export／呼ぶだけ（L-2。demo 画面差分 0 を条件） | 重複実装を作らない。`gen-ai-shared.mjs:18` が `src/shared/ai/*.ts` を functions へ写す |
| P-6 | サーバー側の検査（PLAN §7 全項目）は純関数 `validateSitemapDoc` を `src/shared/ai/sitemapRules.ts` に 1 か所。callable・worker・画面（エラー表示と依頼可否の件数）が同じ関数を使う | 画面とサーバーの判定が食い違わない（C-04） |
| P-7 | worker は種類ごとに別関数 `generateSitemapDraftTask`（S-13）。書き込み先は定数 `aiDrafts/sitemap`。`request.ts` の `jobRunning` 等は文書パスを引数に取る形へ一般化（既存の呼び出しは同じ引数で同じ挙動） | T-16 |
| P-8 | 削除ジョブ（段 2）の対象は `['sitemap']` だけ（L-3）。保存日数は定数を置かず**法務の結論まで段 2 を出さない**（`on` の前提） | LEGAL REVIEW REQUIRED |
| P-9 | `AI_MAX_TOKENS.sitemap = 8000`・AI 出力 30 ページは新規定数（既存 `AI_QUOTA`・`AI_MAX_TOKENS.v*` は不変）。最悪 1 回約 19 円（AI §5）でユーザー受容「数十円」の内 | 評価（L-5）の p99 で見直し。上げるならユーザー確認 |
| P-10 | 承認後の「デザインへ進む」は出さない（OQ-S6）。BuildFlowNav の「デザイン」項目は live では従来どおりの扱い（変えない） | live にデザインが無い |
| P-11 | 案件詳細の「次に必要な作業」: スケジュール承認後（`schedule.approvedRevision` あり）はサイトマップ（AC-28）。お客様の `clientStatus` の lastLog は要件定義だけのまま（スケジュール L-19） | 既存表示の意味を変えない |
| P-12 | `main` への merge は release GO まで（スケジュール L-22。`pages.yml` が demo を公開） | 未承認の差分を demo に出さない |

## 2. 正誤表（計画が上位資料を読み替えた箇所。qa と実装はこの列を正とする）

| 元 | 元の記述 | 本計画での読み方 |
|---|---|---|
| AC-03・SM-04 | 「お客様に出す版（current）」の hasOnly | `sitemapVersions/r{N}` は `toSitemapVersion` の allowlist（unit）＋クライアント書き込み全拒否（rules）。要約 `projects.sitemap` と approvals kind sitemap の hasOnly（rules） |
| AC-07 | 承認記録から中身を再現 | 承認記録の `contentHash` ＝ 不変の版文書のハッシュ（D-3）。再計算一致を functions テストで確認 |
| AC-09・SM-07 | 表示した revision・editSeq | **revision・contentHash**（P-3）。違えば「内容が変わりました。最新を読み込みました」 |
| AC-14・AC-16・SM-08・SM-16・SM-17 | Rules で検査 | **callable の検査（functions emulator テスト）**。Rules 側は「クライアント書き込みは全拒否」を rules テストで固定（S-9） |
| SM-03 | current rev 0 → 拒否 | r0 の版文書は存在しない。お客様は internal・aiDrafts を get 拒否、`sitemapVersions/r{N≥1}` は get 可・list 拒否 |
| SM-30 | 120 ノードの保存を Rules で計測 | 保存は callable（計測対象外）。**G1 は承認・代理・取り下げ・再計画の Rules 経路**（§5）。保存の大きさは functions テストで文書サイズを assert |
| S-12 | callable 入力は projectId・requestId・regenerate/confirmDiscard | `discardEdits` も可（DATA §3.2）。真偽値だけ |
| AI §8 | `aiUsage.byFeature.sitemap` | 採らない（P-4） |
| AI §9 | 利用者キー `${day}:sitemap:${uid}` | `sitemap:{day}:{uid}`（P-4） |
| エラーコード | — | 競合 `aborted`（details `conflict`）・検査 `invalid-argument`（details `{field, count}`）・前提 `failed-precondition`（`ai-disabled`/`req-not-approved`/`schedule-not-approved`/`state`/`job-running`/`archived`）・上限 `resource-exhausted`・権限 `permission-denied` |

## 3. 契約（Unit 間で同じものを見る。項目の正は DATA §2）

| 対象 | 契約 |
|---|---|
| 純関数（U-S。`src/shared/ai/sitemapRules.ts`・`sitemapLayout.ts`） | `validateLabel`・`validatePath`（demo と同じ判定と文言）・`validateSitemapDoc(doc) → {ok, errors:[{field, nodeId?, code}]}`・`SITEMAP_LIMITS`（60/120/AI 30・座標 ±100,000）・`tree()`（配置）・`canonicalSitemapJson({before, after, devComment})` |
| callable（U-F1） | `saveSitemapEdits({projectId, op:'createManual'\|'save', baseEditSeq?, before?, after?, devComment?}) → {editSeq}`・`submitSitemap({projectId, baseEditSeq, expectRevision}) → {revision, contentHash}`。`toSitemapVersion(internal)`・`contentHashOf()`（node:crypto sha256 over canonical） |
| AI callable／worker（U-F2） | `requestSitemapDraft({projectId, requestId, regenerate?, discardEdits?, confirmDiscard?}) → {state:'queued'\|'running'\|'reused', requestId}`／`generateSitemapDraftTask({projectId, requestId})` |
| Rules（U1） | `siteProjOk`（`schedProjOk` の後ろ）・`siteApprOk`（`apprCreateOk` の kind 振り分けの後ろ。submit は常に拒否）・`sitemap/internal` get・`sitemapVersions/{vid}` get/list |
| live の hooks（U2。`src/live/sitemap.ts`・`repositories.tsx`） | `useLiveSitemap(pid) → {summary, internal?, version?, approvedVersion?, aiDraft?, loading, error}`（お客様は版文書だけ・internal と aiDrafts を購読しない）／`useLiveSitemapActions(pid) → createManual()・save(doc, openedEditSeq)・submit(openedEditSeq, revision)・withdraw(note)・reopen(note)・approve(shown:{revision, contentHash})・proxyApprove(shown:{revision, contentHash, requestedAt}, note)・requestDraft({regenerate, discardEdits, confirmDiscard})`。失敗の形はスケジュールと同じ（permission-denied → 「権限がありません」、`SitemapConflictError`、二重承認は WARN で成功扱い） |
| 部品のデータ源（U3。`src/features/sitemap/*`） | `SitemapSource`（読み取り値＋上の操作＋`role`・`canEdit`・`canProxy`・`aiEnabled`・`origin`）。**props が無ければ従来どおり DemoStore**（`useDemoOptional()`） |
| 型（U2-0。`src/types/index.ts`） | `ApprovalLog.kind` に `'sitemap'`。変えたら `npm run ai:gen` → `ai:check` |

## 4. 単位（Write Scope は重ならない。これ以外は書かない）

| Unit | 担当 | Write Scope | 内容 |
|---|---|---|---|
| **U1-0**（段 0 Rules） | database-engineer | `firestore.rules`・`tests/rules/sitemap.test.mjs`（新規）・`tests/rules/fixtures.mjs`（末尾に**追加だけ**） | `validProject` の hasOnly に `sitemap`（任意 map）・`projCreateOk` を `['consult','schedule','sitemap']` 禁止・`match sitemap/{sid}`・`sitemapVersions/{vid}` を全拒否・`apprCreateOk` に `k=='sitemap' ? false` を**後ろに**。既存分岐の `ch.hasOnly` に入れない |
| **U2-0**（段 0 Hosting） | frontend-engineer | `src/live/model.ts`（`approvalKindOf`・`approvalLogFrom`・`keyOf` だけ）・`src/types/index.ts`（kind だけ）・`functions/src/ai/shared/` の生成物（`ai:gen` の出力だけ）・`tests/unit/liveSitemapHistory.test.mjs`（新規） | 未知 kind を要件定義と誤表示しない（`model.ts:305-306`）・「サイトマップ（第N版）」・依頼者の突き合わせを kind＋版 |
| **U1**（段 1 Rules） | database-engineer | U1-0 と同じ＋`tests/rules/adminRights.test.mjs`（OPS と TEST-09 PATHS に**追加だけ**）・`tests/rules/mutation.test.mjs`（**追加だけ**）・`docs/design/LIVE_SITEMAP_DATA.md`（§12 に G1 の結果だけ） | **U1-1 G1 計測**（§5）→ **U1-2** `siteProjOk`・`siteApprOk`・get の述語。既存の変異テストのアンカー文字列と TEST-09 の関数名を再利用しない（別名 `siteProxyFields` 等）。**U1-3** テスト（§7） |
| **U-S** 共有の純関数 | frontend-engineer | `src/shared/ai/sitemapRules.ts`・`src/shared/ai/sitemapLayout.ts`（新規）・`src/features/sitemap/metrics.ts`（本体を re-export に置換**だけ**）・`src/data/sitemap.ts`（`tree` を import に置換**だけ**）・`functions/src/ai/shared/`（生成物）・`tests/unit/sitemapRules.test.mjs`（新規） | P-5・P-6。移動の前後で demo の判定が同じ（旧実装の写しと全入力表で一致する表テスト） |
| **U-F1** 編集・依頼の callable | backend-engineer | `functions/src/sitemap/**`（新規: `edits.ts`・`submit.ts`・`version.ts`・`index.ts` の factory）・`tests/functions/sitemap-edits.test.mjs`・`tests/functions/sitemap-submit.test.mjs`（新規） | DATA §3.2。`resolveCaller`・`assertCanEdit` を**呼ぶだけ**、TX 内で要件 approved・archived（事前）・状態・`job.state != running`・editSeq を検査（S-3・S-9）。submit: スケジュール `approvedRevision`・`validateSitemapDoc` 全件・改善後トップ＋1 件・rev ≤ 50・版文書 `create()`＋承認 submit（actor* はトークンと accounts）＋要約 requested を 1 TX。冪等は WARN `sitemap.submit.duplicate` |
| **U-F2** AI 下書き | ai-engineer | `functions/src/ai/` の新規 6 ファイル（`sitemapPayload.ts`・`sitemapSchema.ts`・`sitemapPostprocess.ts`・`generateSitemap.ts`・`sitemapRequest.ts`・`sitemapTask.ts`）・`functions/src/ai/prompts/PRM-SMAP-001.ts`・`functions/src/ai/quota.ts`（`scope` 引数の追加だけ）・`limits.ts`（定数の**追加だけ**）・`flags.ts`（param 名の追加だけ）・`request.ts`（パス引数への一般化だけ）・`site/extract.ts`（`baseUrl?`・`navItems` の**追加だけ**）・`functions/src/ai/index.ts`（`makeAiFunctions` に並べる）・`scripts/deploy-firebase.mjs`（`checkAiLegalClearance` に sitemap の分岐を**追加だけ**）・`tests/functions/ai-sitemap-*.test.mjs`（新規）・`tests/rules/deploy-guard.test.mjs`（**追加だけ**） | AI 設計 §1〜§8。worker の成功 TX で `validateSitemapDoc` を再適用して internal へ（none なら作成＋要約 draft、`discardEdits` なら置換 editSeq+1・origin 'ai'）。開始時と書き込み時に fencing・要件 approved・状態・archived を再検査（S-13）。`AI-SCOPE: sitemap` 行が無ければ `on` のデプロイ拒否（S-18） |
| **U2** live のデータ層 | frontend-engineer | `src/live/sitemap.ts`（新規）・`src/live/model.ts`（段階と進捗・`toProject` の sitemap 要約）・`src/live/repositories.tsx`・`src/live/projectView.ts`・`src/live/dashboard.ts`・`tests/unit/liveSitemap.test.mjs`（新規） | §3 の hooks と純関数（`sitemapSummaryOf`・`clientSitemapView`・`sitemapConflict`・live の段階 要件→日程→サイトマップ）。承認・代理・取り下げ・再計画のクライアント TX（`cleanProxyNote`・`proxyVersionOk` を**呼ぶだけ**）。callable 呼び出しは既存の `functionsRegion.ts` の型。U2-0 の後 |
| **U3** アフロ側の画面 | frontend-engineer | `src/features/sitemap/**`（metrics.ts は U-S が先に済ませた後のみ・それ以外）・`src/live/pages/LiveSitemapPage.tsx`（新規）・`src/live/pages/LiveProjectDetailPage.tsx`（サイトマップの区画と次の作業）・`tests/unit/liveSitemapUi.test.mjs`（新規） | **U3-a** demo 部品のデータ源の差し込み（DOM 不変・前後スクリーンショット）。**U3-b** live 画面: none（AI で作る／手で作る）・生成中（工程だけ・秒数なし）・失敗（再試行・手で作る）・下書き（1 秒以上まとめた保存・ドラッグ中は保存しない・項目エラー・依頼不可の件数）・依頼中（取り下げ）・承認済み（再計画）・アーカイブ・権限なし・競合・再生成の確認・「AI提案」は origin 'ai' のときだけ（OQ-S3）・「要件定義書の案から作成」（OQ-S7）。理由入力に「お客様にも表示されます」 |
| **U4** ポータルの承認区画＋履歴 | frontend-engineer | `src/features/portal/PortalApprovalsPage.tsx`（サイトマップ区画のデータ源だけ）・`src/live/pages/PortalApprovalPage.tsx`・`src/features/projects/ApprovalHistory.tsx`・`tests/unit/livePortalSitemap.test.mjs`（新規） | 図（現在／リニューアル後の切替）・一覧・理由最大 3 件・開発担当者より（`SitemapViewer` は U3 の props を使う）・準備中／依頼中／調整中（前回承認版）／承認済み（代理の表記）。承認は表示した `{revision, contentHash}`（P-3）。履歴に withdraw/reopen の note（画面・CSV は `csvCell`） |
| **U5**（段 2）削除ジョブ | backend-engineer | `functions/src/ai/purge.ts`（新規）・`firestore.indexes.json`（fieldOverride の**追加だけ**）・`tests/functions/ai-sitemap-purge.test.mjs`（新規）。**U-F2 マージ後に** `functions/src/ai/index.ts`・`scripts/deploy-firebase.mjs`（「削除関数がデプロイ済み」のゲート）へ追加 | DATA §7。`onSchedule` 毎日 03:30 JST・100 件×10 ページ・`generated`/`generatedAt` だけ消し `purgedAt`。保存日数は法務の結論（P-8）。段 2 は今回のリリースに含めない（実装とテストまで） |
| **INT** 統合 | lead-architect | `functions/src/index.ts`（4 関数の export）・`src/live/LiveApp.tsx`（`/site`・`/dev/sitemap`。HearingGate／選択中の案件の型）・`tests/unit/liveNav.test.mjs`（件数が変わる場合だけ）・`scripts/seed-emulator.mjs`（種の**追加だけ**）・`docs/CHANGELOG.md`・`docs/operations/RUNBOOK_FIREBASE.md`・`docs/TODO.md`・本書 §1 の追記 | 上部ナビ・ポータルのナビは足さない（ポータルの確認・承認は既存）。Runbook に段の順・新しい床・別々の CLI 実行。`functions/.env.<prod>` の `AI_SITEMAP_MODE=internal`＋allowlist は**ユーザー GO 後**に platform-engineer |

### 4.1 順番と依存

```
U1-0 ∥ U2-0 → 段 0 専用コミット（専用ブランチ）→［段 0 を出せる状態］（デプロイはユーザー GO 後）
U-S（最初から並行可。demo だけで確認）
U1-1（G1 計測）→ 結論を §1 に追記 → U1-2/U1-3
U-S → U-F1 ∥ U-F2（どちらも validateSitemapDoc を使う）
U2-0 → U2（hooks の型は §3。callable はエミュレータで U-F1/U-F2 が揃ってから結合）
U3-a（U-S の後。live 不要）→ U2 ＋ U3-a → U3-b ∥ U4
U1 ＋ U-F1 ＋ U-F2 ＋ U3-b ＋ U4 → INT → 全テスト → レビュー（同時に 1 回）→ 統合 → 修正 1 回
U5 は INT の後（段 2。今回はテストまで）
```

- 並行は最大 3 本（`/parallel-dev` の単位）。同じ作業ツリーを 2 セッションで触らない（Unit ごとに worktree）
- U-S が `metrics.ts` を、U3 が残りの `src/features/sitemap/**` を書く。U3 は U-S のマージ後に始める（重なり防止）

## 5. 計測ゲート G1（承認の Rules。UK-2・SM-30）

| 経路（最大 payload: note 200 字・actor* 最大長） | 読む文書（get/getAfter） | 合格 |
|---|---|---|
| お客様の承認（案件の要約 6 キー＋approvals approve。`contentHash == get(sitemapVersions/r{rev}).contentHash`） | accounts・案件・版文書・承認文書（getAfter）・existsAfter | ≦ 800 式（20% 余裕）・get ≦ 20 |
| 代理承認（同上＋proxy・note・actorRole・approvedVia） | 同上 | 同上 |
| 取り下げ（requested→draft＋withdraw note） | accounts・案件・承認文書 | 同上 |
| 再計画（approved→draft＋reopen note） | 同上 | 同上 |
| 回帰: 既存の TEST-09 PATHS（要件・スケジュール） | — | 既存の 20% 余裕のまま（新しい分岐で増えていない） |

- 方法は `adminRights.test.mjs` TEST-09（pad で通る最大 k を数える）に PATHS を**追加**。結果は DATA §12 と本書 §1 に記録
- 外れたとき: ①版文書の get をやめ、案件の要約 `sitemap.contentHash`（submit の callable が書き、requested 中は変わらない）との等式にする（get 1 減）②それでも外れたら実装を止め lead-architect が設計を見直す（承認の callable 化は本人トークンの証跡を変えるため、選ぶならユーザーへの説明を伴う）

## 6. 変更しない部分（Do Not Change。触れたら計画違反）

- **demo の挙動**: 画面・DOM・文言・DemoStore・reducer・`src/data/sitemap.ts` の見本（`sitemapFor`）・demo の保存間隔 300ms・demo の依頼中編集可（demo の挙動は live の props があるときだけ変わる）。demo の build は Firebase 非依存のまま。`metrics.ts`・`tree` は**移すだけ**で判定・配置は同値
- **要件定義書・スケジュールの Rules**: `reqApprCreateOk`・`schedApprOk`・`schedProjOk`・`devTransition`・`reqUpdateOk`・`projUpdateOk` の既存分岐のテキストと評価順（sitemap の分岐は後ろに足す）。既存の変異テストのアンカーと TEST-09 の既存 PATHS。`aiDrafts/{did}` の Rules（`firestore.rules:483-486`）は変えない（`aiDrafts/sitemap` は既に同じ守り）
- **要件定義書の AI**: `requestRequirementsDraft`・`saveAiDraftEdits`・`generateRequirementsDraftTask` の契約と挙動、`AI_REQUIREMENTS_MODE` の意味と判定、`limits.ts` の既存値（`AI_QUOTA`・`AI_MAX_TOKENS.v*`・`AI_LEASE`・`AI_WORKER`）、`quota.ts` の既存の鍵 `"{day}:{uid}"`・`aiDrafts/requirements.quota`・`readUsage` の 4 項目と `merge:false`（**名前空間の追加以外の意味を変えない**）、`site/extract.ts` の `navLinks`、既存の `tests/functions/*.test.mjs`
- approvals・`sitemapVersions` は追記のみ（update/delete は admin も false）。`sitemap/*`・`aiDrafts` はクライアント書き込み false
- 役割の判定（`roleOf`・`mine`・無効化／メール不一致は none・お客様は `projectId` の案件だけ）。お客様が書けるのは承認（要約の 6 キー＋承認文書）だけ
- `src/live/proxyApproval.ts`（呼ぶだけ）・`LiveRequirementsPage.tsx`・`LiveSchedulePage.tsx`・`src/live/schedule.ts`・`clientStatus.ts` の lastLog の意味・要件定義書 v3 の章 04
- スケジュールの WBS の `sitemap` 行の完了印（自動で付けない。C-07）
- `firestore.indexes.json` は段 1 で変えない（U5 の段 2 だけ）
- `main` への merge（release GO まで。P-12）

## 7. テスト（AC・SM → テストの置き場。件数は着手前に基準を**実行して**取り TASK に記録）

| 種別 | ファイル | 対応 |
|---|---|---|
| rules emulator | `tests/rules/sitemap.test.mjs` | AC-01（Rules 部分）・AC-02・AC-03（要約・approvals の hasOnly）・AC-06（submit はクライアント不可）・AC-08（withdraw note）・AC-10・AC-11（クライアント書き込み全拒否）・AC-12（決定的 ID）・AC-13（事前・事後 archived）・SM-01〜07・SM-09〜11・SM-13・SM-18。段 0 の部分（全拒否・`sitemap` キーを持つ案件の基本情報・アーカイブ・アサインが通る）は U1-0 で先に |
| rules emulator（既存へ追加） | `adminRights.test.mjs`（OPS・TEST-09） ／ `mutation.test.mjs` ／ 既存全ファイル無変更 | SM-30（G1）／SM-12（変異: kind の先分岐・`sitemap-r` 接頭辞・submit 拒否・contentHash の等式・proxy/actorRole の強制・事前／事後 archived・お客様分岐が internal に無い・note 必須）／AC-29・SM-12（回帰・件数記録） |
| functions emulator | `tests/functions/sitemap-edits.test.mjs` | AC-01（callable 部分）・AC-05・AC-11・AC-13・AC-14・AC-15・AC-16・SM-02（callable）・SM-08・SM-13・SM-14・SM-16・SM-17・文書サイズ（最大 payload の JSON < 300KB） |
| functions emulator | `tests/functions/sitemap-submit.test.mjs` | AC-06・AC-07（ハッシュ再計算一致・allowlist）・SM-10（rev+1・rev 51 拒否）・SM-15・冪等 WARN・S-7（AI 実行中は拒否） |
| functions（Stub） | `tests/functions/ai-sitemap-flow.test.mjs` | AC-18・AC-21・AC-22・AC-23・AC-24（off/internal）・AC-25・SM-20・SM-21・SM-22・SM-23（job 文書なし→何もしない。OIDC は本番前の手動確認を記録）・SM-24（別枠と共用・**要件定義書の reserve/refund が `sitemap:` 鍵を保つ／逆も**・`aiUsage` のキー集合が 4 項目のまま）・SM-29（canary） |
| functions（純関数） | `tests/functions/ai-sitemap-payload.test.mjs` ／ `ai-sitemap-post.test.mjs` | AC-19・SM-27（送信 payload スナップショット・href はパスだけ）／AC-20・AC-26（beforeSource unavailable）・SM-25（注入の悪い出力が後処理で落ちる） |
| unit（node test） | `tests/rules/deploy-guard.test.mjs`（追加） | AC-24（`on` の関門）・SM-28（要件の記録だけでは拒否） |
| unit | `tests/unit/sitemapRules.test.mjs` | AC-14・AC-15（判定）・P-5 の同値表（旧 `metrics.ts` の写しと一致）・`tree` 配置の同値 |
| unit | `tests/unit/liveSitemap.test.mjs` ／ `liveSitemapHistory.test.mjs` ／ `livePortalSitemap.test.mjs` ／ `liveSitemapUi.test.mjs` | AC-09（shown の値で組む・違えば送らない）・AC-28（段階・次の作業・ダッシュボード）・SM-19（履歴 0/500 件で状態表示が同じ）／kind 'sitemap' の履歴・note・CSV（SM-26 の `csvCell`）／お客様は版文書だけ・準備中／調整中／AC-17（1 秒以上まとめる・ドラッグ中は書かない＝書き込み回数）・AC-30（origin） |
| 既存 unit（無変更で緑） | `liveNoDemoStore`・`liveNav`・`adminProxyApproval`・`liveDashboard`・`liveSchedule*` | 回帰 |
| emulator UI（Chrome。使えなければ「未検証」） | `npm run emulators`＋`seed:emulator`＋`dev:emulator` | AC-04・AC-16（2 タブ）・AC-27（demo スクリーンショット差分 0: `/site`・`/dev/sitemap`・ポータル確認・承認・案件詳細＋`RequestApprovalButton` を使う 7 画面）・SM-26（`<img onerror>` が文字で出る）・X-6（見ている間の取り下げ） |
| 検査 | `npm run typecheck`・`build`（demo）・`build:live`・`build:emulator`・`build:functions`・`ai:gen`→`ai:check`・`rules:check`・`node scripts/ai-verify.mjs` | 成功・差分なし |

- Rules テストは `emulators:exec` 経由（`scripts/test-rules.mjs`。`demo-` 固定）。functions も `scripts/test-functions.mjs`（gcloud 既定が本番のため直接実行しない）
- 実 API は L-5 の評価（`prototypes/ai-sitemap-eval/`・架空 20 件×3 回・上限 $10）と Smoke 1 回だけ。INT の後、mode internal で出す前
- Full E2E は無い。Smoke 手順は INT が Runbook に書く

## 8. リスク

| # | リスク | 影響 | 対策 |
|---|---|---|---|
| R-1 | G1: 承認・代理承認が 1000 式／get 上限に近い | 本番で承認が全件失敗 | §5 を U1-1 で最初に。外れたら要約の contentHash 等式へ（get 1 減）、さらに外れたら停止 |
| R-2 | internal のリスナーが保存ごとに文書全体（典型 20KB・最悪 150KB）を受け取る | モバイル回線で重い・Read 増 | 保存は 1 秒以上まとめ・ドラッグ中は書かない（AC-17）。internal を購読するのは編集画面だけ（離脱で解除）・お客様は版文書（不変）だけ。最大 payload の文書サイズを functions テストで assert。TH-2（2 文書分割）は実案件で超えたら |
| R-3 | `aiUsage` の `merge:false` 上書きで `sitemap:` 鍵・共用 count が消える／要件定義書の件数に混ざる | 上限が効かない・二重課金 | P-4（項目を足さない）。SM-24 に両方向の回帰（要件→sitemap 鍵保持、sitemap→要件鍵保持、count は合算）。`readUsage` の byUid 全鍵写しを前提として assert |
| R-4 | U-S の移動・U3-a の差し込みで demo の判定・DOM が変わる | 承認済みデザインの破壊 | 同値表テスト・前後スクリーンショット・props 無しの経路を一字も変えない・main へ merge しない |
| R-5 | callable（悲観ロック）とクライアント TX（楽観）が同じ案件文書を取り合う（UK-1） | 承認×取り下げ×保存の取り違え | すべて TX 内で状態を再検査。2 タブ再現（functions＋emulator UI） |
| R-6 | 段 0 より前へ Rules を戻す・段を混ぜる・まとめて出す | `sitemap` を持つ案件の基本情報・アーカイブが全件失敗 | §9 の床・専用コミット・別々の CLI 実行・本番リリース ID の事前確認 |
| R-7 | 注入で誘導文がお客様に届く（T-19） | 信用・詐欺誘導 | S-16（後処理・プレーンテキスト）・人が依頼した版だけがお客様へ |
| R-8 | USD の月上限がコードに無い（S-15） | 共用 $20 超過 | Release 前に platform-engineer が Anthropic の spend limit を確認・記録。無ければ受容をユーザーへ |
| R-9 | live の入口から `useDemo(` に届く | live 画面が落ちる | `liveNoDemoStore.test.mjs` を INT で必ず |
| R-10 | LEGAL（国外 AI 送信の範囲・保持日数・承認の効力） | 契約・法令 | **LEGAL REVIEW REQUIRED**。`on` と段 2 は法務の結論まで出さない。`docs/TODO.md`（INT） |

## 9. リリースの段と Rollback（ユーザー GO を段ごとに取る）

| 段 | 出す順（別々の CLI 実行） | 中身 | 戻し方 |
|---|---|---|---|
| **段 0** | Rules（U1-0）→ Hosting（U2-0） | `sitemap` キーの許可（作成時禁止）・サブコレクション全拒否・kind sitemap 全拒否／履歴の kind 対応。**誰もサイトマップを書けない** | Rules は現在の床 `beb93e7b-0abd-4d29-9555-18bb03686c0a` へ戻せる（sitemap のデータがまだ無い）。Hosting は前の版 |
| **段 1** | Rules（U1）→ Functions（U-F1・U-F2。`AI_SITEMAP_MODE=internal`＋allowlist）→ Hosting（U2〜U4・INT） | 全機能。AI は試験案件だけ | Hosting を段 0 へ → Functions の 4 関数を削除（または mode off）→ Rules を段 0 へ。**段 0 より前へは戻さない**（段 0 の ruleset が新しい床。TODO と Runbook に ID を記録）。重い不具合は forward fix |
| **段 2** | Functions＋indexes（U5） | 削除ジョブ・Scheduler 1 件・fieldOverride | 関数を止める（消えた generated は戻らない＝法務の結論どおり） |
| `on` | 設定 | 法務の記録（`AI-SCOPE: sitemap`）＋段 2＋評価合格 | `internal` に戻す |

- 段 0 は専用コミット。出すときは段 0 のコミットをチェックアウトしてビルド（段 1 を混ぜない）
- 段 0 の前に本番の現在の Rules のリリース ID を Console で取り、リポジトリと食い違っていないか確認（platform-engineer）
- 順番違い（新 Hosting × 旧 Rules）: クライアントの承認・取り下げは拒否（安全側）。Functions だけ先でも版文書は読めないだけで壊れない（DATA §9）
- Release GO の追加確認: 新しい callable／worker の呼び出し元件数（Grep）・Cloud Tasks キュー 1・worker の invoker 非公開・SA 権限・Scheduler 0 件（段 1。段 2 で 1 件）・外形疎通・CORS（`callableCors`）・環境変数の焼き込み（`VITE_FEATURE_AI_SITEMAP`）
- 作った文書・版・承認の記録は戻しても消さない（Retain）。Migration なし。公開後 1 週間で Read 件数と callable 回数を確認

## 10. 脅威モデルの条件（S-x）→ Unit

| S | Unit | S | Unit |
|---|---|---|---|
| S-1 get の主体 | U1・U2（お客様は購読しない）・U4 | S-11 中身の検査 | U-S・U-F1・U-F2 |
| S-2 お客様の読める値 | U-F1（`toSitemapVersion`）・U1 | S-12 callable の入力 | U-F2（ID とフラグだけ） |
| S-3 主体・archived・要件 approved | U1・U-F1・U-F2 | S-13 worker 別関数・再検査 | U-F2 |
| S-4 kind の後ろ足し・ID | U1-0・U1 | S-14 上限の名前空間 | U-F2（P-4） |
| S-5 承認の形 | U1・U2 | S-15 USD 上限 | INT（platform 確認） |
| S-6 承認の対象 | U1（contentHash）・U2/U4（shown） | S-16 注入 | U-F2・U3/U4（テキスト描画・csvCell） |
| S-7 submit の前提 | U-F1 | S-17 外部送信 | U-F2（payload 1 か所）・U3（注意書き） |
| S-8 note | U1・U3・U4 | S-18 法務ゲート | U-F2（deploy-firebase） |
| S-9 凍結 | U-F1（TX）・U1（全拒否） | S-19 ログ | U-F1・U-F2 |
| S-10 要約 | U1-0・U1・U-F1 | S-20 期限削除 | U5（段 2） |

## 11. UNKNOWN

| # | 内容 | 分類 |
|---|---|---|
| UK-1 | 承認経路の式数（見込み 300〜650） | INVESTIGATION REQUIRED → G1（§5） |
| UK-2 | callable TX とクライアント TX の競合の挙動 | INVESTIGATION REQUIRED → R-5 のテスト |
| UK-3 | Structured Outputs が `maxItems`・`maxLength` を強制するか | SAFE ASSUMPTION（強制しない前提でサーバーが切る） |
| UK-4 | worker の OIDC をエミュレータで試せるか | SAFE ASSUMPTION（不可なら本番前の手動確認を記録） |
| UK-5 | Anthropic の spend limit の設定（リポジトリ外） | NEED CONFIRMATION（Release 前。platform-engineer → ユーザー） |
| UK-6 | 生出力の保持日数・国外送信の範囲 | NEED CONFIRMATION（LEGAL。`on`・段 2 の前提。今回の段 1 は止めない） |
| UK-7 | コレクショングループ単一フィールド Index の要否 | INVESTIGATION REQUIRED（U5 の前に `tech/firestore.md`） |

## 12. 完了条件（DoD）

- AC-01〜30 と SM-01〜30 が §7 の置き場で満たされる（件数・skip 0・失敗 0。既存の件数が減らない。AC-27 はスクリーンショット比較）
- G1 の計測値・基準件数・増えた件数が記録されている（DATA §12・本書 §1）
- 新しい callable 3・worker 1 の呼び出し元件数を Grep で確認（0 件を実装済みにしない）。`functions/src/index.ts` の export を確認
- 画面確認（emulator UI）: 要件未承認では作れない／スケジュール承認後に次の作業がサイトマップ／AI で作る（internal の試験案件・Stub）・手で作る／編集→1 秒まとめ保存／不正な名前は保存されず依頼不可の件数／依頼→ポータルで承認／見ている間の取り下げで承認が送られない／取り下げ（note）→再依頼 rev+1／代理承認と履歴の「代理」「依頼と同じ人」／再計画（note）／2 タブ競合／アーカイブ中は閲覧だけ
- レビュー: code-reviewer・security-engineer（実装後監査。S-1〜S-20）・**別系統モデルレビュー**（認可・外部送信。自社プロダクト [INFERENCE]。違えば止めて確認）・acceptance-auditor（XL）
- `docs/CHANGELOG.md`・Runbook（段・床・別 CLI）・`docs/TODO.md`（LEGAL・床 ID・S-15・段 2）が更新されている。学習の判断（G1 の値を `tech/firestore.md` へ載せるか）を INT で行う
- `node scripts/ai-verify.mjs` 失敗 0・`verifying-work` を通過
