# RUNBOOK: Firebase 本番プロジェクト（live 版）

- 正の設計: `docs/design/BACKEND_FIREBASE.md` §2.5（初代管理者）・§15（環境設定）・`docs/TODO.md`（段階 C の条件）
- **このPCの gcloud の既定は別のお客様の本番**。`gcloud`・ADC・`firebase init`・`.firebaserc` の default を使わない。デプロイは必ず `--project <ID>` 付きの `npm run deploy:firebase`
- 作業者の欄: 【ユーザー】＝ご本人の Google アカウントで Console 操作、【開発】＝リポジトリ側

## 1. プロジェクトを作る【ユーザー】

> 2026-11-12 作成済み: **ID `afro-cms-4a6ff`**（作成は別アカウント。普段のアカウントもオーナー）。§2〜4 も設定済み。Console の URL の `/u/<n>/` はブラウザのログイン順で変わるので、操作前に右上のアカウントを確かめる

1. https://console.firebase.google.com →「プロジェクトを作成」
2. 名前: 例 `afro-cms`（プロジェクト ID は自動で付く。**ID は後から変えられない**ので確認する）
3. Google アナリティクス: **オフ**（使わない。個人情報を増やさない）
4. 料金プラン: 作成時は Spark（無料）。**0.46.0 から Blaze**（招待のアカウント作成を Cloud Functions で行うため。2026-11-19 ユーザー決定。手順と予算アラート 1,000 円は `docs/TODO.md`、条件は設計書 §21）

## 2. Authentication【ユーザー】

1. 構築 → Authentication →「始める」
2. ログイン方法: **メール / パスワード を有効**（「メールリンク」はオフ）。他のプロバイダ・**匿名はオフ**
3. 設定 → ユーザー アクション: **メール列挙の保護 = オン**
4. 設定 → パスワード ポリシー: **8 文字以上**
5. 設定 → 承認済みドメイン: **`localhost` を削除**（`<ID>.firebaseapp.com`・`<ID>.web.app` は残す）

## 3. Firestore【ユーザー】

1. 構築 → Firestore Database →「データベースを作成」
2. エディション: Standard ／ データベース ID: `(default)`
3. ロケーション: **`asia-northeast1`（東京）**（設計書 §25-10。**後から変えられない**）
4. セキュリティ ルール: **本番モード**（すべて拒否から始める。ルールは【開発】がデプロイする）

## 4. Web アプリを登録【ユーザー】

1. プロジェクトの設定（歯車）→ マイアプリ →「</>（ウェブ）」
2. ニックネーム: `afro-cms-web` ／「Firebase Hosting も設定する」: チェックする
3. 表示される `firebaseConfig` のうち **`apiKey`・`authDomain`・`projectId`・`appId`** の 4 つを開発へ渡す
   - これらは公開される値（秘密ではない）。**サービス アカウントの鍵（JSON）は作らない・渡さない**

## 5. CLI のログイン【ユーザー】

- Claude Code で `! npx firebase login`（ブラウザで同じ Google アカウントを選ぶ）
- 確認: `! npx firebase projects:list` に 1 の ID が出る

## 6. 設定とデプロイ【開発】（デプロイはユーザーの了承の後）

1. `scripts/firebase-projects.mjs` の `PRODUCTION_PROJECT_IDS` を `['<ID>']` に（lead-architect 確認）
2. `.env.live.local`（コミットしない）に 4 の値
3. `npm run build:live` → `npm run deploy:firebase -- --project <ID> --only firestore:rules,firestore:indexes` → **`--only functions`（0.46.0 から。`npm --prefix functions ci` の後。hosting より先）** → `--only hosting`
   - functions と hosting を 1 回（`--only functions,hosting`）で出さない。画面が先に替わると招待が失敗する（順番の詳細は `docs/TODO.md`）
4. `https://<ID>.web.app` を開いてログイン画面が出ること、応答ヘッダ（X-Frame-Options 等）を確認

## 7. 初代管理者【ユーザー → 開発が確認】（§2.5）

1. Firestore →「コレクションを開始」→ `invites`、文書 ID = 管理者のメール（**小文字**）
   - フィールド: `role`=`admin`（string）、`name`=氏名（string）、`status`=`invited`（string）、`createdAt`=今（timestamp）、`createdBy`=`console`（string）
2. Authentication →「ユーザー」→「ユーザーを追加」で同じメール（**小文字**）と仮のパスワードを入れる → ログイン画面の「パスワードを忘れた方」で自分のパスワードを設定 → ログイン → 管理者画面が出る
   - 「作成（登録）を許可」が OFF（0.46.0 以降の運用）だと、アプリの新規登録は使えない。Console の「ユーザーを追加」は OFF でも使える [INFERENCE。初回に確かめて記録する]
   - **0.47.0 から**: 作った Auth ユーザーの「ユーザー UID」をコピーし、1 の招待の文書に `provisionedUid`（string）＝その UID を足す（**ログインより前に**）。無いと Rules が受け取りを拒否する（招待のために作ったアカウントだけが受け取れる。`docs/design/INVITE_EXISTING_ACCOUNT.md`）。既に受け取り済みの管理者は何もしなくてよい
3. 2 人目以降の管理者も同じ手順（アプリから管理者は招待できない）。開発者・お客様はアプリの「ユーザー」から招待する

## 8. 外部のお客様を招待する前に（`docs/TODO.md` 段階 C）

- App Check（reCAPTCHA）を Firestore・Auth で **enforce**
- Google Cloud Console → API とサービス → 認証情報 → ブラウザ キー: リファラーを `https://<ID>.web.app/*`・`https://<ID>.firebaseapp.com/*` に、API を Identity Toolkit / Token Service / Cloud Firestore に制限
- 招待の方式（再設定リンク方式にするか）と保存期間（LEGAL REVIEW REQUIRED）を決める

## 9. AI 下書き（`docs/design/AI_REQUIREMENTS_PLAN.md` §4 U5・§5・§7）

> **クラウドの変更はすべてユーザーの GO の後**。下のコマンドは手順の文面で、実行済みではない。`gcloud` は**必ず `--project afro-cms-4a6ff` を付ける**（このPCの既定は別のお客様の本番）。Secret の**値を表示するコマンド（`gcloud secrets versions access`）は使わない**（2026-11-20 の教訓）。見るのは名前と版番号だけ

### 9.1 Secret と実行 SA の一覧（値は書かない）

| 名前 | 置き場 | 使う関数 | 権限 |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Secret Manager（`afro-cms-4a6ff`）。有効なのは v3 だけ（2026-11-20） | worker `generateRequirementsDraftTask` だけ（`functions/src/ai/index.ts` の `secrets: [ANTHROPIC_API_KEY]`） | `afro-cms-ai-worker@afro-cms-4a6ff.iam.gserviceaccount.com` に、**この Secret だけ**を対象にした `roles/secretmanager.secretAccessor` |

| 実行 SA | 関数 | 持つ role | 持たないもの |
|---|---|---|---|
| `afro-cms-ai-worker@` | worker（Cloud Tasks から起動） | Secret 1 本の `secretAccessor`／プロジェクトの `roles/datastore.user` | プロジェクト単位の `secretAccessor`・Editor・Owner |
| `afro-cms-functions@` | callable 全部（`requestRequirementsDraft`・`saveAiDraftEdits`・招待など） | 既存の role ＋ `roles/cloudtasks.enqueuer`（プロジェクト）＋ 自分自身への `roles/iam.serviceAccountUser`（タスクに OIDC トークンを付けるため）＋ worker の Cloud Run への `roles/run.invoker` | **Secret は持たない**（AI のクライアントを作らない） |

- [INFERENCE] Admin SDK の `taskQueue().enqueue()` は、呼び出した関数の実行 SA（＝`afro-cms-functions@`）を OIDC トークンの SA にする。公式（https://firebase.google.com/docs/functions/task-functions 、2026-11-24 WebFetch）に書いてあるのは「enqueue する主体には `cloudtasks.tasks.create` と、タスクに結ぶ SA を使う権限が要る」「起動する主体には invoke の権限が要る」までで、OIDC の SA 名は書かれていない → **G-7 の後にタスクの `oidcToken.serviceAccountEmail` を見て確定し、この表を直す**
- キューは functions のデプロイで作られる（同ページ: the CLI creates a task queue in Cloud Tasks ... when you first deploy [FACT WebFetch]）。設定（並列 2・再試行なし・deadline 600 秒）は `functions/src/ai/limits.ts` の `AI_WORKER`
- `ANTHROPIC_LOG` はデプロイの env（`functions/.env*`）に入れない（入れると SDK が本文をログに出す）

### 9.2 ローテーション（期限 2027-11-20 の 1 か月前、または漏えいの疑い）

順序は **新しい版を足す → 出し直す → 疎通を確かめる → 古い版を無効にする → 削除する**。

1. 【ユーザー】Anthropic Console（Workspace `afro-cms`）で新しいキーを作る。キーはチャットにも docs にも貼らない
2. 【ユーザー】`gcloud secrets versions add ANTHROPIC_API_KEY --data-file=- --project afro-cms-4a6ff`（標準入力に貼り付けて終える。ファイルに保存しない）
3. 【開発】`npm run deploy:firebase -- --project afro-cms-4a6ff --only functions`（Secret の版はデプロイ時に決まるため、出し直すまで新しい版は使われない）
4. 【開発】`internal` の社内試験案件で 1 回生成し、成功を確かめる（MODE=off のときは疎通を省き、「未検証」と記録する）
5. 【ユーザー】Anthropic Console で古いキーを失効させる → `gcloud secrets versions disable <古い版> --secret ANTHROPIC_API_KEY --project afro-cms-4a6ff` → 1 週間問題が無ければ `gcloud secrets versions destroy <古い版> --secret ANTHROPIC_API_KEY --project afro-cms-4a6ff`
6. `docs/TODO.md` にあるキー名と期限の行を更新する

### 9.3 漏えい時（削除より先に失効させる）

1. 【ユーザー】**Anthropic Console でそのキーをすぐ失効させる**（ここで外部からの利用が止まる。最優先）
2. 止める（9.6 の 1）。そのあと新しいキーで 9.2 の 1〜3 を行う
3. 漏れた版を `gcloud secrets versions destroy <版> --secret ANTHROPIC_API_KEY --project afro-cms-4a6ff` で消す（**戻せない**）
4. Anthropic Console の Usage で漏えい期間の利用を確かめ、`aiUsage` と食い違う分を記録する。Git に入った場合は、履歴の扱いを lead-architect と決める（キーは失効済みなので急がない）

### 9.4 フラグの切り方

| 値 | 置き場 | 効き方 |
|---|---|---|
| `AI_REQUIREMENTS_MODE`（`off`｜`internal`｜`on`。不明な値・空は off） | `functions/.env.afro-cms-4a6ff`（コミットする。秘密ではない値だけ） | **サーバーが正**。callable の最初と worker の開始時に判定 |
| `AI_REQUIREMENTS_PROJECT_ALLOWLIST`（カンマ区切りの案件 ID） | 同上 | `internal` のとき、admin の生成と開発者の編集を許す案件。空なら全部拒否 |
| `VITE_FEATURE_AI_REQUIREMENTS`（`off`｜`internal`｜`on`） | `.env.live.local`（コミットしない）→ `npm run build:live` | 画面の表示だけ（セキュリティの境界ではない） |

- 出す順は **functions が先、hosting が後**（別々の `--only` で出す）。戻すときも、functions の `off` を先に出す
- `on` は `docs/legal/AI_REQUIREMENTS_LEGAL_CLEARANCE.md` が無いと `deploy:firebase` が止める（計画 §5 L-c）。この記録は、ユーザーが内容を承認してから作る

### 9.5 上限を変える

- 値は `functions/src/ai/limits.ts` の 1 箇所だけにある（`AI_QUOTA` が回数、`AI_WORKER` が時間と並列、`SITE_LIMITS` がサイト取得）。**変更はユーザー確認**（計画 L-d）
- 変えたら `npm --prefix functions test` を通してから `--only functions` で出し直す。回数は JST の日付で数える（`quota.ts`）

### 9.6 止める手順（速い順）

1. **フラグ**: `functions/.env.afro-cms-4a6ff` を `AI_REQUIREMENTS_MODE=off` にして `--only functions` で出す（数分）。押下はすぐ拒否され、キューに残ったタスクは worker の開始時に off を見て返金して終わる
2. **キューの一時停止**（秒単位）: `gcloud tasks queues pause <キュー名> --location asia-northeast1 --project afro-cms-4a6ff`。戻すときは `resume`。キュー名は `gcloud tasks queues list --location asia-northeast1 --project afro-cms-4a6ff` で確かめ、9.9 に記録する
3. **キーの失効**（Anthropic Console）。AI の呼び出しがすべて失敗し、費用は止まる
4. 関数の削除（最後の手段）: `npx firebase functions:delete requestRequirementsDraft saveAiDraftEdits generateRequirementsDraftTask --project afro-cms-4a6ff`

### 9.7 Hosting の戻し先の下限

- v2 の提案（`requirements/current.proposal.version == 2`）が 1 件でも保存された後は、**計画 §7 段 3（v2 を描ける画面）より前の版へ Hosting を戻さない**（戻すと v2 を描けない画面になる）。段 3 で出した版の ID を `docs/TODO.md` に記録する
- Rules の v2 受け付けも、同じ時点から外さない

### 9.8 月 1 回の請求の突き合わせ【ユーザー＋開発】

1. 【ユーザー】Anthropic Console（Workspace `afro-cms`、月 $20 上限）→ Usage／Cost で前月分を見る
2. 【開発】Firestore の `aiUsage/{yyyymm}`（admin で読む）の回数と推定費用を見る
3. 差が 20% を超えたら理由を調べる（`pricing.json` の単価・失敗時の費用の計上・評価キーの混入）。結果は日付つきで `docs/design/AI_REQUIREMENTS_EVAL.md` の末尾（運用の実績）に書く
4. 同じ月に GCP の請求（Cloud Functions・Cloud Tasks・Secret Manager）も見る。予算アラート ¥1,000 は通知するだけで、請求は止まらない

### 9.9 Release Gate: IAM の証拠（SEC-H2・計画 §11 T-05・T-06。段 4 の前に出力を記録する）

> 読み取りのコマンドも、実行するのはユーザーの GO の後（G-0）。残すのは role と主体の一覧だけで、鍵や値は残さない。

- [ ] プロジェクトの IAM: `gcloud projects get-iam-policy afro-cms-4a6ff --flatten="bindings[].members" --format="table(bindings.role,bindings.members)"` → `afro-cms-ai-worker@` が持つのは `roles/datastore.user` だけ／プロジェクト単位の `roles/secretmanager.secretAccessor` を持つのは、棚卸しで残すと決めた主体だけ／実行 SA に Editor・Owner が無い
- [ ] worker SA 自体: `gcloud iam service-accounts get-iam-policy afro-cms-ai-worker@afro-cms-4a6ff.iam.gserviceaccount.com --project afro-cms-4a6ff`（この SA を使える主体。想定はデプロイする人だけ）
- [ ] Secret: `gcloud secrets get-iam-policy ANTHROPIC_API_KEY --project afro-cms-4a6ff` → `secretAccessor` は `afro-cms-ai-worker@` だけ。`gcloud secrets versions list ANTHROPIC_API_KEY --project afro-cms-4a6ff`（名前と状態だけ）
- [ ] 他の Secret: `gcloud secrets list --project afro-cms-4a6ff`（名前だけ）
- [ ] Cloud Tasks: `gcloud tasks queues describe <キュー名> --location asia-northeast1 --project afro-cms-4a6ff`（並列 2・maxAttempts 1）／`gcloud tasks queues get-iam-policy <キュー名> --location asia-northeast1 --project afro-cms-4a6ff` に `allUsers`・`allAuthenticatedUsers` が無い
- [ ] OIDC: 生成を 1 回押した直後に `gcloud tasks list --queue <キュー名> --location asia-northeast1 --project afro-cms-4a6ff --format="value(httpRequest.oidcToken.serviceAccountEmail)"`（タスクが残っている間だけ見える）→ 9.1 の [INFERENCE] を確定させる
- [ ] worker の Cloud Run: `gcloud run services get-iam-policy generaterequirementsdrafttask --region asia-northeast1 --project afro-cms-4a6ff` → `roles/run.invoker` を持つのは OIDC の SA だけで、**`allUsers`・`allAuthenticatedUsers` が無い**（サービス名は `gcloud run services list --region asia-northeast1 --project afro-cms-4a6ff` で確かめる）
- [ ] 関数の env: `grep -r ANTHROPIC_LOG functions/.env*` が 0 件
- [ ] 予算アラート: G-6 の後、`gcloud billing budgets list --billing-account <請求先 ID>` に ¥1,000 の予算がある

### 9.10 ユーザーの GO が要るクラウド作業（計画 §7 段 0・段 2。番号ごとに GO をもらう）

| # | 作業 | コマンド（`--project afro-cms-4a6ff` は必須） | 変わるもの | 戻し方 |
|---|---|---|---|---|
| G-0 | 棚卸し（読むだけ） | `gcloud projects get-iam-policy afro-cms-4a6ff`・`gcloud secrets list --project afro-cms-4a6ff`・`gcloud services list --enabled --project afro-cms-4a6ff` | なし | — |
| G-1 | worker SA を作る | `gcloud iam service-accounts create afro-cms-ai-worker --display-name "AFRO CMS AI worker" --project afro-cms-4a6ff` | SA が 1 個増える | `gcloud iam service-accounts delete afro-cms-ai-worker@afro-cms-4a6ff.iam.gserviceaccount.com --project afro-cms-4a6ff` |
| G-2 | worker SA に権限を付ける | `gcloud secrets add-iam-policy-binding ANTHROPIC_API_KEY --member serviceAccount:afro-cms-ai-worker@afro-cms-4a6ff.iam.gserviceaccount.com --role roles/secretmanager.secretAccessor --project afro-cms-4a6ff`／`gcloud projects add-iam-policy-binding afro-cms-4a6ff --member serviceAccount:afro-cms-ai-worker@afro-cms-4a6ff.iam.gserviceaccount.com --role roles/datastore.user --condition=None` | Secret 1 本とプロジェクトの binding | 同じ引数で `remove-iam-policy-binding` |
| G-3 | callable SA に Tasks の権限を付ける | `gcloud projects add-iam-policy-binding afro-cms-4a6ff --member serviceAccount:afro-cms-functions@afro-cms-4a6ff.iam.gserviceaccount.com --role roles/cloudtasks.enqueuer --condition=None`／`gcloud iam service-accounts add-iam-policy-binding afro-cms-functions@afro-cms-4a6ff.iam.gserviceaccount.com --member serviceAccount:afro-cms-functions@afro-cms-4a6ff.iam.gserviceaccount.com --role roles/iam.serviceAccountUser --project afro-cms-4a6ff` | プロジェクトと SA の binding | 同じ引数で `remove-iam-policy-binding` |
| G-4 | Cloud Tasks API を有効にする（G-0 で無効だった場合） | `gcloud services enable cloudtasks.googleapis.com --project afro-cms-4a6ff` | API の有効化（費用は使った分だけ） | `gcloud services disable cloudtasks.googleapis.com --project afro-cms-4a6ff`（キューが無いときだけ） |
| G-5 | 棚卸しで不要と分かった、プロジェクト単位の `secretAccessor` を外す | `gcloud projects remove-iam-policy-binding afro-cms-4a6ff --member <主体> --role roles/secretmanager.secretAccessor` | 既存の主体の権限（外して壊れる関数が無いことを G-0 で確かめてから） | 同じ引数で `add-iam-policy-binding`（G-0 の一覧をもとに戻す） |
| G-6 | 予算アラート ¥1,000（通知だけ） | `gcloud billing budgets create --billing-account <請求先 ID> --display-name "afro-cms monthly" --budget-amount 1000JPY --filter-projects projects/afro-cms-4a6ff --threshold-rule percent=0.5 --threshold-rule percent=0.9 --threshold-rule percent=1.0` | 予算が 1 個増える（請求は止めない） | `gcloud billing budgets delete <予算 ID> --billing-account <請求先 ID>` |
| G-7 | functions のデプロイ（段 2。MODE=off）→ worker の invoker を確かめる | `npm run deploy:firebase -- --project afro-cms-4a6ff --only functions`。デプロイが invoker を付けていなければ `gcloud run services add-iam-policy-binding generaterequirementsdrafttask --region asia-northeast1 --member serviceAccount:<OIDC の SA> --role roles/run.invoker --project afro-cms-4a6ff` | 関数 3 本・キュー 1 個・invoker の binding | 9.6 の 4／`remove-iam-policy-binding` |

- 段 1（Rules）・段 3（hosting）・段 4（internal＋Smoke 1 回）は計画 §7 の順で、それぞれ別に GO をもらう

## 10. 相談（チャット）が上限 5,000 件に達した・荒らされた（2026-11-25 セキュリティ M-1。`docs/design/LIVE_DASHBOARD_TASKS_CONSULT.md` §2.2）

> **ここは手順の文面で、実行済みではない**。本番データへの直接操作は CLAUDE.md §9（バックアップ・影響の確定・実行計画・**ユーザーの承認**）を通してから。Admin SDK は **`projectId: 'afro-cms-4a6ff'` を明示**する（このPCの gcloud / ADC の既定は別のお客様の本番。`emulators:exec` を通さないスクリプトを既定のまま走らせない）

### 10.1 気づき方
- 画面: その案件の相談の返信欄の代わりに「上限の 5000 件に達しました」が出る（`src/live/consult.ts` consultBlock）。お客様からの問い合わせで気づくことが多い
- Console → Firestore → `projects/{pid}` の `consult.count`（5000 で止まる。Rules の `consultOk` が `count <= 5000`）。荒らしは `consult.count` が短時間に増えている・`messages` の `authorUid` が 1 人に偏っている
- 1 件 2 秒の間隔（Rules）があるので、1 人が 5,000 件に達するには最短でも約 2 時間45分かかる。日に 1 回 `consult.count` の大きい順を見れば間に合う（自動の通知は無い）

### 10.2 荒らしを止める（速い順。データは消さない）
1. 送っている人の `accounts/{uid}.status` を `disabled` にする（ユーザー管理の「無効にする」。Rules の roleOf が `none` になり、送信・閲覧とも止まる）
2. 案件をアーカイブする（`archived: true`。その案件へは誰も送れない。consultOk が `archived == false` を要求）
3. それでも続くなら Auth でそのユーザーを無効化する（Console → Authentication → ユーザー → 無効にする）

### 10.3 上限に達した会話を再び使えるようにする【開発 → ユーザーの承認の後】
Rules は番号（`seq` = 文書 ID `000001`〜`005000`）の重複を「上書き」として拒否するので、**`consult.count` だけを 0 に戻しても送れない**（000001 が既にある）。手順:
1. **退避**: `projects/{pid}/messages` を全件書き出す（Admin SDK で読んで JSON に保存。または `gcloud firestore export gs://<bucket> --collection-ids=messages --project afro-cms-4a6ff`）。件数が 5,000 で一致することを確かめる
2. 退避先をお客様・ユーザーに伝え、保存期間を決める（保持期間は NC-11 と一緒に決める。未決）
3. **削除**: `messages` を 500 件ずつ batch で削除（Admin SDK。Rules は通らない）
4. **戻す**: `projects/{pid}.consult` を消す（`FieldValue.delete()`。`updatedAt` は変えない）。consult が無ければ次の送信は seq 1 から始まる
5. 確かめる: その案件で 1 件送れる（担当の開発者）・画面の上限の案内が消える

- 戻し方: 1 の退避ファイルから `messages` と `consult`（count・最後の 1 件の lastAt / lastSide / lastName）を Admin SDK で書き戻す
- 急ぎでなければ、**新しい案件を作ってそちらで続ける**方が安全（データを消さない）。古い案件はアーカイブして読むだけにする
