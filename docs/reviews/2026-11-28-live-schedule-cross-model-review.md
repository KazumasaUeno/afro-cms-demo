# 別系統モデルレビュー — live スケジュール（2026-11-28）

- 対象: `feat/live-schedule`（origin/main 76a4c37 からの差分 56 ファイル。DEEP 自動判定）
- 道具: `scripts/codex-review.sh`（体制側。差分を標準入力で渡す）。記録 ID `2026-11-28-base-76a4c37-dk5x`（round 1: 全範囲、round 2: 修正差分のみ）
- 先に内部レビュー済み: code-review（Request changes → f340560）、security 事後監査（AWC）、QA（13/14 → D-1 修正 d46d4e1 → 2026-11-28 再確認で全 PASS）

| ID | 重大度 | 指摘 | 判定 | 対応 | round 2 |
|---|---|---|---|---|---|
| R001 | P1 | `firestore.rules` validInternal: marks を省略・`deleteField()` すると marksOk を通らず、完了印の記録が一括で消せる | 採用（画面からは起きないが、Rules が唯一の境界） | `marksOk(d.get('marks', {}), bm, cw)` に変更。Rules テスト「marks 全体を消す → 拒否（devA・admin）」「marks の無い internal でメモ保存 → 許可」を追加 | fixed |
| R002 | P2 | markOk の undone 分岐が「更新前に完了していた」ことを確かめない。未完了の行に解除の記録を作れる | **見送り（LOW として受容。lead-architect 2026-11-28）** | 書けるのは担当開発者・管理者（本人の uid と今の時刻に限る）。変わるのは最後の解除の記録だけで、current の完了状態・お客様の見る値は変わらない。直すと更新前の current の get が 1 回増え、Rules の式数（UK-2）を圧迫する。`docs/TODO.md` に記録 | not_fixed（受容） |
| R003 | P2 | `WbsSection.tsx` 編集ダイアログを開いている間に token が最新へ追従し、古い行の値で他の人の変更を上書きできる | 採用 | ダイアログを開いている間は token を固定（`!editing`）。ソース確認の単体テスト | fixed |
| R004 | P2 | `repositories.tsx` submit が待った保存の失敗を見ずに承認依頼へ進む | 採用 | `pendingSaveFailed`（liveScheduleUi.ts）で失敗なら依頼を止める。単体テスト（挙動＋配線） | fixed |

検証（2026-11-28・修正後）: typecheck 0 ／ unit 212/0/0 ／ rules 1057/0/0（emulator・変異テスト込み）／ rules:check OK ／ build・build:live 成功。functions は変更なし（前回 243/0/0）。画面: 修正 R003・R004 の画面での再現確認は未実施（単体テストのみ）
