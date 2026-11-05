import type { DiagnosisReport, MonthlyMetric } from '@/types';
import { daysAgo } from '@/services/time';

/** すべてデモデータ（実測値ではない）。リニューアルは 2026年5月の想定 */
export const MONTHLY_METRICS: MonthlyMetric[] = [
  { month: '2025/12', sessions: 8200, inquiries: 21, cvr: 0.26 },
  { month: '2026/01', sessions: 7900, inquiries: 19, cvr: 0.24 },
  { month: '2026/02', sessions: 8400, inquiries: 22, cvr: 0.26 },
  { month: '2026/03', sessions: 9100, inquiries: 24, cvr: 0.26 },
  { month: '2026/04', sessions: 9300, inquiries: 27, cvr: 0.29 },
  { month: '2026/05', sessions: 11800, inquiries: 41, cvr: 0.35 },
  { month: '2026/06', sessions: 13200, inquiries: 52, cvr: 0.39 },
  { month: '2026/07', sessions: 14100, inquiries: 58, cvr: 0.41 },
  { month: '2026/08', sessions: 13600, inquiries: 61, cvr: 0.45 },
  { month: '2026/09', sessions: 15400, inquiries: 70, cvr: 0.45 },
  { month: '2026/10', sessions: 16900, inquiries: 81, cvr: 0.48 },
];

export const RENEWAL_MONTH = '2026/05';

export const TRAFFIC_SOURCES = [
  { name: '自然検索', value: 46, color: '#4F7CFF' },
  { name: 'SNS', value: 21, color: '#8B7CF6' },
  { name: '直接流入', value: 18, color: '#14B8A6' },
  { name: '広告', value: 9, color: '#F59E0B' },
  { name: '参照サイト', value: 6, color: '#94A3B8' },
];

export const PAGE_PERFORMANCE = [
  { page: 'トップ', path: '/', views: 21400, cvr: 0.52, trend: 12 },
  { page: 'オンラインショップ', path: '/shop', views: 12800, cvr: 1.8, trend: 24 },
  { page: '法人ギフト', path: '/shop/gift', views: 6100, cvr: 2.6, trend: 41 },
  { page: 'カフェ・店舗', path: '/cafe', views: 5300, cvr: 0.9, trend: 8 },
  { page: 'ジャーナル', path: '/journal', views: 4200, cvr: 0.3, trend: -6 },
];

/** 資料「全8カテゴリー60問」 */
export const DIAGNOSIS_CATEGORIES = [
  { name: '集客・SEO', count: 9 },
  { name: 'ファーストビュー', count: 6 },
  { name: '導線・CV', count: 9 },
  { name: 'コンテンツ', count: 8 },
  { name: 'デザイン', count: 7 },
  { name: 'スマホ対応', count: 7 },
  { name: '表示速度', count: 7 },
  { name: '信頼性・安全', count: 7 },
];
export const TOTAL_DIAGNOSIS_QUESTIONS = DIAGNOSIS_CATEGORIES.reduce((s, c) => s + c.count, 0); // 60

export const seedDiagnoses = (): DiagnosisReport[] => [
  {
    id: 'd1', at: daysAgo(62), cycle: 1, score: 71, isDemo: true,
    categories: [62, 78, 66, 70, 80, 74, 58, 81].map((score, i) => ({ name: DIAGNOSIS_CATEGORIES[i].name, score })),
    findings: [
      { title: '画像の容量が大きく、スマホで表示が遅い', detail: 'トップの画像を WebP に変換し、LCP を改善しましょう。', priority: 'high' },
      { title: '法人ギフトへの導線が弱い', detail: 'トップに法人向けの入口を追加しましょう。', priority: 'medium' },
    ],
  },
];

/** 次回診断（シミュレーション）で返す結果のひな形 */
export const NEXT_DIAGNOSIS_TEMPLATE: Omit<DiagnosisReport, 'id' | 'at' | 'cycle'> = {
  score: 82, isDemo: true,
  categories: [76, 84, 81, 72, 86, 88, 79, 82].map((score, i) => ({ name: DIAGNOSIS_CATEGORIES[i].name, score })),
  findings: [
    { title: 'ジャーナル記事の流入が減少傾向', detail: '直近2か月で −6%。季節の話題（冬ギフト・新ブレンド）で記事を2本追加すると効果的です。', priority: 'high' },
    { title: '法人ギフトのフォーム離脱率が高い', detail: '見積もり項目を任意にし、電話での相談ボタンを並べて設置しましょう。', priority: 'high' },
    { title: 'カフェページの予約導線', detail: '営業時間の下に予約ボタンを配置し、Googleマップを埋め込みます。', priority: 'medium' },
    { title: 'OGP画像が一部ページで未設定', detail: 'SNS で共有された際の見え方を統一しましょう。', priority: 'low' },
  ],
};
