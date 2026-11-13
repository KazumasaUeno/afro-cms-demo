import type { CmsPage, DiagnosisReport, Display, MonthlyMetric, ProjectContent, SignageState, Slide, Stage } from '@/types';
import { daysAgo, daysFromNow, hoursAgo } from '@/services/time';
import { seedPages } from './cms';
import { DIAGNOSIS_CATEGORIES, MONTHLY_METRICS, NEXT_DIAGNOSIS_TEMPLATE, PAGE_PERFORMANCE, RENEWAL_MONTH, seedDiagnoses, TRAFFIC_SOURCES } from './insights';
import { seedSignage } from './signage';

/**
 * 案件ごとの公開後のデータ（ページ・お知らせ、AI 診断、サイネージ、アクセスの数値。0.30.0。2026-11-13 ユーザー指示）。
 * 以前は MINAMO COFFEE（p1）の 1 案件分だけで、どの案件を選んでも同じ内容が出ていた。
 * 初期データは案件の id で持つ（段階では決めない。MINAMO COFFEE はヒアリング前でも従来の見本を持ち、運用の段階になると見える）。
 * 見本の無い案件（新しく作った案件など）は空。すべて架空の内容で、数値はデモデータ（実測値ではない）。
 */

/** サイトの公開後（運用・改善の段階）か。ページ編集・公開承認・サイネージ・レポートはこの段階から使える */
export const isSiteLive = (stage: Stage): boolean => stage === 'operation' || stage === 'improvement';

export const emptySignage = (): SignageState => ({ displays: [], slides: [] });

export const emptyContent = (): ProjectContent => ({ pages: [], diagnoses: [], signage: emptySignage() });

/* ---------- アクセスの数値（デモデータ） ---------- */

export interface TrafficSource { name: string; value: number; color: string }
export interface PagePerformance { page: string; path: string; views: number; cvr: number; trend: number }

export interface ProjectMetrics {
  /** 月ごとのアクセス・問い合わせ（古い順。最後が今月の値） */
  monthly: MonthlyMetric[];
  /** リニューアル（公開）した月。monthly の 2 件目以降にある（前月と比べるため） */
  renewalMonth: string;
  traffic: TrafficSource[];
  pagePerformance: PagePerformance[];
}

/** 流入経路の色は MINAMO COFFEE の見本と同じ対応（経路ごとに同じ色） */
const SOURCE_COLOR: Record<string, string> = Object.fromEntries(TRAFFIC_SOURCES.map((s) => [s.name, s.color]));
const traffic = (rows: [string, number][]): TrafficSource[] => rows.map(([name, value]) => ({ name, value, color: SOURCE_COLOR[name] ?? '#94A3B8' }));
const monthly = (rows: [string, number, number][]): MonthlyMetric[] =>
  rows.map(([month, sessions, inquiries]) => ({ month, sessions, inquiries, cvr: Math.round((inquiries / sessions) * 10000) / 100 }));
const perf = (rows: [string, string, number, number, number][]): PagePerformance[] =>
  rows.map(([page, path, views, cvr, trend]) => ({ page, path, views, cvr, trend }));

const METRICS: Record<string, () => ProjectMetrics> = {
  // MINAMO COFFEE は従来の見本（data/insights.ts。営業資料の PresentPage も同じ値を使う）
  p1: () => ({ monthly: MONTHLY_METRICS, renewalMonth: RENEWAL_MONTH, traffic: TRAFFIC_SOURCES, pagePerformance: PAGE_PERFORMANCE }),
  // ソラノ精機: 2026/09 に公開（運用の段階）。BtoB なので訪問数は少なく、技術相談が増えた想定
  p5: () => ({
    monthly: monthly([
      ['2026/04', 2100, 6], ['2026/05', 2050, 5], ['2026/06', 2200, 6], ['2026/07', 2150, 6],
      ['2026/08', 1980, 5], ['2026/09', 2900, 11], ['2026/10', 3400, 15],
    ]),
    renewalMonth: '2026/09',
    traffic: traffic([['自然検索', 58], ['直接流入', 17], ['参照サイト', 12], ['広告', 8], ['SNS', 5]]),
    pagePerformance: perf([
      ['トップ', '/', 6400, 0.4, 18],
      ['製品情報', '/products', 4100, 1.1, 26],
      ['精密シャフト', '/products/shaft', 2300, 1.6, 31],
      ['加工事例', '/cases', 1900, 2.2, 44],
      ['設備一覧', '/equipment', 1200, 0.5, 9],
    ]),
  }),
  // まちの学び舎: 2026/07 に公開（改善の段階・第1回診断の後）。問い合わせは講座の申込
  p6: () => ({
    monthly: monthly([
      ['2026/02', 3100, 18], ['2026/03', 3600, 22], ['2026/04', 4200, 27], ['2026/05', 3500, 19], ['2026/06', 3300, 18],
      ['2026/07', 4600, 31], ['2026/08', 5200, 38], ['2026/09', 5800, 44], ['2026/10', 6100, 47],
    ]),
    renewalMonth: '2026/07',
    traffic: traffic([['自然検索', 41], ['SNS', 29], ['直接流入', 16], ['参照サイト', 9], ['広告', 5]]),
    pagePerformance: perf([
      ['トップ', '/', 9800, 0.6, 21],
      ['講座一覧', '/courses', 7200, 1.4, 35],
      ['こどもの講座', '/courses/kids', 3900, 1.9, 28],
      ['受講者の声', '/voice', 2100, 0.8, 12],
      ['寄付のお願い', '/about/donate', 900, 0.4, -3],
    ]),
  }),
  // はなみ旅館: 2026/03 に公開（春の観光シーズン前。ヒアリングの希望どおり）。問い合わせは自社サイトからの予約
  p8: () => ({
    monthly: monthly([
      ['2025/12', 9800, 42], ['2026/01', 10400, 46], ['2026/02', 9100, 38], ['2026/03', 12600, 71], ['2026/04', 14200, 86], ['2026/05', 15100, 95],
      ['2026/06', 13800, 88], ['2026/07', 16900, 112], ['2026/08', 18400, 127], ['2026/09', 15700, 106], ['2026/10', 17200, 121],
    ]),
    renewalMonth: '2026/03',
    traffic: traffic([['自然検索', 39], ['参照サイト', 24], ['SNS', 18], ['直接流入', 12], ['広告', 7]]),
    pagePerformance: perf([
      ['トップ', '/', 24800, 0.5, 15],
      ['客室', '/rooms', 15600, 0.9, 22],
      ['露天風呂付き客室', '/rooms/onsen', 9400, 1.7, 38],
      ['宿泊プラン', '/plans', 7800, 1.4, 19],
      ['English', '/en', 3600, 0.6, -4],
    ]),
  }),
};

/** 案件のアクセスの数値（見本の無い案件は undefined。画面は段階と合わせて出し分ける） */
export function metricsOf(projectId: string): ProjectMetrics | undefined {
  return METRICS[projectId]?.();
}

/* ---------- ページ・お知らせ ---------- */

type PageSeed = Omit<CmsPage, 'publishedContent' | 'publishedAt'> & { publishedAt?: string; publishedContent?: string };
/** 公開中のページは、公開版の内容（Before/After 比較用）を同じ内容にする */
const published = (p: PageSeed): CmsPage => ({ ...p, publishedContent: p.publishedContent ?? p.content, publishedAt: p.publishedAt ?? p.updatedAt });

const PAGES: Record<string, () => CmsPage[]> = {
  p1: seedPages,
  // 承認待ち 1 件（案件一覧の承認待ちの数と同じ）と、予約公開の「新製品のお知らせ」（最近の動き a6）
  p5: () => [
    published({
      id: 'p5-pg1', type: 'page', title: 'トップページ', slug: '/', status: 'published', authorId: 'm4',
      content: '<h2>1 ミクロンの精度を、試作 1 個から。</h2><p>ソラノ精機は、精密シャフトと試作加工を得意とする金属加工メーカーです。図面 1 枚からご相談ください。</p>',
      seoTitle: 'SORANO Precision｜精密加工・試作のソラノ精機', seoDescription: '±1 ミクロンの精密加工と、試作 1 個からの短納期。図面を添えて技術相談ができます。',
      updatedAt: daysAgo(20),
    }),
    {
      id: 'p5-pg2', type: 'page', title: '加工事例', slug: '/cases', status: 'review', authorId: 'm4',
      content: '<h2>加工事例</h2><p>業界・材質から、これまでの加工事例を探せます。</p><ul><li>医療機器向け ステンレスシャフト（φ3mm・公差 ±1μm）</li><li>半導体装置向け アルミ治具（試作 2 個・5 日で納品）</li><li>産業ロボット向け 減速機部品（月産 500 個）</li></ul>',
      publishedContent: '<h2>加工事例</h2><p>これまでの加工事例をご紹介します。</p><ul><li>医療機器向け ステンレスシャフト</li></ul>',
      seoTitle: '加工事例｜SORANO Precision', seoDescription: '医療機器・半導体装置・産業ロボット向けの精密加工の事例を、業界・材質から探せます。',
      updatedAt: hoursAgo(5), publishedAt: daysAgo(20),
    },
    {
      id: 'p5-pg3', type: 'news', title: '新製品のお知らせ', slug: '/news/new-shaft', status: 'scheduled', authorId: 'm4',
      content: '<p>高精度ステンレスシャフト「SP-3」の受注を開始します。φ2〜φ8mm、公差 ±1μm に対応し、試作 1 本からご注文いただけます。</p>',
      seoTitle: '新製品のお知らせ｜SORANO Precision', seoDescription: '高精度ステンレスシャフト「SP-3」の受注を開始します。',
      updatedAt: daysAgo(2), scheduledAt: daysFromNow(5),
    },
    published({
      id: 'p5-pg4', type: 'page', title: '製品情報', slug: '/products', status: 'published', authorId: 'm3',
      content: '<h2>製品情報</h2><p>精密シャフト・試作加工の仕様表を、スマホでもそのまま読めるようにまとめました。</p>',
      seoTitle: '製品情報｜SORANO Precision', seoDescription: '精密シャフトと試作加工の仕様・対応材質・納期の目安。',
      updatedAt: daysAgo(20),
    }),
    published({
      id: 'p5-pg5', type: 'news', title: '年末年始休業のお知らせ', slug: '/news/holiday', status: 'published', authorId: 'm4',
      content: '<p>12月28日〜1月4日は休業いたします。期間中のお問い合わせは、1月5日より順にご返信します。</p>',
      seoTitle: '年末年始休業のお知らせ｜SORANO Precision', seoDescription: '年末年始の休業期間とお問い合わせへのご返信について。',
      updatedAt: daysAgo(9),
    }),
    {
      id: 'p5-pg6', type: 'page', title: '設備一覧', slug: '/equipment', status: 'draft', authorId: 'm3',
      content: '<h2>設備一覧</h2><p>5 軸マシニングセンタ 4 台、CNC 旋盤 6 台、三次元測定機 2 台。</p>',
      seoTitle: '', seoDescription: '',
      updatedAt: daysAgo(1),
    },
  ],
  p6: () => [
    published({
      id: 'p6-pg1', type: 'page', title: 'トップページ', slug: '/', status: 'published', authorId: 'm4',
      content: '<h2>まちで、もう一度学ぶ。</h2><p>まちの学び舎は、地域の専門家が講師をつとめる市民講座です。社会人の学び直しから、こどもの習い事まで。</p>',
      seoTitle: 'Machi no Manabiya｜地域の市民講座 まちの学び舎', seoDescription: '地域の専門家が講師の市民講座。社会人の学び直しと、こどもの習い事を手ごろな受講料で。',
      updatedAt: daysAgo(10),
    }),
    published({
      id: 'p6-pg2', type: 'page', title: '講座一覧', slug: '/courses', status: 'published', authorId: 'm4',
      content: '<h2>講座一覧</h2><p>分野・曜日・対象から、参加したい講座を探せます。</p>',
      seoTitle: '講座一覧｜Machi no Manabiya', seoDescription: '分野・曜日・対象から市民講座を探して、そのまま申し込めます。',
      updatedAt: daysAgo(10),
    }),
    published({
      id: 'p6-pg3', type: 'news', title: '冬期講座の申込受付を開始しました', slug: '/news/winter-courses', status: 'published', authorId: 'm4',
      content: '<p>1月開講の冬期講座（全 12 講座）の申込受付を開始しました。定員になり次第締め切ります。</p>',
      seoTitle: '冬期講座の申込受付を開始しました｜Machi no Manabiya', seoDescription: '1月開講の冬期講座（全 12 講座）の申込受付を開始しました。',
      updatedAt: daysAgo(5),
    }),
    {
      id: 'p6-pg4', type: 'page', title: '受講者の声', slug: '/voice', status: 'draft', authorId: 'm2',
      content: '<h2>受講者の声</h2><p>「仕事帰りに通えて、同じ目標の仲間ができました」（社会人の講座・40 代）</p>',
      seoTitle: '', seoDescription: '',
      updatedAt: daysAgo(3),
    },
    {
      id: 'p6-pg5', type: 'news', title: '年末年始の事務局休業について', slug: '/news/holiday', status: 'scheduled', authorId: 'm4',
      content: '<p>12月27日〜1月5日は事務局を休業します。講座の申込はサイトから受け付けています。</p>',
      seoTitle: '年末年始の事務局休業について｜Machi no Manabiya', seoDescription: '年末年始の事務局の休業期間について。',
      updatedAt: daysAgo(1), scheduledAt: daysFromNow(10),
    },
  ],
  p8: () => [
    published({
      id: 'p8-pg1', type: 'page', title: 'トップページ', slug: '/', status: 'published', authorId: 'm4',
      content: '<h2>庭を眺める、百二十年の宿。</h2><p>はなみ旅館は、全室から庭を望む老舗旅館です。地元の食材の会席料理と、露天風呂でおもてなしします。</p>',
      seoTitle: 'Hanami Ryokan｜全室から庭を望む老舗旅館 はなみ旅館', seoDescription: '創業 120 年。全室から庭が見える客室と、地元の食材の会席料理。空室の確認からご予約まで。',
      updatedAt: daysAgo(14),
    }),
    published({
      id: 'p8-pg2', type: 'page', title: '客室', slug: '/rooms', status: 'published', authorId: 'm2',
      content: '<h2>客室</h2><p>客室ごとの写真と料金を一覧でご覧いただけます。露天風呂付き客室もございます。</p>',
      seoTitle: '客室｜Hanami Ryokan', seoDescription: '庭を望む和室と露天風呂付き客室。客室ごとの写真と料金。',
      updatedAt: daysAgo(30),
    }),
    published({
      id: 'p8-pg3', type: 'page', title: '宿泊プラン', slug: '/plans', status: 'published', authorId: 'm4',
      content: '<h2>宿泊プラン</h2><p>記念日のお祝いに、お花とケーキをご用意する「記念日プラン」を新しくご用意しました。</p>',
      seoTitle: '宿泊プラン｜Hanami Ryokan', seoDescription: '記念日プラン・会席料理のプランなど、はなみ旅館の宿泊プラン。',
      updatedAt: daysAgo(21),
    }),
    published({
      id: 'p8-pg4', type: 'news', title: '冬の会席料理のご案内', slug: '/news/winter-kaiseki', status: 'published', authorId: 'm4',
      content: '<p>12月より、寒ぶりと冬野菜を使った冬の会席料理をお出しします。</p>',
      seoTitle: '冬の会席料理のご案内｜Hanami Ryokan', seoDescription: '12月より、寒ぶりと冬野菜を使った冬の会席料理をお出しします。',
      updatedAt: daysAgo(12),
    }),
    {
      id: 'p8-pg5', type: 'news', title: '年末年始のご予約について', slug: '/news/new-year', status: 'scheduled', authorId: 'm4',
      content: '<p>12月30日〜1月3日は年末年始の特別料金となります。ご予約はお早めにどうぞ。</p>',
      seoTitle: '年末年始のご予約について｜Hanami Ryokan', seoDescription: '年末年始の特別料金とご予約について。',
      updatedAt: daysAgo(1), scheduledAt: daysFromNow(6),
    },
    {
      id: 'p8-pg6', type: 'page', title: 'English', slug: '/en', status: 'draft', authorId: 'm2',
      content: '<h2>Welcome to Hanami Ryokan</h2><p>A 120-year-old ryokan where every room looks out on the garden.</p>',
      seoTitle: '', seoDescription: '',
      updatedAt: daysAgo(2),
    },
  ],
};

/* ---------- AI 診断（新しい順。[0] が最新） ---------- */

const scores = (list: number[]) => list.map((score, i) => ({ name: DIAGNOSIS_CATEGORIES[i].name, score }));

const DIAGNOSES: Record<string, () => DiagnosisReport[]> = {
  p1: seedDiagnoses,
  // 第1回の診断（スコア 74。最近の動き a7 と同じ）
  p6: () => [
    {
      id: 'p6-d1', at: daysAgo(4), cycle: 1, score: 74, isDemo: true,
      categories: scores([70, 76, 68, 79, 81, 72, 66, 80]),
      findings: [
        { title: '講座一覧の写真が重く、スマホで表示が遅い', detail: '写真を WebP に変換し、一覧では小さい画像を読み込むようにしましょう。', priority: 'high' },
        { title: '申込フォームの入力項目が多い', detail: '必須を 5 項目に絞り、住所などは受講の確定後に伺う形にしましょう。', priority: 'high' },
        { title: 'こどもの講座への入口がトップに無い', detail: '保護者向けに「こどもの講座」の入口をファーストビューの下に置きましょう。', priority: 'medium' },
        { title: '講師紹介ページのタイトルが重複している', detail: '講師ごとにページのタイトルと説明文を分けましょう。', priority: 'low' },
      ],
    },
  ],
  p8: () => [
    {
      id: 'p8-d2', at: daysAgo(8), cycle: 2, score: 79, isDemo: true,
      categories: scores([76, 82, 78, 74, 85, 80, 71, 84]),
      findings: [
        { title: '冬の検索キーワードに合う記事が少ない', detail: '「雪見露天」「冬の会席」など季節の記事を 2 本追加すると効果的です。', priority: 'high' },
        { title: '宿泊プランを比べにくい', detail: 'プランの料金・食事・特典を表で並べましょう。', priority: 'medium' },
        { title: 'English ページから予約へ進めない', detail: '英語ページにも空室確認のボタンを置きましょう。', priority: 'medium' },
        { title: 'OGP 画像が一部ページで未設定', detail: 'SNS で共有された際の見え方を統一しましょう。', priority: 'low' },
      ],
    },
    {
      id: 'p8-d1', at: daysAgo(128), cycle: 1, score: 68, isDemo: true,
      categories: scores([64, 72, 60, 70, 78, 66, 55, 79]),
      findings: [
        { title: '客室ページの画像が大きく、表示が遅い', detail: '客室の写真を WebP に変換し、LCP を改善しましょう。', priority: 'high' },
        { title: '予約ボタンがスクロールしないと見えない', detail: 'スマホでは画面の下に「空室を確認」を固定しましょう。', priority: 'high' },
        { title: '英語ページへの入口が無い', detail: 'ヘッダーに English の切り替えを置きましょう。', priority: 'medium' },
      ],
    },
  ],
};

/** 次回診断（シミュレーション）で返す結果のひな形。MINAMO COFFEE 以外の案件で MINAMO の提案が出ないよう、案件ごとに持つ */
const NEXT_DIAGNOSIS: Record<string, Omit<DiagnosisReport, 'id' | 'at' | 'cycle'>> = {
  p1: NEXT_DIAGNOSIS_TEMPLATE,
  p6: {
    score: 81, isDemo: true,
    categories: scores([78, 82, 80, 81, 83, 84, 75, 82]),
    findings: [
      { title: '受講者の声のページが未公開', detail: '下書きのまま止まっています。写真と一緒に公開すると、申込の後押しになります。', priority: 'high' },
      { title: '寄付のお願いのページの流入が減少傾向', detail: '活動報告から寄付のページへ案内しましょう。', priority: 'medium' },
      { title: '講座の終了後もページが残っている', detail: '終了した講座は「次回の開講予定」に切り替えましょう。', priority: 'low' },
    ],
  },
  p8: {
    score: 84, isDemo: true,
    categories: scores([82, 86, 83, 80, 88, 85, 77, 87]),
    findings: [
      { title: '年末年始のプランへの導線が弱い', detail: 'トップのお知らせから年末年始のプランへ直接案内しましょう。', priority: 'high' },
      { title: '露天風呂付き客室の写真が少ない', detail: '季節ごとの写真を 3 枚以上に増やしましょう。', priority: 'medium' },
      { title: 'English ページの説明が短い', detail: 'アクセスと温泉の入り方を英語で補いましょう。', priority: 'low' },
    ],
  },
};

const GENERIC_NEXT_DIAGNOSIS: Omit<DiagnosisReport, 'id' | 'at' | 'cycle'> = {
  score: 78, isDemo: true,
  categories: scores([74, 80, 76, 75, 82, 81, 72, 83]),
  findings: [
    { title: 'お問い合わせへの導線が弱い', detail: '全ページの下に問い合わせのボタンを置きましょう。', priority: 'high' },
    { title: '画像の容量が大きいページがある', detail: '画像を WebP に変換し、表示を速くしましょう。', priority: 'medium' },
    { title: 'OGP 画像が一部ページで未設定', detail: 'SNS で共有された際の見え方を統一しましょう。', priority: 'low' },
  ],
};

export const nextDiagnosisFor = (projectId: string): Omit<DiagnosisReport, 'id' | 'at' | 'cycle'> => NEXT_DIAGNOSIS[projectId] ?? GENERIC_NEXT_DIAGNOSIS;

/* ---------- サイネージ ---------- */

/** 配信済みの端末（流す内容と配信した内容が同じ） */
const deliveredDisplay = (d: Omit<Display, 'deliveredSlideIds' | 'deliveredSlides'>, slides: Slide[]): Display => ({
  ...d,
  deliveredSlideIds: [...d.slideIds],
  deliveredSlides: Object.fromEntries(d.slideIds.map((id) => [id, slides.find((s) => s.id === id)!])),
});

const SIGNAGE: Record<string, () => SignageState> = {
  p1: seedSignage,
  // ソラノ精機（製造業）は店頭の画面を使っていない（端末 0 台）
  p6: () => {
    const slides: Slide[] = [
      {
        id: 'p6-sl1', template: 'promo', title: '冬期講座 受付中', body: '1月開講の 12 講座。社会人の学び直しから、こどもの習い事まで。',
        accent: 'night', durationSec: 10, sourcePageId: 'p6-pg3', updatedAt: daysAgo(5),
      },
    ];
    return {
      slides,
      displays: [deliveredDisplay({
        id: 'p6-ds1', name: '受付ロビー', location: '事務局の受付の横', orientation: 'landscape', online: true, lastSeenAt: hoursAgo(0.05), slideIds: ['p6-sl1'], deliveredAt: daysAgo(5),
      }, slides)],
    };
  },
  // はなみ旅館: ロビーの画面で、季節の料理・日帰り入浴・お知らせを流す
  p8: () => {
    const slides: Slide[] = [
      {
        id: 'p8-sl1', template: 'promo', title: '冬の会席 はじまりました', body: '寒ぶりと冬野菜を使った、季節の会席料理をお楽しみください。',
        accent: 'berry', image: 'gift', durationSec: 10, sourcePageId: 'p8-pg4', updatedAt: daysAgo(12),
      },
      {
        id: 'p8-sl2', template: 'menu', title: '日帰り入浴 13:00–17:00', body: 'タオルはフロントでお渡しします',
        items: [{ name: '大人', price: 1200 }, { name: 'こども（小学生まで）', price: 600 }, { name: '貸切露天風呂（50分）', price: 3300 }],
        accent: 'leaf', durationSec: 12, updatedAt: daysAgo(20),
      },
      {
        id: 'p8-sl3', template: 'news', title: 'チェックアウトは 11:00 です', body: 'お荷物は帳場でお預かりします。お帰りの際はフロントへお声がけください。',
        accent: 'night', durationSec: 8, updatedAt: daysAgo(20),
      },
    ];
    return {
      slides,
      displays: [deliveredDisplay({
        id: 'p8-ds1', name: 'ロビー', location: '帳場の横（横置き）', orientation: 'landscape', online: true, lastSeenAt: hoursAgo(0.03),
        slideIds: ['p8-sl1', 'p8-sl2', 'p8-sl3'], deliveredAt: daysAgo(2),
      }, slides)],
    };
  },
};

/** 案件の公開後のデータの初期値（見本の無い案件は空） */
export function seedContentFor(projectId: string): ProjectContent {
  return {
    pages: PAGES[projectId]?.() ?? [],
    diagnoses: DIAGNOSES[projectId]?.() ?? [],
    signage: SIGNAGE[projectId]?.() ?? emptySignage(),
  };
}
