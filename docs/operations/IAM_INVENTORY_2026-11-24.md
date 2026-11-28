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

## セキュリティ確認 2026-11-24（Editor とシークレット）

- 実施: 2026-11-24（JST）、security-engineer。**読むだけ**（追加・削除・設定・デプロイなし。Secret の値は読んでいない＝`versions access` 未実行）。プロジェクトに属するコマンドはすべて `--project afro-cms-4a6ff`、標準入力は閉じて実行（Compute API の有効化確認には N で終了）
- 2.3 の [UNKNOWN] を閉じる

### 1. 結論

| 問い | 答え |
|---|---|
| `roles/editor` は Secret の中身を**直接**読めるか | **読めない** [FACT] |
| Editor を持つ主体は**間接的に**読めるか | **読める経路がある** [FACT: 権限の組み合わせ]／[INFERENCE: 実際に悪用できる条件は下の 3.] |
| 今日 `ANTHROPIC_API_KEY` を読める主体 | 直接: `afro-cms-ai-worker@`（Secret 単位の `secretAccessor`）とプロジェクト Owner（`user:<人>`）だけ。間接: Editor を持つ既定 SA（実際にコードが動くのは compute 既定 SA のビルド時だけ） |
| 危険度 | **Medium** |
| AI 機能のリリースを止めるか | MODE=off / internal は**止めない**。MODE=on は**条件付き**（下の 4.） |

### 2. 根拠

| # | 確認 | 結果 |
|---|---|---|
| S1 | `gcloud iam roles describe roles/editor --format=json`（グローバル・読むだけ） | [FACT] title `Editor (Legacy)`。`secretmanager.*` は 26 個あり、`versions.add`／`versions.destroy`／`versions.disable`／`versions.enable`／`versions.get`／`versions.list`／`secrets.create`／`secrets.delete`／`secrets.update`／`secrets.getIamPolicy` 等を含むが、**`secretmanager.versions.access` と `secretmanager.secrets.setIamPolicy` は含まない**（grep 0 件） |
| S2 | 同じ出力で権限昇格に使える権限を grep | [FACT] **`iam.serviceAccounts.actAs`**・**`iam.serviceAccountKeys.create`**・`run.services.create`・`cloudfunctions.functions.create`・`cloudbuild.builds.create` を含む |
| S3 | 公式 docs: https://docs.cloud.google.com/secret-manager/docs/access-control（2026-11-24 取得。旧 URL cloud.google.com/… から 301） | [FACT] "The role `roles/owner` includes the `secretmanager.versions.access` permission, but the `roles/editor` and `roles/viewer` do not." |
| S4 | `gcloud functions list --project afro-cms-4a6ff` | [FACT] 2 本とも実行 SA は `afro-cms-functions@`、**ビルド SA は `640072999586-compute@developer`** |
| S5 | `gcloud run services list --project afro-cms-4a6ff`／`gcloud run jobs list` | [FACT] サービス 2 本（上の 2 関数）とも `afro-cms-functions@`。ジョブ 0 件。**compute 既定 SA で実行時に動いているものは無い** |
| S6 | `gcloud app describe`／`gcloud compute instances list` | [FACT] App Engine アプリ無し、Compute Engine API 無効（＝VM 無し） |
| S7 | `gcloud iam service-accounts get-iam-policy`（compute 既定・appspot） | [FACT] どちらも空。この 2 つを使える（actAs）のはプロジェクト Owner（と Editor 保持者）だけ |
| S8 | `gcloud iam service-accounts keys list --managed-by=user`（compute 既定・appspot・ai-worker） | [FACT] 3 つとも利用者管理の鍵 0 件 |
| S9 | `gcloud projects describe` の parent | [FACT] 空（組織に属さない）。`iam.disableServiceAccountKeyCreation` の実効値は `booleanPolicy: {}`（＝鍵作成は禁止されていない） |
| S10 | `gcloud secrets get-iam-policy ANTHROPIC_API_KEY --project afro-cms-4a6ff` | [FACT] `secretAccessor` は `afro-cms-ai-worker@` の 1 件だけ（G-2 のとおり。増えていない） |
| S11 | 公式 docs: https://docs.cloud.google.com/functions/docs/securing/build-custom-sa（2026-11-24 取得） | [FACT] ビルドは既定の Cloud Build 用 SA を使い、compute 既定 SA がビルド主体になりうる。既定 SA を使えなくすると「a new service account を割り当てるまで全デプロイが壊れる」。代替は compute SA へ `roles/cloudbuild.builds.builder` を付ける、または専用ビルド SA（logging・Artifact Registry writer・Storage object viewer） |

### 3. 間接経路（攻撃シナリオ）

- [FACT: S2] Editor はプロジェクト単位で `actAs` を持つ → **任意の SA（`afro-cms-ai-worker@` を含む）として Cloud Run／Functions をデプロイできる**。さらに `serviceAccountKeys.create` で **worker SA の鍵を発行できる**（S9 により禁止されていない）。どちらでも `afro-cms-ai-worker@` の権限で Secret を読める
- [FACT: S1] 読めなくても、Editor は `versions.add`／`disable`／`destroy` で **鍵の差し替え・無効化（改ざん／停止）**ができる
- **誰が Editor として動けるか**:
  - compute 既定 SA: **関数のビルド時**に動く（S4）。[INFERENCE] ビルド中の `npm install`（依存の postinstall 等）はビルド SA の資格情報に届く。依存がサプライチェーン攻撃を受けると、デプロイの瞬間に worker SA の鍵発行 → `ANTHROPIC_API_KEY` の取得が成立しうる。実行時（関数の稼働中）には compute 既定 SA を使うものは無い（S5）
  - appspot SA: 使っているもの無し（S6）、鍵 0 件、actAs できるのは Owner だけ（S7・S8）→ 実害の経路は今は無い [INFERENCE]
  - cloudservices SA: Google 管理（Google API の内部処理用）。利用者のコードは動かない → 対象外
- 外部（インターネット）から直接届く経路は無い。前提は「依存の汚染」か「Owner の資格情報の漏洩」（後者は Editor と無関係に全権）
- 影響: Anthropic の API キー 1 本の漏洩 → 課金の不正利用（個人情報は含まない）。GCP の予算 ¥1,000 は Anthropic 側の課金を止めない [INFERENCE]

### 4. 推奨と壊れる可能性

| # | 推奨 | いつ | 壊れる可能性 | ユーザー承認 |
|---|---|---|---|---|
| R1 | **Anthropic 側でこのキーに月の上限（spend limit）を設定**し、使用量の通知を受ける（漏れた場合の損害の上限） | MODE=on の前 | 無し | 要（課金設定） |
| R2 | **compute 既定 SA の Editor を外す**。先に compute SA へ `roles/cloudbuild.builds.builder`（S11 の代替。actAs・鍵発行・Secret の権限を含まない）を付け、既存 2 関数を 1 回デプロイし直してビルドが通ることを確かめてから Editor を外す。戻し方は Editor を付け直す | MODE=on の前を推奨（遅くとも次の依存更新の前） | **gen2 のデプロイが失敗しうる**（ビルド SA の権限不足。S11）。稼働中の関数は止まらない（実行 SA は `afro-cms-functions@`）。compute SA の `eventarc.eventReceiver`・`run.invoker` は残す | 要（IAM 変更） |
| R3 | appspot SA の Editor を外す | R2 の後・任意 | 低（App Engine アプリ無し・使っているもの無し）。[UNKNOWN] Firebase の一部機能が appspot SA を前提にしていないかは未確認 | 要 |
| R4 | cloudservices SA の Editor は**触らない** | — | 外すと Google 側の処理が壊れうる | — |
| R5 | IAM Deny ポリシーで `secretmanager.versions.access` を拒否する案は**不要**（Editor はもともと持たない。S1・S3）。間接経路は R2 で塞ぐ | — | — | — |
| R6 | G-7 デプロイ後に S10 を再確認（Firebase CLI が `afro-cms-functions@`・compute SA に `secretAccessor` を自動で足していないか。§3 の G-7 注意と同じ） | G-7 直後 | 無し | 不要（読むだけ） |

- [UNKNOWN] 組織に属さないプロジェクトで `iam.disableServiceAccountKeyCreation` をプロジェクト単位に設定できるかは未確認（今回は調べていない）。R2 で compute SA が `serviceAccountKeys.create` を持たなくなれば、この制約は無くても経路は閉じる

### 5. リリース判定（AI 機能）

| MODE | 判定 | 理由 |
|---|---|---|
| off | **止めない** | Secret を読む関数が動かない |
| internal | **止めない** | 間接経路の前提（依存汚染・Owner 漏洩）は内部利用でも変わらず、利用者が少なく損害も小さい。R6 は実施 |
| on | **WITH CONDITIONS** | R1（上限）を満たすこと。R2 は強く推奨。R2 を先送りする場合は「ビルド時の依存汚染で API キーが漏れうる」を受容リスクとしてユーザーが判断し記録する |

- 受容するリスク（現時点）: 既定 SA 3 つの Editor を残す（R2 実施まで）。理由: 稼働中の実行時経路は無く、外すとデプロイが壊れうるため、ビルド確認とセットで行う

## G-7 実行記録 2026-11-25（JST。ユーザー GO「はい、一気に進めて」）

- main 351bfb9 → e86a3a2（0.47.4 / 0.47.5 / 0.48.0）。functions を `AI_REQUIREMENTS_MODE=off` でデプロイ（関数 2 → 5 本・キュー `generateRequirementsDraftTask` RUNNING）。1 回目は worker の SA が省略形 `afro-cms-ai-worker@` のため firebase-tools の Secret 権限確認で 400 → 完全なメールに直して再デプロイ（CHANGELOG 0.48.0）。2 回目は emulator の読み込みタイムアウトで test:functions 16 件失敗 → 単独再実行 201/201 → 3 回目で成功
- [FACT] `gcloud secrets get-iam-policy ANTHROPIC_API_KEY`: `secretAccessor` は `afro-cms-ai-worker@` の 1 件だけ（増えていない）
- [FACT] worker `generaterequirementsdrafttask` の実行 SA は `afro-cms-ai-worker@`。デプロイ直後の invoker は空 → `gcloud run services add-iam-policy-binding generaterequirementsdrafttask --member serviceAccount:afro-cms-functions@afro-cms-4a6ff.iam.gserviceaccount.com --role roles/run.invoker`（`allUsers` なし）。戻し: 同じ引数で `remove-iam-policy-binding`
- [INFERENCE] OIDC の SA は enqueue した関数の実行 SA（firebase-admin `functions-api-client-internal.js` updateTaskPayload が `getServiceAccount()` を `oidcToken.serviceAccountEmail` にする）＝ `afro-cms-functions@`。internal で最初のタスクが動いた時点で確定する
- [FACT] callable 2 本（requestRequirementsDraft・saveAiDraftEdits）は `allUsers` の invoker（callable の通常。認証・権限はコード側）。実行 SA は `afro-cms-functions@`
- Hosting: dist-live（`VITE_FEATURE_AI_REQUIREMENTS=internal`）をデプロイ。サーバが off の間は AI パネルが「この案件では使えません」になる

## Rules・R2 実行記録 2026-11-25（JST。ユーザー GO「Rules と R2 やって」）

- Firestore Rules をデプロイ（aiDrafts・aiUsage・提案 v2。rules:check OK・test:rules 392/392）。G-7 のときに出し忘れていた（AI 機能は Rules が無いと下書きを読めない）。戻し: a3a8bc8 の `firestore.rules` を `--only firestore:rules` で出し直す
- R2: compute 既定 SA（`640072999586-compute@`）に `roles/cloudbuild.builds.builder` を付け、`roles/editor` を外した。[FACT] 残る role は builds.builder・eventarc.eventReceiver・run.invoker
- 確認: `--only functions` だと変更なしの関数は Skipped（ビルドが走らない）→ `firebase deploy --only functions:provisionInvitee` で 1 本をビルドし直した。[FACT] `gcloud builds list --region asia-northeast1` 最新 2026-11-25T01:55:57Z SUCCESS（SA は compute 既定）。`ANTHROPIC_API_KEY` の `secretAccessor` は worker だけのまま
- 戻し: `gcloud projects add-iam-policy-binding afro-cms-4a6ff --member serviceAccount:640072999586-compute@developer.gserviceaccount.com --role roles/editor --condition=None`
- 気づき: デプロイ前の test:functions がエミュレータの関数読み込み 60 秒の時間切れで 16 件落ちることがある（11-25 に 2 回。単独再実行で 201/201）。docs/TODO.md に記載

## internal 切替・管理者の案件作成 2026-11-25 午後（JST。ユーザー GO「main に入れて出して」）

- main 3e3387d（0.48.1 管理者の案件作成＋ `AI_REQUIREMENTS_MODE=internal`・allowlist = 試験用案件 `f2HCWbvzbuZHLB0K5fW8`（架空データだけ））
- functions: test:functions 201/201 → 5 本 update。Rules: rules:check OK・test:rules 417/417 → released。Hosting: dist-live（`VITE_FEATURE_AI_REQUIREMENTS=internal`）release complete
- アイグランの案件 `r3DKL56HfOq8HmvNBTTX` は allowlist に入れていない（実在の顧客の情報を Anthropic へ送ってよいかのユーザー確認待ち）
- 途中で止まった 3 回: emulator の時間切れ 1 回、並行作業との port 衝突 2 回、本番の値を off に固定していたテスト（ai-flow フラグ2）1 回 → off か internal を許し on を止める形に直した（e7be19c）
- [DECISION] ユーザー 2026-11-25「送って」: アイグラン（実在の顧客）の案件 `r3DKL56HfOq8HmvNBTTX` を allowlist に追加。ヒアリングの回答と公開サイトの本文を Anthropic へ送ることをユーザーが了承（契約上の可否はユーザー判断）。ヒアリングに個人名・電話・メールを入れない運用

## 0.50.0 リリース 2026-11-26 夕（JST。ユーザー GO「本番に出して」）

- main ed2cbaf（0.50.0：live のプロジェクト詳細をデモと同じ見た目・要件定義書の配置調整・要件定義書ひな型 U1〜U4）＋ e877e9e（`functions/.env.afro-cms-4a6ff` に `AI_REQUIREMENTS_PROPOSAL_VERSION=2` を明示。既定 2 でも firebase の非対話デプロイが値を要求して止まった）
- Rules＋Indexes: test:rules 595/595 → released。**11-25 午後（3e3387d）以降に出していなかった構築タスク（`projects/{pid}/tasks`）・相談（`messages`・`consult`）の Rules もここで本番へ入った**（Hosting は 45ac8c9 で画面が先に出ていた）。v3 の提案の受け付けと必須の章のゲートは v3 だけで、v1・v2 は不変。戻し: 3e3387d の `firestore.rules` を `--only firestore:rules`
- Functions: test:functions 239/239 → 5 本 update（`AI_REQUIREMENTS_MODE=internal`・allowlist は変更なし・版 2）。[FACT] 更新後も worker の実行 SA は `afro-cms-ai-worker@`、invoker は `afro-cms-functions@` だけ、`ANTHROPIC_API_KEY` の secretAccessor は worker だけ（gcloud で確認）。戻し: 3e3387d 以降の直前の main で `--only functions`
- Hosting: dist-live（`aiFlag internal`。deploy の検査で一致）release complete。[FACT] `https://afro-cms-4a6ff.web.app/` と深いパスが 200、X-Frame-Options DENY・CSP frame-ancestors・HSTS、`LiveProjectDetailPage` の chunk に「制作の8段階」。ログインしての画面確認は未実施（本番のアカウントはユーザーだけ）。戻し: Firebase Console の Hosting のリリース履歴から直前（45ac8c9）へ
- 途中で止まったこと: deploy の test:rules がローカル画面用のエミュレータ（8080/9099）と衝突 → ユーザーがエミュレータを停止して実行、反映後に再起動・架空データを再投入
- 追記（同日・ユーザー決定「3 に切り替える」。本番で改善提案しか出ず、ひな型の章立てが出ないため）: main 39e9e0c で `AI_REQUIREMENTS_PROPOSAL_VERSION=3`。test:functions 239/239 → functions 5 本 update。[FACT] gcloud で worker・callable の環境が `AI_REQUIREMENTS_MODE=internal`・`AI_REQUIREMENTS_PROPOSAL_VERSION=3`、invoker は `afro-cms-functions@` だけ。費用の概算は最大約 0.27 USD/回（Sonnet 5.5・max_tokens 24,000。上限 200 回/月・Anthropic 月 20 USD は据え置き）。既存の v2 下書きはそのまま、作り直した案件から v3。本番での v3 生成の実物は未確認（最初の 1 回は架空の試験案件で確かめる）。戻し: 2 にして `--only functions`

## 0.51.0 リリース 2026-11-26 夜（JST。ユーザー GO「終わったら本番に出して」）— 管理者の全操作・代理承認（XL）

- main 5e5fa82（3afd697＋7f09e37 レビュー修正＋5e5fa82 functions の共有型の写し直し）。レビュー: code-reviewer Approve w/c・security 実装後監査 APPROVE WITH CONDITIONS・Codex DEEP P2 1 → 修正 → 再レビューで未解決 0（`docs/reviews/2026-11-26-admin-full-rights-code.md`）
- 順番は A-1 どおり **Rules → Functions → Hosting**: Rules test:rules 752/752 → released ／ Functions test:functions 243/243 → 5 本 update（1 回目は functions/src/ai/shared/types.ts の写しが古く deploy の検査で中止 → `gen-ai-shared` で写し直して再実行）／ Hosting dist-live（aiFlag internal）release complete
- [FACT] 本番: `/` 200・X-Frame-Options DENY・「代理で承認」が ApprovalHistory/model の chunk にある。worker の invoker は `afro-cms-functions@` だけ、`ANTHROPIC_API_KEY` の secretAccessor は worker だけ、saveAiDraftEdits の環境は版 3。ログインしての画面確認は未実施（ユーザー）
- 戻し: **Hosting を先に** 45ac8c9 以降の直前のリリース（0.50.0）へ戻し、その後 Rules を b5de514 の `firestore.rules` で出し直す（逆順だと確認依頼・承認が全件失敗する。A-1）。Functions は b5de514 で `--only functions`

## 0.51.1 リリース 2026-11-27（JST。ユーザー GO「本番へ反映する」）— 表示のみ

- main b830d62（品質チェックの「代替テキストが無い画像の割合」の表記）。Rules・Functions の変更なし → **Hosting だけ**（`--only hosting`。dist-live の aiFlag internal）。test:unit 171/171・tsc 0
- [FACT] 本番: `/` 200、`assets/buildProposal-Y_Aiwxmx.js` に新しい表記がある（curl）。ログインしての画面確認は未実施（ユーザー）
- 戻し: Hosting を 0.51.0（5e5fa82 のビルド）へ戻すだけ（Rules・Functions は戻さない）

## 0.52.0 リリース 2026-11-28（JST。ユーザー GO）— スケジュール（段 0 → 段 1）＋要件定義書の編集の重さ

- 段 0: eb7cbfd。Rules（test:rules 763/763）→ ruleset beb93e7b（07:44:31Z）。Hosting（822 files）。[FACT] Hosting が Rules より先に出た（Rules のテスト中に実行）。段 0 の画面の変更は読み取りだけ（kind の読み分け）で書き込みは同じ＝影響なしと判断（eb7cbfd の src 差分で確認）
- 段 1: release/2026-11-28 c8f5f99（feat/live-schedule 52cb849 ＋ fix/reqdoc-edit-freeze 47776a7）。Rules（test:rules 1057/1057）→ ruleset d0649c16（08:21:50Z。本番から読み戻して一致）→ Hosting（829 files・aiFlag internal）。Functions の変更なし
- [FACT] 本番: `/` 200・`/portal/schedule` 200、X-Frame-Options DENY・CSP frame-ancestors 'none'・HSTS。配信中の index chunk がリリースのビルドとバイト一致（curl）。ログインしての画面確認は未実施
- 戻し: Hosting を段 0 の版（Console のリリース履歴）→ Rules を beb93e7b。**beb93e7b より前へ Rules を戻さない**。公開後 1 週間で Firestore の Read 件数を確認（データ設計 §10）

## 0.51.2 リリース 2026-11-27（JST。ユーザー GO「ステータスラベルの修正も本番に出して」）— 表示のみ

- main 4b88e34（要件定義の下書きの表示名「ヒアリング入力中」→「要件定義 作成中」）。Rules・Functions の変更なし → **Hosting だけ**（aiFlag internal）。test:unit 171/171・tsc 0
- [FACT] 本番: `/` 200、新しい表示名が配信中の chunk にある（curl）。ログインしての画面確認は未実施
- 戻し: Hosting を 0.51.1（b830d62 のビルド）へ戻すだけ
