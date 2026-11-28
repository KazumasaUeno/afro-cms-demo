# REQ-LIVE-SITEMAP-01: live のサイトマップ（AI 下書き＋お客様承認）— 詳細要件

| Version / Status | リスク | 関連 | 最終更新 |
|---|---|---|---|
| 0.1 / **DRAFT（Requirement Review 前）** | **CRITICAL**（外部 AI へのお客様データ送信・認可・承認の証跡・継続費用） | ユーザー依頼 2026-11-28「demo のサイトマップを live へ。要件定義 → スケジュール → サイトマップ」／型: [`LIVE_SCHEDULE_PLAN.md`](LIVE_SCHEDULE_PLAN.md)・[`AI_REQUIREMENTS.md`](AI_REQUIREMENTS.md) | 2026-11-28 requirements-architect |

- 本書は**要件**（何が成り立てばよいか）。保存先・Rules の式・callable の形は data-backend-architect / lead-architect が決める。**コードは含まない**
- ラベル: [FACT]=実物で確認（file:line）／ [INFERENCE] ／ [UNKNOWN] ／ [DECISION]=決定者つき ／ [ASSUMPTION]・[TARGET]=根拠のない値
- 画面は **demo と全く同じ**（demo = 承認済みデザイン。memory 2026-11-26）。demo に無い要素は demo の部品の中に、live の props があるときだけ出す（`LIVE_SCHEDULE_PLAN.md:29` L-13 と同じ）

---

## 1. Goal と前提

**Goal**: 要件定義書（お客様承認済み）から、AI が「現在」と「リニューアル後」のページ構成と改善理由のたたき台を作り、アフロ側（担当の開発者・管理者）が直して意図を添え、お客様の承認を記録する。承認済みのページ構成が、次の段階（トップデザイン・構築）の入力になる。

### 1.1 demo の挙動（[FACT]。live はこれに合わせる）

| # | 事実 | 根拠 |
|---|---|---|
| F-1 | サイトマップは初めは無い。要件定義書の承認のときに作られる（現在・改善後の 2 つ） | `src/store/reducer.ts:416-418`・`src/data/sitemap.ts:203-213` |
| F-2 | 「作成済み」= 改善後のページが 1 件以上。トップは削除できない | `src/data/sitemap.ts:213`・`src/features/sitemap/flowConfig.ts:13` |
| F-3 | 編集（追加・削除・移動・接続・ページ名・改善理由）は**お客様の承認前ならいつでも**。**承認依頼中も編集できる**。承認後は閲覧だけ | `SitemapPage.tsx:42-46`・`reducer.ts:435-438` |
| F-4 | 承認の依頼は**スケジュールの承認後**だけ出る（`approvalSteps` の sitemap が waiting になるのはスケジュール承認後、ボタンは waiting かつ未依頼のときだけ）。お客様の承認も同じ条件 | `portalSteps.ts:62-64`・`RequestApprovalButton.tsx:19-25`・`reducer.ts:453` |
| F-5 | 依頼の取り下げ・承認後のやり直し（再計画）は**無い** | `SitemapPage.tsx:301-322`（操作は依頼だけ） |
| F-6 | 「開発担当者より」コメント: 500 字・改善後の図の下・**書けるのは開発者画面だけ**（管理者は読むだけ）・承認後は読むだけ・**お客様ポータルにも出る**（書いた人の名前と日時つき） | `DevComment.tsx:12,36-49`・`reducer.ts:440-447`・`PortalApprovalsPage.tsx:239` |
| F-7 | お客様は図（現在／リニューアル後の切替・閲覧のみ）、ページ一覧、新ページの改善理由（最大 3 件）、開発者コメントを見る | `PortalApprovalsPage.tsx:198-243`・`SitemapViewer.tsx:18-85` |
| F-8 | ページ名 `validateLabel`（trim 後 1〜24 字）、パス `validatePath`（`/` 始まり・60 字・`[a-z0-9-_/]`・重複不可）、改善理由 140 字 | `metrics.ts:42-59`・`SitemapPage.tsx:191`・`AddPageDialog.tsx:45` |
| F-9 | 種類は `home / section / page / new / cta`。指標（ページ数・最大階層・問い合わせまでのクリック数・第 1 階層）は純関数 | `src/types/index.ts:231-237`・`metrics.ts:11-40` |
| F-10 | AI の見本（`sitemapFor`）は**トップ → 第 1 → 第 2 階層**の 3 段だけを配置する | `src/data/sitemap.ts:58-79` |
| F-11 | 「改善理由」「現状の課題」の欄に常に「AI提案」の印 | `SitemapPage.tsx:224` |
| F-12 | 制作フローのナビは 要件 → 日程 → サイトマップ → デザイン。サイトマップの完了 = 承認済み | `BuildFlowNav.tsx:21-27` |

### 1.2 live の現状（[FACT]）

- live にサイトマップは無い（`src/live` で `sitemap` は `projectView.ts:22` の受け渡しだけ）。段階は要件定義 → スケジュールまで（`src/live/model.ts:119-129`）
- 承認の記録は kind で振り分け（`firestore.rules:320-325`、`src/live/model.ts:305-306`）。スケジュールは current（お客様は `revision>=1` だけ）／internal（お客様不可）の 2 文書（`firestore.rules:504-513`）、取り下げ・再計画・代理承認は理由必須（`firestore.rules:779-806`・`schedNoteOk` :614）
- 要件定義書は **approved から戻る遷移が無い**（`firestore.rules:224-239` M-3）
- AI 下書き: callable `requestRequirementsDraft`（認可・上限・lease）→ Cloud Tasks の worker（Secret はここだけ）→ `aiDrafts/requirements`（お客様不可・クライアントから書けない。`firestore.rules:483-486`）。編集は callable `saveAiDraftEdits`（Rules の式の上限を超えたため。`AI_REQUIREMENTS.md:190`）。フラグ `AI_REQUIREMENTS_MODE`（本番 `internal`＋allowlist。`functions/.env.afro-cms-4a6ff:2`）、`on` は法務の記録 `docs/legal/AI_REQUIREMENTS_LEGAL_CLEARANCE.md` が無いとデプロイ拒否（`scripts/deploy-firebase.mjs:127-136`）。上限 案件 5/日・20/月・利用者 10/日・全体 200/月（`functions/src/ai/limits.ts:6-11`。変更はユーザー確認）
- 要件定義書の v3 ひな型には章「04 サイトマップ・ページ一覧」（AI の**案**）がある（`REQUIREMENTS_DOC_TEMPLATE.md:23,77`）
- スケジュールの要約は再計画後も `approvedRevision` を保つ（`src/live/schedule.ts:25,100`）

## 2. Actors と権限（Permission Matrix）

役割の判定は既存の `roleOf`（`firestore.rules:40`）。**画面の出し分けはセキュリティ境界ではない**（全行を Rules または callable で止める）。

| 操作 | admin（全案件） | 開発者（担当） | 開発者（担当外） | お客様（自案件） | 未ログイン・無効・メール不一致 | 制御する場所 |
|---|---|---|---|---|---|---|
| 作業中の版（下書き）を読む | ○ | ○ | × | **×** | × | Rules（get） |
| お客様に出した版（依頼中・承認済み）を読む | ○ | ○ | × | ○（自案件だけ） | × | Rules |
| AI の生出力・ジョブ状態・使用量を読む | ○ | ○ | × | × | × | Rules（`aiDrafts` と同じ） |
| AI で下書きを作る／作り直す | ○ | ○ | × | × | × | callable（フラグ・上限・前提） |
| ページの追加・編集・削除・移動・接続 | ○ | ○ | × | × | × | Rules または callable（§6） |
| 開発担当者よりコメント | **○**（C-02） | ○ | × | × | × | 同上 |
| 承認を依頼する／取り下げる | ○ | ○ | × | × | × | Rules（承認記録と状態の相互照合） |
| 承認する（本人） | × | × | × | ○ | × | Rules（`side:'client'`・proxy なし） |
| 代理で承認する（理由必須） | ○ | × | × | × | × | Rules（`proxy:true`・`actorRole:'admin'`・note） |
| 承認後のやり直し（OQ-N1 で決める） | ○ | ○ | × | × | × | Rules |
| 削除（文書・記録） | × | × | × | × | × | Rules（delete false。追記のみ） |

- 他案件の ID を指定した読み取り・書き込みは拒否（お客様は `projectId` 一致だけ。`firestore.rules:35`）。存在の有無で応答を変えない
- 自己依頼 → 自己代理承認は止めない（スケジュールと同じ受容 `LIVE_SCHEDULE_PLAN.md:30` L-14）。履歴に「代理」「依頼と同じ人」を出す

## 3. 状態と遷移

状態の正は 1 か所（案件文書の要約。スケジュールの D-1 と同じ型）。AI のジョブ状態は別に持つ（`AI_REQUIREMENTS.md:33` B-H1 と同じ）。

| 状態 | 意味 | 編集 | お客様に見えるもの |
|---|---|---|---|
| `none` | 未作成（要件定義書の承認前、または承認後で未作成） | 不可（作成だけ） | ステップは「準備中」（demo `PREPARING` の文言） |
| `draft` | 下書き（AI 生成済みまたは手で作成） | ○ | 前に承認した版があればそれ＋「調整中」、無ければ準備中 |
| `requested` | お客様へ依頼中（版 N） | **×**（C-03。取り下げてから） | 版 N |
| `approved` | 承認済み（版 N。本人 or 代理） | × | 版 N |

AI ジョブ（`draft` / `none` のときだけ動く）: `idle` → `running`（lease つき）→ 成功で下書きを置く／失敗で `lastError`。lease 切れは失敗扱いで次の押下が引き継ぐ。

| 遷移 | 可否 | 誰が | 条件 | 副作用 |
|---|---|---|---|---|
| none → draft（AI） | ○ | admin・担当 | 要件定義書 approved・未アーカイブ・フラグと上限 | 現在・改善後の 2 つと理由を置く。上限に 1 加算 |
| none → draft（手で） | ○ | 同上 | 要件定義書 approved・未アーカイブ | トップ 1 件だけの改善後（AI 不使用。OQ-S4） |
| draft → draft（編集・再生成） | ○ | 同上 | 同上。再生成で編集を捨てるときは確認 | 版内の連番を +1（同時編集の検出） |
| draft → requested | ○ | 同上 | **スケジュールが 1 回以上承認済み**（OQ-S2）・ページ名とパスがすべて有効・改善後にトップと 1 件以上 | 版 +1。お客様に出す版を固定し、承認記録（submit）に版の中身が再現できる形で残す |
| requested → draft（取り下げ） | ○ | 同上 | 理由 1〜200 字（お客様にも見える） | 承認記録（withdraw）。お客様の承認ボタンは消える |
| requested → approved（本人） | ○ | お客様 | 表示した版・連番が今の版と同じ | 承認記録（approve, side client） |
| requested → approved（代理） | ○ | admin | 同上＋理由 1〜200 字 | 承認記録（approve, proxy） |
| approved → draft（やり直し） | **OQ-N1** | admin・担当 | 理由必須 | 承認記録（reopen）。前回承認版は記録に残る |
| どの状態 → none・削除 | × | 誰も | — | — |
| アーカイブ中の全遷移 | × | 誰も | 事前・事後とも `archived == false`（`LIVE_SCHEDULE_PLAN.md:33` L-17） | 読み取りは可 |

**あり得ない組み合わせ（どれも Rules で拒否できること）**: 要件定義書 ≠ approved でサイトマップ ≠ none ／ `requested` で版の中身が依頼時と違う ／ `approved` なのに承認記録が無い ／ 承認記録が `side:'client'` かつ `proxy` ／ お客様が読める文書に下書き・社内メモ・AI の生出力 ／ AI ジョブ `running` 中に `requested` へ（OQ-S5）。

## 4. 流れ

**Main**: ① 要件定義書の承認 → ② 案件詳細の「次に必要な作業」がスケジュール → スケジュール承認後は**サイトマップ**（`src/live/model.ts:124-129` の段階を延ばす）→ ③「AI で下書きを作る」→ 生成中表示（実際の工程だけ・秒数を出さない）→ ④ 現在／改善後と改善理由が出る → ⑤ 開発者が直し、コメントを書く → ⑥ 承認を依頼 → ⑦ お客様がポータルの確認・承認で図と理由・コメントを見て承認 → ⑧ アフロ側に「承認済み 日時」「デザインへ進む」（demo `SitemapPage.tsx:302-308`。デザインは live に未実装のため OQ-S6）。

**Alternate**: 手で作る（AI 不使用・フラグ off の案件）／ 再生成（編集を捨てる確認）／ 取り下げ → 直して再依頼（版 +1）／ 代理承認 ／ 途中でタブを閉じる（保存済みの連番までが残る。保存待ちは「保存していない変更があります」）。

**Exception**（ユーザーへ見えるもの）:

| # | 事象 | 期待 |
|---|---|---|
| X-1 | AI 失敗（形式不正・refusal・max_tokens・429/5xx・timeout） | 下書きが無ければ「作成できませんでした（理由の種別）」と再試行・手で作る。下書きがあれば残し注記。自動再試行しない（`AI_REQUIREMENTS.md:74` と同じ） |
| X-2 | 上限超過（案件・利用者・全体） | 押せない理由と次に使える日。上限に数えない |
| X-3 | 生成中にもう一度押す・別タブで押す | 同じジョブを返す（二重課金しない） |
| X-4 | lease 切れ（worker が落ちた） | 失敗表示、次の押下で引き継ぐ |
| X-5 | 2 人が同時に編集 | 後から保存した方に「他の人が変更しました。最新を読み込みました」。黙って上書きしない |
| X-6 | お客様が見ている間に取り下げ・再依頼された | 承認は送られず「内容が変わりました。最新を読み込みました」（`LIVE_SCHEDULE_PLAN.md:34` L-18 の型） |
| X-7 | アーカイブ中 | 全員閲覧だけ。AI ボタンは出さず、callable も拒否 |
| X-8 | 権限なし（担当外・役割変更・無効化） | 画面は「権限がありません」。データは返さない |
| X-9 | ページ数・接続数の上限 | 「ページを追加」を押せず理由を出す。AI 出力が上限を超えたら切り詰めて注記 |
| X-10 | ページ名・パスが不正のまま | 項目にエラー。**保存しない**（C-04）。依頼ボタンは押せず件数を示す |
| X-11 | 通信断・オフライン | 「保存できませんでした」。入力は画面に残す |
| X-12 | 現行サイトが取れない（robots 拒否・SSRF 拒否・timeout） | 改善後だけ作り、現在はトップだけ＋「現行サイトを読み取れませんでした。手で追加できます」 |
| X-13 | スケジュールが再計画中（approved → draft） | 下書きの編集・依頼は続けられる（OQ-S2 の既定）。お客様の承認も可 |

## 5. AI（外部送信）の要件

| 項目 | 要件 |
|---|---|
| 提供元・モデル | 要件定義書の AI と同じ（Claude API・Sonnet 5.5・effort low が現行の既定 `functions/src/ai/generateDraft.ts:29`）。費用は 1 回 数十円まで受容（ユーザー 2026-11-28） |
| 起動の型 | `requestRequirementsDraft` と同じ: callable は認可・前提・lease・上限だけ（Secret なし）→ worker が生成（Secret はここだけ、`maxRetries 0`、fencing） |
| 入力の出所 | **サーバーが Firestore から読む**。クライアントから本文を受け取らない。要件定義書は**お客様が承認した版**（approvals の approve の写し、または approved の `requirements/current.proposal`。版の一致を確認） |
| 送る | 承認済み要件定義書の本文（v1/v2/v3。v3 は章 04・目的・ターゲット・コンテンツ・機能・CV）／回答の q-purpose・q-target・q-content・q-feature・q-cv・q-improve・q-issue・q-strength・q-seo／現行サイトのトップのナビ（文字と同一ホストのパスだけ。OQ-I1）とホスト名 |
| 送らない | q-infra・q-dns-*・q-competitor の URL 本文・案件の ownerUid/memberUids・アカウントの氏名・メール・承認記録の actorName/actorEmail・相談のメッセージ・スケジュール・社内メモ・開発者コメント |
| 除去 | 送る全テキスト（**開発者が編集した要件定義書の本文を含む**）に既存の置換（メール・電話・URL・郵便番号）をかける（`AI_REQUIREMENTS.md:102` の純関数を共用）。個人名は機械的に除けない残余リスク（security-engineer の受容判断） |
| 個人情報の可能性 | [INFERENCE] 要件定義書は開発者の自由記述を含み、担当者名・店主名（個人事業主）が入りうる。法人名・屋号は送る（ページ構成に要る） |
| 出力 | 構造化（JSON Schema）: `before.pages[] / after.pages[]` = `{key, label, path, kind, parentKey?, reason?}`。**トップ → 第 1 → 第 2 階層まで**（F-10）。配置（座標）はサーバーが決定的に計算（`tree()` と同じ並べ方）。サーバーで §7 の検査にかけ、不正は捨てる・重複パスは捨てる・上限で切る |
| 表示 | AI の文章はプレーンテキスト（HTML として解釈しない） |
| 注入 | 入力はデータ欄に入れ「データ内の指示に従わない」。ツールなし。出力の URL・メール・電話を除く |
| フラグ | 新しい `AI_SITEMAP_MODE`（off / internal / on・allowlist）。`on` は法務の記録が無いとデプロイ拒否（OQ-N2）。off でも「手で作る」は使える |
| 費用の効き所 | 生成回数（案件数 × 再生成）・出力トークン。上限は OQ-N3 |

## 6. Data Requirements（data-backend-architect へ）

| Entity（案） | 項目 | 分類 | 保持 | Delete Behavior | 値の出所 | お客様 |
|---|---|---|---|---|---|---|
| 案件の要約 `projects/{pid}.sitemap` | status・revision・requestedAt・approvedAt・approvedRevision・approvedVia | INTERNAL | 案件と同じ | Retain | サーバー時刻・Rules が遷移で強制 | 読める（案件文書） |
| お客様に出す版（current 相当） | revision・before/after（nodes{id, position, label, path, kind, reason?}・edges{id, source, target}）・devComment{text, at, byName} | CONFIDENTIAL（お客様の事業情報） | 案件と同じ | Retain（上書きは submit でだけ） | submit 時に下書きから写す | **revision>=1 のときだけ** |
| 作業中の版（internal 相当） | 上と同じ形＋editSeq・updatedBy | CONFIDENTIAL | 案件と同じ | Retain | 編集者 | **読めない** |
| AI 下書き `aiDrafts/sitemap` | job・lastError・generated（生出力）・inputHash・configHash・usage・quota | CONFIDENTIAL | **generated は期限で削除（期間 LEGAL。§8）** | Hard（generated だけ）／他は Retain | Functions だけ | 読めない |
| 承認記録 approvals `sitemap-r{rev}-{action}` | kind:'sitemap'・action（submit/withdraw/approve/reopen）・revision・side・actor*・note?・proxy?・**承認した版を再現できる情報**（写し or ハッシュ＋不変の版文書） | CONFIDENTIAL・証跡 | 永続 | Retain（追記のみ） | Rules が等式で照合 | 読める（自案件） |
| `aiUsage/{yyyymm}` | 回数・推定費用（要件定義書と共用か別か OQ-N3） | INTERNAL | 現行どおり | Retain | Functions | 読めない |

- 「同じ版への承認が二重にできない」「承認記録と案件の状態が食い違わない」「お客様が承認した中身を後から再現できる」は**要件**（実現手段は data-backend-architect）
- 既存案件の移行: 要約が無い案件は `none` とみなす（バックフィルなし）。`validProject` の hasOnly に `sitemap` を足す段 0 が要る（`firestore.rules:214-215`。スケジュールの段 0 と同じ順序の注意 `LIVE_SCHEDULE_PLAN.md:143-144`）
- 書き込み経路: 1 回の保存で最大 120 ノード＋接続を検査するため、**Rules の 1,000 式を超える見込み**（[INFERENCE] `AI_REQUIREMENTS.md:190` で edited が超えた前例）→ OQ-I2

## 7. Validation（サーバー側で必ず検査）

| 項目 | 規則 | 値の出所 |
|---|---|---|
| ページ名 | trim 後 1〜24 字（`validateLabel`）。制御文字・向きの制御を拒否 | 編集者 / AI |
| パス | `validatePath` と同じ（同じ図の中で重複不可） | 編集者 / AI |
| 改善理由・現状の課題 | 0〜140 字 | 編集者 / AI |
| 種類 | 5 種の列挙。`home` は各図にちょうど 1 件・削除不可 | 編集者 / AI |
| ノード ID | `^[ab]-[a-z0-9-]{1,40}$`（demo の採番 `SitemapPage.tsx:89` が満たす）・図の中で一意 | 画面 |
| 接続 | 両端が同じ図に存在・自己接続なし・重複なし | 画面 |
| 上限 | 1 図あたり ページ **60**・接続 **120** [ASSUMPTION]（AI 出力は 30 ページ [ASSUMPTION]） | — |
| 座標 | 有限の数・±100,000 以内 [ASSUMPTION] | 画面 |
| 開発担当者より | trim 後 0〜500 字（空は削除）。改行可・他の制御文字は拒否（`reChatControl` の型） | 編集者 |
| 取り下げ・代理・やり直しの理由 | `cleanProxyNote` → 1〜200 字（`src/live/proxyApproval.ts:12-24`） | 編集者 |
| 承認の対象 | **表示した revision・editSeq** で送る（読み直した値で組まない。L-18） | お客様の画面 |
| 生成の前提 | 要件定義書 approved・版一致は**サーバー記録**で判定（クライアント申告を使わない） | Firestore |

## 8. 実行主体・観測手段（項目 21）

| 約束 | 実行主体 | 観測 | 状態 |
|---|---|---|---|
| AI ジョブの完了検知 | Cloud Tasks の worker・画面は onSnapshot | `running` で lease 切れの件数・`lastError.code` 別件数（ログ） | 既存の型を流用 |
| 上限・費用 | callable の transaction・`aiUsage` | 月次の回数と推定費用・Anthropic 請求との月 1 突き合わせ（`AI_REQUIREMENTS.md:177`） | 既存の運用に sitemap を追加 |
| AI 生出力の期限削除 | **無い**（要件定義書の AI と同じく未実装 `docs/TODO.md:8`） | — | **要件未完**。`on` にする前に削除バッチか書面の受け入れ（OQ-N2） |
| 承認・依頼の記録 | 画面の TX＋Rules | 履歴の画面と CSV（kind で区別） | — |

## 9. 非機能

| 項目 | 要件 |
|---|---|
| 性能 | 60 ページで編集画面の操作が固まらない（体感・[TARGET] ドラッグ 60fps 相当は demo と同じ部品）。AI の所要は幅で扱い ETA を出さない |
| 書き込み量 | 自動保存は 1 秒以上まとめる（demo は 300ms `SitemapPage.tsx:60-67`。live は回数を抑える）。ドラッグ中は保存しない |
| 可用性 | AI が止まっても手で作る・編集・承認は使える |
| RPO | 承認記録は 0（TX）。下書きは最後の保存まで |
| セキュリティ | §2・§5。Secret は worker だけ。お客様の読める文書に社内値を置かない |
| アクセシビリティ | WCAG 2.2 AA（demo の部品のまま。キャンバス以外に一覧・理由の欄がありキーボードで選べる＝`SitemapPage.tsx:228-233`） |
| 端末 | PC 優先・スマホは閲覧と承認（demo の高さ調整 `SitemapPage.tsx:138-146`） |
| 地域・時刻 | 日本先行・日本語。上限の日付は JST。日時表示は既存の `formatDateTime` |

## 10. Edge Case Matrix

| Condition | Expected | Priority | Test |
|---|---|---|---|
| 要件定義書 analyzed で作成を試す | 拒否 | HIGH | Rules/Functions |
| スケジュール未承認で依頼 | 拒否・画面は依頼ボタンを出さない（F-4） | HIGH | Rules |
| 依頼中に編集 | 拒否（C-03） | HIGH | Rules |
| 依頼中に取り下げ → 再依頼 | 版 +1・記録 3 件 | HIGH | Rules |
| お客様が古い版を承認 | 拒否・文言 | HIGH | Unit/Rules |
| お客様が proxy 付きで承認 | 拒否 | CRITICAL | Rules |
| お客様が下書き・AI 生出力を get | 拒否 | CRITICAL | Rules |
| 担当外の開発者が読む・書く・生成 | 拒否 | CRITICAL | Rules/Functions |
| ページ 61 件目・接続 121 件目 | 拒否 | MEDIUM | Rules/Unit |
| トップを削除・トップ 2 件 | 拒否 | HIGH | Unit/Rules |
| ページ名が空・25 字・制御文字 | 拒否 | MEDIUM | Unit/Rules |
| 同じパス 2 件 | 拒否 | MEDIUM | Unit |
| 2 タブ同時保存 | 後の方が競合 | HIGH | Rules |
| AI 出力にトップ無し・4 段目・不正パス | 捨てる/切る・注記 | MEDIUM | Functions |
| AI 出力に URL・メール・電話 | 除去 | HIGH | Functions |
| 送信 payload に q-infra・氏名・メール | 含まれない（スナップショット） | CRITICAL | Functions |
| 同じ requestId 2 回・同時 2 本 | AI 呼び出し 1 回 | HIGH | Functions |
| フラグ off/internal で allowlist 外 | 生成拒否・手で作るは可 | HIGH | Functions |
| アーカイブと保存を同じバッチ | 拒否 | MEDIUM | Rules |
| 現行サイトが robots 拒否 | 現在はトップだけ・改善後は作る | MEDIUM | Functions |
| 承認 0 件・500 件の履歴 | 状態表示は同じ（案件文書が正） | LOW | Unit |
| 既存案件（sitemap キー無し）の基本情報の保存 | 通る（段 0） | CRITICAL | Rules |

## 11. 矛盾・抜け（C-xx）

| # | 指摘 | 状態 | 解決先 |
|---|---|---|---|
| C-01 | demo の `blockedReason`「スケジュールを入れると依頼できます」（`SitemapPage.tsx:318`）は、ボタン自体がスケジュール承認後にしか出ないため表示されない（F-4）。正は「スケジュール承認後」 | 解消（本書 §3） | — |
| C-02 | demo はコメントを**開発者だけ**が書ける（F-6）。ユーザー規則は「admin も全案件で書き込み主体」（2026-11-26・11-27 以降の新機能も既定） | 規則を優先 | OQ-S1 |
| C-03 | demo は依頼中も編集できる（F-3）。live では「お客様が見ていない中身への承認」が起きる（スケジュール H-1 と同型） | 要決定 | OQ-N4 |
| C-04 | demo の入力欄は 30 字まで打てるが検査は 24 字（`SitemapPage.tsx:189` vs `metrics.ts:57`）。不正なページ名もそのまま保存される（`patchSelected` は検査しない） | live は保存しない | AC-14 |
| C-05 | demo は手で作った理由にも常に「AI提案」（F-11）。手で作った案件では虚偽表示になる（要件定義書のスコア問題 `AI_REQUIREMENTS.md:24` と同型） | 要決定 | OQ-S3 |
| C-06 | 要件定義書 v3 の章 04（AI の案）とサイトマップが別の値になる。承認後はどちらがページ構成の正か | サイトマップ承認後はサイトマップが正。要件定義書は変えない | OQ-S7 |
| C-07 | スケジュールの WBS に `sitemap` 行（`firestore.rules:599`）。サイトマップの承認で完了印を自動で付けるか | 付けない（手動のまま。NON-BLOCKING） | — |
| C-08 | スケジュールの再計画（approved → draft）中にサイトマップを依頼・承認してよいか | 既定: 1 回以上承認済みなら可 | OQ-S2 |
| C-09 | demo の承認後の「デザインへ進む」の行き先が live に無い | 要決定 | OQ-S6 |
| C-10 | demo に取り下げ・やり直しが無い（F-5）。live は要件定義書・スケジュールにある | 取り下げは入れる（demo の部品の中）。やり直しは要決定 | OQ-N1 |
| C-11 | 要件定義書の approved から戻る遷移は live に無い（`firestore.rules:224-239`）。将来入れるならサイトマップの扱いが必要 | 現時点は起きない | 将来の変更時に impact-analyzer |

## 12. 法規制・会計の候補（結論は出さない。LEGAL REVIEW REQUIRED）

| トリガー | 候補 | 論点 | 起票 |
|---|---|---|---|
| 要件定義書（自由記述を含む）を国外の AI へ送る | 個人情報保護法（外国にある第三者への提供／委託） | 要件定義書の AI の同意・説明の範囲に「サイトマップの作成」も含まれるか | 既存の `AI_REQUIREMENTS_LEGAL_CLEARANCE` の論点に追記（PM が持ち込む） |
| 現行サイトの取得 | 取得先の利用規約・robots | 既存の守りで足りるか | 同上 |
| お客様・代理の承認 | 契約上の合意の効力 | ページ構成の承認が仕様の確定に当たるか（スケジュール R-8 と同型） | `docs/TODO.md` の LEGAL に追加 |
| AI 生出力の保持 | 保存期間 | 承認から 90 日案（`AI_REQUIREMENTS.md:194`）を同じに適用するか | 同上 |

## 13. 受入基準（AC。RA 版が正）

**権限・可視性**
- AC-01 admin（担当外の案件を含む）と担当の開発者は、要件定義書の承認後に作成・編集・コメント・依頼・取り下げができる。担当外の開発者・お客様・未ログイン・無効アカウントは Rules／callable で拒否される（テスト件数を記録）
- AC-02 お客様は自案件の「依頼中または承認済みの版」だけを読める。下書き（作業中の版）・AI の生出力・ジョブ状態・使用量は get で拒否される
- AC-03 お客様が読める文書（お客様に出す版・案件の要約・承認記録）に、作業中の版・AI の生出力・lastError・usage・quota を置けない（hasOnly の拒否テスト）
- AC-04 お客様ポータルの確認・承認にサイトマップの区画が出る（図＝現在／リニューアル後の切替・ページ一覧・新ページの理由最大 3 件・開発担当者より。demo `PortalApprovalsPage.tsx:198-243` と同じ）

**状態・承認**
- AC-05 要件定義書が approved でない案件では、作成（AI・手）がサーバーで拒否される
- AC-06 依頼はスケジュールが 1 回以上承認済みのときだけ通る（OQ-S2 の既定）。それ以外は Rules で拒否、画面に依頼ボタンが出ない
- AC-07 依頼で版が +1 され、承認記録（submit）から依頼した版の中身を再現できる
- AC-08 依頼中は編集が拒否される（OQ-N4 の既定）。取り下げは理由 1〜200 字が必須で、理由は履歴（画面・CSV）とお客様に出る
- AC-09 お客様の承認は表示した revision・editSeq が今と同じときだけ送られ、違えば「内容が変わりました。最新を読み込みました」で送らない
- AC-10 admin の代理承認は理由必須で `side:'afro'`・`proxy:true`・`actorRole:'admin'`、要約に `approvedVia:'proxy'`。お客様はこれらを書けない
- AC-11 承認後は全員閲覧だけ（demo の「お客様が承認済みのため編集できません」）。サーバーでも拒否
- AC-12 同じ版への承認・二重送信で記録が 2 件にならない（決定的 ID）
- AC-13 アーカイブ中は全書き込み（事前・事後とも）と生成が拒否され、読み取りはできる

**編集・検査**
- AC-14 ページ名（1〜24 字）・パス（`validatePath`）・理由（140 字）・コメント（500 字）・ID・接続・上限（60／120）をサーバーで検査し、不正は保存されない。画面は項目にエラーを出し、不正が残る間は依頼できない（件数表示）
- AC-15 トップは各図にちょうど 1 件で削除できない
- AC-16 同じ連番から 2 回保存すると 2 回目が拒否され、画面は競合の文言を出す（2 タブで確認）
- AC-17 保存は 1 秒以上まとめて書かれ、ドラッグ中は書かない（書き込み回数をテストで確認）

**AI**
- AC-18 生成は callable 経由だけ。入力はサーバーが Firestore の承認済み要件定義書から読み、クライアントの本文を使わない（偽の本文を送るテスト）
- AC-19 送信 payload に §5「送らない」の項目が含まれず、メール・電話・URL・郵便番号が置換されている（スナップショットテスト）
- AC-20 出力はトップ → 第 2 階層まで・検査済み・上限内に正規化され、URL・メール・電話が除かれる。不正な出力は捨てて `lastError`
- AC-21 同じ requestId・同時 2 本で AI の呼び出しは 1 回。lease 切れは次の押下で引き継ぐ。古いジョブの結果は捨てる
- AC-22 上限超過は `resource-exhausted` で AI を呼ばず、画面は理由と次に使える日を出す。上限の値は OQ-N3 の決定どおり
- AC-23 再生成で編集を捨てるときは確認が必須。生成が失敗しても既存の下書きは消えない
- AC-24 `AI_SITEMAP_MODE` が off／internal（allowlist 外）では生成が拒否され、「手で作る」は使える。`on` は法務の記録が無いとデプロイが止まる
- AC-25 AI の失敗（形式・refusal・max_tokens・429/5xx・timeout）でも画面が止まらず、再試行と手で作るが出る
- AC-26 現行サイトが取得できないとき、改善後は作られ、現在はトップだけで注記が出る

**画面・回帰**
- AC-27 live の画面は demo と同じ DOM・文言・見た目（スクリーンショット差分 0。差分は役割の出し分けと demo の部品の中に置いた live だけの要素）。demo の build は Firebase に依存しないまま
- AC-28 制作フローのナビが 要件 → 日程 → サイトマップ、案件詳細の「次に必要な作業」がスケジュール承認後にサイトマップへ、ダッシュボードの段階・進捗が更新される
- AC-29 既存の要件定義書・スケジュールの Rules テスト・承認の履歴（kind 無しは要件定義）が変わらず緑。`sitemap` キーを持つ案件で基本情報・アーカイブ・アサインが通る
- AC-30 「AI提案」の印は OQ-S3 の決定どおりに出る（既定: AI で作った下書きだけ）

## 14. Open Questions

### NEED CONFIRMATION（ユーザー。誤ると証跡・費用・法務に響く）

| # | 内容 | 推奨の既定 |
|---|---|---|
| OQ-N1 | 承認後のやり直し（reopen）を入れるか（demo に無い） | **入れる**: 理由必須・お客様に見える・前回承認版は記録に残る（スケジュールと同じ）。ボタンは承認済み表示の横（demo の部品の中） |
| OQ-N2 | AI のフラグと法務: 新しい `AI_SITEMAP_MODE` を設け、`on` は既存の `AI_REQUIREMENTS_LEGAL_CLEARANCE.md` に「サイトマップ作成にも使う」を追記したものが無いとデプロイ拒否、でよいか | **はい**。当面は internal（試験案件だけ）。お客様案件は法務の結論まで手で作る |
| OQ-N3 | 上限と費用: 要件定義書の AI と**同じ回数上限を別枠**で持つか、全体 200 回/月を**共用**するか | **案件 5/日・20/月・利用者 10/日は別枠、全体 200 回/月と Anthropic 月 20 USD は共用**（総額の上限を増やさない） |
| OQ-N4 | 依頼中の編集（demo では可） | **不可**。直すときは取り下げ（理由必須）→ 再依頼。取り下げボタンは「お客様の承認待ち」表示の横 |

### SAFE ASSUMPTION（既定で進める。戻せる）

| # | 内容 | 既定 |
|---|---|---|
| OQ-S1 | 開発担当者よりコメントを admin も書ける（C-02） | 書ける（admin 全権の規則）。表示名は書いた人 |
| OQ-S2 | 依頼・承認の前提のスケジュール（C-08） | 「1 回以上承認済み」（`approvedRevision` あり）。再計画中も可 |
| OQ-S3 | 「AI提案」の印（C-05） | AI で作った下書きのときだけ出す。手で作ったら出さない |
| OQ-S4 | AI を使わない作成 | 改善後にトップ 1 件（`/`）、現在は空 |
| OQ-S5 | 生成中の操作 | 生成中は保存・依頼を拒否（要件定義書と同じ `docs/CHANGELOG.md:920`） |
| OQ-S6 | 承認後の「デザインへ進む」（C-09） | live にデザインが入るまで出さず「承認済み 日時」だけ |
| OQ-S7 | 正のページ構成（C-06） | サイトマップ承認後はサイトマップが正。要件定義書の章 04 は変えず、サイトマップ画面に「要件定義書の案から作成」と記す |
| OQ-S8 | 上限 60 ページ・120 接続・AI 出力 30 ページ | このまま（実案件で超えたら見直す） |
| OQ-S9 | モデル | 要件定義書と同じ既定（Sonnet 5.5・effort low）。評価で安いモデルが合格すれば切り替え |

### INVESTIGATION REQUIRED（実装前に調べて閉じる）

| # | 内容 | 調べ方・既定 |
|---|---|---|
| OQ-I1 | 現在の図の出所: 抽出はナビの**文字**だけでパスを持たない（`functions/src/ai/site/extract.ts:105-109`） | 同一ホストの `href` のパスも抽出に足す（守りは既存の取得経路）。足せなければ現在はトップだけ＋手で追加 |
| OQ-I2 | 書き込みを Rules で検査できるか（最大 120 ノード＋接続） | G1 と同じ計測（`LIVE_SCHEDULE_PLAN.md:98-110`）。超えれば callable（`saveAiDraftEdits` の型 F-a）で書き、Rules はクライアントの書き込みを拒否 |
| OQ-I3 | 承認した版の再現: 承認記録に全体を写すか、ハッシュ＋不変の版文書か | data-backend-architect。文書サイズ（120 ノードで [INFERENCE] 数十 KB）と式の量で決める |
| OQ-I4 | 承認の履歴・CSV・`clientStatus` の lastLog を kind 'sitemap' でどう出すか | `approvalLogFrom`（`src/live/model.ts:273-283`）と L-19 の型。lastLog は要件定義だけのまま |

## 15. 画面要件（ui-ux-designer へ。見た目は demo のまま）

| 画面 | 入力 | 表示 | 判断 | 状態 | 確認ゲート |
|---|---|---|---|---|---|
| `/site`・`/dev/sitemap`（demo `SitemapPage`） | ページ・接続・名前・理由・コメント | 現在／改善後・指標・理由一覧（AI 印）・コメント | 直す・依頼する | none（demo `NotCreated`＋「AI で下書きを作る」「手で作る」）／生成中／失敗／下書き／依頼中（取り下げ）／承認済み（やり直し）／アーカイブ／権限なし／競合 | 再生成で編集を捨てる・取り下げ・やり直し・代理承認（理由入力） |
| ポータル 確認・承認（demo `PortalApprovalsPage` のサイトマップ区画） | — | 図・一覧・理由・コメント・版 | 承認する | 準備中／依頼中／調整中（前回承認版）／承認済み（代理の表記） | 承認の確認ダイアログ（demo の CONFIRM） |
| 案件詳細・ダッシュボード | — | 次に必要な作業・段階・進捗 | — | — | — |

## 16. 引き渡し

- **data-backend-architect**: §6・§7・OQ-I2/I3（段 0 の `validProject`・式の計測・版の再現）
- **security-engineer**: §2・§5（送るもの／送らないもの・除去・注入・値の出所）・脅威モデル（スケジュールと AI 要件定義書の差分だけ）
- **lead-architect**: 規模 XL の判定・Unit 分割（スケジュールの U1〜U4＋AI の worker）・リリースの段（段 0 → 段 1、フラグ internal → on）
- **qa-engineer**: §10・§13（偽の本文・偽の版・2 タブ・上限・アーカイブのテストを含む）
- **product-manager**: NEED CONFIRMATION 4 件をまとめてユーザーへ・§12 の法務の持ち込み

## 17. 変更しない部分

- 要件定義書・スケジュールの Rules と挙動（`reqApprCreateOk`・`schedApprOk` の本体、既存の変異テストのアンカー）。kind の振り分けに `'sitemap'` を**後ろに足すだけ**
- `aiDrafts/requirements` と `requestRequirementsDraft`・`saveAiDraftEdits` の契約、`AI_REQUIREMENTS_MODE` の意味、`limits.ts` の既存の値
- demo の画面・DemoStore・reducer・`src/data/sitemap.ts` の見本（共用するが変えない）
- `main` への merge は release GO まで（`LIVE_SCHEDULE_PLAN.md:38` L-22。demo の公開に未承認の差分を出さない）

## 18. Requirement Review 依頼

| Reviewer | 観点 | 判定 | 理由 |
|---|---|---|---|
| product-manager | 意図と一致しているか（NEED CONFIRMATION 4 件の既定案を含む） | **未判定（実装前に必須）** | |
| lead-architect | 実現可能か・コスト（AI の別枠上限・Rules の式の量） | **未判定（実装前に必須）** | |

## ユーザー決定（2026-11-28）

| # | 決定 |
|---|---|
| OQ-N1 | 承認後の再計画を付ける（理由必須・お客様に見える・前の承認版は記録に残す。スケジュールと同じ） |
| OQ-N2 | AI の下書きは**全案件で使う**。ただし `AI_REQUIREMENTS_LEGAL_CLEARANCE.md` をサイトマップまで広げる法務の確認が済むまで、`AI_SITEMAP_MODE=on` は出さない（デプロイのゲートで止める。それまでは internal＋許可リスト）。LEGAL REVIEW REQUIRED |
| OQ-N3 | 上限は提案どおり（1 案件 5 回/日・20 回/月、1 人 10 回/日。全体 200 回/月・Anthropic 20 USD/月は要件定義書の AI と共有） |
| OQ-N4 | 依頼中は編集不可。理由を書いて取り下げてから直し、依頼し直す |
| SAFE | S1〜S9 は提案どおり（lead-architect 2026-11-28） |

## lead-architect の判断（2026-11-28。設計 3 本を受けて）

| # | 判断 |
|---|---|
| L-1 | データ設計 D-1〜D-5 を採る（中身の書き込みは callable＋Admin SDK、状態だけの遷移は Rules、承認版は不変の `sitemapVersions/r{N}`＋contentHash、お客様が読めるのは版の文書だけ、callable の TX で editSeq） |
| L-2 | AI 設計 P-4 を採る（現行の構成はナビから規則で組み、AI は改善点と改善後だけ）。validateLabel / validatePath / tree の src/shared/ai への移動は「移すだけ・demo は再 export で挙動不変」を条件に可（demo の画面差分 0 をスクリーンショットで確認） |
| L-3 | AI 生出力の削除ジョブ（R1）はサイトマップ分だけ今回作る（要件定義書の分は既存 TODO:8 のまま）。保存日数は法務待ち → `AI_SITEMAP_MODE=on` の前提条件（段 2）。今回は internal＋許可リストまで |
| L-4 | 脅威モデルの条件 S-1〜S-20 を受け入れ条件に追加し、テスト SM-01〜30 を必須にする。特に S-3/S-9（callable の TX で状態・依頼中・アーカイブ・要件承認を検査）、S-6（承認＝版のハッシュ一致）、S-12（callable は ID だけ受け、本文はサーバーで読む）、S-14（1 人あたりの鍵を `sitemap:` で分ける）、S-18（on は `AI-SCOPE: sitemap` 行が必要） |
| L-5 | AI 評価（架空 20 件×3 回・上限 10 USD）は実装の後、mode を internal で出す前に行う。採点の盲検は 1 人（lead）でよい（ユーザーの採点者が未定のため。結果は報告する） |
| L-6 | 出す順: 段 0（Rules→Hosting）→ 段 1（Rules→Functions→Hosting）→ 段 2（削除ジョブ。on の前）。段 0 の版が新しい Rules の床（今の床 beb93e7b より前へは戻さない） |
