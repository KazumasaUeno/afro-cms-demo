# セキュリティ: 受容したリスク

権限の境界は `firestore.rules`（設計: `docs/design/BACKEND_FIREBASE.md` §8・§26・§28）。ここには**分かっていて受け入れたリスク**と、その条件だけを書く。

## R-2026-11-10-01: `npm audit` の high（`@grpc/grpc-js`。firebase 13.2.0 の依存）

| 項目 | 内容 |
|---|---|
| 状態 | **受容（条件つき）**。判断: security-engineer（設計書 §28.9 判断 (2)、2026-11-10） |
| 指摘 | `npm audit` が `@grpc/grpc-js`（`firebase` 13.2.0 経由）を high と報告 |
| 受容の理由 | gRPC のサーバ側の問題で、ブラウザ用の SDK は webchannel を使い grpc-js を同梱しない [INFERENCE]。grpc-js を使うのは Node 上の `@firebase/rules-unit-testing` からローカルのエミュレータ（`demo-afro-cms`）への接続だけで、外部の入力を受けない。`overrides` で版を上げるとその経路を壊しうるうえ、本番のブラウザには効かない |
| 入れないもの | `package.json` の `overrides` |

### 条件（1 つでも満たさなくなったら受容を取り消して対応する）

1. **live ビルドに grpc が入っていない**: B（live ビルド）の後に `grep -rl grpc dist-live` が 0 件であることを確認し、日付つきでこの表に追記する（demo の `dist` は Firebase 導入前のビルドで 0 件 [FACT] 2026-11-10）
2. **firebase を上げるたびに再確認**: `npm audit --omit=dev` をやり直し、結果をこの表に追記する
3. **本番の依存で grpc-js 以外の high が出たら受容しない**（その時点で対応を決める）

| 確認日 | 内容 | 結果 |
|---|---|---|
| 2026-11-10 | demo の `dist` に grpc | 0 件（security-engineer） |
| （B の後） | `grep -rl grpc dist-live` | 未実施 |
