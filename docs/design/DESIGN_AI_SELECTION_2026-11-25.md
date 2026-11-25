# デザイン案 AI の候補選び（たたき台）— 2026-11-26 レビュー用

- 作成日: 2026-11-25 ／ 作成: ai-engineer（**調査のみ**。API の呼び出し・アカウント作成・購入はしていない）
- 表記: [FACT]＝コードか公式ページで確認（file:line か URL＋取得日）／ [INFERENCE]＝確認済みの事実からの推測 ／ [UNKNOWN]＝調べたが分からない ／ [見込み]＝単価×仮定のトークン数・枚数からの計算
- **これは推奨案。新しい外部サービスの採用・継続費用はユーザーが決める**（CLAUDE.md 10章）。合格基準は評価前に固定し、結果を見て緩めない

---

## 1. デザイン AI の仕事（demo の実物から）

| 項目 | 内容 | 根拠 |
|---|---|---|
| 出す数 | **3 案（A ミニマル / B クリエイティブ / C プレミアム）× 2 画面（トップ＋改善後サイトマップの主要ページ 1 つ）＝ 6 パターン**。11-17 会議の「3 画面 × 2 案」を 11-19 のユーザー指示で「2 画面 × 3 案」に変えた | [FACT] `src/data/designs.ts:28-32`、`src/features/design/DesignStudioPage.tsx:180,211-212` |
| 入力 | ①案件（サイト名・URL・ブランド色・業種）②ヒアリング（`q-strength`・`q-target`・`q-cv`・`q-content`）③**デザイン要件定義**（現行の不満 `q-design-dislike`・企業イメージ `q-image`・参考サイト `q-design-ref`・コーポレートカラー `q-brand`・写真/イラスト方針 `q-design-media`・スマホの改善点 `q-design-sp`）④改善後サイトマップ（ナビ・2 画面目）| [FACT] `src/features/design/designContext.ts:7-13`、`src/data/designRequirements.ts:13-18` |
| 出す条件 | サイトマップのお客様承認 ＋ デザイン要件定義の必須（A）が全部埋まってから | [FACT] `DesignStudioPage.tsx:185-186`、`designReq.ts:14-19` |
| いまの出力 | **AI は使っていない**。3 つの固定 React テンプレート（`previews/MinimalPreview.tsx` ほか）に、案件ごとの文言・ナビ・CTA・色を差し込むだけ。英字見出しは業種の正規表現で選ぶ（「AI の生成の代わり」とコメント）。各案は配色 4 色・書体 2 つ・スコアを持つ | [FACT] `designContext.ts:68-77`、`designs.ts:6-26` |
| 見る人・承認 | 開発者・管理者は比較だけ。**採用と承認はお客様ポータルだけ**（「トップデザイン」承認）。承認後は案を変えられず、全ページ構築と本番反映の前提になる | [FACT] `DesignStudioPage.tsx:163-164,346`、`PortalApprovalsPage.tsx:82`、`src/data/dev.ts:179` |
| 現行サイトのスクショ | demo では入力にしていない（grep で 0 件）| [FACT] `grep -rn "screenshot\|スクリーンショット" src/features` 0 件 |
| AI 要件の範囲 | 要件定義の AI 設計では「デザインの AI は範囲外」と決めてあった | [FACT] `docs/design/AI_REQUIREMENTS.md:12`（D-1） |

**[INFERENCE] 本当に必要な出力は「お客様がブラウザで見て選べる、日本語の文字が正しい画面」**。承認後はそのまま全ページ構築に進むので、絵だけでなく**配色・書体・余白などの値（デザイントークン）と構成**が取り出せる形が望ましい。

### 出力の形は 3 通り

| 形 | 中身 | 長所 | 短所 |
|---|---|---|---|
| **(a) LLM が HTML/CSS を書く** | 1 画面＝1 ファイルの HTML（外部読み込みなし）＋トークンの JSON | 日本語の文字が崩れない。編集・構築に流用できる。スマホ表示も同じ物で見られる | 写真は作れない（枠・図形・プレースホルダー）。見た目の幅はモデル次第 |
| **(b) 画像生成でカンプを描く** | トップの縦長 1 枚の画像 | 写真の雰囲気まで見せられる | **日本語の文字が崩れやすい**（下記）。編集できない。構築には描き直しが要る |
| **(c) デザインツールの API** | Stitch など | 画面＋HTML が出る | 規約・料金・保証が未確認（§2.3）|

---

## 2. 候補（公式ページ。取得日 2026-11-25）

### 前提のトークン・枚数 [見込み]

- (a): 1 案＝入力 8k ／ 出力 30k（HTML 2 画面 約 20k ＋ 思考 約 10k）。**3 案で入力 24k ／ 出力 90k**
- (b): 3 案 × 2 画面 ＝ **6 枚**（2K 相当）
- 要件 AI の実測は設計の見込みの約 2 割だった（`AI_REVIEW_2026-11-26.md` §3）ので、上は多めの見積もり

### 2.1 (a) HTML/CSS を書く LLM

| 提供元 / モデル | 入力 / 出力 $/1M | 3 案の試算 [見込み] | 構造化出力 | データの扱い |
|---|---|---|---|---|
| Anthropic `claude-opus-5-5` | 4 / 20 | **約 $1.9** | JSON Schema（`output_config.format`）| 商用 API は既定で学習に使わない・30 日以内に削除 [FACT `AI_REQUIREMENTS.md:104`、privacy.claude.com 2026-11-20] |
| Anthropic `claude-sonnet-5-5` | 2 / 10 | **約 $0.95** | 同上 | 同上 |
| Anthropic `claude-haiku-5-5` | 0.10 / 0.50 | 約 $0.05 | 同上 | 同上 |
| Google `gemini-4-hydrogen`（Stable）| 1.50 / 7.50 | **約 $0.71** | JSON（スキーマ完全適合の保証は明記なし）| 有料枠は学習に使わない。**無料枠は学習に使われる** [FACT-g4 `AI_PROVIDER_COMPARISON_2026-11-24.md:62`] |
| Google `gemini-3.1-pro-preview` | 2 / 12（≤200k）| 約 $1.1 | 同上 | **Preview**（本番向きでない [INFERENCE]）|
| OpenAI `gpt-6.2-sol` | 2 / 10 | 約 $0.95 | Structured Outputs（strict）| 既定で学習に使わない・最大 30 日 [FACT-o5 同 :62-63] |
| OpenAI `gpt-6-luna` | 0.10 / 0.50 | 約 $0.05 | 同上 | 同上 |

- 出典: [Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing)、[Gemini pricing](https://aistudio.google.com/docs/pricing)、[OpenAI pricing](https://developers.openai.com/api/docs/pricing)（いずれも 2026-11-25 取得）
- [FACT] Gemini 4 Carbon / Argon は 2026-12-01 から 2 倍、3.8 / 3.6 Flash は 2027-01-01 から 2 倍（Gemini pricing）
- [FACT] Gemini の出力単価は思考トークンを含む（同ページ「Output (incl. thinking)」）
- **日本語のデザイン品質の公開評価は見つからない [UNKNOWN]**（要件 AI と同じく、同じ評価セットで測って決める）
- 待ち時間: 要件 AI の実測（出力 3k 前後）は p90 15〜23 秒。デザインは出力が約 10 倍なので **1 案 1〜3 分** [INFERENCE]。3 案は並列で呼べる

### 2.2 (b) 画像でカンプを描く

| 提供元 / モデル | 1 枚 | 6 枚の試算 [見込み] | 日本語の文字 | その他 |
|---|---|---|---|---|
| Google `gemini-nano-banana-2.1` | $0.0504（2K）| **約 $0.30** | 「読める文字を描ける」とあるが**言語の一覧なし・日本語の記載なし** [FACT] | 参照画像 14 枚まで。縦長 1:4・1:8 対応。**全画像に SynthID の透かし** [FACT] |
| Google `gemini-3.1-flash-image` | $0.101（2K）| 約 $0.61 | 同上 | 同上。思考は無効化できず課金される [FACT] |
| Google `gemini-3-pro-image` | $0.134（2K）| 約 $0.80 | 同上 | スタイル参照 3 枚まで [FACT] |
| OpenAI `gpt-image-2.6-*` | 出力 $30/1M 画像トークン（1 枚の額は計算機のみ）| [UNKNOWN] | 「文字の位置と鮮明さで苦労することがある」。非ラテン文字の記載なし [FACT] | 複雑なプロンプトは最大 2 分 [FACT] |
| OpenAI `gpt-image-2`（参考）| high 1024² $0.211 | 約 $1.3 | 同上 | — |
| fal.ai `fal-ai/flux-2` | $0.012/メガピクセル | 約 $0.3（4MP × 6）| [UNKNOWN] | 生成物は**公開 CDN URL**で返る（当社メモ T-008）。fal 経由の Nano Banana 2 は $0.08/枚で直接より高い [FACT] |

- 出典: [Gemini image generation](https://aistudio.google.com/docs/image-generation)、[Gemini pricing](https://aistudio.google.com/docs/pricing)、[OpenAI image generation](https://developers.openai.com/api/docs/guides/image-generation)、[fal pricing](https://fal.ai/pricing)（2026-11-25 取得）。fal は `docs/knowledge/tech/fal-ai.md` の保存値ではなく取り直した
- **[INFERENCE] 画像は日本語の見出し・ナビ・ボタンが崩れる危険が残る**（どの公式も日本語を保証していない）。使うなら「文字の無い背景・写真の雰囲気だけを画像で作り、文字は HTML で重ねる」形が安全

### 2.3 (c) デザインツールの API

| ツール | サーバーから使えるか | 判定 |
|---|---|---|
| Google Stitch（`@google/stitch-sdk`）| API キーで画面を生成し、HTML とスクショの URL を取れる。モデルは `GEMINI_3_8_FLASH` / `GEMINI_3_5_FLASH_LITE` [FACT [README](https://github.com/google-labs-code/stitch-sdk)] | README に「**Google の公式サポート製品ではない**」。料金・上限・データの扱い・商用利用の規約が README に無い [UNKNOWN]。**本番の候補にしない。会議の参考として画面で 1 回触る程度** |
| Vercel v0 Platform API | 有料プランで API あり（二次情報）| 公式の料金ページを取得できず、条件は [UNKNOWN]。今回は外す |
| Figma | 公開 API でデザインを生成する機能は確認していない [UNKNOWN] | 外す（承認後の構築で Figma に書き出す用途は別の話）|

---

## 3. 推奨（**決めるのはユーザー**）

### 3.1 [DECISION 案 / ai-engineer] 木曜の同一プロンプト比較に入れるもの

| # | 候補 | 形 | 入れる理由 |
|---|---|---|---|
| 1 | **Anthropic `claude-opus-5-5`**（比較用に `claude-sonnet-5-5` も同じ鍵で回せる）| (a) HTML | 既に契約・評価の仕組みがあり、追加の外部サービスが要らない。「デザインは費用をかける価値あり」（11-24 会議）に合う上位モデル。3 案で約 $1.9 [見込み] |
| 2 | **Google `gemini-4-hydrogen`** | (a) HTML | 会議で Google が候補に挙がった。Stable で公式が新規向けに推奨。Opus より安い（約 $0.71 [見込み]）。**有料プロジェクト必須** |
| 3 | **Google `gemini-nano-banana-2.1`**（任意）| (b) 画像 | 「写真の雰囲気を見せる」用途で画像が要るかの判断材料。いちばん安い（6 枚 約 $0.30）。**日本語の文字崩れの件数を数えるため**に入れる |

- OpenAI（`gpt-6.2-sol`）は 4 社目の任意枠。要件 AI で OpenAI を追加するならそのキーで同時に回せる
- **お勧めの形は (a)**。理由: 日本語が崩れない／承認後の全ページ構築にトークンと構成を流用できる／お客様のスマホでもそのまま見られる。(b) は (a) の背景画像に限る使い方を検討

### 3.2 合格基準の案（**評価前に固定**。数値は根拠が無いので [TARGET]）

| 観点 | 合格ライン |
|---|---|
| 形式 | HTML 2 画面＋トークン JSON が Schema どおり: 全回 |
| 安全 | 外部スクリプト・外部読み込み・`<script>`・フォーム送信先: 0 件（sandbox の iframe で表示する前提）|
| 入力の反映 | ブランド色 `q-brand` が主要色に入っている／CTA が `q-cv` に対応: 全回 |
| 日本語 | 文字の崩れ・誤字: (a) は 0 件、(b) は件数を記録（0 件でなければ画像に文字を描かせない）|
| 読みやすさ | 本文の文字色と背景のコントラスト 4.5:1 以上: 全回（機械で計測）|
| 3 案の違い | 同じ案件の 3 案が「見分けがつく」と採点者 2 名とも判定 |
| 時間 | p90 ≤ 180 秒／1 案 [TARGET] |
| 中身（盲検）| 平均 3.5 以上 **かつ 現行テンプレートより上** |

### 3.3 評価のやり方（`prototypes/ai-requirements-eval` の型を流用）

- 置き場: `prototypes/ai-design-eval/`（`run-eval.mjs` → `make-blind.mjs` → `score-blind.mjs` を写して作る。生の出力は `out/`、gitignore）
- データ: **作り物の案件 6 件**（業種 6。`hearings.mjs` の合成ヒアリング＋デザイン要件定義 6 問を足す）。実在のお客様は使わない
- 回数: 6 件 × 3 案 × 各モデル。品質のばらつきを見るため **同じ設定で 2 回**（n=12 案/モデル）。比較で変えるのは**モデルだけ**（プロンプト・入力・温度相当の設定は同じ）
- 盲検: 画面のスクショを並べ、出し手（モデル名・現行テンプレート）を伏せて **開発者 2 名**が 1〜5 点（ブランドに合うか／要件どおりか／日本語の読みやすさ／CTA の分かりやすさ／スマホ）。現行テンプレートの 3 案も混ぜる
- 費用の上限: 全体で **$15**［見込みの約 3 倍］。Opus 36 案 ≒ $23 にならないよう、Opus は 1 回（n=6×3）から始める [見込み: 18 案 × 約 $0.63 ≒ $11]
- 結果: 集計だけを `docs/design/DESIGN_AI_EVAL.md` に置く

---

## 4. ユーザーに決めてほしいこと

| # | 決めること | 選択肢 |
|---|---|---|
| 1 | デザイン AI の出力の形 | (a) HTML（推奨）／(b) 画像／(a)＋背景だけ (b) |
| 2 | 比較に入れる候補 | Opus 5.5（＋Sonnet 5.5）／Gemini 4 Hydrogen／Nano Banana 2.1／OpenAI gpt-6.2-sol |
| 3 | Google の有料プロジェクトを作るか | 作る（前払い 1 回 $5 以上・原則返金なし [FACT-g6]）／作らない |
| 4 | 評価の費用上限 | 案: $15 |
| 5 | 合格基準 | §3.2 の案でよいか（評価前に固定）|
| 6 | 本番でお客様の情報を外部 AI へ送る範囲 | 要件 AI と同じ（ヒアリング回答のみ、個人情報なし）か。参考サイトの URL・現行サイトのスクショを送るか → security-engineer と確認。**LEGAL REVIEW REQUIRED**（外国第三者提供、`AI_REQUIREMENTS.md` Q-4 と同じ論点）|
| 7 | 生成物の権利 | 生成した画面・画像をお客様に納品してよいか（各社の規約の確認は未実施 [UNKNOWN]）→ 法務 |

### 未確認（[UNKNOWN]）

- どのモデルも日本語の Web デザイン品質の公開評価なし → 実測で決める
- 画像モデルの日本語の文字の正確さ（どの公式も日本語を明記していない）
- 生成物の商用利用条件の各社規約の本文（今回は取得していない）
- Stitch / v0 の料金・データの扱い・商用条件
- 実際のトークン数（§2 の前提は仮定。要件 AI では見込みの約 2 割だった）
