# TODO（afro-cms-demo）

> 未完了の作業と、既知の制限。終わったら行を消す（経緯は `docs/CHANGELOG.md`）。

## 段階 C（本番の Firebase プロジェクトを作って公開する）の前に必ず行う

出典: security re-audit 2026-11-12（APPROVED WITH CONDITIONS for B、C は未承認）／ code review 2026-11-12。作業の多くはユーザーの Google アカウントでの Console 操作。

- [ ] **App Check を有効にして enforce**（Firestore・Auth）。メール列挙（signUp の email-already-in-use。security L1）を受け入れる条件
- [ ] **Console の設定**（作業はユーザー。結果をここへ記録する）
  - [ ] Auth: メール列挙の保護 ON
  - [ ] Auth: 匿名ログイン OFF（メール／パスワード以外のプロバイダは OFF）
  - [ ] Auth: パスワードポリシー 8 文字以上（画面の検査と合わせる）
  - [ ] Auth: 承認済みドメインは `<projectId>.web.app`・`<projectId>.firebaseapp.com`（＋独自ドメイン）だけ。`localhost` を消す
  - [ ] Google Cloud: API キーを HTTP リファラー（上のドメイン。`localhost` なし）と API（Identity Toolkit / Token Service / Cloud Firestore）で制限
  - [ ] `scripts/firebase-projects.mjs` の `PRODUCTION_PROJECT_IDS` に本番 ID を入れる（`TBD` のままでは全デプロイ拒否。変更は lead-architect 確認）
- [ ] **パスワードと招待の方式を決める**（security M1 の恒久案）: いまは「招待の後、本人が同じメールで登録」。登録は招待の確認より前に開いているため、他人のメールで先に登録される余地がある（メールの確認が要るので乗っ取りには受信箱が要る）。招待時に再設定リンクを送る方式／メールリンクでのログインへ変えるかをユーザーと決める
- [ ] **0.28.0 で Rules から外した質問 ID**（`q-design-dislike`・`q-image`・`q-brand`）: これらの回答を持つ `requirements/current` があると、その文書の回答の更新が Rules で拒否されうる（`validAnswers` の `hasOnly`）。本番に live のデータを入れる前なら影響なし。入った後なら、移行（キーの削除）か Rules の経過措置を決める
- [ ] **npm audit の @grpc/grpc-js（high 4 件）を firebase の更新時に確かめ直す**（security L2。サーバー側の依存でバンドルには入らない＝受け入れ中）
- [ ] **ユーザーはアプリの招待からだけ作る**（security L3）: Console で大文字を含むメールのユーザーを作ると招待（小文字の ID）を受け取れない。運用手順に書く
- [ ] **保存期間・削除の方針**（承認の記録・アカウント・回答をいつまで持つか）: **LEGAL REVIEW REQUIRED**。決まるまで C に出さない

## 既知の制限（live）

- プロジェクトの一覧は更新の新しい順に最大 500 件（`src/live/repositories.tsx` の `LIST_LIMIT`）。超えると古い案件が一覧に出ない。件数が近づいたらページングを入れる
- 開発者の一覧の並び（`memberUids` array-contains ＋ `updatedAt` desc）は `firestore.indexes.json` の複合 Index が要る（定義済み。エミュレータは Index を要求しないため、本番で `firestore:indexes` を先にデプロイして確かめる）
- 書き込み待ちのタイマーは LiveDataProvider のアンマウント（ログアウト）で片付けていない。ログアウト直前の入力は permission-denied で失われうる（re-review 2026-11-12 Minor。0.28.1 より前から）
- オフラインでログインすると読み込み中のまま止まり、案内が出ない（`src/live/auth.tsx` の fromCache 待ち。live は接続が前提）
- 自動テストが無い: `scripts/deploy-firebase.mjs` の `checkHostingBuild`・`parseTestCounts`（127.0.0.1 の検査は assets/*.js だけ）／「別の画面で予約した書き込みも saveNow が待つ」（エミュレータで手動確認のみ）
- デザインスタジオの説明文が、サイトマップ未承認でも「承認済みサイトマップから」と書いている（`src/features/design/DesignStudioPage.tsx:141-142`。文言のみ）
