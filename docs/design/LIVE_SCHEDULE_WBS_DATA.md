# live のスケジュール（予定日）＋ WBS — データ／Backend 設計

| Version / Status | 規模・リスク | 要件（正） | 最終更新 |
|---|---|---|---|
| 0.1 / DRAFT（Data Design Review 前。判定は lead-architect） | XL（Rules・承認の証跡・代理承認・お客様へ見せる日付） | [`LIVE_SCHEDULE_WBS.md`](LIVE_SCHEDULE_WBS.md)（REQ-LIVE-SCHED-01・ユーザー決定 NC-1〜5） | 2026-11-27 |

> 設計資料のみ（data-backend-architect）。Rules の式・テストの実体は database-engineer / backend-engineer、画面は demo と同一（UI は本書の範囲外）。
> 要件の「推奨の置き場所」（§5.2）から**3 点を変えた**（§1.2 の D-1〜D-3）。理由は各節。

---

## 0. 確認した実物（[FACT]。worktree = afro-cms-demo origin/main ＋ 要件書）

| 対象 | 確認した内容 |
|---|---|
| `firestore.rules:207-220` | `validProject` の `hasOnly` に `consult` を任意で許し、`projCreateOk:352` で作成時は禁止（要約の写しの既存の型） |
| `firestore.rules:223-266` | 要件定義書の状態の正は **案件文書の `requirements` マップ**、中身は `requirements/current`。遷移は `getAfter`/`existsAfter` で承認の記録と相互照合 |
| `firestore.rules:269-293` | `projUpdateOk`：admin は `roleOf=='admin'` の別分岐（R-1）、開発者は `mine`、お客様は承認だけ。外側で `stamped()` |
| `firestore.rules:317-323・503-565` | `apprCreateOk` → `actorOk`（**`kind=='requirements'` 固定**:504）、ID は `approvalId()` = `'requirements-r{rev}-{action}'` 固定:49。withdraw の note は 0〜200 任意:563 |
| `firestore.rules:420-431` | `consultOk` は `archived == false` を要求（アーカイブで止まる既存の型） |
| `src/live/model.ts:228,243-274` | 履歴の文・対象が「要件定義（第N版）」固定:252-253、依頼者の突き合わせが**版番号だけ**:264-266（C-04 を再確認） |
| `src/live/repositories.tsx:451-507,527-581` | 依頼・差し戻し・承認は `runTransaction`（オンライン必須）。二重承認は permission-denied → 記録があれば WARN を出して成功扱い／お客様と代理がぶつかれば例外:567-578 |
| `src/live/proxyApproval.ts` | note の整え方（`cleanProxyNote`）・検査・`proxyVersionOk` |
| `src/types/index.ts:30-61`・`src/data/schedule.ts:9-75` | demo の `ProjectSchedule`（buildDue?/deliveryDate/releaseDate/note/savedAt/savedBy/wbs?）、`WbsId` 6 種、`SCHEDULE_NOTE_MAX=200`、`WBS_ASSIGNEE_MAX=30` |
| `docs/operations/RUNBOOK_FIREBASE.md:48` | 0.51.0 以降: 出す順 Rules → Functions → Hosting、戻す順 Hosting → Rules |
| `src/live/pages/PortalApprovalPage.tsx:44`・`LiveRequirementsPage.tsx:168` | `section === 'schedule'` は要件定義書の章（C-05） |

---

## 1. 結論（要点）

### 1.1 Source of Truth

| データ | 正 | 複製（4 分類） | 同期 |
|---|---|---|---|
| スケジュールの**状態・版・承認の印** | `projects/{pid}.schedule`（マップ。要件定義書の `requirements` と同じ置き方） | なし | — |
| **入力中の予定日**（下書き） | `projects/{pid}/schedule/internal.draft` | なし | — |
| **お客様に出した予定日**（最後に依頼した版） | `projects/{pid}/schedule/current` の `buildDue/deliveryDate/releaseDate` | `internal.draft` の **Historical Snapshot**（依頼の瞬間の写し） | submit と同じ書き込みでだけ変わる（Rules の等式） |
| WBS の日付・完了印 | `schedule/current.wbs` | — | — |
| WBS の担当名・メモ・保存者名 | `schedule/internal` | — | — |
| 一覧用の公開予定日 | `schedule/current.releaseDate` | `projects/{pid}.schedule.releaseDate`（**Intentional Denormalization**。NC-4） | submit と同じ書き込みでだけ変わる（Rules の等式）。不一致は起こせない |
| 承認の対象の証明 | `approvals/schedule-r{rev}-submit/approve` | current の **Historical Snapshot** | create のみ（追記） |
| 構築行の進捗 | `projects/{pid}/tasks`（既存） | **保存しない**（毎回導出。AC-10） | — |
| 他 5 行の完了 | `current.wbs[id].doneAt/doneBy`（NC-2 の手入力） | — | その段階が live に出来たら導出へ切替（手入力の値は読まない） |
| 案件作成時の公開予定日 | `projects.launchDate`（timestamp。既存） | なし（C-01: 互いに書き写さない） | 表示だけ `schedule.releaseDate ?? launchDate(JST の暦日)` |

### 1.2 要件書の推奨から変えた点（[DECISION] data-backend-architect。lead-architect の Review 対象）

| # | 要件書の推奨 | 本設計 | 理由 |
|---|---|---|---|
| **D-1** | `status/revision/approved*` を `schedule/current` に置く | **案件文書 `projects/{pid}.schedule` に置く**（current には持たない） | ① 既存の要件定義書と同じ型（1.13）で Rules の相互照合をそのまま流用できる ② NC-4 の要約が状態そのものになり、**状態の写しを 2 か所に作らない** ③ 一覧の Read 0 追加 |
| **D-2** | お客様の読み取りを `status in [requested, approved]` で絞る | **お客様に読める文書（current）に下書きを置かない**。下書きの予定日は `internal.draft`、current の予定日は **submit でだけ**変わる。お客様の get 条件は current 自身の `revision >= 1` | 他文書を `get()` する条件で読み取りを絞ると、**張ったままのリスナーが状態変化で切られるかが未確認**（UK-1）。下書きをそもそも置かなければ漏れようがない。再計画中も current は「最後に依頼した版」のまま |
| **D-3** | WBS は 6 要素の list | **WbsId をキーにしたマップ**（6 キー固定） | 「同じ行が 2 回」が構造上起きない・Rules で `keys().hasOnly/hasAll` だけで検査できる（list の重複検査は式が増える）。並びは `WBS_ITEMS` の順で画面が決める |

---

## 2. 文書と項目（型・上限）

日付は全部 **暦日文字列 `YYYY-MM-DD`**（タイムゾーン変換しない）。Rules の正規表現 `ymd()` = `^20[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$`（2000〜2099 年。暦に無い日 2/30 は画面だけで止める）。

### 2.1 `projects/{pid}.schedule`（マップ・任意。お客様も読める＝案件文書）

| Field | Type | 必須 | 制約 | 書くタイミング |
|---|---|---|---|---|
| status | `'draft' \| 'requested' \| 'approved'` | ✓ | §4 の遷移のみ | 全遷移 |
| revision | int | ✓ | 作成時 0、submit で +1 のみ | init / submit |
| releaseDate | ymd | submit 後 ✓ | == `current.releaseDate`（getAfter の等式） | submit だけ |
| requestedAt | timestamp | submit 後 ✓ | == request.time | submit だけ（代理承認の「開いた後に変わったか」の照合用。`proxyVersionOk` と同じ使い方） |
| approvedRevision | int | 承認後 ✓ | == 承認時の revision | approve だけ |
| approvedAt / approvedBy / approvalId | timestamp / uid / string | 承認後 ✓ | request.time / auth.uid / `'schedule-r{rev}-approve'` | approve だけ |
| approvedVia | `'proxy'` | 代理承認のときだけ | お客様の承認では**消す**（deleteField。前の版が代理だった場合） | approve だけ |

- 再計画（approved → draft）・差し戻しは `status` だけを変える。`approved*` は「最後に承認された版」の情報として残す（お客様の表示 §6 に使う）
- `validProject` の `hasOnly` に `'schedule'` を追加し `(!has('schedule') || d.schedule is map)`。**`projCreateOk` で `!d.keys().hasAny(['consult','schedule'])`**（作成時に偽の承認済みを持たせない）。既存の `projUpdateOk` の各分岐の `ch.hasOnly` には入れない（schedule は §5 の専用分岐だけが書ける）
- 書くと `updatedAt/By` も変わる（`stamped()`。要件定義書の遷移と同じく一覧の並びが動く。相談と違い状態の変化なので並びが動いてよい）

### 2.2 `projects/{pid}/schedule/current`（お客様は `revision >= 1` のときだけ読める）

| Field | Type | 必須 | 制約 |
|---|---|---|---|
| schemaVersion | int | ✓ | 1 |
| revision | int | ✓ | init で 0。submit で `== getAfter(project).schedule.revision` |
| buildDue | ymd | 任意 | ≦ deliveryDate |
| deliveryDate | ymd | revision ≥ 1 で ✓ | ≦ releaseDate |
| releaseDate | ymd | revision ≥ 1 で ✓ | — |
| wbs | map `WbsId → Row` | 任意（無ければ画面が導出・保存しない） | あれば **6 キーちょうど**（`hasAll`＋`hasOnly`） |
| wbs.{id}.start / end | ymd | ✓ | start ≦ end（同日可） |
| wbs.{id}.doneAt / doneBy | timestamp / uid | 任意（組で） | 新たに付けるとき `== request.time / == auth.uid`、それ以外は前の値のまま、または両方消す。**`build` 行には持てない**（構築タスクから導出） |
| updatedAt / updatedBy | timestamp / uid | ✓ | stamped() |

- 大きさ: 約 0.6 KB [INFERENCE]。増えない（6 行固定）
- 担当名・メモ・保存者名・構築タスクの件数は**持たない**（AC-09・AC-10）。`doneBy` の uid はお客様にも見える（approvals の `actorUid` と同じ扱い。画面には出さない）

### 2.3 `projects/{pid}/schedule/internal`（管理者・担当開発者だけ。お客様は一切読めない）

| Field | Type | 必須 | 制約 |
|---|---|---|---|
| schemaVersion | int | ✓ | 1 |
| draft | map `{buildDue?, deliveryDate, releaseDate}` | ✓ | §2 の ymd と順序。キーはこの 3 つだけ |
| note | string | 任意 | 保存値は trim 済み、0〜200 コードポイント（`(?s).{0,200}`）、向きの制御（U+202A〜202E・U+2066〜2069）は拒否（改行は可） |
| assignees | map `WbsId → string` | 任意 | キーは 6 種の部分集合、値 1〜30 コードポイント・制御文字なし（空はキーごと省く） |
| savedByName | string | ✓ | `== accounts/{uid}.name`（書いた本人の名前を毎回。Rules で一致） |
| updatedAt / updatedBy | timestamp / uid | ✓ | stamped()（画面の「保存済み 日時・名前」はこれ＋savedByName） |

### 2.4 `projects/{pid}/approvals/schedule-r{rev}-{action}`（既存コレクション・追記のみ）

共通: `schemaVersion:1, kind:'schedule', action, revision, side, actorUid, actorName, actorEmail, at, actorRole?`（actorOk と同じ。admin は `actorRole:'admin'` 必須）

| action | 誰が | side | 追加の項目 | 等式（Rules） |
|---|---|---|---|---|
| submit | 管理者・担当開発者 | afro | `buildDue?, deliveryDate, releaseDate, wbs?` | `== getAfter(current)` の同名項目（`optEq` で任意項目も） |
| withdraw | 同上 | afro | `note?`（0〜200。要件定義書と同じ） | — |
| approve（本人） | お客様本人 | client | submit と同じ写し。`proxy`・`note` は持てない、`actorRole` は任意で `'client'` | `== getAfter(current)` |
| approve（代理） | 管理者のみ | afro | 写し＋`proxy:true`・`note`（`reProxyNote`・`!reNoteControl`）・`actorRole:'admin'` | 同上 |
| reopen | 管理者・担当開発者 | afro | `note`（**必須**。代理の note と同じ正規表現） | — |

- **ID が冪等キー**（`'schedule-r' + rev + '-' + action`、create のみ・update/delete 不可）。版ごとに各操作 1 件。**次に同じ操作をする場面（差し戻し後の再依頼、再計画後の再依頼）は必ず版が上がる**ので世代は revision で足りる（reopen も同じ版で 2 回目は起きない: reopen の後は draft で、次の依頼が rev+1）
- 担当名・メモは写さない（お客様が approvals を読める）。**withdraw / reopen の note はお客様に見える**（要件定義書の withdraw と同じ。UI で「お客様にも表示されます」と添える → OQ-D1）
- C-05（ポータルの区画名）はデータ側に影響しない: スケジュールの記録は `kind:'schedule'`・ID 接頭辞 `schedule-` で要件定義書の章とは別物。区画の名前・アンカーは ui-ux-designer

---

## 3. Rules の述語（誰が・いつ）。実装は database-engineer

前提: 役割は `acctOrNull()`→`roleOf()` を 1 回（式の上限対策。既存の型）。`mine` = developer かつ `uid in memberUids`、`afro` = `mine || r == 'admin'`（**admin は担当不要・全案件。R-1 と同じく別条件**）、`gate` = `proj.requirements.status == 'approved' && proj.archived == false`。

### 3.1 読み取り

| パス | allow get | 備考 |
|---|---|---|
| `schedule/current` | `isAdmin() \|\| assigned(pid) \|\| (clientOf(pid) && resource.data.revision >= 1)` | 条件は**自分自身の値**（UK-1 を回避）。アーカイブでも読める |
| `schedule/internal` | `isAdmin() \|\| assigned(pid)` | お客様・担当外は常に拒否（AC-09） |
| `schedule/{other}` | 拒否 | `match /schedule/{sid}` で `sid in ['current','internal']` 以外は書けない・読めない |
| list | **許さない**（2 文書は get で読む） | |

### 3.2 書き込み（すべて `allow delete: if false`）

| 操作 | `projects/{pid}`（projUpdateOk に追加する分岐） | `schedule/current` | `schedule/internal` | `approvals` |
|---|---|---|---|---|
| **init**（なし→draft） | afro・gate・`!resource.data.keys().hasAny(['schedule'])`・`a == {'status':'draft','revision':0}`・`existsAfter(current) && existsAfter(internal)` | create: afro・gate（`proj()` は事前）・事前に schedule 無し・`getAfter(proj).schedule == {draft,0}`・revision 0・予定日なし・wbs 任意で有効・stamped | create: afro・gate・同上・`validInternal`・`savedByName == a.name`・stamped | — |
| **保存**（draft の予定日） | — | — | update: afro・gate・`changed().hasOnly([draft,note,assignees,savedByName,updatedAt,updatedBy])`・**`draft` を変えるなら 事前の `proj.schedule.status == 'draft'`、または 事前 approved かつ `getAfter(proj).schedule.status == 'draft'`（同じ書き込みの reopen）。requested 中は拒否**・validInternal | — |
| **WBS・担当・メモ**（どの状態でも） | — | update: afro・gate・`changed().hasOnly([wbs,updatedAt,updatedBy])`・`validWbs(after, before)` | update（同上。draft 不変なら状態を問わない） | — |
| **submit**（draft→requested） | afro・gate・`b.status=='draft' && a.status=='requested' && a.revision==b.revision+1 && a.requestedAt==request.time && a.releaseDate==getAfter(current).releaseDate`・差分は `[status,revision,requestedAt,releaseDate]` だけ・`existsAfter(appr(schedule-r{a.revision}-submit))` | update: afro・gate・`changed().hasOnly([revision,buildDue,deliveryDate,releaseDate,updatedAt,updatedBy])`・`revision == getAfter(proj).schedule.revision`・`getAfter(proj).schedule.status=='requested'`・予定日 `== getAfter(internal).draft`・validDates | 変えない | create: afro・`aid == 'schedule-r'+a.revision+'-submit'`・写しの等式・`hasOnly` |
| **withdraw**（requested→draft） | afro・gate・`b.status=='requested' && a.status=='draft'`・差分は `[status]` だけ・`existsAfter(appr(…-r{b.revision}-withdraw))` | 変えない | 変えない | create: afro・`aid` の版 == `proj.schedule.revision`・事前 requested・事後 draft・note 任意 |
| **approve（本人）** | `r=='client' && a.projectId==pid`・gate・`b.status=='requested' && a.status=='approved'`・差分 `[status,approvedRevision,approvedAt,approvedBy,approvalId,approvedVia]` だけ・`!a.keys().hasAny(['approvedVia'])`・時刻/uid/ID・**相互照合** `l.side=='client' && !l.keys().hasAny(['proxy'])` | 変えない | — | create: client 本人・`d.revision == proj.schedule.revision` かつ `aid` の版も同じ（**古い画面の版は拒否**＝AC-07）・事前 requested・事後 approved かつ approvedVia 無し・写しの等式・`hasOnly` |
| **approve（代理）** | `r=='admin'`・gate・同上で `a.approvedVia=='proxy'`・相互照合 `l.proxy==true && l.side=='afro' && l.actorUid==uid` | 変えない | — | create: admin・`proxy:true`・note 必須・`actorRole:'admin'`・事後 `approvedVia=='proxy'` |
| **reopen**（approved→draft。NC-1） | afro・gate・`b.status=='approved' && a.status=='draft'`・差分 `[status]` だけ・`existsAfter(appr(…-r{b.revision}-reopen))` | 変えない（お客様は最後に承認された版を見続ける） | 同じ書き込みで `draft` を変える | create: afro・事前 approved・事後 draft・note 必須 |
| 拒否（明示テスト） | requested 中の `internal.draft` 変更 ／ approved 中の draft 変更を reopen なしで ／ 開発者の approve ／ お客様の submit/withdraw/reopen/保存 ／ 担当外・無効化・メール不一致 ／ アーカイブ中の全員（**お客様の承認・admin も**。NC-5） | | | |

- `apprCreateOk` は `request.resource.data.kind` で分ける: `'requirements'` → 既存の式（**一字も変えない**。`actorOk` は `actorBase(d,a) && d.kind=='requirements'` に分解して同値を保つ）／ `'schedule'` → `schedApprOk(pid, aid, a, r)` ／ それ以外 → 拒否。`aid` の接頭辞と kind の不一致（`requirements-` ＋ kind schedule 等）も拒否（C-03 の解決）
- 書き込みの検査は `validDates(m)`（`deliveryDate/releaseDate` 必須・`buildDue` 任意・ymd・`buildDue<=deliveryDate<=releaseDate` の文字列比較）、`validWbs(a, b)`（6 キー・各行 `wbsRow(id)`）、`validInternal(d, a)`
- **get の数**: submit の最大で 本人の accounts・案件・current・internal・承認文書の 5 文書（1 リクエストの上限 20 の内）[INFERENCE]。**式の数（1000）は最大ケース（代理承認＋WBS 6 行に完了印・note 200 字／submit）をエミュレータで計測し、`tests/rules` に記録する**（UK-2）

---

## 4. トランザクション境界と競合

すべて `runTransaction`（オンライン必須。オフライン中は「保存できませんでした」で、成功が確定するまで「保存しました」を出さない＝既存の依頼・承認と同じ）。外部 API 呼び出しは無い。

| 操作 | TX で読む | 書く（同じ TX） | Write 数 | 事前条件（画面側でも検査） |
|---|---|---|---|---|
| init（初回保存） | project, current, internal | project.schedule・current(create)・internal(create) | 3 | requirements approved・未アーカイブ・schedule なし |
| 保存（予定日・メモ・担当） | internal（＋WBS なら current） | internal（＋current） | 1〜2 | **楽観的排他**: ダイアログを開いた時点の `internal.updatedAt`（WBS は `current.updatedAt`）と TX 内の値が違えば中止 →「ほかの人が先に保存しました。最新を読み込みました」（AC-08）。予定日を変えるのは draft のときだけ |
| 保存＋再計画（approved で予定日を変えた） | project, internal | internal.draft・project.schedule.status='draft'・approvals reopen | 3 | 理由 note 必須（画面で入力）。WBS だけの変更は再計画にしない |
| WBS のドラッグ・完了印 | current | current.wbs | 1 | 同上の楽観的排他（current.updatedAt） |
| submit | project, current, internal | project.schedule・current（予定日を draft から写す・revision）・approvals submit | 3 | draft・予定日が保存済み・**先に保存待ちを flush**（要件定義書の `flushNow` と同じ） |
| withdraw | project | project.schedule.status・approvals withdraw | 2 | requested |
| approve（本人） | project, current | project.schedule・approvals approve | 2 | requested・**画面が表示していた revision == TX 内の revision**（違えば「スケジュールが更新されました」）。ID の版は表示していた版で組む → Rules でも古い版は拒否 |
| approve（代理） | project, current | 同上＋approvedVia | 2 | 同上＋`proxyVersionOk(開いた時の requestedAt, TX 内の requestedAt)`＋note の `cleanProxyNote/validateProxyNote` |

- **同時の承認と差し戻し**: どちらも事前 `requested` を要求し、相手の書き込み後は事前条件が崩れる（TX の再試行で画面側が検知、Rules も拒否）→ 一方だけ成立（AC-07）
- **二重送信（2 タブ・再送）**: 決定的 ID の 2 回目は Rules が拒否。`approveRequirements` と同じく、permission-denied かつ同じ ID の記録が既にあり**同じ種類**（本人／代理）なら `console.warn('schedule approval already exists', {projectId, aid})` を出して成功扱い。種類が違えば「お客様がすでに承認しています／アフロがすでに代理で承認しています」。**無音の return を作らない**
- **途中失敗**: 1 TX なので部分成立は無い。Rules が片側だけの書き込みを拒否する（相互の `existsAfter`/`getAfter`）

---

## 5. 画面が読むものと Read 数（Confidence: LOW・未計測）

| 画面 | 読むもの | 追加 Read |
|---|---|---|
| アフロ側スケジュール画面 | current 1・internal 1（リスナー）＋ 案件（一覧の購読を共有）＋ tasks（既存購読 ≦300 を共有）＋ approvals 履歴（既存 `a:{pid}` の購読を共有） | **文書 2 件**＋変更ごとに 1 |
| お客様ポータルのスケジュール | current 1（`revision>=1` のときだけ購読。0 のときは購読しない＝permission-denied を出さない）。再計画・差し戻し中で `current.revision != schedule.approvedRevision` のときは approvals の履歴（承認ページと共有）から `schedule-r{approvedRevision}-approve` の写しを使う | 文書 1 件 |
| 案件一覧・ダッシュボード | `projects` の購読だけ（`schedule.status/releaseDate`） | **0**（NC-4） |
| 書き込み時の Rules の get | 2〜5 文書（§3.2） | 課金対象 [INFERENCE: Rules の get は Read 課金] |

- お客様の表示の決め方（純関数 `clientScheduleView`。§7 の単体テスト対象）: `schedule` 無し or `revision==0` → 未作成 ／ requested・approved → current ／ draft かつ `approvedRevision` あり → current の版が同じなら current、違えば承認の写し（いずれも「調整中」） ／ draft で承認歴なし → 未作成表示（current に差し戻された版が残っていても出さない。要件 §6.2）
- 一覧の公開予定: `schedule.releaseDate ?? launchDate`（launchDate は timestamp → JST の暦日に直して表示。C-01）。お客様向けの画面でこの要約の releaseDate を使わない（差し戻された版の日付の可能性があるため。上の関数を使う）
- 段階表示（`toProject` の STAGE）: requirements approved かつ schedule 無し →「スケジュールを入力する」、draft →「スケジュールを入力中」、requested →「お客様の承認を待つ」（pendingApprovals 1）、approved →「スケジュール 承認済み」。文言は PM / designer（demo に合わせる）

## 6. Index

**新規なし**。current・internal は文書 ID の get、approvals は既存の `orderBy('at','desc') limit(500)`（単一フィールド）。collection group の `approvals`（admin の list）は既存のまま。`firestore.indexes.json` は変えない。

---

## 7. 実装者が追加するテスト（qa-engineer が観点を確認）

### 7.1 Rules（新規 `tests/rules/schedule.test.mjs`。fixtures に `scheduleSeed(env, {state, rev})`・`schedInitBatch / schedSubmitBatch / schedWithdrawBatch / schedApproveBatch / schedProxyBatch / schedReopenBatch` を足す）

| # | 観点 | 主なケース |
|---|---|---|
| SR-01 | init の権限・ゲート | 担当開発者・**担当外の admin**・**担当 0 人の案件の admin** は可 ／ 担当外の開発者・お客様・無効化・メール不一致は拒否 ／ requirements が draft・analyzed は拒否（AC-01） ／ アーカイブ中は admin も拒否 |
| SR-02 | init の形 | 2 回目の init・current だけ／internal だけの作成・`schedule` を `{requested, 1}` で作る・`projCreateOk` で `schedule` 付きの案件作成 → 全部拒否 |
| SR-03 | 予定日（AC-03） | 順序逆転 2 種・形式不正・1999/2100 年・13 月・納品/公開の欠落 → 拒否 ／ 3 つ同日・buildDue なし → 可 |
| SR-04 | WBS（AC-03） | 5 行・7 行・未知キー・start>end・形式不正 → 拒否 ／ start==end 可 ／ `build` 行に doneAt → 拒否 ／ doneAt が request.time でない・doneBy が他人 → 拒否 ／ 既存の doneAt の維持・消去は可 |
| SR-05 | internal（AC-03・AC-09） | note 201 字・向きの制御入り・担当名 31 字・担当名の未知キー・savedByName の偽装 → 拒否 |
| SR-06 | 読み取り（AC-02・AC-09） | お客様: internal は常に拒否、current は rev 0 で拒否・rev ≥1 で可 ／ 担当外の開発者は両方拒否 ／ 他案件のお客様は拒否 ／ アーカイブ中も読める |
| SR-07 | submit（AC-04） | 版 +1・記録 1 件で成立 ／ 記録なし・案件の遷移なし・current の予定日が draft と不一致・写しの不一致・`releaseDate` の要約不一致・版の飛び（+2）・同じ版の 2 回目 → 拒否 ／ お客様の submit 拒否 |
| SR-08 | 依頼中の変更 | requested 中の `internal.draft` 変更 → 拒否（AC-04） ／ WBS・担当・メモの変更 → 可 ／ approved 中の WBS 変更 → 可で状態不変 |
| SR-09 | withdraw | 開発者・admin 可・note 201 字拒否・お客様拒否・同じ版で 2 回目拒否・差し戻し後の再 submit は rev+1 で可 |
| SR-10 | 本人の承認（AC-05・AC-07） | 可 ／ side afro・`proxy:true`・`actorRole:'admin'`・`approvedVia` を名乗る → 拒否 ／ 開発者・admin の本人承認 → 拒否 ／ 古い版の ID（rev1 で rev2 が依頼中）・差し戻し後・案件だけ approved・記録だけ → 拒否 |
| SR-11 | 代理承認（AC-06） | admin 可 ／ note 空・空白のみ・改行・向きの制御・201 字 → 拒否 ／ side client・approvedVia なし・開発者の代理 → 拒否 ／ 本人承認の後の代理（同じ ID）→ 拒否、その逆も拒否 ／ 代理の後の再計画→再依頼→**本人の承認で approvedVia が消える**こと |
| SR-12 | 再計画（NC-1） | approved で draft 変更＋reopen（note あり）→ 可 ／ reopen なしの draft 変更・note なし・お客様の reopen → 拒否 ／ 続けて submit は rev+1 |
| SR-13 | 追記のみ | `schedule-*` の approvals の update・delete は admin を含め拒否 ／ schedule 文書の delete 拒否 |
| SR-14 | kind の分離（C-03） | kind schedule で ID `requirements-r1-submit`・kind requirements で ID `schedule-r1-submit`・kind 不明 → 拒否 |
| SR-15 | アーカイブ（AC-12・NC-5） | 全操作（init・保存・WBS・submit・withdraw・本人承認・代理・reopen）が admin・お客様を含め拒否 |
| SR-16 | 回帰（AC-14） | 既存の requirements / approvals / adminRights / projects / consult の全件が無変更で通る ／ **`schedule` を持つ案件**で基本情報の変更・アーカイブ・相談・要件定義書の遷移が通る（validProject の `hasOnly` 漏れ検出） ／ `adminRights.test.mjs` の OPS にスケジュールの操作を追加 |
| SR-17 | 式の上限 | 代理承認（WBS 6 行に完了印・note 200）・submit・reopen の最大ケースが成立し、評価の式数を記録（UK-2） |
| SR-18 | mutation | `tests/rules/mutation.test.mjs` に「afro 判定から admin を外す／`revision>=1` を外す／相互照合を外す」変異で失敗することを追加 |

### 7.2 単体（tests/unit。React・Firebase を import しない純関数）

| # | 対象 | ケース |
|---|---|---|
| SU-01 | `approvalLogFrom`（C-04） | kind schedule の各 action の文・対象「スケジュール（第N版）」 ／ kind 無しの古い記録は要件定義扱い ／ 代理の文と note |
| SU-02 | `approvalLogsFrom`（AC-11） | 要件定義 r1 の依頼者 A・スケジュール r1 の依頼者 B・スケジュール r1 を A が代理 → `sameAsRequester=false`（**kind＋版**で突き合わせ）／ B が代理 → true |
| SU-03 | `scheduleDoc / scheduleInternalDoc / scheduleSummaryOf` | 文書なし → null（未作成）・壊れた値は捨てる・wbs マップ ↔ `WbsItem[]`（`WBS_ITEMS` の順） |
| SU-04 | `clientScheduleView`（§5） | 未作成／依頼中／承認済み／再計画中（同じ版）／差し戻し後で承認歴あり（写しを使う）／承認歴なし |
| SU-05 | `toProject` の段階・公開予定（C-01・NC-4） | releaseDate 優先・無ければ launchDate を JST 暦日に（UTC 15:00 境界） |
| SU-06 | 検査 | demo の `validateSchedule`・`validateWbs` を共用 ＋ 2000〜2099 年 ／ Rules と同じ ymd 正規表現の表で一致（2/30 は画面だけで拒否） |
| SU-07 | 保存の写像 `scheduleForSave` | Rules が受けるキーだけ（note は trim、空の担当名はキーごと省く、build 行に doneAt を付けない、新しい完了印は serverTimestamp） |
| SU-08 | 進捗の導出（AC-10） | 構築行 = tasks の done/全件（0 件・300 件上限の注記）、他行は doneAt、状態は demo `statusOf` と同じ、お客様には「遅れ」→「調整中」 |
| SU-09 | 競合判定 | 開いた時の updatedAt ≠ TX 内 → 競合エラー ／ 表示していた revision ≠ TX 内 → 承認しない |

---

## 8. Migration

- **不要**。既存の案件は `schedule` キーが無い＝「未作成」。schedule 配下の文書も無い。既存の approvals はすべて `kind:'requirements'`（`actorOk` が強制してきた [FACT] firestore.rules:504）なので、`kind` 無しを要件定義として読む変換だけで足りる
- demo の localStorage のスケジュールは移さない（要件 §5.2）
- 将来 `schemaVersion` を上げるときは読み込み時に寄せる（`consultOf` と同じ流儀）

## 9. リリース順と Rollback

| 段 | 出すもの | 中身 | Rollback |
|---|---|---|---|
| **0（先行）** | Rules ＋ Hosting | Rules: `validProject` に `schedule` を許す・`projCreateOk` で禁止・`actorOk` の分解（同値）だけ。Hosting: 履歴の kind 対応（C-04）だけ。**スケジュールはまだ誰も書けない** | 旧版へ戻せる（データが無い） |
| **1（機能）** | **Rules → Hosting**（Functions の変更なし） | §3 の全述語・画面 | **Hosting を先に段 0 へ戻し、その後 Rules を段 0 へ**（RUNBOOK 0.51.0 の順）。**段 0 より前へは戻さない** |

- 段 0 を挟む理由: 機能の Rules を「段 0 より前」へ戻すと、`schedule` を持つ案件で `validProject` の `hasOnly` が落ち、**基本情報の変更・アーカイブが全件失敗**する（consult を入れたときと同じ罠）。また旧 Hosting はスケジュールの承認記録を「要件定義（第N版）」と誤表示する
- 新 Hosting × 旧 Rules（順番を誤った場合）: スケジュールの書き込みは全件拒否（`actorOk` が kind を拒否＝安全側）、要件定義書の操作は影響なし（記録の形を変えないため）
- 作られた文書・承認の記録は戻しても**消さない**（Retain。要件 §5.2）
- Backup: 既存の運用（BACKEND_FIREBASE §18）のまま。RPO/RTO の追加要求なし

## 10. 実行基盤要件（platform-engineer へ）

該当なし（Functions・Queue・Scheduler を使わない。期限・自動処理なし＝要件 §21）。監視: 公開後 1 週間で Firestore の Read 件数を確認（LIVE_DASHBOARD_TASKS_CONSULT §5 と同じループ）。ログに担当名・メモを出さない（console.warn は `projectId`・`aid` だけ）。

## 11. クライアントが決められる値の一覧（security-engineer・qa-engineer へ）

| 値 | 用途 | 安全・権限・証跡に使うか | サーバー側の正 | 偽申告テスト |
|---|---|---|---|---|
| 予定日・WBS の日付 | 表示・承認の対象 | 承認の対象（証跡） | 写しの等式（submit/approve と current） | SR-07・SR-10 |
| status / revision / requestedAt / approved* | 状態 | **権限の判定に使う** | Rules の遷移検査・request.time・auth.uid | SR-07〜SR-12 |
| approvedVia / proxy / side / actorRole | 代理か本人か | **証跡** | 役割（roleOf）と相互照合 | SR-10・SR-11 |
| 承認の ID の版 | 対象の版 | **古い画面の承認を止める** | `proj.schedule.revision` との一致 | SR-10 |
| doneAt / doneBy | 完了の印 | 表示のみ | request.time・auth.uid | SR-04 |
| savedByName / actorName | 表示 | 表示のみ | `accounts.name` との一致 | SR-05 |
| note（withdraw/reopen/proxy/internal） | 理由 | 代理・再計画の理由（証跡） | 文字の検査のみ（中身は検証不能） | SR-05・SR-11・SR-12 |
| 担当名（自由入力） | 表示 | 使わない | なし（社内のみ） | SR-05 |

---

## 12. 未確認・未決（[UNKNOWN] / Open Questions）

| # | 内容 | 分類 | 対応 |
|---|---|---|---|
| **UK-1** | Firestore のリスナーが、**別文書を `get()` する読み取り条件**の変化（例: 案件の状態が draft に戻る）で切られるか。公式資料で確認できず（2026-11-27 検索） | INVESTIGATION REQUIRED（本設計は依存しない＝D-2） | 実装時にエミュレータで観察して `docs/knowledge/tech/firestore.md` へ（任意） |
| **UK-2** | 最大ケース（代理承認＋WBS 完了印 6 行＋note 200 字、submit）の式の数が 1000 未満か | INVESTIGATION REQUIRED | SR-17 で計測・記録。超えたら WBS の写しを承認記録から外す（予定日だけを写す）のが第一の削り所 |
| UK-3 | Rules の get が書き込み 1 回で 5 文書（上限 20 の内）[INFERENCE] | 低 | SR-17 で同時に確認 |
| OQ-D1 | 再計画（reopen）の理由をお客様の履歴に出してよいか（現設計では出る。要件定義書の withdraw の note と同じ） | NON-BLOCKING（既定: 出す・入力欄に「お客様にも表示されます」） | PM / designer |
| OQ-D2 | 「完了」の印を外せるか（現設計: 外せる＝doneAt/doneBy を消す。記録は残さない） | NON-BLOCKING | PM |
| OQ-D3 | 案件の `launchDate` を承認済みの公開予定日に合わせる運用（書き写しはしない＝C-01）。案件の基本情報の画面で両方の日付が食い違って見える | NON-BLOCKING | PM（表示の注記は designer） |
| LEGAL | 代理承認・お客様の承認が納期の合意と見なされるか（要件 §15） | LEGAL REVIEW REQUIRED | PM → 法務（本設計は結論を出さない） |

### 12.1 G1 の計測結果（2026-11-27・U1-1。エミュレータ firebase-tools 15・`tests/rules/adminRights.test.mjs` TEST-09「G1」）

方法: TEST-09 と同じ（述語の return の直後に pad10 を k 個。trivial は k=19 → 1 個 ≒ 50 式）。参照は存在しない文書の `exists()` を k 個（trivial 10 ＝ 1 文書の書き込みの上限 10 で止まる）。payload は最大（WBS 6 行に完了印 5 行・marks 5 件・担当 6 件 30 字・note 200 字・予定日 3 つ＋buildDue。代理の note 200 字）

| 経路（述語） | pad10 の残り k | 消費 ≒ 式 | 余裕 | exists の残り |
|---|---|---|---|---|
| init（projects: schedProjOk） | 9 | 500 | 45% | 8 |
| **init（current・internal: schedCreateOk）** | **3** | **800** | **15%（合格線 20% を下回る）** | 9 |
| 同時保存（current: schedCurUpdateOk） | 5 | 700 | 25% | 7 |
| 同時保存（internal: schedIntUpdateOk） | 4 | 750 | 20%（合格線ちょうど） | 10 |
| submit（projects / current / approvals） | 8 / 13 / 12 | 550 / 300 / 350 | 40% / 65% / 60% | 8 / 8 / 10 |
| お客様の承認（projects / approvals） | 8 / 12 | 550 / 350 | 40% / 60% | 8 / 8 |
| 代理承認（projects / approvals） | 6 / 10 | 650 / 450 | 30% / 50% | 8 / 8 |
| 再計画（projects / internal / approvals） | 8 / 6 / 13 | 550 / 650 / 300 | 40% / 30% / 65% | 8 / 10 / 9 |

- 結論 [FACT: 上の計測]: **承認記録の wbs の写しを外す必要は無い**（submit・承認・代理承認は全部 30% 以上）。**外れたのは init の schedCreateOk だけ**で、原因は完了印（current.wbs の doneAt 5 行 ⇔ internal.marks 5 件の相互照合）。同じ init を完了印・marks なしで測ると k ≥ 20（上限で打ち切り）[FACT: 一時 probe 2026-11-27]。wbs の写しを外しても init は減らない → L-10 により**ここで止め、lead-architect の判断待ち**（案: init では doneAt・marks を持てない＝初回保存で完了の行は無い、とする）
- 要件定義書の経路（既存 PATHS）: お客様の承認（approvals: approveOk）が 14 → 13（kind の振り分けの数式分。pad10 1 個の分解能の内）。他は不変。全部 65% 以上
- 参照（UK-3）: 1 文書の評価で使う get/exists は最大 3（trivial 10 − 残り 7）。1 書き込み（バッチ）の合計は最大 5 文書（accounts・案件・current・internal・承認文書）[INFERENCE: 述語の参照先]。上限 20 の内
- S-14（2/30）: エミュレータで `timestamp.date(年, 月, 日)` に暦に無い日を渡すと評価エラー＝拒否、正規表現（月末の無い日・うるう年でない 2/29）でも同じ結果 [FACT: tests/rules/schedule.test.mjs S-14]。**firestore.rules には入れていない**（式が増える。init が 20% を割っているため UK-2 を優先＝L-12）。入れるかは init の扱いと合わせて lead-architect が決める。それまで暦日は画面（SU-06）で止める

## 13. 作り替えの閾値

- WBS の行を可変にする要件が来たら（要件 §13 の範囲外）: マップ 6 キー固定の検査を `schedule/current/rows/{rowId}` のサブコレクションへ移す。承認の写しも行ごとに見直す
- 1 案件の承認記録が 500 件（`LIST_LIMIT`）に近づいたら履歴の購読を kind ごとの `where('kind','==',…)` ＋ `orderBy('at')` に分ける（その時点で複合 Index が要る）
- 管理者の横断ガント（範囲外）を作るときは案件ごとの current を読まず、案件文書の要約に `deliveryDate` を足す（同じ submit の書き込みで）

## ユーザー決定（2026-11-27。OQ-D1〜D3）
- OQ-D1 取り下げ・差し戻しのメモ: **お客様にも見せる**（必須・制御文字の検査あり。脅威分析 S-11）
- OQ-D2 WBS の「完了」: **外せる**（外した人と日時を記録）
- OQ-D3 公開日: **スケジュールを正**（承認依頼されたスケジュールの公開日を表示。無ければ案件情報の launchDate。案件情報の画面でずれを注記）
