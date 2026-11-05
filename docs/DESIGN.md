# デザインシステム（アフロCMS デモ）

方向性: **Premium Creative SaaS** — 業務システムに見えない、余白と動きで理解させる画面。

値の正は `src/theme/tokens.ts`。MUI テーマ（`src/theme/theme.ts`）と独自コンポーネントは、どちらもここを参照する。値をコンポーネントに直接書かない。

## 色

| 役割 | 値 | 用途 |
|---|---|---|
| bg / bgSubtle | `#FAFAFB` / `#F4F5F8` | 画面の地 / セグメント・トラック |
| surface / border | `#FFFFFF` / `#E7E9EF` | カード・繊細な罫線 |
| ink / muted | `#0F172A` / `#64748B` | 本文 / 補足（地に対して 4.5:1 以上） |
| primary | `#3B5BDB` | 主要操作・アクティブ |
| navy | `#1E3A8A` | ロゴ・落ち着いたブルー |
| accent | `#7C5CFA` | AI 関連の印だけに使う |
| success / warning / danger / info | 各 + Soft | 状態。**色だけで伝えず必ず文字を添える**（`StatusPill`） |

AI の印は `aiGradient`（ブルー→パープル）を小さな面積だけに使う。大面積のグラデーション・発光・ガラス風は使わない。

## 形・影・文字

- 角丸: 10 / 14 / 18 / 24px（カードは 18px、ダイアログは 24px）
- 影: `xs`（静止カード）→ `md`（ホバー）→ `lg`（モーダル）の 3 段だけ
- 書体: Inter Variable ＋ Noto Sans JP（`@fontsource` で同梱。外部 CDN を使わない）
- 見出しは字間を詰める（-0.01〜-0.025em）。数値は `tabular-nums`

## 動き（役割分担）

| 担当 | 対象 |
|---|---|
| **Motion for React** | ページ切り替え（240ms）、カード出現（`Reveal`）、モーダル・状態遷移 |
| **GSAP** | ステップ演出・タイムライン（AI 分析、全ページ構築、サイト診断、プレゼン）。**内側の要素だけ** |
| CSS transition | ホバー、進捗リング、ボタンの押下 |

- **同じ DOM 要素を GSAP と Motion で同時に動かさない**
- GSAP は `gsap.context()` で囲み、アンマウント時に `revert()` する
- `prefers-reduced-motion` と設定画面の切替を `useReducedMotion()` で判定し、演出を即時表示に置き換える

## 共通部品（`src/components/ui`）

`Surface`（カード土台）／ `PageHeader` ／ `SectionTitle` ／ `CountUp` ／ `ProgressRing` ／ `StatusPill` ／ `AiBadge`・`AiMark` ／ `MemberAvatar` ／ `Reveal` ／ `StageTrack`（5段階）

レイアウト（`src/components/layout`）: `AppShell`（サイドバー・上部バー・スマホ下部タブ）／ `BuildFlowNav`（要件定義→サイトマップ→デザイン）／ `ResetDemoDialog`
