# 影響分析 — サイトマップ実装計画（4a9292c）（impact-analyzer・2026-11-28）

深刻度: CRITICAL（Rules・認可・外部 AI・全利用者）。計画の骨格は成り立つ。実装前に直す穴 6 件。基準 HEAD（本番 c8f5f99 との rules/src/functions/scripts の差分 0）。

## 計画の穴
1. [FACT] 段 0 の戻し先は **d0649c16**（本番はスケジュール段 1。IAM_INVENTORY:276）。beb93e7b へ戻すとスケジュールの書き込みが落ちる
2. [FACT] `tests/unit/liveScheduleHistory.test.mjs:35` が `approvalKindOf({kind:'unknown'})==='requirements'` を固定。U2-0 の目的と衝突（Write Scope に無い）
3. [FACT] live から `useDemo(` に届く: BuildFlowNav.tsx:15・DevComment.tsx:37・SitemapPage.tsx:12・PortalApprovalsPage.tsx:39。BuildFlowNav はどの Unit にも無い。live は BuildFlowNav を描いていない。「デザイン」の行き先は live に無い（LiveApp.tsx:44-82）
4. [FACT] U4: demo のサイトマップ区画は PortalApprovalsPage 本体（:200-227）。切り出し先（PortalApprovalParts.tsx 等）が Write Scope に無い
5. [FACT] 画面の AI フラグ `VITE_FEATURE_AI_SITEMAP` の配線（vite-env.d.ts・vite.config.ts:69 buildMeta・deploy-firebase.mjs checkLiveAiFlag/checkBuiltAiFlag :99-125・.env.example）が無い。既定 off で黙ってビルドされる（11-26 と同じ型）
6. [INFERENCE] flags.ts に `defineString('AI_SITEMAP_MODE')` を足すと、非対話デプロイで値の明示が要る。flags.ts と同じコミットで `functions/.env.afro-cms-4a6ff` に `AI_SITEMAP_MODE=off`

## その他
- 月 200 回の共有（quota.ts:83）で要件定義の AI が先に上限に当たりうる → **ユーザー決定 OQ-N3 で共有を選択済み**。計画 §6 の「要件定義の AI の挙動を変えない」を直す
- portalSteps.ts:68 はサイトマップ承認で design を waiting にする（live の PortalApprovalPage:99・ProjectDetailView:21 も使う）→ live でデザインが承認待ちに見える
- R-6 の記述: validProject を通るのは基本情報の編集だけ（rules:282,288）。アーカイブ（:283,:290）は通らない
- tree() の移動は demo の present/petit（petitPlan.ts:3・designContext.ts:3・reducer/projectWork/PresentPage）にも効く → 同値表テストに present を含める

## 19 観点（主要）
| # | 観点 | 判定 | 根拠 |
|---|---|---|---|
| 1 | 参照元 | あり | validateLabel/Path → AddPageDialog:4・SitemapPage:21 ／ jobRunning・draftRef → edits.ts:16,51,56・task.ts:81 ／ navLinks → site/checks.ts・ai-site.test ／ approvalLogFrom → 4 テスト |
| 3 | 共通部品 | あり | BuildFlowNav（demo 3 画面）・portalSteps・ProjectDetailView |
| 5 | DB | あり | validProject hasOnly（rules:214）・projCreateOk（:361）・apprCreateOk（:320-325） |
| 7 | 認可 | あり | お客様の承認 TX（G1） |
| 11 | 状態 | あり | internal のリスナー（R-2） |
| 12 | 他画面 | あり | 穴 3・4、portalSteps:68 |
| 14 | 外部 | あり | Anthropic。ANTHROPIC_API_KEY 共用（ai/index.ts:38） |
| 15 | Build/Deploy | あり | 穴 5・6。ai:gen は types/index.ts を写す（gen-ai-shared.mjs:13） |
| 16 | 監査 | あり | approvals・版文書は追記のみ |
| 17 | 外部設定 | UNKNOWN | 新 worker の invoker（compute SA がプロジェクト全体の run.invoker。IAM_INV:112）・Scheduler API（段 2）・spend limit（UK-5） |
| 18 | 影響の桁 | — | rules＝全利用者／quota・request・flags＝要件定義の AI 全体／flags の param＝functions デプロイ全体／BuildFlowNav・tree＝demo の全制作画面 |
| 19 | ライフサイクル | あり | 段 1 の間 aiDrafts/sitemap の generated の削除経路 0（P-8 で受容済み） |
| 2,4,6,8,9,10,13 | — | なし | 決済・Storage・通知・認証そのものに触れない（Grep 0） |

## 回帰テスト候補
liveNoDemoStore（LiveSitemapPage・PortalApprovalPage）／段 0 後にスケジュールの承認・取り下げ・再計画（d0649c16 との差分）／mutation.test.mjs:346 のアンカー／要件定義→サイトマップの予約で aiUsage.byUid のキーが残り count が合算／要件定義の AI の月 200 回判定／edits・task の jobRunning 同値／navLinks のスナップショット（ai-site.test）／present・petit の配置同値／live ポータルの design の見え方（portalSteps:68）／2 タブ競合（R-5）
