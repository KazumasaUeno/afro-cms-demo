# TODO（afro-cms-demo）

> 未完了の作業と、既知の制限。終わったら行を消す（経緯は `docs/CHANGELOG.md`）。

- [ ] **エミュレータの seed `reqdoc-v3-draft` の edited がサーバーの検証に通らない**（2026-11-28 reqdoc 修正の確認で判明。`points[1].evidence`）: 編集の保存がエミュレータで必ず拒否されるので、保存→再読み込みの確認ができない。seed を検証に合わせて直す（qa-engineer）。あわせて「?project= の URL で白い画面」（2026-11-27 本番）は再現せず UNVERIFIED（docs/reviews/2026-11-28-reqdoc-edit-freeze.md）
- [ ] **AI による改善提案＋現行サイト診断の設計案**（2026-11-20、未承認）: `docs/design/AI_REQUIREMENTS.md`。レビュー反映済み（改訂 1）→ ユーザー判断（同 §9 Q-1〜Q-7）→ 実装計画。それまで live の「サイトスコア（AI 推定）」は実測ではない（同 §0・Q-6）。`aiDrafts` の生出力を期限で消す仕組みは未実装（同 §7・Q-7。LEGAL REVIEW REQUIRED）
- [ ] **AI 下書きの「AI 設定が変わった」注記（画面設計 `docs/design/AI_REQUIREMENTS_UI.md` §2 状態 8・Q-U1）**: クライアントが今の `configHash` を知る手段（callable の返り値・公開の設定文書・ビルド時定数）が無いため、`aiDraftState.ts` は `configChanged` を常に false にしている（DEC lead 2026-11-24）。手段を決めたら `deriveAiDraftState` の `configHashNow` を使う
- [ ] **AI 下書きの `aiDrafts` の生出力を期限で消すバッチ**（設計 `docs/design/AI_REQUIREMENTS.md` §7・Q-7。案は承認から 90 日で `generated` を削除。**LEGAL REVIEW REQUIRED**・期間は未確定）: 定期実行の関数（Cloud Scheduler）は未実装。お客様公開（`AI_REQUIREMENTS_MODE=on`）は、これが実装済みか、ユーザーの書面での受け入れが `docs/legal/AI_REQUIREMENTS_LEGAL_CLEARANCE.md` にあるまで出さない（計画 §5 L-c）
- [ ] **AI 下書きの callable の App Check**: `requestRequirementsDraft`・`saveAiDraftEdits` も全体の `ENFORCE_APP_CHECK`（`functions/src/index.ts`。今は false）に従う。下の「App Check を有効にして enforce」と同時に true にする（お客様公開＝段 5 の前に済ませる）
- [ ] **要件定義書の「表示／編集」切り替えで編集が残ることの描画テスト**（review 2026-11-26 #8。`docs/reviews/2026-11-26-live-detail-and-reqdoc-polish.md`）: 今の `tests/unit/reqDocU4Review.test.mjs` はソースの正規表現だけ。描画テストの基盤（jsdom 等＝依存追加は lead 承認）を入れるときに「編集→表示→編集」で値が残ることを確かめる
- [ ] **代理承認の法的な有効性**（LEGAL REVIEW REQUIRED。2026-11-26 ユーザー決定で管理者がお客様の承認を代理で記録できる。`docs/design/ADMIN_FULL_RIGHTS_PLAN.md`）: 代理承認がお客様の同意の証明として有効か・契約や利用規約に代理の扱いを書くかは、法務の確認が要る（AI は結論を出さない）
- [ ] **担当の開発者が 0 人の案件では管理者も構築タスクを作れない**（同計画 L-5。担当者は memberUids の中だけ＝脅威モデル R-7）: 担当を足す画面ができたら解消
- [ ] **差し戻しの note に制御文字の検査が無い**（security 実装後監査 A-2 2026-11-26。`firestore.rules` submitOrWithdrawOk の `optStr(d,'note',0,200)`）: 代理承認の note と同じ reNoteControl を当てる（admin も書けるようになった）
- [ ] **代理承認だけの get/getAfter の参照回数（上限 20）を計測する**（同 A-3。推定 約 9 回）: 次に Rules を変えるとき
- [ ] **表示速度の実測（PageSpeed Insights 等）は v1 で見送り**（ユーザー 2026-11-20・設計 Q-3。新しい外部サービス＝ユーザー判断）。それまでサイト診断は基本チェックだけで、速度の数値を出さない
- [ ] **AI 下書きのクラウド作業（U5。未実施）**: `docs/operations/RUNBOOK_FIREBASE.md` §9.10 の G-0〜G-7 をユーザーの GO ごとに行い、§9.9 の Release Gate の出力を記録する（段 4 の前）

- [ ] **スケジュールの承認・代理承認が納期の合意に当たるか**（LEGAL REVIEW REQUIRED。`docs/design/LIVE_SCHEDULE_PLAN.md` R-8）: お客様の承認した納品予定日・公開予定日が請負の納期の合意と見なされるか、再計画（承認後の変更）の扱い、管理者の代理承認（上の「代理承認の法的な有効性」がスケジュールにも広がる）。AI は結論を出さない。PM が法務へ持ち込む
- [x] **スケジュールの Rules の床（段 0 のリリース ID）**: 段 0 の前の本番 = ruleset `e114b0ca-1b79-4deb-9157-78247081c4ce`（2026-11-26T08:12:52Z。main の firestore.rules と一致＝ドリフトなし、API で確認）。**床 = 段 0 ruleset `beb93e7b-0abd-4d29-9555-18bb03686c0a`（2026-11-28T07:44:31Z、eb7cbfd）**。段 1 = `d0649c16-3b5c-4791-8b31-dac2af4f25fc`（2026-11-28T08:21:50Z）。以後 Rules を beb93e7b より前へ戻さない
- [ ] **暦に無い日（2/30 など）は画面だけで止めている**（Rules は形式と年の範囲だけ。LIVE_SCHEDULE_PLAN L-12・R-9）。直接書かれた場合は読み込み時に捨てる。Rules で止めるかは式の上限（G1）の余裕と合わせて再判断
- [ ] **お客様のスケジュールの「全ページの構築」の行は進み具合が 0% のまま**（お客様は構築タスクを読めないため日付だけで状態を出す。src/live/schedule.ts wbsProgressLive）。demo はタスクの割合を出す。お客様に割合を見せるなら、件数だけを current に写すなどの設計が要る（ui-ux-designer・data-backend-architect）
- [ ] **WBS の保存が競合したあと、画面の下書きが古いまま残る**（QA O-2 2026-11-28・P3・修正前から）: 文言は「最新を読み込みました」だが、未保存の変更がある間は token が追従しない（src/features/schedule/WbsSection.tsx:161）ため、もう一度保存しても競合になる。データは安全（Rules と editSeq で拒否）。抜けるには「元に戻す」。競合時に下書きを最新へ置き換えるか、文言を「元に戻してからやり直してください」にするかは ui-ux-designer・frontend-engineer
- [ ] **スケジュールの完了印の解除の記録（Codex R002・LOW 受容 2026-11-28）**: firestore.rules markOk の undone 分岐は「更新前に完了していた」を確かめない（担当開発者・管理者が未完了の行に解除の記録を作れる。current の完了状態は変わらない）。Rules の式数に余裕ができたら、更新前の current の doneAt を確かめる（`docs/reviews/2026-11-28-live-schedule-cross-model-review.md`）。O-1: お客様の 320 幅で WBS の月ラベルが重なる（WbsSection.tsx の最初の月だけ年つき。main と同じ既存の P3。ui-ux-designer）
- [ ] **完了印の全履歴は残さない**（行ごとの最後の操作だけ。L-9）・**差し戻し後の WBS はお客様が API で読める**（受容。L-15）

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
      - 再試行（retry: true）の期間を過ぎても消せなかったときはログ `invite.revoke`・`status: error` に残る。ログのアラートを作り、保存期間の Runbook に「accounts の無い Auth アカウント（取り残し）の棚卸し」を足す（保存期間・削除の方針と合わせて）
    - [x] **0.47.0 のデプロイ（2026-11-20 済。ユーザー承認「全て進めて」）**: SA 作成＋3 役割、functions（retry 付きトリガーは非対話で `--force` が要る＝`deploy:firebase` は未対応のため firebase CLI を直接。事前の test:functions 20/20 はスクリプトで通過）、Eventarc 初回の権限伝播エラー→2.5 分後に再デプロイで成功、run.invoker は oninviterevoked だけ、hosting、invited 0 件（1 回読み取り）、rules（301/301）。本番確認: +test3 招待で provisionedUid＝Auth uid、取り消しでトリガーが Auth を削除（status deleted）。未確認: 本番での受け取り（Rules はエミュレータ 301 件で確認）
    - [ ] `deploy:firebase` に `--force`（retry 付きトリガーの非対話デプロイ）を通す口を足す
      1. SA を作る: Google Cloud Console → IAM → サービスアカウント →「作成」ID `afro-cms-functions`。**鍵（JSON キー）は作らない**。プロジェクトの役割: **Firebase Authentication 管理者**（roles/firebaseauth.admin）・**Cloud Datastore ユーザー**（roles/datastore.user）・**Eventarc イベント受信者**（roles/eventarc.eventReceiver。トリガーの配信）。デプロイする人にこの SA の「サービス アカウント ユーザー」（iam.serviceAccounts.actAs）
         - **Cloud Run 起動元**（roles/run.invoker）は**プロジェクト全体ではなく** `onInviteRevoked` の Cloud Run サービスだけに付ける（3 の functions のデプロイ後。Cloud Run → oninviterevoked → 権限）。[FACT] firebase-tools は run.invoker・eventReceiver を既定の compute SA にしか自動で付けない（firebase-tools 15.35 `lib/deploy/functions/checkIam.js:104-115`）。付ける前の取り消しイベントは配信に失敗する（再試行の期間内なら付けた後に通る）
      2. Firestore のロケーション: [FACT] afro-cms-4a6ff の (default) は asia-northeast1（2026-11-19 `firebase firestore:databases:get` で確認。`docs/design/DATA_RETENTION_DRAFT.md`）＝トリガーのリージョンと一致。Eventarc API が有効か（初回は権限の伝播待ちで失敗し、再デプロイで通ることがある）
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
- ログアウトの前の書き込み待ちの送信（0.47.4 で対応。`src/live/pendingWrites.ts`）: 画面の確認（ダイアログの 6 枚のスクショ）は未実施。ヘッダーのログアウト以外から signOut する経路（LiveLoginPage の未確認・招待なし）は LiveDataProvider の外なので対象外。保存に失敗した回答は PendingAnswers から外れる（settle）ため、ダイアログの「ログアウトしない」の後に「保存」を押しても同じ値は再送されない（0.47.4 より前からの挙動）
- demo の部品の多くが `useDemo()`（DemoStore）を直接呼ぶため、**live から import すると落ちる**（例: `src/components/layout/BuildFlowNav.tsx:15`・`src/features/sitemap/DevComment.tsx:37`・`SitemapPage.tsx:33`・`src/features/portal/PortalApprovalsPage.tsx:39`。0.47.4 と同じ型）。live で使う部品は View（props だけ）＋demo の入れ物に分けてから使う（サイトマップは `docs/design/LIVE_SITEMAP_IMPL_PLAN.md` P-13 で対応予定）。入口は `tests/unit/liveNoDemoStore.test.mjs` で検査する。他の demo 部品（デザイン・品質・リリース等）は未対応（2026-11-28 影響分析）
- オフラインでログインすると読み込み中のまま止まり、案内が出ない（`src/live/auth.tsx` の fromCache 待ち。live は接続が前提）
- 自動テストが無い: 「別の画面で予約した書き込みも saveNow が待つ」（エミュレータで手動確認のみ）
  - ~~`scripts/deploy-firebase.mjs` の `checkHostingBuild`・`parseTestCounts`~~ → 2026-11-24 `tests/rules/deploy-build.test.mjs`（14 件。`npm run test:rules` で実行。一時ディレクトリの偽 dist）で対応済み
  - 残る穴（テストで現状の挙動として確認。直すかは未決）: エミュレータ接続先の検査は `assets/` 直下の `*.js` だけ（`index.html`・`assets/` の下位フォルダ・`*.mjs`・ルートの `sw.js` は見ない）。文字列は `127.0.0.1:8080` / `:9099` / `:5001` の 3 つで、実際の `build:emulator` の成果物では Firestore（`` `127.0.0.1`,8080 ``）と Functions（`` `127.0.0.1`,5001 ``）は分かれて出るため、検出は Auth の `http://127.0.0.1:9099` 1 つに頼っている（`localhost:` や Storage 9199 も見ない）
- Auth の「ユーザー アクション」: 作成（登録）を許可は 0.46.0 の functions をデプロイして通しを確かめた後に OFF にする（上の「招待のアカウント作成を Cloud Functions へ移す」）。**削除を許可 ON**（本人が SDK から Auth アカウントを消せる。`accounts`・承認の記録は残る）は、削除依頼の手順（設計書 §17.2）と合わせて OFF にするかを決める
- [ ] **Anthropic API キーの期限 2027-11-20 15:00 JST**（キー名 `afro-cms-functions-3`（2026-11-20 に 2 本を漏えいのため削除し作り直し。Secret は v3 のみ有効）、Workspace `afro-cms`（個人の組織・地域 US・月 $20 上限）、2026-11-20 作成。連携済みアカウントは個人なので、組織を離れると無効になる）。期限の 1 か月前に作り直して `ANTHROPIC_API_KEY`（Secret Manager）を差し替え、関数をデプロイし直す。手順は `docs/operations/RUNBOOK_FIREBASE.md` §9.2

- [ ] test:functions の不安定（2026-11-25）: エミュレータが関数の定義を 60 秒で読み込めず（`User code failed to load ... Timeout after 60000`）、provisionInvitee 系 16 件が「Function a... is not valid JSON」で落ちることがある。デプロイ用スクリプトが止めるので本番には出ない（安全側）。再実行で通る。恒久対応の候補: test-functions.mjs で FUNCTIONS_DISCOVERY_TIMEOUT を延ばす／読み込み完了を待ってからテストを始める

## reqdoc（2026-11-26 セキュリティ確認 U3 より）

- [ ] T-02 aiDrafts の 90 日削除の実行者を作る（v3 は約 2〜3 倍の大きさ）。担当: backend-engineer。リリースの判断（機能フラグを開く）までに
- [ ] T-03 承認の一覧（approvals）の購読件数を絞る、`proposal`・`answers` を単一フィールド Index の除外にする（版ごとに約 275KB の写し）
