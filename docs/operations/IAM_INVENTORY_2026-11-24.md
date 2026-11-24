# IAM 棚卸し（G-0・読むだけ）— 2026-11-24

- 実施: 2026-11-24（JST）、platform-engineer（RUNBOOK_FIREBASE.md §9.10 G-0。ユーザーは読み取りだけを承認）
- 対象: `afro-cms-4a6ff` のみ。すべてのコマンドに `--project afro-cms-4a6ff` を付けた（この PC の gcloud 既定は別の本番プロジェクトなので、既定には頼っていない）
- 実行したのは get / list / describe だけ。add / remove / create / enable / deploy は実行していない。`secrets versions access` も実行していない
- 記録したのは role と主体だけで、鍵や値は残していない。人のメールアドレスは `user:<人>` に置き換えた

## 1. 実行したコマンド（13 本）

| # | コマンド | 結果 |
|---|---|---|
| 1 | `gcloud projects get-iam-policy afro-cms-4a6ff --project afro-cms-4a6ff --flatten="bindings[].members" --format="table(bindings.role,bindings.members,bindings.condition.title)"` | rc=0 |
| 2 | `gcloud secrets list --project afro-cms-4a6ff --format="table(name,createTime)"` | rc=0 |
| 3 | `gcloud secrets get-iam-policy ANTHROPIC_API_KEY --project afro-cms-4a6ff --format=yaml` | rc=0 |
| 4 | `gcloud secrets versions list ANTHROPIC_API_KEY --project afro-cms-4a6ff --format="table(name,state,createTime)"` | rc=0（版番号と状態だけ） |
| 5 | `gcloud services list --enabled --project afro-cms-4a6ff --format="value(config.name)"` | rc=0 |
| 6 | `gcloud iam service-accounts list --project afro-cms-4a6ff` | rc=0 |
| 7 | `gcloud iam service-accounts get-iam-policy afro-cms-functions@afro-cms-4a6ff.iam.gserviceaccount.com --project afro-cms-4a6ff --format=yaml` | rc=0 |
| 8 | `gcloud tasks queues list --location asia-northeast1 --project afro-cms-4a6ff` | **rc=1（API が無効）**。gcloud が「有効にしますか (y/N)」と聞いたが、標準入力が無いため **N で終わった（有効化はしていない）** |
| 9 | `gcloud functions list --project afro-cms-4a6ff`（名前・状態・世代・実行 SA） | rc=0 |
| 10 | `gcloud functions list --project afro-cms-4a6ff`（トリガー種別・Secret の env の数） | rc=0 |
| 11 | `gcloud run services list --region asia-northeast1 --project afro-cms-4a6ff` | rc=0 |
| 12 | `gcloud run services get-iam-policy oninviterevoked --region asia-northeast1 --project afro-cms-4a6ff` | rc=0 |
| 13 | `gcloud run services get-iam-policy provisioninvitee --region asia-northeast1 --project afro-cms-4a6ff` | rc=0 |

## 2. 結果

### 2.1 サービスアカウント（4 個）[FACT #6]

| SA | 無効化 |
|---|---|
| `afro-cms-functions@afro-cms-4a6ff.iam.gserviceaccount.com` | いいえ |
| `firebase-adminsdk-fbsvc@afro-cms-4a6ff.iam.gserviceaccount.com` | いいえ |
| `afro-cms-4a6ff@appspot.gserviceaccount.com`（App Engine 既定） | いいえ |
| `640072999586-compute@developer.gserviceaccount.com`（Compute 既定） | いいえ |

- **`afro-cms-ai-worker@` はまだ無い**（G-1 で作る）
- `afro-cms-functions@` 自体の IAM ポリシーは空（`etag` だけ）[FACT #7]。この SA を使える主体は、プロジェクトの Owner（`user:<人>`）だけ

### 2.2 プロジェクト単位の role [FACT #1]

| role | 主体 |
|---|---|
| `roles/owner` | `user:<人>`（1 名） |
| `roles/editor` | `640072999586-compute@developer.gserviceaccount.com`／`640072999586@cloudservices.gserviceaccount.com`／`afro-cms-4a6ff@appspot.gserviceaccount.com` |
| `roles/datastore.user` | `afro-cms-functions@` |
| `roles/firebaseauth.admin` | `afro-cms-functions@`／`firebase-adminsdk-fbsvc@` |
| `roles/eventarc.eventReceiver` | `afro-cms-functions@`／`640072999586-compute@developer` |
| `roles/run.invoker`（プロジェクト全体） | `640072999586-compute@developer` |
| `roles/iam.serviceAccountTokenCreator` | `firebase-adminsdk-fbsvc@`／`service-640072999586@gcp-sa-pubsub` |
| `roles/firebase.sdkAdminServiceAgent` | `firebase-adminsdk-fbsvc@` |
| `roles/cloudbuild.builds.builder` | `640072999586@cloudbuild` |
| サービスエージェント系（`artifactregistry.serviceAgent`・`cloudbuild.serviceAgent`・`cloudfunctions.standardServiceAgent`・`containerregistry.ServiceAgent`・`eventarc.serviceAgent`・`firebase.managementServiceAgent`・`firebasemods.serviceAgent`・`firebaserules.system`・`firestore.serviceAgent`・`pubsub.serviceAgent`・`run.serviceAgent`） | 各 `service-640072999586@…` の Google 管理 SA |

- 条件付き binding は無い（TITLE 列が全部空）
- 実行 SA の `afro-cms-functions@` に Editor・Owner は無い

### 2.3 プロジェクト単位の `roles/secretmanager.secretAccessor`（G-5 の判断材料）

- **[FACT #1] 持っている主体は 0 件**（`roles/secretmanager.*` の binding がプロジェクトに 1 つも無い）
- [UNKNOWN] `roles/editor` を持つ 3 つの既定 SA が Secret の中身を読めるか。基本ロールの Editor に `secretmanager.versions.access` が含まれるかは、今回確認していない（`gcloud iam roles describe roles/editor` はプロジェクトに属さないコマンドで、`--project` 必須という今回の条件の外なので実行していない）。次の読み取りで確かめる

### 2.4 `ANTHROPIC_API_KEY` [FACT #2〜#4]

- このプロジェクトの Secret はこれ 1 本だけ（作成 2026-11-20）
- Secret 単位の IAM ポリシーは**空**（`etag` だけ。binding 無し）。今この Secret を読める主体は、プロジェクトの Owner だけ（＋2.3 の UNKNOWN）
- 版: v3 が enabled、v1・v2 は destroyed（RUNBOOK §9.1「有効なのは v3 だけ」と一致）

### 2.5 有効な API（関係するもの）[FACT #5・#8]

| API | 状態 |
|---|---|
| `secretmanager.googleapis.com` | 有効 |
| `run.googleapis.com` | 有効 |
| `cloudfunctions.googleapis.com` | 有効 |
| `cloudbuild`・`artifactregistry`・`eventarc`・`pubsub`・`firestore` | 有効 |
| **`cloudtasks.googleapis.com`** | **無効** |
| `cloudscheduler.googleapis.com` | 無効（一覧に無い） |

### 2.6 キュー

- **[FACT #8] Cloud Tasks API が無効なので、キューは 0 件**（一覧を取れない状態＝キューは存在しない）

### 2.7 関数（2 本・すべて GEN_2・asia-northeast1）[FACT #9〜#13]

| 関数 | トリガー | 実行 SA | Secret の env | Cloud Run の `run.invoker` |
|---|---|---|---|---|
| `onInviteRevoked` | Firestore document updated（Eventarc） | `afro-cms-functions@` | 0 | `afro-cms-functions@` のみ |
| `provisionInvitee` | callable（HTTP） | `afro-cms-functions@` | 0 | `allUsers`（callable のため想定どおり。認証はアプリ側で検証） |

- AI の 3 関数（`requestRequirementsDraft`・`saveAiDraftEdits`・`generateRequirementsDraftTask`）はまだデプロイされていない

## 3. G-1〜G-7 への影響

| # | 今の状態で変わるもの | 注意 |
|---|---|---|
| G-1 | `afro-cms-ai-worker@` が新しく 1 個できる（今は無い） | そのまま実行できる |
| G-2 | Secret のポリシーが空 → 0 件から 1 件（`afro-cms-ai-worker@` の `secretAccessor`）になる。プロジェクトに `datastore.user` の主体が 1 つ増える | G-1 の後でないと失敗する |
| G-3 | `afro-cms-functions@` にプロジェクト単位の `cloudtasks.enqueuer` が付き、自分自身への `serviceAccountUser` が付く（SA のポリシーは今は空） | `cloudtasks.enqueuer` は API が無効でも付けられる [INFERENCE: IAM の binding は API の有効化と独立]。動くのは G-4 の後 |
| G-4 | **必要**（Cloud Tasks API が無効と確認できた）。`cloudtasks.googleapis.com` が有効になる | 費用は使った分だけ。G-7 の前に済ませる |
| G-5 | **外すものは無い**（プロジェクト単位の `secretAccessor` は 0 件） | 何も実行せず「該当なし」で閉じてよい。2.3 の UNKNOWN（Editor が Secret を読めるか）は G-5 の対象外（別の論点。下の「気づいたこと」） |
| G-6 | 予算が 1 個増える | 今回は請求先・予算を読んでいない（`billing` は対象外）。既存の予算の有無は未確認 |
| G-7 | 関数が 2 本 → 5 本、キューが 0 → 1 個、worker の Cloud Run に invoker の binding | G-4 が前提。デプロイ後に次の 2 点を確かめる: (a) worker の Cloud Run に `allUsers` が付いていない (b) [INFERENCE] Firebase CLI は Secret を使う関数をデプロイするとき、その関数の実行 SA に `secretAccessor` を自動で付けることがある → `gcloud secrets get-iam-policy ANTHROPIC_API_KEY` に `afro-cms-ai-worker@` 以外（特に `afro-cms-functions@`・compute 既定 SA）が増えていないかを見る |

### G-5 で外す候補

- **無し**。理由: プロジェクト単位で `roles/secretmanager.secretAccessor` を持つ主体が 0 件で、Secret 単位の binding も 0 件 [FACT #1・#3]

## 4. 気づいたこと（今回は何も変えていない）

1. **既定 SA 3 つに `roles/editor`**（compute・appspot・cloudservices）。どの関数も実行 SA には使っていない（関数 2 本とも `afro-cms-functions@`）。ただし Cloud Functions（第 2 世代）のビルドが compute 既定 SA を使っている可能性があり [INFERENCE]、外すとデプロイが壊れうる。`cloudservices` は Google の API 用 SA で触らない。扱いは security-engineer の判定事項として渡す
2. compute 既定 SA が**プロジェクト全体**の `roles/run.invoker` を持つ（全 Cloud Run を呼べる）。Eventarc トリガーの名残と推定 [INFERENCE]。今後の worker もこの SA から呼べる状態になる
3. `provisionInvitee` の `allUsers` invoker は callable として想定どおり
4. `cloudtasks` の一覧コマンドは、API が無効だと**有効化するかを聞いてくる**。対話できる端末で y を押すと有効化されてしまうので、G-4 より前に Tasks のコマンドを打つときは注意する。今回は標準入力が無く N で終わった

## 実行記録 2026-11-24（G-1・G-2・G-3・G-4・G-6）

- 実施: 2026-11-24（JST）、platform-engineer。ユーザーがチャットで G-1・G-2・G-3・G-4・G-6 を承認（G-5 は該当なし、G-7 デプロイは未承認で未実施）
- すべてのコマンドに `--project afro-cms-4a6ff` を付け、標準入力を閉じて 1 本ずつ実行し、結果を見てから次へ進んだ。既定 SA の Editor は触っていない。Secret の値は読んでいない（`versions access` 未実行）
- プロジェクトの IAM 変更コマンドは、人のメールを含むポリシー全体が出力されないよう `--format=none` を付けた

### 1. 変更（実行順）

| # | コマンド | 結果 | 戻し方 |
|---|---|---|---|
| G-1 | `gcloud iam service-accounts create afro-cms-ai-worker --display-name "AFRO CMS AI worker" --project afro-cms-4a6ff --quiet` | rc=0 `Created service account [afro-cms-ai-worker]` | `gcloud iam service-accounts delete afro-cms-ai-worker@afro-cms-4a6ff.iam.gserviceaccount.com --project afro-cms-4a6ff` |
| G-2a | `gcloud secrets add-iam-policy-binding ANTHROPIC_API_KEY --member serviceAccount:afro-cms-ai-worker@afro-cms-4a6ff.iam.gserviceaccount.com --role roles/secretmanager.secretAccessor --project afro-cms-4a6ff` | rc=0。Secret のポリシーは worker SA の `secretAccessor` 1 件だけ | 同じ引数で `gcloud secrets remove-iam-policy-binding …` |
| G-2b | `gcloud projects add-iam-policy-binding afro-cms-4a6ff --member serviceAccount:afro-cms-ai-worker@afro-cms-4a6ff.iam.gserviceaccount.com --role roles/datastore.user --condition=None --project afro-cms-4a6ff --format=none` | rc=0 | 同じ引数で `gcloud projects remove-iam-policy-binding …` |
| G-3a | `gcloud projects add-iam-policy-binding afro-cms-4a6ff --member serviceAccount:afro-cms-functions@afro-cms-4a6ff.iam.gserviceaccount.com --role roles/cloudtasks.enqueuer --condition=None --project afro-cms-4a6ff --format=none` | rc=0 | 同じ引数で `gcloud projects remove-iam-policy-binding …` |
| G-3b | `gcloud iam service-accounts add-iam-policy-binding afro-cms-functions@afro-cms-4a6ff.iam.gserviceaccount.com --member serviceAccount:afro-cms-functions@afro-cms-4a6ff.iam.gserviceaccount.com --role roles/iam.serviceAccountUser --project afro-cms-4a6ff` | rc=0。SA のポリシーは自分自身の `serviceAccountUser` 1 件だけ | 同じ引数で `gcloud iam service-accounts remove-iam-policy-binding …` |
| G-4 | `gcloud services enable cloudtasks.googleapis.com --project afro-cms-4a6ff` | rc=0 `finished successfully`。有効化に伴い Google 管理の `service-640072999586@gcp-sa-cloudtasks` に `roles/cloudtasks.serviceAgent` が自動で付いた | `gcloud services disable cloudtasks.googleapis.com --project afro-cms-4a6ff`（キューが無いときだけ） |
| G-6 | **作成しなかった**（下の 2.） | — | — |

### 2. G-6 予算アラート — 既存の予算が条件と一致したため新規作成しない

- `gcloud billing projects describe afro-cms-4a6ff` → 請求先は有効（請求先 ID は `billingAccounts/016A03-…`。全体は gcloud で引ける）
- `gcloud billing budgets list --billing-account <請求先 ID> --project afro-cms-4a6ff --billing-project afro-cms-4a6ff`（クォータを既定の別プロジェクトに付けないため `--billing-project` を明示）→ 既に **`afro-cms-4a6ff 月1000円`**（予算 ID `81481eb8-c9ca-4125-aad3-4188f13887c5`）がある
- `describe` の結果: JPY 1000／月次／対象 `projects/640072999586`（＝afro-cms-4a6ff のプロジェクト番号）のみ／しきい値 0.5・0.9・1.0（CURRENT_SPEND）／`notificationsRule: {}`（既定の請求 IAM 宛の通知だけ。請求は止めない）
- [DECISION] platform-engineer: RUNBOOK §9.10 G-6 の条件（¥1,000・このプロジェクトだけ・50/90/100%・通知だけ）をすべて満たすため、作ると同じ通知が 2 通届くだけになる。新規作成はしない。§9.9 の予算の項目はこの既存予算で満たす
- 戻し方: 変更していないので無し（既存予算を消す場合は `gcloud billing budgets delete 81481eb8-c9ca-4125-aad3-4188f13887c5 --billing-account <請求先 ID>`。消さない）
- 同じ請求先に他プロジェクトの予算も 6 件ある（読んだだけ。触っていない）

### 3. 変更後の確認（読むだけ。§9.9 のうち今回の作業に関係するもの）

| 確認 | コマンド | 結果 |
|---|---|---|
| worker SA がある | `gcloud iam service-accounts describe afro-cms-ai-worker@… --project afro-cms-4a6ff` | [FACT] あり、表示名 `AFRO CMS AI worker`、無効化されていない |
| worker SA を使える主体 | `gcloud iam service-accounts get-iam-policy afro-cms-ai-worker@… --project afro-cms-4a6ff` | [FACT] ポリシーは空（使えるのはプロジェクト Owner `user:<人>` だけ） |
| Secret の IAM | `gcloud secrets get-iam-policy ANTHROPIC_API_KEY --project afro-cms-4a6ff` | [FACT] `secretAccessor` は `afro-cms-ai-worker@` だけ（他の binding 無し） |
| プロジェクトの binding | `gcloud projects get-iam-policy afro-cms-4a6ff --project afro-cms-4a6ff --flatten=… \| grep` | [FACT] `datastore.user`: `afro-cms-ai-worker@`・`afro-cms-functions@`／`cloudtasks.enqueuer`: `afro-cms-functions@`／`cloudtasks.serviceAgent`: Google 管理 SA／`afro-cms-ai-worker@` のプロジェクト role は `datastore.user` だけ／プロジェクト単位の `roles/secretmanager.*` は引き続き 0 件 |
| callable SA の SA ポリシー | `gcloud iam service-accounts get-iam-policy afro-cms-functions@… --project afro-cms-4a6ff` | [FACT] `serviceAccountUser` は自分自身だけ |
| API | `gcloud services list --enabled --project afro-cms-4a6ff` | [FACT] `cloudtasks.googleapis.com` が有効 |
| キュー | `gcloud tasks queues list --location asia-northeast1 --project afro-cms-4a6ff` | [FACT] 0 件（キューは G-7 のデプロイで作られる） |
| 予算 | 上の 2. | [FACT] ¥1,000 の予算あり |

### 4. 残り

- G-7（functions のデプロイ・invoker・OIDC の SA の確定）は未承認・未実施。§9.9 のキュー・OIDC・worker の Cloud Run の項目は G-7 の後
- 2.3 の [UNKNOWN]（既定 SA の Editor が Secret を読めるか）は未確認のまま。security-engineer の判定事項
