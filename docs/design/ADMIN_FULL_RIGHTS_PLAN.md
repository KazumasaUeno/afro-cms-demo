# 管理者に開発の全操作と代理承認を許す — 実装計画（XL）

- 日付: 2026-11-26 ／ 作成: lead-architect ／ 状態: Plan Review 1 往復目 APPROVE WITH CHANGES（security-engineer）→ 変更 1〜6 を §7 に反映。2 往復目は実装後の security 監査で差分確認
- 依頼: ユーザー 2026-11-26「管理者も基本開発の事なら何でもできるように」。範囲＝**全案件**、お客様の承認の**代理あり**（ユーザー回答）。11-10 の「管理者は見るだけ」と AI 下書き DEC F5 を置き換える
- 入力: 影響分析（impact-analyzer 2026-11-26。下の R/F/U/D 番号はその報告）、脅威モデル `docs/reviews/2026-11-26-admin-full-rights-threat-model.md`（APPROVED WITH CONDITIONS R-1〜R-8・TEST-01〜10）

## 1. DECISION（lead-architect。理由つき）

| # | 決定 | 理由 |
|---|---|---|
| L-1 | 基本情報の変更・アーカイブ（R1 の 259・262）も admin に許す（Rules のみ。live に書く画面は無い＝U8） | ユーザー「開発の事なら何でも」。画面が無いので Rules だけ |
| L-2 | 代理承認の記録: `approvals/requirements-r{rev}-approve` を同じ ID で、`side:'afro'`・`proxy:true`・`note`（trim 後 1〜200 字・必須）・`actorRole:'admin'`。requirements に `approvedVia:'proxy'`（本人の承認は項目なし＝既存データ互換） | 脅威モデル R-3/R-4。side を 'client' にすると clientStatus 等が本人の行動と数える |
| L-3 | 管理者の作り直しの confirmDiscard / discardLog（F3）は残す | 監査の記録が増えるだけで害が無い |
| L-4 | お客様への通知は作らない（通知の仕組み自体が無い）。お客様ポータルの承認の履歴に「アフロ（管理者名）が代理で承認：note」を出す | T-06 の受容条件（履歴をお客様にも見せる） |
| L-5 | タスクの担当者は memberUids の中だけのまま（R-7）。担当 0 人の案件では admin もタスクを作れない（既知の制約。docs/TODO.md） | 脅威モデル R-7 を守る。担当の追加は別の画面の話 |
| L-6 | 相談: admin の side は 'afro'、名前は accounts の name（D1）。お客様には「アフロ」側として見える | R-6 |
| L-7 | demo の挙動は変えない。共有の判定（aiDraftState・ProposalView・RequirementsPage）は live の役割の値だけで分岐し、demo の DOM を変えない | 承認済みデザイン |
| L-8 | AI のフラグ・allowlist・回数上限・外部送信の方針は変えない（F2 は変更不要） | 範囲外 |

## 2. 契約（Unit A と Unit B が同じものを見る）

- approvals（代理承認）: `{ schemaVersion:1, kind:'requirements', action:'approve', revision, side:'afro', proxy:true, note:string(1..200), actorRole:'admin', actorUid/actorEmail/actorName（actorOk と同じ）, at, …approveOk と同じ answers/proposal の等式 }`
- requirements/current（代理承認の遷移）: 本人の承認と同じ `status:'approved'`・`approvedAt`・`approvedBy == request.auth.uid` に加えて `approvedVia:'proxy'`。お客様は `approvedVia` を書けない
- submit / withdraw: 既存の形のまま、admin は memberUids に無くても可（side 'afro'）。新規の approvals には任意の `actorRole`（あれば roleOf と一致。admin の文書では必須）
- repositories（live）: `approveRequirements(projectId, { proxyNote })` を admin 用に追加（client の既存呼び出しは不変）

## 3. 単位（Write Scope が重ならない）

| Unit | 担当 | Write Scope | 内容 |
|---|---|---|---|
| A | database-engineer | `firestore.rules`・`scripts/gen-rules-questions.mjs`（生成区間のみ必要なら）・`functions/src/ai/authz.ts`・`functions/src/ai/*.ts` のコメント・`tests/rules/**`・`tests/functions/**` | R1〜R6 を R-1〜R-8 どおり（admin は `roleOf=='admin'` の別分岐。既存の `mine` は不変）。F1 assertCanEdit に admin。TEST-01〜10。**1000 式の再計測**（approvals.test.mjs:30 の最大 submit・代理承認）。合否が逆になる既存テスト（影響分析 §5）を直す。mutation.test の位置合わせ |
| B | frontend-engineer | `src/**`（live の判定・repositories・ProposalView・LiveRequirementsPage・RequirementsPage・aiDraftState・LiveTasksPage・LiveDashboardPage・tasks.ts・consult.ts・LiveConsultPage・model.ts の表示）・`tests/unit/**` | U1〜U6 で admin を「全案件の担当の開発者」と同じに（live のみ）。代理承認のボタン（note 入力のダイアログ）と履歴の表示（管理者画面・お客様ポータル）。demo は不変（L-7）。単体テスト |

順番: A と B は並行可（契約は §2）。統合後に test:rules・test:functions・test:unit・build を全部回す。

## 4. 変更しない部分

- お客様・協力会社・担当外の開発者の権限（拒否のテストを足して固定する）
- 無効化された admin の拒否（Rules・callable）／ accounts の admin 更新不可・招待不可（M-5）
- approvals・messages の追記のみ ／ aiDrafts はクライアントから書けない ／ Secret の結び先
- demo の画面と DemoStore

## 5. 確認事項（残す）

- **LEGAL REVIEW REQUIRED**: 代理承認がお客様の同意の証明として有効か（AI は結論を出さない）。docs/TODO.md へ
- 本番へ出す前にユーザーの GO を取る（Rules・Functions・Hosting）

## 6. 完了条件

- TEST-01〜10 が通る（件数つき）／ 既存の rules・functions・unit が全件通る ／ 1000 式の余裕を記録
- 管理者で担当外の案件を開き: ヒアリング入力・AI 作り直し・編集・承認の依頼・差し戻し・代理承認・タスク作成・相談の返信ができる（エミュレータで画面確認）
- code-reviewer と security-engineer（実装後監査）、別系統モデルレビュー（認可の変更）

## 7. Plan Review 1 往復目の反映（security-engineer 2026-11-26。実装はこの節を優先）

1. **相互照合（T-04/T-05）**: requirements の admin の承認分岐は `getAfter(approvals/requirements-r{rev}-approve)` が `proxy==true`・`side=='afro'`・`actorUid==auth.uid` を要求。代理の approveOk は `getAfter(project).requirements.approvedVia=='proxy'` を要求。お客様の分岐（clientApprove / approveOk）は承認文書が `side=='client'` で proxy を持たず、requirements に `approvedVia` が無いことを要求
2. **note の文字**: trim 後 1〜200 字、向きの制御（U+202A〜202E・U+2066〜2069）と C0 制御文字（改行も含めて拒否）を Rules の正規表現 1 回で拒否（相談の reChatControl と同じ扱い）。画面は送る前に同じ文字を除く。TEST-04 に拒否ケース
3. **actorRole**: どの approvals 文書でも、あれば roleOf と一致（開発者・お客様は 'admin' を名乗れない）。代理承認では必須で 'admin'。TEST-05 に「お客様が actorRole:'admin'」
4. **L-1 のテスト**: 基本情報の変更・アーカイブを TEST-01（admin は担当外でも可）・TEST-02（担当外の開発者・お客様は拒否）に。admin がアーカイブすると相談が止まる（consultOk の archived）
5. **表示（Unit B）**: 承認者の名前は approvedBy の uid から accounts を引かない（お客様は admin の accounts を読めない）。承認文書の `actorName` と `note` を出す。代理はお客様ポータル・管理者画面の両方で「代理」と明示し、依頼（submit）と代理承認が同じ uid なら画面にもそれを出す
6. **§4 に追加（変えない）**: generationAllowed / editAllowed / AI_QUOTA と allowlist ／ clientApprove の 4 キー ／ 開発者は approve を作れない ／ sideOf で 'client' はお客様だけ ／ admin の memberUids 分岐と adminMembersOk ／ aiDrafts の Rules は `if false` ／ 既存の approvals をバックフィルしない ／ 承認文書の ID の形式 ／ collectionGroup の一覧の権限
