# Code Review — 管理者の権限と代理承認（b5de514..3afd697）

- 2026-11-26 ／ code-reviewer: **Approve with comments**（Blocker なし）／ security-engineer 実装後監査: APPROVE WITH CONDITIONS（threat-model の §7）／ Codex（DEEP, 41 files）: P2 1 件
- 実行（reviewer）: tsc 0・unit 169/169・rules 8 ファイル 552/552（3afd697 の展開物・別ポート）

| # | 出所 | 重大度 | 指摘 | 対応 |
|---|---|---|---|---|
| 1 | code-review Major ／ security A-1 | Major | 画面が全ての承認記録に actorRole を付ける → 旧 Rules のまま Hosting を出すと確認依頼・差し戻し・承認が全件失敗 | RUNBOOK §6 に「Rules → Functions → Hosting、戻しは Hosting → Rules」。リリースはこの順 |
| 2 | Codex P2 | P2 | 代理承認のダイアログを開いた後に差し戻し・再提出されると、見ていない版を承認できる | 修正: ダイアログを開いた時点の analyzedAt を渡し、トランザクションで一致を確かめる（`proxyVersionOk`・unit 1 件） |
| 3 | code-review Minor | Minor | お客様の承認と代理承認がぶつかると、負けた側も「承認しました」 | 修正: 既存の記録の proxy が違えば「すでに〜が承認」と出す |
| 4 | code-review Minor | Minor | TEST-10 の 3 組が守りを 2 つ同時に外す変異 | 未対応（任意。二重の守りの片方だけの変異は次に Rules を変えるとき） |
| 5 | security A-2 / A-3 | Low | 差し戻し note の制御文字・代理承認の参照回数の計測 | docs/TODO.md |
| 6 | code-review Nit | Nit | 担当外の開発者の readOnly が true に（実際には起きない） | 対応なし |
| 7 | security | LEGAL | 代理承認の法的な有効性 | docs/TODO.md（LEGAL REVIEW REQUIRED） |
