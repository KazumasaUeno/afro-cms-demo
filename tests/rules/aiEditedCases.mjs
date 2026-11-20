// edited（開発者の編集）の検査ケース。代替 F-a（実装計画 §4 U1・L-b）により、検査は Rules ではなく
// callable saveAiDraftEdits（U2。Admin SDK で書く）が行う。U2 はこのケースを callable のテストへ写す（計画「テストは U1 の該当テストを callable 版に写す」）。
// - U1 で Rules 版として書いて計測した結果: 最大の payload の allow が 1000 式の上限で拒否された（AI_REQUIREMENTS_PLAN.md §7）
// - 上限の値は src/types/aiDraft.ts の AI_DRAFT_LIMITS（mutation.test.mjs が fixtures の最大値と照合する）
// 前提（callable 側で検査すること）: 呼び出し者がアサインされた開発者（admin は不可）・要件が draft・generated がある・
//   書くのは edited / editedAt / editedBy / updatedAt / updatedBy だけ（サーバー欄に触れない）・evidence は AI_EVIDENCE_KEYS の中だけ
import { EDITED, GENERATED, MAX_EDITED, maxPoint } from './aiFixtures.mjs';

/** @type {{ name: string, edited: unknown, expect: 'allow' | 'deny' }[]} */
export const EDITED_CASES = [
  { name: '既定の edited（generated の写し）', edited: EDITED, expect: 'allow' },
  { name: '最大の payload（要約 400・ポイント 6×上限・根拠 5・下書き 7 欄×800・未確定 10×200）', edited: MAX_EDITED, expect: 'allow' },
  { name: 'ポイント 0 件・未確定 0 件・下書きの欄が空文字', edited: { summary: '要約', points: [], draft: { ...EDITED.draft, goal: '', openQuestions: [] } }, expect: 'allow' },
  { name: 'detail に改行を含む', edited: { ...EDITED, points: [maxPoint(1, { detail: '1 行目\n2 行目' })] }, expect: 'allow' },
  { name: 'edited に siteCheck', edited: { ...EDITED, siteCheck: GENERATED.siteCheck }, expect: 'deny' },
  { name: 'edited に origin', edited: { ...EDITED, origin: GENERATED.origin }, expect: 'deny' },
  { name: 'edited に flags', edited: { ...EDITED, flags: { unsupportedNumbers: [] } }, expect: 'deny' },
  { name: '3 欄が欠ける（draft なし）', edited: { summary: EDITED.summary, points: EDITED.points }, expect: 'deny' },
  { name: 'ポイント 7 件', edited: { ...EDITED, points: [1, 2, 3, 4, 5, 6, 7].map((i) => maxPoint(i)) }, expect: 'deny' },
  { name: '根拠 6 件', edited: { ...EDITED, points: [maxPoint(1, { evidence: ['q-url', 'q-issue', 'q-purpose', 'https', 'viewport', 'sitemap'] })] }, expect: 'deny' },
  { name: '未確定事項 11 件', edited: { ...EDITED, draft: { ...EDITED.draft, openQuestions: Array(11).fill('確認') } }, expect: 'deny' },
  { name: '要約 401 文字', edited: { ...EDITED, summary: 'さ'.repeat(401) }, expect: 'deny' },
  { name: '下書きの欄 801 文字', edited: { ...EDITED, draft: { ...EDITED.draft, nonFunctional: 'ひ'.repeat(801) } }, expect: 'deny' },
  { name: '6 件目のポイントの detail 601 文字', edited: { ...EDITED, points: [1, 2, 3, 4, 5].map((i) => maxPoint(i)).concat([maxPoint(6, { detail: 'で'.repeat(601) })]) }, expect: 'deny' },
  { name: 'ポイントに未知のキー', edited: { ...EDITED, points: [maxPoint(1, { html: '<img onerror>' })] }, expect: 'deny' },
  { name: 'area が列挙外', edited: { ...EDITED, points: [maxPoint(1, { area: '株価' })] }, expect: 'deny' },
  { name: 'priority が列挙外', edited: { ...EDITED, points: [maxPoint(1, { priority: 'urgent' })] }, expect: 'deny' },
  { name: 'ポイントの title が数値', edited: { ...EDITED, points: [maxPoint(1, { title: 1 })] }, expect: 'deny' },
  { name: '下書きに未知の欄', edited: { ...EDITED, draft: { ...EDITED.draft, budget: '100万円' } }, expect: 'deny' },
  { name: '未確定事項の 1 件が数値', edited: { ...EDITED, draft: { ...EDITED.draft, openQuestions: [1] } }, expect: 'deny' },
  { name: '根拠に許可リスト外（送らない質問 q-infra）', edited: { ...EDITED, points: [maxPoint(1, { evidence: ['q-infra'] })] }, expect: 'deny' },
];
