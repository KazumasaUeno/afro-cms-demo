# Code Review — live プロジェクト詳細（b30a398）＋ 要件定義書の配置調整（ce41d16）

- 日付: 2026-11-26 ／ 担当: code-reviewer（2 回起動。1 回目は途中で止まったように見えたため再起動、両方の報告を統合）／ 判定: 両方 **Approve with comments**（Blocker・Major なし）
- 方法: `git show` / `git grep`、旧 ProjectDetailPage と新 ProjectDetailView の描画部分の diff、展開物での test:unit（node_modules なしの環境差 2 件は親でも同じ）

| # | 重大度 | 指摘 | 対応 |
|---|---|---|---|
| 1 | Minor | LiveProjectDetailPage: approvals.useHistory の error を捨て「履歴なし」と区別できない | 修正 30604ed（読み込み中は RouteLoader、失敗は LoadError「承認の記録」） |
| 2 | Minor | liveProjectView にテストが無い | 修正 30604ed（src/live/projectView.ts へ切り出し、tests/unit/liveProjectView.test.mjs 4 件） |
| 3 | Minor | 「demo の DOM は同一」の証拠が無い | レビューの構造 diff で裏付け。ブラウザの目視はユーザー確認（:5181） |
| 4 | Minor | SitePreviewButton の採用前表示が重複 | 未対応（見た目に影響なし。次に触るとき） |
| 5 | Nit | ProjectDetailView の注記「hook を持たない」が事実と違う | 修正 30604ed |
| 6 | Minor | AiDraftReviewV3: 保存失敗の Note が canEdit で絞られていない | 修正 0eb64da（showSaveStatus で絞る＝旧挙動） |
| 7 | Minor | 生成中・保存中で依頼ボタンが押せない理由が出ない | 修正 0eb64da（APPROVAL_BLOCK_COPY を状態の行へ） |
| 8 | Minor | 「切り替えても編集が残る」テストが正規表現だけ | 未対応（描画テストの基盤なし。docs/TODO.md） |
| 9 | Nit | 表示モードで保留の欄が見えない（文言） | ui-ux-designer の判断待ち |
| 10 | Minor | dev サーバーが .emulator-login.local を配る | 修正 0eb64da（server.fs.deny に vite 8.3 の既定＋1。:5180 で 403 を確認） |

検証: wt-pd unit 158/158・tsc 0 ／ wt-u4 unit 157/157・tsc 0（1 回目は V8 の Zone OOM、再実行で 0。メモリ逼迫の一時事象）
