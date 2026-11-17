import type { CmsPage } from '@/types';
import { daysAgo, daysFromNow, hoursAgo } from '@/services/time';
import { PROJECT_IMAGES, demoImageSrc } from './demoImages';

/**
 * MINAMO COFFEE の見本の写真（素材ドライブ・サイネージで使う）。
 * 以前は生成した SVG（グラデーションに「demo image」の文字）だったが、写真に置き換えた（2026-11-17 ユーザー指示「リアルっぽく」）。
 * 写真は public/demo-images/ に同梱（CC0・パブリックドメイン。出典は public/demo-images/CREDITS.md）。外部へは取りに行かない
 */
export const DEMO_IMAGES: { id: string; label: string; src: string }[] = PROJECT_IMAGES.p1.map((i) => ({ id: i.id, label: i.label, src: demoImageSrc(i) }));

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
