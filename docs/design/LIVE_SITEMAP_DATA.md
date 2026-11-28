# live のサイトマップ（AI 下書き＋お客様承認）— データ／Backend 設計

| Version / Status | 規模・リスク | 要件（正） | 最終更新 |
|---|---|---|---|
| 0.1 / DRAFT（Data Design Review 前。判定は lead-architect） | XL（外部 AI 送信・Rules・承認の証跡・継続費用） | [`LIVE_SITEMAP_PLAN.md`](LIVE_SITEMAP_PLAN.md)（REQ-LIVE-SITEMAP-01・ユーザー決定 2026-11-28） | 2026-11-28 data-backend-architect |

> 設計資料のみ。Rules の式・callable・テストの実体は database-engineer / backend-engineer、画面は demo と同一（範囲外）。
> 型はスケジュール（[`LIVE_SCHEDULE_WBS_DATA.md`](LIVE_SCHEDULE_WBS_DATA.md)）と AI 要件定義書（[`AI_REQUIREMENTS.md`](AI_REQUIREMENTS.md)）。**違う点は §1.2 の D-1〜D-5**。

---

## 0. 確認した実物（[FACT]。worktree feat/live-sitemap）

| 対象 | 確認した内容 |
|---|---|
| `firestore.rules:207-221` | `validProject` の `hasOnly` に `consult`・`schedule`（任意）。`projCreateOk:361` で作成時は両方禁止 |
| `firestore.rules:320-325` | `apprCreateOk` は kind で振り分け（`requirements` / `schedule`、それ以外は false） |
| `firestore.rules:463` | 案件の update はスケジュールの分岐を**後ろに足す**型（`schedProjOk`） |
| `firestore.rules:483-486` | `aiDrafts/{did}`: get/list は admin・担当、クライアントの create/update/delete は**全員 false**（`{did}` なので `aiDrafts/sitemap` も既に同じ扱い） |
| `firestore.rules:740-806` | スケジュールの承認: `schedApproveMove`（6 キー）・本人／代理の相互照合・`schedNoteOk`（1〜200 字） |
| `firestore.rules:841-843` | 要件定義書の `edited` は最大 payload で **1 リクエスト 1000 式の上限で拒否**（2026-11-20 計測）→ callable `saveAiDraftEdits` |
| `LIVE_SCHEDULE_WBS_DATA.md:290-302` | スケジュール init（WBS 6 行・完了印なし）で **約 650 式**、完了印 5 行つきで 800 式（G1 計測） |
| `functions/src/ai/quota.ts:3-5` | 上限の置き場: 案件の日/月 = `aiDrafts/requirements.quota`、利用者の日 = `aiUsage/{yyyymm}.byUid["{day}:{uid}"]`、全体の月 = `aiUsage/{yyyymm}.count` |
| `functions/src/ai/request.ts:129`・`task.ts:97` | `aiUsage` は `readUsage()` の 4 項目（count・costMicroUsd・byDay・byUid）を **`merge:false` で丸ごと上書き**。新しい項目を足すと要件定義書の経路で消える |
| `functions/src/ai/limits.ts:6-11` | 案件 5/日・20/月・利用者 10/日・全体 200/月 |
| `functions/src/ai/edits.ts:53-72` | `saveAiDraftEdits` は TX で状態・ジョブ実行中を検査して Admin SDK で書く。**楽観的排他（連番）は無い** |
| `src/live/model.ts:305-306` | `approvalKindOf` は `schedule` 以外を**すべて requirements** と読む |
| `src/types/index.ts:231-260` | demo の `SitemapState`（before/after の nodes[]・edges[]、node = `{id, position{x,y}, data{label,path,kind,reason?}}`、devComment `{text, at, by}`） |
| `docs/TODO.md:19` | Rules の床 = スケジュール段 0 ruleset `beb93e7b-0abd-4d29-9555-18bb03686c0a`。これより前へ戻さない |

---

## 1. 結論

### 1.1 Source of Truth

| データ | 正 | 複製（4 分類） | 同期 |
|---|---|---|---|
| 状態・版・承認の印 | `projects/{pid}.sitemap`（要約マップ。スケジュールの D-1 と同じ） | なし | — |
| 作業中の版（下書き。現在＋改善後＋コメント） | `projects/{pid}/sitemap/internal` | なし | — |
| お客様に出した版 N の中身 | `projects/{pid}/sitemapVersions/r{N}`（**不変**。submit で 1 回だけ create） | internal の **Historical Snapshot** | submit の TX でだけ作る。以後変えない |
| 承認の対象の証明 | `approvals/sitemap-r{N}-{action}` の `contentHash` | 版文書の**ハッシュだけ**（中身は写さない。D-3） | create のみ |
| AI の出力（正規化済み） | `aiDrafts/sitemap.generated` | internal の初期値の **Historical Snapshot**（AI が何を出したかの記録） | 生成成功の TX で internal へ写す。期限で削除（§7） |
| ページ構成の正（承認後） | **`sitemapVersions/r{approvedRevision}`** | 要件定義書 v3 の章 04 は**要件定義段階の Historical Snapshot**（同期しない） | — |
| 案件の上限（日/月） | `aiDrafts/sitemap.quota`（要件定義書と**別枠**） | — | — |
| 利用者の日・全体の月 | `aiUsage/{yyyymm}`（**同じ文書を共用**。§8） | — | — |

**S7（章 04 との関係）[DECISION 本設計・OQ-S7 の既定に従う]**: 要件定義書は approved から戻らない（`firestore.rules:224-239`）ので章 04 は不変。サイトマップ承認後のページ構成の正はサイトマップの承認版で、章 04 へは書き戻さない。追跡のため internal・版文書に `sourceReqRevision`（生成・作成時の `requirements.revision`）を持ち、画面は「要件定義書の案から作成」と出す。

### 1.2 型との違い（[DECISION] data-backend-architect。lead-architect の Review 対象）

| # | 内容 | 理由 |
|---|---|---|
| **D-1（I2）** | **中身の書き込み（作成・保存・AI 結果・submit）は callable（Admin SDK）だけ**。Rules は `sitemap/*`・`sitemapVersions/*` へのクライアントの書き込みを全面拒否（`aiDrafts` と同じ型） | §3 の見積で最大 payload の検査は **約 2,400〜3,500 式**（上限 1,000）。パスの重複検査は Rules にループが無く O(n²) の展開になる。前例 `firestore.rules:841-843` |
| **D-2** | **状態だけの遷移（取り下げ・本人承認・代理承認・再計画）は Rules**（スケジュールの述語の型） | 中身に触れないので式は小さい（スケジュールで 300〜650 式 `LIVE_SCHEDULE_WBS_DATA.md:296-299`）。お客様の承認を本人のトークンの書き込みとして残す既存の流儀を保つ |
| **D-3（I3）** | **承認記録には写しを置かず、不変の版文書 `sitemapVersions/r{N}` ＋ `contentHash`（SHA-256）で再現する** | 写すと 1 版あたり最大約 150KB（§2.3）が submit・approve の 2 件に重複し、履歴の購読（`approvals` を 500 件 `LIVE_SCHEDULE_WBS_DATA.md:192`）が毎回それを落とす。版文書は不変（クライアント書き込み不可・サーバーは `create()` だけ）なので「版番号＝中身」が成り立ち、ハッシュは Admin SDK による事後の改変の検出と CSV の照合に使う |
| **D-4** | お客様に読める文書は**版文書だけ**（current 相当の可変文書を作らない） | 下書きが漏れる場所を作らない（スケジュール D-2 と同じ考え）。「最後に依頼した版」も「前回承認した版」も版番号の get で済む |
| **D-5** | 作業中の版の楽観的排他は `internal.editSeq`（callable の TX で照合） | 要件定義書の `saveAiDraftEdits` には連番が無い（`edits.ts:53-72`）。X-5・AC-16 のため足す |

---

## 2. 文書と項目

### 2.1 `projects/{pid}.sitemap`（要約。任意マップ。お客様も読める＝案件文書）

| Field | Type | 書く経路 | 制約 |
|---|---|---|---|
| status | `'draft'\|'requested'\|'approved'`（キー無し＝none） | 作成: callable ／ submit: callable ／ withdraw・approve・reopen: Rules | §4 の遷移だけ |
| revision | int | 作成で 0、submit で +1（≦50） | 承認記録・版の ID の世代 |
| requestedAt | timestamp | submit | 代理承認の「開いた後に変わったか」（`proxyVersionOk` と同じ使い方） |
| contentHash | string（hex 64） | submit | `== sitemapVersions/r{revision}.contentHash` |
| approvedRevision / approvedAt / approvedBy / approvalId | int / ts / uid / string | approve | スケジュールの `schedApproveMove` と同じ 6 キー |
| approvedVia | `'proxy'` | 代理だけ | 本人の承認では消す |

- 段 0: `validProject` の `hasOnly` に `'sitemap'`、`(!has('sitemap') || d.sitemap is map)`。`projCreateOk:361` を `['consult','schedule','sitemap']` に。`projUpdateOk` の既存分岐の `ch.hasOnly` には入れない
- 書くと `updatedAt/By` も変わる（callable も同じ値を書く。一覧の並びが動く＝状態の変化なので可）

### 2.2 `projects/{pid}/sitemap/internal`（作業中の版。admin・担当だけ。お客様不可）

| Field | Type | 制約（検査は callable。§3.2） |
|---|---|---|
| schemaVersion | int | 1 |
| before / after | `{nodes: Node[], edges: Edge[]}` | demo の `SitemapState` と同じ形（変換を作らない） |
| Node | `{id, position{x,y}, data{label, path, kind, reason?}}` | §7 の Validation 全項目（PLAN §7） |
| Edge | `{id, source, target}` | 両端が同じ図に存在・自己接続なし・重複なし |
| devComment | `{text, at, byUid, byName}` 任意 | 0〜500 字（空＝キーを消す）。byName は `accounts/{uid}.name`（サーバーが入れる） |
| origin | `'ai'\|'manual'` | 「AI提案」の印（OQ-S3）。AI 生成で `ai`、手で作成で `manual`。編集しても変えない |
| sourceReqRevision | int | 作成時の `requirements.revision` |
| aiRequestId | string 任意 | 最後に反映した生成の requestId |
| editSeq | int | 作成 0、保存ごとに +1（D-5） |
| updatedAt / updatedBy / savedByName | ts / uid / string | サーバー時刻・本人 |

### 2.3 `projects/{pid}/sitemapVersions/r{N}`（お客様に出した版。不変）

| Field | 内容 |
|---|---|
| schemaVersion・revision（== N）・before・after・origin・sourceReqRevision | internal から submit の瞬間に写す |
| devComment | `{text, at, byName}` だけ（**byUid は写さない**。お客様に出す値は名前と日時＝F-6） |
| contentHash | `sha256(canonicalJSON({before, after, devComment}))`。正規化（キー順・数値）の純関数を 1 か所に置き、承認の画面・CSV・テストで共用 |
| submittedAt / submittedBy | サーバー時刻・uid |

- **書く項目は allowlist の純関数 `toSitemapVersion(internal)` だけで組む**（AC-03。単体テストで余計なキー＝editSeq・updatedBy・aiRequestId・lastError 等が入らないこと）
- 大きさ [INFERENCE]: 1 ページ最悪 ≒ 0.6KB（名前 24 字・パス 60・理由 140 字の UTF-8 3B・座標）× 120 ＋ 接続 240 × 約 70B ≒ **約 90〜150KB**（1MiB の 15% 以下）。典型（30 ページ・理由 3 件）は 10〜20KB
- 読み取り: `isAdmin() || assigned(pid) || clientOf(pid)` の **get だけ**（list は admin・担当）。取り下げた版もお客様は一度見ているので読めてよい

### 2.4 `approvals/sitemap-r{N}-{action}`（既存コレクション・追記のみ）

共通: `schemaVersion:1, kind:'sitemap', action, revision, side, actorUid, actorName, actorEmail, at, actorRole?`（`actorBase` と同じ）

| action | 書く経路 | 追加の項目 | 照合 |
|---|---|---|---|
| submit | **callable**（Admin SDK。actor* は検証済みトークンと accounts から） | `contentHash`・`pageCount{before,after}` | 同じ TX で版文書と要約を作る |
| withdraw | Rules | `note`（**必須** 1〜200。PLAN §3。`schedNoteOk`） | 要約 requested → draft |
| approve（本人） | Rules | `contentHash` | `== get(sitemapVersions/r{b.revision}).contentHash`・`revision == b.revision`・side client・proxy なし |
| approve（代理） | Rules | `contentHash`・`proxy:true`・`note`・`actorRole:'admin'` | 同上＋`approvedVia:'proxy'` |
| reopen | Rules | `note`（必須） | 要約 approved → draft |

- **ID が冪等キー**。次に同じ操作をする場面（取り下げ後・再計画後の再依頼）は必ず revision が上がるので世代は revision で足りる（スケジュール §2.4 と同じ）
- `apprCreateOk` は `: k == 'sitemap' ? siteApprOk(pid, aid, a)` を**後ろに足すだけ**。`siteApprOk` は action submit を**常に拒否**（クライアントは submit を書けない）。ID の接頭辞と kind の不一致も拒否
- AC-09 の editSeq: requested 中は編集不可（OQ-N4）なので**版番号だけで表示した中身が決まる**。承認は「表示した revision」で ID を組めば足り、editSeq は承認に含めない

---

## 3. 書き込み経路（I2 の解決）

### 3.1 Rules で中身を検査した場合の式の見積（[INFERENCE]。計測ではない）

| 検査 | 1 件の式 | 件数（最大） | 合計 |
|---|---|---|---|
| ノード（keys・id 正規表現・label・path・kind・reason 任意・x,y の型と範囲） | 10〜14 | 120（2 図×60） | 1,200〜1,700 |
| 接続（keys・両端の存在 `ids.hasAll([s,t])`・自己接続） | 4〜6 | 240 | 960〜1,440 |
| パスの重複・home ちょうど 1 件 | 一覧の組み立て＋`toSet().size()` | 2 図 | 約 130〜250 |
| 状態・役割・ゲート（スケジュール init の固定部分） | — | — | 約 200 |
| **合計** | | | **約 2,500〜3,600（上限 1,000 の 2.5〜3.6 倍）** |

根拠: スケジュール init は 6 行で約 650 式（`LIVE_SCHEDULE_WBS_DATA.md:302`）。要件定義書 edited はポイント 6 件で上限超え（`firestore.rules:841-843`）。60 件の明示展開は Rules の関数本体も膨らむ。**分割（図ごと・ページ範囲ごとの文書）でも接続の両端検査が文書をまたぐため成立しない** → 計測（G1）は不要と判断し、callable に決める。

### 3.2 callable の一覧（すべて `asia-northeast1`・Secret なし・既存の `authz.ts` の判定を共用）

| 関数 | 入力 | TX で読む | TX で書く | 主な拒否 |
|---|---|---|---|---|
| `saveSitemapEdits` | `{projectId, op:'createManual'\|'save', baseEditSeq?, before?, after?, devComment?}` | accounts・案件・internal・aiDrafts/sitemap | internal（作成 or 置換）・作成時は案件の要約 `{draft, 0}` | 要件定義書 ≠ approved・archived・status ∉ {none(作成), draft(保存)}・AI 実行中（OQ-S5）・`baseEditSeq ≠ editSeq` → `aborted: conflict`・§7 の検査 → `invalid-argument`（項目と件数） |
| `submitSitemap` | `{projectId, baseEditSeq, expectRevision}` | 同上＋スケジュールの要約 | 版文書 r{N+1}（`create`）・承認記録 submit（`create`）・案件の要約 requested | 上に加え、スケジュールに `approvedRevision` 無し（OQ-S2）・不正なページが 1 件でも（件数を返す）・改善後にトップ＋1 件未満 |
| `requestSitemapDraft` | `{projectId, requestId(UUID v4), regenerate?, discardEdits?, confirmDiscard?}` | 案件・要件定義書・internal・aiDrafts/sitemap・aiUsage | aiDrafts/sitemap（job・quota）・aiUsage | `AI_SITEMAP_MODE`・allowlist・前提・上限・既に実行中（`requestRequirementsDraft` と同じ順序 `AI_REQUIREMENTS.md:61`） |
| `generateSitemapDraftTask`（onTaskDispatched） | `{projectId, requestId}` | 同上 | 成功の TX（fencing）: aiDrafts/sitemap.generated・usage、internal（none なら作成＋要約 draft、`discardEdits` なら置換し editSeq+1・origin 'ai'） | `job.requestId ≠ 自分`・`job.baseEditSeq ≠ internal.editSeq`（防御）・状態が draft/none でない → 結果を捨てる |

- 保存は**丸ごと置換**（差分パッチにしない）。payload は最大約 150KB で callable の上限内。検査が全体に対して 1 回で済む
- **submit の冪等**: 同じ `expectRevision` で 2 回目が来て、要約が requested かつ `revision == expectRevision+1` かつ版文書のハッシュが internal から作った値と同じなら成功を返し **WARN `sitemap.submit.duplicate {projectId, revision}`** を出す（無音にしない）。違えば `failed-precondition`
- お客様の承認・代理承認・取り下げ・再計画は**クライアントの `runTransaction`**（スケジュールと同じ。`repositories.tsx` の二重承認の WARN 処理を流用）

### 3.3 Rules（クライアントが書く分）。実装は database-engineer

| パス | get | create / update / delete |
|---|---|---|
| `sitemap/{sid}` | `sid == 'internal' && (isAdmin() \|\| assigned(pid))` | すべて false |
| `sitemapVersions/{vid}` | `isAdmin() \|\| assigned(pid) \|\| clientOf(pid)`（list は admin・担当） | すべて false |
| `projects/{pid}`（追加分岐 `siteProjOk`。`schedProjOk` の後ろ） | — | afro: requested→draft（withdraw の existsAfter）／ approved→draft（reopen）、差分 `[status]` だけ ／ client 本人・admin 代理: `schedApproveMove` と同じ 6 キー＋相互照合。すべて `requirements.status=='approved'`・事前事後 `archived==false` |
| `approvals`（`siteApprOk`） | 既存 | withdraw・reopen（afro・note 必須）／ approve 本人・代理（`contentHash` 照合）。**submit は拒否** |

- get の数（承認の最大）[INFERENCE]: accounts・案件・版文書・承認文書（getAfter）の 4 文書。式はスケジュールの代理承認（650／450）と同程度の見込み → **G1 の計測を `tests/rules` に記録する**（SR 相当の 1 行。§10）

---

## 4. 遷移と TX 境界

| 遷移 | 経路 | 書く文書（1 TX） | Write | 途中失敗 |
|---|---|---|---|---|
| none → draft（手） | callable | 案件・internal | 2 | 1 TX。部分成立なし |
| none → draft（AI） | worker の成功 TX | aiDrafts・internal・案件・aiUsage（費用） | 4 | 失敗なら何も置かず `lastError`（X-1） |
| draft 保存 | callable | internal | 1 | — |
| draft → requested | callable | 版文書・承認 submit・案件 | 3 | `create()` が既存で失敗 → TX 全体が失敗（重複版を作らない） |
| requested → draft | Rules（client TX） | 案件・承認 withdraw | 2 | 相互の existsAfter |
| requested → approved | Rules（client TX） | 案件・承認 approve | 2 | 同時の取り下げとは事前 requested の取り合いで一方だけ成立 |
| approved → draft | Rules（client TX） | 案件・承認 reopen | 2 | internal は承認版と同じ中身のまま残る（編集を再開できる） |

- **外部 API（Anthropic・現行サイトの取得）は TX の外**（worker の処理中。結果の書き込みだけが最後の TX）
- callable の TX と client の TX は同じ案件文書を読むので、Firestore の競合検出で直列になる [INFERENCE: サーバー側 TX の悲観的ロックとクライアント TX の楽観的再試行の組み合わせ。2 タブの submit×withdraw は qa のテストで確認]

---

## 5. 画面の Read / Write 見積（Confidence: LOW・未計測）

| 画面・操作 | 読む | 追加 Read | Write |
|---|---|---|---|
| アフロ側の編集画面 | internal・aiDrafts/sitemap（リスナー 2 本・離脱で解除）＋案件・approvals（既存の購読を共有）＋承認版の表示時だけ版文書 1 | 文書 2〜3＋変更ごとに 1 | — |
| 保存 1 回（1 秒以上まとめる・ドラッグ中は書かない） | callable の TX で 4（accounts・案件・internal・aiDrafts） | 4＋開いている編集者ごとに 1 | 1 |
| 承認の依頼 | 5 | 5 | 3 |
| お客様のポータル | 版文書 1（要約の revision／approvedRevision で決める）＋案件 | 1 | — |
| お客様の承認 | TX で案件・版文書＋Rules の get 4 | 約 6 | 2 |
| 一覧・ダッシュボード | `projects` の購読だけ（`sitemap.status`） | **0** | — |

- 1 案件の編集（30 分 × 3 回、保存 約 1,000 回）で Read 約 5,000・Write 約 1,000 [INFERENCE] → 案件数に線形。Firestore 無料枠（Read 5 万/日）の内
- 転送量: internal のリスナーは保存ごとに文書全体（典型 20KB・最悪 150KB）を受け取る。最悪 1,000 回 × 150KB ≒ 150MB/案件 [INFERENCE]。典型は 20MB。**費用は小さいが、最悪ケースはモバイル回線で重い** → 閾値（§11）
- callable の呼び出し回数: 保存と同数（1,000 回/案件）。Functions 無料枠（200 万回/月）の内。minInstances 0（コールドスタートで保存が 1〜3 秒遅れることがある [INFERENCE]。debounce の中に収まる）

## 6. Index

- **段 1 は新規なし**（すべて文書 ID の get。approvals の履歴は既存の `orderBy('at','desc') limit(500)`）。`firestore.indexes.json` は段 1 で変えない
- 段 2（§7 の削除ジョブ）: `collectionGroup('aiDrafts').where('generatedAt','<=',cutoff).orderBy('generatedAt').limit(100)` に**コレクショングループ範囲の単一フィールド Index**（fieldOverride）が要る [INFERENCE: コレクショングループの単一フィールド Index は自動で作られない。`docs/knowledge/tech/firestore.md` で確認してから定義。エミュレータは Index を強制しないので緑を根拠にしない]

## 7. AI ジョブ文書と生出力のライフサイクル（項目 21）

`projects/{pid}/aiDrafts/sitemap`（Rules は既存の `aiDrafts/{did}` のまま＝お客様不可・クライアント書き込み不可 `firestore.rules:483-486`）

| Field | 内容 |
|---|---|
| state | `'ready'\|'failed'`（下書きの有無。ジョブ状態と分ける＝B-H1） |
| job | `{state:'running'\|'idle', requestId, by, startedAt, leaseUntil, quotaDay, regenerate, discardEdits, baseEditSeq}` |
| generated | `{before, after, notes[], siteFetch:'ok'\|'blocked'\|'timeout'\|…, sourceReqRevision, model, promptVersion}`（**正規化・検査済みのものだけ**。モデルの生テキストは保存しない） |
| generatedAt | ts（削除ジョブの検索キー。削除時に消す） |
| inputHash / configHash | 再利用の判定（同一入力で `regenerate` なし → 上限に数えず reused） |
| usage / quota / lastError | 既存と同じ形（`lastError = {code, at, requestId}`。本文を書かない） |

**削除（AI 出力の保持期限）の駆動部** — 段 2（`AI_SITEMAP_MODE=on` の前提条件）

| 項目 | 設計 |
|---|---|
| 駆動部 | Cloud Scheduler（毎日 03:30 JST）→ `onSchedule` 関数 `purgeAiDraftOutputs` |
| 対象の定数 | `AI_DRAFT_PURGE_TARGETS = ['sitemap']`（requirements を足すかは lead-architect。要件定義書の削除も未実装 `docs/TODO.md:8`。足すなら同じ関数・同じ条件） |
| 条件 | `generatedAt <= 今 − 保持日数` かつ 親案件の該当の要約が `approved` かつ `approvedAt <= 今 − 保持日数`（**保持日数は LEGAL。案 90 日** `AI_REQUIREMENTS.md:194`） |
| 処理 | `generated`・`generatedAt` を `FieldValue.delete()`、`purgedAt` を書く（job・quota・usage は残す＝上限の数え直しを防ぐ）。internal・版文書は消さない（Retain） |
| 分割 | 100 件ずつ cursor で最大 10 ページ / 回。残りは翌日（未承認で期限を過ぎた文書は毎日読み直す＝滞留案件数に比例。件数をログに出す） |
| 完了条件（配線） | Scheduler の登録 1 件・関数の呼び出し元（Scheduler）・時刻を進めるテスト（qa）・`deploy-firebase.mjs` の `on` のゲートに「法務の記録 **かつ** 削除関数がデプロイ済み」を足す |
| 観測 | `ai.purge {target, scanned, purged, skippedNotApproved}` を INFO。0 件が 7 日続いても異常ではない（件数が小さいため）。失敗は ERROR |

## 8. 上限のカウンタ（OQ-N3: 案件・利用者は別枠、全体と費用は共用）

| 上限 | 置き場 | 要件定義書との関係 |
|---|---|---|
| 案件 5/日・20/月 | `aiDrafts/sitemap.quota` | 別文書なので自然に別枠 |
| 利用者 10/日 | `aiUsage/{yyyymm}.byUid["sitemap:{day}:{uid}"]` | **同じ map に接頭辞つきの鍵**。要件定義書の鍵 `"{day}:{uid}"`（`quota.ts:53`）は変えない |
| 全体 200/月 | `aiUsage/{yyyymm}.count` | **共用**（両方の reserve が同じ値を見て加算） |
| 費用 | `aiUsage/{yyyymm}.costMicroUsd`（共用）＋ Anthropic Workspace 月 $20（`docs/TODO.md:94`） | 共用 |

- **新しい項目（byKind 等）を `aiUsage` に足さない**: 要件定義書の経路が `merge:false` で 4 項目だけを書き戻す（`request.ts:129`・`task.ts:97`）ため消える。種類ごとの件数はログ（`event: 'ai.request', kind`）で集計する
- `userDayKey(day, uid, kind?)` に kind を足し、`kind` 無し＝現行の鍵（同値）。**回帰テスト**: 要件定義書の reserve/refund が `sitemap:` の鍵を保ったまま書き戻すこと（`readUsage` の byUid は全鍵を写す `quota.ts:44-51` が前提）
- 上限の値は `limits.ts` に `AI_QUOTA_SITEMAP`（同じ値）を足す。既存の `AI_QUOTA` は変えない（PLAN §17）

## 9. Migration とリリースの段

- **データ移行なし**。`sitemap` キーの無い案件は none。既存の approvals は kind requirements / schedule のみ
- **床**: いまの床は `beb93e7b…`（`docs/TODO.md:19`）。サイトマップ段 0 を出したら、**その ruleset ID が新しい床**（TODO と Runbook に記録）。以後 Rules をそれより前へ戻さない

| 段 | 出す順 | 中身 | Rollback |
|---|---|---|---|
| **0** | Rules → Hosting | Rules: `validProject` に `sitemap`・`projCreateOk` で禁止・`sitemap/*`・`sitemapVersions/*` の match（全拒否）・`apprCreateOk` に `k=='sitemap' ? false`（明示）。Hosting: `approvalKindOf` に `'sitemap'`（今は未知の kind を要件定義と誤表示する `model.ts:305-306`）・履歴の文「サイトマップ（第N版）」・`keyOf` は kind＋版 | Rules は `beb93e7b` へ戻せる（sitemap のデータがまだ無い）。Hosting は前の版へ |
| **1** | Rules → Functions → Hosting（RUNBOOK 0.51.0 の順） | Rules: §3.3 の読み取りと状態遷移。Functions: §3.2 の 4 関数（`AI_SITEMAP_MODE=internal`＋allowlist）。Hosting: 画面 | **Hosting を段 0 へ → Functions の 4 関数を削除（または AI は mode off、保存・submit は Hosting 側で入口が消える）→ Rules を段 0 へ**。**段 0 より前へは戻さない**（`sitemap` を持つ案件で旧 `validProject` が落ち、基本情報・アーカイブが全件失敗する＝スケジュールと同じ罠） |
| **2** | Functions（＋indexes） | §7 の削除関数・Scheduler・Index、`on` のゲート | 関数を止める（データは消えたものは戻らない＝期限削除の性質。法務の結論どおり） |
| `on` | 設定 | 法務の記録（LEGAL REVIEW REQUIRED）＋段 2 | `internal` に戻す |

- 戻しても作った文書・版・承認の記録は**消さない**（Retain）
- 新 Hosting × 旧 Rules（順番違い）: クライアントの承認・取り下げは拒否（安全側）。callable は Rules に依存しないので、段 1 の Rules より先に Functions だけ出ても、版文書は読めない（お客様に見えない）だけで壊れない
- 段 0 は専用コミット（スケジュール `LIVE_SCHEDULE_PLAN.md:146` と同じ）

## 10. テスト観点（qa-engineer が確認。実装者が追加）

| # | 観点 |
|---|---|
| T-01 | Rules: `sitemap/internal`・`aiDrafts/sitemap` をお客様・担当外が get → 拒否。全員（admin 含む）のクライアント write → 拒否。版文書はお客様 get 可・list 不可 |
| T-02 | Rules: 承認（本人・代理）・取り下げ・再計画の正否（スケジュールの SR-09〜13 と同じ表）。`contentHash` 不一致・古い版の ID・クライアントの submit → 拒否。kind と ID 接頭辞の不一致 → 拒否 |
| T-03 | Rules 回帰: `sitemap` を持つ案件で基本情報・アーカイブ・相談・スケジュールの全操作が通る。既存の全件が無変更で緑。G1: 承認の最大ケースの式数を記録 |
| T-04 | callable: §7 の全検査（61 ページ・121 接続・トップ 0/2 件・パス重複・25 字・制御文字・座標範囲外）→ 保存されない。`baseEditSeq` 違い → conflict（2 タブ）。requested・approved・archived・AI 実行中 → 拒否 |
| T-05 | submit: 版文書の allowlist（余計なキーなし）・ハッシュの再計算一致・2 回目の冪等（WARN）・スケジュール未承認で拒否 |
| T-06 | AI: 偽の本文を送っても使われない・送信 payload のスナップショット（PLAN §5 の送らない項目）・同じ requestId で 1 回・lease 切れ・fencing・上限（別枠／共用）・要件定義書の経路で `sitemap:` 鍵が消えない |
| T-07 | 削除ジョブ（段 2）: 時刻を進めて、承認済み・期限超えだけ `generated` が消え、job・quota・internal・版は残る |

## 11. クライアントが決められる値（security-engineer・qa-engineer へ）

| 値 | 用途 | 安全・料金・権限・証跡 | サーバー側の正 | 偽申告テスト |
|---|---|---|---|---|
| ノード・接続・コメントの中身 | 表示・承認の対象 | 証跡（承認の対象） | callable の検査＋版文書のハッシュ | T-04・T-05 |
| baseEditSeq / expectRevision | 競合・冪等 | 使わない（照合だけ） | internal.editSeq・要約の revision | T-04・T-05 |
| 承認の revision・contentHash | 対象の版 | **古い画面の承認を止める** | 要約の revision・版文書のハッシュ | T-02 |
| side / proxy / actorRole / approvedVia | 本人か代理か | **証跡** | roleOf と相互照合 | T-02 |
| note | 取り下げ・代理・再計画の理由 | 証跡（中身は検証不能） | 文字の検査のみ | T-02 |
| requestId / regenerate / discardEdits / confirmDiscard | 冪等・再生成 | **料金**（上限に数える） | job・quota は TX 内のサーバー値 | T-06 |
| 要件定義書の本文・承認済みかどうか | AI の入力・前提 | **外部送信** | **受け取らない**（サーバーが Firestore から読む） | T-06 |
| origin（AI 提案の印） | 表示 | 表示のみ | サーバーが生成経路で決める | T-04 |

## 12. 作り替えの閾値・未確認

| # | 内容 | 対応 |
|---|---|---|
| TH-1 | 1 案件で版文書が 50 版（revision の上限）に近づく／版文書が 300KB を超える | 版の履歴を一覧で出す要件が来たら list を `orderBy(revision) limit` に。大きさは接続の上限から見直す |
| TH-2 | 保存の転送量が典型 20KB を大きく超える案件が出る（ページ 60 近く） | internal を「before／after」の 2 文書に分ける（転送が半分）。それでも重ければ差分保存 |
| TH-3 | 1 案件の承認記録が 500 件に近づく | `where('kind','==',…)`＋`orderBy('at')` に分ける（複合 Index。スケジュール §13 と同じ） |
| UK-1 | callable の TX とクライアントの TX が同じ案件文書を取り合ったときの挙動（submit × withdraw は submit 前提で起きないが、承認 × 取り下げ × callable 保存の組） | INVESTIGATION REQUIRED（T-02・T-04 で 2 タブ再現） |
| UK-2 | 承認の Rules の式数（見込み 300〜650） | INVESTIGATION REQUIRED（T-03 の G1） |
| UK-3 | コレクショングループの単一フィールド Index の要否（§6） | 段 2 の前に `tech/firestore.md` で確認 |
| UK-4 | AI 1 回の費用（出力 30 ページの JSON。max_tokens の値） | ai-engineer が試算（要件定義書 Sonnet 5.5 で 1 回 $0.10 `AI_REQUIREMENTS.md:170` を超えない見込み [INFERENCE]）。PoC 後に請求と突合 |
| LEGAL | AI 出力の保持日数・承認の効力 | LEGAL REVIEW REQUIRED（PLAN §12）。本設計は結論を出さない |

## 13. 実行基盤要件（platform-engineer へ）

| 項目 | 内容 |
|---|---|
| 関数 | 段 1: callable 3（`saveSitemapEdits`・`submitSitemap`・`requestSitemapDraft`、SA は全体既定・Secret なし・minInstances 0）＋ worker 1（`generateSitemapDraftTask`、`maxAttempts 1`・`maxConcurrentDispatches 2`・`maxInstances 2`・timeout 540s・Secret `ANTHROPIC_API_KEY` はここだけ・SA `afro-cms-ai-worker@`。`limits.ts:20-27` と同じ）。段 2: scheduler 1 |
| 権限 | callable SA: Firestore 読み書き・Cloud Tasks enqueuer（新キュー）。worker SA: Firestore・Secret の accessor。scheduler: Firestore |
| Queue / Scheduler | Cloud Tasks キュー 1（サイトマップの worker 用。タスク ID に requestId＝世代は押下ごとの UUID）。Scheduler 1（段 2）。**登録件数を Release GO の確認項目に** |
| 監視 | `ai.request`/`ai.task` に `kind:'sitemap'`、`sitemap.save`/`sitemap.submit` の `status`・`errorCode`（中身・名前を出さない）。running の lease 切れ件数。既存の月 1 の請求突合に sitemap の件数を足す |
| 継続費用 | Functions・Firestore は無料枠の内の見込み（§5。LOW）。AI は全体 200 回/月・$20 の共用枠の内で**総額の上限は増えない** |
