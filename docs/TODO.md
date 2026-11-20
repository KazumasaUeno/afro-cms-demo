# TODO（afro-cms-demo）

> 未完了の作業と、既知の制限。終わったら行を消す（経緯は `docs/CHANGELOG.md`）。

## 段階 C（本番の Firebase プロジェクトを作って公開する）の前に必ず行う

出典: security re-audit 2026-11-12（APPROVED WITH CONDITIONS for B、C は未承認）／ code review 2026-11-12。作業の多くはユーザーの Google アカウントでの Console 操作。

- [ ] **App Check を有効にして enforce**（Firestore・Auth）。メール列挙（signUp の email-already-in-use。security L1）を受け入れる条件
- [ ] **Console の設定**（作業はユーザー。結果をここへ記録する）
  - [x] Auth: メール列挙の保護 ON（2026-11-20 API で確認）
  - [ ] Auth: 匿名ログイン OFF（メール／パスワード以外のプロバイダは OFF）
  - [ ] Auth: パスワードポリシー 8 文字以上（画面の検査と合わせる）
  - [ ] Auth: 承認済みドメインは `<projectId>.web.app`・`<projectId>.firebaseapp.com`（＋独自ドメイン）だけ。`localhost` を消す（独自ドメインを足すときは `functions/src/cors.ts` の許可先にも足して functions をデプロイし直す）
  - [ ] Google Cloud: API キーを HTTP リファラー（上のドメイン。`localhost` なし）と API（Identity Toolkit / Token Service / Cloud Firestore）で制限
  - [ ] `scripts/firebase-projects.mjs` の `PRODUCTION_PROJECT_IDS` に本番 ID を入れる（`TBD` のままでは全デプロイ拒否。変更は lead-architect 確認）
- [ ] **招待メール（パスワード設定）の Console 設定**（security M1 は 0.45.0 で対策。2026-11-19 ユーザー決定「招待時にアカウントを作り、パスワード設定のメールを送る」。作業はユーザー）
  - [ ] Auth → テンプレート →「パスワードの再設定」の文面を招待の文面にする（このメールは招待と「パスワードを忘れた方」の両方で届く）。例: 件名「アフロCMS へのご招待／パスワードの設定」、本文「アフロCMS をご利用いただくためのパスワードを、下のリンクから設定してください。設定後はログイン画面からメールアドレスとパスワードでログインできます。お心当たりがない場合は、このメールを破棄してください」
  - [ ] 本番相当のプロジェクトで 1 回だけ通しを確かめる: 招待 → メールのリンクでパスワード設定 → ログインで「有効」になる（設定の完了でメールが確認済みになるのはエミュレータで確認済み。本番は未確認。ならなければ確認メールの画面が出て、確認後に使える）
- [ ] **招待のアカウント作成を Cloud Functions へ移す（0.46.0。security re-audit 2026-11-19 MEDIUM の対策。2026-11-19 ユーザー決定）**。コードは済み（`functions/`・`src/live/invite.ts`。エミュレータのテスト成功。code review・security audit 2026-11-20 の指摘を 0.46.0 に反映）。以下は**この順番で**（作業はユーザー。課金の変更・デプロイはユーザーの判断で行う）
  1. [x] 2026-11-20 済（請求先 016A03-…。ユーザー選択）Firebase Console → 左下「Spark」→ **Blaze にアップグレード**（請求先アカウントを付ける）
  2. [x] 2026-11-20 済（予算 ID 81481eb8…、1,000 円・50/90/100%）Google Cloud Console → お支払い → **予算とアラート** → 予算を作る（対象: afro-cms-4a6ff、金額 **1,000 円**、通知 50%・90%・100%）。予算は上限ではなく通知だけ（超えても止まらない）
  3. [x] 2026-11-20 済（provisionInvitee v2 asia-northeast1。cleanup policy 1 日を設定）**functions を先にデプロイ**: `npm --prefix functions ci` → `npm run deploy:firebase -- --project afro-cms-4a6ff --only functions`（送る前に test:functions が走る）。**hosting より先**に出す（0.46.0 の画面は Functions を呼ぶので、先に hosting を出すと招待が「メールを送れませんでした」になる）
     - 初回は「Functions successfully deployed but could not set up cleanup policy」で終了コード 1 になる見込み（firebase-tools 15.35 の --non-interactive の動き。デプロイ自体は済んでいる）。そのときは `npx firebase functions:artifacts:setpolicy --project afro-cms-4a6ff --location asia-northeast1 --days 1` で古いイメージを 1 日で消す設定を入れる（入れないと保存料が少しずつ増える）
     - Console → Functions に `provisionInvitee`（asia-northeast1）が出ていることを確かめる
     - `--only functions,hosting` を 1 回で出すことは `deploy:firebase` が拒否する（2026-11-20）。順番（functions が先）は手順どおりに守る
  4. [x] 2026-11-20 済（feat/functions-invite 54d8ec6 のビルド）hosting をデプロイ（`npm run build:live` → `npm run deploy:firebase -- --project afro-cms-4a6ff --only hosting`）
  5. [x] 2026-11-20 済（+test1 で招待→パスワード設定→ログイン＝有効。関数のログ created）**通しを確かめる**（作成（登録）を許可がまだ ON のうちに）: 管理者で新しいメールを招待 →「招待し、パスワード設定のメールを送りました」→ メールのリンクでパスワード設定 → ログインで「有効」。Console → Functions → ログに `invite.provision`・`status: created` が出る
  6. [x] 2026-11-20 済（Auth は招待した 2 件だけ。admin v2 config で disabledUserSignup=true。公開キーの signUp は ADMIN_ONLY_OPERATION）**OFF の直前に** Authentication →「ユーザー」で、招待していないメールのアカウントが無いか見る。あれば削除する（OFF にしても、それより前に作られたアカウントは残り、招待を受け取れてしまう。security 2026-11-20 HIGH）
     その後 Firebase Console → Authentication → 設定 →「ユーザー アクション」→ **「作成（登録）を許可」を OFF** → 保存
  7. [x] 2026-11-20 一部済（+test2 の招待で関数が created＝OFF でも Admin SDK は作れる [FACT]。test2 のパスワード設定・ログインは未実施＝ユーザー判断で省略。テスト用の 2 人は無効化・取り消し済み）**OFF にした後に**もう一度通しを確かめる（別の新しいメールで招待 → パスワード設定 → ログイン）。招待が失敗したら 6 を ON に戻して連絡する（Admin SDK が OFF の影響を受けないことは公式に明記が無い [INFERENCE]）
  - 確認済み（エミュレータ・2026-11-19）: 管理者だけが作れる（未ログイン・開発者・お客様・メール未確認・無効化・メール不一致の管理者は拒否）／招待中の文書が無ければ作らない（取り消し済みも）／既にあるアカウントは変えずに existing／メールの形・長さの検査
  - 本番で確認済み（2026-11-20）: 5・6、7 の作成。パスワード再設定の完了でメールが確認済みになる（最初の管理者で確認）
  - App Check: 関数側は `ENFORCE_APP_CHECK = false`（`functions/src/index.ts`）。App Check を有効にしたら（下の「App Check を有効にして enforce」）true にして functions をデプロイし直す
  - 費用の見込み: ほぼ 0 円 / 月（招待は月に数十回。Functions の無料枠は呼び出し 200 万回 / 月・40 万 GB 秒・20 万 CPU 秒。出典 https://firebase.google.com/pricing 2026-11-19 確認。設計書 §12.2）
  - 残るリスク: 登録を OFF にするまでは、誰でも未確認のアカウントを作れる（何も読めない）。OFF にする前に登録されたアカウントは残る（Console の Authentication で、招待していないメールのアカウントが無いか一度見る）
  - **運用（security re-audit 2026-11-19 MEDIUM。登録を OFF にするまで）**: 初めての招待で「アカウントは招待より前からありました」と出たら、待たずに Console（Authentication）でそのアカウントを削除し「招待メールを送り直す」。同じメールの人がアカウント一覧に出ていたら無効にする（先に登録した人が確認メールのリンクを本人に押させていると、パスワード設定の前に招待を受け取れるため）
  - [ ] **お客様を招待する前のゲート（security audit 2026-11-20 の 0.46.0。社内試用は APPROVED WITH CONDITIONS＝上の 3〜7 の順守。お客様は下が済むまで未承認）**
    - [ ] HIGH: 招待より前からあるアカウント（関数の `existing`）を受け付けない — **コードは済み（0.47.0、`feat/invite-provisioned-uid`。エミュレータのテスト成功）。本番は下の「0.47.0 のデプロイ」が済むまで未対策**
      - 設計: `docs/design/INVITE_EXISTING_ACCOUNT.md`（案 B。2026-11-20 ユーザー承認）
    - [ ] HIGH: Console の設定を画面で確かめて記録する（作成（登録）を許可 OFF／メール・パスワード以外のプロバイダ OFF／メール列挙の保護 ON／OFF でも Admin SDK の作成が通る＝上の 7）
    - [ ] MEDIUM: App Check を enforce（`ENFORCE_APP_CHECK = true` にしてデプロイし直す）
    - [ ] MEDIUM: 関数を専用のサービスアカウントで動かす — **コードは済み（0.47.0。`setGlobalOptions({ serviceAccount: 'afro-cms-functions@' })`）。SA の作成と役割の付与はデプロイの手順 1**
    - [ ] MEDIUM: 招待を取り消したら、関数が作った Auth アカウントも消す — **コードは済み（0.47.0。Firestore トリガー `onInviteRevoked`、asia-northeast1）**。0.47.0 より前の招待（provisionedUid なし）は対象外（Console で消す）
    - [ ] **0.47.0 のデプロイ（この順番。作業・判断はユーザー。課金・IAM の変更を含む）**
      1. SA を作る: Google Cloud Console → IAM → サービスアカウント →「作成」ID `afro-cms-functions`。プロジェクトの役割: **Firebase Authentication 管理者**（roles/firebaseauth.admin）・**Cloud Datastore ユーザー**（roles/datastore.user）・**Eventarc イベント受信者**（roles/eventarc.eventReceiver。トリガーの配信）・**Cloud Run 起動元**（roles/run.invoker。トリガーが関数を呼ぶ。firebase-tools は既定の compute SA にしか自動で付けない＝`checkIam.js` [INFERENCE]）。デプロイする人にこの SA の「サービス アカウント ユーザー」（iam.serviceAccounts.actAs）
      2. Firestore のロケーションが `asia-northeast1` であることを確かめる（トリガーのリージョンと同じでないとデプロイが失敗する。[UNKNOWN] 本番は未確認）。Eventarc API が有効か（初回は権限の伝播待ちで失敗し、再デプロイで通ることがある）
      3. functions: `npm --prefix functions ci` → `npm run deploy:firebase -- --project afro-cms-4a6ff --only functions`（provisionInvitee が新しい SA に替わり、onInviteRevoked が増える）
      4. hosting: `npm run build:live` → `--only hosting`（resent を成功として扱い、already-exists ではメールを送らない）
      5. 本番 Firestore で `invites` の `status == invited` を数える（読むだけ。1 回。lead-architect が許可した後）。あれば Auth のアカウントを Console で削除 → 画面の「招待メールを送り直す」で印つきで作り直す
      6. firestore rules: `--only firestore:rules`（`claimOk`・招待の更新に provisionedUid の照合）。戻し方は前の SHA の `firestore.rules` を出す
      7. 確かめる: 新しいメールで招待 → パスワード設定 → ログインで「有効」／送り直しで「送り直しました」（警告なし）／関数のログ `status: created`・`resent`／招待を取り消すと Auth からも消える（ログ `invite.revoke`・`deleted`）。印の無いアカウントで受け取れないことはエミュレータで確認済み（本番で Console 追加を試さない）
    - [ ] LOW: callable の CORS を hosting のオリジンだけにする — **コードは済み（0.46.2、`functions/src/cors.ts`。本番は未デプロイ）**。デプロイ（`--only functions`、ユーザーの了承の後）の後に確かめる: web.app から招待できる（`GCLOUD_PROJECT` が実行環境に無いと許可先が空になり招待が失敗する＝fail-closed）／ 別のオリジンからの preflight に `Access-Control-Allow-Origin` が付かない
  - [ ] 上の 6・7（作成（登録）を許可 OFF と通し）を終える。加えて本番で「再設定で前のログインが失効する」ことを確かめる（公式は「再設定でトークンを失効」。エミュレータは失効しない）
- [ ] **0.28.0 で Rules から外した質問 ID**（`q-design-dislike`・`q-image`・`q-brand`）: これらの回答を持つ `requirements/current` があると、その文書の回答の更新が Rules で拒否されうる（`validAnswers` の `hasOnly`）。本番に live のデータを入れる前なら影響なし。入った後なら、移行（キーの削除）か Rules の経過措置を決める
- [ ] **npm audit の @grpc/grpc-js（high 4 件）を firebase の更新時に確かめ直す**（security L2。サーバー側の依存でバンドルには入らない＝受け入れ中）
- [ ] **ユーザーはアプリの招待からだけ作る**（security L3）: Console で大文字を含むメールのユーザーを作ると招待（小文字の ID）を受け取れない。運用手順に書く（例外は最初の管理者。設計書 §2.5 の手順で小文字のメールで作る）
- [ ] **保存期間・削除の方針**（承認の記録・アカウント・回答をいつまで持つか）: **LEGAL REVIEW REQUIRED**。決まるまで C に出さない

## 既知の制限（live）

- プロジェクトの一覧は更新の新しい順に最大 500 件（`src/live/repositories.tsx` の `LIST_LIMIT`）。超えると古い案件が一覧に出ない。件数が近づいたらページングを入れる
- 開発者の一覧の並び（`memberUids` array-contains ＋ `updatedAt` desc）は `firestore.indexes.json` の複合 Index が要る（定義済み。エミュレータは Index を要求しないため、本番で `firestore:indexes` を先にデプロイして確かめる）
- 書き込み待ちのタイマーは LiveDataProvider のアンマウント（ログアウト）で片付けていない。ログアウト直前の入力は permission-denied で失われうる（re-review 2026-11-12 Minor。0.28.1 より前から）
- オフラインでログインすると読み込み中のまま止まり、案内が出ない（`src/live/auth.tsx` の fromCache 待ち。live は接続が前提）
- 自動テストが無い: `scripts/deploy-firebase.mjs` の `checkHostingBuild`・`parseTestCounts`（127.0.0.1 の検査は assets/*.js だけ）／「別の画面で予約した書き込みも saveNow が待つ」（エミュレータで手動確認のみ）
- Auth の「ユーザー アクション」: 作成（登録）を許可は 0.46.0 の functions をデプロイして通しを確かめた後に OFF にする（上の「招待のアカウント作成を Cloud Functions へ移す」）。**削除を許可 ON**（本人が SDK から Auth アカウントを消せる。`accounts`・承認の記録は残る）は、削除依頼の手順（設計書 §17.2）と合わせて OFF にするかを決める
