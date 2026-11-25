# AI 要件提案の評価（prototypes/。本番 DB・認証・API に接続しない）

合成ヒアリング 20 件（`hearings.mjs`）を、本番と同じプロンプト（PRM-REQ-001）・同じ出力 Schema・同じ後検証
（`functions/lib/ai` の `generateDraft` → `validateOutput` → `postprocess`）に通し、機械の基準を `summary.json` に出す。
合格基準は `docs/design/AI_REQUIREMENTS_EVAL.md` / 設計 §5.5 で事前に固定（結果を見て緩めない）。

| ファイル | 役割 |
|---|---|
| `run-eval.mjs` | 実行（既定は dry-run。`--go` で実 API） |
| `providers.mjs` | Provider アダプタ（Anthropic = 本番の SDK クライアント／OpenAI = Responses API／Gemini = generateContent。後二者は global fetch） |
| `pricing-providers.json` | 他社の単価（出典 URL と確認日つき）。本番の `functions/src/ai/pricing.json` は変えない（メモリ上で足すだけ） |
| `providers.test.mjs` | Stub の fetch で送信の形・応答の読み取り・失敗の種別・キーの非表示・dry-run の通信 0 を確かめる |
| `make-blind.mjs` / `score-blind.mjs` | 盲検の採点表と集計（変更なし。`summary.json` の形は同じ） |

Provider はモデル名の先頭で決まる（`claude-` / `gpt-` / `gemini-`）。`--provider anthropic|openai|gemini` で上書き。

## OpenAI / Google Gemini を同じ条件で回す

### 1. 用意するもの（ユーザー。新しい外部サービス・継続費用なのでユーザーが決める）

| | OpenAI（`gpt-6-luna`） | Google（`gemini-3.5-flash-lite`） |
|---|---|---|
| どこで | platform.openai.com → Organization → Project（評価専用）→ API keys | aistudio.google.com → プロジェクト（Google Cloud プロジェクト）→ API キー |
| 課金 | クレジットを前払い（$5 から） | **Cloud Billing を紐付けた有料プロジェクト**（Prepay $5 から、または Postpay）。**無料枠のままでは送らない**（無料枠は学習・人の閲覧に使われる） |
| 上限 | Project の支出上限・アラートを $5 程度に | 請求先の月額上限・予算アラートを $5 程度に |
| 環境変数 | `OPENAI_API_KEY`（`sk-` で始まる） | `GEMINI_API_KEY`（`AIza` で始まる） |
| 評価後 | キーを失効させる | キーを削除する |

キーは画面・ファイル・チャットに貼らない。下の `Read-Host -AsSecureString` で、そのウィンドウの環境変数にだけ入れる。

### 2. 実行（PowerShell。リポジトリのルートで）

```powershell
npm run build:functions
node --test prototypes/ai-requirements-eval/providers.test.mjs

# dry-run（既定）: 予定の呼び出しと推定費用を出すだけ。通信 0・費用 0
node prototypes/ai-requirements-eval/run-eval.mjs --models gpt-6-luna,gemini-3.5-flash-lite

# キーを入れる（表示されない）
$s = Read-Host -AsSecureString "OPENAI_API_KEY"
$env:OPENAI_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
$s = Read-Host -AsSecureString "GEMINI_API_KEY"
$env:GEMINI_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
Remove-Variable s

# 実 API（安い順）。各モデル 20 件 × 3 回
node prototypes/ai-requirements-eval/run-eval.mjs --go --models gpt-6-luna,gemini-3.5-flash-lite

# 終わったらキーを消す
Remove-Item Env:OPENAI_API_KEY, Env:GEMINI_API_KEY

# 盲検の採点表（機械の基準を満たしたモデルだけ。結果のフォルダは out/<実行日時>）
node --experimental-strip-types prototypes/ai-requirements-eval/make-blind.mjs
```

片方だけ回すときは `--models gpt-6-luna` のように 1 つだけ書く（要るキーもその社の分だけ）。

### 3. 費用の見込み（3 回 × 20 件 = 各 60 回）

| モデル | 単価 入力 / 出力 $/1M | 60 回の推定（1 回 入力 5k / 出力 3k） | 60 回の最悪（1 回 28k / 12k） |
|---|---|---|---|
| `gpt-6-luna` | 0.10 / 0.50 | **$0.12** | $0.53 |
| `gemini-3.5-flash-lite` | 0.30 / 2.50 | **$0.54** | $2.30 |
| 合計 | | **約 $0.66** | $2.83 |

- 推定は思考（推論）トークンの増分を含まない。思考は出力として課金されるので、実額は推定より増えうる [INFERENCE]。正は各社の請求
- 道具は推定の累計が $25 に届く前に止まる。各モデルの最初の 3 回がすべて失敗したら（キー・課金・モデル名の誤り）その場で止まる

### 4. 失敗したとき

- `upstream/401`・`upstream/403`: キーの誤り・失効、または課金の未設定
- `upstream/400`: 要求の形の誤り（Schema の非対応キーワード・思考レベルの非対応など）。表示される理由（キーは伏せ字）を ai-engineer に渡す
- `rate_limited/429`: 上限・クォータ。時間をおいて再実行
