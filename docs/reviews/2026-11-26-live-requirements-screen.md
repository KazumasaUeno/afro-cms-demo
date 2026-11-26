# コードレビュー: live 要件定義を別画面に（b415d51）

- 日付: 2026-11-26 ／ 担当: code-reviewer（実装者とは別） ／ 対象: 3d44e03..b415d51（10 ファイル）
- 判定: **Approve with comments**（Blocker 0 / Major 0）
- 実行結果: typecheck exit 0、unit 104/104、build:live exit 0。eslint は flat-config 移行エラーで未実行。E2E・画面確認は未実施

## 確認済み
- メニューは各ロール 4 項目のまま（`liveNav.ts` は match のみ変更。テストで要件定義がメニュー先でないことを確認）
- 2 ルートとも RoleRoute + HearingGate（既存のヒアリングと同じ）。Rules 変更なし
- demo は `DATA_MODE==='live'` 分岐の外で不変
- draft 以外・フラグ off はヒアリング画面へ転送。ループなし。autoStart は一度だけ

## 指摘と対応
| 重大度 | 指摘 | 対応 |
|---|---|---|
| Minor | 新画面のロジック（転送・autoStart・戻る）をテストしていない | 未対応。ブラウザで確認する（qa へ渡す候補） |
| Minor | `AI_DRAFT_COPY.tabHearing/tabAi` が未使用 | 削除 |
| Minor | RequirementsPage の移動済みコードを説明するコメント | 1 行に整理 |
| Nit | HearingGate の空状態の文言が「ヒアリングは…」だけ | 「ヒアリング・要件定義は…」に |
| Nit | onMissing が flush しない（unmount で flush されるので可）／replace navigate で search を落とす | 未対応（今は無害） |
