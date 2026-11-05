import type { CmsPage } from '@/types';
import { daysAgo, daysFromNow, hoursAgo } from '@/services/time';

/** デモ用の画像（外部取得しないよう、生成した SVG を data URI で持つ） */
export const DEMO_IMAGES: { id: string; label: string; src: string }[] = [
  ['beans', '焙煎豆', '#7C4A1E', '#D6A86B'],
  ['cafe', '店内', '#334155', '#CBD5E1'],
  ['gift', 'ギフト', '#7F1D1D', '#E9C46A'],
  ['latte', 'ラテ', '#92400E', '#FDE68A'],
].map(([id, label, a, b]) => ({
  id,
  label,
  src:
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="800" height="450" fill="url(#g)"/><circle cx="600" cy="150" r="120" fill="#fff" fill-opacity=".12"/><circle cx="220" cy="330" r="80" fill="#fff" fill-opacity=".1"/><text x="40" y="410" font-family="sans-serif" font-size="28" fill="#fff" fill-opacity=".85">${label} — demo image</text></svg>`,
    ),
}));

export const seedPages = (): CmsPage[] => [
  {
    id: 'pg1', type: 'page', title: 'トップページ', slug: '/', status: 'published', authorId: 'm2',
    content: '<h2>一杯から、日常を少し特別に。</h2><p>ミナモ珈琲は、産地を訪ねて選んだ豆を、店舗で毎朝焙煎しています。</p>',
    publishedContent: '<h2>一杯から、日常を少し特別に。</h2><p>ミナモ珈琲は、産地を訪ねて選んだ豆を、店舗で毎朝焙煎しています。</p>',
    seoTitle: 'MINAMO COFFEE｜自家焙煎のスペシャルティコーヒー', seoDescription: '産地を訪ねて選んだ豆を毎朝焙煎。オンラインショップと法人ギフトも。',
    updatedAt: daysAgo(3), publishedAt: daysAgo(3),
  },
  {
    id: 'pg2', type: 'page', title: '法人ギフト', slug: '/shop/gift', status: 'review', authorId: 'm4', parentPath: '/shop',
    content: '<h2>想いを届ける、コーヒーギフト。</h2><p>周年記念・お歳暮・ノベルティに。50個から名入れに対応します。</p><ul><li>名入れ対応（50個〜）</li><li>のし・メッセージカード無料</li></ul>',
    publishedContent: '<h2>コーヒーギフト</h2><p>ギフトのご相談はお問い合わせください。</p>',
    seoTitle: '法人ギフト｜MINAMO COFFEE', seoDescription: '周年記念・お歳暮・ノベルティに。名入れ50個から対応。',
    updatedAt: hoursAgo(2), publishedAt: daysAgo(40),
  },
  {
    id: 'pg3', type: 'news', title: '冬季限定ブレンド「凪」発売のお知らせ', slug: '/journal/winter-blend', status: 'scheduled', authorId: 'm4',
    content: '<p>12月1日より、冬季限定ブレンド「凪」を発売します。深煎りの甘さとスパイスのような余韻をお楽しみください。</p>',
    seoTitle: '冬季限定ブレンド「凪」発売｜MINAMO COFFEE', seoDescription: '12月1日より冬季限定ブレンド「凪」を発売します。',
    updatedAt: hoursAgo(20), scheduledAt: daysFromNow(3),
  },
  {
    id: 'pg4', type: 'page', title: 'カフェ・店舗', slug: '/cafe', status: 'draft', authorId: 'm1',
    content: '<h2>焙煎の香りに包まれる場所。</h2><p>営業時間 8:00–19:00（火曜定休）</p>',
    seoTitle: '', seoDescription: '',
    updatedAt: daysAgo(1),
  },
  {
    id: 'pg5', type: 'news', title: '年末年始の営業について', slug: '/journal/holiday', status: 'published', authorId: 'm4',
    content: '<p>12月29日〜1月3日は休業いたします。オンラインショップのご注文は1月4日より順次発送します。</p>',
    publishedContent: '<p>12月29日〜1月3日は休業いたします。オンラインショップのご注文は1月4日より順次発送します。</p>',
    seoTitle: '年末年始の営業について｜MINAMO COFFEE', seoDescription: '年末年始の休業期間とオンラインショップの発送について。',
    updatedAt: daysAgo(6), publishedAt: daysAgo(6),
  },
];
