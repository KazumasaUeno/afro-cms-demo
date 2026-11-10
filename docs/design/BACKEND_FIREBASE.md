# Firebase バックエンド設計（要件定義まで）

- 作成: 2026-11-10 data-backend-architect（設計のみ。実装・設定変更はしていない）
- 判定: lead-architect の Data Design Review 待ち（**自分の設計を自分で承認しない**）
- 状態: **DRAFT**。§22 の NEED CONFIRMATION が決まるまで実装に入らない
- ラベル: [FACT] コード・公式資料で確認 ／ [INFERENCE] 推測 ／ [UNKNOWN] 未確認 ／ [DECISION] 今回の設計判断（提案。承認前） ／ **[NC]** ユーザー確認が必要

---

## 0. 前提と範囲

### 0.1 決定済み（ユーザー 2026-11-10）

| 項目 | 内容 |
|---|---|
| 基盤 | Firebase Authentication ＋ Cloud Firestore。**Cloud Storage は今回使わない**（Spark 無料プランで足りる範囲） |
| フロント | 静的 Vite SPA のまま GitHub Pages（`https://kazumasaueno.github.io/afro-cms-demo/`）。main への push で GitHub Actions がデプロイ（[FACT] `.github/workflows/pages.yml:3-6`） |
| 実データにする範囲 | 3 エリアのログイン（管理者＝PMO 閲覧中心 ／ 開発者＝作業 ／ お客様ポータル＝承認）、プロジェクト作成、ヒアリング回答（ウィザード＋CSV 取り込み）、要件定義書、お客様による要件定義書の承認、承認履歴（日時つき・証跡・お客様から改ざんできない）、開発者の案件アサイン |
| 範囲外 | サイトマップ・デザイン・品質・CMS・サイネージ・写真（§14 で扱いを提案） |

### 0.2 現状（確認した実物）

| 項目 | 確認結果 |
|---|---|
| 状態の持ち方 | [FACT] `DemoState` 全体を 1 つの reducer で持ち、localStorage `afro-cms-demo:state` へ 250ms 遅延で丸ごと保存（`src/store/DemoStore.tsx:37-41`） |
| ログイン | [FACT] 実認証なし。エリアごとに「ログイン済み」とメールだけを localStorage `afro-cms-demo:session` に保存（`src/services/session.ts:10,41-43`）。可否判定は `src/store/access.ts:13-25` で「見た目の制御だけ・セキュリティ境界ではない」と明記 |
| 要件データ | [FACT] `RequirementSession` は 1 案件分だけ（`src/types/index.ts:85-96`、`reducer.ts:95-112` のコメント「要件・サイトマップ・デザインのデータは 1 案件分」）。回答の分担は 2026-11-10 決定で `afro` 固定（`DemoStore.tsx:18-25`） |
| 要件定義書 | [FACT] 保存しない。`buildProposal(answers, competitors)` で毎回計算（`src/features/requirements/buildProposal.ts:53`） |
| 入力制限 | [FACT] `validation.ts:3-6` `MAX_URL=200` / `MAX_TEXT=120` / `MAX_LONGTEXT=600` / `MAX_COMPETITORS=3`、longtext は必須時 4 文字以上（`:38`） |
| CSV | [FACT] 列「質問ID, カテゴリ, 質問, 回答」、1MB 上限、検査は `validateAnswer` と同じ、反映は `setAnswer`（`csv.ts:5-13,153-179`） |
| 承認 | [FACT] `approveRequirements` は `analyzed` かつ確認待ちなしで `approved`、`approvalLogs` に 1 件追加。`by` 省略時は**アフロが代理で承認**した扱い（`reducer.ts:193-202`） |
| 承認ログ | [FACT] `ApprovalLog{id, at, actor, side, action, target, projectId?}`（`types/index.ts:183-192`）。`at` はブラウザの時計（`reducer.ts:97` `nowIso()`） |
| 開発者アサイン | [FACT] `devProjects: Record<memberId, projectId[]>`（`types/index.ts:415`） |
| テスト基盤 | [FACT] `package.json` にテストランナー無し（scripts は dev/build/preview/typecheck のみ） |

### 0.3 この設計で変更しない部分

- デモモード（営業用）の挙動・データ・`reducer.ts`・`seed.ts`・localStorage キー。**デモモードは Firebase に一切接続しない**
- `validation.ts` / `assignment.ts` / `csv.ts` / `buildProposal.ts` のロジック（画面と Rules の**正**として残し、Rules はこれを写す）
- `src/types/index.ts` のドメイン型（Firestore の Timestamp ⇔ ISO 文字列の変換は repository 層で行う。型ファイル冒頭の方針 `types/index.ts:1-5` どおり）
- 範囲外の機能（§14）

---

## 1. 全体構成

```
[ブラウザ: Vite SPA (GitHub Pages)]
   ├─ データモード = demo   → 既存 DemoStore（localStorage）。Firebase SDK を読み込まない
   └─ データモード = live   → repository 層（firebase 実装）
          ├─ Firebase Auth（メール＋パスワード、メール確認必須）
          └─ Cloud Firestore（Security Rules が唯一の権限境界）
[Firebase Console]  初代管理者の招待作成・Auth ユーザーの削除（運用手順。Cloud Functions なし）
[ローカル / CI]     Firestore・Auth エミュレータ（project = demo-afro-cms 固定）で Rules テスト
```

- サーバー側コードは**無い**（Cloud Functions は Blaze プランが必要。[FACT] Firebase の料金ページ。§21）。したがって**権限・整合性・証跡はすべて Security Rules で守る**
- 結果として: カスタムクレームは使えない（付与に Admin SDK が要る）→ **役割は Firestore の `accounts/{uid}` を正**にし、Rules で `get()` して判定する

---

## 2. ロールと権限モデル

### 2.1 役割

| 役割 | 誰 | エリア |
|---|---|---|
| `admin` | アフロの PMO | 管理者画面 `/` |
| `developer` | アフロ社員・協力会社（`affiliation: internal / partner`） | 開発者画面 `/dev` |
| `client` | お客様の担当者（1 人 = 1 アカウント = 1 案件。現行 `ClientAccount.projectId` が単一なのに合わせる） | お客様ポータル `/portal` |

### 2.2 権限表（[DECISION] 案。**[NC-1]** 管理者の「閲覧のみ」の範囲）

「管理者＝PMO は閲覧のみ・作業は開発者」と、現行の管理者画面にある「プロジェクト作成・ユーザー管理」が食い違う。推奨案は「**管理者は案件の中身を書かない。人と権限（招待・無効化・アサイン）だけ書く**」。

| 操作 | admin | developer（アサイン済み案件） | client（自分の案件） |
|---|---|---|---|
| 全案件の閲覧 | ○ | ×（アサイン案件のみ） | ×（自分の 1 案件のみ） |
| プロジェクト作成 | ×（推奨）※NC-1 | ○（作成者が自動でアサインされる） | × |
| プロジェクト基本情報の編集 | × | ○ | × |
| ヒアリング回答の入力・CSV 取り込み | × | ○（`draft` の間だけ） | ×（2026-11-10 決定でアフロが全問入力） |
| 要件定義書の作成（分析完了＝確認依頼） | × | ○ | × |
| 要件定義書の承認 | × | ×（代理承認は **[NC-2]**） | ○ |
| 承認履歴の閲覧 | ○（全案件） | ○ | ○（自分の案件） |
| 承認履歴の変更・削除 | **×** | **×** | **×**（誰もできない。§7） |
| 招待（開発者・お客様）・無効化 | ○ | × | × |
| 開発者の案件アサイン | ○ | × | × |

- 1 人が admin と developer を兼ねる場合の扱いは **[NC-3]**（推奨: 当面は 1 アカウント 1 役割。兼務者は 2 つのメールで 2 アカウント）
- 現行デモは 1 ブラウザで 3 エリアに同時ログインできる（`session.ts:13` エリアごとのセッション）。**Firebase Auth は 1 ブラウザ 1 ユーザー**なので、live モードでは同時ログイン不可。3 エリアを並べて見せるのはデモモードの役割にする

### 2.3 認証方式（[DECISION] 案）

| 方式 | 判断 |
|---|---|
| **メール＋パスワード ＋ メール確認必須** | **推奨**。Rules で `request.auth.token.email_verified == true` を必須にする |
| メールリンク（パスワードレス） | 不採用。Spark のメールリンク送信は**1 日 5 通**と記載あり（[FACT 要再確認] [Firebase Auth limits](https://firebase.google.com/docs/auth/limits)。翻訳版間で値が揺れており最近変更された旨の注記あり） |
| Google ログイン | 任意（社員が Google アカウントを持つなら開発者だけ追加してよい。メール確認済みで返る） |

- パスワード再設定・メール確認メールの Spark 上限は **[UNKNOWN]**（上記 limits ページで確認する。§23）
- 送信元は既定で `noreply@<project>.firebaseapp.com`。迷惑メール扱いの可能性 [INFERENCE]。独自ドメイン化は後回し
- Auth の新規登録自体は誰でもできてしまう（Spark・Functions なしでは止められない [INFERENCE]）。**登録しただけでは何も読めない**（招待を受け取った `accounts` 文書が無ければ Rules がすべて拒否）ことで守る

### 2.4 招待と有効化（Functions なしで成り立たせる「招待の受け取り」方式）

```
1. admin が invites/{email小文字} を作る（role・name・company・projectId）           … status: invited
2. 本人がログイン画面で「招待されたメール」で新規登録 → 確認メールのリンクを開く
3. 本人がログイン → アプリが invites/{自分のメール} を読む（Rules: token.email 一致 かつ email_verified）
4. 1 つのバッチで:
     accounts/{uid} を作る（role・projectId は招待と同じ値でなければ Rules が拒否）
     invites/{email} を claimed に更新（claimedBy = uid, claimedAt = request.time）
5. 以後の権限判定は accounts/{uid}.role / status / projectId
```

- 現行の状態 `invited → active → disabled`（`types/index.ts:348`）にそのまま対応（invited＝招待のみ、active＝`accounts` 作成済み、disabled＝admin が `accounts.status` を変更）
- 無効化は **Rules が毎回 `accounts` を読む**ので即時に効く（開いている画面の Listener も permission-denied で切れる）。Auth ユーザー自体は残る（削除は Console。§17）
- 招待の取り消し: admin が `invites.status = revoked`（未使用の招待だけ）

### 2.5 初代管理者の作り方（Bootstrap。Functions・Admin SDK を使わない）

1. Firebase Console → Firestore → `invites` に文書 ID = 管理者のメール（小文字）で `{role:'admin', name, status:'invited', createdAt, createdBy:'console'}` を手で作る（**Console からの書き込みは Rules を通らない** [FACT] Firebase の仕様）
2. 管理者がアプリで新規登録 → メール確認 → ログイン → §2.4 の 4 で自分の `accounts` が admin で作られる
3. 2 人目以降の admin も同じ（Console で招待）。**アプリから admin を招待できる UI は作らない**（権限昇格の経路を 1 つ減らす）[DECISION]
4. 手順は `docs/operations/RUNBOOK_FIREBASE.md`（実装時に作成）に置く

---

## 3. Source of Truth

| データ | 正（Source of Truth） | 複製と理由 |
|---|---|---|
| ログインできる人・パスワード | Firebase Auth | なし |
| 役割・有効/無効・お客様の担当案件 | `accounts/{uid}` | なし（Auth のカスタムクレームは使わない） |
| 招待 | `invites/{email}` | `accounts` 作成時に role/projectId をコピー（Historical Snapshot。招待はその後変わらない） |
| プロジェクト基本情報 | `projects/{pid}` | なし |
| 開発者アサイン | `projects/{pid}.memberUids` | **現行の `devProjects`（人→案件）は持たない**。人→案件は `array-contains` クエリで引く |
| 要件の状態（draft / analyzed / approved）・世代番号 | `projects/{pid}.requirements`（入れ子のマップ） | なし。一覧カードの段階表示もここから導く（**別の要件文書へ状態を二重に持たない**） |
| ヒアリング回答 | `projects/{pid}/requirements/current.answers` | 競合サイトは回答 `q-competitor` が正。**現行の `competitors` 列は持たない**（`reducer.ts:162-163` で回答と揃えている重複を解消） |
| 要件定義書（提案内容） | 分析完了時に `requirements/current.proposal` へ保存した写し | Historical Snapshot。`buildProposal` のコードが後で変わっても、お客様が見た内容は変わらない |
| 承認の証跡 | `projects/{pid}/approvals/{aid}` | 承認時点の回答・提案の写し（Historical Snapshot。§7） |
| 段階・進捗・承認待ち件数 | **保存しない**。`projects.requirements` から画面で導く | 現行 `syncDemoProject` が導いているのと同じ方針 |
| 操作者の表示名 | `accounts.name` | 承認ログに `actorName` を写す（当時の名前を残す Historical Snapshot） |

---

## 4. 重複の分類

| 複製 | 分類 | 同期 |
|---|---|---|
| `approvals.answers` / `approvals.proposal` | Historical Snapshot | 同期しない（承認時点で固定） |
| `approvals.actorName` / `actorEmail` | Historical Snapshot | 同期しない |
| `accounts.role` / `projectId`（招待から） | Historical Snapshot | 同期しない |
| `requirements/current.proposal` | Historical Snapshot（分析時点の計算結果） | 差し戻し→再分析のたびに作り直す |
| Firestore SDK のローカルキャッシュ | Cache | SDK が管理。永続キャッシュは使わない（§13.4） |

上記以外の複製は作らない（Accidental Duplication を作らない）。

---

## 5. コレクションと文書の形

日時はすべて Firestore `Timestamp`。**証跡・状態遷移の日時は `serverTimestamp()` で書き、Rules で `== request.time` を強制**する（ブラウザの時計を使わない）。

### 5.1 `accounts/{uid}`

```ts
{
  schemaVersion: 1,
  role: 'admin' | 'developer' | 'client',
  status: 'active' | 'disabled',
  email: string,            // 小文字。token.email と一致
  name: string,             // 1〜40 文字
  company?: string,         // client のみ。1〜80 文字
  projectId?: string,       // client のみ（担当案件 1 件）
  affiliation?: 'internal' | 'partner',  // developer のみ
  partnerCompany?: string,  // partner のみ必須
  devRole?: string,         // 開発者の役割名（例: フロントエンドエンジニア）
  activatedAt: Timestamp,   // 招待を受け取った時刻 = request.time
  disabledAt?: Timestamp,
  updatedAt: Timestamp, updatedBy: string
}
```

### 5.2 `invites/{email}`（文書 ID = 小文字のメール）

```ts
{
  schemaVersion: 1,
  role: 'admin' | 'developer' | 'client',
  status: 'invited' | 'claimed' | 'revoked',
  name: string, company?: string, projectId?: string,
  affiliation?: ..., partnerCompany?: ..., devRole?: ...,
  createdAt: Timestamp, createdBy: string,      // admin の uid（初代は 'console'）
  claimedBy?: string, claimedAt?: Timestamp,
  revokedAt?: Timestamp
}
```

- 文書 ID がメールなので **同じメールの二重招待は構造で起きない**（create-only。現行の「小文字で重複判定」`types/index.ts:357` と同じ意味）
- お客様の招待時に `projectId` の案件が存在することを Rules で確認（`exists()`）

### 5.3 `projects/{pid}`（ID は SDK の自動 ID）

```ts
{
  schemaVersion: 1,
  clientName: string, siteName: string, siteUrl: string, siteUrlKey: string,
  industry: string, accent: string, launchDate?: Timestamp,
  ownerUid: string,                 // 作成した開発者
  memberUids: string[],             // アサインされた開発者（最大 20 [TARGET]）
  requirements: {
    status: 'draft' | 'analyzed' | 'approved',
    revision: number,               // 分析（確認依頼）のたびに +1。0 = 未分析
    analyzedAt?: Timestamp,
    approvedAt?: Timestamp, approvedBy?: string, approvalId?: string
  },
  archived: boolean,                // 削除の代わり（§17）
  createdAt: Timestamp, createdBy: string, updatedAt: Timestamp, updatedBy: string
}
```

### 5.4 `siteKeys/{siteUrlKey}`（サイト URL の重複防止）

```ts
{ projectId: string, createdAt: Timestamp }
```

- 現行 `createProject` は URL の重複を拒否している（`reducer.ts:144-145`）。Firestore はクエリで一意性を保証できないため、**正規化したホスト名＋パスを ID にした鍵文書を同じバッチで作る**（create-only なので二重作成は Rules が拒否）
- `siteUrlKey` の正規化規則は `projectForm.ts` の重複判定と同じにする（実装時に関数を共有）。**今回は作成後の siteUrl 変更を不可**にする（鍵の付け替えを避ける）[DECISION・SAFE ASSUMPTION]

### 5.5 `projects/{pid}/requirements/current`（1 案件 1 文書）

```ts
{
  schemaVersion: 1,
  mode: 'afro',                                  // 2026-11-10 決定で固定
  answers: { [questionId: string]: string | string[] },   // 未回答はキー自体を持たない
  answerMeta: { [questionId: string]: { by: 'afro' | 'client', at: Timestamp } },
  proposal?: Proposal,                           // 分析完了時の buildProposal() の結果
  proposalRevision?: number,                     // = projects.requirements.revision
  updatedAt: Timestamp, updatedBy: string
}
```

- 1 文書にする理由: 画面を開く Read が 1 回、CSV 取り込みが Write 1 回で済む。回答は `update({'answers.q-xxx': v})` のフィールド単位更新なので、**2 人が別の質問を同時に編集しても上書きし合わない**
- 大きさ: 最悪でも 600 文字 × 3 バイト × 質問数 ≒ 質問 100 問で約 180KB（1 文書 1 MiB 上限 [FACT] Firestore quotas）。提案を含めても余裕あり [INFERENCE]
- 現行の `analyzedAt/approvedAt/status` は `projects.requirements` に移す（§3）

### 5.6 `projects/{pid}/approvals/{aid}`（証跡。追記のみ）

```ts
{
  schemaVersion: 1,
  kind: 'requirements',                 // 将来 sitemap / design / quality を足す
  action: 'submit' | 'approve' | 'withdraw',
  revision: number,                     // どの世代の要件定義書か
  side: 'afro' | 'client',
  actorUid: string, actorName: string, actorEmail: string,
  at: Timestamp,                        // == request.time（Rules で強制）
  answers?: map, proposal?: map,        // approve / submit のときの写し（Rules で現物と一致を強制）
  note?: string                         // 0〜200 文字（差し戻し理由など）
}
```

- 文書 ID は**決定的**: `requirements-r{revision}-{action}`（例 `requirements-r2-approve`）。§7.2

### 5.7 現行型との対応

| 現行（`types/index.ts`） | live モード |
|---|---|
| `Project.stage / progress / pendingApprovals / nextAction` | 保存しない。`requirements.status` から導く |
| `Project.ownerId`（Member.id） | `ownerUid` |
| `RequirementSession.competitors` | 持たない（`answers['q-competitor']`） |
| `ApprovalLog.actor / side / action / target / at` | `actorName / side / action / kind / at`（target は kind から表示文字列を作る） |
| `ClientAccount` / `DevUser` / `devAccess` | `invites` ＋ `accounts`（`devAccess` は role=developer かつ active で表す） |
| `devProjects` | `projects.memberUids` |
| `Activity` | 今回は持たない。ホームの最近の動きは `approvals` の collectionGroup から作る（§10） |

---

## 6. 要件の状態遷移

```
draft ──(開発者: 分析完了＝確認依頼。revision+1, proposal 保存, approvals に submit)──▶ analyzed
analyzed ──(開発者: 差し戻し。approvals に withdraw)──▶ draft
analyzed ──(お客様: 承認。approvals に approve)──▶ approved   … 今回は終端（やり直し不可）
```

| 規則 | 理由 |
|---|---|
| **回答は `draft` のときだけ変更できる**（現行は `analyzed` でも変更可＝`reducer.ts:156` は `approved` のみ拒否） | **お客様が承認する対象を固定するため**。確認依頼後に開発者が回答を変えると、お客様が見た内容と承認した内容がずれる。変更したいときは差し戻す → 再分析（revision が上がる）。**[NC-4]** 現行の挙動からの変更 |
| `approved` から戻せない | 現行と同じ（`reducer.ts:204-206`）。承認後の変更手続き（再承認）は今回の範囲外 **[NC-5]** |
| 代理回答の確認（`confirmAnswer`） | mode が `afro` 固定なので live モードでは発生しない。answerMeta は表示用に残す |

---

## 7. 承認の証跡（改ざん耐性と二重承認の防止）

### 7.1 証跡として守ること

| 要求 | 手段 |
|---|---|
| 日時をお客様・開発者が偽れない | `at == request.time`（サーバー時刻）を Rules で強制 |
| 承認した人を偽れない | `actorUid == request.auth.uid`、`actorEmail == request.auth.token.email`、`actorName == accounts.name` を Rules で強制 |
| 承認した内容を偽れない | `answers == requirements/current.answers` かつ `proposal == requirements/current.proposal` を Rules で強制（`analyzed` の間は回答・提案が変更不可なので、承認時点の現物と一致する） |
| 承認ログの変更・削除 | **`allow update, delete: if false`（admin を含む全員）** |
| 状態と証跡が食い違わない | 状態の更新（`projects.requirements.status = approved`）と承認ログの作成を**同じトランザクション**で書き、Rules で互いを `getAfter()` / `existsAfter()` で確認（片方だけの書き込みは拒否） |

**限界（[FACT] Firebase の仕様）**: Console と Admin SDK は Rules を通らない。つまり**プロジェクトの所有者（アフロ）は技術的には承認ログを書き換えられる**。お客様・開発者からの改ざんは防げるが、第三者に対する証拠力を高めるなら定期的な書き出し（ハッシュを残す）や Blaze 移行後の不変バックアップが要る **[NC-6]**。

### 7.2 Idempotency（二重承認・二重送信）

| 項目 | 決定 |
|---|---|
| 鍵 | 文書 ID `requirements-r{revision}-{action}`。**「次に同じものを作る場面」= 差し戻し後の再承認依頼**があるので、世代（revision）を鍵に含める |
| 2 回目（ダブルクリック・2 タブ・再送） | 同じ ID の create は Rules で拒否される（既存文書への create は update 扱い→`if false`） |
| 2 回目の応答 | 画面は permission-denied を受けたら**承認ログを読み直し、既にあれば「承認済み」として表示**。この分岐は `console.warn('approval already exists', {projectId, aid})` を必ず出す（無音にしない） |
| 承認はオフラインで受け付けない | `runTransaction` を使う（オンライン必須 [FACT] Firestore SDK の仕様）。押してからサーバー確定までボタンを無効化、確定後に「承認を記録しました（日時）」を表示。**楽観的表示をしない** |

### 7.3 代理承認（**[NC-2]**）

現行は「アフロが代わりに承認」できる（`reducer.ts:200-201`）。証跡の観点からの推奨:
- 推奨: live モードでは**お客様本人の承認のみ**。電話・紙で承認をもらった場合は開発者が `side:'afro'`・`note` 必須（例「11/12 電話で〇〇様より承認」）で記録できる別アクション `approve-proxy` を用意するかを決める

---

## 8. Security Rules（骨子。実装は database-engineer）

```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {

    // ---- 共通 ----
    function authed()   { return request.auth != null && request.auth.token.email_verified == true; }
    function me()       { return /databases/$(db)/documents/accounts/$(request.auth.uid); }
    function acct()     { return get(me()).data; }
    function active()   { return authed() && exists(me()) && acct().status == 'active'; }
    function isAdmin()  { return active() && acct().role == 'admin'; }
    function isDev()    { return active() && acct().role == 'developer'; }
    function isClient() { return active() && acct().role == 'client'; }
    function projPath(pid) { return /databases/$(db)/documents/projects/$(pid); }
    function proj(pid)  { return get(projPath(pid)).data; }
    function assigned(pid) { return isDev() && request.auth.uid in proj(pid).memberUids; }
    function clientOf(pid) { return isClient() && acct().projectId == pid; }
    function canRead(pid)  { return isAdmin() || assigned(pid) || clientOf(pid); }
    function changed()  { return request.resource.data.diff(resource.data).affectedKeys(); }
    function stamped()  { return request.resource.data.updatedAt == request.time
                              && request.resource.data.updatedBy == request.auth.uid; }
    function str(v, min, max) { return v is string && v.size() >= min && v.size() <= max; }

    // ---- accounts ----
    match /accounts/{uid} {
      allow get:  if (authed() && request.auth.uid == uid) || isAdmin() || isDev();
      allow list: if isAdmin();
      allow create: if claimOk(uid);                  // §2.4 の招待の受け取り
      allow update: if isAdmin() && uid != request.auth.uid      // 自分を無効化・降格しない
                    && changed().hasOnly(['status','disabledAt','name','devRole','updatedAt','updatedBy'])
                    && request.resource.data.status in ['active','disabled'] && stamped();
      allow delete: if false;                         // 削除は Console の運用手順（§17）
    }
    function invPath() { return /databases/$(db)/documents/invites/$(request.auth.token.email); }
    function claimOk(uid) {
      let before = get(invPath()).data;
      let after  = getAfter(invPath()).data;
      let d = request.resource.data;
      return authed() && request.auth.uid == uid
        && before.status == 'invited' && after.status == 'claimed' && after.claimedBy == uid
        && d.role == before.role && d.get('projectId', null) == before.get('projectId', null)
        && d.email == request.auth.token.email && d.status == 'active'
        && d.activatedAt == request.time
        && d.keys().hasOnly([ /* §5.1 の項目 */ ]);
    }

    // ---- invites ----
    match /invites/{email} {
      allow get:  if isAdmin() || (authed() && request.auth.token.email == email);
      allow list: if isAdmin();
      allow create: if isAdmin() && validInvite(email);    // role は developer / client のみ（admin は Console だけ）
      allow update: if (isAdmin() && resource.data.status == 'invited'
                         && changed().hasOnly(['status','revokedAt']) && request.resource.data.status == 'revoked'
                         && request.resource.data.revokedAt == request.time)
                    || (authed() && request.auth.token.email == email && resource.data.status == 'invited'
                         && changed().hasOnly(['status','claimedBy','claimedAt'])
                         && request.resource.data.status == 'claimed'
                         && request.resource.data.claimedBy == request.auth.uid
                         && request.resource.data.claimedAt == request.time
                         && existsAfter(/databases/$(db)/documents/accounts/$(request.auth.uid)));
      allow delete: if false;
    }

    // ---- projects ----
    match /projects/{pid} {
      allow get:  if canRead(pid);
      // list はクエリが条件を満たす形でないと拒否される（Rules はフィルタではない）
      allow list: if isAdmin() || (isDev() && request.auth.uid in resource.data.memberUids);
      allow create: if isDev() && validProject(request.resource.data)
                    && request.resource.data.ownerUid == request.auth.uid
                    && request.resource.data.memberUids == [request.auth.uid]
                    && request.resource.data.requirements == {'status':'draft','revision':0}
                    && getAfter(/databases/$(db)/documents/siteKeys/$(request.resource.data.siteUrlKey)).data.projectId == pid;
      allow update: if stamped() && (
           (isAdmin() && changed().hasOnly(['memberUids','archived','updatedAt','updatedBy'])
              && request.resource.data.memberUids.size() <= 20)                       // アサイン
        || (assigned(pid) && changed().hasOnly(['clientName','siteName','industry','accent','launchDate','updatedAt','updatedBy'])
              && validProject(request.resource.data))                                 // 基本情報
        || (assigned(pid) && changed().hasOnly(['requirements','updatedAt','updatedBy']) && devTransition(pid))   // 確認依頼・差し戻し
        || (clientOf(pid) && changed().hasOnly(['requirements','updatedAt','updatedBy']) && clientApprove(pid))   // 承認
      );
      allow delete: if false;

      match /requirements/current {
        allow get: if canRead(pid);
        allow create: if assigned(pid) && proj(pid).requirements.status == 'draft' && validReq(request.resource.data) && stamped();
        allow update: if assigned(pid) && stamped() && (
             (proj(pid).requirements.status == 'draft'
                && changed().hasOnly(['answers','answerMeta','updatedAt','updatedBy'])
                && validAnswers(request.resource.data.answers)           // §9 生成コード
                && request.resource.data.answerMeta.keys().hasOnly(request.resource.data.answers.keys()))
          || (getAfter(projPath(pid)).data.requirements.status == 'analyzed'
                && proj(pid).requirements.status == 'draft'
                && changed().hasOnly(['proposal','proposalRevision','updatedAt','updatedBy'])
                && request.resource.data.proposalRevision == getAfter(projPath(pid)).data.requirements.revision)
        );
        allow delete: if false;
      }

      match /approvals/{aid} {
        allow get, list: if canRead(pid);
        allow create: if (clientOf(pid) && approveOk(pid, aid))
                      || (assigned(pid) && submitOrWithdrawOk(pid, aid));
        allow update, delete: if false;      // 追記のみ。admin も不可
      }
    }

    // 状態遷移（抜粋）
    function clientApprove(pid) {
      let b = resource.data.requirements; let a = request.resource.data.requirements;
      return b.status == 'analyzed' && a.status == 'approved' && a.revision == b.revision
        && a.approvedAt == request.time && a.approvedBy == request.auth.uid
        && a.approvalId == 'requirements-r' + string(b.revision) + '-approve'
        && existsAfter(/databases/$(db)/documents/projects/$(pid)/approvals/$(a.approvalId));
    }
    function approveOk(pid, aid) {
      let b = proj(pid).requirements;
      let r = get(/databases/$(db)/documents/projects/$(pid)/requirements/current).data;
      let d = request.resource.data;
      return b.status == 'analyzed' && getAfter(projPath(pid)).data.requirements.status == 'approved'
        && aid == 'requirements-r' + string(b.revision) + '-approve'
        && d.kind == 'requirements' && d.action == 'approve' && d.side == 'client' && d.revision == b.revision
        && d.actorUid == request.auth.uid && d.actorEmail == request.auth.token.email && d.actorName == acct().name
        && d.at == request.time && d.answers == r.answers && d.proposal == r.proposal
        && d.keys().hasOnly(['schemaVersion','kind','action','revision','side','actorUid','actorName','actorEmail','at','answers','proposal']);
    }
    // devTransition / submitOrWithdrawOk / validProject / validInvite / validReq も同じ型で書く

    // 管理者の横断一覧（collectionGroup）
    match /{path=**}/approvals/{aid} {
      allow list: if isAdmin();
    }

    match /siteKeys/{key} {
      allow get: if isDev() || isAdmin();
      allow create: if isDev() && request.resource.data.keys().hasOnly(['projectId','createdAt'])
                    && request.resource.data.createdAt == request.time
                    && existsAfter(projPath(request.resource.data.projectId));
      allow update, delete: if false;
    }

    // 上記以外はすべて拒否（既定）
  }
}
```

注意点:
- **Rules はフィルタではない**。開発者の一覧は必ず `where('memberUids','array-contains', uid)` を付けて投げる（付けないと全体が拒否）
- `get()` / `exists()` は 1 回の評価で上限がある（単一文書 10・バッチ等 20 [FACT 要再確認] Rules の制限）。同じ文書の重複 `get` が 1 回と数えられるかは **[UNKNOWN]**（エミュレータで上限付近を試す。§16）
- お客様の招待時の `projectId` 存在確認、開発者の招待時の `affiliation`/`partnerCompany` の組み合わせは `validInvite` で検査（現行 `DevUser` の「partner のときだけ会社名必須」`types/index.ts:382-383` を写す）

---

## 9. 入力検証（`validation.ts` と Rules の対応）

**正は `validation.ts`**（画面と CSV が使う精密な検査）。Rules は「画面を通らない直接書き込み」を止める**粗い防御**として同じ上限を持つ。

| 種類 | `validation.ts` | Rules（`validAnswers` 内、質問ごと） |
|---|---|---|
| キー | 質問 ID は `REQUIREMENT_QUESTIONS` のみ（`csv.ts:168-169`） | `answers.keys().hasOnly([質問ID一覧])` |
| `text` | trim 後 1〜120 文字（`validation.ts:31-35`） | `is string && trim().size()` が 1〜120 |
| `longtext` | 必須時 4 文字以上、600 文字以内（`:36-40`） | 1〜600（**下限 4 は Rules に入れない**: 下書き保存で未完成の値を許すため。完成判定は画面と分析完了時に行う）[DECISION] |
| `url` | http(s)・URL として解釈可・ホストに `.`、200 文字以内（`:9-21`） | `size() <= 200 && matches('^https?://[^/\\s]+\\.[^/\\s]+.*$')`（URL 解析はできないので近似） |
| `single` | 選択肢のどれか | `in [選択肢]` |
| `multi` | 1 つ以上、選択肢のみ | `is list && size() >= 1 && hasOnly([選択肢])` |
| `q-competitor` | URL、最大 3 つ（`csv.ts:129-133`） | `is list && size() <= 3`（各 URL の形式は Rules でループできないため**検査しない**。§11） |
| 未回答 | `isAnswered` が偽（`validation.ts:46-48`） | **キーを持たない**（空文字・空配列は保存しない。`FieldValue.delete()` で消す） |

### 9.1 Rules の質問一覧は生成する

- Rules にはループが無いので、`validAnswers(a)` は質問ごとに `(!('q-xxx' in a) || <検査>)` を並べた関数になる
- **手書きしない**: `scripts/gen-rules-questions.mjs`（Node 22 の型除去で `src/data/requirements.ts` と `validation.ts` の定数を読む）で `firestore.rules` のマーカー間を生成し、`npm run rules:check` で**差分があれば失敗**させる（質問を足したのに Rules を直し忘れると、その質問が保存できなくなる＝`MEMORY: schema-evolution-safety` の事故の型）
- 未確認事項: Rules の `string.size()` が**文字数か UTF-8 バイト数か**、JS の `length`（UTF-16）との差（絵文字・サロゲートペア）は **[UNKNOWN]**。エミュレータで「日本語 120 文字」「絵文字を含む 120 文字」を試し、ずれるなら Rules 側を緩める（画面で通るのに保存で落ちる、を起こさない）
- 評価する式の数の上限に対し、質問 100 問規模で収まるかは **[UNKNOWN]**（エミュレータで全問回答の文書を書いて確認）

---

## 10. クエリと Index（Query-first）

| 画面 | クエリ | Index |
|---|---|---|
| 管理者: プロジェクト一覧 | `projects` `where archived == false` `orderBy updatedAt desc` `limit 50` | **複合** `archived ASC, updatedAt DESC` |
| 開発者: 担当案件 | `projects` `where memberUids array-contains uid` `orderBy updatedAt desc` `limit 50` | **複合** `memberUids ARRAY_CONTAINS, updatedAt DESC` |
| お客様: 自分の案件 | `get projects/{accounts.projectId}` | 不要 |
| 要件の画面 | `get projects/{pid}` ＋ `get requirements/current`（Listener 2 本） | 不要 |
| 承認履歴（案件内） | `projects/{pid}/approvals` `orderBy at desc` `limit 50` | 単一フィールド（自動） |
| 管理者: 全体の最近の承認 | `collectionGroup('approvals')` `orderBy at desc` `limit 20` | **collection group 範囲の単一フィールド** `at DESC`（fieldOverrides） |
| 管理者: ユーザー管理 | `accounts` `where role == X` `orderBy activatedAt desc` | **複合** `role ASC, activatedAt DESC` |
| 管理者: 招待一覧 | `invites` `where status == 'invited'` `orderBy createdAt desc` | **複合** `status ASC, createdAt DESC` |
| 案件ごとのお客様 | `accounts` `where projectId == pid` | 単一フィールド（自動） |

- **全件取得は無い**（すべて `limit`。Pagination は `startAfter` のカーソル）。件数は当面 50 件以内の想定 [TARGET]
- **エミュレータは複合 Index を強制しない**（[FACT] 体制の記録 `AIDevelopmentTeam/docs/knowledge/tech/firestore.md:18` T-001）。緑を根拠にせず、`firestore.indexes.json` を上表から作り、初回デプロイ後に本番で各一覧を 1 回ずつ開いて確認する
- 一覧カードの段階表示は `projects.requirements.status` から導くので、カードごとの追加 Read は無い（N+1 なし）

---

## 11. クライアントが決められる値の一覧（security-engineer / qa-engineer へ）

| 値 | 用途 | 安全・料金・権限に使うか | サーバー側の正 | 偽申告テスト |
|---|---|---|---|---|
| `accounts.role` / `projectId`（作成時） | 権限 | **使う** | `invites`（admin が作成）と一致を Rules で強制 | 要: 自分で role=admin にして作る → 拒否 |
| `approvals.at` / `projects.requirements.approvedAt` | 証跡 | **使う** | `request.time` | 要: 過去日時で作る → 拒否 |
| `approvals.actorUid/Email/Name` | 証跡 | **使う** | `request.auth` / `accounts.name` | 要: 他人の名前で作る → 拒否 |
| `approvals.answers/proposal` | 証跡 | **使う** | `requirements/current` と一致を強制 | 要: 改変した写しで承認 → 拒否 |
| `projects.memberUids`（作成時） | 権限 | **使う** | 作成時は `[自分]` のみ許可、以後 admin のみ | 要: 他人を入れて作る → 拒否 |
| `requirements/current.proposal` | お客様に見せる内容 | 使わない（ただし承認の対象） | なし（開発者の画面で `buildProposal` が作る。**開発者は信頼する前提**） | 不要（開発者による改ざんは承認前の確認で見つける運用）[INFERENCE] |
| `answerMeta.at` | 表示のみ | 使わない | なし（ブラウザ時刻を許容） | 不要 |
| 競合 URL の各値の形式 | 表示・提案の材料 | 使わない | なし（Rules でループ不可） | 不要。表示時に `validateUrl` を通し、リンク化は http(s) のみ（XSS 対策は security-engineer 確認） |
| `siteUrlKey` | 重複防止 | 使わない（品質） | 正規化関数の結果（Rules では再計算できない） | 低。ずらした鍵で重複作成は可能 → 開発者は信頼する前提 |

---

## 12. Read / Write とコストの見積（Spark）

### 12.1 Spark の無料枠（[FACT 要再確認] 公開資料。Last Verified は実装時に `docs/knowledge/tech/firestore.md` へ）

| 項目 | 1 日あたり |
|---|---|
| 文書の読み取り | 50,000 |
| 書き込み | 20,000 |
| 削除 | 20,000 |
| 保存容量 | 1 GiB（合計） |
| 下り転送 | 10 GiB / 月 |

- **超えると課金ではなく停止**（その日の上限到達後は失敗し、太平洋時間 0 時にリセット＝日本時間 16〜17 時 [INFERENCE 要確認]）。費用が膨らむ心配は無い代わりに、**枠切れ＝その日のサービス停止**になる
- Rules の `get()` / `exists()` も読み取りとして数えられる [FACT 要再確認]。Rules に拒否されたクエリも 1 読み取り数えられる [UNKNOWN 要確認]

### 12.2 見積（Confidence: **LOW**。公開枠のみ・未計測）

前提 [TARGET]: 同時進行 10 案件、開発者 6 人、お客様 15 人、1 日の画面表示 300 回。

| 操作 | Read | Write |
|---|---|---|
| 要件画面を開く（project・requirements・approvals 10 件・Rules の get 2〜3） | 約 15 | 0 |
| 回答 1 問の保存（800ms のまとめ書き＋フォーカス離脱時） | Rules の get 2 | 1 |
| CSV 取り込み（全問） | 2 | **1** |
| 分析完了（project・requirements・approval の 3 文書） | 約 5 | 3 |
| 承認（同上） | 約 6 | 3 |
| 一覧（50 件まで） | ≦ 51 | 0 |

- 1 日: Read 約 300 × 20 ＋ Listener の更新 ≒ **6,000〜10,000（枠の 12〜20%）**、Write **数百（枠の数 %）**、保存 1 案件 約 0.5MB（回答 ＋ 承認ごとの写し）× 100 案件 ≒ 50MB
- **金額: 0 円**（Spark。請求アカウントを付けない限り課金されない）
- 一番の危険は**キー入力ごとの保存**（Write 枠を食う）と、公開 URL に対する**嫌がらせの大量リクエストで枠を使い切られること**。前者はまとめ書きで、後者は App Check（reCAPTCHA。`firebase` SDK に含まれ追加依存なし）を**第 2 段階で入れる**提案 **[NC-7]**
- 営業デモはデモモード（Firebase に接続しない）なので枠を使わない

### 12.3 実測ループ

| いつ | 誰が | 何を |
|---|---|---|
| live 公開後 1 週間、以後月 1 回 | platform-engineer が Console の使用量グラフを取得 → この担当が本表と突合 | Read/Write/保存。±30% [TARGET] を超えたら前提を見直す |
| 1 日の Read が 25,000（枠の 50%）を超えた日が出たら | この担当 → lead-architect | Listener 本数の見直し、または Blaze 移行（§21）の判断 |

---

## 13. フロントの段階移行（同期 reducer → 非同期 repository）

### 13.1 データモード（Feature Flag）

| 値 | 意味 |
|---|---|
| `demo` | 現行どおり。localStorage・3 エリア同時ログイン・全機能。**Firebase SDK を読み込まない**（動的 `import()` で live のときだけ読み込み、デモの初回表示を重くしない） |
| `live` | 範囲内の機能を Firestore で動かす。範囲外は §14 |

- 決め方 [DECISION 案]: ビルド時の既定 `VITE_DATA_MODE`（既定 `demo`）＋ログイン画面の切り替え「デモを見る / ログインする」（選んだ値を `afro-cms-demo:mode` に保存）。**同じ公開 URL で営業デモと実運用を両立**できる
- 2 つのモードのデータは**混ぜない**（live で localStorage の DemoState を読まない・書かない。デモの「初期化」は live に影響しない）
- `VITE_DATA_MODE=demo` で再デプロイすれば live を即座に止められる（Rollback。§18）

### 13.2 repository 層

```
src/repositories/
  types.ts         ProjectsRepo / RequirementsRepo / ApprovalsRepo / AccountsRepo のインターフェース
  demo/            既存 DemoStore の dispatch と state を包む（Promise で返す）
  firebase/        Firestore 実装（converter で Timestamp ⇔ ISO、schemaVersion の吸収）
  RepoProvider.tsx モードに応じてどちらかを Context で渡す
```

- 画面は `dispatch({type:'setAnswer'})` → `await requirements.setAnswer(pid, qid, value)` に置き換える。読み取りは `useXxx(pid)` フックで `{data, loading, error}` を返す（demo 実装は即時に `loading:false`）
- 業務ロジック（`validation.ts`・`assignment.ts`・`csv.ts` の `planCsvImport`・`buildProposal`）は**両方の実装が呼ぶ**（重複させない）。reducer の中の不変条件（承認後は回答不可など）は Rules と firebase 実装でも同じ条件にし、**同じテスト観点**で確認する
- 切り替え順（1 段ずつ main に入れられる。各段で demo モードの動作は変わらない）:
  1. repository の型と demo 実装だけ入れ、画面を repository 経由に替える（Firebase なし）
  2. Auth ＋ `accounts` / `invites`（ログイン・招待・無効化）
  3. `projects`（作成・一覧・アサイン）
  4. `requirements/current`（ウィザード・CSV）
  5. 分析完了・承認・承認履歴（`approvals`）
  6. App Check・運用手順・本番 Rules デプロイ

### 13.3 楽観的表示とエラー

| 操作 | 表示 |
|---|---|
| 回答の入力・CSV 取り込み | 楽観的（SDK のローカル反映がすぐ Listener に返る [FACT] Firestore の latency compensation）。保存中は「保存中…」、確定で「保存しました」。Rules に拒否されたら SDK が値を戻すので、トーストで理由を出す |
| プロジェクト作成・アサイン・招待 | 確定を待つ（ボタンを無効化） |
| 分析完了・承認・差し戻し | **トランザクションで確定を待つ**。オフラインなら押せない（§7.2） |
| 権限喪失（無効化） | Listener の permission-denied → ログイン画面へ戻し理由を表示 |

### 13.4 オフライン

- **永続キャッシュ（IndexedDB）は使わない**（メモリキャッシュのみ）[DECISION 案]。お客様の共用 PC に個人情報・回答を残さないため。オフライン中の入力はタブを閉じると失われうる → 「オフラインです」バナーを出す

---

## 14. 範囲外機能の live モードでの扱い（**[NC-8]**）

| 案 | 内容 | 判断 |
|---|---|---|
| **A（推奨）** | live モードではサイドバーから隠す（サイトマップ・デザイン・品質・CMS・サイネージ・インサイト・デプロイ・タスク）。ポータルの承認は「1. 要件定義書」だけ表示し、2〜4 は「準備中」 | 実データとデモデータが同じ画面に混ざらない。お客様に「動いていない機能」を見せない |
| B | 表示するが「デモデータ」バッジを付けて p1 のデモデータを出す | お客様が自分の案件だと誤解する危険。承認ボタンが押せると証跡と食い違う |
| C | demo モードのみで表示（A と同じ）＋管理者だけ live でも見られる | A の派生 |

---

## 15. 環境設定

| 変数 | 内容 |
|---|---|
| `VITE_DATA_MODE` | `demo` / `live` の既定（既定 `demo`） |
| `VITE_FIREBASE_API_KEY` / `VITE_FIREBASE_AUTH_DOMAIN` / `VITE_FIREBASE_PROJECT_ID` / `VITE_FIREBASE_APP_ID` | Web 設定（Storage・Messaging は今回不要） |
| `VITE_FIREBASE_EMULATOR` | `1` のときローカルのエミュレータへ接続（開発用。本番ビルドでは未設定） |

- Web 設定は**秘密ではない**が、コードには書かない（`.env.local` は `.gitignore`、`.env.example` に項目名だけ）
- GitHub Actions: リポジトリの **Variables**（`vars.*`）に置き、`pages.yml` の Build ステップの `env:` で渡す（Secrets ではなく Variables）
- **API キーの制限**（Google Cloud Console）: HTTP リファラーを `https://kazumasaueno.github.io/*` と `http://localhost:*` に限定、API を Identity Toolkit / Token Service / Cloud Firestore に限定 [NC-9 作業はユーザー]
- Firebase Auth の**承認済みドメイン**に `kazumasaueno.github.io` を追加
- `.firebaserc` に `default` を置かない（§16）

---

## 16. テスト計画（エミュレータ）

### 16.1 誤って本番（他社案件）に触らないための決まり（**最重要**）

このPCの gcloud の既定プロジェクトは**別のお客様の本番**である（体制の記録。2026-09-14 の事故の原因）。

| 決まり | 内容 |
|---|---|
| テストの projectId | **`demo-afro-cms` 固定**。`demo-` で始まる ID はエミュレータ専用で、実在のリソースに接続しない [FACT] Firebase エミュレータの仕様 |
| 実行方法 | 必ず `firebase emulators:exec --only firestore,auth --project demo-afro-cms "<テストコマンド>"`。エミュレータを通さない直接実行を禁止 |
| テスト側の自己防衛 | テストの初期化で `projectId.startsWith('demo-')` でなければ即 throw。`FIRESTORE_EMULATOR_HOST` が無ければ即 throw |
| `.firebaserc` | `default` を置かない。デプロイは `--project <本番ID>` を毎回明示（`npm run deploy:rules -- --project ...` のように引数必須にし、無ければ失敗） |
| firebase-admin | 使わない（gcloud の既定に落ちる経路を作らない） |

### 16.2 実行環境

- テストランナーは追加しない: Node 22 組み込みの `node --test`（`@firebase/rules-unit-testing` はランナー非依存）
- Java 11 以上（エミュレータの要件。このPCは 17 [FACT] `CLAUDE.md` 11章）
- `npm run test:rules` = 上記 `emulators:exec`。CI（GitHub Actions）にも同じものを Build の前に置く（エミュレータは CI 上でも `demo-` プロジェクトで動く）

### 16.3 観点（qa-engineer が実行。件数は実装時に確定）

| 分類 | テスト |
|---|---|
| 未ログイン・未確認メール | 何も読めない / メール未確認で招待を受け取れない |
| 招待 | 他人のメールの招待を読めない・受け取れない / role を変えて受け取る→拒否 / 二重受け取り→拒否 / revoked は受け取れない |
| 権限昇格 | 自分の `accounts.role` を変える→拒否 / 開発者が `memberUids` に他人を足す→拒否 / admin を招待で作る→拒否 |
| 無効化 | disabled のアカウントは全読み取り拒否 / admin が自分を無効化→拒否 |
| 案件の分離 | お客様が他の案件を get→拒否 / アサイン外の開発者が get→拒否 / `array-contains` なしの list→拒否 |
| 状態遷移 | analyzed で回答変更→拒否 / approved から draft→拒否 / お客様が回答を書く→拒否 |
| 承認（証跡） | 過去日時→拒否 / 他人名義→拒否 / 改変した写し→拒否 / 状態だけ更新・ログだけ作成→拒否 / 同じ revision で 2 回目→拒否 / 承認ログの update・delete（admin 含む）→拒否 |
| 入力検証 | 各種類の上限ちょうど→許可、+1 文字→拒否 / 未知の質問 ID→拒否 / 選択肢外→拒否 / 競合 4 件→拒否 / **日本語・絵文字の文字数**（§9.1 の UNKNOWN） |
| 上限 | 全問回答の文書で Rules の式数上限に当たらない / 承認バッチで `get` 上限に当たらない |
| 回帰 | demo モードの既存動作（Build・型チェック・手動の主要導線） |
| 本番でしか分からないもの | 複合 Index（§10）・API キー制限・承認済みドメイン → 初回デプロイ後のスモーク手順に入れる |

---

## 17. 個人情報と削除

### 17.1 扱う個人情報

| データ | 場所 | 目的 |
|---|---|---|
| お客様担当者の氏名・メール・会社名 | Auth・`accounts`・`invites`・`approvals.actorName/Email` | ログイン・承認者の記録 |
| 開発者（社員・協力会社）の氏名・メール・所属 | 同上 | ログイン・アサイン |
| ヒアリング回答（自由記述に個人情報が入りうる） | `requirements/current`・`approvals` の写し | 要件定義 |

- 保存場所（Firestore のロケーション）は**作成後に変更できない** [FACT]。推奨 `asia-northeast1`（東京）**[NC-10]**
- お客様ポータルの利用規約・プライバシーポリシーの要否、承認の電子的な記録の法的な扱いは **LEGAL REVIEW REQUIRED**（AI は結論を出さない）

### 17.2 削除の挙動（Delete Behavior）

| 対象 | 挙動 | 手段 |
|---|---|---|
| アカウント（退職・契約終了） | まず **無効化**（アプリ）。完全削除は Auth ユーザー削除＋`accounts`・`invites` 削除 | **Console の運用手順**（Rules で delete を禁止しているため。Functions なしで自動化できない） |
| 承認ログの氏名・メール | **残す**（証跡）。アカウントを消しても残る | 保持期間・匿名化の要否 **[NC-11]** |
| プロジェクト | 削除しない。`archived = true` | アプリ（admin） |
| 回答・要件定義書 | プロジェクトと共に残る | 案件終了後の保持期間 **[NC-11]** |
| 保持期限による自動削除 | **無い**（Scheduler・Functions が無い。TTL ポリシーは Blaze 前提か要確認 [UNKNOWN]）。「期限を書いたが消えない」を避けるため、**今回は期限を設けず、手動の削除手順だけを用意**する | 必要になったら Blaze 移行時に設計（§21） |

- Orphan: アカウント削除後もプロジェクトの `memberUids` に uid が残る → 表示は「削除済みのユーザー」。admin がアサインから外す手順を運用手順に入れる

---

## 18. Rollback とバックアップ

| 対象 | 戻し方 |
|---|---|
| フロント | main の revert → Pages が再デプロイ（約数分）。または Variables の `VITE_DATA_MODE=demo` にして再実行（live を止める） |
| Security Rules | Console の Rules 履歴から前の版を公開、または git の前の版を `--project` 明示で再デプロイ |
| Index | `firestore.indexes.json` の前の版を再デプロイ（Index の削除はデータに影響しない） |
| データ | **Spark では管理されたバックアップ（エクスポート・PITR）が使えない** [INFERENCE 要確認: managed export は請求アカウント必須]。代替案: admin 画面に「全データを JSON で書き出す」（Read を消費。月 1 回の手動）を用意するか、バックアップなしを受け入れるか **[NC-12]** |
| データ移行 | **無い**（localStorage のデモデータは架空のため本番へ移さない）。文書に `schemaVersion: 1` を持たせ、将来の変更は converter で読み込み時に吸収（castfile の `normalizePayment()` の流儀） |

---

## 19. 実行基盤要件（platform-engineer へ）

| 項目 | 内容 |
|---|---|
| トポロジ | 静的 SPA（GitHub Pages）＋ Firebase Auth ＋ Firestore。サーバー・Queue・Scheduler なし |
| Firebase プロジェクト | 本番 1 つ（Spark・請求アカウントなし）。テストは `demo-afro-cms`（実体なし） |
| ロケーション | `asia-northeast1` 推奨（NC-10。変更不可） |
| 権限モデル | 実行 SA なし。Console を操作できる Google アカウント（オーナー）を最小人数に。オーナーは Rules を迂回できる＝証跡を書き換えられることを運用上の注意として記録 |
| Auth 設定 | メール/パスワード有効、メール列挙保護 有効、承認済みドメインに `kazumasaueno.github.io`、パスワードポリシー（使えるなら 10 文字以上 [TARGET]） |
| デプロイ | Rules・Index: `firebase deploy --only firestore:rules,firestore:indexes --project <本番ID>`（手動・ID 明示必須）。フロント: 既存の Pages ワークフロー＋ Variables |
| 監視 | Console の使用量（Read/Write/保存）を月 1 回確認（§12.3）。枠の 50% で検討 |
| バックアップ | RPO/RTO は NC-12 の決定次第 |

---

## 20. 追加する依存（**承認依頼**。lead-architect → ユーザー）

| パッケージ | 区分 | 用途 | 継続費用 |
|---|---|---|---|
| `firebase` | dependencies | Auth・Firestore・（第 2 段階）App Check の Web SDK。live モードでのみ動的読み込み | 0 円（Spark） |
| `firebase-tools` | devDependencies | エミュレータ・Rules/Index のデプロイ | 0 円 |
| `@firebase/rules-unit-testing` | devDependencies | Rules のテスト（`node --test` で実行） | 0 円 |

- 版は導入時点の最新安定版を確認して固定（lock ファイルに記録）。テストランナー（vitest 等）は**追加しない**
- 新しい外部サービス = Firebase の採用はユーザー決定済み（2026-11-10）。**Firebase プロジェクトの作成・Console 操作はユーザー作業**

---

## 21. 作り替えの閾値（Blaze へ移る条件）

| きっかけ | Blaze で使えるようになるもの |
|---|---|
| 写真・ファイルの扱いを始める | Cloud Storage（Spark の新規プロジェクトでの扱いは要確認 [UNKNOWN]） |
| お客様への通知メール（確認依頼が届いたら知らせる）が必要 | Cloud Functions ＋メール送信 |
| 保持期限の自動削除・定期バックアップが必要 | Scheduler・managed export / PITR |
| 1 日の Read が枠の 50% を超える日が続く | 従量課金（予算アラートを先に設定） |
| 役割の判定で Rules の `get` が上限に近づく | カスタムクレーム（Admin SDK を Functions で） |

---

## 22. NEED CONFIRMATION（ユーザーの判断が要るもの）

| # | 論点 | 推奨 |
|---|---|---|
| NC-1 | 管理者（PMO）は「閲覧のみ」か。プロジェクト作成・招待・アサインは誰が行うか | 管理者は人と権限（招待・無効化・アサイン）だけ書く。プロジェクト作成は開発者 |
| NC-2 | アフロによる代理承認を live で許すか | 許さない。必要なら `side:'afro'`＋理由必須の別記録 |
| NC-3 | 1 人が管理者と開発者を兼ねるか | 当面は 1 アカウント 1 役割 |
| NC-4 | 確認依頼（analyzed）後は回答を変更不可にする（現行は変更可） | 変更不可。直すときは差し戻し→再分析 |
| NC-5 | 承認後の修正・再承認の手続き | 今回は範囲外（承認で終端） |
| NC-6 | 証跡の強さ（オーナーは Console で書き換え可能）で足りるか | 当面これで足り、必要なら定期書き出し＋ハッシュ |
| NC-7 | App Check（reCAPTCHA）を第 2 段階で入れるか | 入れる（追加依存なし・無料枠内） |
| NC-8 | 範囲外機能の live での扱い | 案 A（隠す） |
| NC-9 | API キー制限・承認済みドメインの設定（ユーザー作業） | 公開前に実施 |
| NC-10 | Firestore のロケーション（変更不可） | `asia-northeast1` |
| NC-11 | 個人情報・回答・承認ログの保持期間、削除依頼時に承認ログの氏名を残すか | 承認ログは残す。期間は法務確認（LEGAL REVIEW REQUIRED） |
| NC-12 | バックアップ（Spark では管理バックアップなし） | admin の手動 JSON 書き出しを月 1 回 |

---

## 23. 未確認・未計測（[UNKNOWN]）

| 項目 | 確認方法 | 担当 |
|---|---|---|
| Spark のメール確認・パスワード再設定メールの 1 日上限 | [Firebase Auth limits](https://firebase.google.com/docs/auth/limits) | platform-engineer |
| Rules の `string.size()` の数え方（文字 / バイト）と JS `length` との差 | エミュレータ | database-engineer / qa-engineer |
| 全問回答時に Rules の式数上限に収まるか | エミュレータ | 同上 |
| 同じ文書への重複 `get()` が上限で 1 回と数えられるか | エミュレータ・公式資料 | 同上 |
| Rules に拒否されたクエリの読み取り課金 | 公式の料金資料 | platform-engineer |
| Spark で managed export / TTL ポリシーが使えるか | 公式資料 | platform-engineer |
| 無料枠のリセット時刻（太平洋時間 0 時か） | 公式資料 | platform-engineer |
| 複合 Index・API キー制限が本番で効いているか | 初回デプロイ後のスモーク | platform-engineer |
| 見積（§12.2）全体 | 公開後の使用量グラフ | platform-engineer → この担当 |

---

## 24. 引き渡し

| 渡す先 | 渡すもの |
|---|---|
| lead-architect | 本書の Data Design Review 判定、依存追加（§20）と NC 一覧（§22）のユーザー確認 |
| requirements-architect | NC-1〜5・11（権限・状態遷移・保持期間の業務上の決定） |
| security-engineer | §2（認証・招待）、§8（Rules）、§11（クライアント決定値）、§17（個人情報）、App Check |
| database-engineer | §5・§8・§9・§10 の実体化（`firestore.rules`・`firestore.indexes.json`・生成スクリプト）。無理があれば差し戻し |
| frontend / backend-engineer | §13 の repository 層と段階移行。実装後、repository の firebase 実装の呼び出し元 Grep 結果（file:line）を返す |
| platform-engineer | §15・§19（環境変数・Variables・Auth 設定・デプロイ手順）と §23 の確認 |
| qa-engineer | §16.3 の観点、偽申告テスト（§11） |

## 25. 決定事項（2026-11-10 ユーザー決定。§22 への回答）

| # | 論点 | 決定 | 決めた人 |
|---|---|---|---|
| 1 | 管理者（PMO）の権限 | 全案件の閲覧＋メンバーの招待・無効化・案件への割り当てだけ。プロジェクト作成・ヒアリング入力などの作業は開発者 | ユーザー |
| 2 | 代理承認 | 本番（live）では**お客様本人のみ**承認できる。アフロの代理承認は不可 | ユーザー |
| 4 | 承認依頼後の回答 | **承認依頼（analyzed）後は固定**。直すときは差し戻し → 再分析 → 再依頼 | ユーザー |
| 10 | Firestore のロケーション | `asia-northeast1`（東京） | ユーザー |

推奨どおりで進める項目（SAFE ASSUMPTION。lead-architect が既定値として採用。変える場合は実装前に申し出る）:
- 3: 当面 1 アカウント 1 役割
- 5: 承認後の修正・再承認は今回の範囲外
- 6: Console オーナーによる書き換えの可能性は残る（運用で Console の権限者を最小にする）
- 7: App Check は第 2 段階
- 8: 範囲外の機能は live モードでは隠す（ポータルの承認は要件定義書だけ）
- 9: API キーの制限と承認済みドメインの追加はユーザーが Console で行う（手順は実装時に渡す）
- 12: バックアップは admin 画面から月 1 回 JSON を手動で書き出す

保留:
- 11: 個人情報・回答・承認ログの保持期間と、削除依頼時の承認ログの氏名の扱い → **LEGAL REVIEW REQUIRED**（本番運用前に決める。実装は削除できる形にしておく）

## 26. Security Review（security-engineer, 2026-11-10）

- 対象: 本書 DRAFT（§25 の決定を前提）。設計段階の脅威モデル。**コード・設定は変更していない**
- 判定: **CONDITIONAL**（方針＝Rules を唯一の境界、`accounts` を正、承認ログ追記のみ、は妥当。下の M-1〜M-12 を実装計画に入れることが条件。**M-1〜M-5 は Rules テストで拒否を確認するまで live 公開不可**）

### 26.1 確認した実物（[FACT]）

| 項目 | 結果 |
|---|---|
| 同じ origin の別アプリ | `gh api users/KazumasaUeno/repos`（has_pages）→ `afro-cms-demo` と **`avatar-chat-demo`** が同じ `https://kazumasaueno.github.io` で公開 |
| `.gitignore` | `node_modules / dist / *.log / .DS_Store` のみ。**`.env*` / `*.local` が無い**（§15 の「`.env.local` は .gitignore」は現状と不一致） |
| lockfile | `package-lock.json` 追跡済み |
| 要件定義書 HTML | `src/features/requirements/requirementsDoc.ts:13` の `esc()` で文字列は全てエスケープ。ただし `proposal.currentScore / projectedScore`（:51）は未エスケープ（現状は計算値なので無害） |
| CSV | 書き出しに数式ガード（`csv.ts:30` 付近 `guardFormula/unguardFormula`）、取り込みは `planCsvImport` で質問 ID・形式を検査 |
| `dangerouslySetInnerHTML` | CMS 機能のみ（`CompareDialog.tsx:21,79` / `SitePreview.tsx:43`。`sanitize.ts` 経由）。live では §14 で非表示 |

### 26.2 Must-fix（実装計画へ）

| # | 重大度 | 場所 | 問題 / 攻撃シナリオ | 修正（防ぐ層） |
|---|---|---|---|---|
| M-1 | High | §8 `claimOk` | role・projectId 以外（`name` / `company` / `affiliation` / `partnerCompany` / `devRole`）が招待と照合されない。お客様が受け取り時に `name` を他人名にすると、`approveOk` の `actorName == acct().name` を満たしたまま**証跡の承認者名を偽れる** | 全項目を `before` と一致で強制（`d.name == before.name` …）、`schemaVersion == 1`、`updatedAt == request.time`、`updatedBy == uid`（Rules） |
| M-2 | High | §8 `clientApprove` | `requirements` マップ内の他キー（`analyzedAt` 等）を同時に書き換えられる | `a.diff(b).affectedKeys().hasOnly(['status','approvedAt','approvedBy','approvalId'])`（Rules） |
| M-3 | High | §8 `devTransition` / `submitOrWithdrawOk`（未記述） | 「同じ型で書く」だけでは、開発者が `status:'approved'` へ遷移・`action:'approve'` / `side:'client'` の記録を作れる余地が残る（§25-2 の代理承認禁止に反する） | 実装前に式を本書へ明記: 開発者は `draft→analyzed`（revision+1・proposal 同時）と `analyzed→draft` のみ、approvals は `action in ['submit','withdraw']` かつ `side=='afro'`、`approved` からの遷移は全員不可（Rules。レビューは本担当） |
| M-4 | Medium | §8 `requirements/current` 更新の第 1 分岐 | 事前状態 `draft` しか見ないため、同じバッチで「analyzed へ遷移＋回答変更」ができる | `getAfter(projPath(pid)).data.requirements.status == 'draft'` も要求（Rules） |
| M-5 | Medium | §8 `accounts` update | admin が他の admin を無効化・改名できる（admin は Console だけで作る方針と非対称。乗っ取られた 1 admin で全 admin 停止） | `resource.data.role != 'admin'` を条件に追加。admin の無効化は Console 手順（Rules＋Runbook） |
| M-6 | High | 公開先（§0.1） | 同じ origin の `avatar-chat-demo` の JS（依存・XSS を含む）が、Firebase Auth の IndexedDB（refresh token）と localStorage を読める＝**お客様セッションの窃取** | live 公開前に**別 origin**（独自サブドメイン or 専用の GitHub org/user の Pages）へ。不可なら live は不可とし lead-architect → ユーザー判断（platform） |
| M-7 | Medium | `.gitignore` | `.env.local` がコミットされうる | `.env*` と `!.env.example` を追加（設定） |
| M-8 | Medium | §8 共通 `active()` | 受け取り後に Auth のメールを変更すると `accounts.email` と `token.email` がずれたまま承認できる | `active()` に `acct().email == request.auth.token.email` を追加。アプリにメール変更 UI を作らない。大文字混在メールで登録した場合の `token.email` 小文字化をエミュレータで確認（Rules／qa） |
| M-9 | Medium | §12.2 / §25-7 | Spark は課金でなく停止なので費用リスクは無いが、公開 API キーで**新規登録の量産・確認メール送信・拒否クエリ**により枠を使い切られうる（承認が日単位で止まる） | App Check の「第 2 段階」は**最初の外部のお客様を招待する前**に強制（Firestore・Auth）。それまでは社内試用のみ。メール列挙保護 ON、匿名認証 OFF（platform）。この条件でのみ延期を受容 |
| M-10 | Medium | §15 / §19 | 本番キーの参照元に `http://localhost:*`、Auth の承認済みドメインに既定の `localhost` が残る | 本番は `https://kazumasaueno.github.io/*`（M-6 後は新 origin）のみ。開発はエミュレータ（`demo-afro-cms`）で行う。参照元制限は境界ではない（Rules が境界）と記録（ユーザー作業） |
| M-11 | Medium | 表示・要件定義書 HTML | live では `proposal` が開発者の書いた任意マップになる | Rules で `proposal` の型・件数・長さを検査（`validProposal`）。HTML 化は保存値でも `esc()` を通し、数値は `is number` を強制。競合 URL は `validateUrl` 済みの http(s) だけリンク化。live データの HTML を `blob:` URL でタブに開かない（`blob:` は作成元 origin を継ぐ。download 属性の保存のみ）。`<meta http-equiv="Content-Security-Policy">` で `script-src 'self'`、`connect-src` を Firebase のエンドポイントに限定（frontend） |
| M-12 | Medium | §18 / §25-12 JSON 書き出し | 全お客様の氏名・メール・回答・証跡が admin の PC に平文で残る | 保存先（会社管理の暗号化領域のみ・Git／個人クラウド禁止）、保持（最新 N 世代）、書き出し時に SHA-256 を記録（NC-6 の証拠力にも使う）を Runbook に記載。書き出しファイル名に個人名を入れない（運用。PRIVACY_REVIEW に記録） |

### 26.3 確認済みで問題なし（設計どおり実装すれば成立）

- 自己昇格: `accounts` の create は招待と role/projectId 一致、update は admin のみで role 不可、admin 招待はアプリ不可 → 成立（M-1 で他項目も固定）
- 他人の招待: `invites/{token.email}` 固定＋`email_verified` 必須 → メール受信箱を持たない限り不可。再受け取り: `invited` 以外は不可、`accounts` は create-only → 無効化後の再受け取り不可（Auth を消して再登録しても招待は `claimed`）
- 無効化: 全権限が `active()` を経由 → 即時。案件越境: お客様は `projectId` 一致の get のみ、開発者は `memberUids` 必須 → 成立
- 証跡: `request.time`・uid/email 一致・現物一致・決定的 ID・update/delete 全員不可・状態と同時のトランザクション → 成立（M-2/M-3 前提）。Console オーナーの書き換え可能性は §25-6 で受容済み
- 列挙: `invites` / `accounts` の list は admin のみ、`siteKeys` は dev/admin の get のみ（ID 推測で存在が分かるのは社内の開発者だけ）→ 受容
- gcloud 既定が他社本番: §16.1 で十分。加えて deploy スクリプトは**本案件の本番 ID と完全一致する場合だけ**実行する許可リスト方式にする

### 26.4 記録のみ（Low / 判断事項）

- `accounts` の get を開発者に全件許可（他案件のお客様の氏名・メール・会社名を uid が分かれば読める）。アサイン先のお客様だけにするか、表示名を `projects` 側に持つかを database-engineer と決める（Medium 寄り）
- §17.2「プロジェクトの archived を admin が書く」は §25-1（admin＝閲覧＋招待・無効化・割り当てのみ）と食い違う → lead-architect が裁定
- ログ: `console.warn` に出すのは projectId・aid のみ。メール・氏名・回答を出さない。エラートラッカー・Analytics を足すなら本担当の再確認
- 削除: Rules で delete 全面禁止のため削除は Console のみ。Auth 削除後の再招待は `invites/{email}` を Console で消す必要がある → Runbook に入れる。保持期間・承認ログの氏名は **LEGAL REVIEW REQUIRED**（本担当は結論を出さない）
- 未実施: `npm audit`（依存追加時に実行）、Rules 実体のテスト（実装後）

### 26.5 qa-engineer へ追加する偽申告テスト（§16.3 に追加）

| TEST | 内容 |
|---|---|
| SEC-1 | 招待受け取り時に `name` / `company` を変えて create → 拒否（M-1） |
| SEC-2 | お客様の承認で `requirements.analyzedAt` を同時変更 → 拒否（M-2） |
| SEC-3 | 開発者が `status:'approved'` へ更新、`action:'approve'` / `side:'client'` の記録を作成 → 拒否（M-3） |
| SEC-4 | 1 バッチで analyzed 遷移＋回答変更 → 拒否（M-4） |
| SEC-5 | admin が他の admin を無効化 → 拒否（M-5） |
| SEC-6 | `accounts.email` と異なる `token.email` で承認 → 拒否（M-8）／大文字混在メールで招待受け取り |
| SEC-7 | `proposal` に未知キー・巨大文字列・数値欄に文字列 → 拒否（M-11） |

## 27. 追加の決定（2026-11-10。§26 への対応）

| # | 論点 | 決定 | 決めた人 |
|---|---|---|---|
| M-6 | live 版の公開場所 | **Firebase Hosting**（`<projectId>.web.app`。他アプリと origin を分ける）。GitHub Pages は営業用デモ（demo モード・Firebase SDK を読み込まない）のまま残す | ユーザー |
| Low-2 | 案件のアーカイブ（§17.2） | 開発者が行う（§25-1: 管理者は閲覧＋人の管理のみ）。admin の archived 書き込みは Rules で拒否 | lead-architect |
| Low-1 | 開発者が読める accounts | 自分の担当案件の memberUids に含まれる人と、アフロ社内（admin / dev）の氏名だけ。他案件のお客様の accounts は読めない | lead-architect |

§26 の M-1〜M-12 はすべて実装計画（`docs/design/BACKEND_PLAN.md`）に入れる。M-1〜M-5 は Rules テストで拒否を確かめるまで live を公開しない。
