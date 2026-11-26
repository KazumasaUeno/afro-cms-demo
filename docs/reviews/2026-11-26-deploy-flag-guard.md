# コードレビュー: hosting デプロイの AI フラグ確認（fix/deploy-flag-guard）

- 日付: 2026-11-26 ／ 担当: code-reviewer（実装者とは別）／ 判定: Approve with comments（Blocker 0）
- 実行結果: deploy-build + deploy-guard 29/29（修正後 32/32）。build:live の実機で internal は通過・シェルの VITE_FEATURE_AI_REQUIREMENTS=off で作ったビルドは中止を確認

| 重大度 | 指摘 | 対応 |
|---|---|---|
| Major | 送る時の .env.live.local だけを見ていて、焼き込まれた値を見ていない（ビルド後の書き換え・シェルの環境変数・他の .env） | 対応: `vite.config.ts` の buildMeta が `dist-live/build-meta.json` に焼き込んだ値を書き、`checkBuiltAiFlag` が一致しなければ止める |
| Minor | `raw.trim()` で `" internal "` が通るが画面は off と解釈 | 対応: 完全一致に |
| Minor | コメント・単引用符・export のテストが無い | 対応: 3 ケース追加 |
| Nit | 180 秒の根拠（実測なし） | 未対応: 読み込み時間を測れたら見直す（docs/TODO.md 候補） |
