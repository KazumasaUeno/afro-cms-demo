# AI 下書きの画面設計（U4。ui-ux-designer → frontend-engineer）

- 状態: **設計案**（2026-11-24 ui-ux-designer）。実装は frontend-engineer（計画 `AI_REQUIREMENTS_PLAN.md` §U4 の Write Scope）
- 正: 状態の定義は `AI_REQUIREMENTS.md` §1、関数の契約は同 §2.1・`functions/src/ai/request.ts`・`edits.ts`・`task.ts`、型は `src/types/aiDraft.ts`。**この文書は「どう見せるか・何と書くか」だけを決める**
- 見た目の値は `docs/DESIGN.md` と `src/theme/tokens.ts` の既存トークンだけを使う（**新しいトークンを作らない**。計画 U4「変えない」）
- 読み手は**社内の開発者・管理者だけ**。お客様は AI の下書き（generated・flags・lastError）を見ない。お客様が見るのは「承認を依頼する」で写された `ProposalV2` だけ（§6）
- ラベル: [FACT]=実物で確認（file:line）／ [DECISION]=この設計で決めた（ui-ux-designer）／ [PENDING]=他者の結論待ち ／ [TARGET]=根拠のない目標値
- 未検証: 実画面のスクショは撮っていない（フラグ既定 off・未デプロイで画面が無い）。実装後に 320 / 768 / 1280 × ライト / ダークで撮る（§9）

## 0. 方向性の契約

| ブロック | 内容 |
|---|---|
| JTBD | ヒアリングの必須回答がそろったとき、開発者は AI の下書きを手早く確かめて直したい。根拠の無い数字や誤りをお客様へ出さずに承認依頼まで進めるため |
| Primary Action | 状態ごとに 1 つ（§2 の「主操作」列）。未生成＝「AI で下書きを作る」、下書きあり＝「内容を確認した」、確認済み＝「承認を依頼する」 |
| Mode | Operate（作業を完了する）。演出より走査性。既存 `AnalysisSequence` の % 演出は**使わない**（実際の進み具合ではないため） |
| 固有性の 1 点 | **「要確認の数字」の印**（warning の Soft 面＋下線＋文字ラベル）。AI の文章のうち人が判断すべき所だけが目に入る。それ以外は既存の要件画面と同じ静かな部品 |
| FORM | 密度は中。角丸は既存（カード 16px・ダイアログ 28px）。影は Level0 の Outlined card（`Surface`）。動きは `Reveal` の出現だけ |

## 1. どこに出すか（IA）

| 条件 | 画面 |
|---|---|
| `VITE_FEATURE_AI_REQUIREMENTS=off`（既定） | **今と同じ**。`HearingEditor` の「AI分析を実行」→ `AnalysisSequence` → v1 の提案。AiDraftPanel は描画しない（コードも呼ばない） |
| `internal` | **管理者にだけ** AiDraftPanel を出す（計画 §5）。編集はアサインされた開発者だけ（`edits.ts` `assertCanEdit`）なので、管理者は生成と閲覧だけ（§2 の「閲覧のみ」） |
| `on` | アサインされた開発者と管理者に出す。お客様（`variant='client'`）には出さない |
| 置き場 [DECISION] | `/ai-studio`・`/dev/hearing` の `status=='draft'` の画面（`RequirementsPage.tsx:34` の view `input`）に、MUI `Tabs` で **「ヒアリング」｜「AI 下書き」** の 2 タブ。`HearingEditor` の AI 分析の欄（`HearingEditor.tsx:339-360`）と下部の「AI分析」ボタン（同 `:406-415`）は、フラグ ON のとき文言を「AI で下書きを作る」に替え、押すと「AI 下書き」タブへ移って生成を始める（必須回答が欠けていれば今と同じく赤く示して止まる） |
| 承認依頼の後（analyzed / approved） | 既存どおり `ProposalView`（§6 の v2 描画）。AiDraftPanel は出さない（生成・編集は Functions と Rules が拒否する） |
| 差し戻し後（analyzed→draft） | 「AI 下書き」タブが `edited`（無ければ `generated`）を開いた状態で出る。編集・作り直しができる（設計 §1） |

## 2. 状態表（`aiDraftState.ts` が返す値と画面）

判定の順（上が優先）。`now` はクライアントの時刻、`hash` は `src/shared/ai/answersHash.ts` の `answersHash(今の回答)`。

| # | 状態キー | 条件（トリガー） | 何を出すか | 主操作 | 文言（そのまま実装する） |
|---|---|---|---|---|---|
| — | `hidden` | フラグ off／internal で管理者以外／お客様 | 何も出さない | — | — |
| — | `notDraft` | `requirements.status != 'draft'` | パネルを出さない（`ProposalView` を出す） | — | — |
| 1 | `none` 未生成 | 文書なし | 空状態: `AiMark`＋説明＋送信の注意（§5）＋必須回答の残り | **AI で下書きを作る** | 見出し「AI で下書きを作る」／本文「ヒアリングの回答から、改善提案と要件定義書の下書きを作ります。下書きはお客様には見えません。確認・編集してから承認を依頼します。」／必須が欠けているとき（ボタンは押せる。押すと欠けた質問へ移る＝既存の挙動）「AI 下書きに必要な質問が未回答です: {質問名を「、」区切り}」 |
| 2 | `running` 生成中 | `job.state=='running' && leaseUntil > now` | 不確定の `LinearProgress`（値を持たない）＋これから行う工程の一覧（順に「現行サイトを取得」「基本チェック」「下書きを作成」。**今どれかは出さない**＝job に工程の情報が無い）＋開始時刻。下書きがあれば下に読み取り専用で残す | なし（待つ） | 見出し「AI が下書きを作っています」／本文「この順に処理します: 現行サイトを取得 → 基本チェック → 下書きを作成。画面を閉じても生成は続き、終わるとここに表示されます。」／補足「開始 {job.startedAt の HH:mm}」／他の人が押したとき（`job.by != 自分`）「ほかのメンバーが生成を始めました。」／下書きがあるとき「作り直しています。終わるまで編集できません。」 |
| 3 | `failed` 失敗（下書きなし） | `state=='failed' && !generated`（job は idle） | エラーの面（`dangerSoft`＋`dangerLine`＋`dangerInk`、アイコン＋文字）。理由は §4 の表 | **再試行**（新しい requestId） | 見出し「下書きを作れませんでした」／本文は §4。補足（小さく、選択・コピーできる）「問い合わせ用: {lastError.code}{ / anthropicRequestId があれば その値}」 |
| 4 | `stalled` 止まった | `job.state=='running' && leaseUntil <= now` | 失敗と同じ面（`warningSoft`） | **もう一度作る**（新しい requestId） | 見出し「生成が止まりました」／本文「処理が時間内に終わりませんでした。もう一度押すと作り直せます。」 |
| 5 | `ready` 下書きあり（未確認） | `state=='ready' && generated && !edited` | 編集画面（§3）。上部に「要確認の数字」の件数（`flags.unsupportedNumbers` の実数。0 件なら出さない）。前回の再生成が失敗していれば `lastError` を注記 | **内容を確認した**（`generated` の 3 欄を `saveAiDraftEdits` で `edited` へ写す） | 見出し「AI 下書き（未確認）」／本文「内容を読み、必要なら直してください。直すか「内容を確認した」を押すと、承認を依頼できます。」／数字「入力に無い数字が {n} 件あります。根拠を確かめてください。」／再生成失敗の注記「前回の作り直しは失敗しました（{§4 の短い理由}）。表示中の下書きはそのまま使えます。」 |
| 6 | `confirmed` 確認済み | `edited` あり | 編集画面（`edited` を表示）＋保存の状態（§3.3） | **承認を依頼する**（§3.4） | 見出し「AI 下書き（確認済み）」／補足「最終編集 {editedAt の M/D HH:mm}」 |
| 7 | `answersChanged` 回答が変わった（5・6 に重ねる注記） | `generated && answersHash != hash` | `infoSoft` の注記（`role="status"`）。5・6 の主操作はそのまま | 副操作「作り直す」／「このまま進める」（注記を閉じる。この画面を開いている間だけ） | 「回答が下書きの後に変わっています。作り直すか、このまま確認して依頼するかを選んでください。」 |
| 8 | `configChanged` AI 設定が変わった（5・6 に重ねる注記） | `generated && configHash != 今の設定のハッシュ` | 7 と別の注記（`surfaceMuted`、重要度は 7 より低い） | 副操作「作り直す」（任意） | 「AI の設定が更新されました。作り直すかは任意です。」 [PENDING Q-U1: クライアントが「今の設定のハッシュ」を知る手段が無い。手段が決まるまでこの注記は出さない] |
| — | `readOnly` 閲覧のみ（5・6 に重ねる） | 自分が管理者（internal・on とも。編集はアサインされた開発者だけ） | 編集欄を読み取り専用。「内容を確認した」「承認を依頼する」を出さない | 「作り直す」だけ | 「編集と承認の依頼は、アサインされた開発者が行います。」 |

- **件数・秒数・ETA を作らない**: 出す数は `flags.unsupportedNumbers.length` と `siteCheck.passed/total`（実測）だけ。経過時間・残り時間・% は出さない
- 「作り直す」（regenerate: true）は確認ダイアログを経る（§3.5）。`edited` があれば `discardEdits: true`、管理者は加えて `confirmDiscard: true`
- `{state:'ready', reused:true}` が返ったとき（同じ回答・同じ設定）: Toast「回答と設定が前回と同じため、前回の下書きを表示しています（回数には数えていません）。」

## 3. 編集画面（`AiDraftEditor.tsx`）

### 3.1 構成（上から）

1. 状態の見出しと主操作（§2）。主操作は右上（md 以上）／下部の固定バー（sm 未満。既存の入力画面の下部バーと同じ置き方）
2. 注記（7・8・再生成失敗・保存失敗）。最大 2 つまで同時に出し、3 つ目以降は畳む [DECISION]
3. **要約**（`summary`、≤ 400 字）: 複数行 `TextField`
4. **改善ポイント**（`points`、≤ 6 件）: 1 件ごとに `Surface`。分野（`AI_POINT_AREAS` の `Select`）・優先度（高/中/低の `ToggleButtonGroup`。既存の `PRIORITY` の文言）・見出し（≤ 80）・内容（≤ 600）・効果（≤ 200。「定性で書く。根拠の無い数字を書かない」を helperText）・根拠（`evidence` のチップ。読み取り専用。§6.2 の名前）。**件数の追加・削除はしない**（AI が出した件数を直す操作は U4 の範囲外。消したいときは内容を空にせず、ポイントを残したまま書き換える）[PENDING Q-U4]
5. **要件定義書の下書き**: 目的・ターゲット・コンテンツ・機能・非機能・運用・スケジュール（各 ≤ 800）＋ 未確定事項（≤ 10 件・各 ≤ 200。行の追加・削除可）
6. 各欄の文字数は既存 `AnswerInput.tsx:92` と同じ `{n} / {max}文字` の helperText。上限超えは入力で止める（`maxLength`）

**表示はプレーンテキスト**（設計 §1）: `TextField` の値と React の文字ノードだけ。`dangerouslySetInnerHTML`・Markdown 変換を使わない。

### 3.2 要確認の数字（`flags.unsupportedNumbers`）

- 判定: `generated.flags.unsupportedNumbers`（サーバーが入力に無い数字として付けた文字列。例 `['18']`。`postprocess.ts:12-14` の `numbersIn` と同じ正規化＝全角→半角・桁区切りを除く）に一致する数字を、**今表示している文（edited があれば edited）**から探す。一致の判定は同じ `numbersIn` を使う（FE: `src/shared/ai/` へ移して `gen-ai-shared` で写す。計画の共有の型どおり）
- `TextField` の中は色付けできないため、各欄の**直下**に「要確認の数字」の行を出す: `AlertTriangle` アイコン＋「要確認の数字: 18、30」（`warningInk` の文字。`StatusPill tone="warning"` を数字ごとに）。欄の枠は変えない（エラーではないため）
- 編集画面の下にある**確認用プレビュー**（§6 の v2 描画をそのまま使う）では、該当の数字を `<mark>` で囲む: 背景 `warningSoft`・文字 `warningInk`・下線 2px `warning`。読み上げ用に直後へ視覚的に隠した「（要確認の数字）」を置く（色だけで伝えない）
- 開発者が数字を消す・書き換えると印は消える。新しく書き足した数字には印を付けない（判定はサーバーの flags だけ）
- 上部の件数は「入力に無い数字が {n} 件あります」の n＝**今の文にまだ残っている**要確認の数字の種類数。0 になったら「入力に無い数字はすべて見直されました」（`successInk`）
- お客様の画面・要件定義書の HTML には印を一切出さない（flags は提案へ写らない。計画 HIGH-3）

### 3.3 自動保存（`useAiDraft` の `save`）

| 状態 | 条件 | 表示（主操作の近く。`role="status"` `aria-live="polite"`） |
|---|---|---|
| `idle` | 未編集 | 何も出さない（確認済みなら「最終編集 {M/D HH:mm}」） |
| `pending` | 入力から 1.5 秒以内 [TARGET。計画の下限 1 秒以上] | 「未保存の変更があります」 |
| `saving` | `saveAiDraftEdits` の応答待ち | `CircularProgress`（16px）＋「保存しています…」 |
| `saved` | `{ok:true}` | `Check`＋「保存しました {HH:mm}」 |
| `failed` | 下表 | `dangerInk`＋理由＋「もう一度保存」ボタン。入力した内容は画面に残す（消さない） |

- debounce: 最後の入力から 1,500ms 後に 1 回送る。送信中に入力があれば、応答の後にもう一度送る（同時に 2 本送らない）
- 画面を離れる・タブを切り替えるときに `pending` なら即時に送る。`failed` のまま離れるときは確認ダイアログ「保存できていない変更があります。このページを離れますか？」（「離れる」「とどまる」）
- **保存の失敗の文言**:

| 返り値 | 文言 |
|---|---|
| `failed-precondition: generation-running` | 「作り直しが始まったため、この変更は保存できませんでした。生成が終わると下書きは新しい内容に置き換わります。必要なら「変更をコピー」で控えてください。」＋「変更をコピー」（今の未保存の文をクリップボードへ。プレーンテキスト） |
| `failed-precondition: not-draft` | 「承認を依頼した後のため保存できません。差し戻すと編集できます。」 |
| `failed-precondition: no-generated` | 「下書きが見つからないため保存できません。画面を読み込み直してください。」 |
| `failed-precondition: feature-disabled` | 「AI 下書きが無効になったため保存できません。」 |
| `invalid-argument` | 「入力が上限を超えているか、形式が正しくないため保存できませんでした。文字数を確認してください。」 |
| `permission-denied` | 「この案件の下書きを編集する権限がありません。」 |
| その他（`unavailable`・`internal`・通信エラー） | 「保存できませんでした。通信状態を確認して、もう一度保存してください。」 |

- 生成中（`running`）は編集欄を `readOnly` にし、保存を送らない（上の `generation-running` は他の人が作り直しを始めた競合のときだけ起きる）

### 3.4 「承認を依頼する」

- **押せる条件（すべて）**: `edited` がある・保存の状態が `idle` か `saved`（`pending`/`saving`/`failed` は不可）・`running` でない・`status=='draft'`・自分がアサインされた開発者。テスト「承認を依頼するは edited ありだけ」の対象は `aiDraftState.ts` の `canRequestApproval(...)` に置く
- 押せないときはボタンを `disabled` にし、ボタンの直下に理由を文字で出す（`aria-describedby` で結ぶ）:
  - edited なし「下書きを直すか「内容を確認した」を押すと、承認を依頼できます。」
  - 保存中・未保存「保存が終わると依頼できます。」／保存失敗「保存できていない変更があります。保存してから依頼してください。」
  - 生成中「生成が終わると依頼できます。」
- 確認ダイアログ（既存 `ProposalView.tsx:204-224` と同じ形。`maxWidth="xs"`）:
  - 見出し「お客様に承認を依頼しますか？」
  - 本文「確認した下書きを改善提案書として、お客様ポータルに出します。依頼した後は編集・作り直しができません（差し戻すと再開できます）。」
  - 要確認の数字が残っているとき（`warningSoft` の面）「入力に無い数字が残っています: {数字を「、」区切り}。根拠を確かめてから依頼してください。」— **依頼は止めない**（サーバーも止めない。判断は開発者）
  - 操作「キャンセル」／「承認を依頼する」（押した後は「依頼しています…」で二度押し不可）
  - 成功の Toast「お客様に承認を依頼しました」
- 「内容を確認した」（edited なしのとき）: ダイアログなしで送る。要確認の数字が残っていれば、送る前に同じ警告の面を 1 行出し、ボタンの文言を「数字を確認して、内容を確認済みにする」に替える [DECISION]（確認の証跡なので、見たことを明示させる）

### 3.5 作り直す（regenerate）

| 場面 | ダイアログ |
|---|---|
| 開発者・edited なし | 見出し「下書きを作り直しますか？」／本文「今の下書きは新しい下書きに置き換わります。作り直しは回数に数えます。」／「キャンセル」「作り直す」 |
| 開発者・edited あり | 見出し「編集を捨てて作り直しますか？」／本文「あなたが直した内容は、新しい下書きができた時点で消えます。生成が失敗したときは、今の内容が残ります。作り直しは回数に数えます。」／「キャンセル」「編集を捨てて作り直す」（`danger` の塗り） |
| 管理者・edited あり | 上に加えて「開発者の編集を捨てた記録（あなたの名前と日時）が残ります。」 |

## 4. エラーの文言（`aiDraftState.ts` の `errorMessage(code)`）

### 4.1 生成の開始（`requestRequirementsDraft` の例外。文書には何も書かれない）

| code: message | 文言 | 再試行 |
|---|---|---|
| `failed-precondition: feature-disabled` | 「この案件では AI 下書きを使えません（機能が無効か、対象外の案件です）。」 | 出さない。フラグ off と同じく既存の「AI分析を実行」を出すか → [PENDING Q-U2] |
| `failed-precondition: answers-missing` | 「AI 下書きに必要な質問が未回答です。」＋欠けた質問へ移る（既存の赤枠） | 回答後に押せる |
| `failed-precondition: not-draft` | 「承認を依頼した後は作り直せません。差し戻すと作り直せます。」 | なし |
| `failed-precondition: edits-exist` | （通常は §3.5 のダイアログで防ぐ。来たら）「編集した内容があるため、作り直すには編集を捨てる確認が必要です。」→ §3.5 を開く | ダイアログ経由 |
| `failed-precondition: confirm-discard-required` | 同上（管理者） | 同上 |
| `aborted: already-running` | 「ほかのメンバーが生成中です。終わるとここに表示されます。」（状態 2 へ。onSnapshot で切り替わる） | なし |
| `resource-exhausted: quota-project-day` | 「この案件で今日使える回数に達しました。明日（日本時間 0 時以降）に使えます。」 | 出さない |
| `resource-exhausted: quota-user-day` | 「あなたが今日使える回数に達しました。明日（日本時間 0 時以降）に使えます。」 | 出さない |
| `resource-exhausted: quota-project-month` | 「この案件で今月使える回数に達しました。来月 1 日（日本時間）から使えます。」 | 出さない |
| `resource-exhausted: quota-global-month` | 「今月の AI 下書きの上限に達しました。管理者に相談してください。」 | 出さない |
| `permission-denied` | 「この案件の下書きを作る権限がありません。」 | なし |
| `unavailable` | 「生成を始められませんでした。回数は消費していません。時間をおいて再試行してください。」（`request.ts`: enqueue 失敗は返金して `unavailable`） | 再試行（新しい requestId） |
| `internal`・通信エラー（応答なし） | 「生成を始められたか確認できませんでした。もう一度押してください（同じ依頼として扱うので、二重には数えません）。」 | 再試行（**同じ requestId**。下の規則） |

**requestId の規則（`useAiDraft`）** [FACT `request.ts:97-103`]:
- 利用者が押すたびに `crypto.randomUUID()` で新しい requestId を作る
- 例外: 直前の呼び出しが**応答を受け取れずに終わった**（通信エラー・`internal`・`deadline-exceeded`）ときの「再試行」だけ、同じ requestId を送る（二重加算を防ぐ Idempotency）
- 同じ requestId の応答が `{state:'failed'}` なら（running のまま lease が切れた）、状態 4「生成が止まりました」を出し、次の押下は**新しい** requestId を作る。同じ requestId をもう一度送らない
- 同じ requestId の応答が `{state:'running'}`・`{state:'ready'}` ならその状態を onSnapshot と合わせて出す（何もしない）

### 4.2 生成の結果（`aiDrafts.lastError.code`。`task.ts` が `ai-` を付けて書く）

| code | 回数 | 文言（§2 の状態 3 の本文、状態 5 の注記は「」内の前半だけ） |
|---|---|---|
| `ai-config` / `ai-config-missing` | 返金済み | 「AI の設定に問題があるため作れませんでした。回数は消費していません。管理者に連絡してください。」 |
| `ai-feature-disabled` | 返金済み | 「AI 下書きが無効になったため中止しました。回数は消費していません。」 |
| `ai-precondition-changed` | 返金済み | 「生成中に回答または案件の状態が変わったため中止しました。回数は消費していません。内容を確かめてから再試行してください。」 |
| `ai-schema` | 数える | 「AI の出力が決められた形になっていなかったため、使えませんでした。再試行してください。続くときは管理者に連絡してください。」 |
| `ai-refusal` | 数える | 「AI がこの内容での作成を断りました。回答の内容を見直すか、提案を手で作成してください。」（拒否の理由は出さない） |
| `ai-max_tokens` | 数える | 「出力が長くなりすぎて途中で止まりました。再試行してください。続くときは長い回答を短くしてください。」 |
| `ai-rate_limited` | 数える | 「AI サービスが混み合っているため作れませんでした。時間をおいて再試行してください。」 |
| `ai-upstream` | 数える | 「AI サービス側の問題で作れませんでした。時間をおいて再試行してください。」 |
| `ai-timeout` | 数える | 「AI の応答が時間内に返らなかったため中止しました。再試行してください。」 |
| `ai-internal` | 不定（AI を呼ぶ前なら返金。`task.ts:212-215`） | 「サーバーの処理で問題が起きたため作れませんでした。時間をおいて再試行してください。」（回数には触れない） |
| `ai-not-wired` ほか未知の code | — | 「下書きを作れませんでした。管理者に連絡してください。」（U4 時点で `ai-not-wired` を書く経路は無い [FACT: Grep 0 件]。未知の code の受け皿として残す） |

- 「数える」は `task.ts:73`「呼んだ後は戻さない」に基づく事実。文言には「回数は消費していません」を**返金済みのときだけ**書き、数えたときは書かない（言わないことで誤認させない範囲にとどめる）[DECISION]
- `httpStatus`・`anthropicRequestId` は本文に混ぜず、「問い合わせ用」の補足（§2 状態 3）にだけ出す

## 5. 外部 AI への送信の注意（SEC-H3）— **文言は DRAFT（LEGAL Q-4 の結論待ち）**

- 出す条件: AiDraftPanel が描画されるとき（フラグ internal/on）だけ。フラグ off では出さない
- 置き場: ①「AI で下書きを作る」「再試行」「作り直す」ボタンの**直上**（状態 1・3・4 と §3.5 のダイアログ本文の末尾）②`AnswerInput` の自由記述（`kind` が `text`・`longtext` で `AI_SENT_QUESTION_IDS` に含まれる質問）の helperText の前に 1 行（計画 U4 の `AnswerInput.tsx`）
- 見た目: `infoSoft` の面＋`infoInk` の文字＋`Info` アイコン。閉じるボタンは付けない（毎回見える必要がある）
- 文言（**DRAFT**。実装では定数 1 か所に置き、コメントに `DRAFT: LEGAL Q-4 の結論で差し替える` と書く）:
  - ①ボタンの近く「【下書きの文言】ヒアリングの回答（個人名・メール・電話・URL の一部を除く）と現行サイトの公開内容を、外部の AI サービス（Anthropic 社・米国。処理は国外）へ送ります。回答に個人名が書かれていると、そのまま送られます。」
  - ②入力欄「【下書きの文言】この回答は外部の AI へ送られます。個人名・個人の連絡先は書かないでください。」
- `【下書きの文言】` の接頭辞は法務の結論が出て差し替えるまで**画面に表示したまま**にする [DECISION]（社内限定の段階で「確定した説明」と誤認させないため）
- お客様側の画面には出さない（お客様への説明・同意は Q-4 の結論で別に決める）

## 6. `ProposalView` の v1 / v2 の違い

`isProposalV2(proposal)`（`src/types/aiDraft.ts:144`）で分ける。draft 状態のプレビューと承認後の表示は同じ v2 の描画を使う（`ProposalV2Body` として切り出す [DECISION]）。

### 6.1 違いの表

| 部分 | v1（テンプレート。今のまま） | v2（AI 下書きを開発者が確認したもの） |
|---|---|---|
| 印 | `AiBadge`（既定の「AIシミュレーション」） | `AiBadge label="AI 下書き・担当者確認済み"` [PENDING Q-4: お客様への表示文言] |
| サイトスコア | demo だけ「デモ用の値」と明記して出す（`ProposalView.tsx:93-119`） | **出さない**（live・demo とも） |
| 要約 | なし | `summary` を表紙の課題の下に本文で出す |
| 改善ポイント | 既存のカード（`ProposalView.tsx:127-147`） | 同じカード（分野・優先度・見出し・内容・効果）＋ カード下部に「根拠」の小さなチップ（§6.2 の名前。`StatusPill tone="neutral" dot={false}`） |
| 現行サイトの基本チェック | なし | `siteCheck` が null でなければ節を出す（§6.3） |
| 要件定義書の下書き | なし | 節「要件定義書（下書き）」: 7 欄を見出し＋本文で縦に並べる。空欄は「（記載なし）」。未確定事項は箇条書き（0 件なら節ごと出さない） |
| 要確認の数字 | — | 編集画面のプレビューだけ `<mark>`（§3.2）。お客様側・承認後の表示・HTML には出さない |
| 要件定義書 HTML（`requirementsDoc.ts`） | 今のまま | 同じ節構成を `esc()` を通して書く（「サイトスコア（AI 推定）」の行を出さない） |

### 6.2 根拠キーの表示名 [DECISION]

| キー | 名前 | キー | 名前 |
|---|---|---|---|
| q-url | 現在のURL | https | HTTPS |
| q-purpose | リニューアルのきっかけ | viewport | スマホ表示の設定 |
| q-issue | 現在の課題 | title-length | ページタイトルの長さ |
| q-competitor | 競合サイト | description | ページの説明文 |
| q-improve | 改善したいこと | h1-count | 大見出し（h1）の数 |
| q-keep | 残したい点 | alt-missing | 画像の代替テキスト |
| q-target | ターゲット | page-size | ページの容量 |
| q-strength | 強み | response-time | 応答時間 |
| q-market | 競合の良い点 | sitemap | サイトマップ |
| q-content | 掲載したいコンテンツ | structured-data | 構造化データ |
| q-feature | 必要な機能 | q-cv | 重要なコンバージョン |
| q-seo | 上位表示したいキーワード | q-ops | 公開後の更新担当 |
| q-schedule | 公開希望時期 | q-other | その他のご要望 |

### 6.3 基本チェックの節

- 見出し「現行サイトの基本チェック」／補足「{fetchedAt の YYYY/M/D HH:mm} に取得 ・ {passed} / {total} 項目が基準内」（実測。`tabular-nums`）
- 項目は 1 行ずつ: 状態は**アイコン＋文字**（`CheckCircle2`＋「基準内」/`AlertTriangle`＋「要改善」）＋名前（§6.2）＋値。値の単位 [FACT `functions/src/ai/site/checks.ts:70-79`]: title-length＝文字、alt-missing＝%、page-size＝バイト（表示は KB に換算して小数 1 桁）、response-time＝ミリ秒（表示は秒に換算して小数 1 桁）、真偽値は「あり」/「なし」
- `status=='blocked'`「サイト側の設定で取得できなかったため、基本チェックは行っていません。」／`'failed'`「サイトを取得できなかったため、基本チェックは行っていません。」（どちらも提案はヒアリングの回答だけで作られている旨を続ける「提案はヒアリングの回答をもとに作成しています。」）

## 7. 部品の分け方（計画 U4 の Write Scope）

| ファイル | 責務 | 持たないもの |
|---|---|---|
| `src/features/requirements/aiDraft/aiDraftState.ts` | 純粋関数だけ。`deriveAiDraftState({doc, now, answersHashNow, configHashNow?, role, isAssignedDeveloper, flagMode, reqStatus})` → §2 の状態キー＋重ねる注記（answersChanged / configChanged / readOnly / lastErrorNote）／ `canRequestApproval(...)`（§3.4）／ `errorMessage(code)`（§4）／ `startErrorMessage(httpsError)`（§4.1）／ `findFlaggedNumbers(text, flags)`（§3.2）／ 定数 `AI_DRAFT_COPY`（全文言。§5 の DRAFT もここ）・`EVIDENCE_LABELS`（§6.2）・`AUTOSAVE_DEBOUNCE_MS = 1500` | React・Firebase の import |
| `src/features/requirements/aiDraft/useAiDraft.ts` | `aiDrafts/requirements` の onSnapshot、`answersHash` の計算、`generate({regenerate, discardEdits, confirmDiscard})`（requestId の規則 §4.1）、`confirm()`（generated→edited）、`save(edited)`（debounce・直列化・§3.3 の状態）、`requestApproval()` | 見た目 |
| `src/features/requirements/aiDraft/AiDraftPanel.tsx` | 状態 1〜4 の面・注意書き（§5）・作り直しダイアログ（§3.5）・状態 5/6 のときは `AiDraftEditor` を出す | 欄ごとの編集 |
| `src/features/requirements/aiDraft/AiDraftEditor.tsx` | §3.1 の欄・要確認の数字（§3.2）・保存の状態（§3.3）・承認の依頼（§3.4）・プレビュー（`ProposalV2Body`） | 状態の判定（`aiDraftState` を使う） |
| `ProposalView.tsx` | v1/v2 の分岐（§6）。v2 本体は `ProposalV2Body` | flags の印（編集画面のプレビューからだけ `highlight` を渡す） |

既存部品の再利用: `Surface`・`StatusPill`・`AiBadge`（label）・`AiMark`・`Reveal`・MUI の `Tabs`/`TextField`/`Select`/`ToggleButtonGroup`/`Dialog`/`LinearProgress`/`CircularProgress`、Toast は `useToast`、書き込み結果の通知は `useWrite`。**新しい共通部品・トークン・アイコンライブラリを足さない**（アイコンは既存の lucide）。

## 8. アクセシビリティ（WCAG 2.2 AA）

- 状態の切り替え（生成中→下書きあり／失敗）は、パネル上部の 1 つの `aria-live="polite"` 領域で見出しの文を読む。失敗は `role="alert"`。保存の状態は別の `polite` 領域（毎回の入力では読まない。`saving`→`saved`/`failed` の変化だけ）
- 生成が終わってもフォーカスを勝手に動かさない（編集中の欄を失わせない）。状態 1 の「AI で下書きを作る」を押した直後は、ボタンが消えるためフォーカスを見出し（`tabIndex={-1}`）へ移す
- 不確定の `LinearProgress` には `aria-label="生成中"`。% や値を `aria-valuenow` に入れない
- 要確認の数字: 色＋下線＋文字（「要確認の数字」）の 3 重。`<mark>` の後に視覚的に隠した「（要確認の数字）」
- `disabled` の「承認を依頼する」は理由の文を `aria-describedby` で結ぶ。押せない理由を色だけで示さない
- 対象のサイズ: ボタンは既存の MUI 既定（高さ 40px）。チップを操作にしない（根拠チップは表示だけ）
- キーボードだけで 生成 → 各欄の編集 → 内容を確認した → 承認を依頼する（ダイアログ）まで完了できる。タブ順は §3.1 の上から下
- 下部の固定バー（sm 未満）がフォーカスした入力欄を隠さない（2.4.11）: 編集欄のスクロール領域に固定バーの高さ＋`env(safe-area-inset-bottom)` の余白を足す
- reduced-motion: `Reveal` は既存の `useReducedMotion` に従う。`LinearProgress` の流れる動きは reduced のとき止め、「生成中」の文字だけ残す
- コントラスト: 既存トークンの組み合わせ（`*Soft` の面に `*Ink` の文字）だけを使う。`docs/DESIGN.md:16` で 46 組を両モード 4.5:1 以上と確認済み。`<mark>` の下線 `warning` 対 `warningSoft` の 3:1 は**未計測**（実装後に計測して §9 に書く）

## 9. レスポンシブ・検証

| 幅 | 配置 |
|---|---|
| 320 | タブは全幅の 2 等分。改善ポイントは 1 列。主操作は下部の固定バー（既存の入力画面の下部バーと積む。重ねない）。根拠チップは折り返す。基本チェックは「状態＋名前」の 1 行目と値の 2 行目 |
| 768 | ポイント 2 列（既存 `sm: repeat(2, 1fr)`）。主操作は見出しの右。注記は全幅 |
| 1280 | 編集欄（左 7）とプレビュー（右 5）の 2 カラム [DECISION]。プレビューは `position: sticky`。lg 未満はプレビューを編集欄の下へ（「プレビューを見る」で開閉） |

- 幅で変わる配置はインライン style ではなく MUI の breakpoint（`sx` の `{xs, md}`）で書く（KNOWN_ISSUES の教訓）
- 長文（800 字の欄・600 字の内容）は `overflow-wrap: anywhere; line-break: strict`。中央揃えにしない
- 実装後に frontend-engineer か qa-engineer がエミュレータ（Stub の AI）で 8 状態＋保存の 5 状態＋§4 の主な code を 320 / 768 / 1280 × ライト / ダークで撮る。撮れなければ「未検証」と書く（計画 U4 の検証）

## 10. 未確定事項

| # | 内容 | 決める人 | 決まるまで |
|---|---|---|---|
| Q-U1 | 状態 8（AI 設定が変わった）: クライアントが今の `configHash` を知る手段が無い（設定は functions 側）。callable の返り値・公開の設定文書・ビルド時定数のどれにするか | lead-architect | 注記を出さない |
| Q-U2 | サーバーが `feature-disabled`（allowlist 外）を返したとき、v1 の「AI分析を実行」（テンプレート）へ戻すか、何も出さないか | product-manager | 文言だけ出し、v1 ボタンは出さない |
| Q-U3 | 生成中の「今どの工程か」を出すなら `job` に工程の欄が要る（今は無い） | lead-architect / backend | 工程は一覧として出すだけ（現在地なし） |
| Q-U4 | 改善ポイントの追加・削除を編集でできるようにするか（上限 6 件） | product-manager | 件数は AI の出力のまま |
| Q-4（既存） | §5 の送信の注意の確定文言、お客様向けの v2 の印の文言 | 法務（LEGAL REVIEW REQUIRED） | 【下書きの文言】を表示したまま |
| Q-U5 | 回数の残り（今日あと何回）を出すか。`quota` は文書にあるが上限値は functions 側にしか無い | product-manager | 出さない（上限に達したときだけ §4.1 の文言） |

- DECISION lead 2026-11-24 Q-U1: 状態 8（configChanged）は出さない。`deriveAiDraftState` は常に `configChanged: false` を返す。configHash をクライアントへ出す手段は `docs/TODO.md` で追う
- DECISION lead 2026-11-24 Q-U2: サーバーが `feature-disabled` を返したら §4.1 の文言だけを出す。v1 の「AI分析を実行」へは戻さない
- DECISION lead 2026-11-24 Q-U3: 生成中の工程の現在地は出さない（一覧として出すだけ。job に工程の欄を足さない）
- DECISION lead 2026-11-24 Q-U4: 改善ポイントの追加・削除はしない（件数は AI の出力のまま）
- DECISION lead 2026-11-24 Q-U5: 回数の残りは出さない（上限に達したときだけ §4.1 の文言）
- DECISION lead 2026-11-24 §5: 送信の注意は DRAFT（【下書きの文言】の接頭辞つき）のまま、フラグ internal / on のときだけ出す
- DECISION lead 2026-11-24 F5（internal の開発者）: internal は管理者が生成する（allowlist は Functions）。アサインされた開発者にもパネルを出し、編集と「承認を依頼する」はできるが、生成・再試行・作り直しのボタンは出さない（`aiCanGenerate`。計画 §5 の編集の条件と一致）。§1 の「internal は管理者にだけ」はこの決定で置き換える
