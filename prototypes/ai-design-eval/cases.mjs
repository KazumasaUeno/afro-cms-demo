// デザイン AI 評価用の作り物の案件 6 件（業種 6）。実在の会社・人物・連絡先ではない（.example ドメイン・架空の名前）。
// 入力の欄は製品と同じ（src/features/design/designContext.ts:7-13 / src/data/designRequirements.ts）:
//   project = 案件（サイト名・URL・ブランド色・業種）
//   hearing = ヒアリング 4 問（q-strength・q-target・q-cv・q-content）
//   design  = デザイン要件定義 6 問（q-design-dislike・q-image・q-design-ref・q-brand・q-design-media・q-design-sp）
//   sitemap = 改善後サイトマップ（第1階層。kind は製品の SitemapNodeData.kind と同じ: section / page / cta / new）
// 2 画面目（main）は製品と同じ規則で選ぶ: 第1階層の new / section の先頭。無ければ cta（designContext.ts choosePages）

export const CASES = [
  {
    id: 'd01-wagashi',
    project: { id: 'd01', clientName: '有限会社つきみ堂', siteName: 'つきみ堂', siteUrl: 'https://tsukimido.example', industry: '飲食・物販（和菓子）', accent: '#7A3E48' },
    hearing: {
      'q-strength': '創業から三代続く手づくりの上生菓子。季節ごとに 12 種を入れ替える',
      'q-target': '贈答品を探す 40〜60 代と、近所の常連のお客様',
      'q-cv': '購入',
      'q-content': '季節の上生菓子・贈答用の詰め合わせ・店舗案内',
    },
    design: {
      'q-design-dislike': '写真が小さく暗い。どこから買えるのか分かりにくい',
      'q-image': '品があり、気軽に立ち寄れる町の和菓子屋',
      'q-design-ref': '余白が多く、商品が主役の見せ方が好み。派手な動きは要らない',
      'q-brand': 'のれんの小豆色（#7A3E48）。ガイドラインは無し',
      'q-design-media': '写真は撮り下ろし予定。イラストは使わない',
      'q-design-sp': '購入ボタンを押しやすく。営業時間をすぐ見たい',
    },
    sitemap: [
      { id: 'n1', label: '季節の和菓子', path: '/seasonal', kind: 'new', reason: '季節の入れ替えを一番に見せるため', children: [{ label: '今月の上生菓子', reason: '毎月変わる 12 種を写真で並べる' }] },
      { id: 'n2', label: '贈答・詰め合わせ', path: '/gift', kind: 'section', reason: '贈答の需要に応えるため' },
      { id: 'n3', label: '店舗案内', path: '/shop', kind: 'page' },
      { id: 'n4', label: 'オンライン購入', path: '/order', kind: 'cta' },
    ],
  },
  {
    id: 'd02-seikotsu',
    project: { id: 'd02', clientName: 'そよ風整骨院', siteName: 'そよ風整骨院', siteUrl: 'https://soyokaze-seikotsu.example', industry: '医療・治療院', accent: '#2E7D6B' },
    hearing: {
      'q-strength': '一人ひとりに時間をかける予約優先の施術。土日も夜 8 時まで受付',
      'q-target': '肩こり・腰痛に悩む 30〜50 代の会社員',
      'q-cv': '来店予約',
      'q-content': '施術メニューと料金・初めての方へ・アクセス',
    },
    design: {
      'q-design-dislike': '文字が多く、料金がどこにあるか分からない。全体に古い印象',
      'q-image': '清潔で、安心して相談できる',
      'q-design-ref': '明るい色で、文字は大きめ。写真よりも分かりやすさを優先',
      'q-brand': '看板の緑（#2E7D6B）',
      'q-design-media': '院内の写真は後日用意。人物写真は使わない',
      'q-design-sp': '予約ボタンを常に画面の下に出したい。電話もすぐかけたい',
    },
    sitemap: [
      { id: 'n1', label: '初めての方へ', path: '/first', kind: 'new', reason: '初診の不安を先に解消するため', children: [{ label: '施術の流れ', reason: '受付から会計までを順に説明する' }, { label: 'よくあるご質問' }] },
      { id: 'n2', label: '施術メニュー', path: '/menu', kind: 'section', reason: '料金とあわせて一覧にするため' },
      { id: 'n3', label: 'アクセス', path: '/access', kind: 'page' },
      { id: 'n4', label: 'Web 予約', path: '/reserve', kind: 'cta' },
    ],
  },
  {
    id: 'd03-koumuten',
    project: { id: 'd03', clientName: '株式会社森山ホーム', siteName: '森山ホーム', siteUrl: 'https://moriyama-home.example', industry: '建設・工務店', accent: '#8A5A2B' },
    hearing: {
      'q-strength': '地元の木材を使う注文住宅。設計から施工まで自社の職人が担当',
      'q-target': '家づくりを考え始めた 30 代の夫婦',
      'q-cv': '資料請求',
      'q-content': '施工事例・家づくりの流れ・会社紹介',
    },
    design: {
      'q-design-dislike': '施工事例が更新されておらず、写真の並びが雑然としている',
      'q-image': '誠実で、木のぬくもりを感じる会社',
      'q-design-ref': '写真を大きく見せる住宅メーカーのサイト。色は落ち着いた木の色',
      'q-brand': 'ロゴの茶色（#8A5A2B）。書体の指定は無し',
      'q-design-media': '写真は施工事例の撮影分を使う。イラストは間取りの説明だけ',
      'q-design-sp': '事例を指で横に送って見たい。資料請求をすぐ押したい',
    },
    sitemap: [
      { id: 'n1', label: '施工事例', path: '/works', kind: 'section', reason: '検討中の夫婦が最も見たい情報のため', children: [{ label: '平屋の事例' }, { label: '二階建ての事例' }] },
      { id: 'n2', label: '家づくりの流れ', path: '/flow', kind: 'new', reason: '相談から引き渡しまでの不安を減らすため' },
      { id: 'n3', label: '会社紹介', path: '/about', kind: 'page' },
      { id: 'n4', label: '資料請求', path: '/request', kind: 'cta' },
    ],
  },
  {
    id: 'd04-seimitsu',
    project: { id: 'd04', clientName: '北辰精工株式会社', siteName: '北辰精工', siteUrl: 'https://hokushin-seiko.example', industry: '製造・精密部品', accent: '#1F4E8C' },
    hearing: {
      'q-strength': '小ロットの精密切削加工。試作 1 個から相談できる',
      'q-target': '機械メーカーの設計・購買担当と、ものづくりを仕事にしたい求職者',
      'q-cv': '採用応募',
      'q-content': '技術紹介・設備一覧・採用情報',
    },
    design: {
      'q-design-dislike': '何ができる会社か伝わらない。採用ページが無い',
      'q-image': '確かな技術を持ち、若い人も働きやすい会社',
      'q-design-ref': '工場の写真を大きく使い、数字は使わずに技術の説明を簡潔に',
      'q-brand': 'コーポレートカラーは紺（#1F4E8C）',
      'q-design-media': '工場と社員の写真は撮影予定。動画は使わない',
      'q-design-sp': '採用情報にすぐたどり着けるようにしたい',
    },
    sitemap: [
      { id: 'n1', label: '採用情報', path: '/recruit', kind: 'new', reason: '採用応募を増やすために新設', children: [{ label: '仕事内容' }, { label: '先輩の声', reason: '働く人の言葉で職場を伝える' }] },
      { id: 'n2', label: '技術紹介', path: '/technology', kind: 'section', reason: '何ができる会社かを伝えるため' },
      { id: 'n3', label: '設備一覧', path: '/equipment', kind: 'page' },
      { id: 'n4', label: 'エントリー', path: '/entry', kind: 'cta' },
    ],
  },
  {
    id: 'd05-ryokan',
    project: { id: 'd05', clientName: '湯宿かすみ荘', siteName: '湯宿かすみ荘', siteUrl: 'https://kasumiso.example', industry: '宿泊・旅館', accent: '#3B4A6B' },
    hearing: {
      'q-strength': '全 8 室の小さな宿。山あいの源泉かけ流しの湯と、地元の野菜の料理',
      'q-target': '静かに過ごしたい 40〜60 代の夫婦',
      'q-cv': '来店予約',
      'q-content': 'お部屋・お料理・温泉・ご予約',
    },
    design: {
      'q-design-dislike': '予約サイトへのリンクが分かりにくい。写真の色がばらばら',
      'q-image': '落ち着いて、ゆっくり過ごせる宿',
      'q-design-ref': '縦書きの見出しや、和紙のような淡い背景が好み',
      'q-brand': '藍色（#3B4A6B）。ロゴは筆文字',
      'q-design-media': '写真は季節ごとに撮影済み。イラストは使わない',
      'q-design-sp': '空室の確認と予約まで迷わず進めたい',
    },
    sitemap: [
      { id: 'n1', label: 'お部屋', path: '/rooms', kind: 'section', reason: '8 室それぞれの違いを伝えるため', children: [{ label: '露天風呂付きの客室' }, { label: '和室' }] },
      { id: 'n2', label: 'お料理', path: '/cuisine', kind: 'section' },
      { id: 'n3', label: '温泉', path: '/onsen', kind: 'page' },
      { id: 'n4', label: 'ご予約', path: '/reserve', kind: 'cta' },
    ],
  },
  {
    id: 'd06-npo',
    project: { id: 'd06', clientName: 'NPO法人まなびば', siteName: 'まなびば', siteUrl: 'https://manabiba.example', industry: '教育・NPO', accent: '#E07A2E' },
    hearing: {
      'q-strength': '地域のボランティアが運営する、小中学生向けの無料の学習支援',
      'q-target': '子どもの勉強の場を探す保護者と、ボランティアに関心のある大学生',
      'q-cv': '問い合わせ',
      'q-content': '活動内容・ボランティア募集・寄付のお願い',
    },
    design: {
      'q-design-dislike': '活動の様子が伝わらない。文字ばかりで子ども向けの団体に見えない',
      'q-image': '明るく、誰でも参加しやすい',
      'q-design-ref': '丸みのある形と、やさしい色づかい',
      'q-brand': 'ロゴのオレンジ（#E07A2E）',
      'q-design-media': '子どもの顔が写る写真は使わない。イラストは使ってよい',
      'q-design-sp': '問い合わせフォームまでの道のりを短くしたい',
    },
    sitemap: [
      { id: 'n1', label: '活動内容', path: '/activities', kind: 'section', reason: '活動の様子を伝えるため', children: [{ label: '学習支援の時間割' }] },
      { id: 'n2', label: 'ボランティア募集', path: '/volunteer', kind: 'new', reason: '担い手を増やすために新設' },
      { id: 'n3', label: '寄付のお願い', path: '/donate', kind: 'page' },
      { id: 'n4', label: 'お問い合わせ', path: '/contact', kind: 'cta' },
    ],
  },
];

/** 製品と同じ規則で 2 画面目を選ぶ（designContext.ts choosePages: new / section の先頭。無ければ cta） */
export function mainPageOf(c) {
  return c.sitemap.find((n) => n.kind === 'new' || n.kind === 'section') ?? c.sitemap.find((n) => n.kind === 'cta');
}

/** CTA の文言（designContext.ts CTA_BY_CV と同じ対応）。機械の検査は「意味の語」が画面にあるかを見る */
export const CTA_BY_CV = {
  来店予約: { label: 'ご予約はこちら', words: ['予約'] },
  採用応募: { label: 'エントリー', words: ['エントリー', '応募'] },
  問い合わせ: { label: 'お問い合わせ', words: ['問い合わせ', '問合せ', 'お問合せ'] },
  購入: { label: '購入する', words: ['購入', '注文', 'カート'] },
  資料請求: { label: '資料請求', words: ['資料請求'] },
};

/** 製品の SitemapState（after だけ使う）へ直す（render-template.mjs が designContextOf に渡す） */
export function toSitemapState(c) {
  const home = { id: 'home', position: { x: 0, y: 0 }, data: { label: 'トップ', path: '/', kind: 'home' } };
  const nodes = [home];
  const edges = [];
  c.sitemap.forEach((n, i) => {
    nodes.push({ id: n.id, position: { x: i * 200, y: 120 }, data: { label: n.label, path: n.path, kind: n.kind, ...(n.reason ? { reason: n.reason } : {}) } });
    edges.push({ id: `e-home-${n.id}`, source: 'home', target: n.id });
    (n.children ?? []).forEach((k, j) => {
      const id = `${n.id}-${j + 1}`;
      nodes.push({ id, position: { x: i * 200, y: 240 + j * 80 }, data: { label: k.label, path: `${n.path}/${j + 1}`, kind: 'page', ...(k.reason ? { reason: k.reason } : {}) } });
      edges.push({ id: `e-${n.id}-${id}`, source: n.id, target: id });
    });
  });
  return { before: { nodes: [], edges: [] }, after: { nodes, edges } };
}

/** 入力に現れる文字列（数字の根拠の照合に使う） */
export function inputText(c) {
  const flat = (o) => Object.values(o).map((v) => (typeof v === 'string' ? v : '')).join('\n');
  const sm = c.sitemap.flatMap((n) => [n.label, n.path, n.reason ?? '', ...(n.children ?? []).flatMap((k) => [k.label, k.reason ?? ''])]).join('\n');
  return [flat(c.project), flat(c.hearing), flat(c.design), sm].join('\n');
}
