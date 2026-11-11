# デザインシステム（アフロCMS デモ）

方向性: **Material Design 3 ＋ M3 Expressive**（2026-11-10 に M3、11-11 に m3.material.io に倣いダーク・ナビゲーションレール・Expressive の形と動きを追加。ベースライン配色 #6750A4）。

値の正は `src/theme/tokens.ts`。MUI テーマ（`src/theme/theme.ts`）と独自コンポーネントは、どちらもここを参照する。値をコンポーネントに直接書かない。
旧キー（bg / surface / ink / primarySoft …）は既存画面の互換のため M3 の役割へ割り当ててある。**新しいコードは M3 名を使う。**

## 配色の切替（ライト / ダーク）

- `tokens.color.X` は CSS 変数（`var(--md-x)`）。生の値は `palette.light` / `palette.dark`（`src/theme/tokens.ts`）。変数は CssBaseline が `:root, [data-theme="light"]` と `[data-theme="dark"]` に定義する
- **MUI の `alpha()` / palette に `tokens.color` を渡さない**（var() を解釈できず例外で真っ白になる）。`makeTheme(mode)` は `palette[mode]` を使う。半透明は `color-mix(in srgb, var(...) N%, transparent)`
- 設定: システム / ライト / ダーク（既定はシステム）。保存キーは **`afro-cms-demo:theme`**（DemoState とは別。デモの初期化で戻らない）。最初の描画前の付与は `index.html` のインラインスクリプト
- 切替: 上部バーの太陽 / 月ボタン（押した位置から円で広がる View Transitions）と設定画面の Segmented button
- ライト固定: 営業プレゼンモード（`useForceLightMode`）、顧客サイトの見本・端末の枠・公開プレビュー・検索結果の見本（`data-theme="light"` ＋ `LightThemeOnly`）
- 塗りの上の文字は on 役割（`onPrimary` / `onSuccess` / `onDanger` / `onTertiary` …）。`'#fff'` は案件の色（`project.accent`）と `aiGradient` の上だけ。提案書のスコア欄は両モードとも `scoreboardBg`（暗い面）
- ダークの主な値: 地 `#141218`、カード `#1D1B20`、primary `#D0BCFF`、primaryContainer `#4F378B`、secondaryContainer `#4A4458`、onSurface `#E6E0E9`、outline `#938F99`、outlineVariant `#49454F`。状態色は success `#6DD58C` / warning `#F2C14E` / info `#98CBFF` / error `#F2B8B5`（Soft と Ink は明暗を反転）。文字の組み合わせ 46 組を両モードで 4.5:1 以上と確認（2026-11-11）
- SVG の属性（lucide の `color`、Recharts、React Flow の矢印・MiniMap、ロゴ）でも var() が効くことを Chrome で確認済み（2026-11-11）

## 色（M3 Color roles。値はライト）

| 役割 | 値 | 旧キー | 用途 |
|---|---|---|---|
| surfaceContainerLow / surfaceContainerLowest | `#F7F2FA` / `#FFFFFF` | bg / surface | 画面の地 / カード・入力欄 |
| surfaceContainer / High / Highest | `#F3EDF7` / `#ECE6F0` / `#E6E0E9` | surfaceMuted / — / bgSubtle | 下部バー / Dialog の面 / トラック・Surface muted（Dialog の中でも見える段） |
| successLine / dangerLine | `#8CCB9C` / `#E8A6A1` | — | Soft の面を囲む罫線 |
| outlineVariant / outline | `#CAC4D0` / `#79747E` | border / borderStrong | カードの罫線 / 入力欄・Outlined ボタンの枠 |
| onSurface / onSurfaceVariant | `#1D1B20` / `#49454F` | ink / inkSoft | 本文 / アイコン・補足 |
| primary / primaryContainer | `#6750A4` / `#EADDFF` | primary / primarySoft | 主要操作・アクティブ |
| secondaryContainer | `#E8DEF8` | — | ナビの選択中・Segmented の選択中・Chip |
| tertiary / tertiaryContainer | `#7D5260` / `#FFD8E4` | accent / accentSoft | AI 関連の印だけに使う |
| inverseSurface | `#322F35` | — | Tooltip・Snackbar |
| success / warning / error / info | 各 + Soft + Ink | — | 状態。**色だけで伝えず必ず文字を添える**（`StatusPill`）。Soft の上の文字は `*Ink`（4.5:1 以上） |

AI の印は `aiGradient`（primary→tertiary）を小さな面積だけに使う。大面積のグラデーション・発光・ガラス風は使わない。

## 形・影・文字

- 角丸（M3 Shape）: 4 / 8 / 12 / 16 / 28px / Full。`theme.shape.borderRadius = 4` なので sx の `borderRadius: 1/2/3/4/7` がそのまま M3 の段になる。カード 16px（`radius.lg`）、主役の面（ホームの次の一手）・ダイアログ 28px、ボタン・ナビ項目は Full
- M3 Expressive の形の変化: ボタン・アイコンボタン・FAB・クリックできるカードは押すと角が締まる（pill → 12px。`easeSpringCss`）
- 画面の見出し（PageHeader）は md 以上で Display small（36/44）
- 影（M3 Elevation）: `xs`=Level0（面の色で区別）→ `sm`=Level1（ホバー・FAB）→ `md`=Level2（メニュー）→ `lg`=Level3（ダイアログ）
- 状態: ホバー 8%・押下/フォーカス 10% の state layer（`tokens.state`）。押下時は ripple。フォーカスは 3px の輪郭線
- 書体: Roboto（端末にあれば）＋ Noto Sans JP（`@fontsource` で同梱。外部 CDN を使わない）。字間は M3 Type scale の値。数値は `tabular-nums`

## 動き（役割分担）

M3 の Emphasized easing（`cubic-bezier(0.2, 0, 0, 1)`）。時間は `tokens.motion`（150 / 300 / 400ms）。
M3 Expressive の spring: `tokens.motion.spring`（fast 800/34・default 380/31・slow 200/23。Motion for React の transition にそのまま渡す）。ページ切り替え・Reveal の移動、配色ボタンのアイコン。CSS で行き過ぎを近似する曲線は `easeSpringCss`（押下の形・ナビの印・Switch）。
ナビの印（レール・ドロワー・下部タブ）は選択で中心から横に広がる（`navIndicatorSx`）。設定の「常に減らす」は `<html data-reduced-motion>` で CSS の transition も止める。

| 担当 | 対象 |
|---|---|
| **Motion for React** | ページ切り替え（`motion.base`）、カード出現（`Reveal`）、モーダル・状態遷移 |
| **GSAP** | ステップ演出・タイムライン（AI 分析、全ページ構築、サイト診断、プレゼン）。**内側の要素だけ** |
| CSS transition | ホバー、進捗リング、ボタンの押下 |

- **同じ DOM 要素を GSAP と Motion で同時に動かさない**
- GSAP は `gsap.context()` で囲み、アンマウント時に `revert()` する
- `prefers-reduced-motion` と設定画面の切替を `useReducedMotion()` で判定し、演出を即時表示に置き換える

## 共通部品（`src/components/ui`）

`Surface`（M3 Outlined card）／ `PageHeader` ／ `SectionTitle` ／ `CountUp` ／ `ProgressRing` ／ `StatusPill` ／ `AiBadge`・`AiMark` ／ `MemberAvatar` ／ `Reveal` ／ `StageTrack`（5段階）

レイアウト（`src/components/layout`）: `AppShell`（PC は M3 Expressive Navigation rail 幅 96〔ロゴ・メニュー・プレゼン・設定・ログイン中の情報の Popover〕、lg 未満はモーダルの Navigation drawer、スマホは Navigation bar、Top app bar）／ `BuildFlowNav`（要件定義→サイトマップ→デザイン）／ `ResetDemoDialog`

## M3 にしていないもの（意図）

- 顧客サイトの見本（`features/design/previews`）・サイネージ・Google 検索結果の見本・書き出す HTML 文書・案件の色の候補は、それぞれ見本先・印刷物の色を保つため M3 の配色にしていない
