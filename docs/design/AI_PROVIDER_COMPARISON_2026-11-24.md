# AI Provider 比較（たたき台）— Anthropic 以外の追加候補

- 作成日: 2026-11-24（2026-11-26 のレビュー用）
- 作成: ai-engineer（調査のみ。API の呼び出し・キーの作成・購入はしていない）
- 前提: 1 回の呼び出しで入力 5k / 出力 3k トークン、60 回 = 入力 0.3M / 出力 0.18M トークン
- **これは推奨案です。新しい外部サービスを採用するかどうかはユーザーが決めます**（CLAUDE.md 10章: 継続費用と新規外部サービス）

## 0. 比較の基準（当社の Anthropic 実測。2026-11-24、各 60 回、effort low）

| モデル | 60 回の原価 | p90 | Schema 適合 | インジェクション |
|---|---|---|---|---|
| Haiku 5.5 | $0.068 | 15 s | 60/60 | 0/30 |
| Sonnet 5.5 | $1.21 | 17 s | 60/60 | 0/30 |
| Opus 5.5 | $2.71 | 23 s | 60/60 | 0/30 |

注: 上は**実測の請求額**です。下の他社の金額は**単価からの試算**で、思考トークン（出力として課金）は含めていません。思考を使うと実際の額は試算より増えます [INFERENCE]。

## 1. 比較表

価格は Standard tier の 1M トークンあたり USD（短いコンテキスト）。60 回の額 = 0.3 × 入力単価 + 0.18 × 出力単価。

| 提供元 / モデル | 位置づけ（公式の説明） | 入力 / 出力 $/1M | 60 回の試算 | 厳密な JSON Schema | 日本国内での処理 |
|---|---|---|---|---|---|
| Google `gemini-3.1-flash-lite`（Stable） | 低価格 | 0.25 / 1.50 | **$0.35** | Structured outputs [FACT-a] | Vertex でも JP 処理なし [FACT-g] |
| Google `gemini-3.5-flash-lite`（Stable） | 3.5 世代で最速・最安。**新規案件向けの推奨**（4 Hydrogen と並べて記載） | 0.30 / 2.50 | **$0.54** | 対応（モデルページ） | Vertex でも JP 処理なし [FACT-g] |
| Google `gemini-3.8-flash`（Stable） | エンタープライズ業務向けの Flash | 0.75 / 3.75（**2027-01-01 から 1.50 / 7.50**） | $0.90（→ $1.80） | 対応 [FACT-a] | **Vertex `asia-northeast1` で JP 処理あり** [FACT-g] |
| Google `gemini-4-hydrogen`（Stable、2026-11 更新） | 日常の開発・エージェント業務。**新規案件向けの推奨** | 1.50 / 7.50 | **$1.80** | 対応（モデルページ） | Vertex でも JP 処理なし [FACT-g] |
| Google `gemini-4-carbon`（Stable） | 最上位の推論モデル | 2.00 / 10.00（**2026-12-01 から 4.00 / 20.00**） | $2.40（**12/1 以降は $4.80**） | 対応 | JP 処理なし [FACT-g] |
| OpenAI `gpt-6-luna` | 最も効率的。大量処理向け | 0.10 / 0.50 | **$0.12** | Structured Outputs（GPT-4o 以降の最新モデルが対象）[INFERENCE: モデルページにはこの機能の記載がない] | **`jp.api.openai.com` で JP の保存と処理が可能**（ただし営業経由で資格を得る必要あり。+10%）[FACT-o4] |
| OpenAI `gpt-6.1-terra` | 速く効率的。視覚推論・文章作成 | 1.00 / 5.00 | $1.20 | 同上 [INFERENCE] | JP は保存のみ（JP で処理できるのは luna だけ）[FACT-o4] |
| OpenAI `gpt-6.2-sol` | バランス型。日常業務の定番 | 2.00 / 10.00 | $2.40 | 同上 [INFERENCE] | 同上 |
| OpenAI `gpt-6.2-astra` | 最上位 | 8.00 / 40.00 | $9.60 | 同上（ガイドが新規案件に推奨）[FACT-o2] | 同上 |

参考: `gpt-5.6-luna` 0.20/1.20 → $0.28。`gemini-2.5-flash-lite`（旧世代・提供継続）0.10/0.40 → $0.10。2.5 Pro / 2.5 Flash は非推奨で、2026-12-01 に別モデルへ自動で切り替わる [FACT-g1, g2]。

## 2. 観点ごとの詳細

### (1) 厳密な JSON Schema による構造化出力

| | OpenAI [FACT-o2, o3] | Google Gemini [FACT-g3] |
|---|---|---|
| 有効化の方法 | `text.format: {type: "json_schema", strict: true, schema}`。Function calling でも可 | `response_format`: `mime_type: "application/json"` + `schema`（公式ページの表記どおり）。Pydantic / Zod も使える |
| 何が保証されるか | 拒否されず最後まで生成された出力は**スキーマどおりになる**。ただし拒否（`refusal`）は形式が崩れることがあり、出力上限で途中終了することもある | **「構文として正しい JSON」と書かれている。スキーマに完全に適合するとは明記されていない** |
| 必須の書き方 | すべての項目を `required` に入れ、すべての object に `additionalProperties: false` を付ける。省略可能な項目は `null` 型との union で表す | `required` は推奨（複雑さを下げるため） |
| 使えない・効かないキーワード | `allOf` / `not` / `if-then-else` / `dependent*`。ルートは object でなければならず、ルートに `anyOf` は使えない | `minLength` / `maxLength` / `min/maxProperties` / `uniqueItems` / `contains` は**エラーにならず黙って取り除かれる**ため、アプリ側で検証が必要 |
| 上限 | 項目数 5,000、ネストは 10 段、名前と enum の合計 120,000 文字、enum の値は合計 1,000 個 | 状態数・分岐・ネストの深さに上限がある（数値は書かれていない）。超えると `400 INVALID_ARGUMENT` |
| その他 | 新しいスキーマを使う最初の呼び出しだけ遅くなる。出力のキーはスキーマの順番どおり | 組み込みツールとの併用はプレビュー段階 |

[INFERENCE] 当社のスキーマで文字数の上限（maxLength など）に頼っている部分があれば、Gemini では効かないため、サーバ側の検証が必須です（既に検証しているなら影響はありません）。60/60 の適合は**実測しないと分かりません**。

### (2) 価格と 60 回の試算
§1 の表のとおりです。**12 月以降に価格が変わるもの**（Gemini 4 Carbon / Argon は 2026-12-01 から 2 倍、3.8 / 3.6 Flash は 2027-01-01 から 2 倍）は、本番の原価を変更後の価格で見積もってください [FACT-g1]。OpenAI の地域処理エンドポイント（2026-03-05 以降に出たモデル）は +10% [FACT-o1, o4]。

### (3) 日本語の品質
- [UNKNOWN] 今回の候補モデル（Gemini 4 系・GPT-6 系）の日本語評価を、公式資料と Nejumi Leaderboard の検索で探したが、見つからなかった（Nejumi 4 の公開記事は 2025 年のもので、これらのモデルは含まれない）。
- [INFERENCE] 判断は、当社の 60 回の評価（Schema 適合・インジェクション・6 観点の盲検による品質評価）を同じ条件で回して行うべきです。順位表の印象で決めないでください。

### (4) データの扱い

| | OpenAI | Google（Gemini Developer API / AI Studio） |
|---|---|---|
| 学習への利用 | **既定で利用しない**（明示的に同意した場合だけ。2023-03-01 から）[FACT-o5] | **有料（Paid Services）なら利用しない。無料枠は製品改善に使われ、人が読むこともある**。無料枠に個人情報・機密を送るのは禁止 [FACT-g4] |
| 保持 | 不正利用の監視のため最大 30 日。ZDR（保持なし）と Modified Abuse Monitoring は**事前承認が必要**（営業経由）。Responses API はアプリの状態を 30 日以上保持する（既定、または `store=true` のとき）。**`store` の既定値は確認できていない** [FACT-o5 / UNKNOWN] | 有料: ポリシー違反の検出と法的対応のために「限られた期間」記録する（**日数は書かれていない** [UNKNOWN]）。Search Grounding は 30 日 [FACT-g4] |
| データの所在 | 日本: `jp.api.openai.com` で保存・処理できるが、**JP で処理できるのは gpt-6-luna だけ**。営業経由で資格を得る必要があり、地域はプロジェクト作成時に固定 [FACT-o4] | Developer API 側に地域指定の記載なし [UNKNOWN]。**Vertex AI の `asia-northeast1` なら Gemini 3.8 Flash / 3.5 Flash などで JP 処理が保証される**（4 系・Flash-Lite 系は対象外）[FACT-g5] |
| DPA | データ利用のページに DPA の記載なし（BAA の記載はある）[UNKNOWN: 営業か法務のページで確認が必要] | 有料なら Google が処理者となる DPA が適用される [FACT-g4] |
| その他 | — | **18 歳以上が条件**。EEA / スイス / 英国の利用者向けは有料のみ（規約 2026-03-23 発効）[FACT-g4] |

### (5) ユーザーが用意するもの

| | OpenAI | Google |
|---|---|---|
| アカウント | Platform の Organization → Project → API キー（プロジェクトのサービスアカウントキーが推奨。有効期限を付ける）[FACT-o6] | AI Studio のプロジェクト（Google Cloud プロジェクト）→ API キー [FACT-g6] |
| 課金 | クレジットの前払い。**合計 $5 の購入で Build tier（月 $500 まで）**。Free tier（月 $100）もある [FACT-o7] | Cloud Billing を紐付ける。**Prepay は 1 回 $5 以上（クレジットは 12 か月で失効し、原則返金なし）** または Postpay。Tier 1 は月 $250 まで [FACT-g6] |
| 上限・監視 | ハードな支出上限、支出アラート、プロジェクト単位の上限 [FACT-o6] | 請求先アカウントの月額上限、プロジェクト単位の上限（実験機能。最大約 10 分の遅れで超過することがある）[FACT-g6] |
| 必須の注意 | ZDR や JP 処理を使うなら営業への連絡が先 | **無料枠のまま顧客のヒアリングデータを送らない**（学習に使われるため）。必ず請求先を紐付けた有料プロジェクトで使う |

## 3. 推奨（**ユーザーが決めてください**。新しい外部サービスで、継続費用がかかります）

**[DECISION 案 / ai-engineer] 次の 2 つを同じ評価セット（60 回、同じプロンプト、思考は低）に追加する**

1. **安い方の候補: Google `gemini-3.5-flash-lite`**（試算 $0.54 / 60 回）
   - 理由: 会議で Google の名前が出た。Stable である。公式が新規案件向けに推奨している。有料なら学習に使われない
   - 注意: Haiku 5.5（実測 $0.068）より単価は高い。maxLength などが効かず、スキーマ適合が保証されていない → **60/60 になるかは実測が必要**。さらに安い `gemini-3.1-flash-lite`（$0.35）も、同じ評価に 1 行追加するだけで比較できる
2. **品質の基準: Google `gemini-4-hydrogen`**（試算 $1.80 / 60 回。Sonnet 5.5 と同じ価格帯）
   - 理由: Stable で、公式が新規案件に推奨している。Carbon は 12/1 に 2 倍（$4.80）になり、Opus より高くなる

**別案（OpenAI も比べたい場合）: `gpt-6-luna`**（試算 $0.12 / 60 回。**Haiku に最も近い価格**、厳密なスキーマ保証あり、JP 処理の選択肢あり）。最安で通りそうな候補としては、こちらの方が有力です [INFERENCE: 価格とスキーマ保証の比較から]。会議で Google に限定する必要がないなら、1 を `gpt-6-luna` に置き換えることを勧めます。

評価を始める前に決めること（合否基準は先に書く。結果を見て緩めない）:
- 合格条件: Schema 60/60、インジェクション 0/30、p90 ≤ [TARGET] 20 s、6 観点の品質を盲検で Sonnet と比べて同等以上 [TARGET]
- 顧客のヒアリングデータを送るので、送る範囲（匿名化してよいか）を security-engineer と事前に確認する
- 評価の費用見込み: 上の 2 モデル（+ 3.1 Flash-Lite）で合計 約 $2.7 [INFERENCE: 思考トークンの分は含まない]

## 4. 出典（すべて 2026-11-24 に取得）

- [FACT-g1] Gemini 料金: https://aistudio.google.com/docs/pricing（ai.google.dev/gemini-api/docs/pricing から転送）
- [FACT-g2] Gemini モデル一覧: https://aistudio.google.com/docs/models
- [FACT-a] モデルページ: https://aistudio.google.com/docs/models/gemini-4-hydrogen 、 https://aistudio.google.com/docs/models/gemini-3.5-flash-lite 、 https://aistudio.google.com/docs/models/gemini-4-carbon （3.1 Flash-Lite / 3.8 Flash は Structured outputs のページの記載から [INFERENCE]）
- [FACT-g3] Gemini Structured outputs: https://aistudio.google.com/docs/structured-output
- [FACT-g4] Gemini API 追加利用規約: https://aistudio.google.com/docs/terms（2026-03-23 発効）
- [FACT-g5] Vertex AI のデータ所在: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/data-residency
- [FACT-g6] Gemini の課金: https://aistudio.google.com/docs/billing
- [FACT-o1] OpenAI 料金: https://developers.openai.com/api/docs/pricing
- [FACT-o2] OpenAI Structured Outputs: https://developers.openai.com/api/docs/guides/structured-outputs
- [FACT-o3] 同ページの supported schemas（上限）の節
- [FACT-o4] OpenAI のデータ所在: https://developers.openai.com/api/docs/guides/data-residency
- [FACT-o5] OpenAI のデータの扱い: https://developers.openai.com/api/docs/guides/your-data
- [FACT-o6] OpenAI の本番運用ガイド: https://developers.openai.com/api/docs/guides/production-best-practices
- [FACT-o7] OpenAI のレート制限と tier: https://developers.openai.com/api/docs/guides/rate-limits
- モデル一覧（OpenAI）: https://developers.openai.com/api/docs/models
- 日本語評価の検索: Nejumi Leaderboard 4 の公開記事（2025 年）https://ascii.jp/elem/000/004/315/4315408/ — 今回の候補モデルは含まれない

未検証: 実際の API 呼び出し（Schema 適合・レイテンシ・日本語品質）は未実施。他社のレイテンシは不明 [UNKNOWN]。3 社目は、明らかに関係する候補がないため追加していない。
