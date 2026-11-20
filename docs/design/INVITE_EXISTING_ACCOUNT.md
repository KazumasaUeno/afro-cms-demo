# 招待より前からあるアカウント（関数の `existing`）を受け付けない — 設計

- 作成: 2026-11-20 security-engineer（設計のみ。コード・Rules は未変更）
- 対象: `docs/TODO.md`「お客様を招待する前のゲート」HIGH の 1 件目
- 規模: **XL**（認証・認可・Security Rules）。実装前に Plan Review（security-engineer 同席）を通す
- 状態: **ユーザー確認待ち**（最後の「確認したいこと」）

---

## 1. いまの仕組み（確認したこと）

| # | 内容 | 根拠 |
|---|---|---|
| F1 | [FACT] 招待の受け取りはクライアントが 1 つのバッチで行う（`accounts/{uid}` 作成＋`invites/{email}` を claimed） | `src/live/auth.tsx:59-75` |
| F2 | [FACT] Rules の受け取り条件 `claimOk` は「確認済みトークン・`token.email` の招待が invited・項目の写しが一致」だけを見る。**そのアカウントが誰に・いつ作られたかは見ない** | `firestore.rules:110-128`、`:140` |
| F3 | [FACT] 招待側の更新も「`token.email == email`・invited→claimed・`existsAfter(me())`」だけ | `firestore.rules:183-192` |
| F4 | [FACT] 関数 `provisionInvitee` は同じメールのアカウントがあると**何も変えずに `existing` を返す**。印は付けない | `functions/src/index.ts:87-96` |
| F5 | [FACT] 「招待メールを送り直す」も同じ関数を呼ぶので、**関数が自分で作ったアカウントでも 2 回目は `existing`** になる（正常な送り直しと他人のアカウントを区別できない） | `tests/functions/provision.test.mjs:109-123`、`src/live/pages/LiveUsersPage.tsx:119` |
| F6 | [FACT] `existing` のときもクライアントはパスワード設定メールを送り、画面は削除を促す警告を出す | `src/live/invite.ts:37-39`、`src/live/pages/LiveUsersPage.tsx:27-28,117` |
| F7 | [FACT] 本番は 2026-11-20 に「作成（登録）を許可」OFF（公開キーの signUp が `ADMIN_ONLY_OPERATION`）。OFF 前の Auth は招待した 2 件のみ | `docs/TODO.md` 0.46.0 手順 6・7 |
| F8 | [FACT] 本番の現状（依頼者の監査記録）: 管理者 1（REST で作成・有効）、開発用 1（無効化）、テスト 1（取り消し） | 2026-11-20 audit |

## 2. 脅威（誰が・どうやって）

| ID | 攻撃者 / 経路 | 手口 | 結果 |
|---|---|---|---|
| T-01 | 社外の第三者。**登録が ON の環境**（再び ON にした本番・ステージング・OFF 前の他環境） | 招待されそうなメールで先に登録し、確認メールのリンクを本人に押させる（または本人のメールを掌握している） | パスワード設定前に `claimOk` を通り、招待の role（client / developer）で他社の案件へ到達 |
| T-02 | 社内の運用担当（悪意なし・誤操作） | Console の「ユーザーを追加」で同じメールのアカウントを作る | 関数を通らないアカウントが招待を受け取れる。誰が作ったかの証跡が関数ログに残らない |
| T-03 | 将来のプロバイダ（Google ログイン等）を ON にしたとき | 同じメールで別プロバイダのアカウントができる（`email_verified` が最初から true になり得る） | 確認メール無しで招待を受け取れる |
| T-04 | 送り直しの誤判定（F5） | 正常な送り直しでも警告が出る → 運用担当が「いつものこと」と警告を無視する習慣がつく | T-01〜03 の警告が埋もれる |

[INFERENCE] いまの本番は T-01 の入口（登録）が閉じているため実害の可能性は低い。ただし T-02・T-03 は登録 OFF では防げず、「お客様の招待」を始める前に Rules で塞ぐ必要がある（OWASP A01 / A07）。

## 3. 案

共通の考え方: **「関数がこの招待のために作ったアカウント」であることを、クライアントが書けない場所に記録し、受け取り時に Rules で照合する。** 印の無いアカウントは受け取れない（fail-closed）。

### 案 A: カスタムクレーム `invited: <招待のメール>` を関数が付ける

- 関数: `createUser` の直後に `setCustomUserClaims(uid, { invited: email })`
- Rules: `claimOk` と招待の更新に `request.auth.token.invited == request.auth.token.email` を追加

| 良い点 | 悪い点 |
|---|---|
| Rules の読み取りが増えない | **作成とクレーム付与が 2 手**。間で落ちると印の無いアカウントが残り、送り直しが `existing` 扱いになる（補償の削除が要る） |
| 関数の権限は Auth 管理だけで済む | クレームはトークンに載るため、**付与前に発行されたトークンには無い**。新規アカウントは最初のログインがパスワード設定の後なので通常は問題ないが、付与し直す運用では `getIdToken(true)` の強制更新が要る |
| | 受け取り後もクレームが残り続ける（害は無いが意味の無い値がトークンに載る）。どの招待に対して付けたかは Firestore から見えない |

### 案 B: 関数が `invites/{email}.provisionedUid` を書き、Rules で `== request.auth.uid` を照合（推奨）

- 関数（1 回のトランザクション＋作成）:
  1. 招待が invited であることを確かめ、**uid を関数側で決めて** `provisionedUid` を書く
  2. `createUser({ uid: provisionedUid, email, ... })`
  3. `email-already-exists` のとき: `getUserByEmail` の uid が `provisionedUid` と同じなら **`resent`**（正常な送り直し）、違えば **`existing`**（他から来たアカウント。受け取れない）
  4. 印を書いた後に作成が失敗しても、その uid のアカウントは存在しないので誰も受け取れない（次の呼び出しで uid を作り直す）
- Rules: `claimOk` に `before.provisionedUid == uid`、招待の更新に `resource.data.provisionedUid == request.auth.uid` を追加。`validInvite`（`firestore.rules:157-176`）は `hasOnly` のままなのでクライアントは `provisionedUid` を書けない。招待の更新も `changed().hasOnly([...])`（`:184`, `:188`）で書き換え不可

| 良い点 | 悪い点 |
|---|---|
| **トークン更新が要らない**（Firestore の値を見る） | 関数に Firestore の書き込み権限が要る（TODO の専用 SA 案「Datastore 閲覧のみ」を「Datastore ユーザー」に変える） |
| 印が「この招待 × この uid」に結び付く。他の招待・別アカウントへ流用できない | Rules の `get(invPath())` は既にある（`:113`）ので読み取りは増えないが、Rules の差分は A より少し大きい |
| 管理者が Firestore で状態を見られる（証跡）。F5 の送り直し誤判定も同時に直る | |

### 案 C: 受け取りそのものを callable `claimInvite` へ移し、Rules はクライアントの受け取りを拒否

- 関数が Admin SDK で、uid・作成時刻（`metadata.creationTime < invite.createdAt` なら拒否）・プロバイダ・印を見てから `accounts` 作成と claimed を書く
- Rules: `accounts` の create と招待の受け取り側の update を `false`

| 良い点 | 悪い点 |
|---|---|
| 判定材料が最も多い（Rules からは `creationTime` やプロバイダ一覧が見えない） | **Admin SDK は Rules を通らない**。`claimOk` の写しの検査（M-1）を関数で作り直す必要があり、Rules テストの資産が使えなくなる |
| 受け取り時に `revokeRefreshTokens` も同時にできる | 初回ログインに関数の呼び出し（コールドスタート）が入る。App Check 未 enforce のうちは呼び出し面が増える。変更範囲が最も大きい（`auth.tsx` の流れを作り直す） |

参考: 「`creationTime < invite.createdAt` なら拒否」は Rules からは見えない値なので、C か関数内（B の手順 3）でしか使えない。B では uid の照合で同じ効果が得られるため不要。

## 4. `existing` のときの扱い

| 選択肢 | 内容 | 判断 |
|---|---|---|
| X: 拒否（推奨） | 関数は `existing` を返し、**パスワード設定メールは送らない**。画面は「Console でこのアカウントを削除してから送り直す」を出す。削除後の送り直しで新しい uid が作られる | 単純で fail-closed。いまの運用手順（`docs/TODO.md` の運用 MEDIUM）と同じ動き |
| Y: 管理者の確認つきで受け入れる | 別の callable で、管理者が確認したら関数が `revokeRefreshTokens`・パスワードを捨て値に変更・`emailVerified=false`・`provisionedUid` を書く | 他人のセッションは切れるが、メールを掌握されている場合は防げない。いまの規模では不要 [INFERENCE] |

## 5. 既にあるデータ（移行）

| 対象 | 影響 | 対処 |
|---|---|---|
| 最初の管理者（REST で作成・`accounts` あり） | なし。`claimOk` は `accounts` の **作成時だけ**（`:140`）。管理者は受け取りをしない | 不要 |
| 開発用（無効化・受け取り済み） | なし（受け取り済み。`accounts` は既にある） | 不要 |
| テスト（招待は取り消し済み） | なし（revoked は受け取れない） | 不要 |
| **Rules を出す時点で invited のまま残っている招待** | 関数の変更前に作られたアカウントには印が無い → 受け取れなくなる | [UNKNOWN] 件数（本番 Firestore を見ていない）。出す前に invited を数え、あれば「Auth のアカウントを削除 → 送り直し」。0 件なら不要 |

## 6. テスト計画

Rules（`tests/rules/accounts.test.mjs` に追加。エミュレータ・`demo-` プロジェクト）

| ID | 脅威 | ケース | 期待 |
|---|---|---|---|
| TEST-R1 | T-01〜03 | 招待に `provisionedUid` が無い状態で受け取り | 拒否 |
| TEST-R2 | T-01〜03 | `provisionedUid` が別の uid（偽申告: 自分の uid 以外） | 拒否 |
| TEST-R3 | — | `provisionedUid == 自分の uid` で受け取り | 許可（既存の受け取りテストがすべて緑のまま） |
| TEST-R4 | 改ざん | 招待の受け取り更新で `provisionedUid` を自分の uid に書き換える | 拒否 |
| TEST-R5 | 改ざん | 管理者が `validInvite` で `provisionedUid` 付きの招待を作る／取り消しで書き換える | 拒否 |
| TEST-R6 | 片側書き | `accounts` だけ作る・招待だけ更新する（バッチを分ける） | どちらも拒否 |

Functions（`tests/functions/provision.test.mjs` に追加。Auth・Firestore・Functions エミュレータ）

| ID | ケース | 期待 |
|---|---|---|
| TEST-F1 | 新規 | `created`。Auth の uid と `invites.provisionedUid` が一致 |
| TEST-F2 | 送り直し（関数が作ったアカウント） | `resent`。アカウントは変わらない（いまの line 122 の期待を `existing` から変える） |
| TEST-F3 | 招待より前に Auth エミュレータへ直接作ったアカウント（Console 追加の再現） | `existing`。`provisionedUid` は書かれない／書き換わらない |
| TEST-F4 | 印を書いた後に作成が失敗（`createUser` を失敗させる） | 次の呼び出しで新しい uid で `created`。前の印の uid ではログインできない |
| TEST-F5 | 取り消し済み・招待なし | いまと同じく拒否（回帰） |
| TEST-E1 | 結合: F3 のアカウントでログインして受け取り | Rules が拒否し、`accounts` は作られない |

件数を報告に書く（0 件で緑を許さない）。Rules テストは `npm run test:rules`、関数は `npm run test:functions`。

## 7. 出す順番と戻し方

1. **functions**（印を書く・`resent` を返す）。Rules は印を見ないので、出しても何も壊れない
2. **hosting**（`resent` を通常の成功として扱い、`existing` ではメールを送らない）
3. 本番の invited の招待を数える（§5）→ 必要なら作り直す
4. **firestore rules**（`claimOk` と招待の更新に照合を追加）
5. 本番で確かめる: 新しいメールで招待 → パスワード設定 → ログインで「有効」／送り直しで警告が出ない／関数ログ `status: created` / `resent`
   - 印の無いアカウントで受け取れないことは**エミュレータで確認**（本番で Console 追加を試さない）

戻し方: **Rules を前の版へ戻す**（`git show <前のSHA>:firestore.rules` を出す）。関数と hosting は印を余分に書くだけなので戻さなくてよい。Rules を戻すと受け取りの防御は今と同じに戻る（データは消えない）。

## 8. 推奨

**案 B ＋ `existing` は拒否（X）。**

- 理由 1: 印を「招待 × uid」に結び付けられ、トークン更新の考慮が要らない（A の弱点が無い）
- 理由 2: Rules の受け取り検査（M-1 の写し強制とテスト資産）をそのまま使える（C は作り直しになる）
- 理由 3: 送り直しと他人のアカウントを区別でき、F5 の誤警告（T-04）も同時に直る
- 代償: 関数に Firestore 書き込み権限が要る（専用 SA の MEDIUM と一緒に platform-engineer へ渡す）

## 9. 確認したいこと（NEED CONFIRMATION）

1. 案 B（推奨）で進めてよいか。A（Auth 権限だけで済ませたい）や C（判定を全部関数に寄せたい）を選ぶ理由はあるか
2. `existing` は拒否（メールを送らない・Console で削除してから送り直す）でよいか。Y（管理者の確認で受け入れる）が要る業務はあるか
3. 関数の実行 SA に Firestore の書き込み（Datastore ユーザー）を与えてよいか（いまは既定 SA。専用 SA 化の MEDIUM と同時に決めたい）
4. 本番 Firestore で invited のまま残っている招待の件数を見てよいか（読むだけ。Rules を出す直前に 1 回）
