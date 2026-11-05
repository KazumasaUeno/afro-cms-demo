import type { AnswerValue, ProposalPoint } from '@/types';
import { PROPOSAL_LIBRARY } from '@/data/requirements';

/** 目的（きっかけ）から、関連する改善領域への重み */
const PURPOSE_TO_AREAS: Record<string, string[]> = {
  '問い合わせを増やしたい': ['問い合わせ導線', 'ファーストビュー'],
  '採用を強化したい': ['ナビゲーション', '写真・ビジュアル'],
  'ブランドを刷新したい': ['写真・ビジュアル', 'ファーストビュー'],
  'EC売上を伸ばしたい': ['問い合わせ導線', '表示速度'],
  '更新を楽にしたい': ['更新のしやすさ'],
  'スマホ対応したい': ['スマホ表示'],
};

const BASE: Record<ProposalPoint['priority'], number> = { high: 1.5, medium: 1, low: 0.5 };

export interface Proposal {
  hostname: string;
  issue: string;
  purposes: string[];
  improves: string[];
  competitors: string[];
  /** 現状スコア（0-100、デモ用の決定的な値） */
  currentScore: number;
  /** 改善後の見込みスコア */
  projectedScore: number;
  points: ProposalPoint[];
}

const asArray = (v: AnswerValue | undefined): string[] => (Array.isArray(v) ? v : v ? [v] : []);
const asString = (v: AnswerValue | undefined): string => (Array.isArray(v) ? v.join('、') : v ?? '');

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'your-site.example.jp';
  }
}

/** 文字列から 0..n-1 の決定的な値（同じ URL なら毎回同じスコアにする） */
function hash(s: string, n: number): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % n;
}

/**
 * 回答から改善提案を組み立てる（AI 生成ではなく、事前に用意した提案の選択・並べ替え）。
 * - 改善したいポイントに直接一致: +3
 * - きっかけ（目的）から関連: +2
 * - 上位3件を「高」、次の2件を「中」、残りを「低」とし、6件を返す
 */
export function buildProposal(answers: Record<string, AnswerValue>, competitors: string[]): Proposal {
  const url = asString(answers['q-url']);
  const hostname = hostnameOf(url);
  const purposes = asArray(answers['q-purpose']);
  const improves = asArray(answers['q-improve']);
  const issue = asString(answers['q-issue']).trim();

  const scored = PROPOSAL_LIBRARY.map((p, i) => {
    let score = BASE[p.priority] - i * 0.01;
    if (improves.includes(p.area)) score += 3;
    for (const purpose of purposes) if (PURPOSE_TO_AREAS[purpose]?.includes(p.area)) score += 2;
    return { p, score };
  }).sort((a, b) => b.score - a.score);

  const points = scored.slice(0, 6).map(({ p }, i): ProposalPoint => {
    const priority: ProposalPoint['priority'] = i < 3 ? 'high' : i < 5 ? 'medium' : 'low';
    const detail = i === 0 ? `${hostname} の現状を踏まえ、${p.detail}` : p.detail;
    return { ...p, priority, detail };
  });

  const currentScore = 46 + hash(hostname, 18);
  const projectedScore = Math.min(96, currentScore + 24 + Math.min(improves.length, 4) * 2);

  return { hostname, issue, purposes, improves, competitors: competitors.map(hostnameOf), currentScore, projectedScore, points };
}
