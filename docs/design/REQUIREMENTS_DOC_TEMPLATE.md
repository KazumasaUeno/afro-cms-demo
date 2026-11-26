# 要件定義書を会社標準ひな型の形で出す（設計と実装計画）

| 版 / 状態 | リスク | 関連 | 最終更新 |
|---|---|---|---|
| 0.2 / DRAFT（Q-1〜Q-11 確定・Requirement Review 前） | HIGH（保存データの形・Firestore Rules・外部 AI の出力が変わる。全体の規模は XL 相当 [INFERENCE]。判定は lead-architect） | ユーザー決定 2026-11-25 / `docs/design/AI_REQUIREMENTS.md` / `AI_REQUIREMENTS_UI.md` / `AI_REQUIREMENTS_EVAL.md` | 2026-11-25 |

> **2026-11-25 のユーザー決定（再検討しない）**: ヒアリングの質問は今のまま入力に使う。**出力する要件定義書は会社標準ひな型**（`docs/reference/WEBサイト構築_要件定義書ひな型_v0.1.docx`。本文の抜き出しは `docs/reference/requirements-template-v0.1.extracted.txt`）**の章立てと項目に従う**。AI はヒアリング回答とサイト診断から、各項目の「確定内容／採否・仕様」の文を下書きする。ひな型に無い項目は「AI追加」として提案する。**固定の項目にはアフロの標準仕様が入るが、まだ決まっていないので「確認中」と表示し、AI は書かない**。
> この文書は設計と計画だけ。コードは変えていない。数値は根拠が無いものに `[TARGET]` / `[ASSUMPTION]` / `[INFERENCE]` を付ける。

---

## 1. ひな型をデータにする（項目カタログ）

### 1.1 ひな型の中身（抜き出した本文で数えた事実）

[FACT `requirements-template-v0.1.extracted.txt` 全 330 行を目視で数えた]: 項目のある章は **19**、項目は **129**。区分は **固定 32・個別 74・選択 23**。

| 章 | 名前 | 項目数（固定/個別/選択） | 章 | 名前 | 項目数（固定/個別/選択） |
|---|---|---|---|---|---|
| 01 | プロジェクト概要・体制 | 7（0/7/0） | 12 | ドメイン・ネットワーク | 6（4/2/0） |
| 02 | 業務スコープ | 5（0/5/0） | 14 | セキュリティ要件 | 8（8/0/0） |
| 03 | サイト基本要件 | 5（0/5/0） | 15 | バックアップ・災害復旧 | 7（7/0/0） |
| 04 | サイトマップ・ページ一覧 | 5（0/5/0） | 16 | 運用・保守要件 | 6（5/1/0） |
| 05 | デザイン要件 | 7（0/7/0） | 17 | テスト・検収要件 | 7（0/7/0） |
| 06 | コンテンツ要件 | 6（0/6/0） | 18 | 移行・リリース要件 | 6（0/6/0） |
| 07 | 機能要件 | 9（0/0/9） | 19 | スケジュール管理 | 8（0/8/0） |
| 08 | CMS要件 | 7（0/0/7） | 21 | 責任分界表 | 11（0/11/0） |
| 10 | SEO・アクセス解析 | 7（0/0/7） | 22 | 未決事項・課題管理 | 4（0/4/0） |
| 11 | インフラ・ホスティング | 8（8/0/0） | 23 | 標準仕様の管理・最終承認 | 項目なし（標準仕様書の名称・版・適用日・承認者、発注者/受注者の承認欄） |

- 表紙: 案件名・発注者・受注者・作成者・承認者・承認日・改訂履歴。各章の末尾に「特記事項・対象外・追加費用・承認状況」の欄（**16 章だけこの欄が無い**）
- **09・13・20 章が欠番**。16 章の特記事項欄の欠落と合わせて、意図かどうかを確認する（§6 Q-2）。**欠番の中身は作らない**

### 1.2 カタログの形（正は 1 か所）

- 置き場所（正）: **`src/shared/ai/reqDocCatalog.ts`**（新規。データと型だけ。import は `../../types/aiDraft` だけ）
  - `scripts/gen-ai-shared.mjs` は `src/shared/ai/*.ts` を `functions/src/ai/shared/` へ自動で写す（`gen-ai-shared.mjs:18`）。**写し方の新しい仕組みは作らない**。`--check` が test:functions の前に食い違いを止める
  - Firestore Rules は v3 の中身を検査しない（§3.3）ので、`gen-rules-questions.mjs` には**載せない**
- 形（案）:

```ts
export const REQ_DOC_TEMPLATE = { id: 'TPL-WEB-REQ', version: '0.1', date: '2026-11-24' } as const;
type Kubun = 'fixed' | 'individual' | 'optional';          // 固定 / 個別 / 選択
interface CatalogChapter { id: 'c01' | … | 'c22'; no: string /* '01' */; title: string; hasNotes: boolean /* 16 章は false */ }
interface CatalogItem {
  id: string;            // 't01-01' 形式（章番号-連番。ひな型の版が変わっても id は変えない。消えた項目は欠番）
  chapterId: string; label: string /* '案件名' */; kubun: Kubun;
  target: string;        // 確認対象（'正式名称' / '項目・宛先・自動返信・迷惑対策'）
  fill: 'ai' | 'server' | 'human' | 'standard';  // §2 の「誰が下書きするか」
  feeds: string[];       // 材料のキー（質問 ID・基本チェックのキー・案件の欄。§2）
}
export const REQ_DOC_CATALOG: Record<string /* 版 '0.1' */, { chapters: CatalogChapter[]; items: CatalogItem[] }>;
```

- **版ごとに持つ**（`'0.1'` の下）。保存した提案は作った時の版を `template.version` に持ち、表示はその版のカタログで描く（ひな型が 0.2 になっても、承認済みの文書の見た目と項目は変わらない）
- `.docx` は人が読む原本として `docs/reference/` に置くだけ。カタログは抜き出した本文から**手で起こす**。単体テストで抜き出した本文と照合する（章・項目名・区分・確認対象が一致、件数 129／32・74・23、id の重複なし）。ひな型の版を上げるときは抜き出し直してテストで差分を見る

---

## 2. 項目と材料の対応

**材料**: ヒアリング回答（`src/data/requirements.ts:35-57`）、基本チェックのキー（`src/types/aiDraft.ts:59-62`）、案件の欄（`clientName`・`siteName`・`industry`）、日程（`ProjectSchedule`。要件定義の承認後に入る＝`requirementsDoc.ts:28-31`）。
**AI へ送るのは今と同じ範囲だけ**（`AI_SENT_QUESTION_IDS`。q-infra・q-dns-* と案件の欄は送らない＝`AI_REQUIREMENTS.md` §4）。送らない材料から作る項目は、サーバーが**決まった文に置くだけ**（`fill:'server'`。AI を通さない）。

| fill | 意味 |
|---|---|
| `ai` | AI が回答・診断から下書き。材料が無ければ「未確定」 |
| `server` | サーバーが選択式の回答・案件の欄を決まった形で転記（自由記述は転記しない。業者名・個人名が入りうるため） |
| `human` | 材料が無く、担当開発者が書く。初期値は「未確定」 |
| `standard` | 固定。アフロの標準仕様が決まるまで「確認中」（§6 Q-1） |

| 章 | 項目 ← 材料（fill） |
|---|---|
| 01 | 案件名 ← `siteName`（server）／顧客名 ← `clientName`（server）／背景・課題 ← q-issue・q-purpose・q-keep（ai）／目的・KPI ← q-purpose・q-improve・q-cv（ai。**目標値は材料が無い → 数値を書かず未確定**）／責任者・承認者・連絡体制（human） |
| 02 | 構築区分 ← q-url の有無（ai。「リニューアル」）／受託範囲・対象外・成果物・変更管理（human） |
| 03 | サイト種別 ← q-purpose・q-cv・q-content（ai）／ターゲット ← q-target（ai）／対応言語 ← q-other（ai。書かれていなければ未確定）／想定アクセス（human。数値の材料なし）／参考サイト ← q-competitor・q-market（ai。ホスト名だけ） |
| 04 | サイトマップ・ページ一覧・共通部品 ← q-content・site_text（ai。**案**として）／画面遷移 ← q-cv・q-improve（ai）／ページ数（human。実測なし） |
| 05 | UI/UX ← q-issue・q-improve（ai）／レスポンシブ ← q-improve・viewport（ai）／アクセシビリティ ← alt-missing（ai。目標基準は未確定）／ブランド・配色・フォント・デザイン承認（human。デザインの質問 q-brand 等はデザインの段階で入る＝§6 Q-5） |
| 06 | 画像・動画 ← q-keep（ai）／移行 ← q-keep・q-content（ai。件数は未確定）／法定表示 ← q-cv・q-feature（ai。**「法務確認が必要」までしか書かない**）／原稿・翻訳・著作権（human） |
| 07（選択） | 問い合わせ ← q-cv・q-feature／検索・会員登録・ログイン・通知・多言語 ← q-feature・q-other／予約 ← q-cv（来店予約）・q-feature／決済 ← q-cv（購入）・q-purpose（EC）・q-feature（すべて ai）／Cookie同意（human） |
| 08（選択） | CMS種別・更新範囲 ← q-ops・q-purpose（更新を楽に）・q-improve（更新のしやすさ）・q-content／権限・承認フロー ← q-ops（両方）・q-other（すべて ai）／操作履歴・プレビュー・公開予約（human） |
| 10（選択） | メタ情報 ← title-length・description・q-seo／構造化データ ← structured-data／XMLサイトマップ ← sitemap／リダイレクト ← q-url の有無（すべて ai）／robots.txt・GA4・Search Console（human） |
| 11・14・15 | 全項目（standard。確認中） |
| 12 | ドメイン・DNS ← q-dns-owner・q-dns-switch（server。選択肢の文言だけ転記。q-infra・q-dns-note は転記せず開発者が読む）／SSL/TLS・メール・メール認証・ネットワーク（standard） |
| 16 | 更新代行 ← q-ops（ai）／他 5 項目（standard） |
| 17 | 全 7 項目（human） |
| 18 | データ移行 ← q-keep・q-content（ai）／DNS切替 ← q-dns-switch（server）／公開 ← q-schedule（ai。回答の時期をそのまま）／操作説明 ← q-ops（ai）／切り戻し・公開後対応（human） |
| 19 | 公開 ← q-schedule（ai）＋日程の `releaseDate`（server。あれば優先）／検収 ← `deliveryDate`・実装 ← `buildDue`（server。あれば）／要件定義・デザイン・テスト・素材提供・承認（human）。**AI は日付を作らない** |
| 21 | コンテンツ更新・CMS更新 ← q-ops（ai）／他 9 項目（human） |
| 22 | 未決事項 ← 「未確定」の項目の一覧（server が自動で集める）＋ AI の確認事項（ai）／課題 ← q-issue（ai）／変更要求・決定事項（human。承認履歴 approvals から） |

**材料がまったく無い項目（初期値「未確定（ヒアリングで確認）」→ 22 章の未決事項へ自動で載る）**: 01 責任者・承認者・連絡体制／02 受託範囲・対象外・成果物・変更管理／03 想定アクセス／04 ページ数／05 ブランド・配色・フォント・デザイン承認／06 原稿・翻訳・著作権／07 Cookie同意／08 操作履歴・プレビュー・公開予約／10 robots.txt・GA4・Search Console／17 全 7 項目／18 切り戻し・公開後対応／19 要件定義・デザイン・テスト・素材提供・承認／21 サーバー管理・監視・SSL更新・バックアップ・素材権利・障害対応・利用者管理・事故対応・契約終了／22 変更要求・決定事項（**計 48 項目** [FACT 上表から数えた]）。内訳は ai 41・server 8・human 48・standard 32（計 129）。**生成直後に AI が埋めうるのは最大 41 項目**。

---

## 3. 出力のデータモデル（提案 v3）

### 3.1 形

```
ProposalV3 = {
  version: 3,
  // サーバー欄（generated にだけ置く。v2 と同じ）
  hostname, issue, purposes[], improves[], competitors[], siteCheck|null, origin{kind:'ai', promptVersion, model},
  template: { id: 'TPL-WEB-REQ', version: '0.1' },
  // 開発者が直す欄（edited）
  summary, points[≤6],                       // v2 と同じ（改善提案。残すかは §6 Q-4）
  doc: {
    items:  { [itemId]: DocItem },           // カタログの全 129 項目（キーはカタログの id と一致・過不足なし）
    added:  AddedItem[≤10],                  // AI追加（source:'ai_added'）
    notes:  { [chapterId]: string≤400 },     // 章末の「特記事項・対象外・追加費用・承認状況」（16 章を除く 18 章）
    cover:  { client: string≤100, vendor: string≤100, author: string≤100, approver: string≤100 }
  }
}
DocItem   = { status: 'proposed'|'open'|'na'|'std_pending', text: string≤400, evidence: Key[≤5], by: 'ai'|'server'|'human' }
AddedItem = { id: 'a01'…, chapterId, label: string≤40, status: 'proposed'|'na', text: string≤400, reason: string≤200, evidence: Key[1..5], source: 'ai_added' }
```

| status | 画面の言葉 | 付けられる区分 |
|---|---|---|
| `proposed` | 確定案（選択は「採用案」） | 個別・選択・AI追加 |
| `open` | 未確定 | 個別・選択 |
| `na` | 対象外（選択は「不採用」） | 個別・選択・AI追加（理由の文が必須） |
| `std_pending` | 確認中（標準仕様の確定後に記載） | **固定だけ。固定はこれ以外にできない**（標準仕様が決まったら `std` を足す＝§6 Q-1） |

- 上限（案）[TARGET]: 項目の文 400・AI追加 10 件・特記 400・未決の確認事項 20 件×200（22 章の「未決事項」の文に入れる）
- **大きさ** [INFERENCE 計算]: 文が全部上限でも 129×400 字×3 バイト ≒ 155 KB＋α。aiDrafts は generated と edited の 2 つで約 330 KB、requirements/current と approvals の写しは各 約 170 KB。Firestore の 1 文書 1 MiB には収まるが余裕は 3 倍程度。**承認履歴は改訂のたびに写しが増える**（1 件ずつ別文書なので上限には当たらない）
- 型: `src/types/aiDraft.ts` に `ProposalV3`・`isProposalV3` を足す。`StoredProposal = Proposal | ProposalV2 | ProposalV3`

### 3.2 保存済みの v1・v2 を壊さない

- v1（version なし）・v2 はそのまま有効。**バックフィルしない**。approvals は不変（追記のみ）
- 表示（`ProposalView`・`requirementsDoc.ts:80,110`）は版で分ける: v1/v2 は今の 4 節の形、v3 はひな型の章立て。機能フラグに関係なく 3 つとも描ける（B-M4 と同じ方針）
- `proposalForSave`・`reqDoc`（`AI_REQUIREMENTS.md` §7 が挙げる `src/live/model.ts`）は v3 の `template`・`doc` を落とさないよう版で分ける
- 作り直しは常に v3 で作る。v2 の下書きが残る案件で作り直すと v3 に置き換わる（編集を捨てる確認は今と同じ）

### 3.3 Firestore Rules への影響

- `aiDrafts` はクライアントから書けないまま（`firestore.rules:330-333`）。`edited` の検査は callable `saveAiDraftEdits`（`functions/src/ai/edits.ts`）が**カタログと上限の定数で**行う（キーの過不足・固定は `std_pending` だけ・`by` の書き換え禁止・AI追加は削除と編集のみで追加不可 [案]・上限）
- 提出（submit）: `validStoredProposal`（`firestore.rules:431-433`）に `version == 3` の分岐を足し、`proposalV3Ok` を v2（`:421-429`）と同じ**マップの等式 1 本**で書く（`generated` のサーバー欄＋`template`＋`edited` の `summary`・`points`・`doc`）。中身は Rules で再検査しない
- **計測済み（U3・database-engineer 2026-11-26。エミュレータ・demo-afro-cms・`tests/rules/proposalV3.test.mjs` の計測テスト）**: 最大の payload（全 20 問上限＋generated・edited とも上限ちょうど・4 バイト文字）の v3 submit は**上限内**。式の詰め物（比較 10 個の関数 1 個 ≒ 50 式）が trivial な書き込みで 19 個、v2 submit で 14 個、v3 submit で 14 個まで通る → v3 の消費は約 250〜300 式／1,000（**余裕 約 70%**。等式はマップの大きさで式の数が増えない）。参照: 存在しない文書の `exists()` を v2・v3 とも さらに 8 個足せる（各操作 10 の上限。v3 は v2 と同じ `getAfter(aiDraft)` 1 回）。文書の大きさ（最大）: `aiDrafts` 522,615 B（1 MiB の 49.8%）・`requirements/current` と approvals の写し 約 275,420 B（26.3%）。計画の出し直しは不要。計測テストは式の余裕 20% [TARGET] と参照 5 個を下回ると落ちる
- **必須の章のゲート（security-engineer U3 監査の条件・lead DECISION 2026-11-26）**: `saveAiDraftEdits` が edited と同じ書き込みで aiDraft の `submitReady: { requiredOk, templateVersion }` を置く（`requiredOk` は `reqDocRequiredOk`＝`REQ_DOC_REQUIRED_CHAPTERS`（0.1 は c01・c02・c19・c21）の全項目が proposed か na で文が空白だけでない）。提案には写さない。worker は discardEdits で edited と一緒に消す。`proposalV3Ok` は `submitReady.requiredOk == true`・版が `generated.template.version` と一致・`template.id == 'TPL-WEB-REQ'` を条件にする（無い＝拒否）。ゲートを足した後の計測（同日・同じ方法）: v3 submit の詰め物 13 個（消費 約 300〜350 式・**余裕 約 65%**）・`exists()` の余裕 9（v2 は 14 個・9 で不変）
- `approveOk` / `submitOrWithdrawOk` の `d.proposal == r.proposal` は版に関係なく働く（変更なし）

---

## 4. AI（プロンプト・Schema・費用・評価）

### 4.1 プロンプトと Schema

- **`PRM-REQ-001@2.0.0`**（出力の形が変わるので major を上げる。`origin.promptVersion` に残る）。`configHash` にカタログの版を入れ、ひな型の版が上がったら同じ回答でも作り直せるようにする
- system に足すもの: カタログのうち **`fill:'ai'` の 41 項目だけ**（id・章・項目名・区分・確認対象）。固定・server・human の項目は**AI に渡さない**
- 出力 Schema に `doc` を足す: `items: [{ id: enum(fill:'ai' の 41 id), status: enum('proposed','open','na'), text, evidence: [enum(AI_EVIDENCE_KEYS)] }]`、`added: [{ chapterId: enum, label, text, reason, evidence }]`、`questions: string[]`。**固定の id は enum に無いので出力できない**

| 区分 | AI が書いてよいこと |
|---|---|
| 固定 | **何も書かない**（Schema で出せない。サーバーが `std_pending`・空文字で置く） |
| 個別 | 材料（evidence）のある事実の整理だけ。材料が無ければ `open`。推測で埋めない |
| 選択 | 採否案（`proposed`＝採用案／`na`＝不採用）と**理由**。材料が無ければ `open` |
| AI追加 | ひな型に無く、回答に根拠がある項目だけ（例: 採用サイトの応募フォーム・求人検索）。10 件まで・1 章 5 件まで [TARGET]。ひな型の項目と同じ名前は不可 |

- 守ること（今の system に追加）: 回答に無い数値（PV・ページ数・KPI の目標値・日付・金額・稼働率）を書かない／「保証します」「必ず」など約束の言い方をしない／個人名・連絡先を書かない／法令に当たるか（特商法・個人情報・Cookie の外部送信など）は「法務確認が必要」と書くだけで結論を書かない
- 後処理（`postprocess.ts` に足す）: 許可されない id・重複（先勝ち）を捨てる／`proposed`・`na` で evidence が空なら `open` にして文を空に／`na` は選択だけ（個別の `na` は `open` へ）／evidence の許可リスト／URL・メール・電話の除去（今と同じ）／入力に無い数字は `flags.unsupportedNumbers` に**項目 id つき**で付ける（消さずに開発者が判断。今と同じ）／AI追加は evidence 0 件・ひな型と同名・上限超えを捨てる
- 最後にサーバーが全 129 項目を組み立てる: 固定 → `std_pending`、server → 転記、AI の結果、残り → `open`。22 章の未決事項に `open` の項目名を集める
- **AI の入力に編集後の文書は入れない**（作り直しも回答とサイト診断だけから。開発者が書いた責任者名などは外部へ出ない）

### 4.2 費用の見込み [INFERENCE・未計測]

今の実測（`AI_REQUIREMENTS_EVAL.md` §2。60 回の合計 ÷ 60）: Haiku **$0.0011**・Sonnet **$0.020**・Opus **$0.045**／回。
v3 の仮定: 入力 25,000（今の見込み 19,000 ＋カタログ 41 項目 約 4,000＋指示 約 2,000）、出力 12,000（項目 30〜50 件×約 120 字＋JSON＋改善提案＋思考）、最悪は出力 24,000（`max_tokens` を 12,000 → 24,000 に上げる案）。単価は `functions/src/ai/pricing.json`（2026-11-20 確認。入力 10 万以下なので Haiku の長文単価は当たらない）。

| モデル | 1 回（見込み） | 1 回（最悪） | 月 200 回（見込み / 最悪） | 今の実測比 |
|---|---|---|---|---|
| Haiku 5.5 | $0.0085 | $0.015 | $1.7 / $2.9 | 約 8 倍 |
| Sonnet 5.5 | $0.17 | $0.29 | $34 / $58 | 約 9 倍 |
| Opus 5.5 | $0.34 | $0.58 | $68 / $116 | 約 8 倍 |

- 効き所は**出力トークン**（項目の文の量）。下げる手: AI に書かせる項目を 41 → 必要な章だけに絞る／文の上限 400 → 200／改善提案を別の生成に分けない（呼び出しを増やさない）
- **Sonnet 以上は、推奨していた Anthropic Workspace の上限 月 $20（`AI_REQUIREMENTS.md` §9 Q-2）を月 200 回で超える**。Haiku なら今の上限内（§6 Q-7）
- 所要時間: 出力が約 2 倍になるので p90 も 2 倍前後 [INFERENCE]（今 15〜23 秒 → 30〜50 秒）。基準 120 秒の内側の見込み

### 4.3 評価への影響

- promptVersion が変わるので**同じ評価セット（合成 20 件×3 モデル×3 回）を回し直す**。合格基準は変えない（Schema 60/60・根拠のない数値 0（機械＋目視）・注入 0/30・PII 0・p90 ≤120 秒・盲検）
- 同じ基準を新しい欄にも当てる: 項目の文・AI追加の文も「根拠のない数値」「PII」「注入」の検査対象。固定の項目に AI の文が入った件数は Schema 上 0 になるはずなので、機械検査で 0 を確かめる
- 盲検は改善提案の採点のまま（文書の項目はテンプレートに比べる相手が無い。今の限界と同じ）。文書は開発者 2 名が 5 件を目視で「材料の無いことを書いていないか」を見る（合否には入れない記録）[案]
- 評価の費用 [INFERENCE]: 各 60 回 ≒ Opus $20＋Sonnet $10＋Haiku $0.5 ≒ **$31**。今の上限 $25 を超える → Haiku・Sonnet だけを先に回す（約 $11）か、上限を上げる（§6 Q-7）

---

## 5. 画面と出力

### 5.1 編集画面（開発者。`AiDraftEditor`）

- 上から: 状態と主操作（今と同じ）→ 要約・改善ポイント（今と同じ）→ **要件定義書**（章ごとの開閉。章の見出しに「確定案 n／未確定 m／確認中 k」）→ 表紙の欄
- 項目 1 行: 項目名＋**区分のチップ**（固定／個別／選択）＋状態（`Select`。固定は「確認中」で固定し操作不可）＋文（`TextField`、`{n} / 400文字`）＋根拠のチップ（読み取り専用。表示名は `AI_REQUIREMENTS_UI.md` §6.2 の表に server の材料を足す）＋確認対象（helperText）
- **AI追加**: 章の末尾に「AI追加」バッジ付きで並べる。理由を表示。開発者は編集・不採用・削除ができる（追加は §6 Q-8）
- **確認中**: 文の欄の代わりに「標準仕様の確定後に記載（確認中）」を出す。入力欄は出さない
- 絞り込み「未確定だけ表示」「要確認の数字がある項目だけ」。要確認の数字は今の仕組み（`AI_REQUIREMENTS_UI.md` §3.2）を項目単位にする
- 自動保存・承認を依頼する・作り直す・エラー文言は今の仕様のまま（payload が大きくなるだけ）
- 表示はプレーンテキスト（`dangerouslySetInnerHTML`・Markdown 変換を使わない。今と同じ）

### 5.2 お客様の画面と書き出し

- **「AIがまとめた改善提案」の画面（ヒアリングの result・お客様ポータルの提案画面）に AI 要件定義を含める**（2026-11-26 ユーザー決定。Q-4 を改める）: 見出しは「AIがまとめた改善提案」のまま → 要約・改善ポイント（今と同じ）→ **AI 要件定義（ひな型 v0.1 の章立て）**: 01〜22 章（項目名・区分・確定内容）→ 23 章（標準仕様書の欄は「確認中」）。改善提案を付録へ回す案はやめた
- 要件定義書（`requirementsDoc.ts`・PDF）も同じ順: 表紙 → 改善提案 → 01〜23 章 → 付録: ヒアリングの回答 [案。画面と揃える。U4 の画面仕様で ui-ux-designer が確定]
- v3 では今の「4. 非機能要件（アフロ標準）」（`requirementsDoc.ts:45-73`）を出さない案（固定の章と食い違うため。§6 C-01）
- 書き出し: **今の PDF ダウンロード**（`jspdf`・`html2canvas-pro`。依存追加なし）をそのまま使う。**Word（.docx）でひな型のレイアウトのまま出す**のは選択肢として残す: ①`docx` パッケージでクライアント生成 ②ひな型 .docx を差し込み（`docxtemplater`＋`pizzip` 等）③依存なしで OOXML と zip を自前で書く。①②は依存の追加（lead-architect の承認事項）、③は保守の負担が大きい。**決めない**（§6 Q-6）
- 129 項目の PDF は 15〜25 ページ程度になる [INFERENCE]。html2canvas の画像化で重くならないかを実機で確かめる（U4）

---

## 6. 例外・権限・矛盾・確認事項

### 6.1 例外と境界

| 条件 | 期待 |
|---|---|
| URL なし／サイト取得が blocked・failed | siteCheck は null。10 章の診断由来の項目は `open`。構築区分は「新規」を断定せず `open` |
| 任意の回答が空 | その回答だけが材料の項目は `open`。AI に推測させない（後処理で evidence 空 → `open`） |
| AI が固定・未知の id を返す／同じ id を 2 回 | Schema で弾く／捨てる／先勝ち |
| AI が選択を不採用にしたが、回答に希望がある（例: q-feature に「予約」） | 機械では検出しない [INFERENCE]。開発者が見る（評価の目視で件数を記録） |
| AI追加がひな型の項目と意味で重複（「応募フォーム」と「問い合わせ」） | 同名だけ機械で捨てる。意味の重複は開発者が判断 |
| 日程が承認後に入る | 承認時点の 19 章はほぼ未確定。日程を入れた後に文書を改訂するかは Q-9 |
| ひな型の版が上がる | 保存済みは古い版のカタログで描く。新しい版で作り直すときは回数に数える |
| カタログに無い id が保存データにある（版の取り違え） | 「旧版の項目」として末尾に出す（落とさない） |
| 編集が上限超え・固定を確認中以外にする・`by` を変える | `saveAiDraftEdits` が `invalid-argument` |
| AI 機能フラグ off | 今と同じテンプレート提案（v1）。v3 は作らない（§6 Q-10） |
| 生成済み下書きの保存期間（90 日で削除。未実装＝`AI_REQUIREMENTS.md` §7） | 削除の実行主体はまだ無い（**要件未完のまま**）。v3 で 1 件が約 2〜3 倍に大きくなる |

### 6.2 権限

| 誰 | できること | 制御する場所 |
|---|---|---|
| 担当開発者（アサイン済み） | 生成・編集・作り直し・承認の依頼 | callable（`authz.ts`）＋Rules（`aiDrafts` はクライアント書き込み不可） |
| 管理者 | 上と同じ＋編集の破棄（記録が残る） | 同上（今の仕様のまま） |
| お客様 | 提出された文書を見る・承認・差し戻し相談。**編集しない**。生出力・要確認の数字・使用量は見ない。根拠のキー名・`by`・AI追加の印（`source:'ai_added'`）は画面に出さない（提出の写しには入り、SDK では読める。2026-11-26 ユーザー受容。ref docs/reviews/2026-11-26-reqdoc-u3-security.md T-01） | Rules（`aiDrafts` を読めない）。表示は提出済みの写しだけ |
| 未アサイン開発者・無効アカウント | 何もできない | callable・Rules（今のテストを v3 でも回す） |

### 6.3 矛盾・抜け（C-xx）

| # | 指摘 | 状態 | 解決先 |
|---|---|---|---|
| C-01 | 今の要件定義書には「非機能要件（アフロ標準のたたき台）」がある（AWS・TLS・MFA・WAF・バックアップ 1 日 1 回 7 日分・稼働率 99.5%。`requirementsDoc.ts:45-65`）。ひな型は固定を「確認中・未確定のまま約束しない」とする。**どちらが正か** | OPEN | Q-1 |
| C-02 | 05 デザイン要件の材料（q-brand・q-design-* ）はデザインの段階で入る（`requirements.ts:6`）。要件定義の承認時点では 05 章はほぼ未確定 | OPEN | Q-5 |
| C-03 | 19 スケジュールは承認後に入る（`requirementsDoc.ts:28-31`）。ひな型は要件定義書の中で日程を合意する形 | OPEN | Q-9 |
| C-04 | 17・21 章は「個別」だがヒアリングに材料が無く、内容は実質アフロが決めること（テスト範囲・責任分界） | OPEN | Q-3 |
| C-05 | ひな型の 09・13・20 章が欠番、16 章に特記欄が無い | OPEN | Q-2 |

### 6.4 法務の候補（結論は出さない。起票と持ち込みは product-manager）

06 法定表示（プライバシーポリシー・EC なら特定商取引法の表示）／07 Cookie同意（電気通信事業法の外部送信規律・個人情報保護法）・決済（特定商取引法・資金決済法の該当性）・会員登録（個人情報保護法）。AI の出力に法的な結論を書かせない（§4.1）。**この設計では `LEGAL_REVIEW_BRIEF` に起票していない**（AFRO CMS の起票先は PM が決める）。

### 6.5 ユーザーに確認すること（NEED CONFIRMATION）

| # | 内容 | 推奨案 |
|---|---|---|
| Q-1 | **固定 32 項目の「アフロ標準仕様」の出所**（誰がいつ決めるか、版の管理、承認者）。今の「非機能要件（アフロ標準）」を標準仕様として扱うか | 決まるまで v3 は全件「確認中」。今の非機能の節は v3 では出さない |
| Q-2 | 09・13・20 章の欠番と 16 章の特記欄の欠落は意図か | 欠番のまま（ひな型どおり）。中身は作らない |
| Q-3 | 材料の無い 48 項目（17・21 章など）を、開発者が手で書くか、ヒアリングに質問を足すか、アフロ標準の文を初期値に置くか | 今回は開発者が書く（質問は今のまま＝決定どおり）。17・21 章は標準文の候補として Q-1 と一緒に決める |
| Q-4 | 今の「改善提案（要約・ポイント）」を v3 でも残すか | **決定（2026-11-26 ユーザー）: 残す。改善提案の画面の上に置き、その下に AI 要件定義（ひな型の章立て）を続ける**（付録へ回す案はやめた。§5.2） |
| Q-5 | 05 章をデザインの段階の回答で後から埋めるか（文書の改訂） | 承認時点は未確定。改訂の流れは別の設計 |
| Q-6 | 書き出しを PDF のままにするか、Word（.docx）をひな型のレイアウトで出すか（依存の追加が要る） | まず PDF。Word が必要なら依存の案を lead-architect に出す |
| Q-7 | 費用: 1 回が約 8〜9 倍。Sonnet 以上は Workspace 上限 月 $20 を超える。評価の回し直し 約 $31 が上限 $25 を超える | Haiku の合否を先に見る（Haiku・Sonnet だけ先に回して約 $11） |
| Q-8 | AI追加を 10 件までにするか／開発者が手で項目を足せるようにするか／お客様に「AI追加」の印を見せるか | 10 件。手で足すのは次の段階。お客様には印を出さず「追加項目」と表示 |
| Q-9 | 承認後に日程や未確定の項目が決まったとき、要件定義書を改訂（版を上げて再承認）するか | 改訂履歴（表紙）を使う流れを別に設計 |
| Q-10 | AI 機能が off のとき、ひな型の形の文書（サーバーの転記だけ・残りは未確定）を出すか | 出さない（今の v1 のまま）。必要なら後で |
| Q-11 | 表紙の発注者・受注者・作成者・承認者に個人名を入れるか（お客様に見え、承認履歴に写る） | 会社名と役職まで。氏名は承認の記録（approvals）に任せる |

**[DECISION] ユーザー 2026-11-25「推奨で」: Q-1〜Q-11 はすべて上の表の推奨案で確定。** Q-1 の標準仕様の中身はユーザー（または指名者）が後で決める（それまで固定 32 項目は「確認中」）。Q-7 の評価の回し直し（Haiku・Sonnet、約 $11）は課金なので、実行の直前にユーザーが自分の端末でキーを入れて回す。

---

## 7. 実装計画（単位・書く範囲・規模・テスト）

| 単位 | 書く範囲 | 規模 | テスト |
|---|---|---|---|
| **U1 カタログと型** | `src/shared/ai/reqDocCatalog.ts`（新規）・`src/types/aiDraft.ts`（v3 型・上限）・`gen-ai-shared` の写し | M | 単体: 抜き出した本文との一致（章 19・項目 129・区分 32/74/23・確認対象）、id 重複なし、fill の数（ai 41・server 8・human 48・standard 32）。`gen-ai-shared --check` |
| **U2 生成と保存（Functions）** | `functions/src/ai/prompts/PRM-REQ-001.ts`（2.0.0）・`schema.ts`・`postprocess.ts`・`generateDraft.ts`（組み立て・configHash）・`edits.ts`（v3 の検査）・`limits.ts`（max_tokens） | L（外部 AI の出力・保存データの形） | 単体（Stub）: 固定 id を返す・未知 id・重複・evidence 空・個別の na・数字の印（項目 id つき）・AI追加の上限と同名・全 129 項目の組み立て・server の転記に自由記述が入らない・送信 payload のスナップショットが今と同じ（送る質問が増えていない）・編集の検査（固定の状態変更・`by` 変更・上限超え → 拒否）。既存 functions のテストを全件 |
| **U3 Rules** | `firestore.rules`（`validStoredProposal` に v3、`proposalV3Ok`）・`tests/rules/` | L（認可。security-engineer 同席） | v1・v2 の既存文書の更新が通る／v3 の偽造（doc を generated・edited と変える）が拒否／お客様が aiDrafts を読めない／**最大の payload で式の数・評価の上限を計測**（上限に当たれば計画を出し直す） |
| **U4 画面と書き出し** | `AiDraftEditor`・`ProposalView`・`aiDraft/proposalV2Format.ts`（v3 の描画を別ファイルで）・`requirementsDoc.ts`（版で分岐） | L（ui-ux-designer の画面仕様を先に） | 単体: v1/v2/v3 の 3 つが描ける・確認中の表示・AI追加の表示・esc を通る。E2E Focused: 編集→保存→承認依頼→お客様の表示。PDF 129 項目の実機での生成時間 |
| **U5 評価の回し直し** | `prototypes/ai-requirements-eval`（セットの期待値に doc の検査を足す）・`docs/design/AI_REQUIREMENTS_EVAL.md` | P（課金の実行はユーザー承認・Q-7） | 合格基準は変えない。結果を版ごとに記録 |
| U6 Word 書き出し（保留） | Q-6 の決定後 | — | — |

- 順番: U1 → U2・U3（並行可。書く範囲が重ならない）→ U4 → U5 → 機能フラグを開く判断（ユーザー）。L 以上なので各単位の前に `planning-implementation` と Plan Review、全体の前に `analyzing-change-impact`
- Rollback: 機能フラグで生成を v2（PRM-REQ-001@1.0.0）に戻せるようにする（プロンプト版を設定で選ぶ）。Rules は v3 を受け付けたまま残す（保存済みの v3 を読めなくしない）

**変えないもの**: ヒアリングの質問と選択肢（`src/data/requirements.ts`）／`gen-rules-questions.mjs` と `validAnswers`／AI へ送る質問の範囲（`AI_SENT_QUESTION_IDS`）と除去の処理／v1・v2 の保存形と表示／approvals の形／回数・支出の上限（`quota.ts`）／サイト取得（`site/`）／モデルの選定（ユーザー決定待ちのまま）／`.docx` の原本。

### 受け入れ基準（RA 版。PM 版 AC があればこちらが正）

1. 生成した v3 の `doc.items` のキーがカタログ 0.1 の 129 id と過不足なく一致する
2. 固定 32 項目はすべて `std_pending`・文は空。AI の Stub が固定の id を返しても保存されない
3. `proposed`・`na` の項目はすべて evidence を 1 つ以上持つ。evidence の無い AI の文は保存されない
4. AI追加は 10 件以下で、すべて evidence と理由を持つ
5. 送信 payload に q-infra・q-dns-*・案件名・顧客名・編集後の文書が含まれない（スナップショット）
6. 保存済みの v1・v2 の提案が今と同じに表示され、更新が Rules で通る
7. v3 の提出で doc を書き換えた偽造が Rules で拒否される
8. 評価の合格基準（`AI_REQUIREMENTS.md` §5.5）を v3 でも満たす（数字の創作 0・注入 0/30・PII 0・p90 ≤120 秒）

### Requirement Review 依頼

| Reviewer | 観点 | 判定 | 理由 |
|---|---|---|---|
| product-manager | 2026-11-25 の決定の意図と一致しているか（Q-1・Q-3・Q-4・Q-8 を含む） | **条件付き承認**（product-manager 2026-11-25） | 意図とは一致している（ひな型＝出力の章立て・ヒアリングは今のまま・AI が下書き・ひな型に無い項目は AI追加・固定は確認中）。AC 1〜2 が「ひな型どおり」、AC 4 が「＋α AI で追加」に対応する。条件: ①**価値を測る AC が無い**。AC 1〜8 は形と安全性（書いてはいけないこと）だけで、「AI が下書きして開発者が楽になったか」を測っていない。追加する: アイグラン（実案件の 1 件目）で、AI が `proposed`／`na` にした数（最大 41）、開発者がそのまま採用した数・直した数、提出までに手で書いた項目数と所要時間を記録する（目標値は [TARGET]。合否には入れず、初回は記録だけ）。②**お客様へ出す前の最低ライン**: 129 項目のうち、固定 32 が確認中、材料なし 48 が手書き、AI は最大 41 なので、そのまま出すと「確認中・未確定」ばかりの文書になる。アイグランへ出す前に、開発者が書く 48 項目のうち必須の章（01・02・19・21）を決めておく。17・21 章の標準文（Q-1・Q-3）を初回の提出前に用意するかどうかはユーザーに確認する。③モデルの比較（11-24 会議。他社 AI を含む）は `AI_REVIEW_2026-11-26.md` の決定に従うこと、U5 の回し直しはそこで選んだモデルで行うことを §4.3 に 1 行書く。④法務の候補（§6.4）の起票先は このリポジトリの `docs/LEGAL_REVIEW_BRIEF.md`（新規）とし、起票は product-manager が行う（実装を止める理由ではない）。最初のリリースの範囲（U1〜U4＋PDF、Word は保留）は妥当 |
| lead-architect | 実現性・費用（§4.2）・Rules の計測方針（§3.3）・規模判定 | 条件付き承認（2026-11-25） | 規模 XL（保存データの形・Rules・外部 AI）。PM の条件 1（アイグランで AI が埋めた数・採用/修正数・手書き数・提出までの時間を記録。合否に使わない）・3（U5 は 11-26 レビューで選んだモデルで回す）・4（法務候補は docs/LEGAL_REVIEW_BRIEF.md へ PM が起票）を受け入れる。条件 2（お客様へ出す前に必ず埋める章。推奨 01・02・19・21、17・21 章の標準文）はユーザー確認。U1（カタログ＋型）は条件 2 を待たずに始めてよい。U3 は Rules の式の計測が先（超えたら計画を出し直す） |


**[DECISION] ユーザー 2026-11-25「推奨で」（PM 条件 2）: お客様へ出す前に必ず埋める章は 01・02・19・21。他の章は「未確定」のまま提出できる。17・21 章の標準文は Q-1 の標準仕様と一緒に後で用意する。**
