# live のスケジュール（予定日）＋ WBS とお客様承認 — 実装計画（XL）

- 日付: 2026-11-27 ／ 作成: lead-architect ／ 状態: **Plan Review 待ち**（security-engineer 同席。実装者以外が判定。2 往復まで、残る HIGH は実装後の確認条件へ）
- 依頼: REQ-LIVE-SCHED-01（ユーザー決定 U-1〜U-4・NC-1〜5・OQ-D1〜D3。すべて確定済み・再確認しない）
- 入力（正）: 要件 [`LIVE_SCHEDULE_WBS.md`](LIVE_SCHEDULE_WBS.md)（AC-01〜14）、データ設計 [`LIVE_SCHEDULE_WBS_DATA.md`](LIVE_SCHEDULE_WBS_DATA.md)（D-1〜3・SR-01〜18・SU-01〜09）、脅威モデル [`../reviews/2026-11-27-live-schedule-threat-model.md`](../reviews/2026-11-27-live-schedule-threat-model.md)（S-1〜16・ST-01〜24・APPROVED WITH CONDITIONS）
- 形式: [`ADMIN_FULL_RIGHTS_PLAN.md`](ADMIN_FULL_RIGHTS_PLAN.md) に合わせる。**本書はコードを含まない**（式・テストの実体は各 Unit）
- 画面: **demo と全く同じ**（`src/features/schedule/*`・`src/features/portal/PortalSchedulePage.tsx`。差分は役割の出し分けと、demo に無い要素を demo の部品の中に置いたものだけ＝AC-13）

---

## 1. DECISION（lead-architect。理由つき）

脅威モデルはデータ設計より先に書かれた（脅威モデル §6 [UNKNOWN]）。食い違いは**条件の意味**を保ったまま、下の決定で 1 つに揃える。実装はこの節を優先する。

| # | 決定 | 理由 |
|---|---|---|
| L-1 | データ設計 D-1（状態は `projects/{pid}.schedule`）・D-2（下書きは `internal.draft`、current は submit でだけ変わる）・D-3（WBS は WbsId をキーにした 6 キー固定のマップ）を採用 | 要件定義書と同じ型で相互照合を流用でき、状態の写しが 2 か所にならない。下書きをお客様の読める文書に置かないので漏れようがない |
| L-2 | S-1 のお客様の get 条件は `status in [requested, approved]` ではなく **current 自身の `revision >= 1`**（D-2）。S-1 の意味（お客様が下書きの日付を読めない）は「current に下書きが無い」で満たす | 他文書の `get()` で読み取りを絞ると張ったままのリスナーの挙動が未確認（UK-1）。差し戻し後の current は「お客様に一度出した版」で、同じ値は submit の approvals（お客様が読める）にも既にある＝新しい露出は無い。**画面は §6.2 どおり**、差し戻し後で承認歴なしなら未作成表示（`clientScheduleView`） |
| L-3 | S-15 / ST-18 の「list・size 6・順番固定」は D-3 のマップに読み替え: `keys().hasAll(6)&&hasOnly(6)`。「同じ id 2 回・順番違い」は構造上起きないので、ST-18 は「キー不足・余分・未知キー」で検査する | 式が少ない（UK-2 に効く） |
| L-4 | **同時保存はサーバーでも止める**（S-16-2 を採用）: current・internal に `editSeq`（int。作成時 0）を持たせ、更新は `editSeq == resource.editSeq + 1`。画面は TX 内でも開いた時点の `editSeq` と比べ、違えば AC-08 の文言 | データ設計の「開いた時の updatedAt と TX 内を比べる」は正直なクライアントしか守らない。同じ値から 2 回保存すると 2 回目が Rules で落ちる（ST-21） |
| L-5 | 案件文書の `schedule` を書く遷移（init・submit・withdraw・approve・reopen）は `stamped()` で `updatedAt` を動かす（データ設計 §2.1）。S-16-1 の「updatedAt を動かさない」は採らない | 状態の変化で一覧の並びが動くのは要件定義書の遷移と同じ。WBS・予定日の保存は案件文書に触れない（並びは動かない）。安全上の差は無い（`stamped` は本人・時刻を強制） |
| L-6 | `revision` の上限 **50**（S-13・ST-22）。submit で `a.revision <= 50` | 依頼⇄取り下げの無限ループで approvals を増やす濫用の上限（T-13）。1 案件の schedule の記録は最大 約 200 件（50 版 × submit/withdraw/approve/reopen） |
| L-7 | 承認の履歴を kind ごとの購読に分けない（S-16-5 の第 2 案）。要件定義書・スケジュールの**承認状態の表示は案件文書から導き、履歴の件数に依存しない**ことを単体テストで固定する（SU-10）。Index は足さない | 状態の正は案件文書（[FACT] データ設計 §0・firestore.rules:223-266）。500 件に近づいたら分ける閾値はデータ設計 §13 のまま |
| L-8 | **取り下げ（withdraw）の note は必須**（OQ-D1 のユーザー決定）。reopen の note も必須（NC-1）。どちらも代理承認と同じ `reProxyNote && !reNoteControl`（trim 後 1〜200・改行／C0／DEL／向きの制御を拒否）。入力欄に「お客様にも表示されます」 | ユーザー決定がデータ設計（withdraw は任意）より優先。要件定義書の withdraw の note（任意・制御文字の検査なし）は**変えない**（AC-14） |
| L-9 | **完了印（OQ-D2）**: current.wbs[id] は `doneAt` だけ持つ（`doneBy` は持たない＝S-2）。付けた／外した人と日時は `internal.marks[id] = { state:'done'\|'undone', at, by }`（**行ごとの最後の操作だけ**を残す [SAFE ASSUMPTION]）。Rules: current の `doneAt` を付ける／外す書き込みは、同じ書き込みで `getAfter(internal).marks[id]` が `at==request.time && by==auth.uid && state` 一致であること。`build` 行は doneAt も marks も持てない | ユーザー決定「外せる・外した人と日時を記録」と S-2（完了印を付けた人をお客様の読める文書に置かない）の両立。全履歴が要るなら別件 |
| L-10 | **UK-2 の解き方**（§5 の G1）: 最初に計測し、契約を固めてから本実装へ進む。方法は `adminRights.test.mjs` TEST-09（詰め物 pad10 で通る最大 k を数える）と同じ。合格線は **全経路で 1000 式の 20% 以上の余裕**、get/exists は 1 書き込み **20 の内**。外れたら **approvals の submit / approve の写しから `wbs` を外す**（予定日 3 つだけを写す）。その場合: 承認の対象は予定日だけと画面・履歴に明記（S-10-4）、ST-09 の wbs の行は削除、データ設計 §2.4 に追記。外しても外れる経路があれば実装を止め、lead-architect が設計を見直す（ユーザー確認事項ではない） | 削り所はデータ設計 §12 で決まっている。後から外すと U2〜U4 の契約が変わるので先に決める |
| L-11 | 暦に無い日（2/30）を Rules で拒否できるか（S-14 [UNKNOWN]）は U1 が `timestamp.date()` 等でエミュレータ確認。できなければ「画面のみ」と ST-17 の結果欄に記録（式が増えるなら UK-2 を優先して入れない） | INVESTIGATION REQUIRED を実装時に閉じる |
| L-12 | demo の部品（`src/features/schedule/*`・`PortalSchedulePage`・`RequestApprovalButton`）は `useDemo()` を `useDemoOptional()` ＋ データ源の props に置き換えて live から使う。**demo の DOM・文言・見た目は変えない**（入れ替え前後のスクリーンショットを比べる）。代理承認・完了印・競合の文言など demo に無い要素は、**props が与えられたときだけ**、demo の部品（Dialog・Button・toast）の中に出す | U-4・AC-13。live の入口から `useDemo(` に届かない静的テスト（liveNoDemoStore）を壊さない |
| L-13 | 管理者はスケジュールも全操作（U-3・C-08）。demo の管理者画面は「見るだけ」のまま（L-7 of ADMIN_FULL_RIGHTS と同じ: live の役割の値だけで分岐） | 承認済みデザインを変えない |
| L-14 | 自己依頼→自己代理承認は止めない（T-17 受容。前回 U-2）。履歴に「代理」と「確認の依頼と同じ人」を **kind＋版**で突き合わせて出す | 脅威モデル §6 |

## 2. 契約（Unit 間で同じものを見る。項目の正はデータ設計 §2。下は §1 の修正点だけ）

| 対象 | データ設計からの変更 |
|---|---|
| `schedule/current` | `editSeq:int`（作成 0・更新ごと +1）を追加。`wbs[id]` は `{start,end,doneAt?}`（`doneBy` を削除）。`revision <= 50` |
| `schedule/internal` | `editSeq:int` と `marks: map WbsId → {state:'done'\|'undone', at:timestamp, by:uid}`（build を除く 5 キーの部分集合）を追加 |
| approvals `schedule-r{rev}-withdraw` | `note` **必須**（代理承認と同じ検査） |
| approvals submit / approve の写し | 既定は `buildDue?, deliveryDate, releaseDate, wbs?`。**G1 で外れたら `wbs` を写さない**（定数 1 つで切り替え。U1 の Rules と U2 の書き込みが同じ結論を使う） |
| repositories（live。U2 が提供） | `useLiveSchedule(pid)` → `{ summary, current, internal, loading, error }`（お客様は current だけ・`revision>=1` のときだけ購読）／ `useLiveScheduleActions(pid)` → `save(draftAndMeta, openedEditSeq)`・`saveWbs(wbs, marks, openedEditSeq)`・`submit()`・`withdraw(note)`・`reopenAndSave(draft, note, openedEditSeq)`・`approve(shownRevision)`（お客様）・`proxyApprove(shownRevision, openedRequestedAt, note)`（admin）。失敗は既存と同じ例外の形（permission-denied → 「権限がありません」、競合 → `ScheduleConflictError`、二重承認 → WARN を出して成功扱い／種類違いは例外） |
| 純関数（U2 が `src/live/schedule.ts` に置く） | `scheduleDoc`・`scheduleInternalDoc`・`scheduleSummaryOf`・`clientScheduleView`・`scheduleForSave`・`wbsProgressLive`（構築行は tasks、他は doneAt）・`scheduleConflict` |
| 部品のデータ源（U3 が `src/features/schedule/*` に定義） | `ScheduleSource`（読み取り値＋上の操作の関数＋`role`・`canEdit`・`canProxy`）。**props が無ければ従来どおり DemoStore**。U4 は `WbsSection client` と `PortalSchedulePage` にこれを渡す |

## 3. 単位（Write Scope は重ならない）

| Unit | 担当 | Write Scope（これ以外は書かない） | 内容 |
|---|---|---|---|
| **U1** Rules | database-engineer | `firestore.rules`・`tests/rules/schedule.test.mjs`（新規）・`tests/rules/fixtures.mjs`（末尾に `scheduleSeed`・`sched*Batch` を**追加だけ**）・`tests/rules/adminRights.test.mjs`（OPS と TEST-09 の PATHS に**追加だけ**）・`tests/rules/mutation.test.mjs`（変異の**追加だけ**）・`docs/design/LIVE_SCHEDULE_WBS_DATA.md`（§12 の結果と §2 の L-4/L-9 反映だけ） | **U1-0（段 0）**: `validProject` に `schedule` を許す・`projCreateOk` で `consult`/`schedule` を禁止・`actorOk` を `actorBase && kind=='requirements'` に分解（同値）・`apprCreateOk` を kind で先に分岐し `'schedule'` は `false`。**U1-1（G1）**: 最大ケースの計測。**U1-2**: §3 の全述語（データ設計 §3 ＋本書 §1・§2）。**U1-3**: SR-01〜18・ST-01〜24 |
| **U2** データ層 | frontend-engineer | `src/live/schedule.ts`（新規）・`src/live/model.ts`・`src/live/repositories.tsx`・`tests/unit/liveSchedule.test.mjs`（新規）・`tests/unit/liveScheduleHistory.test.mjs`（新規） | **U2-0（段 0）**: `approvalLogFrom` / `approvalLogsFrom` を kind 対応（「スケジュール（第N版）」・kind 無しは要件定義・依頼者の突き合わせを **kind＋版**）。**U2-1**: §2 の純関数・`toProject` の段階と公開予定（`schedule.releaseDate ?? launchDate` の JST 暦日）。**U2-2**: §2 の hooks と TX（データ設計 §4。`flushNow` 相当・`proxyVersionOk`・`cleanProxyNote` を**呼ぶだけ**）。SU-01〜10 |
| **U3** アフロ側の画面 | frontend-engineer | `src/features/schedule/**`・`src/features/portal/RequestApprovalButton.tsx`・`src/live/pages/LiveSchedulePage.tsx`（新規）・`src/live/pages/LiveProjectDetailPage.tsx`（スケジュールの区画だけ） | **U3-a**: demo 部品のデータ源の差し込み（L-12。DOM 不変）。**U3-b**: `/schedule`・`/dev/schedule` の live 画面（予定日・WBS・承認の依頼・取り下げ・再計画・完了印・代理承認のダイアログ・競合の文言）。役割の出し分けは live の値だけ |
| **U4** お客様ポータル＋承認の履歴 | frontend-engineer | `src/features/portal/PortalSchedulePage.tsx`・`src/live/pages/LivePortalSchedulePage.tsx`（新規）・`src/live/pages/PortalApprovalPage.tsx`・`src/features/projects/ApprovalHistory.tsx` | ポータルのスケジュール（`clientScheduleView`。担当・メモ・保存者・構築タスクを出さない、「遅れ」→「調整中」）。確認・承認ページに**スケジュールの区画を要件定義書の章とは別に**（C-05。要件定義書の「スケジュール」章は「承認後に入力します」のまま）。承認（表示していた版で送る＝S-10-5）。履歴の代理・同一人物の表示（kind の値は U2 の model から受ける） |
| **INT** 統合 | lead-architect | `src/live/LiveApp.tsx`（ルート 3 本）・`src/live/liveNav.ts`・`tests/unit/liveNav.test.mjs`・`scripts/seed-emulator.mjs`（スケジュールの種を追加だけ）・`docs/CHANGELOG.md`・`docs/operations/RUNBOOK_FIREBASE.md` §6・`docs/TODO.md` | ルートとナビ（admin `/schedule`・dev `/dev/schedule`・client `/portal/schedule`）。Runbook に段 0 の床と戻す順。LEGAL の TODO。統合後の全テスト |

### 3.1 順番と依存

```
U1-0 ─┐
      ├→ [段 0 の Rules・Hosting を出せる状態]（デプロイはユーザー GO 後）
U2-0 ─┘
U1-1（計測）→ G1: wbs を写すか決定（TASK ファイルと DATA §12 に記録）
G1 → U1-2/U1-3 ∥ U2-1/U2-2
U3-a（G1 と無関係。最初から並行可）
U2-2 ＋ U3-a → U3-b
U2-2 ＋ U3-a → U4
U1 ＋ U3-b ＋ U4 → INT → 全テスト → レビュー（同時に 1 回）→ 統合した指摘 → 修正 1 回
```

- 並行の上限: U1 と U2 と U3-a の 3 本（Write Scope は §3 で分離。同じ作業ツリーを 2 セッションで触らない＝1.19。並行するなら Unit ごとに worktree）
- U3-a は demo だけで確認できる（live の hooks 不要）。U3-b・U4 は U2-2 の hooks の型（§2）に合わせる

## 4. 変更しない部分（Do Not Change）

- **要件定義書の Rules と挙動**: `actorOk` の kind 固定の意味（分解は同値のみ）・`approvalId()`（`requirements-r{rev}-{action}`）・submitOrWithdrawOk / approveOk / proxyApproveOk / clientApprove / adminProxyApprove の式・withdraw の note（任意）・既存 approvals のテスト（AC-14）
- approvals・messages は追記のみ（update/delete は admin も false）／ schedule の文書も delete false ／ aiDrafts は `if false`
- `projUpdateOk` の既存分岐（基本情報・アーカイブ・アサイン・要件定義書・相談）の `ch.hasOnly` に `schedule` を**入れない**（schedule は専用分岐だけ）
- 役割の判定: `roleOf`・`mine`（developer かつ memberUids）・admin の別分岐・無効化／メール不一致は 'none'・お客様は `projectId` の案件だけ
- お客様が書けるもの: 承認（案件の schedule の承認キー＋承認文書）・要件定義書の承認・相談だけ。`proxy`・`note`（代理）・`approvedVia`・`actorRole:'admin'` は書けない
- `src/live/proxyApproval.ts`（呼ぶだけ）・`ProposalView.tsx`・`LiveRequirementsPage.tsx`（要件定義書の「スケジュール」章を含む）
- **demo の画面・DemoStore・reducer・`src/data/schedule.ts` の検査関数**（共用するが変えない。年の範囲 2000〜2099 は live 側の追加検査で足す）
- Functions（変更なし）・`firestore.indexes.json`（新規 Index なし）・AI のフラグと allowlist
- 構築タスクのゲート（NC-3: 止めない）・`projects.launchDate`（書き写さない。C-01）
- 既存の approvals をバックフィルしない（kind 無しは要件定義として読む）

## 5. 計測ゲート G1（UK-2・UK-3）

| 計測する経路（最大 payload: WBS 6 行に完了印・note 200 字・予定日 3 つ・buildDue あり） | 関数（例） | 合格 |
|---|---|---|
| submit（案件・current・internal・approvals の 1 TX） | 案件の submit 分岐・current の submit・`schedApprOk` submit | 各 ≦ 800 式・get ≦ 20 |
| お客様の承認（案件・approvals） | 案件の本人承認・`schedApprOk` approve | 同上 |
| 代理承認（同上＋proxy） | 案件の代理分岐・`schedApprOk` 代理 | 同上 |
| 再計画（internal.draft・案件・approvals reopen） | internal の保存＋reopen | 同上 |
| WBS の 6 行に完了印（current＋internal.marks） | `validWbs`・marks の照合 | 同上 |

- 計測は U1-1 で `adminRights.test.mjs` TEST-09 の PATHS に足す（同じ方法・timeout 900 秒）。結果（経路ごとの k と式数）を `LIVE_SCHEDULE_WBS_DATA.md` §12 に書く
- **WBS 6 行の完了印の経路が外れた場合**は L-10 の「写しから wbs を外す」では減らないので、marks の照合を「変わった行だけ」に絞る（`diff().affectedKeys()` で行を特定）。それでも外れたら設計を見直す

## 6. テスト（コマンドと期待件数）

| コマンド | 前提 | 期待 |
|---|---|---|
| `npm run test:rules` | 着手前に基準の件数を TASK に記録（最終記録 301 件 CHANGELOG:870 以降に増えている可能性あり。**実行して取る**） | 基準 ＋ **約 90 件**（schedule.test.mjs 約 75・adminRights の OPS と計測 約 8・mutation 約 7）。失敗 0・skip 0。既存の件数が減らない |
| `npm run test:unit` | 同上 | 基準 ＋ **約 45 件**（SU-01〜10）。liveNoDemoStore・liveNav が緑 |
| `npm run test:functions` | 変更なし | 基準と同数・失敗 0（回帰） |
| `npm run rules:check` | 生成区間は触らない | 差分なし |
| `npm run typecheck`・`npm run build`・`npm run build:live`・`npm run build:emulator` | — | 成功 |
| `node scripts/ai-verify.mjs`（体制側） | — | 要約で失敗 0 |
| 画面（エミュレータ `npm run emulators` ＋ `npm run seed:emulator` ＋ `npm run dev:emulator`、Chrome） | Focused E2E の仕組みは無い（手動。使えなければ「未検証」） | admin（担当外の案件）・担当の開発者・お客様で §7 の操作。demo の `/schedule`・`/dev/schedule`・`/portal/schedule`・案件詳細を U3-a 前後でスクリーンショット比較（差分 0） |

- Rules テストは `emulators:exec` を通す（`scripts/test-rules.mjs`。プロジェクトは `demo-` 固定。本番の gcloud 既定に触れない）
- Full E2E は無い。リリース前の Smoke は INT が手順を Runbook に書き、ユーザー GO 後に実施

## 7. 完了条件

- AC-01〜14 が満たされる（AC-13 はスクリーンショット比較、他はテストの件数つき）
- 画面確認: 要件定義書の承認前は保存できない／予定日→WBS→承認の依頼→お客様の承認／取り下げ（note 必須）→再依頼で rev+1／代理承認（note）と履歴の「代理」「依頼と同じ人」／承認後の予定日変更で再計画（note 必須）→再依頼／WBS だけの変更は承認済みのまま／完了印を付けて外す（internal に人と日時）／2 タブで同時保存→後の方が競合の文言／アーカイブ中は全員読むだけ
- レビュー: code-reviewer・security-engineer（実装後監査。S-1〜16 の全件）・**別系統モデルレビュー**（認可の変更。顧客案件ではない自社プロダクトのため送付可否の確認は不要 [INFERENCE: AFRO CMS は自社。違えば止めて確認]）・acceptance-auditor（XL）
- G1 の計測値・基準件数・増えた件数が TASK と DATA §12 に記録されている

## 8. リリース（ユーザー GO を段ごとに取る）

| 段 | 出す順 | 中身 | 戻し方 |
|---|---|---|---|
| **段 0** | **Rules（U1-0）→ Hosting（U2-0）** | Rules: `schedule` キーの許可（作成時は禁止）・`actorOk` の分解（同値）・kind の先分岐（schedule は全拒否）。Hosting: 履歴の kind 対応だけ。**誰もスケジュールを書けない** | 旧版へ戻せる（schedule のデータがまだ無い） |
| **段 1** | **Rules（U1 全部）→ Hosting（U3・U4・INT）**。Functions なし | 全機能 | **Hosting を段 0 の版へ → その後 Rules を段 0 へ**。**段 0 より前へは Rules を戻さない**（`schedule` を持つ案件で旧 `validProject` の hasOnly が落ち、基本情報・アーカイブが全件失敗する＝S-16-4）。重い不具合は Rules を前へ直す（forward fix） |

- 段 0 の Rules を出した時点で、それが **Rules の床**。リリース ID を `docs/TODO.md` と Runbook に記録（INT）
- 段 0 と段 1 の間に待つ日数は決めない（段 0 は戻すときの床を作るための土台）。[INFERENCE] 旧 Hosting はスケジュールの記録を書かないので、段 1 の Rules と組んでも壊れない
- 順番を誤った場合（新 Hosting × 旧 Rules）: スケジュールの書き込みは全件拒否（安全側）、要件定義書は影響なし（データ設計 §9）
- 作られた文書・承認の記録は戻しても消さない（Retain）。Migration なし（データ設計 §8）
- 公開後 1 週間で Firestore の Read 件数を確認（データ設計 §10）

## 9. リスク

| # | リスク | 影響 | 対策 |
|---|---|---|---|
| R-1 | UK-2: 最大 payload で 1000 式を超える | 承認・依頼が本番で全件失敗 | G1 を最初に置く。外れたら wbs を写さない（L-10）・marks の照合を変わった行だけに（§5） |
| R-2 | U3-a の差し込みで demo の DOM・挙動が変わる（WbsSection 591 行のドラッグ・下書きの同期） | 承認済みデザインの破壊 | props が無いときの経路を一字も変えない方針・前後のスクリーンショット比較・demo の既存単体テスト（homeDues 等）が緑 |
| R-3 | live の入口から `useDemo(` に届く | live 画面が落ちる（0.47.4 の再発） | `liveNoDemoStore.test.mjs` を INT で必ず実行 |
| R-4 | 段 0 より前へ Rules を戻す運用ミス | 基本情報・アーカイブの全件失敗 | Runbook に床を明記・リリース ID の記録 |
| R-5 | marks の相互照合（L-9）で current と internal の片側だけ書く経路が残る | 完了印の記録漏れ | Rules の両向きの照合・ST-18 に「current だけ」「internal だけ」の拒否を追加 |
| R-6 | 承認の履歴 500 件の押し出し | 古い記録が画面に出ない（状態は案件文書なので壊れない） | L-6 の上限・L-7 の SU-10・データ設計 §13 の閾値 |
| R-7 | オフライン中の TX | 保存できない | 既存どおり「保存できませんでした」、成功確定まで「保存しました」を出さない |
| R-8 | LEGAL: 代理承認・お客様の承認が納期の合意に当たるか | 契約上の扱い | **LEGAL REVIEW REQUIRED**。AI は結論を出さない。`docs/TODO.md`（INT）。リリースの技術条件には含めない |
| R-9 | `timestamp.date()` で暦日を検査できない（L-11） | 2/30 を直接書かれると画面の表示が崩れる可能性 | 画面の検査と読み込み時に捨てる（`scheduleDoc` が壊れた値を捨てる＝SU-03） |

## 10. 対応表（どの条件・テストをどの Unit が満たすか）

### 10.1 脅威モデルの条件（S-x）

| S | 内容 | Unit | 本書での扱い |
|---|---|---|---|
| S-1 | current・internal の get | U1（Rules）／U2（rev 0 で購読しない）／U4（拒否を未作成と同じ表示） | L-2 で `revision>=1` |
| S-2 | お客様の読める文書に社内値を置かない | U1（hasOnly）／U2（`scheduleForSave`） | L-9 で doneBy も internal へ |
| S-3 | 要約は submit 済みの値だけ | U1／U2 | データ設計どおり |
| S-4 | 書ける人 | U1 | — |
| S-5 | archived・要件定義書 approved のゲート | U1／U3（ボタンの出し分け） | — |
| S-6 | kind の先分岐 | U1-0 | 段 0 |
| S-7 | ID の接頭辞と kind の結び付け | U1-0（requirements 側）／U1-2（schedule 側） | — |
| S-8 | お客様の承認の形 | U1／U2／U4 | 状態キーは案件文書（L-1） |
| S-9 | 代理承認の形 | U1／U2（`cleanProxyNote` を呼ぶ）／U3（ダイアログ） | — |
| S-10 | 承認の対象の固定 | U1（1〜4）／U2・U3・U4（5: 表示した版で送る） | 4 は G1 の結論 |
| S-11 | submit / withdraw / reopen の note | U1／U3（「お客様にも表示されます」） | L-8 で withdraw も必須 |
| S-12 | 承認後の予定日変更は reopen と同じ書き込み | U1／U2（`reopenAndSave`） | — |
| S-13 | current の形と revision 上限 | U1 | L-6（50） |
| S-14 | 日付の形式・範囲・順序 | U1（Rules）／U2（画面の検査・2/30） | L-11 |
| S-15 | wbs と internal の検査 | U1／U2 | L-3（マップ）・L-9（marks） |
| S-16 | 要約・消失防止・戻し方・押し出し | U1（1〜3）／INT（4: Runbook）／U2（5: SU-10） | L-4・L-5・L-7 |

### 10.2 Rules テスト（SR-x はデータ設計 §7.1、ST-x は脅威モデル §5。すべて U1。ファイルは `tests/rules/schedule.test.mjs`、別記のみ他ファイル）

| SR | 対応する ST | 備考 |
|---|---|---|
| SR-01 init の権限・ゲート | ST-01・ST-02・ST-06 | email_verified=false も（ST-02） |
| SR-02 init の形 | ST-20（一部） | `projCreateOk` は段 0 |
| SR-03 予定日 | ST-17 | 2/30 の結果を記録（L-11） |
| SR-04 WBS | ST-18 | L-3 で読み替え・L-9 の marks・片側だけの拒否（R-5） |
| SR-05 internal | ST-19 | marks の偽装（by が他人・at が過去）も |
| SR-06 読み取り | ST-03 | L-2。list は全員拒否 |
| SR-07 submit | ST-05・ST-22 | revision 51 の拒否 |
| SR-08 依頼中の変更 | ST-10 | — |
| SR-09 withdraw | ST-16 | **note 空も拒否**（L-8） |
| SR-10 本人の承認 | ST-08・ST-09 | wbs の行は G1 の結論次第 |
| SR-11 代理承認 | ST-12 | — |
| SR-12 再計画 | ST-11・ST-16 | — |
| SR-13 追記のみ | ST-13（後半） | — |
| （追加）同時の承認・差し戻し・二重 | ST-13（前半） | 決定的 ID |
| SR-14 kind の分離 | ST-14 | 段 0 で schedule 全拒否のテストも |
| SR-15 アーカイブ | ST-07 | 読み取りは許可 |
| SR-16 回帰 | ST-15・ST-20（後半） | 既存ファイルは無変更で緑。`adminRights.test.mjs` の OPS に追加 |
| （追加）楽観ロック | ST-21 | L-4 の editSeq・approved* を消す set の拒否 |
| （追加）お客様の読める文書に社内値 | ST-04 | hasOnly の拒否 |
| SR-17 式の上限 | ST-23 | `adminRights.test.mjs` TEST-09 の PATHS（G1） |
| SR-18 mutation | ST-24 | `mutation.test.mjs` |

### 10.3 単体テスト（SU-x。すべて U2。`tests/unit/liveSchedule*.test.mjs`）

| SU | 対象 | 追加 |
|---|---|---|
| SU-01・SU-02 | 履歴の kind 対応・kind＋版の突き合わせ（C-04・AC-11） | U2-0（段 0 に含む） |
| SU-03〜SU-09 | データ設計 §7.2 どおり | SU-07 に `marks` と `editSeq`、SU-09 に editSeq の競合 |
| **SU-10**（新） | 要件定義書・スケジュールの承認状態の表示が履歴の件数に依存しない（L-7） | 履歴 0 件・500 件ちょうどで同じ表示 |

## 11. 記録

- 判断の正: 本書 §1（このリポジトリに `docs/DECISIONS.md` は無い [FACT: ls 2026-11-27]。前回計画と同じく計画書の DECISION 節を正とする）。G1 の結論は §1 L-10 の下に INT が追記し、データ設計 §12 にも書く
- `docs/TODO.md`: LEGAL（R-8）・段 0 の Rules の床のリリース ID・完了印の全履歴（L-9 の範囲外）
- 学習の判断: G1 の計測値と UK-1 の観察（任意）を `docs/knowledge/tech/firestore.md`（体制側。TECHNOLOGY）へ載せるかを INT で判断
