# Plan Review（security-engineer）: live のスケジュール＋WBS 実装計画（XL）— 第 1 往復

- 日付: 2026-11-27 ／ 担当: security-engineer（計画の作成者ではない。読み取りのみ。コード未変更）
- 対象: `docs/design/LIVE_SCHEDULE_PLAN.md`（636d346）。照合: `docs/reviews/2026-11-27-live-schedule-threat-model.md`（S-1〜16・ST-01〜24）、`docs/design/LIVE_SCHEDULE_WBS_DATA.md`、`firestore.rules`、`tests/rules/adminRights.test.mjs`・`tests/rules/mutation.test.mjs`、`src/live/proxyApproval.ts`
- **判定: APPROVE WITH CONDITIONS**（BLOCKER 0・HIGH 1・MEDIUM 4・LOW 5）。H-1 と M-1〜M-4 を計画へ反映してから U1/U2 の本実装へ進む（U1-0・U1-1 は M-1 の方針だけ先に決めれば着手可）

## 1. 確認した観点と結論

| 観点 | 結論 | 根拠 |
|---|---|---|
| S-1〜S-16 → Unit の割り当て | 全 16 件に Unit あり（§10.1）。S-10-5 の中身だけ不足（H-1） | PLAN:150-167 |
| ST-01〜24 → SR / テストファイル | 24 件すべて対応表にある（§10.2）。ST-24 の変異の列挙が不足（L-4） | PLAN:171-193 |
| L-2（current の get を `revision>=1`） | S-1 の意味は日付について保たれる。WBS は露出が増える（M-3） | DATA §3.1:131、PLAN:18 |
| L-4 editSeq（サーバー側の楽観ロック） | S-16-2 を満たす。採用でよい | PLAN:20 |
| L-5（updatedAt を動かす） | 安全上の差なし（`stamped()` が本人・時刻を強制。firestore.rules:44-45, 446-447）。受容 | — |
| L-8（withdraw の note 必須・制御文字拒否） | 脅威モデルより厳しい。要件定義書の withdraw（firestore.rules:563-566 `optStr` のみ）を変えない点も正しい | — |
| L-9（doneBy を internal.marks へ） | S-2 を満たす。両向きの照合（R-5）と ST-18 の片側拒否で閉じる | PLAN:25, 140 |
| Do-Not-Change | 要件定義書の承認経路はおおむね守られている。テキストのアンカーと評価順の保護が抜けている（M-1・L-5） | PLAN:71-82 |
| リリース段・Rollback | 安全。段 0 が `validProject` の床になり、段 1 から段 0 へ戻しても基本情報・アーカイブは落ちない（firestore.rules:207-218 の hasOnly 問題を段 0 で先に解消）。新 Hosting × 旧 Rules は kind で全拒否＝安全側 | PLAN:121-129 |
| G1 の代替案（WBS の写しを外す） | 条件つきで安全上の中立。条件は M-2 | PLAN:26, 39 |
| 既存の requirements 経路の式の余裕 | TEST-09 の既存 PATHS が 20% 以上の余裕を assert し続けるので回帰は検出される（adminRights.test.mjs:275-305） | L-5 |

## 2. 指摘

### HIGH

**H-1 [HIGH] S-10-5（表示した中身で承認する）が版番号だけになっている — PLAN:40（`approve(shownRevision)`・`proxyApprove(shownRevision, openedRequestedAt, note)`）、PLAN:200（SU-09 は revision だけ）**
- 問題: requested 中も WBS は編集できる（ST-10 で許可）。WBS の編集では `revision` も `requestedAt` も変わらない。そのため写しを TX 内で読み直した current から組むと、古い WBS を見ていたお客様／管理者の承認が Rules（写し == current）を**通ってしまう**。脅威モデル S-10-4（「古い画面の承認は失敗する＝安全側」）と S-10-5（「押した時点で読み直した値を使わない」）に反する
- 攻撃・事故のシナリオ: お客様が WBS を見ている間に担当が行を変える → お客様が承認 → 見ていない WBS への承認が証跡に残る（合意の対象がずれる＝T-05）
- 修正: hooks の引数を `approve(shown: {revision, editSeq})`・`proxyApprove(shown: {revision, editSeq, requestedAt}, note)` にする。TX 内で `current.editSeq !== shown.editSeq` のときは「内容が変わりました。最新を読み込みました」を出して送らない。写しは**表示に使った値**から組む（そうすれば Rules の等式でも落ちる）。SU-09 に「WBS だけ変わった（editSeq が違う）→ 承認しない」をお客様・代理の両方で追加する。G1 で wbs を写さない場合も editSeq の照合は残す（画面に出ていた WBS と食い違わないため）
- 防ぐ層: 画面（U2 の TX）。Rules は写しの等式（G1 で wbs を写す場合）

### MEDIUM

**M-1 [MEDIUM] 「mutation.test.mjs は追加だけ」「既存ファイルは無変更で緑」と U1-0 の書き換えがぶつかる — PLAN:48, 189 / tests/rules/mutation.test.mjs:21-27, 103-110, 286, 295-310**
- 問題: `mutate()` はアンカーが**ちょうど 1 件**でなければ throw する（mutation.test.mjs:23-24）。U1-0 で `apprCreateOk` を kind で先に分岐すると、m3DevApprove のアンカー `return (r == 'client' && a.projectId == pid && approveOk(pid, aid, a))`（:109）が崩れる。U1-2 で schedule の式に既存と同じ断片（` && d.proxy == true`・`&& l.side == 'client' && !l.keys().hasAny(['proxy'])`・` && !d.note.matches(reNoteControl())`・`|| (r == 'admin'\n`・` && d.get('actorRole', acc.role) == acc.role`）を書くと、アンカーが 2 件になり既存の変異テストが落ちる。そうなると「既存テストを書き換える」か「Rules を不自然に書く」かの二択になり、AC-14 の検証の意味が弱まる
- 修正: (a) U1-0 は既存の `apprCreateOk` の本体を**一字も変えずに** `reqApprCreateOk(pid, aid, a)` へ移し、`apprCreateOk` を `d.kind == 'requirements' ? reqApprCreateOk(...) : d.kind == 'schedule' ? schedApprOk(...) : false` にする（アンカーを保つ）。(b) 上の 5 断片と TEST-09 の関数名（`function ${fn}(`）を schedule 側で再利用しないことを U1 の条件に書く（共通の検査は `schedProxyFields(d)` などの別名の関数にする）。(c) それでも既存のアンカーを変える必要が出たら、変更してよいのは**アンカーの文字列だけ**（変異の意味は同じ）とし、差分をレビューで確認する、と §4 に明記する
- 防ぐ層: テスト（検出力の維持）

**M-2 [MEDIUM] G1 の代替案（wbs を写さない）の安全条件が不足している — PLAN:26, 39**
- 問題: 「定数 1 つで切り替え」とあるが、Rules と TS は定数を共有できない。Rules で `wbs` を任意キーのまま hasOnly に残し、等式だけ外すと、お客様／管理者が承認文書に**任意の wbs** を書けてしまう（お客様が読める証跡の偽造＝T-04/T-05）。また「承認の対象は予定日だけ」の明記を担当する Unit とテストが決まっていない
- 修正: 外す場合は schedule の approvals の submit/approve の `hasOnly` から `wbs` を**削除**する（任意として残さない）。ST-09 の代わりに「承認文書に wbs を付ける → 拒否」を追加する。明記の文言は U4（PortalApprovalPage・PortalSchedulePage）と U3（代理承認のダイアログ）と U2-0（履歴の文）に割り当て、§7 の画面確認に入れる。G1 の結論は U1 の Rules と U2 の書き込みの両方のテストで確認する（fixtures の `sched*Batch` が wbs を付けない形で成立する）
- 防ぐ層: Rules（hasOnly）＋画面

**M-3 [MEDIUM] L-2 の「新しい露出は無い」は WBS について事実ではない — PLAN:18 / DATA §3.2:142**
- 問題: current.wbs は**どの状態でも**更新できる（DATA §3.2:142）。差し戻し（withdraw）後で承認の履歴が無い案件では、画面は「未作成」と表示する（`clientScheduleView`）。ところが Rules は `revision>=1` なので、お客様は API で current を get でき、差し戻し後に入力中の WBS の日付・完了印を読める。この値は approvals のどこにも無い（再依頼前の値）。予定日 3 項目は submit でしか変わらないので S-1 の意味は保たれるが、WBS には及ばない
- 修正: 次のどちらかを §1 に [DECISION] として書く。(a) 受容する: WBS はユーザー決定で承認を要しない値で、承認済みのときもそのまま見えるので重大度は低い。理由をつけて受容リスクに記録し、ST-03 に「差し戻し後に WBS を変えた current はお客様に読める（受容）」を固定する。(b) 塞ぐ: draft 中（`proj.schedule.status=='draft'`）の WBS の編集は internal に下書きとして置き、submit で current へ写す。式が増えるので UK-2 と相談する。**推奨は (a)**（式を増やさない。日付の合意は予定日 3 項目が担う）
- 防ぐ層: 判断の記録（受容）またはデータ設計

**M-4 [MEDIUM] G1 の計測経路に init と internal を全部保存する経路が無い — PLAN:86-92**
- 問題: init（案件・current の create・internal の create の 3 文書。wbs 6 行・assignees 6 件・note 200 字・`savedByName == accounts.name` の get）と、予定日・担当・メモ・WBS を 1 回で保存する経路（current と internal の両方。editSeq・marks の照合つき）は、get と式の数が submit より多くなりうるのに計測対象に入っていない。超えると最初の保存が本番で全件失敗する（R-1 と同じ影響）
- 修正: §5 の表に「init（最大 payload）」と「current＋internal を同時に保存（wbs 6 行に完了印＋marks 5 件＋assignees 6 件＋note 200 字）」の 2 行を足し、TEST-09 の PATHS に入れる
- 防ぐ層: テスト（可用性）

### LOW

- **L-1 [LOW] S-5 の事後の archived** — DATA §3 の `gate` は事前状態の `proj.archived == false` だけ（DATA:125）。S-5 は `getAfter(projPath).archived == false` も要求する。current・internal・approvals の書き込みに事後の条件を足すか、事前だけで足りる理由（同じバッチでアーカイブと同時に書いても実害がない）を U1 の DATA §2 の反映に書く。ST-07 に「アーカイブと WBS の保存を同じバッチで送る」を 1 件足す
- **L-2 [LOW] current.updatedBy（uid）はお客様に見える** — `stamped()` は current に最後に保存した人の uid を残す。完了印の操作では doneBy と同じ情報になる。approvals の actorUid・actorName・actorEmail が既にお客様に見えているので（脅威モデル §6 Info）新しい種類の露出ではない。受容として §1 に一行残す（uid だけで名前は出さない）
- **L-3 [LOW] internal.note の制御文字** — DATA §2.3:100 は向きの制御だけを拒否する。S-15 は「改行を許すなら `reChatControl` 型」（firestore.rules:433。改行以外の C0 と DEL も拒否）。U1 で `reChatControl` を使うと明記し、ST-19 に C0（U+0001）入りを足す
- **L-4 [LOW] ST-24 の変異を列挙する** — PLAN:101 は「mutation 約 7」としか書いていない。最低限次を列挙して U1 の完了条件にする: kind の先分岐・`schedule-r` の接頭辞・current の `revision>=1`・internal にお客様の分岐が無い・proxy／actorRole の強制・事前と事後の archived・`getAfter(current)` との写しの等式・editSeq の +1・marks の照合（current→internal と internal→current）
- **L-5 [LOW] Do-Not-Change の補足** — §4 に `devTransition`・`reqUpdateOk`・`projUpdateOk` の既存分岐の**テキストと評価順**（新しい schedule の分岐は既存の分岐の後ろに足す）を加える。TEST-09 の既存 PATHS（adminRights.test.mjs:275-285）は書き換えずに 20% 以上の assert（:304）を緑のまま保つことを完了条件に入れる（新しい分岐で requirements の経路の式が増えても検出される）

## 3. 満たされていることを確認した主な点（[FACT]）

- 要件定義書の ID 接頭辞は `approvalId()` が `'requirements-r'` に固定している（firestore.rules:49）。schedule の分岐が `'schedule-r'` を強制すれば、ID の占有は双方向で止まる（S-7）
- requirements は approved から出る遷移が無い（`devTransition` は draft⇄analyzed だけ。firestore.rules:223-238）。S-5 のゲートが後から外れることは無い
- `projects` の update は `(stamped() && projUpdateOk) || consultOk`（firestore.rules:446-447）。schedule の分岐を projUpdateOk に入れれば stamped が強制される（L-5 の前提）
- `cleanProxyNote` は改行・タブを空白にし、Rules と同じ制御文字を除く（src/live/proxyApproval.ts:9-14）。withdraw・reopen の note に流用できる（L-8）
- `docs/DECISIONS.md` は存在しない（ls で確認）。計画の §1 を判断の正とする扱いは前回と同じ

## 4. 未確認（[UNKNOWN]）

- UK-1（別文書を get する読み取り条件でリスナーが切られるか）: L-2 は依存しないので判定に影響しない
- UK-2・UK-3: G1 で計測するまで未確認。H-1 と M-4 を反映した経路で計測すること
- `timestamp.date()` で暦日を検査できるか（S-14）: U1 の結果待ち。拒否できない場合は R-9 のとおり読み込み時に捨てる（SU-03）
- 実装後監査（S-1〜16 の全件・件数つき）・別系統モデルレビューは未実施（計画の段階のため）
