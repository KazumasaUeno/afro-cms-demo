# デザイン AI の評価（prototypes/。本番 DB・認証・API に接続しない）

## 何を検証するか
LLM が案件ごとに **3 案 × 2 画面（トップ＋改善後サイトマップの主要ページ 1 つ）を、完結した HTML/CSS** で出せるか（2026-11-25 ユーザー決定: 出力は HTML）。
候補選びは `docs/design/DESIGN_AI_SELECTION_2026-11-25.md`。作り物の案件 6 件（`cases.mjs`。実在の会社・人物なし）だけを使う。

## 検証設計（着手前に固定。結果を見て緩めない）
| 仮説 | 指標 | 合否基準 [TARGET] | 本数 | 比較条件 | バイアス対策 |
|---|---|---|---|---|---|
| 上位モデルは、入力どおりで安全な HTML の 3 案を出せる | 機械の検査（下）・p90・費用 | 機械: 全回で合格（`checks.mjs` MACHINE_CRITERIA）／盲検: 5 観点の平均 ≥3.5 かつ現行テンプレートより上 かつ 2 名とも「3 案が見分けられる」 | 6 件 × 1 回 × モデル（n=6 回＝18 案）。**n=6 は傾向まで**。採用前に同設定 2 回目 | モデルだけ変える（プロンプト `PRM-DES-001@0.1.0`・入力・effort medium・max_tokens 64000 は同じ） | 盲検（出し手・案の順・ファイル名を伏せる）・決まった種で並べ替え・採点者 2 名は別ファイル |

機械の検査（1 画面ごと）: HTML の形（doctype・lang=ja・charset・viewport・タグの対応）／`<script>`・on* 属性・javascript:・外部 URL（http(s)://・//・@import・url()・link・外部画像・iframe・form action・# 以外の href）が 0／ブランド色（案件の `accent`）が CSS にそのまま／トップに CTA の語（q-cv）／日本語 30 字以上・文字化け 0／本文の文字色と背景のコントラスト ≥4.5（CSS から計算。gradient・読めない色は UNKNOWN として数え、目視へ）／1.5KB〜60KB／@media あり／入力に無い数字（参考）。1 回ごと: Schema・3 案の違い（配色とレイアウトの目安）・時間・費用。
**時間の基準**: §3.2 は「1 案 p90 ≤180 秒」。この道具は 3 案を 1 回で出すので「1 回 p90 ≤540 秒」と読んでいる（**解釈はユーザー確認待ち**。本番で 3 案を並列に呼ぶなら待ち時間は 1 案分）。

| ファイル | 役割 |
|---|---|
| `run-eval.mjs` | 実行（既定は dry-run＝通信 0・費用 0。`--go` で実 API）。`out/<実行日時>/` に summary.json・rows.json・html/・raw/・index.html |
| `cases.mjs` / `prompt.mjs` | 案件 6 件（製品と同じ入力欄）／プロンプト・出力 Schema（Anthropic・OpenAI strict・Gemini で共通の形） |
| `checks.mjs` / `evaluate.mjs` | 機械の検査・集計・合格基準／1 回の呼び出しと検査 |
| `clients.mjs` | Anthropic は `functions/node_modules` の既存 SDK（本番と同じ設定）、OpenAI / Gemini は `../ai-requirements-eval/providers.mjs` の既存アダプタ |
| `render-template.mjs` | **現行テンプレート**（`src/features/design/previews/*.tsx` の本物）を同じ 6 件で静的 HTML に（既存の vite / react で SSR。盲検の比較対象） |
| `gallery.mjs` / `shots.mjs` | 幅 375 / 1280 の iframe 一覧（sandbox）／Playwright があればスクショ（**このリポジトリには無いので一覧で見る**。依存は足さない） |
| `make-blind.mjs` / `score-blind.mjs` | 盲検の採点表（モデル＋テンプレート混在・key.json は伏せる）と集計 |
| `design-eval.test.mjs` | Stub だけのテスト（要求の形・読み取り・各検査の失敗見本・dry-run の通信 0・キー非表示） |

## 実行（PowerShell。リポジトリのルートで）
```powershell
git fetch origin; git switch proto/ai-design-eval
npm --prefix functions ci            # functions/node_modules に SDK が無いときだけ（既存の依存）
node --test prototypes/ai-design-eval/design-eval.test.mjs

# 1. dry-run（既定）: 送信本文と推定費用だけ。通信 0・費用 0
node prototypes/ai-design-eval/run-eval.mjs

# 2. キーを入れる（表示されない。評価専用キー）
$s = Read-Host -AsSecureString "ANTHROPIC_API_KEY"
$env:ANTHROPIC_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
Remove-Variable s

# 3. 実 API（上限 $15。安い Sonnet から）。429 が続くなら --concurrency 1
node prototypes/ai-design-eval/run-eval.mjs --go --cap 15
Remove-Item Env:ANTHROPIC_API_KEY

# 4. 現行テンプレート → 一覧 → 盲検
node prototypes/ai-design-eval/render-template.mjs
start prototypes/ai-design-eval/out/<実行日時>/index.html
node prototypes/ai-design-eval/make-blind.mjs              # 機械に合格したモデルだけ（見たいだけなら --models claude-opus-5-5）
#   blind/sheet.html を 2 名で採点 → scores-scorer1.csv / scores-scorer2.csv
node prototypes/ai-design-eval/score-blind.mjs out/<実行日時>
```
Gemini も回すなら `--models claude-sonnet-5-5,claude-opus-5-5,gemini-4-hydrogen`（`GEMINI_API_KEY`。有料プロジェクトのキーだけ）。

## 費用の見込み（6 件 × 2 モデル × 1 回 = 12 回。dry-run の出力と同じ）
| モデル | 単価 入力/出力 $/1M | 推定（1 回 入力 6k / 出力 40k） | 最悪（入力 8k / 出力 64k 全部） |
|---|---|---|---|
| claude-sonnet-5-5 | 2 / 10 | $2.47 | $3.94 |
| claude-opus-5-5 | 4 / 20 | $4.94 | $7.87 |
| 合計 | | **約 $7.4** | $11.8（上限 $15 の内） |

出力 40k は仮定（HTML 6 画面 × 約 15,000 文字＋思考）[見込み]。正は請求。道具は「累計＋次の 1 回の最悪」が `--cap` を超えるなら呼ばずに止まり、モデルごとに最初の 3 回がすべて失敗したら止まる。

## 実装した範囲 / していない範囲・既知の制限
- HTML の検査は依存なしの字句解析（ブラウザの解釈と同じではない）。コントラストは body / p の宣言（と body 直下の要素の地）だけ。画面の全要素は見ない
- 3 案の違いは目安（配色の距離とタグ・レイアウト値の Jaccard）。正は盲検
- テンプレートは端末ごとに描き分ける部品（phone 390px / pc 1280px）なので幅ごとに別ファイル。書体は端末の書体（アプリの @fontsource は使わない。AI 案も同じ条件）
- 画像生成（案 b）・トークン JSON の別出力・本番の functions への組み込みは範囲外
- 構造化出力の Schema に長さ・件数の制約は入れていない（各社で非対応があるため）。3 案・色の形はコードで検査

## ステータス / 次のアクション / 期限 / 担当
検証中（2026-11-25 作成）。次: ユーザーが dry-run → `--go`（2026-11-26 のレビュー前）→ 機械の結果と一覧をレビューに出す → 盲検 2 名（担当未定）。結果の集計は `docs/design/DESIGN_AI_EVAL.md` へ（ai-engineer）。
