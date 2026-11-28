# 実装後セキュリティ監査: live のサイトマップ（AI 下書き＋お客様承認）（XL）

- 日付: 2026-11-28 ／ 担当: security-engineer（読み取りのみ。プロダクションコードは未変更）
- 対象: `feat/live-sitemap` @b05ed4f と `origin/main` の差分（worktree `wt-sitemap`。88 ファイル）
- 照合元: 脅威モデル `2026-11-28-live-sitemap-threat-model.md`（S-1〜S-20）、Plan Review `2026-11-28-live-sitemap-plan-review-security.md`（M-1〜M-6・L-1〜L-5）
- **判定: APPROVED WITH CONDITIONS**。HIGH 0・MEDIUM 0・LOW 3（新規）＋ Info 4。コードの修正は必須ではない。下の「リリース前の必須事項」R-1〜R-4（リポジトリ外の確認と Runbook の 1 手順）を満たすまで本番 GO にしない
- 自分で実行した検証: `node --test`（unit 6 ファイル＋`tests/rules/deploy-guard.test.mjs`）**74/74 pass**（sitemapXss・sitemapRules・livePortalSitemap・liveSitemap・liveSitemapUi・portalSitemapDemoSame・deploy-guard）。
  **test:rules・test:functions（エミュレータ）は本監査では未実行**（qa-engineer が並行実行中。エミュレータのポート競合を避けた）。件数は QA の報告を正とする

## 1. 条件ごとの照合（実物）

| 条件 | 結果 | 根拠（file:line） |
|---|---|---|
| S-1 internal・aiDrafts にお客様分岐なし／版文書はお客様 get のみ | 満たす | `firestore.rules:522-530`（internal の get は admin・担当かつ `sid == 'internal'`、版文書の list は admin・担当、write は全員 false）。aiDrafts は既存のワイルドカード（F-1）。mutation ⑧ `tests/rules/mutation.test.mjs:470` |
| S-2 版文書・要約に社内値を入れない | 満たす | 版文書は allowlist だけで組む `functions/src/sitemap/version.ts:47-64`（editSeq・aiRequestId・byUid を写さない。devComment は text/at/byName `:33-37`）。要約の承認差分は 6 キー固定 `firestore.rules:844-850` |
| S-3 全書き込み経路で役割・archived 事前事後・要件 approved | 満たす | Rules: `siteGate` `firestore.rules:833`（事前・事後の archived と要件 approved）を `siteProjOk:852`・`siteApprOk:869` の両方で。callable: `assertWritable` `functions/src/sitemap/common.ts:98-113`（TX で読んだ案件・アカウントで役割・archived・active・role 一致・要件 approved・AI 実行中） |
| S-4 kind の先分岐・ID 接頭辞・rev 1〜50 | 満たす | `firestore.rules:326`（後ろに足しただけ）・`:876`（`d.kind == 'sitemap'`・`1 ≤ rev ≤ 50`）・ID は `siteApprId` `:831` と各 Log 関数の `aid ==`。submit はクライアント分岐に無い。mutation ①② `mutation.test.mjs:438-443` |
| S-5 お客様・代理の偽造防止 | 満たす | お客様: `siteClientLog:889-894`（side client・proxy/note 不可・keys 固定）＋要約側 `siteOwnLog`・`!('approvedVia' in s)`。代理: `siteProxyLog:895-900`（proxy true・`schedNoteOk`・approvedVia 'proxy'）＋要約側 `siteProxyMark`（actorUid 本人）。actorRole: admin は 'admin' 必須、他は省略時 r `:877`。開発者の approve 分岐なし。DENY 表 `tests/rules/sitemap.test.mjs:283-310` |
| S-6 承認の対象＝不変の版文書の contentHash | 満たす | `siteHashOk:835`（`get(sitemapVersions/r{rev}).contentHash` と等式）・`d.revision == b.revision`・`b.status == 'requested'`。版文書は callable の `tx.create` だけ `functions/src/sitemap/submit.ts:86`、以後 update false |
| M-2 要約の contentHash・revision をクライアントが変えられない | 満たす | 承認の差分 allowlist に contentHash・revision なし `firestore.rules:846`、取り下げ・再計画は `[status]` だけ `:839`。要約の contentHash を書くのは submit だけ `submit.ts:95`。テスト `sitemap.test.mjs:287-289`・mutation ⑪ `:482` |
| S-7 submit の前提 | 満たす | `submit.ts:58-81`（スケジュール approvedRevision ≥1・draft・editSeq/rev 一致・全件検査・トップ＋1 件・rev = TX 内の事前 +1・≦50＝L-2）。job 実行中は `assertWritable` |
| S-8 note 必須・制御文字拒否 | 満たす | `siteAfroLog:884-888`（`schedNoteOk`）。mutation ⑨ |
| S-9・M-1 callable の TX 内検査（TX のスナップショットで認可） | 満たす | edits `functions/src/sitemap/edits.ts:196-201`、submit `submit.ts:52-58`、AI 依頼 `functions/src/ai/sitemapRequest.ts:109-119`。`resolveCaller` だけ TX 外。テスト `tests/functions/sitemap-edits.test.mjs:111`・`sitemap-submit.test.mjs:226`（TX 開始前に担当解除 → 拒否） |
| S-10 要約キー（段 0） | 満たす | `validProject` に `sitemap` を追加 `firestore.rules:214-222`、作成時は禁止 `:364`、既存分岐の `ch.hasOnly` には入れない（`:278-296` を確認）。専用分岐は最後に追加 `:467` |
| S-11 中身の検査をサーバーで | 満たす（パス大文字は受容 LOW） | `validateSitemapDoc` `functions/src/ai/shared/sitemapRules.ts:137-224`（件数 60/120・ID・一意・制御文字・kind 5 値・home 1・座標 `Number.isFinite`＋±100,000・hasOnly）。`PATH_RE` が `/i` `:54`（既知・受容。`docs/TODO.md` 記載済み） |
| S-12・L-1 入力は ID と真偽値だけ・未知キー拒否 | 満たす | `strictInput` `common.ts:60-65`、AI 依頼 `sitemapRequest.ts:56-69`（UUID v4・`typeof boolean`）、save は origin・editSeq・status・revision を受けない `edits.ts:157-178`（origin はサーバーが決める `:210`）。送る本文はサーバーが承認の写し `approvals/{requirements.approvalId}` から読む `functions/src/ai/sitemapTask.ts:160-171` |
| S-13 worker 分離・開始時と書き込み時の再検査 | 満たす | 別関数 `functions/src/ai/index.ts:112-134`、書き込み先は定数パス `sitemap/common.ts:26-31`。開始 TX `sitemapTask.ts:160-172`・書き込み TX `:223-254`（requestId・lease・要件 approved と版・承認記録・sitemap none/draft・archived）。L-5: editSeq 一致のときだけ internal を置換 `:274-289` |
| M-4 Secret の束縛・SA・再試行・invoker | 満たす（invoker の実体は R-1） | `ANTHROPIC_API_KEY` は worker だけ `index.ts:115`、callable 3 本は secrets なし（`sitemap/index.ts:76-81`・`index.ts:99`）、SA は要件定義書の worker と同じ `:114`、`maxAttempts 1` `:121`、invoker 未指定。テスト `tests/functions/ai-sitemap-worker.test.mjs:413-431`（Secret を持つのは worker 1 本） |
| invoker（onTaskDispatched の既定）は非公開か | **コード上は非公開**。[FACT] 前例: 要件定義書の worker はデプロイ直後 invoker が**空**（allUsers なし）で、`afro-cms-functions@` への `run.invoker` を手で付けた `docs/operations/IAM_INVENTORY_2026-11-24.md:230`。同じ設定の新 worker も同じになる [INFERENCE] → R-1 |
| S-14 上限の名前空間 | 満たす | `userDayKey(…, 'sitemap')` = `sitemap:{day}:{uid}` `functions/src/ai/quota.ts:60-61`、案件の枠は `aiDrafts/sitemap.quota`、全体 `AI_QUOTA.globalPerMonth` 共用 `:86`。返金も scope 'sitemap'（`sitemapRequest.ts:193`・`sitemapTask.ts:118,133`）。enqueue の鍵も `sitemap:` 接頭辞 `index.ts:108` |
| S-15 USD 上限 | 未確認（リポジトリ外） | コードに USD 停止なし（記録だけ）。`docs/TODO.md` に起票済み → R-3 |
| S-16 出力の無害化・テキスト描画 | 満たす | 後処理 `functions/src/ai/sitemapPostprocess.ts:44-49`（`<>`・`javascript:`・`data:` を含むページ名は捨てる）、全文 `sanitizeText` `sitemapPayload.ts:53-64`（redact→制御文字→`<>` 除去）、Structured Output・ツールなし `generateSitemap.ts:39-42`、データ欄は JSON で `<` を `<` `prompts/PRM-SMAP-001.ts:39-46`。描画: 変更範囲に `dangerouslySetInnerHTML`・href への流し込みなし（grep）。M-5: 静的描画で img/script/svg が文字になる `tests/unit/sitemapXss.test.mjs:30-80`（実行 pass） |
| S-17 PII 最小化 | 満たす | 送るのは許可リストの回答 9 問・v2/v3 の指定項目・ナビ（文字＋同一ホストのパス）・ホスト名だけ `sitemapPayload.ts:15-23,148-216`、全文 `redactText`。href は同一ホスト・パスのみ・query/fragment 捨て `functions/src/ai/site/extract.ts:93-106`。取得は既存の `fetchFollow`（SSRF 守り）`sitemapTask.ts:61-90` |
| S-18・M-3 法務ゲートは行の完全一致 | 満たす | `hasAiScopeLine` `scripts/deploy-firebase.mjs:163-171`（行頭 `AI-SCOPE:`・カンマ区切りの完全一致）、`checkAiSitemapLegalClearance` `:177-186` を functions デプロイ時に必ず通す `:236`。テスト `tests/rules/deploy-guard.test.mjs:84-93`（散文・`sitemap-draft`・箇条書き・大文字 → 拒否。実行 pass）。本番 env は `AI_SITEMAP_MODE=off` `functions/.env.afro-cms-4a6ff` |
| S-19・M-6 ログ・details はコードだけ | 満たす | `invalid()` の details は `{field, nodeId?, code, count}` `common.ts:42-51`（キー名も field 'input' 固定）、`failureFields` `:116-121`。worker の lastError は種別・httpStatus・形を確かめた requestId だけ `sitemapTask.ts:255-261`、ログは件数・種別・トークン `:313-320`。テスト `sitemap-edits.test.mjs:321-344`・`sitemap-submit.test.mjs:318-334` |
| S-20 generated の期限削除 | 未実装（計画どおり） | `docs/TODO.md`「aiDrafts/sitemap の削除ジョブ: internal 以上にする前に実装」。現状 `off` なので今回のリリースは止めない → R-4 |
| Secret 混入 | なし | 差分の追加行に鍵の型（`sk-ant-`・`AIza…`・`BEGIN PRIVATE`）0 件（grep）。`.env.example` はキー名だけ、`functions/.env.afro-cms-4a6ff` はモードと空の allowlist だけ |

## 2. 指摘

### LOW
- **L-1（Runbook の手順漏れ。可用性→誤った直し方の誘発）** `docs/operations/RUNBOOK_FIREBASE.md:71` と `docs/TODO.md`（サイトマップ節）は「invoker が既定で非公開か確かめる」だけで、**新 worker `generatesitemapdrafttask` へ `afro-cms-functions@` の `roles/run.invoker` を付ける手順**が無い。
  攻撃シナリオ（運用事故）: 前例（`IAM_INVENTORY_2026-11-24.md:230`）どおり invoker が空で出ると、internal に変えた最初のタスクが 403 で失敗し、急いで直す人が `allUsers` を付けると worker が外部から直接呼べる（T-17）。
  修正: §6.2 段 1 の ② の後に `gcloud run services add-iam-policy-binding generatesitemapdrafttask --region asia-northeast1 --member serviceAccount:afro-cms-functions@afro-cms-4a6ff.iam.gserviceaccount.com --role roles/run.invoker --project afro-cms-4a6ff` と、`get-iam-policy` で `allUsers`・`allAuthenticatedUsers` が無いことの確認を追記する（戻しは `remove-iam-policy-binding`）。防ぐ層: IAM（platform-engineer）
- **L-2（既知・受容）** パスの大文字 `sitemapRules.ts:54`（`/About` と `/about` が別ページ）。セキュリティ上の到達はなし。`docs/TODO.md` 記載どおり
- **L-3（多層防御）** `hasAiScopeLine` はコードブロック（```）の中の行も数える `deploy-firebase.mjs:167`。記録は人が書く法務の文書なので実害は小さい。必要なら clearance の書式（ブロック外の 1 行）を `docs/legal/` の雛形で決める

### Info（範囲外・既存・受容）
- compute 既定 SA がプロジェクト全体の `roles/run.invoker` を持つ（`IAM_INVENTORY_2026-11-24.md:112,238`）。新 worker もこの SA から呼べる。既存の残余（本変更で増えない）。棚卸しは platform-engineer の次回
- 版文書の `submittedBy`（uid）・承認記録の `actorName`・`actorEmail` はお客様が読める。既存の要件・スケジュールと同じ（TM §6 受容）
- 手入力のページ名・理由・コメントは `<`・`javascript:` を許す（AI 出力だけ捨てる）。描画は React の文字ノードだけで、CSV 出力・href への流し込みは無い（grep）ので到達なし。CSV や Markdown を足すときは再判定
- `functions/src/ai/request.ts` の reservedDay の二重 enqueue（要件定義書の経路・既存 LOW。`docs/TODO.md` 記載）

## 3. リリース前の必須事項（本番 GO の前提）

| # | 内容 | 担当 |
|---|---|---|
| R-1 | L-1 の手順を Runbook §6.2 に追記し、段 1 の functions デプロイ後に新 worker の invoker が OIDC の SA（`afro-cms-functions@`）だけで `allUsers` が無いことを `gcloud run services get-iam-policy generatesitemapdrafttask` で確認・記録 | platform-engineer |
| R-2 | `gcloud secrets get-iam-policy ANTHROPIC_API_KEY` の secretAccessor が `afro-cms-ai-worker@` の 1 件のまま（M-4 の Release GO）。本番 Rules の Console ドリフト（段 0 の床と一致） | platform-engineer |
| R-3 | Anthropic Console の spend limit・予算アラートの有無と値を記録（S-15）。`AI_SITEMAP_MODE` を internal に変える前 | platform-engineer → ユーザー |
| R-4 | `aiDrafts/sitemap` の削除ジョブ（S-20）と LEGAL REVIEW REQUIRED（国外送信の範囲・保持・承認の効力）は `internal` 以上・`on` の前提。現状 `off` | backend / RA・PM |
| R-5 | test:rules・test:functions の件数（qa-engineer）を添付。0 件の緑は不可。別系統モデルレビュー（認可・外部送信）は計画 §12 どおり | qa-engineer / lead-architect |

## 4. 残る UNKNOWN
- [UNKNOWN] 本番の worker の invoker・Secret のアクセス主体・Anthropic の spend limit・Console の Rules（すべてリポジトリ外。R-1〜R-3 で取り寄せる）
- [UNKNOWN] エミュレータのテスト件数（本監査では未実行。R-5）
