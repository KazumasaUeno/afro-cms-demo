# 脅威モデル: 管理者に開発者と同じ書き込み権限＋代理承認（設計段階・XL）

- 日付: 2026-11-26 ／ 担当: security-engineer（読み取りのみ。コードは未変更）／ 基準: main b5de514
- 前提（ユーザー決定 2026-11-26）: 有効な admin は全案件で、担当の開発者ができる書き込みをすべて行える（ヒアリング入力・AI 生成/編集・確認依頼/差し戻し・構築タスク・相談の返信）。admin は要件定義書のお客様承認を**代理で記録**でき、履歴に「admin の代理」と残す。AI フラグ（internal＋allowlist）と外部 AI 送信の方針は変えない
- 判定: **条件つき承認（APPROVED WITH CONDITIONS）**。設計上の Critical は無い。下の R-1〜R-8 と TEST の全件が揃うまでリリースしない
- gate の棚卸しは impact-analyzer の担当（ここでは扱わない）

## 1. 現状の事実

| # | 事実 | 確認 |
|---|---|---|
| F-1 | 役割は accounts の status=='active' かつ email==token.email のときだけ（roleOf）。callable も同じ判定 | firestore.rules:18-20,40 / functions/src/ai/authz.ts:22-32 |
| F-2 | admin の案件更新は memberUids だけ。確認依頼/差し戻し・承認は developer/client の分岐だけ | firestore.rules:251-268 |
| F-3 | 承認の証跡は追記のみ。actorUid==auth.uid・actorEmail==token.email・actorName==accounts.name を Rules が強制。ID は requirements-r{rev}-{action} | firestore.rules:290-294,469-474,421-425 |
| F-4 | 相談の side は役割から決まる（admin は 'none'）。クライアントが選べない | firestore.rules:379-383 |
| F-5 | 編集保存は developer∧member のみ（admin 不可）。生成は admin 可 | functions/src/ai/authz.ts:44-53 |
| F-6 | internal では生成は admin∧allowlist だけ、編集は allowlist だけ | functions/src/ai/flags.ts:64-78 |
| F-7 | 上限: 案件 5/日・20/月、利用者 10/日、全体 200/月 | functions/src/ai/limits.ts:6-11 |
| F-8 | clientStatus.ts は side==='client' を「お客様の行動」として数える | src/features/projects/clientStatus.ts:72-74 |

## 2. 脅威

| ID | 脅威 | 重大度（対策なし） | 防ぐ層 |
|---|---|---|---|
| T-01 | お客様・協力会社の開発者が admin 向けの新しい分岐に入る（権限昇格） | Critical | Rules（roleOf=='admin' だけを条件にする） |
| T-02 | 開発者が担当外の案件へ書く（admin 分岐の条件を `mine \|\| assigned` 形で書き崩す） | Critical | Rules |
| T-03 | 無効化・メール変更後の admin が書ける | High | Rules／callable の roleOf |
| T-04 | 代理承認がお客様本人の承認に見える。proxy 欄を省略・偽装した書き込み、お客様が proxy:true を付ける | High（証跡の完全性） | Rules（proxy の有無を役割から強制） |
| T-05 | お客様の承認と代理承認が両方できる（二重承認・承認の上書き） | Medium | 同じ文書 ID（create のみ）で排他 |
| T-06 | admin が自分で確認依頼して自分で代理承認（職務分離なし）。お客様の同意無しの代理 | Medium（否認） | 受容＋記録（理由の必須化・お客様にも見える履歴） |
| T-07 | admin が相談でお客様になりすます | High | Rules（admin の side は 'afro' に固定） |
| T-08 | admin が全案件で AI 生成を回し費用を浪費（乗っ取り時） | Medium | F-6・F-7（サーバー側の上限。最大約 54 USD/月＝200×0.27） |
| T-09 | admin が担当の開発者の編集を上書き・破棄 | Low（業務） | editedBy の記録・confirmDiscard（request.ts:107） |

## 3. 必要な Rules / データ設計

- **R-1** admin の分岐は `roleOf(a)=='admin'` を明示した**別の分岐**として足す。既存の `mine` の定義（developer∧memberUids）は変えない（T-01・T-02）
- **R-2** 確認依頼/差し戻し: projUpdateOk の devTransition 分岐・reqUpdateOk の submit 分岐・apprCreateOk の submitOrWithdrawOk に admin を足す。side は従来どおり 'afro'
- **R-3 代理承認の文書**（approvals/requirements-r{rev}-approve）:
  `action:'approve'`・**`side:'afro'`**・**`proxy:true`**・`actorUid/Email/Name`（actorOk のまま）・`answers`・`proposal`（approveOk と同じ等式）・**`note`（1〜200 文字。お客様の同意の確認方法。必須）**。
  Rules: admin は `proxy==true` と `note` が必須（hasAll）、お客様は `proxy` と `note` を持てない（hasOnly から外す）、開発者は approve を作れない。
  side を 'client' にしない理由: F-8 など side==='client' を「本人の行動」と読む既存の処理が、代理を本人と誤って数えないため（安全側に倒す）
- **R-4** requirements 側: clientApprove と別に adminProxyApprove を作り、affectedKeys は `status, approvedAt, approvedBy, approvalId, approvedVia`、`approvedBy==auth.uid`・**`approvedVia=='proxy'`** を強制。お客様の分岐では approvedVia を書けない（一覧で代理と分かる）
- **R-5** 全ての新しい approvals に `actorRole`（任意キー。有るなら roleOf と一致。admin は必須）を足し、admin と開発者の確認依頼を履歴で区別する。既存の文書はバックフィルしない
- **R-6** 相談: sideOf で admin を 'afro' にする。'client' になるのは role=='client'∧projectId 一致だけのまま（T-07）
- **R-7** tasks: taskCreateOk/UpdateOk に admin を足す。assigneeUids ⊆ memberUids は残す
- **R-8** callable: assertCanEdit に admin を足す（authz.ts:52-53 と F5 のコメントを更新）。generationAllowed／editAllowed・上限・allowlist は変えない
- 1 リクエスト 1000 式の上限: approveOk の等式に分岐を足すので、最大 payload の v3 代理承認でエミュレータ計測する（approvals.test.mjs の計測と同じ形）

## 4. 変えてはならないもの

- お客様の権限（書けるのは承認 4 キーと相談だけ）。お客様が proxy・approvedVia・note を書けない
- 開発者は担当案件だけ（memberUids）。協力会社の読み取り範囲（accounts）も同じ
- 無効化・メール不一致の admin は 'none'（Rules と callable の両方）
- accounts の admin は更新できない／アプリから admin を招待できない（M-5）
- approvals・messages は追記のみ（update/delete false）。aiDrafts はクライアントから書けない
- AI: internal＋allowlist・上限・外部送信の方針・Secret の結び先（worker だけ）

## 5. 必要なテスト（T ↔ TEST）

| TEST | 内容 | 脅威 |
|---|---|---|
| TEST-01 | admin が担当外の案件で 入力・確認依頼・差し戻し・タスク作成/更新・相談 ができる（許可） | 機能 |
| TEST-02 | 同じ操作を 担当外の開発者・協力会社・お客様・他案件のお客様・未ログイン が行うと拒否 | T-01・T-02 |
| TEST-03 | disabled の admin・email 不一致の admin・email_verified=false が全分岐で拒否（Rules と callable 両方） | T-03 |
| TEST-04 | admin の代理承認: proxy 無し・proxy:false・note 無し・side:'client'・actorUid 偽装・approvedVia 無し → 拒否。正しい形 → 許可 | T-04 |
| TEST-05 | お客様が proxy:true／note／approvedVia を付ける → 拒否。開発者の approve → 拒否 | T-04 |
| TEST-06 | お客様承認の後の代理承認・代理承認の後のお客様承認 → どちらも拒否。approvals の update/delete は admin も拒否 | T-05 |
| TEST-07 | admin の相談の side:'client' → 拒否。'afro' → 許可 | T-07 |
| TEST-08 | callable saveAiDraftEdits: admin 許可・担当外の開発者／お客様／無効 admin 拒否。requestRequirementsDraft の上限（利用者 10/日）が admin に効く | T-08 |
| TEST-09 | 最大 payload の v3 代理承認が 1000 式の上限内（計測値を記録） | 可用性 |
| TEST-10 | mutation.test.mjs: admin 分岐の roleOf 条件・proxy の強制を外す変異が検出される | 全般 |

## 6. 受容リスク・確認事項

- **T-06（受容。ユーザー決定に基づく）**: admin の自己依頼→自己代理承認を Rules では止めない。代わりに note 必須・履歴でお客様にも「管理者の代理」と見える・同一人物なら画面で明示する。お客様への通知を付けるかは product-manager へ
- **NEED CONFIRMATION（lead-architect）**: 「開発者の全書き込み」に 案件の基本情報の編集・アーカイブ（Low-2 で admin 不可と決めた）を含めるか。含めるなら R-1 と同じ形で足し TEST-01/02 に加える
- 代理承認の法的な有効性（お客様の同意の証明として足りるか）は判断しない → LEGAL REVIEW REQUIRED として requirements-architect へ

## 7. 実装後監査（security-engineer 2026-11-26。範囲 b5de514..3afd697。Plan Review 2 往復目の差分確認を兼ねる）

- 判定: **APPROVED WITH CONDITIONS**（Critical・High 0）。読み取りのみ（コード・テストは未変更）
- テストの再実行: **未実施**。worktree に firebase.alt-test.json が無く、別ポートでの実行ができなかった。件数（rules 752・functions 243・unit 169）は実装者の報告であり、この監査では再現していない

### R-x と計画 §7 の確認（[FACT] diff を読んで確認）

| 項目 | 結果 | 根拠 |
|---|---|---|
| R-1 admin は別の分岐で `mine` は不変 | 充足 | firestore.rules projUpdateOk の `\|\| (r == 'admin' && …)`。`mine` の定義は変更なし |
| R-2 submit/withdraw | 充足 | reqUpdateOk `(mine \|\| r == 'admin')`、apprCreateOk の admin 分岐 → submitOrWithdrawOk |
| R-3 代理承認の記録 | 充足 | proxyApproveOk: side 'afro'・proxy==true・note（正規表現と制御文字の拒否）・hasOnly・answers/proposal の等式・ID は approve と同じ |
| R-4 approvedVia | 充足 | adminProxyApprove の 5 キー・`approvedVia=='proxy'`・`approvedBy==auth.uid` |
| §7-1 相互照合 | 充足 | adminProxyApprove は `l.proxy/side/actorUid`、proxyApproveOk は `pa.approvedVia`、clientApprove は `l.side=='client' && !proxy`・approvedVia 無し、approveOk は `!pa approvedVia` |
| R-5 / §7-3 actorRole | 充足 | admin は必須（apprCreateOk）。submitOrWithdrawOk は `d.get('actorRole', acc.role) == acc.role`。お客様は 'client' だけ（任意。計画 §7-3 の「あれば roleOf と一致」に合う） |
| R-6 相談 | 充足 | sideOf で admin は 'afro'。'client' はお客様の分岐だけ |
| R-7 tasks | 充足 | `p.memberUids.hasAll(assigneeUids)` は維持 |
| R-8 callable | 充足 | authz.ts assertCanEdit に admin を追加。archived の拒否は維持。flags は変更なし |
| §7-4 L-1 と Low-2 の反転 | 受容 | TEST-01/02 に基本情報とアーカイブあり。アーカイブで相談が止まることもテストあり |
| §7-5 表示 | 充足 | model.ts approvalLogFrom は actorName と note を使い、approvedBy で accounts を引かない。PortalApprovalPage も ApprovalHistory で代理と理由を表示。sameAsRequester は submit の actorUid と照合 |
| TEST-01〜10 | テスト自体は存在 | tests/rules/adminRights.test.mjs（TEST-01〜07・09）、mutation.test.mjs TEST-10、tests/functions/ai-flow.test.mjs TEST-03/08 |

### 指摘

| # | 重大度 | 場所 | 問題 | 対処 |
|---|---|---|---|---|
| A-1 | **Medium（リリース条件）** | src/live/repositories.tsx `actor()`（全ての approvals に actorRole を付ける） | 新しい画面は submit・withdraw・承認のすべてで actorRole を書く。旧 Rules は hasOnly で拒否するので、Hosting を先に出すと本番の確認依頼と承認が全件失敗する | **Rules → Functions → Hosting の順でデプロイする**。Rules を戻すときは Hosting を先に戻す。RUNBOOK / リリース判定に明記 |
| A-2 | Low | firestore.rules submitOrWithdrawOk の withdraw の `optStr(d,'note',0,200)` | 差し戻しの note には制御文字の検査が無い（既存）。admin も書けるようになり、承認の履歴に表示される場合は代理の note と同じ扱いにすべき | docs/TODO.md。今回は止めない |
| A-3 | Low | tests/rules/adminRights.test.mjs の 1000 式計測 | 実装者の報告では、代理承認だけの参照回数（get/getAfter の上限 20）は計測していない。今の参照は約 9 回と推定 [INFERENCE] | 次の Rules 変更で計測を足す |
| A-4 | Info | src/live/model.ts approvalLogsFrom | sameAsRequester は購読の上限（LIST_LIMIT 500）の中だけで照合する。表示用なので安全性への影響は無い | なし |

### 条件（リリース前に満たす）
1. A-1 のデプロイ順を守る。本番前にユーザーの GO を取る
2. テストを全件実行した結果（件数・0 件でないこと）を、release の判定に添付する。この監査では再実行していない
3. 別系統モデルのレビュー（認可の変更）を通す
4. LEGAL REVIEW REQUIRED（代理承認が同意の証明として有効か）を docs/TODO.md に残したまま、リリースの判断をユーザーに渡す
