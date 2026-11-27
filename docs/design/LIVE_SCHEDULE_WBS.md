# REQ-LIVE-SCHED-01: live（本番）のスケジュール（予定日）＋ WBS とお客様承認 — 詳細要件

| Version / Status | リスク | 関連 | 最終更新 |
|---|---|---|---|
| 0.1 / DRAFT（Requirement Review 前） | **HIGH〜CRITICAL**（認可・承認の証跡・代理承認・Rules 変更・お客様へ見せる日付） | demo `src/data/schedule.ts`・`src/features/schedule/*`・`src/features/portal/PortalSchedulePage.tsx` ／ live `firestore.rules`・`src/live/model.ts`・`src/live/proxyApproval.ts` ／ `docs/design/ADMIN_FULL_RIGHTS_PLAN.md` ／ `docs/design/LIVE_DASHBOARD_TASKS_CONSULT.md` | 2026-11-27 |

> 設計資料（要件）のみ。コードは書かない。実現手段（文書の分け方・Rules の式・Index）は data-backend-architect / security-engineer / database-engineer が決める。本書の「推奨」は要件側からの候補。
> 確認した実物: origin/main（76a4c373）と同じコミットの worktree（`fix/req-status-label`。未コミット差分は schedule 系に無いと推定 [INFERENCE]）。

---

## 0. 確定済みのユーザー決定（2026-11-27。再確認しない）

| # | 決定 |
|---|---|
| U-1 | 範囲は **予定日（節目の日付）と WBS（作業の分解・担当・進捗）を一度に**入れる |
| U-2 | **お客様の承認が必要**。要件定義書と同じ型: 承認を依頼 → お客様がポータルで承認。**管理者は代理承認できる**（監査つき・`proxy=true`・理由 note 必須） |
| U-3 | 書ける人は **担当の開発者（memberUids）と管理者（全案件）**。管理者は開発者の全操作ができる |
| U-4 | **画面は demo と全く同じ**にする（承認済みデザイン。demo に無い要素は demo の部品の中へ） |

---

## 1. Goal

要件定義書の承認の後、アフロ側（担当開発者・管理者）が「制作〜公開」の予定日と作業ごとの予定（WBS）を入れ、お客様がポータルで確認・承認できるようにする。承認された日程が「いつ・誰が・どの日程に同意したか」の証跡として残ること。
出口: お客様が「いつ公開されるか」を自分で確認でき、アフロ側は遅れを一目で把握できる（demo の 3 枚のカード＋ガント）。

## 2. Actors と Permission Matrix

### 2.1 役割

| 役割 | 定義（`firestore.rules` の判定） |
|---|---|
| 管理者 | `roleOf == 'admin'`（全案件。アサイン不要。ADMIN_FULL_RIGHTS_PLAN L-1 と同じ別分岐） |
| 担当の開発者 | `roleOf == 'developer'` かつ `uid in projects/{pid}.memberUids`（社内・協力会社とも同じ [SAFE ASSUMPTION: 構築タスクと同じ扱い]） |
| 担当外の開発者 | developer だが memberUids に無い |
| お客様 | `roleOf == 'client'` かつ `accounts.projectId == pid` |
| 無効化・未確認 | `status != 'active'` / `email_verified != true` → すべて拒否（既存 `active()`） |

### 2.2 操作 × 役割（制御する場所: UI ＝出し分け、**Rules ＝正**。「ボタンが無いから安全」は不可）

| 操作 | 管理者 | 担当の開発者 | 担当外の開発者 | お客様 | 制御 |
|---|---|---|---|---|---|
| スケジュール・WBS を見る（社内向け） | 可 | 可 | **不可**（存在を漏らさない。画面は「見つかりません」） | 不可（社内向け文書は読めない） | Rules（get） |
| スケジュール・WBS を見る（お客様向け表示） | 可 | 可 | 不可 | **依頼中・承認済みのときだけ可**（§6） | Rules（get の条件に状態） |
| 予定日の入力・変更 | 可 | 可 | 不可 | 不可 | Rules（update） |
| WBS の入力・変更（日付・担当・完了） | 可 | 可 | 不可 | 不可 | Rules |
| メモ（社内向け）の入力 | 可 | 可 | 不可 | 不可（読めもしない） | Rules ＋ 文書を分ける（§5.2） |
| 承認を依頼 | 可 | 可 | 不可 | 不可 | Rules（approvals create ＋ 状態遷移） |
| 依頼を差し戻す（取り下げ） | 可 | 可 | 不可 | 不可 | Rules |
| 承認 | **代理のみ**（note 必須・proxy=true） | **不可** | 不可 | **可（本人のみ）** | Rules（相互照合。§4.3） |
| 承認後の再計画（予定日の変更） | 可 | 可 | 不可 | 不可 | Rules（NC-1 の結論による） |
| 削除 | 不可 | 不可 | 不可 | 不可 | Rules `allow delete: if false` |

### 2.3 アーカイブ済み案件

- [SAFE ASSUMPTION] アーカイブ中（`archived == true`）は**全員が読むだけ**（管理者も書けない。解除してから書く）。相談（consultOk）がアーカイブで止まるのと同じ扱い。お客様ポータルの表示は残す
- 画面: 編集の入口（カードの鉛筆・「予定日を入れる」・WBS のドラッグ・承認ボタン）を出さず、demo の「見るだけ」表示と同じにする（新しい要素を足さない）

## 3. Trigger / Preconditions / Postconditions

| 項目 | 内容 |
|---|---|
| Trigger | アフロ側がスケジュール画面で保存 ／ 承認を依頼 ／ お客様がポータルで承認 ／ 管理者が代理承認 |
| Preconditions | `projects/{pid}.requirements.status == 'approved'`（**要件定義書の承認前は作れない**。demo `reducer.ts:511` と同じ）。案件がアーカイブされていない。書き手が §2 で可 |
| 成立しない場合 | 承認前: demo と同じ空表示「スケジュールはまだありません（要件定義書の承認のあとに開発担当者が入れます）」、ポータルは「スケジュールは要件定義書の承認のあとにアフロがご用意します。」。Rules も拒否 |
| Postconditions | 保存 → 予定日・WBS が 1 か所（§5 の SoT）に残る。依頼・承認・差し戻し・代理承認 → `approvals` に追記のみの記録が 1 件増え、状態が遷移する |

## 4. 状態遷移

### 4.1 状態（スケジュール文書の `status`）

| 状態 | 意味 | お客様の見え方 |
|---|---|---|
| （文書なし） | 未入力 | 「アフロがご用意します」 |
| `draft` | 入力中（初回、または差し戻し・再計画の後） | 初回: 未入力と同じ。再計画中: **最後に承認された版**を表示（§6.2） |
| `requested` | お客様の承認待ち（第 N 版を依頼中） | 予定日・WBS ＋「このスケジュールの承認をお願いします。」＋「スケジュールを承認する」（demo `PortalSchedulePage.tsx:43-50`） |
| `approved` | 第 N 版をお客様が承認（または代理承認） | 予定日・WBS（見るだけ） |

`revision`（版）は依頼のたびに +1（要件定義書の `requirements.revision` と同じ考え方。承認の記録はこの版に結び付く）。

### 4.2 遷移可否表

| 遷移 | 可否 | 誰が | 条件 | 副作用（記録） |
|---|---|---|---|---|
| なし → draft（初回保存） | 可 | 管理者・担当開発者 | 要件定義書 承認済み、予定日の検査（§7.1）に合格 | `approvals` には書かない（下書き） |
| draft → draft（編集） | 可 | 同上 | 同上 | なし（`updatedAt/By` のみ） |
| draft → requested（承認を依頼） | 可 | 同上 | 予定日が保存済み。`revision+1` | `approvals/schedule-r{rev}-submit`（依頼した版の予定日の写しを持つ） |
| requested → draft（差し戻す＝依頼の取り下げ） | 可 | 同上 | — | `approvals/schedule-r{rev}-withdraw`（note 任意 0〜200） |
| requested → approved（承認） | 可 | **お客様本人** | 表示していた版 == 現在の版 | `approvals/schedule-r{rev}-approve`（side 'client'、proxy なし） |
| requested → approved（代理承認） | 可 | **管理者のみ** | 同上 ＋ note 必須（trim 後 1〜200、`proxyApproval.ts` と同じ文字の除去・拒否） | 同じ ID に side 'afro'・`proxy:true`・`actorRole:'admin'`・note。スケジュール文書に `approvedVia:'proxy'` |
| approved → draft（再計画） | **NC-1 次第**（推奨: 可） | 管理者・担当開発者 | 予定日（節目）を変えるとき | 推奨: `approvals/schedule-r{rev}-reopen`（理由 note 必須）。承認済みの記録は消さない |
| requested 中の予定日の変更 | **不可** | — | 先に「差し戻す」 | 承認の対象がすり替わるのを防ぐ（要件定義書の analyzed 中に回答を直せないのと同じ） |
| WBS（日付・担当・完了）の変更 | **どの状態でも可**（推奨。NC-1） | 管理者・担当開発者 | 予定日が保存済み | 状態は変えない（demo `reducer.ts:528`「WBS を変えても承認はやり直しにしない」） |
| 開発者が承認する／お客様が依頼・編集する | **不可** | — | — | Rules で拒否（テスト必須） |
| 削除 | **不可** | 全員 | — | — |

### 4.3 あり得ない組み合わせ（Rules とテストで止める）

- `status == 'approved'` なのに対応する `approvals/schedule-r{rev}-approve` が無い ／ 承認文書が `proxy:true` なのにスケジュール文書に `approvedVia` が無い（逆も）— 要件定義書と同じ**相互照合**（ADMIN_FULL_RIGHTS_PLAN §7-1）
- 承認文書の予定日の写し ≠ 承認時点のスケジュール文書の予定日（Rules の等式で一致を要求。要件定義書の `answers/proposal` の等式と同じ型）
- 要件定義書が `approved` 以外なのにスケジュール文書がある（live では要件定義書の approved は終端のため通常起きない。将来、要件定義書の再承認を作るときに C-06 として再検討）
- お客様の承認文書が `side:'afro'`、代理承認が `side:'client'`

## 5. Data Requirements（data-backend-architect への入力）

### 5.1 Source of Truth の整理（構築タスクとの重複を作らない）

| データ | 正（SoT） | WBS との関係 |
|---|---|---|
| 予定日（制作の完了予定・納品予定日・公開予定日） | 新規のスケジュール文書（§5.2） | WBS の ◆（節目）として描く |
| WBS の作業（**6 行固定**: サイトマップ／デザイン／全ページの構築／制作の完了の承認／品質チェック・納品検収／公開。demo `WBS_ITEMS`） | 同上（各行の開始・終了・担当名・（NC-2）完了） | 行の追加・削除・並べ替えはしない（demo どおり） |
| **構築タスク**（`projects/{pid}/tasks`） | 既存の tasks（唯一の正。LIVE_DASHBOARD_TASKS_CONSULT §2.1） | WBS は**タスクを持たない・写さない**。「全ページの構築」行の進捗は tasks から**毎回導く**（完了数／全数。demo `wbsProgress.ts:51-56`）。WBS 側にタスクの件数・状態を保存しない |
| WBS の進捗（%・状態） | **保存しない**（導出）。例外は NC-2 の「完了」印 | 状態（完了／進行中／未着手／遅れ）は 予定日・実績・今日 から導く（demo `statusOf`） |
| 案件の公開予定日 `projects.launchDate`（案件作成時の入力） | 既存（案件の基本情報） | **C-01**: スケジュールがあれば表示は `releaseDate` を優先、無ければ `launchDate`（demo `releaseDateOf`）。互いに書き写さない |
| 承認の証跡 | 既存 `projects/{pid}/approvals`（追記のみ） | kind に `schedule` を追加 |

> 「WBS ＝ 6 段階の予定表」「構築タスク ＝ 構築段階の中の作業カード」。担当開発者ごとの細かい作業は構築タスクで持ち、WBS へは件数の導出だけを出す。**WBS に自由な作業行を足す要件は今回入れない**（§13）。

### 5.2 項目（推奨の置き場所。最終は data-backend-architect）

**推奨: 2 文書に分ける**（理由: お客様が読める文書に社内向けの値を置くと Rules では隠せない。demo のポータルはメモ・保存者・担当・構築タスクを出さない＝`PortalSchedulePage.tsx:14`）

`projects/{pid}/schedule/current`（お客様も状態により読める）

| Field | Type | Required | 制約 | 分類 | 値の出所 |
|---|---|---|---|---|---|
| schemaVersion | number | ✓ | 1 | — | クライアント（Rules で固定） |
| status | 'draft' \| 'requested' \| 'approved' | ✓ | §4 の遷移のみ | INTERNAL | Rules が遷移を検査 |
| revision | number | ✓ | 依頼ごとに +1 のみ | INTERNAL | Rules が +1 を検査 |
| buildDue | string 'YYYY-MM-DD' | 任意 | ≦ deliveryDate | INTERNAL（お客様に表示） | 入力 |
| deliveryDate | string 'YYYY-MM-DD' | ✓ | ≦ releaseDate | 同上 | 入力 |
| releaseDate | string 'YYYY-MM-DD' | ✓ | — | 同上 | 入力 |
| wbs | 6 要素の list（id・start・end・（NC-2）doneAt） | 任意（無ければ導出） | id は固定 6 種・各 1 回、start ≦ end | 同上 | 入力 |
| approvedAt / approvedBy / approvalId / approvedVia | timestamp / uid / string / 'proxy' | approved のとき | 要件定義書と同じ形 | INTERNAL | Rules（request.time・auth.uid） |
| updatedAt / updatedBy | timestamp / uid | ✓ | stamped() | INTERNAL | サーバー時刻・auth |

`projects/{pid}/schedule/internal`（アフロ側だけ。お客様は読めない）

| Field | Type | 制約 | 分類 |
|---|---|---|---|
| note | string | trim 後 0〜200（demo `SCHEDULE_NOTE_MAX`） | CONFIDENTIAL（社内） |
| assignees | map WbsId → string | 各 0〜30 字（demo `WBS_ASSIGNEE_MAX`。**demo どおり自由入力の名前**） | PERSONAL（氏名）・社内のみ |
| savedByName | string | 表示「保存済み 日時・名前」用（accounts の name） | PERSONAL・社内のみ |
| updatedAt / updatedBy | — | — | — |

- **Delete Behavior: Retain**（案件と同じく消さない。`allow delete: if false`）。保持期間は案件と同じ（DATA_RETENTION_DRAFT の決定に従う。それまで消さない）
- 文書の大きさ: 1 KB 未満 [INFERENCE]。WBS は 6 行固定のため増えない
- **Unique / Idempotency の要件**: 承認・依頼・取り下げの記録は「同じ版に同じ操作が 2 件できてはならない」（推奨: 決定的 ID `schedule-r{rev}-{action}` で create のみ。要件定義書と同じ型）。再計画（reopen）も版ごとに 1 件
- **既存データの移行: なし**（新規文書は空から。文書が無い＝未入力として読む）。WBS 未保存は demo `wbsOf` と同じく予定日から初期値を導き、保存しない（初期値の開始日＝要件定義書の承認日の翌日）
- demo の localStorage のスケジュールは live へ移さない（架空データ。既存方針）

### 5.3 承認の記録（`projects/{pid}/approvals/{aid}`。既存コレクション）

- `kind: 'schedule'`、`action: 'submit' | 'withdraw' | 'approve' | 'reopen'`、`revision`、`side`、`actorUid/actorName/actorEmail/at`（既存 `actorOk` と同じ）、`actorRole`（管理者は必須）、代理は `proxy:true`・`note`
- submit / approve は**その版の予定日（＋推奨: WBS の日付）の写し**を持つ（承認の対象を後から証明するため）。担当名・メモは写さない（お客様が approvals を読めるため）
- **C-03 / C-04（既存コードへの波及）**: 既存 `actorOk` は `kind == 'requirements'` 固定（`firestore.rules:504`）、`approvalLogFrom` は対象を「要件定義（第N版）」固定（`model.ts:253`）、`approvalLogsFrom` は依頼者を **版番号だけ**で突き合わせる（`model.ts:264-266`）→ スケジュールの第 1 版と要件定義書の第 1 版が混ざり「依頼と代理承認が同じ人」の表示を誤る。**kind と版の組で突き合わせる**ことを要件とする

## 6. お客様ポータル

### 6.1 画面（demo と同じ）

| 画面 | 入力 | 表示 | 判断 | 状態 | 確認ゲート |
|---|---|---|---|---|---|
| スケジュール（demo `/portal/schedule` → live に新設） | なし | 予定日 3 枚（未設定は「調整中」・あと N 日）＋ WBS（バー・今日の線・◆。**担当・構築タスク・メモ・保存者は出さない**、「遅れ」は「調整中」と出す。demo `WbsSection` の client） | 承認するか | 未作成 ／ 依頼中（承認の案内） ／ 承認済み ／ 再計画中（§6.2） ／ アーカイブ | — |
| 確認・承認（既存 `/portal/approvals`。`#schedule`） | 承認ボタン | 依頼された版の予定日 | 承認 | 依頼なし ／ 依頼中 ／ 承認済み（日時・代理なら「アフロ（名前）が代理で承認：理由」） | 承認の確認（demo と同じ文言・部品） |
| 承認の履歴 | — | 依頼・取り下げ・承認・代理・再計画 | — | — | — |

- **C-05**: 既存 `PortalApprovalPage.tsx:44` の `section === 'schedule'` は要件定義書の中の「スケジュール」章（プレースホルダー。`LiveRequirementsPage.tsx:167-168`）。新しい承認対象のスケジュールと名前がぶつかる。要件: 要件定義書の章は「承認後に入力します」のまま残し、承認対象は別の区画にする（文言は demo の `approvalSteps` の schedule に合わせる）
- お客様はスケジュールを**差し戻せない**（demo に無い）。直してほしいときは相談（`/portal/chat`）で伝える [SAFE ASSUMPTION: demo どおり]
- お客様への通知（メール等）は無い（live に通知の仕組みが無い。ADMIN_FULL_RIGHTS_PLAN L-4 と同じ）。ポータルの表示とアフロからの連絡で知らせる

### 6.2 お客様が読める条件

- `status == 'requested' | 'approved'` のときだけ `schedule/current` を読める（下書きを見せない。要件定義書が依頼後の写しだけを見せるのと同じ考え方 `model.ts:151-152`）
- 再計画で `draft` に戻った間は、**最後に承認された版**（approvals の approve 文書の写し）を表示し、「調整中」の扱いにする [SAFE ASSUMPTION]。承認された版が無ければ未作成と同じ表示
- `schedule/internal` は読めない

## 7. Validation と境界

### 7.1 予定日（demo `validateSchedule` と同じ。画面と Rules の両方）

| 条件 | 期待 | 文言（demo） |
|---|---|---|
| 納品予定日・公開予定日が空 | 保存不可 | 「納品予定日を入れてください」「公開予定日を入れてください」 |
| 形式不正 | 保存不可 | 「日付の形式を確認してください」 |
| 制作の完了予定 > 納品予定日 | 保存不可 | 「納品予定日より前の日付にしてください」 |
| 納品予定日 > 公開予定日 | 保存不可 | 「納品予定日以降の日付にしてください」 |
| 同じ日（=） | **可** | — |
| メモ > 200 字 | 保存不可 | 「200文字以内で入力してください」 |
| 過去の日付 | **可**（進行中の案件の入れ直しのため）[SAFE ASSUMPTION: demo どおり] | — |
| 年の範囲 | [SAFE ASSUMPTION] 2000〜2099 年だけ受ける（ガントの描画が壊れる極端値を防ぐ） | 「日付の形式を確認してください」 |
| 公開予定日 < 案件の launchDate など | 止めない（C-01。表示は releaseDate 優先） | — |
| ◆のドラッグ | 隣の節目で止める（demo `moveMilestone`） | — |

- Rules で検査するもの: 形式（`^\d{4}-\d{2}-\d{2}$`）と順序（文字列比較）。**暦として存在しない日（2/30 等）は Rules では検査しにくい** → 画面で必ず検査、Rules は形式と順序 [INFERENCE: 実現手段は database-engineer]
- 値の出所: 日付はすべて**入力値**。承認・状態・版・時刻・承認者は**サーバーが記録した事実**（request.time / auth.uid / Rules の遷移検査）だけを正とする。画面が送る「承認済み」「版」を信用しない

### 7.2 WBS（demo `validateWbs` と同じ）

- 6 行がそろっていない・同じ行が 2 回 → 保存不可（Rules でも）
- 開始・終了が空／形式不正／開始 > 終了 → 保存不可（「開始日以降の日付にしてください」）。最短 1 日（開始 = 終了は可）
- 担当名 > 30 字 → 保存不可
- **WBS の行が予定日（◆）をはみ出す**（例: 品質チェックの終了 > 納品予定日）→ **止めない**（demo どおり）。[IMPORTANT OQ-1] 注意の表示を足すかは designer と PM（demo に無い要素のため今回は足さない）
- **空の WBS**: 予定日を保存する前は WBS を出さず demo の案内「上の予定日を保存すると、作業ごとの予定（WBS）が作られます。」。保存後で WBS 未保存なら初期値を表示（保存はしない）
- 予定日を変えても保存済みの WBS は残す（demo `reducer.ts:518-519`）

### 7.3 同時編集・競合

| 状況 | 期待 |
|---|---|
| 2 人が同時に開いて保存 | **後勝ちで黙って上書きしない**。保存は開いた時点の `updatedAt`（または版）と一致するときだけ成功（トランザクション）。不一致は「ほかの人が先に保存しました。最新を読み込みました」で最新を表示し、入力中の値は破棄の確認を出す（新しい要素は demo の toast・確認の部品で出す） |
| 依頼中にお客様が承認、同時にアフロ側が差し戻す | どちらか一方だけ成立（決定的 ID の create のみ＋状態の事前条件）。負けた側は「状態が変わりました」で再読込 |
| お客様が古い画面のまま承認 | 表示していた版 ≠ 現在の版なら拒否（`proxyVersionOk` と同じ型をお客様にも適用） |
| 管理者が代理承認のダイアログを開いた後に差し戻された | 拒否（同上） |
| 編集中に担当から外された・無効化された | 保存は Rules で拒否 → 「権限がありません」。入力値は画面に残す |
| 保存中に通信が切れた | 既存の書き込み待ち（pendingWrites）の扱いに合わせる。成功が確定するまで「保存しました」を出さない |

## 8. WBS の進捗（導出）

| 行 | live の実績の材料 | 状態 |
|---|---|---|
| 全ページの構築 | `tasks` の done 件数／全件（**既存の購読を共有**。WBS は書かない） | 導出 |
| サイトマップ／デザイン／制作の完了の承認／品質チェック・納品検収／公開 | **live にまだ機能が無い**（demo は各段階のデータから導く `wbsProgress.ts:49-66`） | **NC-2**（推奨: 担当開発者・管理者が行ごとに「完了」を付ける。付けた日時・人を残す。その段階が live にできたら導出へ切り替え、手入力の値は使わない） |

- 状態の導出は demo `statusOf` と同じ（完了 → 遅れ＝今日 > 終了で未完了 → 進行中 → 未着手）。「今日」は端末の日付（demo `todayYmd` と同じ）[SAFE ASSUMPTION。利用者は日本国内]
- お客様には「遅れ」を「調整中」と出す（demo）

## 9. 要件定義書の承認で開くもの・スケジュールの承認で開くもの

| 対象 | ゲート |
|---|---|
| スケジュールの作成・編集・依頼 | 要件定義書 `approved` の後だけ（UI ＋ Rules） |
| WBS の編集 | スケジュール（予定日）を保存した後だけ |
| 構築タスク（既存） | **今回ゲートを足さない**（推奨。NC-3）。demo の「入れるまで制作へ進めない」は live ではスケジュール画面の案内だけで示す |
| サイトマップ・デザイン等 | live に無い（範囲外） |

## 10. 監査・記録

- 依頼・取り下げ・承認・代理承認・再計画は `approvals` に**追記のみ**（update・delete は管理者を含め不可）。代理承認は お客様ポータル・管理者画面の両方で「代理」と明示し、依頼者と代理承認者が同じなら表示する（ADMIN_FULL_RIGHTS_PLAN §7-5 と同じ）
- 予定日・WBS の**下書きの変更ごとの履歴は残さない**（live にアクティビティ記録が無い。`updatedAt/By` のみ）[SAFE ASSUMPTION]。お客様に約束した内容は承認の写しで証明する
- ログ（Functions・コンソール）に担当名・メモを出さない

## 11. 非機能

| 項目 | 要件 |
|---|---|
| Read（開発者・管理者がスケジュールを開く） | 文書 2 件（current・internal）＋ 構築タスク（既存購読を共有。≦300）＋ 承認の履歴（既存の上限内） [TARGET] |
| Read（お客様） | 文書 1 件＋承認の履歴 |
| 一覧・ダッシュボード | **案件ごとにスケジュール文書を読まない**（N 件 Read 禁止）。一覧に段階・公開予定を出すなら案件文書の要約の写し（相談の `consult` と同じ型で、同じ書き込みでだけ変更可）にする → NC-4 |
| 書き込み | 保存 1 回 = 1〜2 Write ＋ Rules の get 2〜4 [INFERENCE] |
| Rules の式の上限（1 リクエスト 1000） | 代理承認・依頼（予定日の写しの等式つき）の最大ケースをエミュレータで計測して記録 |
| 一覧の上限 | WBS 6 行固定。承認の履歴は既存 `LIST_LIMIT` 500 以内 |
| 性能 | ガントの描画は demo と同じ（新しい依存を足さない） |
| アクセシビリティ | demo のキーボード操作（←→・Shift・Alt・Esc）を live でも同じに。WCAG 2.2 AA 目標 |
| 戻し方 | フロントは revert、Rules は前の版を再デプロイ。作られた文書・承認の記録は残す（消さない） |

## 12. 地域・言語・時刻

- 日本語のみ・日本国内向け。日付は**暦日の文字列**（'YYYY-MM-DD'）で保存し、タイムゾーン変換をしない（Timestamp にすると日付がずれる。既存 `launchDate` は timestamp なので比較時に注意 → C-01）
- 承認・保存の日時はサーバー時刻（表示は JST）
- 端末: スマホでは図だけ横スクロール・作業名の列は固定（demo）

## 13. 範囲外

- お客様の「差し戻し」ボタン・コメント（相談で代替）／ メール・LINE 等の通知 ／ カレンダー（ics）出力
- WBS の行の追加・削除・並べ替え、行の依存関係、営業日・祝日の計算
- 構築タスクに日付を持たせること、タスクと WBS の相互編集
- 複数案件をまたぐガント（管理者の横断表示）
- サイトマップ・デザイン・品質チェック・公開の段階そのものの live 化
- 要件定義書の再承認（approved からの戻し）
- demo の画面・DemoStore の変更（L-7 と同じく demo は不変）

## 14. 矛盾・抜けの検出（C-xx）

| # | 指摘 | 状態 | 解決先 |
|---|---|---|---|
| C-01 | `projects.launchDate`（timestamp・案件作成時）と `schedule.releaseDate`（暦日文字列）の二重。どちらが正か | 推奨: 表示は releaseDate 優先・無ければ launchDate（demo）。書き写さない | NC-4 と合わせて data-backend-architect |
| C-02 | お客様が読む文書に社内向けの メモ・担当名・保存者 があると Rules で隠せない | 文書を 2 つに分ける要件にした（§5.2） | data-backend-architect |
| C-03 | `actorOk` が `kind=='requirements'` 固定 | kind に schedule を足す（既存の要件定義書の検査は不変） | security-engineer / database-engineer |
| C-04 | 承認の履歴の表示が対象「要件定義」固定・依頼者の突き合わせが版番号だけ | kind ごとの表示・kind＋版で突き合わせ | frontend-engineer（impact-analyzer で波及確認） |
| C-05 | ポータルの「スケジュール」は既に要件定義書の章名として使用中 | 別区画にする（§6.1） | ui-ux-designer |
| C-06 | 要件定義書の承認は終端だが、将来戻せるようにするとスケジュールの扱いが未定 | 今回は範囲外 | 将来の要件 |
| C-07 | demo の saveSchedule は承認後に予定日を変えると承認日時が消えるだけで、記録も再依頼も無い（demo `reducer.ts:515-520`）。live の「承認の証跡」と両立しない | NC-1 | ユーザー |
| C-08 | demo の管理者画面はスケジュールを「見るだけ」。live は管理者も全操作（U-3） | live の役割の値だけで出し分け、demo の DOM は変えない（L-7 と同じ） | frontend-engineer |
| C-09 | demo の WBS 進捗は live に無い段階のデータから導く | NC-2 | ユーザー |

## 15. 法規制・会計の候補（結論は出さない。LEGAL REVIEW REQUIRED）

| トリガー | 候補 | 論点 | 起票 |
|---|---|---|---|
| 管理者の代理承認 | 既存の LEGAL REVIEW（代理承認がお客様の同意の証明として有効か） | スケジュールにも同じ論点が広がる | 既存の docs/TODO.md の項目に「スケジュールも対象」と追記を PM へ依頼 |
| お客様が承認した納品予定日・公開予定日 | 民法（請負・納期の合意） | 承認が納期の合意と見なされるか、再計画時の扱い | PM が法務へ持ち込む（未起票） |
| 協力会社の開発者が担当 | 下請取引に関する法令（候補） | 社内の予定日の共有が発注条件に当たるか | 同上 |
| 担当者の氏名を保存 | 個人情報保護法 | 社内のみ・お客様に出さない（§5.2） | 該当性は確認事項として残す |

## 16. Open Questions

| # | 内容 | 分類 | 確認先 | 状態 |
|---|---|---|---|---|
| NC-1〜5 | 下の「ユーザーに確認すること」 | BLOCKER（NC-1・NC-2）／ IMPORTANT（NC-3〜5） | ユーザー | 未 |
| OQ-1 | WBS が予定日をはみ出すときの注意表示 | NON-BLOCKING | designer / PM | 未 |
| OQ-2 | 同時編集の負けた側の文言 | NON-BLOCKING | designer | 未 |

### ユーザーに確認すること（NEED CONFIRMATION・推奨つき）

1. **NC-1 承認後に予定日を変えたら、お客様の承認をやり直しますか。**
   推奨: **はい**。予定日（制作の完了・納品・公開）を変えると「入力中」に戻り、版を上げて再度承認を依頼する（前の承認の記録は残し、理由を必須で記録）。**WBS（作業ごとの日付・担当・完了）の変更はやり直さない**（demo と同じ）。
2. **NC-2 live にまだ無い段階（サイトマップ・デザイン・制作の完了の承認・品質チェック・公開）の進捗をどう出しますか。**
   推奨: 担当開発者・管理者が行ごとに「完了」を付ける（demo の WBS 入力画面の中に置く）。全ページの構築だけは構築タスクの完了数から自動。その段階が live にできたら自動に切り替える。
3. **NC-3 スケジュールの承認前に、構築タスクの作成を止めますか。**
   推奨: **止めない**（既存の運用を壊さない）。スケジュール画面と案件詳細の案内で「承認待ち」を示すだけにする。
4. **NC-4 案件一覧・ダッシュボードの段階表示（「スケジュールを入力する」「承認待ち」・公開予定）にスケジュールを反映しますか。**
   推奨: **はい**。案件文書に要約（状態・公開予定日）を同じ書き込みでだけ写す（相談の要約と同じ方式。一覧の読み取り回数を増やさない）。公開予定は スケジュールがあればそれを、無ければ案件作成時の公開予定日を出す。
5. **NC-5 アーカイブ中の案件のスケジュールは、管理者も含めて読むだけにしますか。**
   推奨: **はい**（相談と同じ。直すときはアーカイブを解除する）。お客様ポータルの表示は残す。

## 17. Assumptions

| ASSUMPTION | Reason | Risk | Validation |
|---|---|---|---|
| 協力会社の開発者も担当なら同じ権限 | 構築タスク・要件定義書と同じ | 低 | Rules テスト |
| 担当名は自由入力 30 字（uid に結び付けない） | demo どおり（画面を変えない） | 担当外れ後も名前が残る | PM レビュー |
| お客様は差し戻せない・通知なし | demo・既存 L-4 | お客様の不満 | 公開後の声 |
| 下書きの変更履歴は持たない | live にアクティビティ記録が無い | 「いつ誰が変えたか」は最新のみ | PM レビュー |
| 「今日」は端末の日付 | demo どおり | 海外端末で 1 日ずれる | 低 |
| 過去日を許す・年は 2000〜2099 | 進行中の案件の入れ直し | 誤入力 | 画面の検査 |

## 18. Acceptance Criteria（RA 版が正）

- AC-01 要件定義書が承認前の案件では、管理者・担当開発者ともスケジュールを保存できない（Rules で拒否・画面は demo の空表示）
- AC-02 担当開発者・管理者（担当外の案件でも）は予定日と WBS を保存できる。担当外の開発者・お客様・無効化された人は Rules で拒否（読み取りも、担当外の開発者は拒否）
- AC-03 §7.1・§7.2 の各異常値は画面で止まり、**画面を迂回して直接書いても Rules で拒否**される（順序逆転・6 行不足・重複行・201 字のメモ・31 字の担当名）
- AC-04 承認を依頼すると版が +1、approvals に submit が 1 件だけ増える。依頼中は予定日を変えられない（WBS は変えられる）
- AC-05 お客様本人だけが承認でき、承認の記録は side 'client'・proxy なし。開発者は承認の記録を作れない。お客様が `actorRole:'admin'`・`proxy:true` を名乗ると拒否
- AC-06 管理者の代理承認は note（trim 後 1〜200、改行・制御文字・向きの制御は拒否）が必須で、ポータルと管理者画面の履歴に「アフロ（名前）が代理で承認：理由」が出る
- AC-07 古い版を表示したままの承認・差し戻された後の代理承認は拒否される。承認と差し戻しが同時に来ても一方だけ成立
- AC-08 同時に 2 人が保存しても後勝ちで黙って上書きされない
- AC-09 お客様は 下書きを見られない。メモ・担当名・保存者・構築タスクはお客様の画面にも、お客様が読める文書にも無い（お客様の権限で internal を get → 拒否）
- AC-10 構築行の進捗は tasks の完了数と一致し、WBS 側にタスクの件数を保存していない
- AC-11 承認の履歴で、スケジュールの記録が「要件定義」と表示されず、版番号が同じ要件定義書の依頼者と混ざらない
- AC-12 アーカイブ中は（NC-5 の結論で）書き込みが拒否される
- AC-13 画面は demo と同じ（スクリーンショット比較で差分が役割の出し分けだけ）
- AC-14 既存の要件定義書の依頼・承認・代理承認・差し戻しのテストが全件そのまま通る

## 19. Edge Case Matrix（抜粋）

| Condition | Expected | Priority | Test |
|---|---|---|---|
| 要件定義書 未承認で保存 | 拒否 | HIGH | Rules |
| 予定日 3 つが同じ日 | 可 | MED | unit |
| 制作の完了予定なし | 可（WBS は納品予定日の 14 日前から導く） | MED | unit |
| WBS 行の開始 = 終了 | 可 | LOW | unit |
| 依頼中に予定日を変更 | 拒否 | HIGH | Rules |
| 承認後に予定日を変更 | NC-1 の結論どおり | HIGH | Rules |
| 担当から外れた直後に保存 | 拒否・入力値は残る | MED | Rules＋画面 |
| 担当 0 人の案件 | 管理者は書ける（スケジュールは担当を要件にしない） | MED | Rules |
| 構築タスク 0 件 | 構築行 0%（未着手／進行中は日付で） | LOW | unit |
| 構築タスク 300 件超 | 既存の上限表示に従う（進捗は読めた件数で計算する旨を表示） | LOW | unit |
| お客様が internal を get | 拒否 | HIGH | Rules |
| 代理承認の note が空白のみ・改行入り | 拒否 | HIGH | Rules |

## 20. 引き渡し

- data-backend-architect: §5（SoT・2 文書・approvals の kind・要約の写し NC-4・Idempotency）
- security-engineer: §2・§4.3・§5.3（相互照合・値の出所・代理承認・お客様の読み取り条件）
- impact-analyzer: C-03・C-04・C-05（既存の approvals の表示・Rules の actorOk・ポータルの章名）
- ui-ux-designer: §6.1 の画面要件（demo と同一。live で足すのは NC-2 の「完了」と競合時の文言だけ）
- qa-engineer: §18・§19

## 21. 実行主体・観測手段

- 期限・失効・自動処理は**無い**（遅れは表示時に導出。スケジューラ不要）。該当なし
- 観測: 公開後 1 週間で Read 件数を確認（LIVE_DASHBOARD_TASKS_CONSULT §5 と同じループ）

## Requirement Review 依頼

| Reviewer | 観点 | 判定（APPROVED / APPROVED WITH OPEN QUESTIONS / REVISE / BLOCKED） | 理由 |
|---|---|---|---|
| product-manager | 意図（U-1〜U-4）と一致しているか | 未判定（NC-1・NC-2 の回答後に判定） | |
| lead-architect | 実現可能か（Rules の式の上限・2 文書・承認の相互照合）・規模（XL） | 未判定 | |
