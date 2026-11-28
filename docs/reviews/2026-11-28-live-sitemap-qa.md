# 2026-11-28 サイトマップ（live）画面確認 — QA

- 対象: `feat/live-sitemap` @ b05ed4f（origin/main 2437b20 を含む）。エミュレータ `demo-afro-cms` のみ（本番・デプロイ・gcloud なし）。担当: qa-engineer（プロダクションコードは変更していない）
- 基準: `docs/design/LIVE_SITEMAP_PLAN.md` AC-01〜30 のうち画面で見るもの、`LIVE_SITEMAP_IMPL_PLAN.md` §7「emulator UI」の行（AC-04・AC-16・AC-27・X-6）
- 環境: Windows 11 Pro 10.0.26200 / Node v22.14.0 / JDK 21.0.12（JAVA_HOME）/ Vite（`--mode emulator`・5180）/ ヘッドレス Chrome 158（CDP・使い捨てプロファイル・ロールごとに別の browser context・reduced-motion）
- 自動テストは今回再実行していない（依頼時点の値: unit 272・rules 1236・functions 359。いずれも fail 0）

## 1. 手順

1. 起動前に 5180/4173/4174/8080/9099/5001/9150/4400/4500/9333 の LISTEN が 0 件であることを確認
2. `npm run emulators`（functions に `saveSitemapEdits`・`submitSitemap`・`requestSitemapDraft`・`generateSitemapDraftTask` が読み込まれたことをログで確認。`functions/.env.local` は `AI_SITEMAP_MODE=off`）
3. `FIRESTORE_EMULATOR_HOST`・`FIREBASE_AUTH_EMULATOR_HOST` を設定して `node scripts/seed-emulator.mjs` → `--set-password` → `node scripts/seed-emulator-reqdoc.mjs --with-dev --with-schedule --with-client --with-sitemap`（パスワードはスクラッチのファイルから環境変数へ渡し、表示していない）
4. emulator の REST（owner・127.0.0.1・demo- のみ）で `reqdoc-v3-approved` を写し、`qa-sm-new`（スケジュール承認済み・サイトマップなし）と `qa-sm-schedreq`（スケジュール承認依頼中・サイトマップなし）を作成
5. worktree 内の gitignore 済み `.env.emulator.local` に `VITE_FEATURE_AI_SITEMAP=on`（画面に AI ボタンを出すため。終了後に削除）→ `npx vite --mode emulator --port 5180`
6. demo の比較: `git archive origin/main` をスクラッチへ展開して `npm run build`、branch も `npm run build`。`vite preview` 4173（branch）/ 4174（main）

## 2. 結果

| # | 確認 | 結果 | 根拠 |
|---|---|---|---|
| Q1 | admin `/site`: サイトマップ未作成の案件で「AI で作る」を押す（サーバーは `AI_SITEMAP_MODE=off`） | **PASS** | 通知「この案件では AI での作成を使えません。手で作成してください」。`aiDrafts/sitemap` は 404（作られていない）。外部 AI は呼んでいない |
| Q2 | admin: 「手で作る」 | **PASS** | ログ `sitemap.edits op:createManual status:saved`。`sitemap/internal`（origin manual・editSeq 0）ができ、改善後の図にトップ 1 件。依頼ボタンは disabled＋「改善後の図にトップと1ページ以上を置いてください」 |
| Q3 | ページを追加: ページ名の検査 | **PASS** | 空→「ページ名を入力してください」、25 字→「24文字以内で入力してください」、パス `/`→「同じパスのページがすでにあります」。正しい値（理由あり）で追加→ editSeq 1 |
| Q4 | 選んだページの名前を 25 字にする | **PASS** | 右の欄に「24文字以内で入力してください」、依頼ボタン disabled＋「直す必要がある項目が1件あります」。サーバーは `label_too_long` で拒否（保存されない） |
| Q5 | **理由なしのページの追加・現在 Before の図へのページの追加** | **FAIL** | 下記 D-1。保存がすべて拒否され、再読み込みで追加したページが消える |
| Q6 | ページの削除・トップは削除できない | **PASS** | 削除後に editSeq +1・REST からも消える。トップを選ぶと削除ボタン disabled |
| Q7 | 開発担当者より（お客様へのコメント）を保存 → 再読み込み | **PASS** | REST `devComment.text` が入力値・editSeq +1。再読み込み後もページと comment が残る |
| Q8 | 依頼はスケジュール承認まで止まる（`qa-sm-schedreq`） | **PASS** | 依頼ボタン disabled＋「お客様がスケジュールを承認すると依頼できます」。案件詳細の制作の段も出ない |
| Q9 | AC-16 2 タブ競合（A=admin・B=開発者。B の保存要求を CDP の Fetch で止めている間に A が保存） | **PASS** | A 保存で editSeq 6→7。B を流すと「ほかの人が先に保存しました。最新を読み込みました」、REST は 7 のまま（B の値は書かれない）、B の画面は A の内容。B が編集していないときは A の保存がそのまま B に反映される（競合にならない） |
| Q10 | 開発者 `/dev/sitemap` から依頼 | **PASS** | 「お客様へサイトマップの承認を依頼しました」。要約 requested・revision 1・contentHash（64 hex）、`sitemapVersions/r1`・`sitemap-r1-submit` |
| Q11 | 依頼中は編集できない | **PASS** | 「お客様の承認待ちのため編集できません。直すときは依頼を取り下げてください」、ページを追加ボタンなし、「閲覧のみ」 |
| Q12 | 取り下げ（理由必須） | **PASS** | 空・空白だけでは「取り下げる」disabled。理由を入れて取り下げ → 要約 draft、`sitemap-r1-withdraw` の note と actorRole developer。編集できる状態に戻る |
| Q13 | AC-04 お客様 `/portal/approvals` のサイトマップ区画 | **PASS** | 依頼中の版だけ表示（「リニューアル後は 3 ページの構成です（新しく作るページ 1）」・ページ一覧・理由・開発担当者より）。図は「現在／リニューアル後」の切替（2 件／3 件） |
| Q14 | X-6 お客様が確認ダイアログを開いている間に admin が取り下げ → お客様が「承認する」 | **PASS** | 「いまは承認できる状態ではありません」。approve の記録は作られない。区画は「準備中」 |
| Q15 | AC-09 ダイアログを開いている間に 取り下げ→編集→再依頼（r2→r3）→ お客様が「承認する」 | **PASS** | 「内容が変わりました。最新を読み込みました」、`sitemap-r3-approve` は作られない。読み直した r3 で承認 →「サイトマップを承認しました」、要約 approved・approvedRevision 3 |
| Q16 | AC-11 承認後は閲覧だけ | **PASS** | admin「お客様が承認済みのため編集できません」・ページを追加なし・「下書きに戻す」だけ |
| Q17 | 再計画（下書きに戻す。理由必須） | **PASS** | 空・空白は disabled。理由で実行 → 要約 draft（approvedRevision 3 は残る）、`sitemap-r3-reopen` note あり。お客様には「アフロがサイトマップを調整しています…下は前回ご承認いただいた構成です」と r3 の構成 |
| Q18 | AC-10 admin の代理承認（理由必須） | **PASS** | 空で「代理で承認する」disabled。実行 →「サイトマップを代理で承認しました」。`sitemap-r4-approve`: side afro・proxy true・actorRole admin・note。要約 approvedVia proxy。admin・お客様とも「代理で承認済み」 |
| Q19 | お客様の承認の履歴 | **PASS** | 取り下げ・再計画の「理由：…」、代理の「代理の理由：…（確認の依頼と同じ人が代理で承認）」、版番号（第1〜4版）が出る（13 件） |
| Q20 | AC-28 開発者の案件詳細「次に必要な作業」 | **PASS** | スケジュール承認後の `qa-sm-new` で「サイトマップの承認を依頼する」 |
| Q21 | P-10 live の制作フローのナビ | **PASS** | admin・開発者とも 1〜3 は `<a>`（/ai-studio/requirements・/schedule・/site、dev は /dev/…）、「デザイン・構築」は `<span aria-disabled>`（リンクなし） |
| Q22 | AC-27 demo の見た目（branch vs origin/main。`/projects/p3`・`/site`・`/dev/sitemap`・`/portal/approvals` × 1280・390） | **PASS** | 8 組すべてでページ高さ・行数が一致、横はみ出し 0。`/portal/approvals` は PNG バイト一致（2 組）。残り 6 組の画素差は高さ約 10px の帯だけ（`/site`・`/dev/sitemap` 1 帯、`/projects/p3` 5 帯）＝本文の差分と同じ位置の seed の時刻（「10:36」と「10:37」、承認の履歴の秒）。時刻以外の本文は一致 |
| Q23 | 横はみ出し: admin `/site`・開発者 `/dev/sitemap` × 320/768/1280 × ダーク | **PASS** | `scrollWidth - clientWidth = 0`、スクロール領域の外でビューポートを出るボタン・入力・リンク 0 件 |
| Q24 | 横はみ出し: お客様 `/portal/approvals` 320 | **PASS（サイトマップ区画）／既存の別件あり** | 320 だけ 136px はみ出す。はみ出す要素はすべて「改善提案書」（`ProposalView`。このブランチで未変更）。下記 O-2 |
| Q25 | コンソール error / warning・例外 | **PASS** | 全 context で 0 件 |
| Q26 | emulator の拒否 | **PASS（想定どおりのみ）** | ログの rejected は D-1 の `invalid-argument`（after.reason / before.reason shape）と Q4 の `label_too_long` だけ。permission-denied なし |

## 3. 不具合

### D-1（High・要修正）理由の無いページを保存できない（現在の図には一切追加できない）

- 再現: admin `/site`（または `/dev/sitemap`）で下書きのサイトマップを開く →「ページを追加」→ ページ名・パスだけ入れて（改善理由は空のまま）「追加する」。現在 Before の図では理由欄が無いので必ず起きる。選んだページの改善理由を空にしたときも同じ
- 結果: 通知と注記「内容を確認してください（1件）」＋「もう一度保存」。押しても同じ。どの項目が悪いかは画面に出ない（画面側の検査は通っている）。再読み込みすると追加したページが消える。手で作った直後は現在の図が空なので、現在のサイトの構成を入れられない
- [FACT] emulator ログ: `sitemap.edits op:save status:rejected errorCode:invalid-argument field:after.reason code:shape`（Before では `before.reason`）
- [FACT] 原因: `addPage` が `reason: input.reason || undefined` を data に入れ（`src/features/sitemap/SitemapView.tsx:108`）、改善理由を空にしたときも `reason: undefined`（同 :207）。`toStoreNodes` は data をそのまま渡し（同 :21-22）、live の保存は before/after をそのまま callable へ送る（`src/live/repositories.tsx:676`）。Firebase の callable は `undefined` を `null` に変える（`node_modules/@firebase/functions/dist/esm/index.esm.js:41-43` `if (data == null) return null`）。サーバーの検査は `reason !== undefined` かつ文字列でなければ `shape`（`src/shared/ai/sitemapRules.ts:171-173`）
- demo は callable を通らないので起きない。単体テストは `undefined` のまま検査に渡すため緑（部品の「あいだ」＝callable の encode が未検証）
- 差し戻し先: frontend（live の保存の手前で `reason` が文字列でないキーを落とす等。demo の DOM は変えない）。回帰テストは「`undefined` を含む図 → callable と同じ encode（null）→ `validateSitemapDoc` が ok」を通すこと。あわせて、サーバーが返した `{field, count}` を画面の項目エラーに出すかは ui / frontend の判断

## 4. 見つけたこと（軽微・判断待ち）

- **O-1（P3）** 「手で作る」で作った直後（トップ 1 件だけ）にも「要件定義書の案から作成しました。…」の注記が出る（`createManual` も `sourceReqRevision` を入れる: `functions/src/sitemap/edits.ts:90`、表示は `src/live/pages/LiveSitemapPage.tsx:263`）。OQ-S7 の文言どおりだが、手で作った場合は事実と合わない。文言を分けるかは product / ui の判断
- **O-2（P3・既存）** お客様 `/portal/approvals` の幅 320 で「改善提案書」（`src/features/requirements/ProposalView.tsx`）のタブ等が約 136px はみ出す。このブランチで未変更のファイル。origin/main の live で同じかは未確認
- **O-3（設計どおり）** `VITE_FEATURE_AI_SITEMAP=on` のとき、AI の案内に「【下書きの文言】」の接頭辞が出る（`src/features/sitemap/liveSitemapUi.ts:122`。LEGAL Q-4 の結論まで表示する方針と同じ）

## 5. 未検証・未実施（UNVERIFIED）

- AI の実際の生成（生成中の表示・成功・失敗後の「もう一度 AI で作る」・AI で作り直す確認・「AI提案」の印）。サーバーが `AI_SITEMAP_MODE=off` のため、確認できたのは依頼が拒否される経路（Q1）だけ。外部 AI は呼んでいない
- `VITE_FEATURE_AI_SITEMAP` 未設定（既定 off）のときの画面（AI ボタンが出ないこと）は画面では見ていない（単体テストのみ）
- ライトテーマ: ヘッドレスでは色の指定なしでも `data-theme=dark` になり、ライトの画面は確認できていない（ダークのみ確認）
- アーカイブ中の画面・担当外の開発者／未ログインの画面・開発者による代理承認・お客様の CSV の中身は画面で未確認（Rules / functions / 単体テストのみ）
- AC-17（1 秒以上まとめる・ドラッグ中は書かない）の書き込み回数は数えていない。ドラッグ操作・接続の操作は未実施
- 2 タブ競合は CDP で一方の保存要求を止めて作った（実際の同時押しではない）
- iOS 実機・キーボードだけの操作は未確認
- D-1 は未修正（QA はプロダクションコードを変更しない）

スクリーンショット（コミットしていない。スクラッチの一時ファイル）: `scratchpad/smqa/shots/`（demo_{br,main}_{1280,390}_*・live_{admin,dev,client}_{light,dark}_{320,768,1280}・s3〜s15 の各段階・s20_client_320）

## 6. 後片付け

Vite（5180）・preview 2 本（4173/4174）・エミュレータ（java・node）・ヘッドレス Chrome（9333）を停止し、上記ポートの LISTEN 0 件・java 0 件・使い捨てプロファイルの chrome 0 件を確認した。`.env.emulator.local` は削除（`git status` クリーン）。emulator のデータは保存していない。

## 再確認 (d97a9db)

- 対象: `feat/live-sitemap` @ d97a9db。エミュレータ `demo-afro-cms` のみ（本番・デプロイ・gcloud なし）。担当: qa-engineer（プロダクションコードは変更していない）
- 環境・手順: §1 と同じ（Windows 11 / Node v22.14.0 / JDK 21.0.12 / Vite `--mode emulator` 5180 / ヘッドレス Chrome 158・CDP 9333）。起動前に該当ポートの LISTEN 0 件を確認。seed は `--with-sitemap` 付き、`qa-sm-new`・`qa-sm-schedreq` を同じ手順で作成。`functions/.env.local` は `AI_SITEMAP_MODE=off`。今回は `.env.emulator.local` を作っていない（AI ボタンは出ない設定）
- 自動テストは今回再実行していない

| # | 確認 | 結果 | 根拠 |
|---|---|---|---|
| R1 | D-1 改善後 After: 理由なしでページを追加／選んだページの改善理由を空にする → 再読み込み | **PASS** | `qa-sm-new`（手で作成）で editSeq 0→1→3、REST の after に `QA理由なし`・`QA理由あり`（reason なし）。再読み込み後も 3 ページ |
| R2 | D-1 現在 Before（トップがある図）: ページを追加（理由欄なし）・ページ名を編集 → 再読み込み | **PASS** | `reqdoc-v3-approved` を取り下げてから。editSeq 1→2→3、REST before `トップ,製品一覧改,QA現在追加`。再読み込み後も同じ |
| R3 | D-1 現在 Before（**手で作った直後の空の図**）: ページを追加 | **FAIL** | 下記 D-1b。保存 3 回とも拒否、再読み込みで消える |
| R4 | Major: 保存要求 1 件を CDP `Fetch.failRequest` で失敗させ、そのまま編集を続ける | **PASS（文言に軽微あり）** | 失敗時は注記「もう一度保存」。続けて 2 ページ追加 → editSeq 3→5（ログ saved 4・5）、REST・画面・再読み込み後とも失敗時のページを含む 6 ページ。「ほかの人」の表示なし。失敗時の文言は下記 O-4 |
| R5 | O-1 手で作った直後 | **PASS** | 「要件定義書の案から作成しました」が出ない |
| R6 | 同じタブで admin 編集 → ログアウト → 開発者でログイン（再読み込みなし・同じ document）→ 編集 → ログアウト → admin で再ログイン → 編集 | **PASS** | editSeq 5→7（admin）→9（dev）→10（admin）。競合の表示なし、REST に全員の追加が残る |
| R7 | 回帰: 2 タブ競合（s9b と同じ手順） | **PASS** | A 保存 10→11、B は「ほかの人が先に保存しました。最新を読み込みました」、REST は 11 のまま・B の画面は A の内容。ログの rejected は `aborted/conflict` 1 件 |
| R8 | 回帰: 開発者が依頼 → お客様が承認（`reqdoc-v3-approved`） | **PASS** | 「お客様へサイトマップの承認を依頼しました」revision 2・requested → お客様の現在の図に `製品一覧改,QA現在追加` → 「サイトマップを承認しました」approved・approvedRevision 2・`sitemap-r2-approve` |
| R9 | コンソール error / warning・例外 | **PASS** | 全 context 0 件。emulator ログの rejected は R3 の `home_count` 3 件と R7 の conflict 1 件だけ（permission-denied なし） |

### D-1b（High・要修正）手で作ったサイトマップの現在 Before の図にページを追加できない

- 再現: サイトマップ未作成の案件で「手で作る」→「現在 Before」→「ページを追加」（例: 「現トップ」`/`）→ 追加。注記「内容を確認してください（1件）」＋「もう一度保存」、押しても同じ。再読み込みで消える
- [FACT] emulator ログ: `sitemap.edits op:save status:rejected errorCode:invalid-argument field:before.nodes code:home_count count:1`
- [FACT] 原因: 手で作ると before は空（`functions/src/sitemap/edits.ts:27` は after にだけトップを置く）。サーバーは空でない図にトップ（kind home）がちょうど 1 件あることを求める（`src/shared/ai/sitemapRules.ts:183`）。追加ダイアログの種類は `['page','section','new','cta']` で home を選べない（`src/features/sitemap/AddPageDialog.tsx:25`）。したがって空の Before にはどう追加しても通らない
- 初回 D-1 の「現在の図には一切追加できない」のうち、reason の null 化は直ったが、この経路が残っていた（初回は原因を reason だけと書いていた）
- 差し戻し先: frontend / backend（手で作るときに before にもトップを置く、空の Before の最初のページを home にする、等。どれにするかは実装側と ui の判断）。回帰テストは「createManual 直後の doc に Before のページを 1 件足して `validateSitemapDoc` が ok」

### O-4（P3）保存の通信失敗時に内部の文言が出る

- R4 の失敗時、通知と注記が「internal [0]」（Firebase のエラーコードがそのまま）。次の保存が成功すると消える。利用者向けの文言（例: 保存できませんでした）にするかは ui / frontend の判断

### 未検証

- Major の失敗は CDP でネットワーク失敗にしたもの 1 種類だけ（サーバーの 500・タイムアウトは未実施）
- ライトテーマ・幅別の見た目・AI 経路は今回見ていない

### 後片付け

Vite・エミュレータ・ヘッドレス Chrome を停止し、5180/9333/8080/9099/5001/4400/4500/9150/4000 の LISTEN 0 件・java 0 件を確認。emulator のデータは保存していない。`git status` は本ファイルのみ。

## 再確認 2 (3dbf2ce)

- 対象: `feat/live-sitemap` @ 3dbf2ce。エミュレータ `demo-afro-cms` のみ（本番・デプロイ・gcloud なし）。担当: qa-engineer（プロダクションコードは変更していない）
- 環境・手順: §1 と同じ（Windows 11 / Node v22.14.0 / Vite `--mode emulator` 5180 / ヘッドレス Chrome 158・CDP 9333・使い捨てプロファイル）。起動前に該当ポートの LISTEN 0 件を確認。functions の読み込み（`saveSitemapEdits` 等 9 本）をログで確認。seed は `--with-sitemap` 付き、`qa-sm-new`・`qa-sm-schedreq` を同じ手順で作成。`functions/.env.local` は `AI_SITEMAP_MODE=off`。`.env.emulator.local` は作っていない
- 自動テストは今回再実行していない

| # | 確認 | 結果 | 根拠 |
|---|---|---|---|
| R2-1 | D-1b: `qa-sm-new` で「手で作る」→「現在 Before」（空）→ ページを追加 → もう 1 件 → 再読み込み | **PASS** | Before は 0 件。1 件目の「種類」はトップだけ＋「最初のページはトップになります（トップは図に 1 件）」。「現トップ」`/` を追加 → editSeq 2・REST before `現トップ:home`。2 件目は種類 4 つ（ページ・セクション・新設・CTA）、「現会社案内」→ editSeq 3・before `現トップ:home,現会社案内:page`。再読み込み後も 2 件 |
| R2-2 | P1: 選んだページの名前を変えて同じタスク内（17.6ms）で Before/After を切り替える | **PASS** | editSeq 3→4、REST after `改会社案内A` |
| R2-3 | P1: 名前を変えて同じタスク内（13.4ms）で画面を離れる（`/projects` へ SPA 遷移） | **PASS** | editSeq 4→5、REST before `改現会社B`。開き直すと Before・After とも変更が残る |
| R2-4 | P1: 名前を変えて同じタスク内（27.8ms）で「承認を依頼する」（開発者） | **PASS** | 「お客様へサイトマップの承認を依頼しました」。editSeq 11→12、requested・revision 1、`sitemapVersions/r1` の after に `QA依頼直前`（変更前の名前は無い） |
| R2-5 | 他の人が保存した後に自分が編集（admin と開発者が別タブで交互に 4 回追加。再読み込みなし） | **PASS** | editSeq 5→6→7→8→9、両タブとも REST と同じ 6 ページ。「ほかの人」の表示・通知なし |
| R2-6 | O-4: 保存要求 1 件を CDP `Fetch.failRequest` で失敗させる → 続けて編集 | **PASS** | 通知・注記「保存できませんでした。接続を確かめて、もう一度お試しください」＋「もう一度保存」。「internal」の文言なし。次の追加で editSeq 9→10、失敗時のページも含めて保存。競合の表示なし |
| R2-7 | 回帰: 2 タブ競合（s9b と同じ手順） | **PASS** | A 保存 10→11、B は「ほかの人が先に保存しました。最新を読み込みました」、REST は 11 のまま・B の画面は A の内容 |
| R2-8 | 回帰: `reqdoc-v3-approved` を admin が取り下げ → ページ追加 → 開発者が依頼 → お客様が承認 | **PASS** | 取り下げ → editSeq 2 → revision 2・requested → お客様「サイトマップを承認しました」approved・approvedRevision 2。approvals `sitemap-r1-submit,r1-withdraw,r2-submit,r2-approve` |
| R2-9 | コンソール error・例外 / emulator の拒否 | **PASS（error 0）／warning あり** | error・例外は全 context 0 件。warning は R2-1 の 9 件（下記 O-5）だけ。ログは saved 14・submitted 2・rejected 1（R2-7 の `aborted`）、permission-denied 0 |

### O-5（P3）ページの追加ダイアログで MUI の warning（種類の値が選択肢に無い）

- R2-1 で `MUI: You have provided an out-of-range value \`new\` … available values are \`home\``（3 件）と、トップを追加した後の `out-of-range value \`home\` … \`page\`, \`section\`, \`new\`, \`cta\``（6 件）
- [INFERENCE] `AddPageDialog.tsx:30` の初期値 `kind: 'new'` と、開いたときに effect で入れる既定（同 :35）のあいだの描画で、選択肢（同 :67、`addPageKindOptions`）と値が食い違っている。保存される値は正しい（REST で home / page）。描画中に既定を合わせるかは frontend の判断

### 未検証

- 通信失敗は CDP のネットワーク失敗 1 種類だけ（500・タイムアウト・応答の消失は未実施。「応答の消失後の確認」の経路は画面では見ていない）
- 失敗の通知が次の保存の成功後に消えるかは数えていない（次の追加の直後もしばらく通知が残っていた）
- ログアウト時の flush、AI の lease 切れ、AI へ送るパスの伏せ字は画面で未確認（単体テストのみ）
- ライトテーマ・幅別の見た目は今回見ていない

### 後片付け

Vite・エミュレータ・ヘッドレス Chrome を停止し、5180/9333/8080/9099/5001/4400/4500/9150/4000 の LISTEN 0 件・java 0 件・使い捨てプロファイルの chrome 0 件を確認。emulator のデータは保存していない。
