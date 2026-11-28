# Plan Review（セキュリティ）: live のサイトマップ 実装計画

- 日付: 2026-11-28 ／ 担当: security-engineer（読み取りのみ。コードは未変更）／ worktree `wt-sitemap`（branch `feat/live-sitemap` @4a9292c）
- 対象: `docs/design/LIVE_SITEMAP_IMPL_PLAN.md`（以下「計画」）。照合元: 脅威モデル `2026-11-28-live-sitemap-threat-model.md`（S-1〜S-20・SM-01〜30）、`LIVE_SITEMAP_DATA.md`（D-3・§4）、`LIVE_SITEMAP_AI.md`（§3・§7）
- 確認した実物: `functions/src/ai/authz.ts:24-59`（`assertCanEdit` は渡された project スナップショットだけで判定）、`scripts/deploy-firebase.mjs:133-139`（現行の関門はファイルの有無だけ）
- **判定: APPROVE WITH CONDITIONS**。HIGH 0・MEDIUM 6・LOW 5。Critical / High が開く読み替えは無い。下の「計画への必須修正」M-1〜M-6 を計画へ反映してから U-F1・U-F2・U4 に着手する（U1-0・U2-0・U-S は先行してよい）

## 1. 論点ごとの結論

| 論点 | 結論 | 根拠 |
|---|---|---|
| S-3・S-9 callable の TX 検査 | **条件つき可**（M-1） | 計画 U-F1 は「TX 内で要件 approved・archived・状態・job・editSeq」を検査すると書くが、`assertCanEdit` を**どのスナップショットに**当てるかが無い。`authz.ts:50-56` は引数の project だけで判定するため、TX 外で読んだ文書に当てると、担当解除・アーカイブとの競合で 1 回分すり抜ける |
| S-6 承認の対象 = `{revision, contentHash}`（計画 **P-3**。依頼文の「P-1」は P-3 の誤り） | **可**。editSeq を外すのも可 | 版文書 `sitemapVersions/r{N}` は submit の callable が `create()` だけで作り、クライアントは全拒否・update/delete false（計画 §6）。Rules は `contentHash == get(版文書).contentHash ∧ revision == 要約.revision ∧ status requested`（DATA §4:114）で、お客様が任意のハッシュを送って通る形にならない。承認の対象が internal ではなく不変の版文書なので、requested 中に AI・保存が internal を変えても承認の中身は動かない（editSeq より強い）。ただし fallback ①（§5）は M-2 の条件つき |
| S-12 callable は ID だけ | **条件つき可**（L-1） | `requestSitemapDraft` は projectId・requestId・真偽値 3 つだけ（計画 §3）。送る本文はサーバーが読む。真偽値・UUID の型検査と未知キー拒否が契約に無い |
| S-14 上限の名前空間 | **可** | P-4 の `sitemap:{day}:{uid}`（既存 `"{day}:{uid}"` は数字始まりで衝突しない）・`aiUsage` に項目を足さない・SM-24 の両方向回帰と 4 項目の assert（§7・R-3） |
| S-18 法務ゲート `AI-SCOPE: sitemap` | **条件つき可**（M-3） | U-F2・SM-28 で持ち込み済み。判定が「本文に文字列がある」だと、散文中の言及（「AI-SCOPE: sitemap は未承認」等）で通る |
| S-13 worker の分離 | **条件つき可**（M-4） | P-7 で別関数・書き込み先定数・開始時と書き込み時の再検査（U-F2）。Secret の束縛先・`maxRetries 0`・invoker 非公開が計画本文に無い（AI §3 にだけある）。`request.ts` の一般化は SM-22 の両方向で守る |
| S-16 出力の無害化 | **条件つき可**（M-5） | 後処理（AI §3 #2・SM-25）は持ち込み済み。描画の確認 SM-26 が「Chrome が使えなければ未検証」の emulator UI にしか無く、未検証のまま完了できる |
| S-19 ログはコードだけ | **条件つき可**（M-6） | SM-29 は AI の flow テストだけ。U-F1（保存・submit）のログと `invalid-argument` の details に入力の値が出ないことの検査が無い |
| SM-08・SM-16・SM-17 を functions emulator へ | **可** | クライアント書き込みは Rules で全拒否（P-1）なので、書き込みの検査が実際に効く層は callable。脅威モデル SM-30 の注記どおり。Rules 側の全拒否は rules テストで固定（§2 正誤表）＋変異 1 件（L-4） |

## 2. 指摘

### MEDIUM
- **M-1**（計画 §4 U-F1・§10 S-3/S-9）`assertCanEdit`／`assertCanGenerate` は **TX 内で読んだ project スナップショット**に当てる。`resolveCaller`（accounts）は TX 外で可。攻撃シナリオ: 担当を外された開発者が、外す操作と同時に保存すると TX 外の古い memberUids で通る。テスト: sitemap-edits に「TX 開始後に memberUids から外す／archived にする → 拒否」（emulator で再現できなければ、判定関数が TX の snapshot を受けることを単体で固定）
- **M-2**（計画 §5 fallback ①）要約 `sitemap.contentHash` との等式に切り替える場合は、(a) 比較は事前状態 `resource.data.sitemap.contentHash`（`request.resource` ではない）、(b) クライアントの全分岐（承認 6 キー・withdraw・reopen の `[status]`）で `contentHash`・`revision` を変えられない（`siteProjOk` の差分 allowlist に入れない）、(c) 要約の `contentHash` を書くのは submit の callable だけ、を条件として §5 に明記する。テスト SM-07 に「お客様が同じバッチで要約の contentHash を自分の値へ書き換えて approve → 拒否」
- **M-3**（計画 §4 U-F2・§7 deploy-guard）`AI-SCOPE: sitemap` は**行頭から行末までの完全一致の行**（例 `/^AI-SCOPE:\s*sitemap\s*$/m`、または `AI-SCOPE:` 行のカンマ区切りの対象に `sitemap`）で判定する。テストに「散文中に `AI-SCOPE: sitemap` を含むが行として無い → 拒否」「`AI-SCOPE: sitemap-draft` → 拒否」を足す
- **M-4**（計画 §4 U-F2・§9 Release GO）U-F2 の契約へ明記: `ANTHROPIC_API_KEY` を束縛するのは `generateSitemapDraftTask` だけ（`saveSitemapEdits`・`submitSitemap`・`requestSitemapDraft` に `secrets` を付けない）・専用 SA は要件定義書の worker と同じ・`maxRetries 0`／`maxAttempts 1`・`onTaskDispatched` の OIDC を変えず invoker を公開しない。§9 の Release GO に「Secret のアクセス主体が worker 2 本の SA だけ」を追加（`gcloud secrets get-iam-policy` を platform-engineer 経由）。テスト: 関数定義の secrets 一覧を functions 単体で assert
- **M-5**（計画 §7 emulator UI・SM-26）S-16 の描画を emulator UI に頼らない。`tests/unit/liveSitemapUi.test.mjs`・`livePortalSitemap.test.mjs` に、label・reason・devComment・note へ `<img src=x onerror=alert(1)>` を入れて `SitemapViewer`／ポータル区画を静的描画し、**img 要素が無く文字として出る**ことを固定する（React Flow のノードも文字列 label だけ）。Chrome の確認は追加の確認に格下げ
- **M-6**（計画 §4 U-F1・§7 sitemap-edits/submit）U-F1 のログと `HttpsError` の details は `{field, nodeId?, code, count}` だけ（ラベル・パス・理由・devComment・note の**値**を出さない）。sitemap-edits／submit テストに、注入文字列を含む不正 payload で「ログ出力と details に入力の文字列が無い」assert を追加（SM-29 を U-F1 まで広げる）

### LOW
- **L-1**（§3 callable 契約）全 callable で入力の未知キー拒否・真偽値は `typeof === 'boolean'`・`requestId` は UUID v4 の正規表現。`saveSitemapEdits` は `origin`・`editSeq`・`status`・`updatedBy`・`revision` をクライアントから受けない（origin はサーバーが決める。C-05 の「AI提案」印の偽装防止）
- **L-2**（§3 `submitSitemap`）`expectRevision` は一致検査にだけ使い、新しい rev は TX 内の事前 rev+1 をサーバーが決める（SM-10 に「expectRevision を +2 で送っても rev+1」）
- **L-3**（§3 `contentHashOf`）ハッシュは `toSitemapVersion` の allowlist でお客様に見える項目を**全部**覆う。テスト: 表示に使う項目（label・path・reason・kind・接続・devComment.text）を 1 つずつ変えるとハッシュが変わる。覆わない項目を版文書に足すなら同時にハッシュへ入れる
- **L-4**（§7 mutation）`mutation.test.mjs` に「`sitemap/{sid}`・`sitemapVersions/{vid}` の write を `isAdmin()` に開く」変異を足し、全拒否のテストが落とすことを確認（SM-08/16/17 を Functions へ移した分、Rules 側の全拒否が唯一の Rules 守りになるため）
- **L-5**（§4 U-F2 worker、整合性）`discardEdits` の置換は、依頼時に記録した `editSeq` と書き込み時の `editSeq` が一致するときだけ行う（依頼後に人が保存した編集を AI 結果で黙って消さない）。不一致は結果を `aiDrafts/sitemap` に残すだけ。backend-engineer・ai-engineer の判断でよい

### 受容・記録（Info）
- 取り下げた版 `r{N}` もお客様は get できる（依頼した時点で見せている。新しい漏洩ではない）。受容
- 担当を外された依頼者のジョブ結果が internal に書かれる（worker は依頼者の役割を再検査しない。要件定義書の AI と同じ）。受容
- 脅威モデル S-1・S-2・S-4・S-5・S-7・S-8・S-10・S-11・S-15・S-17・S-20 は計画 §4・§7・§9・§10 に Unit とテストが割り当て済み（不足なし）

## 3. 計画への必須修正（反映先）

| # | 反映先 | 追記する内容 |
|---|---|---|
| E-1 | §4 U-F1 | M-1（TX snapshot で `assertCanEdit`）・M-6（ログ／details に値なし）・L-1・L-2 |
| E-2 | §5 fallback ① | M-2 の (a)(b)(c) |
| E-3 | §4 U-F2・§7 deploy-guard | M-3 の行判定とテスト 2 件 |
| E-4 | §4 U-F2・§9 Release GO | M-4（Secret の束縛先・SA・retry・invoker、Secret の IAM 確認） |
| E-5 | §7 unit（U3・U4） | M-5 の静的描画テスト。emulator UI の SM-26 は追加確認 |
| E-6 | §7 mutation・§3 | L-3・L-4 |

## 4. 残る UNKNOWN（本番 GO の前提。今回の段 1 着手は止めない）
- [UNKNOWN] 本番 Console の Rules ドリフト・worker の invoker・Secret のアクセス主体・Anthropic の spend limit（S-15・UK-5）。リポジトリ外。platform-engineer 経由で現物を取り寄せるまで本番 GO にしない
- LEGAL REVIEW REQUIRED（UK-6）: `on` と段 2 の前提（計画 P-8・R-10 のとおり）
- 実装後監査（S-1〜S-20）と別系統モデルレビュー（認可・外部送信）は計画 §12 どおり必須
