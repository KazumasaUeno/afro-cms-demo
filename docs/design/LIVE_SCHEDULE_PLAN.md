# live のスケジュール（予定日）＋ WBS とお客様承認 — 実装計画（XL）

- 日付: 2026-11-27 ／ 作成: lead-architect ／ 状態: **Plan Review 1 往復目 APPROVE WITH CONDITIONS**（security-engineer [`../reviews/2026-11-27-live-schedule-plan-review-security.md`](../reviews/2026-11-27-live-schedule-plan-review-security.md)。HIGH 1・MEDIUM 4・LOW 5）＋ impact-analyzer の追加 10 件を本書へ反映済み。2 往復目は実装後の security 監査で差分を確認する
- 依頼: REQ-LIVE-SCHED-01（ユーザー決定 U-1〜U-4・NC-1〜5・OQ-D1〜D3。すべて確定済み・再確認しない）
- 入力（正）: 要件 [`LIVE_SCHEDULE_WBS.md`](LIVE_SCHEDULE_WBS.md)（AC-01〜14）、データ設計 [`LIVE_SCHEDULE_WBS_DATA.md`](LIVE_SCHEDULE_WBS_DATA.md)（D-1〜3・SR-01〜18・SU-01〜09）、脅威モデル [`../reviews/2026-11-27-live-schedule-threat-model.md`](../reviews/2026-11-27-live-schedule-threat-model.md)（S-1〜16・ST-01〜24・APPROVED WITH CONDITIONS）
- 形式: [`ADMIN_FULL_RIGHTS_PLAN.md`](ADMIN_FULL_RIGHTS_PLAN.md) に合わせる。**本書はコードを含まない**（式・テストの実体は各 Unit）
- 画面: **demo と全く同じ**（`src/features/schedule/*`・`src/features/portal/PortalSchedulePage.tsx`。差分は役割の出し分けと、demo に無い要素を demo の部品の中に置いたものだけ＝AC-13）

---

## 1. DECISION（lead-architect 2026-11-27。理由つき）

脅威モデルはデータ設計より先に書かれた（脅威モデル §6 [UNKNOWN]）。食い違いは**条件の意味**を保ったまま、下の決定で 1 つに揃える。実装はこの節を優先する。

| # | 決定 | 理由 |
|---|---|---|
| L-1 | データ設計 D-1（状態は `projects/{pid}.schedule`）・D-2（下書きは `internal.draft`、current は submit でだけ変わる）・D-3（WBS は WbsId をキーにした 6 キー固定のマップ）を採用 | 要件定義書と同じ型で相互照合を流用でき、状態の写しが 2 か所にならない。下書きをお客様の読める文書に置かないので漏れようがない |
| L-2 | S-1 のお客様の get 条件は `status in [requested, approved]` ではなく **current 自身の `revision >= 1`**（D-2）。S-1 の意味（お客様が下書きの**予定日**を読めない）は「current に下書きの予定日が無い」で満たす。WBS は L-15 | 他文書の `get()` で読み取りを絞ると張ったままのリスナーの挙動が未確認（UK-1）。差し戻し後の current の予定日は「お客様に一度出した版」で、同じ値は submit の approvals（お客様が読める）にも既にある。**画面は §6.2 どおり**、差し戻し後で承認歴なしなら未作成表示（`clientScheduleView`） |
| L-3 | S-15 / ST-18 の「list・size 6・順番固定」は D-3 のマップに読み替え: `keys().hasAll(6)&&hasOnly(6)`。「同じ id 2 回・順番違い」は構造上起きないので、ST-18 は「キー不足・余分・未知キー」で検査する | 式が少ない（UK-2 に効く） |
| L-4 | **同時保存はサーバーでも止める**（S-16-2 を採用）: current・internal に `editSeq`（int。作成時 0）を持たせ、更新は `editSeq == resource.editSeq + 1`。画面は TX 内でも開いた時点の `editSeq` と比べ、違えば AC-08 の文言 | 正直なクライアントだけでなく Rules でも、同じ値から 2 回保存した 2 回目が落ちる（ST-21） |
| L-5 | 案件文書の `schedule` を書く遷移（init・submit・withdraw・approve・reopen）は `stamped()` で `updatedAt` を動かす（データ設計 §2.1）。S-16-1 の「updatedAt を動かさない」は採らない | 状態の変化で一覧の並びが動くのは要件定義書と同じ。`stamped` が本人・時刻を強制するので安全上の差は無い（review 受容） |
| L-6 | `revision` の上限 **50**（S-13・ST-22）。submit で `a.revision <= 50` | 依頼⇄取り下げの無限ループの濫用の上限（T-13）。1 案件の schedule の記録は最大 約 200 件 |
| L-7 | 承認の履歴を kind ごとの購読に分けない（S-16-5 の第 2 案）。承認状態の表示は案件文書から導き、履歴の件数に依存しないことを SU-10 で固定。Index は足さない | 状態の正は案件文書（[FACT] firestore.rules:223-266）。500 件の閾値はデータ設計 §13 |
| L-8 | **取り下げ（withdraw）の note は必須**（OQ-D1）。reopen の note も必須（NC-1）。どちらも代理承認と同じ `reProxyNote && !reNoteControl`。入力欄に「お客様にも表示されます」。履歴（画面・CSV）に出す（U4） | ユーザー決定がデータ設計（任意）より優先。要件定義書の withdraw（任意・`optStr` のみ）は**変えない**（AC-14） |
| L-9 | **完了印（OQ-D2）**: current.wbs[id] は `doneAt` だけ（`doneBy` は持たない＝S-2）。付けた／外した人と日時は `internal.marks[id] = { state:'done'\|'undone', at, by }`（**行ごとの最後の操作だけ** [SAFE ASSUMPTION]）。current の `doneAt` を付ける／外す書き込みは同じ書き込みで `getAfter(internal).marks[id]` が `at==request.time && by==auth.uid && state` 一致、逆向き（marks を変えたら current の doneAt も同じ書き込みで変わる）も要求。`build` 行は doneAt も marks も持てない | ユーザー決定「外せる・外した人と日時を記録」と S-2 の両立 |
| L-10 | **UK-2 の解き方**（§5 の G1）: 最初に計測し、契約を固めてから本実装へ進む。方法は `adminRights.test.mjs` TEST-09（pad10 で通る最大 k を数える）と同じ。合格線は**全経路で 1000 式の 20% 以上の余裕**、get/exists は 1 書き込み **20 の内**。外れたら **approvals の submit / approve から `wbs` を外す**（予定日 3 つだけを写す。外し方の条件は L-11）。外しても外れる経路があれば実装を止め、lead-architect が設計を見直す | 後から外すと U2〜U4 の契約が変わるので先に決める |
| L-11 | **G1 で wbs を外すとき**（review M-2）: Rules の schedule の submit/approve の `hasOnly` から `wbs` を**削除**する（任意キーとして残さない）。テストは ST-09 の wbs の行の代わりに「承認文書に wbs を付ける → 拒否」。fixtures の `sched*Batch` は wbs を付けない形で成立すること。「承認の対象は予定日（3 つ）です」の明記は **U2-0**（履歴の文）・**U3**（依頼・代理承認のダイアログ）・**U4**（PortalApprovalPage・PortalSchedulePage）に割り当て、§7 の画面確認に入れる | Rules と TS は定数を共有できない。任意キーのまま等式だけ外すと任意の wbs を証跡に書ける（T-04/T-05） |
| L-12 | 暦に無い日（2/30）を Rules で拒否できるか（S-14 [UNKNOWN]）は U1 が `timestamp.date()` 等でエミュレータ確認。できなければ「画面のみ」と ST-17 の結果欄に記録（式が増えるなら UK-2 を優先して入れない） | INVESTIGATION REQUIRED を実装時に閉じる |
| L-13 | demo の部品（`src/features/schedule/*`・`PortalSchedulePage`・`RequestApprovalButton`）は `useDemo()` を `useDemoOptional()` ＋ データ源の props に置き換えて live から使う。**demo の DOM・文言・見た目は変えない**（入れ替え前後のスクリーンショット比較）。demo に無い要素は **props が与えられたときだけ** demo の部品の中に出す | U-4・AC-13。liveNoDemoStore を壊さない |
| L-14 | 管理者はスケジュールも全操作（U-3・C-08）。demo の管理者画面は「見るだけ」のまま（live の役割の値だけで分岐）。自己依頼→自己代理承認は止めない（T-17 受容）。履歴に「代理」と「確認の依頼と同じ人」を **kind＋版**で突き合わせて出す | 承認済みデザイン・脅威モデル §6 |
| L-15 | **ACCEPTED RISK（review M-3）**: 差し戻し後（draft・承認歴なし）にアフロ側が変えた WBS の日付・完了日は、画面には出ないが**お客様が API で current を get すれば読める**。塞がない（WBS を internal の下書きに分ける案は式が増え UK-2 に響く）。ST-03 に「差し戻し後に WBS を変えた current はお客様に読める（受容）」を固定する | WBS は承認を要しない進捗の値で、承認済みのときはそのままお客様に見える＝秘匿度が低い。日付の合意は予定日 3 項目が担い、これは submit でしか変わらない |
| L-16 | **ACCEPTED（review L-2）**: current の `updatedBy`（uid）はお客様に見える。uid だけで名前は出さない | approvals の actorUid/Name/Email が既にお客様に見えている（脅威モデル §6 Info）。新しい種類の露出ではない |
| L-17 | **アーカイブの事後条件（review L-1）**: current・internal・schedule の approvals・案件の schedule 分岐は、事前 `proj.archived == false` に加え **事後 `getAfter(project).archived == false`** も課す（S-5 どおり）。ST-07 に「アーカイブと WBS の保存を同じバッチ」→ 拒否を 1 件 | 事前だけだと同じバッチでアーカイブと同時に書ける。式は 1 つ（UK-2 の計測に含める） |
| L-18 | **approve / proxyApprove は表示した中身で送る（review H-1）**: 引数は `approve(shown: {revision, editSeq})`・`proxyApprove(shown: {revision, editSeq, requestedAt}, note)`。TX 内で `current.editSeq !== shown.editSeq` なら「内容が変わりました。最新を読み込みました」で**送らない**。承認文書の写しは**表示に使った値**から組む（TX 内で読み直した値を使わない。写せば Rules の等式でも落ちる）。G1 で wbs を写さない場合も editSeq の照合は残す | requested 中も WBS は編集でき、revision・requestedAt は変わらない。読み直した値で組むと、見ていない WBS への承認が証跡に残る（T-05・S-10-4/5） |
| L-19 | お客様の「最後の確認」（`src/features/projects/clientStatus.ts:74` の `lastLog`）は**要件定義書の記録だけ**で数える（kind で絞る。kind 無しは要件定義）。スケジュールの承認を足さない | 既存の表示の意味を変えない（影響分析） |
| L-20 | **ナビ**: admin・dev は案件詳細のスケジュール区画とルート（`/schedule`・`/dev/schedule`）から入る。**上部のナビ項目は足さない**。ポータルのナビに「スケジュール」（`/portal/schedule`）を足す（`liveNav.test.mjs` の件数を直す）。`/schedule`・`/dev/schedule` は `LiveRequirementsPage` と同じく **HearingGate／選択中の案件の型**で包み、再読み込みしても案件が保たれる | demo の画面構成に合わせる。追加の画面状態を作らない |
| L-21 | `toProject` は `launchDate` を `releaseDate` で**上書きしない**。表示用の値（`schedule.releaseDate ?? launchDate`）は別の項目で返す（`src/features/projects/projectForm.ts:224` が `launchDate` をそのまま編集フォームへ戻すため。上書きすると基本情報の保存で launchDate が書き換わる） | C-01（書き写さない）・影響分析 9 |
| L-22 | **main へは release GO まで merge しない**。`.github/workflows/pages.yml` が main への push ごとに demo を公開するため。merge 前に demo のスクリーンショット差分（`RequestApprovalButton` を使う 7 画面＋スケジュール・ポータルのスケジュール・案件詳細）を確認する | 未承認の差分が demo に出るのを防ぐ（影響分析 5） |

## 2. 契約（Unit 間で同じものを見る。項目の正はデータ設計 §2。下は §1 の修正点だけ）

| 対象 | データ設計からの変更 |
|---|---|
| `schedule/current` | `editSeq:int`（作成 0・更新ごと +1）を追加。`wbs[id]` は `{start,end,doneAt?}`（`doneBy` を削除）。`revision <= 50` |
| `schedule/internal` | `editSeq:int` と `marks: map WbsId → {state:'done'\|'undone', at:timestamp, by:uid}`（build を除く 5 キーの部分集合）を追加。`note` の制御文字は **`reChatControl`**（改行は可・他の C0／DEL／向きの制御は拒否。firestore.rules:433。review L-3） |
| approvals `schedule-r{rev}-withdraw` | `note` **必須**（代理承認と同じ検査） |
| approvals submit / approve の写し | 既定は `buildDue?, deliveryDate, releaseDate, wbs?`。**G1 で外れたら `wbs` を hasOnly から削除**（L-11）。結論は U1 の Rules と U2 の書き込みの両方のテストで確認 |
| repositories（live。U2 が提供） | `useLiveSchedule(pid)` → `{ summary, current, internal, loading, error }`（お客様は current だけ・`revision>=1` のときだけ購読）／ `useLiveScheduleActions(pid)` → `save(draftAndMeta, openedEditSeq)`・`saveWbs(wbs, marks, openedEditSeq)`・`submit()`・`withdraw(note)`・`reopenAndSave(draft, note, openedEditSeq)`・**`approve(shown: {revision, editSeq})`**（お客様）・**`proxyApprove(shown: {revision, editSeq, requestedAt}, note)`**（admin）。写しは `shown` に対応する表示値から組む（L-18）。失敗は既存と同じ形（permission-denied → 「権限がありません」、競合 → `ScheduleConflictError`、二重承認 → WARN を出して成功扱い／種類違いは例外） |
| 純関数（U2 が `src/live/schedule.ts` に置く） | `scheduleDoc`・`scheduleInternalDoc`・`scheduleSummaryOf`・`clientScheduleView`・`scheduleForSave`・`wbsProgressLive`（構築行は tasks、他は doneAt）・`scheduleConflict`（editSeq と revision） |
| 型（U2 が `src/types/index.ts`） | `ApprovalLog` に kind（`'requirements'\|'schedule'`）と withdraw/reopen の note。変えたら `npm run ai:gen` → `ai:check`（§6） |
| 部品のデータ源（U3 が `src/features/schedule/*` に定義） | `ScheduleSource`（読み取り値＋上の操作の関数＋`role`・`canEdit`・`canProxy`）。**props が無ければ従来どおり DemoStore**。U4 は `WbsSection client` と `PortalSchedulePage` にこれを渡す |

## 3. 単位（Write Scope は重ならない）

| Unit | 担当 | Write Scope（これ以外は書かない） | 内容 |
|---|---|---|---|
| **U1** Rules | database-engineer | `firestore.rules`・`tests/rules/schedule.test.mjs`（新規）・`tests/rules/fixtures.mjs`（末尾に `scheduleSeed`・`sched*Batch` を**追加だけ**）・`tests/rules/adminRights.test.mjs`（OPS と TEST-09 の PATHS に**追加だけ**）・`tests/rules/mutation.test.mjs`（変異の**追加だけ**）・`docs/design/LIVE_SCHEDULE_WBS_DATA.md`（§12 の結果と §2 の §1/§2 反映だけ） | **U1-0（段 0）**: `validProject` に `schedule` を許す・`projCreateOk` で `consult`/`schedule` を禁止・`actorOk` を `actorBase && kind=='requirements'` に分解（同値）・**既存の `apprCreateOk` の本体を一字も変えずに `reqApprCreateOk(pid, aid, a)` へ移し、`apprCreateOk` は kind の振り分けだけ**（`'requirements'` → `reqApprCreateOk`、`'schedule'` → 段 0 は `false`／段 1 は `schedApprOk`、それ以外 `false`）。**U1-1（G1）**: §5 の計測。**U1-2**: 全述語。**新しい OR の分岐は既存の分岐の後ろ**に置く。既存の変異テストのアンカー文字列（例 ` && d.proxy == true`・`&& l.side == 'client' && !l.keys().hasAny(['proxy'])`・` && !d.note.matches(reNoteControl())`・`|| (r == 'admin'\n`・` && d.get('actorRole', acc.role) == acc.role`）と TEST-09 の関数名を schedule 側で**再利用しない**（共通の検査は `schedProxyFields(d)` などの別名の関数）。**U1-3**: SR-01〜18・ST-01〜24（§10.2） |
| **U2** データ層 | frontend-engineer | `src/live/schedule.ts`（新規）・`src/live/model.ts`・`src/live/repositories.tsx`・`src/live/projectView.ts`・`src/types/index.ts`・`src/features/projects/clientStatus.ts`（kind で絞るだけ）・`tests/unit/liveSchedule.test.mjs`（新規）・`tests/unit/liveScheduleHistory.test.mjs`（新規） | **U2-0（段 0）**: `approvalLogFrom` / `approvalLogsFrom` を kind 対応（「スケジュール（第N版）」・kind 無しは要件定義・依頼者の突き合わせを **kind＋版**・G1 で外したら「承認の対象は予定日」）。`clientStatus` の lastLog を要件定義だけに（L-19）。**U2-1**: §2 の純関数・`toProject` の段階と表示用の公開予定（L-21: launchDate を上書きしない）・`projectView.ts` に live の schedule を渡す（`ProjectDetailView.tsx:130-131` が `state.schedule` を読む）。**U2-2**: §2 の hooks と TX（データ設計 §4・L-18。`flushNow` 相当・`proxyVersionOk`・`cleanProxyNote` を**呼ぶだけ**）。SU-01〜10 |
| **U3** アフロ側の画面 | frontend-engineer | `src/features/schedule/**`・`src/features/portal/RequestApprovalButton.tsx`・`src/live/pages/LiveSchedulePage.tsx`（新規）・`src/live/pages/LiveProjectDetailPage.tsx`（スケジュールの区画と「次に必要な作業」） | **U3-a**: demo 部品のデータ源の差し込み（L-13。DOM 不変）。**U3-b**: `/schedule`・`/dev/schedule` の live 画面（予定日・WBS・承認の依頼・取り下げ・再計画・完了印・代理承認のダイアログ・競合の文言・G1 で外したら「承認の対象は予定日」）。案件詳細の「次に必要な作業」を、要件定義書の承認後は**スケジュール**へ（`LiveProjectDetailPage.tsx:61-63` の「要件定義書を見る」を置き換え） |
| **U4** お客様ポータル＋承認の履歴 | frontend-engineer | `src/features/portal/PortalSchedulePage.tsx`・`src/live/pages/LivePortalSchedulePage.tsx`（新規）・`src/live/pages/PortalApprovalPage.tsx`・`src/features/projects/ApprovalHistory.tsx` | ポータルのスケジュール（`clientScheduleView`。担当・メモ・保存者・構築タスクを出さない、「遅れ」→「調整中」）。確認・承認ページに**スケジュールの区画を要件定義書の章とは別に**（C-05）。承認は表示した `{revision, editSeq}` で送る（L-18）。履歴: 代理・同一人物の表示、**withdraw / reopen の note を画面と CSV に出す**（OQ-D1・L-8）。G1 で外したら「承認の対象は予定日」 |
| **INT** 統合 | lead-architect | `src/live/LiveApp.tsx`（ルート 3 本。admin/dev は HearingGate／選択中の案件の型）・`src/live/liveNav.ts`（ポータルに「スケジュール」だけ）・`tests/unit/liveNav.test.mjs`（件数）・`scripts/seed-emulator.mjs`（スケジュールの種を追加だけ）・`docs/CHANGELOG.md`・`docs/operations/RUNBOOK_FIREBASE.md` §6・`docs/TODO.md` | ルートとナビ（L-20）。Runbook に段 0 の床・戻す順・別々の CLI 実行。LEGAL の TODO。統合後の全テスト・demo のスクリーンショット差分（L-22） |

### 3.1 順番と依存

```
U1-0 ─┐
      ├→ 段 0 を専用のコミット（専用ブランチ）に切る → [段 0 を出せる状態]（デプロイはユーザー GO 後）
U2-0 ─┘
U1-1（計測）→ G1: wbs を写すか決定（§1 L-10 の下と DATA §12 に記録）
G1 → U1-2/U1-3 ∥ U2-1/U2-2
U3-a（G1 と無関係。最初から並行可）
U2-2 ＋ U3-a → U3-b
U2-2 ＋ U3-a → U4
U1 ＋ U3-b ＋ U4 → INT → 全テスト → レビュー（同時に 1 回）→ 統合した指摘 → 修正 1 回
```

- 並行の上限: U1 と U2 と U3-a の 3 本（Write Scope は §3 で分離。同じ作業ツリーを 2 セッションで触らない＝1.19。並行するなら Unit ごとに worktree）
- U3-a は demo だけで確認できる（live の hooks 不要）。U3-b・U4 は U2-2 の hooks の型（§2）に合わせる

## 4. 変更しない部分（Do Not Change）

- **要件定義書の Rules と挙動**: `actorOk` の kind 固定の意味（分解は同値のみ）・`approvalId()`（`requirements-r{rev}-{action}`）・submitOrWithdrawOk / approveOk / proxyApproveOk / clientApprove / adminProxyApprove の式・`apprCreateOk` の旧本体（`reqApprCreateOk` へ**そのまま移すだけ**）・withdraw の note（任意）・既存 approvals のテスト（AC-14）
- **`devTransition`・`reqUpdateOk`・`projUpdateOk` の既存分岐のテキストと評価順**（schedule の分岐は既存の分岐の後ろに足す。review L-5）
- **既存の変異テスト**（`mutation.test.mjs`）: 変えない。どうしてもアンカーが崩れる場合に変えてよいのは**アンカーの文字列だけ**（変異の意味は同じ）で、その差分をレビューで確認する（review M-1）
- **TEST-09 の既存 PATHS**（adminRights.test.mjs:275-285）は書き換えず、20% 以上の余裕の assert（:304）を緑のまま保つ
- approvals・messages は追記のみ（update/delete は admin も false）／ schedule の文書も delete false ／ aiDrafts は `if false`
- `projUpdateOk` の既存分岐（基本情報・アーカイブ・アサイン・要件定義書・相談）の `ch.hasOnly` に `schedule` を**入れない**
- 役割の判定: `roleOf`・`mine`・admin の別分岐・無効化／メール不一致は 'none'・お客様は `projectId` の案件だけ
- お客様が書けるもの: 承認（案件の schedule の承認キー＋承認文書）・要件定義書の承認・相談だけ。`proxy`・`note`（代理）・`approvedVia`・`actorRole:'admin'` は書けない
- `src/live/proxyApproval.ts`（呼ぶだけ）・`ProposalView.tsx`・`LiveRequirementsPage.tsx`（要件定義書の「スケジュール」章を含む）
- **demo の画面・DemoStore・reducer・`src/data/schedule.ts` の検査関数**（共用するが変えない）。demo の build は Firebase に依存しないまま
- `clientStatus` の「最後の確認」の意味（要件定義書だけ。L-19）・`projects.launchDate`（上書き・書き写しをしない。L-21）
- Functions（変更なし）・`firestore.indexes.json`（新規 Index なし）・AI のフラグと allowlist
- 構築タスクのゲート（NC-3: 止めない）・既存の approvals のバックフィルなし（kind 無しは要件定義）
- **main への merge**（release GO まで。L-22）

## 5. 計測ゲート G1（UK-2・UK-3。L-18 の editSeq と L-17 の事後 archived を含めた形で計測）

| 計測する経路（最大 payload: WBS 6 行に完了印・note 200 字・予定日 3 つ・buildDue あり） | 関数（例） | 合格 |
|---|---|---|
| **init**（案件・current の create・internal の create。wbs 6 行・assignees 6 件・note 200 字・`savedByName == accounts.name`）（review M-4） | 案件の init 分岐・current／internal の create | 各 ≦ 800 式・get ≦ 20 |
| **current＋internal の同時保存**（wbs 6 行に完了印＋marks 5 件＋assignees 6 件＋note 200 字・editSeq）（review M-4） | `validWbs`・marks の両向き照合・`validInternal` | 同上 |
| submit（案件・current・internal・approvals の 1 TX） | 案件の submit 分岐・current の submit・`schedApprOk` submit | 同上 |
| お客様の承認（案件・approvals） | 案件の本人承認・`schedApprOk` approve | 同上 |
| 代理承認（同上＋proxy） | 案件の代理分岐・`schedApprOk` 代理 | 同上 |
| 再計画（internal.draft・案件・approvals reopen） | internal の保存＋reopen | 同上 |

- 計測は U1-1 で `adminRights.test.mjs` TEST-09 の PATHS に**追加**する（同じ方法・timeout 900 秒）。既存 PATHS の 20% 余裕も同時に確認（新しい分岐で requirements の経路が増えていないこと）。結果（経路ごとの k と式数）を `LIVE_SCHEDULE_WBS_DATA.md` §12 と §1 L-10 の下に書く
- **完了印・同時保存の経路が外れた場合**は wbs を写さなくても減らないので、marks の照合を「変わった行だけ」に絞る（`diff().affectedKeys()`）。それでも外れたら設計を見直す

## 6. テスト（コマンドと期待件数）

| コマンド | 前提 | 期待 |
|---|---|---|
| `npm run test:rules` | 着手前に基準の件数を TASK に記録（CHANGELOG:870 の 301 件以降に増えている可能性あり。**実行して取る**） | 基準 ＋ **約 95 件**（schedule.test.mjs 約 78・adminRights の OPS と計測 約 9・mutation 約 10）。失敗 0・skip 0。既存の件数が減らない |
| `npm run test:unit` | 同上 | 基準 ＋ **約 50 件**（SU-01〜10）。liveNoDemoStore・liveNav（件数を更新）・adminProxyApproval・liveDashboard が緑 |
| `npm run test:functions` | 変更なし | 基準と同数・失敗 0（回帰） |
| `npm run rules:check` | 生成区間は触らない | 差分なし |
| **`npm run ai:gen` → `npm run ai:check`** | `src/types/index.ts` を変えた後（影響分析 1） | check が差分なし |
| `npm run typecheck`・`npm run build`（demo。Firebase 非依存のまま）・`npm run build:live`・`npm run build:emulator` | — | 成功 |
| `node scripts/ai-verify.mjs`（体制側） | — | 要約で失敗 0 |
| 画面（エミュレータ `npm run emulators` ＋ `npm run seed:emulator` ＋ `npm run dev:emulator`、Chrome） | Focused E2E の仕組みは無い（手動。使えなければ「未検証」） | admin（担当外の案件）・担当の開発者・お客様で §7 の操作。再読み込みで案件が保たれる（L-20） |
| demo のスクリーンショット差分（L-22） | U3-a 前後と merge 前 | `RequestApprovalButton` を使う 7 画面＋`/schedule`・`/dev/schedule`・`/portal/schedule`・案件詳細で差分 0 |

**回帰の一覧（影響分析。テストまたは画面で確認）**: `schedule` を持つ案件で 基本情報の変更・アーカイブ・アサイン・相談・要件定義書の遷移（依頼・差し戻し・承認・代理承認）が通る ／ adminProxyApproval の kind 無しの記録は要件定義 ／ liveNoDemoStore ／ liveDashboard の段階の文言 ／ demo の build が Firebase 非依存

- Rules テストは `emulators:exec` を通す（`scripts/test-rules.mjs`。プロジェクトは `demo-` 固定）
- Full E2E は無い。リリース前の Smoke は INT が手順を Runbook に書き、ユーザー GO 後に実施

## 7. 完了条件

- AC-01〜14 が満たされる（AC-13 はスクリーンショット比較、他はテストの件数つき）
- 画面確認: 要件定義書の承認前は保存できない／案件詳細の「次に必要な作業」が承認後はスケジュール／予定日→WBS→承認の依頼→お客様の承認／**お客様が見ている間に WBS が変わったら承認は送られず「内容が変わりました」**（L-18）／取り下げ（note 必須）→再依頼で rev+1 と履歴の note（画面・CSV）／代理承認（note）と履歴の「代理」「依頼と同じ人」／承認後の予定日変更で再計画（note 必須）→再依頼／WBS だけの変更は承認済みのまま／完了印を付けて外す（internal に人と日時）／2 タブで同時保存→後の方が競合の文言／アーカイブ中は全員読むだけ／G1 で wbs を外した場合は 3 画面に「承認の対象は予定日」
- U1 の完了条件: §10.2 の ST-24 の変異の列挙が全部検出される・TEST-09 の既存 PATHS が 20% 以上の余裕のまま
- レビュー: code-reviewer・security-engineer（実装後監査。S-1〜16 の全件と review H-1〜L-5 の反映）・**別系統モデルレビュー**（認可の変更。自社プロダクトのため送付可否の確認は不要 [INFERENCE: AFRO CMS は自社。違えば止めて確認]）・acceptance-auditor（XL）
- G1 の計測値・基準件数・増えた件数が記録されている

## 8. リリース（ユーザー GO を段ごとに取る）

| 段 | 出す順 | 中身 | 戻し方 |
|---|---|---|---|
| **段 0** | **Rules（U1-0）→ Hosting（U2-0）** | Rules: `schedule` キーの許可（作成時は禁止）・`actorOk` の分解（同値）・`reqApprCreateOk` への移動と kind の振り分け（schedule は全拒否）。Hosting: 履歴の kind 対応と clientStatus の kind 絞りだけ。**誰もスケジュールを書けない** | 旧版へ戻せる（schedule のデータがまだ無い） |
| **段 1** | **Rules（U1 全部）→ Hosting（U3・U4・INT）**。Functions なし | 全機能 | **Hosting を段 0 の版へ → その後 Rules を段 0 へ**。**段 0 より前へは Rules を戻さない**（`schedule` を持つ案件で旧 `validProject` の hasOnly が落ち、基本情報・アーカイブが全件失敗する＝S-16-4）。重い不具合は Rules を前へ直す（forward fix） |

- **段 0 は専用のコミット（専用ブランチ）**にする。デプロイは**チェックアウトした作業ツリーからビルド**されるので、段 0 を出すときは段 0 のコミットをチェックアウトして出す（段 1 の変更を混ぜない）（影響分析 6）
- **Rules と Hosting は別々の CLI 実行**で、Rules を先に出す（`--only hosting,firestore:rules` のようにまとめない）（影響分析 7）
- **段 0 の前に、本番の現在の Rules のリリース ID を Console から取得**し、リポジトリの `firestore.rules` と食い違っていないかを確認する（リポジトリ外のドリフト。影響分析 10）。段 0 を出した時点で、それが **Rules の床**。リリース ID を `docs/TODO.md` と Runbook に記録（INT）
- main への merge は release GO の後（L-22）
- 段 0 と段 1 の間に待つ日数は決めない。[INFERENCE] 旧 Hosting はスケジュールの記録を書かないので、段 1 の Rules と組んでも壊れない
- 順番を誤った場合（新 Hosting × 旧 Rules）: スケジュールの書き込みは全件拒否（安全側）、要件定義書は影響なし（データ設計 §9）
- 作られた文書・承認の記録は戻しても消さない（Retain）。Migration なし（データ設計 §8）
- 公開後 1 週間で Firestore の Read 件数を確認（データ設計 §10）

## 9. リスク

| # | リスク | 影響 | 対策 |
|---|---|---|---|
| R-1 | UK-2: 最大 payload で 1000 式を超える（init・同時保存を含む） | 保存・承認・依頼が本番で全件失敗 | G1 を最初に置く（§5 の 6 経路）。外れたら wbs を写さない（L-10・L-11）・marks の照合を変わった行だけに |
| R-2 | U3-a の差し込みで demo の DOM・挙動が変わる（WbsSection 591 行のドラッグ・下書きの同期） | 承認済みデザインの破壊 | props が無いときの経路を一字も変えない・前後のスクリーンショット比較（7＋4 画面）・main へ merge しない（L-22） |
| R-3 | live の入口から `useDemo(` に届く | live 画面が落ちる（0.47.4 の再発） | `liveNoDemoStore.test.mjs` を INT で必ず実行 |
| R-4 | 段 0 より前へ Rules を戻す・段 0 と段 1 を混ぜて出す・まとめて出す運用ミス | 基本情報・アーカイブの全件失敗／順番違い | Runbook に床・専用コミット・別々の CLI 実行・本番リリース ID の事前確認（§8） |
| R-5 | marks の相互照合（L-9）で current と internal の片側だけ書く経路が残る | 完了印の記録漏れ | 両向きの照合・ST-18 に「current だけ」「internal だけ」の拒否 |
| R-6 | 承認の履歴 500 件の押し出し | 古い記録が画面に出ない（状態は案件文書なので壊れない） | L-6・L-7（SU-10）・データ設計 §13 |
| R-7 | オフライン中の TX | 保存できない | 既存どおり「保存できませんでした」 |
| R-8 | LEGAL: 代理承認・お客様の承認が納期の合意に当たるか | 契約上の扱い | **LEGAL REVIEW REQUIRED**。AI は結論を出さない。`docs/TODO.md`（INT） |
| R-9 | `timestamp.date()` で暦日を検査できない（L-12） | 2/30 を直接書かれると表示が崩れる可能性 | 画面の検査と読み込み時に捨てる（SU-03） |
| R-10 | 既存の変異テストのアンカーが schedule の式と重なる（review M-1） | 既存テストの書き換え＝AC-14 の検証が弱まる | `reqApprCreateOk` への移動・アンカー断片の再利用禁止（§3 U1）・変えてよいのはアンカー文字列だけ（§4） |
| R-11 | 差し戻し後の WBS がお客様に API で読める（L-15） | 未依頼の進捗の値の露出（低） | **受容**。ST-03 で挙動を固定 |

## 10. 対応表（どの条件・テストをどの Unit が満たすか）

### 10.1 脅威モデルの条件（S-x）

| S | 内容 | Unit | 本書での扱い |
|---|---|---|---|
| S-1 | current・internal の get | U1（Rules）／U2（rev 0 で購読しない）／U4（拒否を未作成と同じ表示） | L-2・L-15（WBS は受容） |
| S-2 | お客様の読める文書に社内値を置かない | U1（hasOnly）／U2（`scheduleForSave`） | L-9 で doneBy も internal へ・L-16 |
| S-3 | 要約は submit 済みの値だけ | U1／U2 | データ設計どおり・L-21 |
| S-4 | 書ける人 | U1 | — |
| S-5 | archived・要件定義書 approved のゲート | U1／U3（ボタンの出し分け） | L-17（事後も） |
| S-6 | kind の先分岐 | U1-0 | 段 0・`reqApprCreateOk` |
| S-7 | ID の接頭辞と kind の結び付け | U1-0（requirements 側）／U1-2（schedule 側） | — |
| S-8 | お客様の承認の形 | U1／U2／U4 | 状態キーは案件文書（L-1） |
| S-9 | 代理承認の形 | U1／U2（`cleanProxyNote` を呼ぶ）／U3（ダイアログ） | — |
| S-10 | 承認の対象の固定 | U1（1〜4）／U2・U3・U4（5） | 4 は G1（L-10・L-11）、5 は L-18（editSeq） |
| S-11 | submit / withdraw / reopen の note | U1／U3（「お客様にも表示されます」）／U4（履歴・CSV） | L-8 |
| S-12 | 承認後の予定日変更は reopen と同じ書き込み | U1／U2（`reopenAndSave`） | — |
| S-13 | current の形と revision 上限 | U1 | L-6（50） |
| S-14 | 日付の形式・範囲・順序 | U1／U2（画面の検査・2/30） | L-12 |
| S-15 | wbs と internal の検査 | U1／U2 | L-3・L-9・internal.note は `reChatControl` |
| S-16 | 要約・消失防止・戻し方・押し出し | U1（1〜3）／INT（4: Runbook・§8）／U2（5: SU-10） | L-4・L-5・L-7 |

### 10.2 Rules テスト（SR-x はデータ設計 §7.1、ST-x は脅威モデル §5。すべて U1。ファイルは `tests/rules/schedule.test.mjs`、別記のみ他ファイル）

| SR | 対応する ST | 備考 |
|---|---|---|
| SR-01 init の権限・ゲート | ST-01・ST-02・ST-06 | email_verified=false も |
| SR-02 init の形 | ST-20（一部） | `projCreateOk` は段 0 |
| SR-03 予定日 | ST-17 | 2/30 の結果を記録（L-12） |
| SR-04 WBS | ST-18 | L-3 で読み替え・L-9 の marks・片側だけの拒否（R-5） |
| SR-05 internal | ST-19 | marks の偽装（by が他人・at が過去）・**note に C0（U+0001）→ 拒否**（L-3） |
| SR-06 読み取り | ST-03 | L-2。list は全員拒否。**差し戻し後に WBS を変えた current はお客様が読める（受容。L-15）** |
| SR-07 submit | ST-05・ST-22 | revision 51 の拒否 |
| SR-08 依頼中の変更 | ST-10 | WBS の変更で editSeq が +1 |
| SR-09 withdraw | ST-16 | **note 空も拒否**（L-8） |
| SR-10 本人の承認 | ST-08・ST-09 | wbs の行は G1 の結論次第。外した場合は「承認文書に wbs → 拒否」（L-11） |
| SR-11 代理承認 | ST-12 | 同上 |
| SR-12 再計画 | ST-11・ST-16 | — |
| SR-13 追記のみ | ST-13（後半） | — |
| （追加）同時の承認・差し戻し・二重 | ST-13（前半） | 決定的 ID |
| SR-14 kind の分離 | ST-14 | 段 0 で schedule 全拒否のテストも |
| SR-15 アーカイブ | ST-07 | 読み取りは許可。**アーカイブと WBS の保存を同じバッチ → 拒否**（L-17） |
| SR-16 回帰 | ST-15・ST-20（後半） | 既存ファイルは無変更で緑。`adminRights.test.mjs` の OPS に追加。§6 の回帰の一覧 |
| （追加）楽観ロック | ST-21 | L-4 の editSeq・approved* を消す set の拒否 |
| （追加）お客様の読める文書に社内値 | ST-04 | hasOnly の拒否 |
| SR-17 式の上限 | ST-23 | `adminRights.test.mjs` TEST-09 の PATHS（G1・§5 の 6 経路） |
| SR-18 mutation | ST-24 | `mutation.test.mjs`。**最低限の変異**（review L-4）: ① kind の先分岐 ② `schedule-r` の接頭辞 ③ current の `revision>=1` ④ internal にお客様の分岐が無い ⑤ proxy／actorRole の強制 ⑥ 事前の archived ⑦ 事後の archived ⑧ `getAfter(current)` との写しの等式 ⑨ editSeq の +1 ⑩ marks の照合（current→internal） ⑪ marks の照合（internal→current） |

### 10.3 単体テスト（SU-x。すべて U2。`tests/unit/liveSchedule*.test.mjs`）

| SU | 対象 | 追加 |
|---|---|---|
| SU-01・SU-02 | 履歴の kind 対応・kind＋版の突き合わせ（C-04・AC-11）・withdraw/reopen の note・clientStatus の lastLog が要件定義だけ（L-19） | U2-0（段 0 に含む） |
| SU-03〜SU-08 | データ設計 §7.2 どおり | SU-05 に「launchDate を上書きしない」（L-21）、SU-07 に `marks` と `editSeq` |
| SU-09 | 競合判定 | editSeq の競合（保存）に加え、**WBS だけ変わった（editSeq が違う）→ 承認しない**をお客様・代理の両方で。写しが表示値から組まれること（L-18） |
| **SU-10**（新） | 承認状態の表示が履歴の件数に依存しない（L-7） | 履歴 0 件・500 件ちょうどで同じ表示 |

## 11. 記録

- 判断の正: 本書 §1（このリポジトリに `docs/DECISIONS.md` は無い [FACT: ls 2026-11-27]。前回計画と同じく計画書の DECISION 節を正とする）。G1 の結論は §1 L-10 の下に INT が追記し、データ設計 §12 にも書く
- `docs/TODO.md`: LEGAL（R-8）・段 0 の Rules の床のリリース ID・完了印の全履歴（L-9 の範囲外）・受容リスク L-15
- 学習の判断: G1 の計測値と UK-1 の観察（任意）を `docs/knowledge/tech/firestore.md`（体制側。TECHNOLOGY）へ載せるかを INT で判断
