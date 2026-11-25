# live（Firestore）のダッシュボード・構築タスク・相談 — データ設計

- 作成: 2026-11-25 data-backend-architect（**設計のみ。コード・Rules・Index は未変更**）
- 前提（ユーザー決定 2026-11-25）: live のサイドは **ダッシュボード / プロジェクト / 構築タスク / 相談** の 4 つ（demo の開発者画面と同じ）。3 画面を Firestore に配線してからメニューを変える（仮置きの画面は出さない）。ヒアリングはプロジェクト詳細から、ユーザー管理は上部バーのアカウントメニュー（admin）から開く
- 正本: 既存の権限・規約は `docs/design/BACKEND_FIREBASE.md`（§2.2 権限表・§5 文書・§17 削除・§28 Rules 式）。この文書はその追補。**§14（NC-8 案 A: live でタスクを隠す）はこの設計で置き換える**（採用後に §14 を更新する）
- ラベル: [FACT]=実物で確認（file:line）／[INFERENCE]／[UNKNOWN]／[DECISION 案]=この担当の推奨（lead-architect のレビューとユーザー確認前）

---

## 0. 確認した実物（[FACT]）

| 何 | 場所 | 要点 |
|---|---|---|
| demo のメニュー | `src/components/layout/nav.ts:99-117` | 開発者: ダッシュボード `/dev`・プロジェクト・構築タスク `/dev/tasks`・相談 `/dev/chat`（未対応の件数バッジ） |
| live のメニュー | `src/live/liveNav.ts:33-40` | admin: プロジェクト・ユーザー管理／developer: プロジェクト・ヒアリング／client: 確認・承認 |
| ダッシュボード | `src/features/dev/DevDashboardPage.tsx:28-195` | 担当案件のカード ＋ 表示中の 1 案件の「構築で次にやること」「あなたのタスク（上位 3 件と状態別件数）」「最近のデプロイ」 |
| 構築タスク | `src/features/dev/DevTasksPage.tsx`、`src/types/index.ts:535-549`、`src/store/reducer.ts:856-874` | 表示中の 1 案件のかんばん（未着手/作業中/レビュー待ち/完了）。追加（題名 1〜60・対象ページ・担当 1 人以上・複数可）と状態変更（どの状態へも可）。削除は無い。操作はアクティビティに記録 |
| 相談 | `src/features/chat/ChatPage.tsx`、`src/data/chat.ts:12`、`src/features/chat/unanswered.ts` | 案件ごとに 1 本の会話。本文 1〜1000 字・1 案件 200 件まで（古い分は捨てる）。**未対応＝最後のメッセージがお客様**（既読は持たない）。返信は担当ディレクター（`ownerId`）だけ、開発担当は閲覧のみ、admin は全案件を見るだけ、お客様はポータルから送る。添付・通知は無い |
| live の案件 | `src/live/model.ts:36-90`、`firestore.rules:202-260` | `ownerUid`＝作成者（開発者または 11-25 から admin）。`memberUids`（最大 20）。段階は `requirements.status` から導く（hearing / requirements だけ） |
| live の購読 | `src/live/repositories.tsx:66-83` | 案件一覧は LiveDataProvider で 1 本（admin は全件、開発者は `memberUids array-contains`、お客様は自分の 1 件を get）。上限 500 |
| Rules の部品 | `firestore.rules:14-49` | `isAdmin/isDev/isClient/assigned(pid)/clientOf(pid)/canRead(pid)/acctOrNull/roleOf/stamped/str` |
| Index | `firestore.indexes.json` | projects 2 本・accounts・invites・approvals.at（COLLECTION_GROUP desc あり） |

live に無いもの: デプロイ履歴・アクティビティ・サイトマップ（ページ一覧）・担当ディレクターの欄。

---

## 1. 画面ごとの整理

### 1.1 ダッシュボード（`/dev` と admin の同じ位置。**新しいコレクションは作らない**）

| 区画 | demo | live の材料 | 保存 or 導出 |
|---|---|---|---|
| 担当案件のカード | 進捗・段階・次の作業・公開予定 | 既に購読している案件一覧（`toProject()`） | **導出**（追加 Read 0） |
| 承認待ち・状況の件数 | 承認待ち件数 | `requirements.status`（draft=ヒアリング中 / analyzed=お客様の承認待ち / approved=承認済み） | **導出**（追加 Read 0） |
| 相談の未対応 | 未対応の案件数 | §2.2 の `projects.consult.lastSide == 'client'` | **導出**（案件一覧に載る。追加 Read 0） |
| 構築状況（あなたのタスク・状態別件数） | 表示中の 1 案件 | §2.1 の `tasks`（構築タスク画面と同じ購読を共有） | 導出（tasks の Read） |
| 構築で次にやること | `nextDevAction()` | tasks ＋ `requirements.status` | 導出 |
| 最近のデプロイ | デモデータ | **無い** | **live では出さない**（[DECISION 案]。仮置きを出さない方針どおり。NC-6） |
| 最近の承認（admin のみ・任意） | ホームの最近の動き | `collectionGroup('approvals') orderBy(at desc) limit(10)`（既存 Index・既存 Rules `firestore.rules:458`） | 導出（10 Read） |

- 見る人: admin（全案件・見るだけ）／developer（担当案件）。client は対象外（ポータルのホームは別画面・今回変えない）
- 「プロジェクトが 0 件」の空表示は demo と同じ文言（ユーザー管理への案内は admin 向けに出し分け）

### 1.2 構築タスク（`/dev/tasks`。**新規 `projects/{pid}/tasks`**）

- 見る人: developer（担当案件）・admin（全案件・**見るだけ** [DECISION 案]。NC-2）。**client は読めない**（社内の作業。§3）
- 対象は表示中の 1 案件（demo と同じ。案件の切り替えは既存の `select()`）
- 対象ページ: live にはサイトマップが無いので **自由入力（1〜40 字）＋「サイト全体」**。既存タスクのページ名を候補に出す（demo の `taskPages` と同じ）
- 担当の候補: その案件の `memberUids`（担当の開発者）。名前は既存の `useDevPeople()` で引く
- アクティビティ記録は live に無いので書かない（画面の説明文「管理者画面のアクティビティにも記録」を外す）

### 1.3 相談（`/dev/chat`・admin・お客様ポータル `/portal/chat`。**新規 `projects/{pid}/messages` ＋ 案件文書の `consult` 欄**）

- 送る人: お客様（自分の案件）と、アフロ側の返信者（NC-1。推奨: **その案件の担当開発者全員**）。admin は見るだけ（demo どおり）
- 一覧: 開発者は担当案件、admin は全案件。行に「最後の時刻・送った側・送った人の名前・未対応」を出す。**本文のプレビューは出さない**（§2.2 の理由。SAFE ASSUMPTION）
- お客様が送れないと会話が始まらないので、**ポータル側の相談画面も同じ単位で作る**（NC-3）

---

## 2. 新しいコレクション・欄

### 2.1 `projects/{pid}/tasks/{tid}`（ID は SDK の自動 ID）

```
schemaVersion: 1
title:        string  trim 後 1〜60（DEV_TASK_TITLE_MAX と同じ）
page:         string  trim 後 1〜40（「サイト全体」を含む）
assigneeUids: string[] 1〜20、重複なし、すべてその案件の memberUids に含まれる（作成・担当変更時）
status:       'todo' | 'doing' | 'review' | 'done'
createdAt, createdBy, updatedAt, updatedBy   （request.time / auth.uid）
```

| 項目 | 内容 |
|---|---|
| Source of Truth | この文書（タスクの唯一の正）。demo の `assigneeId`（主担当）は持たない（`assigneeUids[0]` で代用。重複を作らない） |
| 書く人 | **クライアント SDK**（Rules で検査）。Functions は不要 |
| 操作 | 作成（status は `todo` 固定）／状態変更（どの状態へも可）／（任意）題名・ページ・担当の変更（NC-2）。**削除なし**（`allow delete: if false`。誤登録は「完了」で閉じる [DECISION 案]。NC-2） |
| クエリ | `collection(projects/{pid}/tasks) orderBy('createdAt') limit(300)`。「自分の担当のみ」・状態別は**画面で絞る**。単一フィールドなので**複合 Index 不要** |
| 上限 | 1 案件 300 件 [TARGET]（Rules では数えられないので画面の上限。超えたら古い完了分から出ない旨を表示。300 を超える案件が出たら status 別クエリ＋複合 Index `status ASC, createdAt ASC` へ作り替える） |
| 文書の大きさ | 1 件 約 0.5KB |
| 削除・保持 | 案件と同じく残す（案件は削除しない。§17.2）。担当を外れた人の uid は残り「担当外」と表示（Orphan。案件の `memberUids` と同じ扱い） |
| 購読 | **リアルタイム**（onSnapshot。構築タスク画面とダッシュボードで `useSnapshot` のキー `t:{pid}` を共有して 1 本） |

### 2.2 `projects/{pid}/messages/{mid}` と `projects/{pid}.consult`

**メッセージ**（文書 ID = 連番 `seq` を 6 桁ゼロ埋め。例 `000001`）

```
schemaVersion: 1
seq:        int（1 から。consult.count と同じ値）
text:       string trim 後 1〜1000（CHAT_LIMITS.text。gen-rules-questions.mjs で正規表現を生成）
side:       'client' | 'afro'（送った人の役割から決まる。自由に選べない）
authorUid:  auth.uid
authorName: accounts の name と一致（送った時点の名前。Historical Snapshot）
at:         request.time
```

**案件文書の要約欄**（未対応・一覧・バッジの材料。Intentional Denormalization）

```
consult: { count: int, lastAt: timestamp, lastSide: 'client'|'afro', lastName: string }
```

| 項目 | 内容 |
|---|---|
| Source of Truth | 会話の正は `messages`。`consult` は**最後の 1 件の写し**で、メッセージ作成と**同じトランザクション**でだけ書く（Rules が `getAfter` で両方の一致を強制）。食い違ったら messages の最後の 1 件から作り直せる |
| 書く人 | **クライアント SDK の runTransaction**（案件を読む → `seq = count+1` → メッセージ作成＋`consult` 更新）。既存の承認と同じ「状態と証跡を同じ書き込み」の型（`repositories.tsx:30`） |
| 二重送信 | 連番 ID は create のみ（同じ ID の 2 回目は update 扱いで Rules が拒否）。同時送信は片方がトランザクションの競合で再試行され次の番号になる。通信が切れて結果不明の再送は**二重になりうる**（[INFERENCE]。頻度は低い。送信中はボタンを無効にし、失敗時は入力を残す） |
| なぜ案件文書に載せるか | 案件一覧は既に全員が 1 本購読している → **未対応・バッジ・一覧の行が追加 Read 0**。別コレクションにすると、開発者は担当案件の数だけ購読が要る（Rules はフィルタではなく、collectionGroup では案件の担当を判定できない） |
| 本文プレビューを持たない理由 | Rules に部分文字列の関数が無く、写しと本文の一致を検査できない（[INFERENCE] Rules の string 関数の一覧に substring 相当が無い。実装時に確認）。検査できない写しは作らない |
| クエリ | 会話: `orderBy('seq') limitToLast(50)`（単一フィールド・**複合 Index 不要**）。古い分は「さらに読む」で `endBefore` |
| 上限 | 1 案件 5,000 件（`count <= 5000` を Rules で強制。demo の 200 件で古い分を捨てる挙動は採らない＝**会話は消さない**）。1 件 1000 字 ≒ 3KB |
| 連投 | 同じ案件へ **2 秒に 1 件まで**（`request.time > consult.lastAt + 2s` を Rules で強制）[TARGET]。案件文書への書き込みは推奨上限（1 文書 1 回/秒）の内側 |
| 削除・保持 | 編集・削除なし（`update, delete: if false`）。案件と共に残る。保持期間・退会時の扱いは既存の **NC-11** に含める（個人情報が自由記述に入りうる） |
| 購読 | 開いている会話 1 本だけリアルタイム。一覧・バッジは案件一覧の購読に載る |

### 2.3 既存の Rules・型への影響（変える所）

| 場所 | 変更 | 理由 |
|---|---|---|
| `validProject` の `hasOnly`（`firestore.rules:206`） | `consult` を任意キーに追加 | 追加しないと、`consult` を持つ案件を開発者が基本情報編集したとき `validProject` が落ちる（**回帰の主リスク**） |
| `projCreateOk` | `!d.keys().hasAny(['consult'])` | 作成時に偽の要約を持たせない |
| `projects/{pid}` の `allow update` | 既存 `stamped() && projUpdateOk(...)` に **`|| consultOk(pid)`** を足す（`updatedAt` を変えない＝一覧の並びを相談で動かさない） | §3 |
| `model.ts` の `projectDoc` | `consult` を読む（無ければ未対応なし） | 既存の案件は欄が無い＝Migration 不要 |

---

## 3. Rules の骨子（実装は database-engineer。式の数は 1 リクエスト 1000 の上限をエミュレータで計測）

| パス | admin | developer（`memberUids` に含まれる） | client（`accounts.projectId == pid`） | それ以外 |
|---|---|---|---|---|
| `tasks` get/list | ○ | ○ | **×** | × |
| `tasks` create | ×（NC-2） | ○ `validTask`・`status=='todo'`・`assigneeUids` ⊆ `proj(pid).memberUids`・`createdAt/By`・`stamped()` | × | × |
| `tasks` update | × | ○ `changed().hasOnly(['status','updatedAt','updatedBy'])`（＋NC-2 で題名・ページ・担当）・`stamped()` | × | × |
| `tasks` delete | × | × | × | × |
| `messages` get/list | ○（見るだけ） | ○ | ○（自分の案件） | × |
| `messages` create | × | NC-1 の返信者だけ。`side=='afro'` | ○ `side=='client'` | × |
| `messages` update/delete | × | × | × | × |
| `projects.consult`（`consultOk`） | × | 返信者 | ○ | × |

```
// 骨子（形の例。最終形は database-engineer）
function msgPath(pid, mid) { return /databases/$(db)/documents/projects/$(pid)/messages/$(mid); }
function seqId(n) { return string(n) をゼロ埋め 6 桁 }   // 実装時に Rules で作れるか確認（無理なら ID と seq の一致を正規表現で見る）
function sideOf(pid, a) { r = roleOf(a); return r == 'client' && a.projectId == pid ? 'client'
                          : r == 'developer' && request.auth.uid in proj(pid).memberUids ? 'afro' : 'none'; }
function consultOk(pid) {   // projects/{pid} の update の追加分岐
  let b = resource.data.get('consult', {'count': 0});
  let c = request.resource.data.consult;
  let s = sideOf(pid, acctOrNull());
  return s != 'none' && resource.data.archived == false
    && changed().hasOnly(['consult']) && c.keys().hasOnly(['count','lastAt','lastSide','lastName'])
    && c.count == b.count + 1 && c.count <= 5000 && c.lastAt == request.time && c.lastSide == s
    && (b.count == 0 || request.time > b.lastAt + duration.value(2, 's'))
    && existsAfter(msgPath(pid, seqId(c.count)));
}
match /projects/{pid}/messages/{mid} {
  allow get, list: if canRead(pid);
  allow create: if (d = request.resource.data)
       d.keys().hasOnly([...6 キー + schemaVersion]) && d.schemaVersion == 1
    && d.side == sideOf(pid, acctOrNull()) && d.side != 'none'
    && d.authorUid == request.auth.uid && d.authorName == acct().name && d.at == request.time
    && ansText(d.text, reMaxChat())
    && getAfter(projPath(pid)).data.consult.count == d.seq && mid == seqId(d.seq)
    && getAfter(projPath(pid)).data.consult.lastName == d.authorName;
  allow update, delete: if false;
}
```

**脅威と対策**（security-engineer へ）

| 脅威 | 対策 |
|---|---|
| お客様が社内のタスクを見る | `tasks` は client を許可しない。お客様の画面にタスク件数も出さない（ダッシュボードは client 対象外） |
| 協力会社の開発者が担当外の案件を見る | 既存の `assigned(pid)` と同じ（担当を外すと即座に読めなくなる） |
| 相談の連投・大量投稿（費用・迷惑） | 2 秒 1 件・1 案件 5,000 件・1 件 1000 字を Rules で強制。App Check は既存 NC-7 |
| 他人の名前・お客様側を名乗る | `side` は役割から、`authorName` は accounts と一致を強制 |
| 未対応を偽って消す（要約だけ書き換える） | `consult` はメッセージ作成と同じトランザクションでだけ変えられる（`existsAfter`）。`count` は +1 だけ |
| 相談に個人情報・パスワードを書かれる | 入力欄の下に「パスワード・カード番号などは送らないでください」。外部 AI へは送らない（今回の範囲に AI 処理なし）。保持は NC-11 |
| アーカイブした案件への投稿 | `archived == false` を要求 |
| 招待前・無効化済みの人 | 既存 `roleOf()`（status=active・メール一致）で拒否 |

**クライアントが決められる値**: `text`（長さだけ検査）、`title`・`page`（長さ）、`assigneeUids`（案件の担当に限定）、`status`（4 値）。`side`・`authorName`・`seq`・`at`・`consult` は**サーバー側の記録（accounts・案件・request.time）と一致を強制**するので自由に決められない。安全・料金・権限の判定に使う値は無い。

---

## 4. 未対応の件数（メニューのバッジ）

- **既読状態は持たない**（demo と同じ「最後がお客様＝未対応」）。新しい文書・購読は 0、追加 Read 0（案件一覧の購読に `consult` が載るため）
- 件数＝`consult.lastSide == 'client'` の案件数。開発者は NC-1 の返信者である案件だけ、admin は全案件（admin の相談一覧は見るだけ）
- 既存の `NavItem.badge` は DemoState を受け取る形（`nav.ts:31`）なので、live は **LiveShell が案件一覧から数えた数を渡す**（`liveNav.ts:25` で demo のバッジを外しているのと同じ考え）
- お客様側の「返信が来た」表示: ポータルのメニューに `lastSide == 'afro'` の印を出すのは任意（NC-5）
- メール通知は**今回入れない**（Firestore トリガーの Functions ＋メール送信サービス＝新規外部サービス・継続費用。NC-4）
- 「人ごとの既読」が必要になったら `projects/{pid}/consultReads/{uid}`（lastReadSeq）を足す（1 人 1 案件 1 文書・既読のたびに 1 Write）。閾値: 1 案件に返信者が 3 人以上いて対応の重複が問題になったとき

---

## 5. コスト（Read の見積。Confidence: LOW・未計測。前提は BACKEND_FIREBASE §12.2）

| 操作 | Read | Write |
|---|---|---|
| ダッシュボードを開く（開発者） | 案件一覧は既存購読 0 ＋ タスク ≦ 300（通常 10〜30）＋ Rules の get なし（list は `assigned()` で 1） | 0 |
| ダッシュボードを開く（admin・最近の承認つき） | 10 ＋ タスク | 0 |
| 構築タスクを開く | ダッシュボードと共有（同じ購読） | 0 |
| タスクの追加・状態変更 | Rules の get 2〜3 | 1 |
| 相談の会話を開く | ≦ 50 | 0 |
| 1 件送る（トランザクション） | 案件 1 ＋ Rules の get 3〜4 | 2（メッセージ＋案件）。案件一覧を購読中の人数ぶん Listener の Read が各 1 |

- 1 日: 10 案件・1 日 30 件の相談・タスク変更 50 回でも Read は数千（無料枠 50,000/日の 1 割未満）。**金額の増分はほぼ 0 円**（Blaze の無料枠内 [INFERENCE]）。Functions の増分なし
- 実測: 公開後 1 週間で platform-engineer が使用量グラフを取得 → この担当が突合（§12.3 と同じループ）

---

## 6. Migration

- **既存データの移行は無い**。新しいコレクションは空から始まり、`consult` が無い案件は「相談なし」として読む（converter で吸収）
- **demo のデータ（localStorage のタスク・相談・デプロイ）は live へ移さない**（架空のデータ。§13.1 の「混ぜない」）
- 戻し方: フロントは revert か `VITE_DATA_MODE=demo`。Rules は前の版を再デプロイ（`consult` の追加分岐を消しても既存の欄は読めるだけで害はない）。作られたタスク・メッセージは残る（消さない）
- Validation: Rules テストで「`consult` を持つ案件の基本情報編集・アサイン・確認依頼・承認が従来どおり通る」ことを確かめる

---

## 7. 実装の単位と順序（推奨）

| # | 単位 | 書く範囲（Write Scope） | 規模 | テスト |
|---|---|---|---|---|
| U1 | ダッシュボード（案件カード・状態別件数のみ。Rules 変更なし） | `src/live/pages/LiveDashboardPage.tsx`（新規）、導出関数（`src/live/dashboard.ts` 新規）、`LiveApp.tsx` のルート追加（**メニューはまだ変えない**） | M | unit: 状態別件数・空表示・admin/dev の出し分け（`tests/unit/`） |
| U2 | 構築タスク | `firestore.rules`（tasks）、`tests/rules/tasks.test.mjs`（新規）、`src/live/model.ts`（taskDoc）、`src/live/repositories.tsx`（購読・追加・状態変更）、`src/live/pages/LiveTasksPage.tsx`（新規。demo の部品を再利用）、ダッシュボードの構築状況の区画 | **L**（権限） | rules: 役割 4 種×操作、担当外 uid の拒否、client の read 拒否、status 以外の変更拒否、delete 拒否、式の数の計測。unit: 変換・絞り込み |
| U3 | 相談（開発者・admin・お客様ポータル） | `firestore.rules`（messages・consultOk・validProject・projCreateOk）、`scripts/gen-rules-questions.mjs`（reMaxChat）、`tests/rules/consult.test.mjs`（新規）＋ `projects.test.mjs` の回帰、`model.ts`・`repositories.tsx`、`src/live/pages/LiveConsultPage.tsx`（新規。ChatPage の表示部品を再利用）、ポータルの相談ルート | **XL**（権限＋個人情報。security-engineer 同席） | rules: side の偽装・authorName 偽装・seq の飛ばし/重複・2 秒制限・5000 上限・archived・要約だけの書き換え・admin の送信拒否・**consult を持つ案件の既存の更新 4 種が通る**。unit: 未対応の判定 |
| U4 | メニューの切り替え | `src/live/liveNav.ts`、`LiveShell.tsx`（相談のバッジ・アカウントメニューにユーザー管理）、プロジェクト詳細からヒアリングへの導線、`tests/unit/liveNav.test.mjs` | M | unit: 役割ごとの 4 項目・バッジの数・ユーザー管理が admin だけ |

- 順序: **U1 → U2 → U3 → U4**（U1 は導出だけで Rules を触らず最小のリスク。U2 と U3 は Rules の別区画だが同じファイルなので**並行させない**）。各単位の後に `npm run test:rules`（エミュレータ・demo-afro-cms 固定）と unit を実行。本番の Rules・Index のデプロイはユーザー承認の後に lead-architect が判断
- Index: **追加なし**（すべて単一フィールド。§2.1 の作り替え時だけ複合 1 本）。エミュレータは Index を強制しないので、本番の初回表示で確認する
- **変更しないもの**: demo モードの画面・データ・reducer（`src/features/dev/*`・`src/features/chat/*` は部品の再利用のみで挙動を変えない）／既存の requirements・approvals・aiDrafts・accounts・invites の Rules の式／`updatedAt` の意味と案件一覧の並び／Functions（追加なし）／お客様ポータルの既存画面（確認・承認）

---

## 8. NEED CONFIRMATION（ユーザーの判断が要るもの）

| # | 質問 | 推奨 | 決めないと |
|---|---|---|---|
| NC-1 | live で相談に**返信できる人**は誰か。demo は「担当ディレクター（ownerId）だけ、開発担当は閲覧のみ」だが、live の `ownerUid` は作成者で、admin が作った案件では admin になり誰も返信できない | **当面はその案件の担当開発者全員が返信できる**（未対応の件数も全員に出す）。ディレクター制が必要なら案件に `directorUid` を足す（admin が設定） | U3 の Rules が書けない |
| NC-2 | 構築タスクを**作れる・変えられる人**。admin は見るだけでよいか。題名・担当の変更と削除は要るか | 作成・状態変更は担当開発者。admin は見るだけ。削除なし（完了で閉じる）。題名・担当の変更は後回し | U2 の範囲 |
| NC-3 | **お客様が live で相談を使うか**（ポータルのメニューに「相談」を足す） | 使う（使わないとアフロ側の相談画面が空のまま） | U3 の範囲・お客様向け文言 |
| NC-4 | 相談の**メール通知**（お客様から来たら担当へ／返信したらお客様へ） | 今回は無し（メニューのバッジだけ）。入れるならメール送信サービスの採用と継続費用の確認が別途必要 | 対応の遅れ |
| NC-5 | お客様側に「返信あり」の印を出すか | 出す（追加 Read 0） | 小 |
| NC-6 | ダッシュボードの「最近のデプロイ」を live で出さないこと | 出さない（live にデプロイの記録が無い） | 画面の構成 |
| NC-7 | 相談の**添付ファイル**（画像・PDF） | 今回は無し（Storage・ウイルス対策・保持の設計が別に要る） | — |
| NC-8 | 相談の**保持期間**（案件終了後・お客様の退会後） | 既存 NC-11（回答・承認ログ）と同じ扱いでまとめて決める。それまでは消さない | 個人情報の方針 |
| NC-9 | サイドの 4 項目は **admin と開発者の両方**か（お客様ポータルは別のまま） | 両方。admin のダッシュボード・構築タスク・相談は全案件を見るだけ | U4 |

## 9. 未確認（[UNKNOWN]・実装時に確認）

- Rules で `seq` を 6 桁ゼロ埋めの文字列にできるか（できなければ ID と `string(seq)` の一致にし、並びは `seq` 欄で取る）
- `consultOk` と既存の `projUpdateOk` を `||` で並べたときの式の数（1000 の上限）— エミュレータで計測
- 協力会社の開発者が、他の協力会社の担当者名を `useDevPeople()` で引けるか（accounts の get は社内の人だけ。`firestore.rules:137-138`）。引けなければ「担当者（協力会社）」と表示
