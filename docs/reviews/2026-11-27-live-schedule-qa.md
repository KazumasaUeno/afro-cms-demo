# 2026-11-27 スケジュール＋WBS（live）最終確認 — QA

- 対象: `feat/live-schedule` @ 7d235f8（origin/main 76a4c37 を含む）。本番には一切触れていない（デプロイなし・エミュレータ `demo-afro-cms` のみ）
- 環境: Windows 11 Pro 10.0.26200 / Node v22.14.0 / OpenJDK 21.0.12（JAVA_HOME）/ Chrome（拡張 Claude in Chrome・ヘッドレス Chrome）
- 担当: qa-engineer（プロダクションコードは変更していない）

## 1. 自動テスト・ビルド（クリーンな状態で実行）

| コマンド | 結果 | 件数（tests / pass / fail / skip） |
|---|---|---|
| `npm run test:rules` | exit 0 | **1055 / 1055 / 0 / 0**（約 453 秒。EADDRINUSE 0 件） |
| `npm run test:unit` | exit 0 | **209 / 209 / 0 / 0** |
| `npm --prefix functions ci` → `npm run test:functions` | exit 0 | **243 / 243 / 0 / 0** |
| `npm run typecheck` | exit 0 | — |
| `npm run build`（demo） | exit 0 | — |
| `npm run build:live` | exit 0 | — |
| `npm run ai:check` | exit 0 | `[gen-ai-shared] ok (6 files)` |

起動前に 4000/4400/5173/5180/8080/9099/5001/9150 の LISTEN が無いことを確認した。

## 2. エミュレータでの画面確認（L1 Focused E2E・手動）

手順: `npm run emulators` → `node scripts/seed-emulator.mjs` → `--set-password` → `node scripts/seed-emulator-reqdoc.mjs --with-dev --with-schedule --with-client`（パスワードは環境変数のテスト用の値。表示していない）→ `npx vite --mode emulator`（5180）。
admin は `localhost:5180`、お客様は `127.0.0.1:5180`（ログイン状態はタブごと）。対象は `projects/reqdoc-v3-approved`（admin は memberUids に入っていない＝担当外）。

| # | 操作 | 結果 |
|---|---|---|
| F1 | admin（担当外）: 承認依頼中の第 1 版を取り下げ。理由が空だと「取り下げる」は押せない → 理由を入れて取り下げ | PASS |
| F2 | admin: 公開予定日を 1/6 → 1/8 に変更して保存 | PASS（emulator の summary も `releaseDate 2027-01-08`） |
| F3 | admin: WBS「デザイン」に完了印を付けて WBS を保存 | PASS（「WBS を保存しました」） |
| F4 | admin: 承認を依頼（第 2 版） | PASS |
| F5 | お客様: `/portal/schedule` で予定日（1/8）・WBS が見える。メモ・担当は出ない | PASS |
| F6 | お客様: 構築の行に％を出さない（CR Major 1） | **FAIL** — 下記 D-1 |
| F7 | お客様: 確認・承認からスケジュールを承認 | PASS（`schedule-r2-approve`・actorRole client） |
| F8 | お客様の 2 つ目のタブ: タブ A の承認前に確認ダイアログを開いておき、A の承認後に「承認する」 | PASS（エラーではなく「スケジュールを承認しました」。コンソールに permission-denied なし） |
| F9 | 開発者（担当）: 承認済みの納品予定日を変更 → 再計画ダイアログ（理由が空だと押せない）→ 理由を入れて変更 | PASS（「予定日を変えました（再計画）」） |
| F10 | 開発者: 完了印を外して WBS を保存 → 承認を依頼（第 3 版） | PASS |
| F11 | お客様の承認の履歴に取り下げ・再計画の理由が出る | PASS（「理由：QA取り下げ理由A」「理由：QA再計画理由B」） |
| F12 | お客様の CSV に理由が出る（ダウンロードせず、ページ内で Blob を読んだ） | PASS（`スケジュールを再計画（理由：QA再計画理由B）` 等） |
| F13 | アーカイブ（emulator の REST・owner で `archived=true`）後: admin・開発者の `/schedule` は「見るだけ」の文言・押せるボタン 0・スライダー 0。お客様の「承認する」は disabled | PASS |
| F14 | approveAs の承認記録の読み取り（tx.get）が Rules で拒否されない | PASS — 画面・コンソールに拒否なし。Rules `approvals` の `allow get, list: if canRead(pid)`（firestore.rules:490、canRead に clientOf を含む :36） |

emulator / dev サーバーのログに error・denied は 0 件。

### D-1（Major・要修正）お客様のポータルで構築の行が「未着手 0%」

- [FACT] `/portal/schedule` の WBS で「全ページの構築 … 未着手 0%」と出る（admin 画面でも同じ表示。admin は構築タスクが読めるので 0% は正しい）
- [FACT] 原因: `useLiveWbsSource`（src/live/pages/LiveSchedulePage.tsx:55・65）はお客様のとき `useLiveTasks(null)` を呼ぶ。`useSnapshot` は key が null のとき `{ data: empty }`（src/live/useSnapshot.ts の snapshotView）、empty は `NO_TASKS = []`（src/live/repositories.tsx:138・151）。`taskList = tasks.error ? null : tasks.data` は `[]` になり、`wbsProgressLive(…, [], …)` は `percentUnknown` を付けない（単体テスト SU-08 も `[]` では undefined を期待）。f340560 の修正は `tasks === null` の経路にしか効かず、お客様では一度も通らない
- 単体テスト SU-08 は `wbsProgressLive(…, null, …)` を直接呼ぶため緑のまま（部品の「あいだ」が未検証）
- 差し戻し先: frontend（お客様のときは taskList を null にする等）。回帰テストは hook の配線（お客様→null）を含めること
- **修正（frontend-engineer）**: 判定を `wbsTaskListOf(afro, tasks)`（src/features/schedule/liveScheduleUi.ts）へ移し、`useLiveWbsSource` は `const taskList = wbsTaskListOf(afro, tasks);` にした。afro（admin・developer）でない人と読み取りの失敗は null、空配列では判定しない（アフロ側の 0 件は 0% のまま）。お客様の画面（/portal/schedule・案件詳細）は同じ hook を通る
- 回帰テスト（tests/unit/liveScheduleUi.test.mjs「wbsTaskListOf → liveWbsRows（配線。QA D-1）」）: お客様＋`{ data: [] }` → ％不明・後の行に完了印で 100%、アフロ＋0 件 → 0%、アフロ＋失敗 → ％不明、hook の式が `wbsTaskListOf(afro, tasks)` で `tasks.error ? null : tasks.data` に戻っていないことをソースで確認。test:unit 210/0/0、typecheck 0、build・build:live 成功。画面での再確認（/portal/schedule の表示）は未実施
- demo `/dev/schedule` 1280 幅の約 16px: **この修正とは無関係と判断（再現は未確認）**。WbsSection の origin/main との差分で幅に関わるのは、バーの塗りを `percentUnknown` のときだけ出さない 1 か所だけ（demo の行は percentUnknown を持たない）。注意の文言は `source` があるときだけ。図の幅は枠の `ResizeObserver` の contentRect から決まり（WbsSection.tsx:126-133）、約 16px は縦スクロールバーの幅と同じ。撮影の揺れという QA の仮説と合う

## 3. demo の見た目の同一性（branch vs origin/main）

- 方法: `git archive origin/main` をスクラッチへ展開して `npm run build`。両方を `vite preview`（4173＝branch / 4174＝main）で出し、使い捨てプロファイルのヘッドレス Chrome（CDP。prefers-reduced-motion、1280 と 390 幅）で同じ 34 画面ずつ（計 68 組）を撮って比較。p2〜p5 の各案件で詳細を開いてから `/schedule`・`/ai-studio/requirements`・`/site`・`/ai-studio/design`・`/quality`・`/release`（RequestApprovalButton の 7 画面）、ほかに `/portal/schedule`・`/portal/approvals`・`/projects/p1〜p5`・`/dev/projects/p3`・`/dev/schedule`
- 結果: 68 組すべてで **URL・本文テキスト（時刻を除く）・ページ高さが一致**、横スクロールなし。PNG がバイト一致 37 組、差 31 組
- 差の内訳（画素差の行の帯で確認）: 30 組は高さ約 10px の 1 行だけの帯の差＝seed の時刻（「14:02」と「14:03」、保存の時刻など。ビルドを別の時刻に読み込んだため）。目視でも p2 詳細は時刻以外同一
- **1 組だけ要確認**: `/dev/schedule` 1280 幅（Hidamari Dental）。ガントの横幅が branch は右端まで、main は右に約 16px の余白があり、バーと縦線が数 px ずれる。文字・高さは同じ。[UNKNOWN] ビルド差か、撮影時に縦長へ切り替えたときの幅の測り直し（スクロールバーの有無）による撮影の揺れか未切り分け。390 幅の同画面は 1 行（時刻）の差のみ

スクリーンショット（コミットしていない。スクラッチの一時ファイル）: `scratchpad/shots/{branch,main}_{1280,390}_{NN}_{route}.png`（68 組）、比較結果 `results.json`、画素差 `pngdiff.mjs`。

## 4. 未検証・未実施（UNVERIFIED）

- Claude in Chrome のスクリーンショットが取れなかった（`Cannot access a chrome-extension:// URL of different extension`）。エミュレータでの確認はページのテキスト・アクセシビリティツリー・Blob・emulator の REST で行い、画面の画像は無い
- 「admin が未作成の状態からスケジュールを作る」初回作成（init）は画面で通していない（seed が第 1 版を依頼済みで置くため、取り下げ→編集→再依頼で代替）。代理承認・2 タブ同時保存の競合文言・「内容が変わりました」（L-18）も画面では未実施（Rules / 単体テストのみ）
- アーカイブは画面の操作ではなく emulator REST（owner）で設定した
- F8 の 2 回目の押下が `scheduleApproveReplay` の経路を通ったかは、ログで確認していない（成功表示と承認記録 1 件のみ確認）
- ダークモード・320/768 幅・iOS 実機は未確認
- D-1 は未修正（QA はプロダクションコードを変更しない）

## 5. 後片付け

エミュレータ・emulator モードの dev サーバー・preview 2 本・ヘッドレス Chrome を停止。作成したタブを閉じた。
