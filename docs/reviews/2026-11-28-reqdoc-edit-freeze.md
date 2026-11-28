# 2026-11-28 要件定義書（AI 下書き v3）の編集で入力が固まる ／ ?project= で白い画面

対象: `fix/reqdoc-edit-freeze`（起点 76a4c37 = origin/main = 本番 0.51.2）。デプロイしていない。

## 1. 症状（2026-11-27 本番）

- 不具合 1: 本番の要件定義書（AI 下書き v3・約 27 章の長い文書）を「編集」にすると、1 文字ごとに 30〜60 秒止まった。
  ただし、利用者の Chrome を claude-in-chrome 拡張機能で操作していたときの観察なので、拡張機能が（一部の）原因の可能性がある
- 不具合 2: live で `?project=<id>` の付いた URL が白い画面になった（root が空・コンソールのエラーなし）。正確な URL は不明

## 2. 再現の条件（拡張機能なし）

- エミュレータ（demo-afro-cms）: `npm run emulators` → `node scripts/seed-emulator.mjs` → `--set-password`（環境変数のテスト用の値。表示していない）→ `node scripts/seed-emulator-reqdoc.mjs --with-dev`
  - 案件 `projects/reqdoc-v3-draft`: 項目 129（proposed 87 / na 5 / open 5 / std_pending 32）・AI追加 2。編集で入力欄 126（textarea）
  - 画面のフラグ: worktree の `.env.emulator.local` に `VITE_FEATURE_AI_REQUIREMENTS=on`（gitignore 済み。無いと要件の画面はヒアリングへ転送される）
- 画面: `npm run build:emulator` → `npx vite preview --mode emulator --port 4173`（本番と同じ production の React）
- ブラウザ: headless Chrome 158（`--headless=new`・使い捨てのプロファイル・`--disable-extensions`）を CDP で操作。1280×900
- 操作: 管理者でログイン → `/ai-studio/requirements` → 「編集」→ 中ほどの入力欄（「不採用の理由」）にフォーカス → CDP `Input.insertText` で 1 文字ずつ「あ」を入れる
- 1 文字の時間: 入れる直前の `performance.now()` から、次の 2 フレーム（requestAnimationFrame 2 回）までの時間。何も入れないときの同じ計測（フレーム待ちだけ）は 約 32ms
- 1 文字あたりの内訳: CDP `Performance.getMetrics` の差分（ScriptDuration・LayoutCount 等）を文字数で割った値
- 描き直した部品の数: `__REACT_DEVTOOLS_GLOBAL_HOOK__` の代わりを先に入れ、commit ごとに「この commit で描いた関数・クラス部品」を数えた（描き直していない部分木には入らない）

## 3. 計測（修正前 → 修正後）

| 条件 | 1 文字の時間 中央値（p90 / 最大） | Script / 1 文字 | Layout の回数 / 1 文字 | 描き直した部品 / 1 文字 |
|---|---|---|---|---|
| 修正前・CPU 等倍（10 文字） | **248ms**（294 / 294） | 194ms | 214 | 12,743 |
| 修正後・CPU 等倍（20 文字） | **48ms**（65 / 96） | 35ms | 18 | 3,199 |
| 修正前・CPU 4 倍遅延（10 文字） | **2,913ms**（4,668 / 4,668） | 2,881ms | 470 | 25,519 |
| 修正後・CPU 4 倍遅延（20 文字） | **279ms**（476 / 509） | 232ms | 18 | 3,199 |

- 計測日 2026-11-28・このPC（Windows 11）・上記の条件。CPU 4 倍遅延は CDP `Emulation.setCPUThrottlingRate`（遅い PC の目安）
- 拡張機能なしでも 1 文字 248ms（100ms を超える）。遅い PC 相当では 1 文字 約 3 秒で、入力が詰まると保存の状態の描き直しも重なって長くなる（4 倍遅延の修正前は commit 31 回／10 文字）
- 本番で見えた 30〜60 秒は、この計測では再現していない。[INFERENCE] 1 文字ごとの全体の描き直しと 214 回の強制レイアウトに、拡張機能（ページの変化を読む）の処理が重なって伸びた。拡張機能ありの計測はしていない（UNVERIFIED）

## 4. 原因（RCA）

- 直接原因: v3 の編集の欄が、1 文字ごとに全部描き直されていた
  - `src/features/requirements/aiDraft/useAiDraft.ts:190` `update` → `setLocal(next)` で `AiDraftReviewV3` 全体が描き直される
  - `src/features/requirements/aiDraft/ReqDocV3Edit.tsx`（修正前 46・75・109 行）の `ItemEditCell`・`AddedEditCell`・`NotesEditCell` は、文書全体を持つ `edit`（`edit.local`）を受け取っていたため、1 欄の変更でも 126 欄すべてが描き直された
  - 各欄は MUI の複数行 `TextField`（TextareaAutosize）で、描くたびに高さを測る（強制レイアウト）。1 文字あたり Layout 214 回はこれ
- 根本原因: 欄が「文書全体を基に新しい文書を作る」作りだった（`edit.onChange(setItem(edit.local, …))`）。この形では欄を memo で包むと、描き直さなかった欄の onChange が古い文書で他の欄の入力を消すため、memo できなかった。項目が 129 に増えた v3 で初めて効いた（v2 は欄が最大 約 36）
- 事前に検出できなかった理由: 性能の確認が無かった（テスト漏れ）。v3 の QA は表示・保存の正しさだけで、長い文書での入力の速さを計っていなかった

## 5. 修正（見た目は変えない）

- `src/features/requirements/aiDraft/latestApply.ts`（新規）: `makeLatestApply` — 欄の変更を「最新の文書に当てる関数」として受け取り、ref の最新の文書に当てる。どの描画で作った onChange でも同じ結果になる
- `src/features/requirements/aiDraft/ReqDocV3Edit.tsx`: `ItemEditCell`・`AddedEditCell`・`NotesEditCell` を `React.memo` で包み、自分の値（項目・AI追加・特記事項の文字）と `readOnly`・`flags`・`apply` だけを渡す。`useReqDocChaptersEditor` が `apply` を作る。AI追加の削除も `apply` で当てる
  - memo の前提: `setItem`・`setAdded`・`setNote` は変えた 1 件以外の参照をそのまま残す（テストで確認）
- 変えていないもの: 表示・文言・並び・保存の動き（`useAiDraft`）・サーバー・Rules・表紙／要約／改善ポイントの欄（数が少ないので今のまま）・v2 の編集
- 見た目が同じことの確認: 同じ seed・1280×900 で「編集」を開いた `main` の HTML（React の useId を正規化）とスクリーンショットを修正前後で比べ、**HTML 443,307 文字の sha256 が一致・PNG の sha256 も一致**

## 6. 動作の確認（修正後・エミュレータ）

- 別の章の 3 項目と特記事項 1 か所に続けて入力 → 画面の 4 欄がすべて残る。送った保存の 1 回の中身に 4 つとも入っている（`saveAiDraftEdits` への fetch を記録して確認）
- 項目の状態を「未確定」に切り替え → AI追加の項目名に入力 → 別の項目に入力 → 画面で 3 つとも残り、保存の中身にも入っている（未確定 5 → 6）
- 参考（修正とは無関係・修正前も同じ）: エミュレータの seed の edited は、サーバーの検査で `points[1].evidence` が不正として拒否される（`functions/lib/ai/reqDocEditable.js` の validateEditableV3 で確認）。このため seed のままでは保存が「形式が正しくない」で失敗し、再読み込み後の値は確認できない。保存の中身（送った値）までを確認した。サーバーの機能スイッチは確認のあいだだけ worktree の `functions/.env.local` を internal・allowlist に seed の 2 件・版 3 にし、終わってから元に戻した

## 7. テスト

| コマンド | 結果 |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run test:unit` | **175 件中 175 pass**・fail 0（追加 4 件: `tests/unit/reqDocEditMemo.test.mjs`） |
| `npm run build`（demo） | exit 0 |
| `npm run build:live` | exit 0（この worktree に `.env.live.local` が無いため、`VITE_FIREBASE_*` は架空の値を環境変数で渡してビルドだけ確認。出力 `dist-live` は消した） |
| `npm run test:rules` | 未実施（Rules・functions は変えていない） |

- 追加テストは修正前に失敗することを確認した: 修正前の `ReqDocV3Edit.tsx` では「行の欄は memo で、文書全体を受け取らない」が fail（4 件中 3 pass / 1 fail）、`latestApply.ts` が無い状態ではファイルの読み込みで fail
- 追加テストの中身: memo の前提（1 件の変更で他の参照が変わらない）／古い描画の onChange が他の欄の入力を消さない（A→B→A の順で A2・B1 が残る）／commit は最新の関数を呼ぶ／ソースの形（3 つの欄が memo・`edit=` を渡さない・`edit.onChange(setX(edit.local…` が無い）

## 8. 横展開

- v2 の編集（`AiDraftEditor.tsx`）: 同じ形（`ai.update({ ...local, … })` で全体を描き直す）。欄は要約 1・改善ポイント最大 6×3・下書きの欄・未確定事項 最大 10 で 約 36 まで。[INFERENCE] v3 の 4 分の 1 程度で、計測はしていない。今回は変えていない
- `ProposalV2Body`: 表示だけ（入力なし）。v3 の編集では描かない
- 残り（修正後も 1 文字ごとに描き直す 約 3,200 部品）: v3 の表紙・要約・改善ポイントの欄（`AiDraftReviewV3.tsx`）と、章の表示の行（`ReqDocChapters.tsx`）。CPU 4 倍遅延で 1 文字 279ms。遅い PC で足りなければ、章ごとの memo が次の手（今回は入れていない）

## 9. 不具合 2（?project= で白い画面）— 再現しなかった（UNVERIFIED）

エミュレータのビルド（`--mode emulator`・本番と同じ production の React）と demo のビルド（`vite preview`）で、5 秒待って root の中身・見出し・コンソール・Log を確認した。どれも白い画面にならず、エラーも出なかった。

| ログイン | URL | 結果 |
|---|---|---|
| 管理者 | `/?project=p1`・`/?project=reqdoc-v3-draft`・`/design-preview?project=p1`・`/design-preview?project=reqdoc-v3-draft&mode=site`・`/requirements?project=p1`・`/portal/approvals?project=p1` | `/dashboard` へ転送して表示（live に該当の画面が無い URL は役割のホームへ） |
| 管理者 | `/ai-studio/requirements?project=reqdoc-v3-draft`・`/ai-studio?project=…`・`/projects?project=p1` | 白くならない（5 秒の時点で画面の枠＋読み込み中の表示。root は空でない） |
| 開発者 | `/?project=p1`・`/design-preview?project=p1`・`/requirements?project=p1` | `/dev` へ転送して表示 |
| 開発者 | `/dev/requirements?project=reqdoc-v3-draft` は要件定義書を表示・`/dev/projects?project=p1` は画面の枠＋読み込み中（root は空でない） |
| 未ログイン | `/?project=p1`・`/design-preview?project=p1`・`/requirements?project=p1` | `/login?next=…` を表示 |
| demo（未ログイン） | `/design-preview?project=p1`・`?project=p3&mode=site`・`?project=nope` | デザインの見本を表示。`/?project=p1`・`/requirements?project=p1` は demo のログイン |

- live のコードで `?project=` を読むのは demo の `DesignPreviewPage` だけ（`src/features/design/DesignPreviewPage.tsx:26`）。live のルートに `/design-preview` は無い
- 確認していないこと: お客様（client）のアカウント（この版の seed に無い）、本番の Hosting（`X-Frame-Options: DENY`・`frame-ancestors 'none'`。iframe の中で開くと白くなる）、拡張機能ありの Chrome。推測で直していない

## 10. 未確認（UNVERIFIED）

- 本番の 30〜60 秒そのものの再現（拡張機能ありの計測をしていない）
- 本番・お客様の PC での修正後の速さ（デプロイしていない）
- 不具合 2 の URL と原因

## コードレビュー（code-reviewer・2026-11-28）

判定: コメント付き承認（Blocker 0 / Major 0）。

| # | 重大度 | 指摘 | 対応 |
|---|---|---|---|
| 1 | Minor | 表紙（ReqDocV3Edit.tsx CoverFields）と改善ポイント（AiDraftReviewV3.tsx setPoint）が描画時点の文書から作り直している（今は memo していないので実害なしだが、apply と続くと片方が消える型） | 対応: `useReqDocChaptersEditor` が `apply` も返し、表紙・要約・改善ポイントも `apply` で当てる。ソース確認の単体テストを追加 |
| 2 | Minor | 「1 欄の入力で他の欄が描き直されない」の描画テストが無い（RTL・jsdom 無し。配線はソースの正規表現） | 見送り: 依存を増やさない（CLAUDE.md 1.10）。計測（上の表）で補う。次に Focused E2E を作るときに入れる |
| 3 | Minor | ReqDocV3Edit.tsx:157-160 描画中に ref へ書く・useAiDraft の latest と ref が 2 つ | 受容: transition を使っていない。1 つにまとめるのは useAiDraft の公開 I/F を変えるので今回はしない |
| 4 | Nit | ReqDocV3Edit.tsx:62, :91 中間の `edit = {...}` | 見送り |

修正後: typecheck 0 ／ test:unit 176/0/0 ／ build 成功。修正後の画面での再計測は未実施（変更は表紙・要約・改善ポイントの onChange の当て先だけで、描画の範囲は変えていない）。
