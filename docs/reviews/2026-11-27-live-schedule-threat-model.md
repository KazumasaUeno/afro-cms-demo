# 脅威モデル: live のスケジュール（予定日）＋ WBS とお客様承認（設計段階・XL）

- 日付: 2026-11-27 ／ 担当: security-engineer（読み取りのみ。コードは未変更）／ 基準: 1b20ef5（worktree `wt-sched`）
- 入力: `docs/design/LIVE_SCHEDULE_WBS.md`（REQ-LIVE-SCHED-01。末尾のユーザー決定 NC-1〜5 を含む）、既存の `firestore.rules`、`src/live/proxyApproval.ts`、`docs/reviews/2026-11-26-admin-full-rights-threat-model.md`（以下「前回」。R-1〜R-8・T-01〜T-09）
- データ設計の正は data-backend-architect の `LIVE_SCHEDULE_WBS_DATA.md`（並行作成中・本書の時点で未確認）。本書は「どの形でも満たすべき条件」を書く。文書の分け方・項目名がデータ設計と食い違えば、**条件の意味**を優先して読み替える
- 判定: **条件つき承認（APPROVED WITH CONDITIONS）**。設計上の Critical は無い。ただし **S-1・S-2・S-6・S-9・S-10 を外すと Critical / High が開く**。下の S-1〜S-16 と ST-01〜ST-24 の全件が揃うまでリリースしない

## 1. 現状の事実（再利用する部品）

| # | 事実 | 確認 |
|---|---|---|
| F-1 | 役割は `roleOf`（status=='active' ∧ email==token.email）。無効化・メール不一致は 'none' | firestore.rules:18-22,40 |
| F-2 | `actorOk` は `kind == 'requirements'` 固定。approvals の ID は `requirements-r{rev}-{action}` | firestore.rules:49,503-507 |
| F-3 | `apprCreateOk` は**役割で分岐し kind では分岐しない**（client→approveOk、developer→submitOrWithdrawOk、admin→action で分岐） | firestore.rules:317-323 |
| F-4 | 承認の相互照合: clientApprove は承認文書の `side=='client' ∧ proxy 無し`、adminProxyApprove は `approvedVia=='proxy' ∧ l.proxy ∧ side 'afro' ∧ actorUid==本人`、approveOk / proxyApproveOk は逆向きに案件側を照合 | firestore.rules:241-266,511-546 |
| F-5 | 代理承認の note は trim 後 1〜200（コードポイント）・向きの制御／C0／DEL を拒否（`reProxyNote` / `reNoteControl`）。画面側は `cleanProxyNote` / `proxyVersionOk` | firestore.rules:530-531 / src/live/proxyApproval.ts:9-27 |
| F-6 | withdraw の note は `optStr(0,200)` のみで制御文字の検査なし（前回 A-2） | firestore.rules:565-566 |
| F-7 | approvals は `canRead(pid)`（お客様を含む）で get/list 可。update/delete は全員 false | firestore.rules:479-483 |
| F-8 | 案件文書はお客様も get 可（`clientOf`）。`validProject` は keys の hasOnly で、`consult` のような要約キーを足すときはここにも足す必要がある | firestore.rules:207-218,448 |
| F-9 | 相談の要約 `consultOk` は「同じ書き込み（existsAfter）でだけ」・archived==false・updatedAt を動かさない型 | firestore.rules:420-430 |
| F-10 | 承認の履歴の購読は `orderBy('at','desc') limit(LIST_LIMIT=500)`、kind で絞っていない | src/live/repositories.tsx:525 |
| F-11 | 管理者は collectionGroup('approvals') を list 可 | firestore.rules:641-643 |

## 2. 脅威

| ID | 脅威 | 重大度（対策なし） | 防ぐ層 |
|---|---|---|---|
| T-01 | お客様が `schedule/internal`（メモ・担当名・保存者）を読む／同じ値がお客様の読める文書（current・approvals・案件文書）に写っている | High（社内情報・氏名） | データ設計（文書分離）＋ Rules（get） |
| T-02 | お客様が下書き（draft。初回・差し戻し後・再計画中）の予定日を読む。**案件文書の要約（NC-4）経由の迂回**を含む | High（未合意の日付がお客様に約束として見える） | Rules（current の get 条件）＋ 要約の写し方 |
| T-03 | 担当外の開発者・協力会社・他案件のお客様・未ログイン・無効化された人が読む／書く | Critical | Rules（roleOf・memberUids・projectId） |
| T-04 | 承認の偽造: お客様が `proxy:true`・`actorRole:'admin'`・`side:'afro'` を名乗る／開発者が approve を作る／admin が proxy・note 無しで approve を作り本人の承認に見せる／actorUid・actorName・at の偽装 | High（証跡の完全性） | Rules（役割から side・proxy を強制） |
| T-05 | 表示していない版・中身を承認させる: 古い画面のまま承認、依頼中に予定日をすり替え、承認の写しを任意の値で送る | High（合意の対象がずれる） | Rules（版・写しの等式・依頼中の凍結） |
| T-06 | 承認後に予定日だけ書き換え、承認済みのまま見せる（NC-1 の迂回） | High | Rules（approved 中の予定日の凍結。reopen と同じバッチでだけ変更） |
| T-07 | kind の混線: スケジュールの記録が要件定義書の分岐を通る／`requirements-r{n}-approve` の ID を先に作って要件定義書の承認を塞ぐ（ID の占有）／逆も | High（既存の承認の破壊） | Rules（kind で先に分岐・ID の接頭辞を kind に結ぶ） |
| T-08 | 二重承認・承認と差し戻しの同時成立・お客様承認と代理承認の両方 | Medium | 決定的 ID の create のみ＋事前状態 |
| T-09 | 管理者の代理承認が監査できない（note 無し・actorRole 無し・履歴で本人と区別できない・依頼者と同一人物が見えない） | Medium（否認） | Rules（note・actorRole・approvedVia）＋表示 |
| T-10 | 案件文書の要約（状態・公開予定日）を任意の値に書き換える／スケジュールと食い違わせる／要約だけ別の分岐で書く | Medium（ダッシュボードの誤表示。お客様にも見える） | Rules（要約は同じバッチで current と等式） |
| T-11 | アーカイブ中の案件に書く（管理者を含む。NC-5） | Medium | Rules（事前・事後とも archived==false） |
| T-12 | 要件定義書の承認前にスケジュールを作る | Medium | Rules（`proj.requirements.status=='approved'`） |
| T-13 | 大きさ・量の濫用: 長文・制御文字・巨大な wbs 配列・余分なキー／依頼⇄取り下げの無限ループで approvals を増やし、**承認の履歴（500 件）から要件定義書の記録を押し出す** | Medium（可用性・証跡の表示欠落） | Rules（hasOnly・長さ・版の上限）＋ kind ごとの購読 |
| T-14 | 日付文字列の不正（形式違い・年の極端値・2/30・順序逆転・Timestamp 型の混入）で画面・ガントが壊れる／順序の検査を迂回 | Medium | Rules（形式・範囲・順序）＋画面（暦の実在） |
| T-15 | 完了印（NC-2）の日時を過去にずらす（実績の改ざん）・誰が付けたかをお客様に出す | Low〜Medium | Rules（doneAt==request.time または不変）＋ doneBy は internal |
| T-16 | データ消失: set() の上書きで承認欄を消す／同時保存の後勝ち／reopen で承認の証拠を消す／Rules を戻したとき要約キーのある案件で基本情報が保存できなくなる | Medium | Rules（承認欄の不変・楽観ロック）＋ Runbook |
| T-17 | 管理者が自分で依頼して自分で代理承認（職務分離なし） | Medium（否認） | 受容（前回 T-06 と同じ）＋表示 |

## 3. 必要な Rules / データ設計の条件（実装者へ）

### 3.1 読み取り（T-01・T-02・T-03）

- **S-1** `schedule/current` の get: `isAdmin() || assigned(pid) || (clientOf(pid) && resource.data.status in ['requested','approved'])`。list は admin・担当だけ（お客様は get のみ。存在しない文書・draft の拒否を画面は「未作成」と同じ表示にする）。
  `schedule/internal` の get は `isAdmin() || assigned(pid)` だけ。お客様の分岐を**どこにも書かない**
- **S-2** お客様が読める文書（`schedule/current`・`approvals`・`projects/{pid}`）に、メモ・担当名（assignees）・保存者名・完了印を付けた人（doneBy）・構築タスクの件数を**置かない・写さない**。これらは `schedule/internal` へ。`current` の hasOnly にこれらのキーを入れない（後から足すと Rules で隠せない）
- **S-3** NC-4 の案件文書の要約は**お客様に見える値だけ**にする: `status` と「お客様に提示済みの公開予定日」（最後に submit した版の releaseDate）。**draft 中に入れた releaseDate を要約へ写さない**（写すと案件文書の get で下書きの日付がお客様に漏れる。T-02 の迂回）。社内のダッシュボードで draft の日付が要るなら internal 側の読み取りで出す、または「入力中」とだけ出す

### 3.2 書き込みの主体と前提（T-03・T-11・T-12）

- **S-4** current・internal の create/update は `r=='admin' || (r=='developer' && uid in proj(pid).memberUids)`（前回 R-1 と同じく admin は別分岐。`mine` の定義は変えない）。お客様は current の「承認 4 キー」だけ（S-8）、internal は一切不可。delete は全員 false
- **S-5** 全ての書き込み（current・internal・schedule の approvals・要約）に `proj(pid).archived == false && getAfter(projPath(pid)).data.archived == false` と `proj(pid).requirements.status == 'approved'` を課す。お客様の承認と管理者の代理承認も同じ（NC-5「全員読むだけ」）

### 3.3 承認の記録と kind（T-04・T-07・T-08・T-09）

- **S-6** `apprCreateOk` は**最初に kind で分岐**する: `d.kind == 'requirements' ? （既存の式をそのまま） : d.kind == 'schedule' ? （新しい式） : false`。既存の `actorOk` の `kind=='requirements'` は緩めない（`kind in [...]` にしない）。kind を除いた共通部分 `actorBase` を切り出して両方から呼ぶ形にする
- **S-7** スケジュールの ID は `'schedule-r' + string(rev) + '-' + action`（action は submit / withdraw / approve / reopen）で `aid` と完全一致を要求。新しい分岐は `requirements-` で始まる ID を作れない、既存の分岐は `schedule-` を作れない（ID の占有を双方向で止める）。`d.revision is int` かつ文書の版と一致
- **S-8** お客様の承認: `side=='client'`、`proxy`・`note` を持てない、`actorRole` は無いか 'client'、`roleOf=='client' ∧ projectId==pid`。`schedule/current` の更新は `status, approvedAt, approvedBy, approvalId` の 4 キー（＋要約）だけ、`approvedAt==request.time`・`approvedBy==auth.uid`・`approvedVia` を持たない。相互照合（getAfter の承認文書が side 'client' ∧ proxy 無し）
- **S-9** 管理者の代理承認: `actorRole=='admin'`（必須）・`side=='afro'`・`proxy==true`・`note` は `reProxyNote` ∧ `!reNoteControl`（要件定義書と同じ関数を使う。画面は `cleanProxyNote` / `validateProxyNote`）。current は上の 4 キー＋`approvedVia=='proxy'`、`approvedBy==auth.uid`。相互照合は前回 R-3/R-4 と同じ向きで両方。開発者の approve は分岐ごと無い
- **S-10** 承認の対象の固定（T-05）:
  1. `d.revision == current.revision` かつ `current.status == 'requested'`（事前）
  2. 承認文書の写し（buildDue・deliveryDate・releaseDate、wbs を写すなら wbs も）は **事前の current と等式**（`optEq` 型。無い項目は両方無い）。お客様が任意の値を写しても通らない
  3. requested 中は current の予定日 3 項目を変えられない（変更は withdraw と同じバッチで draft に戻してから）
  4. wbs を承認の写しに含める場合、requested 中の WBS 編集で古い画面の承認は失敗する（安全側。画面は「内容が変わりました」で再読込）。含めない場合は「承認の対象は予定日だけ」と画面・履歴に明記する。**どちらにするかは data-backend-architect が決め、本書の ST-09 をその形で書く**
  5. 画面はお客様・管理者とも、**表示に使った版（と submit の at）を送る値の元にし、押した時点で読み直した値を使わない**（`proxyVersionOk` と同じ型をお客様の承認にも適用）
- **S-11** submit / withdraw / reopen: `side=='afro'`・`actorRole` は無いか呼び出し者の役割と一致（admin は必須）。submit は `rev+1` と予定日の写しの等式（getAfter の current）、withdraw / reopen の note は `reProxyNote` 型の長さ（withdraw は 0 文字可）と **`!reNoteControl`**（前回 A-2 を新しい kind では最初から直す）。**reopen は note 必須**（NC-1 の「理由を記録」）。これらの note は approvals にあり**お客様が読める**ので、入力欄に「お客様にも表示されます」と出す（社内メモは internal へ）
- **S-12** NC-1: `approved` 中に予定日 3 項目を変える更新は、`status: approved→draft` と `existsAfter(schedule-r{rev}-reopen)` を**同じバッチ**でだけ許す。reopen で current の approved* 欄を外すのはこの分岐だけ（承認の証拠は approvals に残る＝消えない）。次の submit で `rev+1`。WBS だけの変更は状態を変えずに可（ユーザー決定）

### 3.4 文書の中身（T-10・T-13・T-14・T-15・T-16）

- **S-13** current の検査: keys は hasAll／hasOnly で固定、`schemaVersion==1`、`status` は 3 値、`revision is int ∧ 0 ≤ revision ≤ 50` [TARGET。依頼⇄取り下げの無限ループの上限]、`stamped()`。status / revision / approved* は遷移の分岐以外で affectedKeys に入れない
- **S-14** 日付: `v is string && v.matches('^20[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$')`（2000〜2099 年。SAFE ASSUMPTION どおり）、順序は文字列比較 `buildDue ≤ deliveryDate ≤ releaseDate`、各 WBS 行 `start ≤ end`。Timestamp 型は拒否（`is string`）。暦に無い日（2/30）は画面の `validateSchedule` で止める。Rules で検査できるかは [UNKNOWN → INVESTIGATION REQUIRED]（`timestamp.date()` の挙動をエミュレータで確認し、拒否できるなら足す。できなければ画面のみと記録）
- **S-15** wbs: `is list ∧ size()==6`、`wbs[i].id == 固定の i 番目の ID`（順番を固定して「各 1 回」を 6 回の等式で済ませる）、各行 `keys().hasOnly(['id','start','end','doneAt'])`。`doneAt` は「前と同じ」「今回付けた＝`request.time`」「外した＝キー無し」の 3 つだけ（過去日への書き換え不可）。付けた人は internal の `doneBy`（`== auth.uid`）。internal: `note` は 0〜200 ∧ `!reNoteControl`（改行は許すなら reChatControl 型）、`assignees` は keys ⊆ 6 ID・各 0〜30・制御文字拒否、`savedByName == acct().name`（クライアントの申告を使わない）、hasOnly 固定
- **S-16** 要約（NC-4）と消失防止:
  1. 案件文書の要約キー（例 `schedule`）は `validProject` の hasOnly に足し、既存の基本情報・アーカイブ・アサイン・要件定義書の分岐の `ch.hasOnly` には**入れない**（consult と同じ型）。書けるのは「current の更新と同じバッチ」の専用分岐だけで、値は `getAfter(schedule/current)` と等式（S-3 の値）。**逆向き**（current の更新は要約が同じバッチで正しく更新されていること）も要求する。updatedAt は動かさない（一覧の並びを変えない）
  2. 同時保存の後勝ち防止は**サーバーで強制**する: current・internal に `editSeq`（int）を持たせ `request.resource.data.editSeq == resource.data.editSeq + 1` を要求（2 人が同じ版から保存すると後の方が Rules で落ちる）。画面は transaction で読み直し、負けたら AC-08 の文言
  3. approved* 欄は承認・reopen の分岐以外で変わらない（`set()` で丸ごと上書きしても落ちる）
  4. **Rules の戻し方**: 新しい Rules を一度でも出して要約キーを書いた後に旧 Rules へ戻すと、その案件の基本情報・アーカイブの保存が旧 `validProject` の hasOnly で全件失敗する。Runbook に「戻すのは Hosting だけ。Rules は前へ直す（forward fix）」と書く。デプロイ順は前回 A-1 と同じ **Rules → Hosting**
  5. 承認の履歴の押し出し（T-13）: 購読を kind ごとに分ける（`where('kind','==',k) orderBy('at','desc') limit`。複合 Index を `firestore.indexes.json` に足し本番へ適用）か、要件定義書の承認状態の表示が履歴の件数に依存しないことを確認する。S-13 の版の上限と合わせて閉じる
- 1 リクエストの上限: 承認 1 回は current・approvals・案件の要約の 3 文書のバッチで、各 Rules が get/getAfter を重ねる。**get/exists の上限（バッチ 20）と式 1000 を最大 payload（写しつき代理承認・reopen）でエミュレータ計測**する（前回 A-3 の未計測をここで閉じる）

## 4. 変えてはならないもの

- 要件定義書の承認・依頼・差し戻し・代理承認の Rules と既存テスト（AC-14。`actorOk` の kind 固定・`approvalId` の接頭辞を含む）
- approvals・messages は追記のみ（update/delete false、admin を含む）。schedule の文書も delete false
- お客様が書けるのは 承認 4 キー・承認文書・相談だけ。お客様が proxy・note・approvedVia・actorRole 'admin' を書けない
- 開発者は担当案件だけ（memberUids）。無効化・メール不一致の admin は 'none'

## 5. 必要なテスト（T ↔ ST。`tests/rules/schedule.test.mjs` 想定。qa-engineer と分担）

| ST | 内容 | 脅威 |
|---|---|---|
| ST-01 | admin（担当外の案件・担当 0 人の案件）と担当の開発者が current・internal を作成・更新できる（許可） | 機能 |
| ST-02 | 担当外の開発者・協力会社（担当外）・他案件のお客様・未ログイン・disabled・email 不一致・email_verified=false が current・internal の get／create／update で拒否 | T-03 |
| ST-03 | お客様の get: current が draft → 拒否、requested・approved → 許可、文書なし → 拒否。internal → どの状態でも拒否。schedule の list → 拒否 | T-01・T-02 |
| ST-04 | current に note・assignees・savedByName・doneBy を足した書き込み → 拒否（hasOnly）。承認文書に assignees・note（代理以外）を写す → 拒否 | T-01 |
| ST-05 | 再計画中（draft）の案件で、案件文書の要約に draft の releaseDate を書く → 拒否。要約は最後に submit した版の値と等式 | T-02・T-10 |
| ST-06 | 要件定義書が approved 以外の案件で current の create → 拒否（admin も） | T-12 |
| ST-07 | アーカイブ中: 保存・依頼・取り下げ・reopen・お客様の承認・代理承認・要約の更新がすべて拒否（admin も）。読み取りは許可 | T-11 |
| ST-08 | お客様の承認: 正しい形 → 許可。proxy:true／note／actorRole:'admin'／side:'afro'／actorUid・actorName・at の偽装／approvedVia を付ける → 各拒否。開発者の approve → 拒否 | T-04 |
| ST-09 | 承認の対象: revision が古い／承認文書の写しが current と 1 項目でも違う／status が draft・approved のときの approve → 拒否。（wbs を写す設計なら）wbs を 1 行変えた後の旧写しの承認 → 拒否 | T-05 |
| ST-10 | requested 中に予定日 3 項目を変える → 拒否。WBS の日付・doneAt の変更 → 許可（状態・版は不変） | T-05 |
| ST-11 | approved 中に予定日を変える: reopen 無し → 拒否、reopen あり（note あり）＋ status→draft のバッチ → 許可、reopen の note 空 → 拒否。WBS だけの変更 → 許可（status approved のまま） | T-06 |
| ST-12 | 代理承認: 正しい形 → 許可。proxy 無し／proxy:false／note 無し／空白だけ・改行・U+202E 入りの note／201 字／actorRole 無し／side:'client'／approvedVia 無し → 各拒否 | T-04・T-09 |
| ST-13 | お客様承認の後の代理承認・代理承認の後のお客様承認・同じ版の二重 approve・approve と withdraw の同時 → 一方だけ成立。schedule の approvals の update/delete → admin も拒否 | T-08 |
| ST-14 | kind の混線: kind 'schedule' で ID `requirements-r1-approve`／kind 'requirements' で ID `schedule-r1-submit`／kind 無し・未知の kind → 拒否。スケジュールの第 1 版を承認しても要件定義書の第 1 版の承認が引き続きできる | T-07 |
| ST-15 | 要件定義書の既存テスト（approvals・adminRights・mutation）が全件そのまま緑（件数を記録） | T-07・AC-14 |
| ST-16 | withdraw・reopen の note: 201 字・制御文字・向きの制御 → 拒否 | T-13 |
| ST-17 | 日付: `2026-1-5`／`2026/01/05`／`1999-12-31`／`2100-01-01`／`2026-13-01`／Timestamp 型／数値 → 拒否。buildDue > deliveryDate・deliveryDate > releaseDate・start > end → 拒否。同じ日 → 許可。`2026-02-30` は Rules の結果を記録し、画面の単体テストで拒否 | T-14 |
| ST-18 | wbs: 5 行・7 行・同じ id 2 回・順番違い・余分なキー → 拒否。doneAt を過去の timestamp にする → 拒否、request.time → 許可、外す → 許可 | T-13・T-15 |
| ST-19 | internal: note 201 字・assignees 31 字・未知の WBS ID のキー・savedByName ≠ accounts.name → 拒否 | T-13 |
| ST-20 | 要約: 要約だけを書く（current の更新なし）／current と違う値／基本情報の分岐に要約を混ぜる → 拒否。current を更新して要約を更新しない → 拒否。要約を持つ案件で基本情報・アーカイブの保存が引き続き許可 | T-10・T-16 |
| ST-21 | 楽観ロック: 同じ editSeq から 2 回保存 → 2 回目拒否。approved* を消す `set()` → 拒否 | T-16 |
| ST-22 | revision 51 の submit → 拒否（上限を決めた値で） | T-13 |
| ST-23 | 最大 payload の 代理承認・reopen・お客様の承認（3 文書のバッチ）が get/exists の上限・式 1000 の内（計測値を記録） | 可用性 |
| ST-24 | mutation.test.mjs: kind の先分岐・ID 接頭辞・お客様の draft 拒否・internal のお客様拒否・proxy の強制・archived の検査・要約の等式を外す変異がそれぞれ検出される | 全般 |

画面側（unit / Focused E2E）: 承認・代理承認の送信値が表示に使った版から作られること（S-10-5）、履歴で schedule と requirements が kind＋版で突き合わされ「要件定義」と表示されないこと（C-04）、ポータルに担当・メモ・保存者・構築タスクが出ないこと（AC-09）。

## 6. 受容リスク・確認事項

- **T-17（受容。前回 T-06 と同じ根拠のユーザー決定 U-2）**: admin の自己依頼→自己代理承認を Rules では止めない。note 必須・履歴に「代理」と依頼者と同一である旨を表示（kind＋版で突き合わせる）
- **既存の露出（Info。今回の範囲外）**: approvals はお客様が読めるため、アフロ側の `actorEmail` と `actorName` が既にお客様に見えている（要件定義書でも同じ）。スケジュールでも同じ形になる。変えるなら別件で product-manager へ
- **[UNKNOWN] データ設計**: `LIVE_SCHEDULE_WBS_DATA.md` を本書の時点で読んでいない。承認の写しに wbs を含めるか・要約のキー名・editSeq の採否は data-backend-architect の結論で ST-09／ST-20／ST-21 を書き直す
- **[UNKNOWN] Rules での暦日の検査**（S-14）: エミュレータで確認するまで「画面のみ」と扱う
- **LEGAL REVIEW REQUIRED**: 代理承認が同意の証明として有効か（既存の項目に「スケジュールも対象」）、お客様が承認した納品・公開予定日が納期の合意に当たるか、reopen 時の扱い。結論は出さない（requirements-architect / product-manager）
- **リリース条件**: Rules → Hosting の順・要約キーの戻し方を Runbook に記載（S-16-4）・テスト全件の件数を添付・別系統モデルのレビュー（認可の変更）・本番前のユーザー GO
