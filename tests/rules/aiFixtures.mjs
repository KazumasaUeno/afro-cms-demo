// AI 下書き（aiDrafts / aiUsage / 提案 v2）の Rules テスト用データ（docs/design/AI_REQUIREMENTS.md §5.3・§7、実装計画 §4 U1）。
// 上限の値は src/types/aiDraft.ts の AI_DRAFT_LIMITS と同じ（食い違いは mutation.test.mjs が Rules 本文と比べて検出する）。
// 文書は Rules を通さずに置く（withSecurityRulesDisabled）。書き込みの検査はテスト本体で本人の権限で行う。
import { Timestamp } from 'firebase/firestore';
import { ANSWERS, T0, approvalDoc, doc, seed, serverTimestamp, setDoc, stamp, updateDoc } from './fixtures.mjs';

export const AI_PATH = 'projects/p1/aiDrafts/requirements';

const SITE_KEYS = ['https', 'viewport', 'title-length', 'description', 'h1-count', 'alt-missing', 'page-size', 'response-time', 'sitemap', 'structured-data'];

export const GENERATED = {
  version: 2,
  hostname: 'example.co.jp',
  issue: 'スマホで見づらく、問い合わせがほとんど来ない',
  purposes: ['問い合わせを増やしたい', 'スマホ対応したい'],
  improves: ['スマホ表示'],
  competitors: ['competitor.example.jp'],
  siteCheck: { status: 'ok', fetchedAt: T0, passed: 7, total: 10, items: SITE_KEYS.map((key, i) => ({ key, ok: i < 7, value: i < 7 })) },
  origin: { kind: 'ai', promptVersion: 'PRM-REQ-001@1.0.0', model: 'claude-haiku-5-5' },
  summary: 'スマホでの見やすさと問い合わせ導線を優先して改善します。',
  points: [
    { id: 'ai1', area: 'スマホ表示', priority: 'high', title: 'スマホを主役にした設計', detail: 'viewport は設定済みだが本文の文字が小さい。', impact: '問い合わせの増加を狙う', evidence: ['viewport', 'q-issue'] },
  ],
  draft: {
    goal: '問い合わせを増やす', target: '近隣の 30〜40 代', contents: 'メニュー・店舗情報', features: '問い合わせフォーム',
    nonFunctional: 'スマホ対応', operation: '社内担当者が更新', schedule: '2027 年 3 月', openQuestions: ['公開日を確定する'],
  },
  flags: { unsupportedNumbers: [] },
};

/** generated の編集欄（開発者が「内容を確認した」で写した状態） */
export const editedOf = (g) => ({ summary: g.summary, points: g.points, draft: g.draft });
export const EDITED = editedOf(GENERATED);

/** generated のサーバー欄（flags を除く）＋ edited の 3 欄 = お客様へ出す提案（設計 §5.3・§7） */
export function proposalV2(g = GENERATED, e = editedOf(g)) {
  return {
    version: 2, hostname: g.hostname, issue: g.issue, purposes: g.purposes, improves: g.improves, competitors: g.competitors,
    siteCheck: g.siteCheck, origin: g.origin, summary: e.summary, points: e.points, draft: e.draft,
  };
}

// ---------------- 上限ちょうど（最大の payload。式の数・参照の数の計測にも使う） ----------------
const EVIDENCE5 = ['q-issue', 'q-purpose', 'viewport', 'https', 'structured-data'];
export const maxPoint = (i, over = {}) => ({
  id: String(i).padStart(40, 'p'), area: 'その他', priority: 'low',
  title: 'た'.repeat(80), detail: 'で'.repeat(600), impact: 'い'.repeat(200), evidence: EVIDENCE5, ...over,
});
export const MAX_EDITED = {
  summary: 'さ'.repeat(400),
  points: [1, 2, 3, 4, 5, 6].map((i) => maxPoint(i)),
  draft: {
    goal: 'ご'.repeat(800), target: 'た'.repeat(800), contents: 'こ'.repeat(800), features: 'き'.repeat(800),
    nonFunctional: 'ひ'.repeat(800), operation: 'う'.repeat(800), schedule: 'す'.repeat(800),
    openQuestions: Array.from({ length: 10 }, (_, i) => String(i).padEnd(200, 'み')),
  },
};
export const MAX_GENERATED = {
  ...GENERATED,
  hostname: 'h'.repeat(253), issue: 'あ'.repeat(600),
  purposes: ['問い合わせを増やしたい', '採用を強化したい', 'ブランドを刷新したい', 'EC売上を伸ばしたい', '更新を楽にしたい', 'スマホ対応したい'],
  improves: ['ファーストビュー', 'ナビゲーション', 'スマホ表示', '表示速度', '問い合わせ導線', '写真・ビジュアル', 'SEO', '更新のしやすさ'],
  competitors: ['a'.repeat(253), 'b'.repeat(253), 'c'.repeat(253)],
  siteCheck: { status: 'ok', fetchedAt: T0, passed: 6, total: 12, items: Array.from({ length: 12 }, (_, i) => ({ key: SITE_KEYS[i % 10], ok: i % 2 === 0, value: 'v'.repeat(200) })) },
  ...MAX_EDITED,
};

/** aiDrafts/requirements の文書（サーバーが書く形） */
export function aiDraftDoc({ generated = GENERATED, edited = EDITED, state = 'ready', omit = [] } = {}) {
  const d = {
    schemaVersion: 1, state, job: { state: 'idle' },
    answersHash: 'sha256:a', configHash: 'sha256:c',
    usage: { input: 19000, output: 6000, cacheRead: 0, costMicroUsd: 5000 },
    quota: { day: '2026-11-20', dayCount: 1, month: '2026-11', monthCount: 1 },
    discardLog: [],
    updatedAt: T0, updatedBy: 'server',
  };
  if (generated) d.generated = generated;
  if (edited) Object.assign(d, { edited, editedAt: T0, editedBy: 'devA' });
  for (const k of omit) delete d[k];
  return d;
}

/**
 * 既定の世界（fixtures.seed）に aiDrafts を足す。aiDraft: null で置かない。
 * proposal: analyzed 以降の requirements/current と承認の写しを v2 にする（既定は seed の v1 のまま）
 */
export async function seedAi(env, { reqState = 'draft', aiDraft = aiDraftDoc(), proposal = null, answers = null, usage = true } = {}) {
  await seed(env, { reqState });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    if (aiDraft) await setDoc(doc(db, AI_PATH), aiDraft);
    if (answers) {
      await updateDoc(doc(db, 'projects/p1/requirements/current'), { answers, answerMeta: Object.fromEntries(Object.keys(answers).map((k) => [k, { by: 'afro', at: T0 }])) });
    }
    if (proposal && reqState !== 'draft') {
      await updateDoc(doc(db, 'projects/p1/requirements/current'), { proposal });
      const a = answers ?? ANSWERS;
      await setDoc(doc(db, 'projects/p1/approvals/requirements-r1-submit'), { ...approvalDoc('devA', 'submit', 1, { answers: a, proposal }), at: T0 });
      if (reqState === 'approved') await setDoc(doc(db, 'projects/p1/approvals/requirements-r1-approve'), { ...approvalDoc('client1', 'approve', 1, { answers: a, proposal }), at: T0 });
    }
    if (usage) await setDoc(doc(db, 'aiUsage/202611'), { count: 3, costMicroUsd: 15000, byDay: { '2026-11-20': 3 }, byUid: { devA: 3 } });
  });
}

/** 開発者の編集の保存（画面が行う形）。over で項目を足す・上書きする */
export function editPayload(uid, edited, over = {}) {
  return { edited, editedAt: serverTimestamp(), editedBy: uid, ...stamp(uid), ...over };
}

export const PAST_TS = Timestamp.fromDate(new Date('2026-10-01T00:00:00Z'));
