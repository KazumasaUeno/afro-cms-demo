# コードレビュー: live スケジュール（feat/live-schedule dda7702。U3・U4・INT）

- 日付: 2026-11-27 ／ 担当: code-reviewer（実装者とは別）／ 判定: **Request changes（Major 1・Minor 4・Nit 1。Blocker 0）**
- レビュー時点の実行結果: test:rules 1054/0/0、test:unit 204/0/0
- 修正の判断は lead-architect（下表「対応」の判断は確定）。修正は frontend-engineer が 1 回でまとめて行った

## 確認したこと（問題なし）

| 観点 | 結果 |
|---|---|
| 書き込み 7 種（save / saveWbs / submit / withdraw / reopenAndSave / approve / proxyApprove）のキー集合 | firestore.rules の各 `hasOnly` / `affectedKeys` のキー集合と一致 |
| H-1（お客様に見せる写し） | お客様の画面は clientScheduleView の値（承認の記録の写しを含む）だけから組んでいる。下書き・メモ・担当・保存者・構築タスクを入れない |
| demo の同一性 | demo の画面の DOM 差分なし（`diff -w` で確認。live の分岐は source があるときだけ） |
| liveNoDemoStore | live の画面が DemoStore を import しない（単体テストで確認）。demo の bundle に `@/live/schedule` が入らない |

## 指摘と対応

| # | 重大度 | 指摘 | 対応 |
|---|---|---|---|
| 1 | Major | 構築タスクが読めない（お客様・tasks === null）とき、構築の行が常に「進行中 0%」（src/live/schedule.ts wbsProgressLive・WbsSection.tsx の状態の表示）。公開後も 0% に見える | **lead 判断**: 読めないときは構築の行に％とバーの塗りを出さない。後の行（制作の完了の承認・品質・公開）のどれかに完了印があれば構築は完了（100%）。構築タスクの写しは持たない。→ `wbsProgressLive` が `percentUnknown` を返し、WbsSection は％・塗り・aria の「実績 ○%」を出さない（demo は値を持たないので不変）。回帰テスト追加 |
| 2 | Minor | approveAs: 別タブで先に承認された後の二重押しが「いまは承認できる状態ではありません」になる | **lead 判断**: TX で status が approved かつ approvalId が `schedule-r${revision}-approve` なら、承認の記録の proxy が押した側（お客様／代理）と一致するか確かめ、一致すれば WARN を出して成功扱い。違えば「お客様がすでに承認しています」等。→ 純関数 `scheduleApproveReplay`・`scheduleApprovalIdOf` を追加しテスト |
| 3 | Minor | `liveStatusOf`（schedule.ts）が demo の `statusOf`（wbsProgress.ts）の複製 | **lead 判断**: `statusOf` を純関数として `@/data/schedule` へ移し両方から使う。→ wbsProgress.ts は再 export（demo の挙動は不変）。`liveStatusOf` は削除 |
| 4 | Minor | 依頼中に WBS を変えられるが、変えるとお客様の承認が版の競合になることが画面で分からない | **lead 判断**: WBS は依頼中も変えられるまま。アフロ側の画面で依頼中のとき「依頼中に WBS を変えると、お客様は画面を開き直してから承認することになります」を出す（live だけ。WbsSource.notice。demo の DOM は不変） |
| 5 | Nit | LiveSchedulePage.tsx `note.opened ?? -1`: null を -1 で代用して送っている | 開いた時点の版が number でない再計画は送らず、「スケジュールの記録を読み込めませんでした。画面を開き直してください」を出す |

## 修正後の実行結果

- test:unit 209/0/0（+5: 構築の％不明・後の行の完了・statusOf 共用・二重押しの判定・注意の文言）
- typecheck 0、build・build:live 成功、ai:check ok
- demo の build に live の文言・関数（注意の文言・scheduleApproveReplay）が入っていない（`grep` 0 件）
- 未検証: 画面の実表示（スクリーンショット）・エミュレータでの二重押しの通し。TX の中で承認の記録を読む経路は Rules の get（canRead）に依存し、ルールのテストは別担当が並行で更新中
