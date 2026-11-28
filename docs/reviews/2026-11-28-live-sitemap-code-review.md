# コードレビュー: live のサイトマップ（AI 下書き＋お客様承認）

- 日付: 2026-11-28 ／ 担当: code-reviewer（読み取りのみ）。この文書は、レビューの指摘を修正の担当がまとめ直したもの（指摘の本文は code-reviewer の報告による）
- 対象: `feat/live-sitemap` の INT（`b05ed4f`）と `origin/main` の差分
- **判定: Request changes**（Major 1・Minor 3・Nit 1。別の経路の LOW 1）
- 同じ日の QA（`2026-11-28-live-sitemap-qa.md` D-1・O-1・O-2）とセキュリティ監査（`2026-11-28-live-sitemap-security-audit.md` L-1・L-3）の指摘も、同じ修正の回でまとめて直した

## 1. 指摘

### Major — 通信の失敗の後の再保存が、自分の保存と競合する

- `src/live/sitemap.ts:247-275` `createSaveQueue`: 競合以外の失敗でも `seq = null` に戻していた。次の保存の基準は `base()`（`:325` `() => opened`）になる
- `opened` は、手元に変更がある間は開いた時点の `internal.editSeq` のまま（`src/live/pages/LiveSitemapPage.tsx:89`）
- 起きること: 5 で開く → 保存できる（6）→ 次の保存が通信で失敗 →「もう一度保存」が基準 5 で送られる → サーバーは 6 なので競合 → 手元の変更を捨て、「ほかの人が先に保存しました」と出る（自分で競合し、編集が消える。基準の並び [5, 6, 5]）

### Minor

1. `functions/src/ai/sitemapTask.ts:145,163`: 開始のときに job が別の依頼へ置き換わっていても `stale` を返すだけで、自分の予約（案件の枠・利用者の枠・全体の回数）を戻さない。書き込み時の経路（置き換わった → 自分の予約だけ戻す `fenced`）と揃っていない。ログも info だけ
2. `functions/src/ai/sitemapTask.ts:261` と `src/live/sitemap.ts:129`: 作り直しが前の成功の後に失敗すると、前の結果を残すため state は `ready` のまま `lastError` が付く。画面は `state === 'failed'` しか見ないため、失敗が出ない。結果を internal へ反映しなかった成功（`kept`。`generated.applied = false`）も、画面に何も出ない
3. `src/live/repositories.tsx:672`: 保存のまとめ（`siteSavers`）がモジュールの中の Map で案件 ID だけを鍵にしており、ログアウトや別の人でのログインで残る（前の人の基準・失敗・待ちを使いうる）

### Nit

- `functions/src/ai/sitemapRequest.ts:158`: job の `regenerate` は書くが、worker が読んでいない（使わない値）

### LOW（別の経路・今回は変えない）

- `functions/src/ai/request.ts`（要件定義書）: `reservedDay` を TX の中で決めるが、試行の先頭で空に戻さない。TX が再試行されると、予約していない試行でも enqueue が走りうる（タスク ID が requestId なので `task-already-exists` で止まる [INFERENCE]）。**Do Not Change now**（`docs/TODO.md` に記録）

## 2. 修正したもの（2026-11-28）

| 指摘 | 対応 | 変えた所 | 回帰テスト |
|---|---|---|---|
| QA D-1（High）理由の無いページ・現在の図のページが保存できない | 直した。画面は callable へ送る前に、サーバーの保存の形と同じ項目で組み直す（`undefined` のキーを送らない）。サーバーは `reason: null` を「理由なし」と扱う（古い画面からの保存も通す。数値などの誤った型は引き続き拒否。保存の形に null を残さない） | `src/shared/ai/sitemapRules.ts`（`cleanSitemapDiagram`・reason の null）、`functions/src/sitemap/version.ts`（`cleanDiagram` は共有の関数を使う）、`src/live/sitemap.ts`（`sitemapSaveInput`）、`src/live/repositories.tsx` | unit: SDK と同じ encode（undefined → null）を通しても検査に通る、`reason: null` を拒否しない。functions: `reason: null` の図を保存でき、保存の形に null が無い・数値は拒否 |
| Major 自分の保存と競合する | 直した。競合以外の失敗では最後に書けた editSeq を残す（競合のときだけ呼び出し側が reset で戻す）。基準は `max(opened, saved)` | `src/live/sitemap.ts`（`createSaveQueue`・`createSitemapSaver`） | unit: 成功 → 通信の失敗 → もう一度保存の基準が [5, 6, 6]・誤った競合を出さない（修正前は失敗することを確認） |
| Minor 1 開始時の置き換わりで予約が戻らない | 開始の TX で検出した場合は、書き込み時と同じく job に触らず自分の予約だけ戻す（`fenced`・warn `ai-replaced`）。最初の読み取りで既に置き換わっていた場合は、予約した日・利用者が上書き済みで戻せないため、warn `stale`・`ai-replaced-unrefunded` で数えられるようにした（**未解決**。`docs/TODO.md`） | `functions/src/ai/sitemapTask.ts` | functions: 開始の TX の直前に置き換わる → 予約が戻る・他人の job を閉じない・AI を呼ばない。最初の読み取りで置き換わり済み → warn |
| Minor 2 作り直しの失敗・kept が画面に出ない | 直した。失敗は `state === 'failed'` か `lastError` があるとき（成功は `lastError` を消す）。`kept` は注記を出す（文言は仮。ui-ux-designer の確認待ち） | `src/live/sitemap.ts`（`sitemapAiDraftOf`）、`src/features/sitemap/liveSitemapUi.ts`（`SITEMAP_AI_TEXT.kept`）、`src/live/pages/LiveSitemapPage.tsx` | unit: ready＋lastError → failed、applied=false → kept、依頼中は出さない |
| Minor 3 保存のまとめがログアウト後に残る | 直した。鍵を利用者＋案件にし、`LiveDataProvider` が外れる（ログアウト）ときに全部 reset して空にする | `src/live/sitemap.ts`（`createSaverRegistry`）、`src/live/repositories.tsx` | unit: 別の人は別のまとめ・clear で待ちと予約を捨てる |
| QA O-1「要件定義書の案から作成しました」が手で作った版にも出る | 直した。AI が作った版（`origin === 'ai'`）だけに出す | `src/live/sitemap.ts`（`sitemapFromRequirements`）、`src/live/pages/LiveSitemapPage.tsx` | unit |
| sec L-3 コードブロックの中の `AI-SCOPE:` 行を数える | 直した。``` / ~~~ の中は数えない（閉じないブロックの中も） | `scripts/deploy-firebase.mjs`（`hasAiScopeLine`） | `tests/rules/deploy-guard.test.mjs` に 4 件 |
| sec L-1 新 worker の invoker の手順が無い | Runbook と TODO に追記（`afro-cms-functions@` へ `roles/run.invoker`。`allUsers` には付けない。`get-iam-policy` で確認） | `docs/operations/RUNBOOK_FIREBASE.md` §6.2、`docs/TODO.md` | なし（手順。実施は platform-engineer） |
| Nit `regenerate` を使わない | 変えていない（job に残すのは記録として害が無い。消すなら依頼と worker のテストを揃えて別の回に） | — | — |
| LOW `reservedDay` | 変えていない（Do Not Change now）。`docs/TODO.md` に記録 | — | — |
| QA O-2 お客様 320px のはみ出し（既存・ProposalView） | 変えていない。`docs/TODO.md` に記録 | — | — |

再レビュー: 上の修正の差分だけを code-reviewer が確認する（Major を直したため）。
