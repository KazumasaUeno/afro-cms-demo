# 実装後セキュリティ監査: live のスケジュール＋WBS（XL）

- 日付: 2026-11-27 ／ 担当: security-engineer（読み取り＋Rules テスト 1 回の実行のみ。コード未変更）
- 対象: `feat/live-schedule` @dda7702（差分の基準 1a3aba9。48 ファイル +3967/-425）
- 照合: `2026-11-27-live-schedule-threat-model.md`（S-1〜16・ST-01〜24）、`2026-11-27-live-schedule-plan-review-security.md`（H-1・M-1〜4・L-1〜5）、`docs/design/LIVE_SCHEDULE_PLAN.md` §1（L-1〜L-23。受容 L-15・L-16）
- **判定: APPROVE WITH CONDITIONS**（BLOCKER 0・HIGH 0・MEDIUM 0・LOW 3）。条件は §4（リリース時の確認）。LOW は任意

## 1. 結論の根拠（[FACT]。firestore.rules の行は dda7702）

| 条件 | 結果 | 根拠 |
|---|---|---|
| S-1 / L-2 読み取り | current のお客様 get は `clientOf && resource.data.revision >= 1`。internal はお客様の分岐なし。list なし・delete false | firestore.rules:506-512 |
| S-2 / S-4 社内値の隔離 | current の create は hasOnly `schemaVersion,revision,editSeq,wbs,updatedAt,updatedBy`、update は 2 分岐とも `ch.hasOnly` で閉じる。wbs 行は `start,end,doneAt` だけ（doneBy なし）。担当名・メモ・保存者・marks は internal だけ | firestore.rules:618-666,675-685,696-700 |
| 画面側の隔離 | お客様は internal を購読しない（`readInternal = … && !client`）、current は `revision >= 1` のときだけ。ポータルは `clientScheduleView` からだけ組み、`internal: null` を渡す | src/live/repositories.tsx:300-311 / src/live/pages/LivePortalSchedulePage.tsx:44 / src/live/portalSchedule.ts:15-27 |
| S-3 / ST-05 要約 | 要約の releaseDate は submit の分岐だけで、`getAfter(current).releaseDate` と等式。init・withdraw・reopen は status だけ | firestore.rules:720-734 |
| S-5 / L-17 アーカイブ | `schedGate(p, pa)` が事前・事後の archived と要件 approved を全書き込みに課す（要約は ch に archived を含めない） | firestore.rules:608 |
| S-6 / S-7 kind と ID | `apprCreateOk` は kind で先に分岐、未知は false。`actorOk` は `actorBase && kind=='requirements'` の同値分解。schedule は `aid == 'schedule-r'+rev+'-'+act` | firestore.rules:320-326,525-532,596 |
| S-8 / S-9 承認 | お客様: side client・proxy/note 不可（hasOnly）・actorRole は 'client' のみ・要約側で approvedVia を持たない＋相互照合。代理: actorRole 'admin' 必須・proxy true・`schedNoteOk`・approvedVia 'proxy'・相互照合（actorUid 本人）。開発者に approve の分岐なし | firestore.rules:736-759,761-802 |
| S-10 / H-1 / L-18 表示した中身で承認 | Rules: 写しは事前の current と等式（wbs を含む。L-23 で wbs の写しを残す）。画面: `scheduleConflict(shown, …)` で editSeq・版が違えば送らず、写しは `shown.copy` | firestore.rules:610-612,794,801 / src/live/repositories.tsx:523-547 |
| S-11 / S-12 / L-8 note | withdraw・reopen とも note 必須・`reProxyNote && !reNoteControl`。reopen は approved→draft と同じ書き込みでだけ | firestore.rules:614,726-734,775-788 |
| S-13〜S-15 中身 | 日付は 2000〜2099 の YYYY-MM-DD・順序、rev ≤ 50、wbs は 6 キー固定、doneAt は不変／request.time／外す の 3 つで internal.marks と双方向照合。internal.note は `reChatControl` | firestore.rules:598-606,618-666,724 |
| S-16 / L-4 消失防止 | `validProject` に schedule を足し、作成時は禁止。既存の projUpdateOk・consultOk の `ch.hasOnly` に schedule は無い。editSeq +1 を current・internal で強制。Runbook に「段 0 が Rules の床・forward fix・Rules → Hosting を別実行」 | firestore.rules:207-221,361,276-290,434,694,712 / docs/operations/RUNBOOK_FIREBASE.md §6.1 |
| L-23 init | init の wbs は `validWbs(d.wbs, {}, {})` で doneAt を持てず、internal は marks を持てない | firestore.rules:680-683 |
| L-15 受容 | 差し戻し後の current がお客様に読めることをテストで固定 | tests/rules/schedule.test.mjs:401 |
| ST-24 / L-4 変異 | kind の振り分け・schedule-r 接頭辞・お客様の draft・internal・proxy・actorRole・事前／事後 archived・写しの等式・editSeq・要約の等式・ST-20 などの変異を mutation.test.mjs が検出（アンカーは schedule 側の式だけ＝M-1） | tests/rules/mutation.test.mjs:315-405 |
| CSV / XSS | 理由は操作の欄の途中に入り、さらに `csvCell` が先頭 `= + - @ TAB CR` に `'` を付ける。画面は React のテキストのみ（`dangerouslySetInnerHTML` の追加 0 件。差分を grep） | src/features/projects/approvalCsv.ts:15,21 / src/services/csv.ts:11-14 |
| シード | `demo-` 以外・127.0.0.1 以外に書かない。架空の会社・`client@example.com`。パスワードは環境変数で表示しない（console.log はメール・氏名（架空）・案件 ID・日付だけ） | scripts/seed-emulator-reqdoc.mjs:35-40,213-233 |
| ログ | 追加の console.warn は projectId と承認 ID だけ（メモ・理由・メールを出さない） | src/live/repositories.tsx（`schedule write denied`・`schedule approval already exists`） |
| Secret | 差分に鍵・トークンの追加なし（grep。値は読んでいない） | `git diff 1a3aba9..dda7702` |

## 2. 指摘

### LOW

**L-A [LOW] 依頼中の current の予定日の更新が「draft は依頼中に動かない」という不変条件に依存している — firestore.rules:698-700**
- 問題: 予定日の分岐は `pa.schedule.status == 'requested' && d.revision == pa.schedule.revision` だけで、事前の状態が draft であることを要求しない。依頼中（事前も事後も requested）に開発者が current だけを更新すると、この分岐に入る。いまは internal.draft が依頼中に変えられない（:715）ので、写す値は submit 時と同じで実害はない（ST-10 はテストで緑）
- シナリオ: 将来 internal.draft の編集条件を緩めると、依頼中に予定日を差し替えられる（お客様が見ている版と違う日付を承認させる＝T-05）
- 修正: 予定日の分岐に `&& p.schedule.status == 'draft'` を足す（式 1 つ。submit の経路は余裕 30% 以上＝L-23）。足さない場合は「schedIntUpdateOk の draft の条件を変えるときは :699 も見直す」を式の上にコメントで残す
- 防ぐ層: Rules

**L-B [LOW] 代理承認と同じ書き込みで、管理者が current.wbs も変えられる — firestore.rules:696-697,801**
- 問題: 代理承認の写しは事前の current（`get`）と等式。WBS の分岐は状態を問わないので、管理者は代理承認と同じバッチで WBS を変えられ、承認の記録の WBS と承認直後の current の WBS が食い違う。管理者は全権限（L-14）で、WBS は承認を要しない値（ユーザー決定）なので実害は小さい
- 修正（任意）: WBS の分岐に `&& pa.schedule.status == p.schedule.status`（状態が変わる書き込みに WBS を混ぜない）。式の余裕が足りなければ受容として PLAN §1 に一行残す
- 防ぐ層: Rules（または受容の記録）

**L-C [LOW] 承認の記録の actorName は CSV の「操作した人」の欄で先頭に来る** — 既存の `csvCell` が先頭の `=` 等を無害化しているので現状は問題なし（[FACT] src/services/csv.ts:12）。`toCsv` を経由しない書き出しを足すときは同じ関数を使うこと（記録のみ）

## 3. Plan Review の指摘の反映（[FACT]）

| 指摘 | 反映 |
|---|---|
| H-1 | 反映済み（L-18。`ScheduleShown{revision, editSeq, copy}`・TX 内の editSeq 照合・写しは shown.copy。Rules の写しの等式でも落ちる。ST-09 テスト schedule.test.mjs:503） |
| M-1 | 反映済み（`reqApprCreateOk` へ本体をそのまま移動、mutation のアンカーは schedule 側だけ） |
| M-2 | 非該当（L-23 で wbs の写しを残した） |
| M-3 | 受容 L-15 として記録・テストで固定 |
| M-4 | G1 の計測に init と同時保存を含める（L-23 で internal の同時保存は余裕 20% ちょうどを受容・回帰 assert） |
| L-1〜L-5 | 反映済み（事後 archived・updatedBy 受容 L-16・reChatControl・変異の列挙・既存分岐の後ろに追加） |

## 4. 条件（リリースまでに）

1. 本番 Console の Rules と main の `firestore.rules` のドリフト確認（Runbook §6.1 段 0 の前）— [UNKNOWN] リポジトリ外
2. 段 0 → 段 1 を Rules → Hosting の別実行で出し、段 0 のリリース ID を TODO に記録する
3. L-22（demo の差分確認の後に main へ merge）

## 5. 実行結果

- `npm run test:rules`（エミュレータ 8080/9099）: tests 1054 / pass 1054 / fail 0 / cancelled 0 / skipped 0（87 suites・443 秒・exit 0。2026-11-27 この監査で 1 回実行）

## 6. 未確認（[UNKNOWN]）

- 本番の Rules・IAM・Hosting の現物（リポジトリ外。§4-1）
- 別系統モデルレビュー（この監査では未実施）
- `2026-02-30` の Rules での拒否は L-23 / L-12 の結果どおり画面のみ（本監査では再計測していない）
