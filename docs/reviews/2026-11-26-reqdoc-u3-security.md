# セキュリティ確認: reqdoc U3（Rules の v3。edfe710）

- 日付: 2026-11-26 ／ 担当: security-engineer（読み取りのみ）／ 判定: **条件つき承認**（Critical・High 0）
- 確認した事実: aiDrafts はクライアントから書けない（`allow create, update, delete: if false`）。edited を書くのは callable `saveAiDraftEdits`（`validateEditableV3` の検査つき）と worker の削除だけ。`flags`（要確認の数字）は提出の写しに入らない。template は server が書いた値と一致させている

| # | 重大度 | 内容 | 対応 |
|---|---|---|---|
| T-01 | Medium | 提出の写し（requirements/current・approvals）に `evidence`（質問のキー名）・`by`・`added[].source='ai_added'` が入り、お客様が SDK・開発ツールで読める。画面では出さない（Q-8）だけ | **ユーザー決定 2026-11-26: 画面で隠すだけでよい（受容）**。個人情報は無く、キーはお客様自身が答えた質問の名前。設計書 §6.2 の「お客様に見せない」は「画面に出さない（データには入る）」と書き直す |
| T-02 | Medium | aiDrafts の 90 日削除の実行者が無い（v3 は 2〜3 倍） | docs/TODO.md で追跡。U3 を止めない |
| T-03 | Low | 版ごとに約 275KB の写しが approvals に増え、一覧の購読で全件を読む | docs/TODO.md: 一覧の件数を絞る・`proposal`/`answers` を単一フィールド Index の除外に |
| T-04 | Low | edited が無いと提出は評価エラー＝拒否（安全）。画面は保存してから提出する | U4 で保存→提出の順を守る |
| 必須の章 | — | 01・02・19・21（31 項目）が未確定なら提出を拒否 | 採用: `saveAiDraftEdits` が `submitReady.requiredOk` を同じ tx で書き、Rules の `proposalV3Ok` が確かめる（約 3 式）。実装中 |
