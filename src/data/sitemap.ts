import type { SitemapEdge, SitemapNode, SitemapState } from '@/types';

const n = (id: string, x: number, y: number, label: string, path: string, kind: SitemapNode['data']['kind'], reason?: string): SitemapNode => ({
  id, position: { x, y }, data: { label, path, kind, reason },
});
const e = (source: string, target: string): SitemapEdge => ({ id: `${source}-${target}`, source, target });

/** 現行サイト（課題: 階層が深い・メニュー過多・問い合わせが奥） */
const beforeNodes: SitemapNode[] = [
  n('b-home', 360, 0, 'トップ', '/', 'home'),
  n('b-about', 0, 140, '会社概要', '/company', 'section'),
  n('b-greet', -80, 280, '代表挨拶', '/company/greeting', 'page'),
  n('b-hist', 80, 280, '沿革', '/company/history', 'page'),
  n('b-prod', 260, 140, '商品一覧', '/products', 'section'),
  n('b-bean', 200, 280, 'コーヒー豆', '/products/beans', 'page'),
  n('b-gift', 340, 280, 'ギフト', '/products/gift', 'page'),
  n('b-news', 500, 140, 'お知らせ', '/news', 'section'),
  n('b-info', 720, 140, 'その他', '/info', 'section'),
  n('b-faq', 640, 280, 'よくある質問', '/info/faq', 'page'),
  n('b-contact', 800, 280, 'お問い合わせ', '/info/contact', 'page', '「その他」の下にあり、到達まで3クリック必要'),
  n('b-access', 720, 420, 'アクセス', '/info/contact/access', 'page'),
];
const beforeEdges = [
  e('b-home', 'b-about'), e('b-about', 'b-greet'), e('b-about', 'b-hist'),
  e('b-home', 'b-prod'), e('b-prod', 'b-bean'), e('b-prod', 'b-gift'),
  e('b-home', 'b-news'), e('b-home', 'b-info'), e('b-info', 'b-faq'), e('b-info', 'b-contact'), e('b-contact', 'b-access'),
];

/** 改善後（目的別の入口・CTAを第1階層へ） */
const afterNodes: SitemapNode[] = [
  n('a-home', 420, 0, 'トップ', '/', 'home', 'ファーストビューに主力商品と「オンラインで購入」を配置'),
  n('a-story', 0, 150, 'ストーリー', '/story', 'section', '会社概要・代表挨拶・沿革を1ページの物語に統合'),
  n('a-shop', 200, 150, 'オンラインショップ', '/shop', 'section', '商品一覧を購入導線に直結'),
  n('a-beans', 120, 300, 'シングルオリジン', '/shop/beans', 'page'),
  n('a-gift', 280, 300, '法人ギフト', '/shop/gift', 'new', '売上の4割を占める法人ギフトを独立ページ化'),
  n('a-cafe', 420, 150, 'カフェ・店舗', '/cafe', 'new', '来店予約の需要に対応。アクセスを統合'),
  n('a-journal', 620, 150, 'ジャーナル', '/journal', 'section', 'お知らせを読み物化し、SEO流入を狙う'),
  n('a-faq', 820, 150, 'よくある質問', '/faq', 'page', '第1階層へ移動'),
  n('a-contact', 420, 300, 'ご相談・お問い合わせ', '/contact', 'cta', '全ページから1クリックで到達'),
];
const afterEdges = [
  e('a-home', 'a-story'), e('a-home', 'a-shop'), e('a-shop', 'a-beans'), e('a-shop', 'a-gift'),
  e('a-home', 'a-cafe'), e('a-home', 'a-journal'), e('a-home', 'a-faq'), e('a-home', 'a-contact'),
];

export const seedSitemap = (): SitemapState => ({
  before: { nodes: beforeNodes, edges: beforeEdges },
  after: { nodes: afterNodes, edges: afterEdges },
});
