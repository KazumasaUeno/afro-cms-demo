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

/** MINAMO COFFEE（p1）のサイトマップ（従来の見本） */
export const seedSitemap = (): SitemapState => ({
  before: { nodes: beforeNodes, edges: beforeEdges },
  after: { nodes: afterNodes, edges: afterEdges },
});

/* ---------- 案件ごとのサイトマップ（0.29.5。2026-11-12 ユーザー決定「デザイン案は案件ごと」） ---------- */

/** [キー, ページ名, パス, 種類, AI の理由, 親のキー（省略 = トップの直下）]。先頭はトップ */
type Spec = [string, string, string, SitemapNode['data']['kind'], string?, string?];

/** 仕様の並びから、トップ → 第1階層 → 第2階層の木に配置する（第1階層は 220px 間隔、子は親の下に 160px 間隔） */
function tree(prefix: 'b' | 'a', specs: Spec[]): { nodes: SitemapNode[]; edges: SitemapEdge[] } {
  const [home, ...rest] = specs;
  const id = (key: string) => `${prefix}-${key}`;
  const first = rest.filter((s) => !s[5]);
  const pos = new Map<string, number>();
  first.forEach((s, i) => pos.set(s[0], i * 220));
  const nodes: SitemapNode[] = [n(id(home[0]), ((first.length - 1) * 220) / 2, 0, home[1], home[2], home[3], home[4])];
  const edges: SitemapEdge[] = [];
  first.forEach((s) => {
    nodes.push(n(id(s[0]), pos.get(s[0]) ?? 0, 150, s[1], s[2], s[3], s[4]));
    edges.push(e(id(home[0]), id(s[0])));
  });
  first.forEach((parent) => {
    const kids = rest.filter((s) => s[5] === parent[0]);
    kids.forEach((s, j) => {
      nodes.push(n(id(s[0]), (pos.get(parent[0]) ?? 0) + (j - (kids.length - 1) / 2) * 160, 300, s[1], s[2], s[3], s[4]));
      edges.push(e(id(parent[0]), id(s[0])));
    });
  });
  return { nodes, edges };
}

const plan = (before: Spec[], after: Spec[]): SitemapState => ({ before: tree('b', before), after: tree('a', after) });

/** 業種に合わせた、seed の案件ごとのサイトマップ（現行サイト → 改善後）。第1階層の並びがデザイン案の画面の選び方に効く */
const PLANS: Record<string, () => SitemapState> = {
  p1: seedSitemap,
  p2: () => plan([
    ['home', 'トップ', '/', 'home'],
    ['about', '会社概要', '/company', 'section'], ['greet', '代表挨拶', '/company/greeting', 'page', undefined, 'about'],
    ['recruit', '採用情報', '/company/recruit', 'page', '会社概要の下にあり、求職者が見つけにくい', 'about'],
    ['biz', '事業内容', '/business', 'section'], ['public', '公共工事', '/business/public', 'page', undefined, 'biz'], ['house', '住宅', '/business/house', 'page', undefined, 'biz'],
    ['news', 'お知らせ', '/news', 'section'],
    ['contact', 'お問い合わせ', '/contact', 'page'],
  ], [
    ['home', 'トップ', '/', 'home', 'ファーストビューに施工事例と「エントリー」を配置'],
    ['recruit', '採用情報', '/recruit', 'new', '第1階層へ移動。仕事内容と 1 日の流れを 1 ページに'],
    ['voice', '社員インタビュー', '/recruit/interview', 'new', '20〜30 代の先輩社員の声', 'recruit'],
    ['works', '施工事例', '/works', 'section', '公共工事と住宅を写真で一覧'],
    ['public', '公共工事', '/works/public', 'page', undefined, 'works'], ['house', '住宅・リフォーム', '/works/house', 'page', undefined, 'works'],
    ['company', '会社案内', '/company', 'section', '代表挨拶・沿革を 1 ページに統合'],
    ['entry', 'エントリー', '/entry', 'cta', '全ページから 1 クリックで応募'],
    ['contact', 'お問い合わせ', '/contact', 'page'],
  ]),
  p3: () => plan([
    ['home', 'トップ', '/', 'home'],
    ['clinic', '医院紹介', '/clinic', 'section'], ['greet', '院長挨拶', '/clinic/greeting', 'page', undefined, 'clinic'], ['equip', '設備', '/clinic/equipment', 'page', undefined, 'clinic'],
    ['med', '診療内容', '/medical', 'section'], ['general', '一般歯科', '/medical/general', 'page', undefined, 'med'], ['kids', '小児歯科', '/medical/kids', 'page', undefined, 'med'],
    ['news', 'お知らせ', '/news', 'section'],
    ['access', 'アクセス', '/access', 'section'], ['reserve', 'ご予約', '/access/reserve', 'page', '予約の方法がアクセスのページの下にしかない', 'access'],
  ], [
    ['home', 'トップ', '/', 'home', '予約ボタンと電話ボタンを常に表示'],
    ['medical', '診療案内', '/medical', 'section', '一般・小児・矯正を 1 ページで比べられる'],
    ['kids', '小児歯科', '/medical/kids', 'page', undefined, 'medical'], ['ortho', '矯正歯科', '/medical/ortho', 'page', undefined, 'medical'],
    ['price', '料金', '/price', 'new', '自費診療の料金を明示'],
    ['doctor', '医師紹介', '/doctor', 'section', '院長挨拶・医師の経歴を統合'],
    ['access', 'アクセス', '/access', 'page'],
    ['reserve', 'ネット予約', '/reserve', 'cta', '全ページから 1 クリックで予約'],
  ]),
  p4: () => plan([
    ['home', 'トップ', '/', 'home'],
    ['venue', '会場', '/venue', 'section'], ['chapel', 'チャペル', '/venue/chapel', 'page', undefined, 'venue'], ['hall', '披露宴会場', '/venue/hall', 'page', undefined, 'venue'],
    ['plan', 'プラン', '/plan', 'page'],
    ['news', 'お知らせ', '/news', 'section'], ['fair', 'フェア情報', '/news/fair', 'page', 'ブライダルフェアがお知らせに埋もれている', 'news'],
    ['contact', 'お問い合わせ', '/contact', 'page'],
  ], [
    ['home', 'トップ', '/', 'home', 'ファーストビューに会場の写真と「フェアを予約」を配置'],
    ['fair', 'ブライダルフェア', '/fair', 'new', '日程から選んで予約できる'],
    ['venue', '会場紹介', '/venue', 'section', '一日一組の貸切を写真で伝える'],
    ['chapel', 'チャペル', '/venue/chapel', 'page', undefined, 'venue'], ['garden', 'ガーデン', '/venue/garden', 'page', undefined, 'venue'],
    ['cuisine', '料理', '/cuisine', 'page', '専属シェフのコースを独立ページに'],
    ['plan', 'プラン・実例', '/plan', 'section', '費用の目安と実例を並べて見せる'],
    ['reserve', 'フェア予約', '/reserve', 'cta', '全ページから 1 クリックで予約'],
  ]),
  p5: () => plan([
    ['home', 'トップ', '/', 'home'],
    ['company', '会社情報', '/company', 'section'], ['greet', '社長挨拶', '/company/greeting', 'page', undefined, 'company'],
    ['contact', 'お問い合わせ', '/company/contact', 'page', 'フォームが会社情報の下にあり見つけにくい', 'company'],
    ['products', '製品紹介', '/products', 'section'],
    ['equip', '設備', '/equipment', 'page'],
    ['news', 'お知らせ', '/news', 'section'],
  ], [
    ['home', 'トップ', '/', 'home', '加工精度の数値と「技術相談」をファーストビューに'],
    ['products', '製品情報', '/products', 'section', '製品ごとの仕様表をスマホでも読める形に'],
    ['shaft', '精密シャフト', '/products/shaft', 'page', undefined, 'products'], ['proto', '試作加工', '/products/prototype', 'page', undefined, 'products'],
    ['cases', '加工事例', '/cases', 'new', '業界・材質から事例を探せる'],
    ['equip', '設備一覧', '/equipment', 'page'],
    ['company', '会社案内', '/company', 'section'],
    ['contact', '技術相談・お問い合わせ', '/contact', 'cta', '図面を添えて全ページから相談できる'],
  ]),
  p6: () => plan([
    ['home', 'トップ', '/', 'home'],
    ['about', '団体について', '/about', 'section'], ['greet', '理事長挨拶', '/about/greeting', 'page', undefined, 'about'], ['report', '活動報告', '/about/report', 'page', undefined, 'about'],
    ['course', '講座案内', '/course', 'page', '講座が PDF の一覧だけで、探しにくい'],
    ['news', 'お知らせ', '/news', 'section'],
    ['contact', 'お問い合わせ', '/contact', 'page'],
  ], [
    ['home', 'トップ', '/', 'home', '今月の講座と「申し込む」をファーストビューに'],
    ['courses', '講座一覧', '/courses', 'section', '分野・曜日・対象から探せる'],
    ['adult', '社会人の講座', '/courses/adult', 'page', undefined, 'courses'], ['kids', 'こどもの講座', '/courses/kids', 'page', undefined, 'courses'],
    ['teachers', '講師紹介', '/teachers', 'page'],
    ['voice', '受講者の声', '/voice', 'new', '講座の楽しさを写真と声で伝える'],
    ['about', '団体概要', '/about', 'section'], ['donate', '寄付のお願い', '/about/donate', 'new', undefined, 'about'],
    ['apply', '受講申込・お問い合わせ', '/apply', 'cta', '全ページから 1 クリックで申し込める'],
  ]),
  p8: () => plan([
    ['home', 'トップ', '/', 'home'],
    ['guide', '旅館案内', '/guide', 'section'], ['rooms', '客室', '/guide/rooms', 'page', undefined, 'guide'], ['food', '料理', '/guide/food', 'page', undefined, 'guide'], ['bath', '温泉', '/guide/bath', 'page', undefined, 'guide'],
    ['access', '交通案内', '/access', 'section'], ['reserve', '宿泊予約', '/access/reserve', 'page', '外部の予約サイトへのリンクだけ', 'access'],
    ['news', 'お知らせ', '/news', 'section'],
  ], [
    ['home', 'トップ', '/', 'home', '庭の写真と「空室を確認」をファーストビューに'],
    ['rooms', '客室', '/rooms', 'section', '客室ごとの写真と料金を一覧で'],
    ['onsen', '露天風呂付き客室', '/rooms/onsen', 'new', undefined, 'rooms'],
    ['dining', '料理・温泉', '/dining', 'section', '会席料理と温泉を 1 ページの物語に'],
    ['plans', '宿泊プラン', '/plans', 'new', '記念日のプランを独立ページ化'],
    ['access', 'アクセス', '/access', 'page'],
    ['en', 'English', '/en', 'new', '海外からのお客様向け'],
    ['reserve', 'ご予約', '/reserve', 'cta', '空室確認から予約までを片手で'],
  ]),
};

/** 業種の分からない案件・新しい案件の見本（トップ／サービス／実績／会社案内／よくある質問／お問い合わせ） */
const genericSitemap = (): SitemapState => plan([
  ['home', 'トップ', '/', 'home'],
  ['company', '会社概要', '/company', 'section'],
  ['business', '事業内容', '/business', 'section'],
  ['news', 'お知らせ', '/news', 'section'],
  ['contact', 'お問い合わせ', '/company/contact', 'page', '会社概要の下にあり、到達まで 2 クリック必要', 'company'],
], [
  ['home', 'トップ', '/', 'home', 'ファーストビューに強みと「お問い合わせ」を配置'],
  ['service', 'サービス', '/service', 'section', '事業内容をお客様の目的別に整理'],
  ['works', '実績', '/works', 'new', '事例を写真つきで一覧'],
  ['company', '会社案内', '/company', 'section'],
  ['faq', 'よくある質問', '/faq', 'page'],
  ['contact', 'お問い合わせ', '/contact', 'cta', '全ページから 1 クリックで到達'],
]);

/** 案件のサイトマップ案（AI が要件定義書の承認のときに作る想定）。seed の案件は業種に合わせ、それ以外は汎用の見本 */
export const sitemapFor = (projectId: string): SitemapState => (PLANS[projectId] ?? genericSitemap)();

/**
 * まだ作っていないサイトマップ（0.29.4。2026-11-12 ユーザー指示「サイトマップも初めはない前提」）。
 * 要件定義書の承認のときに作る（reducer の approveRequirements）。型の形は変えず、ページ 0 件で「未作成」を表す
 */
export const emptySitemap = (): SitemapState => ({
  before: { nodes: [], edges: [] },
  after: { nodes: [], edges: [] },
});

/** サイトマップを作成済みか（改善後のページが 1 件以上。トップは削除できないので、作成後に 0 件へ戻ることはない） */
export const sitemapCreated = (s: SitemapState): boolean => s.after.nodes.length > 0;
