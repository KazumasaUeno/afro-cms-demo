import type { AnswerValue, DesignId, Project, ProjectDraft, SitemapNode, SitemapState } from '@/types';
import type { AnswerEntry } from '@/repositories/types';
import { sitemapFor, sitemapFromSpecs, type SitemapSpec } from '@/data/sitemap';
import { buildProposal, type Proposal } from '@/features/requirements/buildProposal';
import { designContextOf, designPageOf, firstLevel, type DesignContext } from '@/features/design/designContext';
import { ACCENT_PRESETS, PROJECT_FIELD_ORDER, validateProject } from '@/features/projects/projectForm';

/**
 * 営業プレゼンの「プチ要件定義」（0.32.0。2026-11-10 打ち合わせ「その場で要件定義とデザインまで見せる」）。
 * 営業が見込み客の話を聞きながら入力し、その場で要件のまとめ・トップ＋第1階層のサイトマップ・デザイン案を見せる。
 * すべて入力から決まる純粋な関数（AI の実生成ではない）。ストアには書かない（登録を押したときだけ、画面が案件を作る）
 */

export const PETIT_CAPS = [5, 10, 15] as const;
export type PetitCap = (typeof PETIT_CAPS)[number];
export type PetitDirection = 'auto' | DesignId;

export interface PetitInput {
  clientName: string;
  /** 現行サイト（任意。登録には要る） */
  siteUrl: string;
  industry: string;
  purposes: string[];
  issue: string;
  target: string;
  /** 必ず掲載したいページ */
  mustPages: string[];
  cv: string;
  /** 第1階層のページ数（トップは含まない。2026-11-13 lead 決定「トップ＋第1階層 10 ページ」） */
  cap: PetitCap;
  direction: PetitDirection;
}

export const emptyPetitInput = (): PetitInput => ({
  clientName: '', siteUrl: '', industry: '', purposes: [], issue: '', target: '', mustPages: [], cv: '', cap: 10, direction: 'auto',
});

/** 分析を始められるか（その場で止めないよう、必須は見込み客名と業種だけ） */
export const petitReady = (i: PetitInput): boolean => !!i.clientName.trim() && !!i.industry.trim();

/** ヒアリングの質問と同じ id の回答（登録したとき、そのままヒアリングの回答になる） */
export function petitAnswers(i: PetitInput): Record<string, AnswerValue> {
  const a: Record<string, AnswerValue> = {};
  if (i.siteUrl.trim()) a['q-url'] = i.siteUrl.trim();
  if (i.purposes.length) a['q-purpose'] = [...i.purposes];
  if (i.issue.trim()) a['q-issue'] = i.issue.trim();
  if (i.target.trim()) a['q-target'] = i.target.trim();
  if (i.mustPages.length) a['q-content'] = i.mustPages.join('・');
  if (i.cv) a['q-cv'] = i.cv;
  return a;
}

export const petitAnswerEntries = (i: PetitInput): AnswerEntry[] => Object.entries(petitAnswers(i)).map(([questionId, value]) => ({ questionId, value }));

export function petitProposal(i: PetitInput): Proposal {
  const p = buildProposal(petitAnswers(i), []);
  if (i.siteUrl.trim()) return p;
  // URL を聞けていないときは、仮のドメインではなく見込み客名で書く（スコアは仮のドメインから決まる値のまま）
  const name = i.clientName.trim() || 'お客様';
  return { ...p, points: p.points.map((x) => ({ ...x, detail: x.detail.replace(p.hostname, `${name}のサイト`) })) };
}

/* ---------- サイトマップ ---------- */

/** 業種 → 見本の案件のサイトマップ（data/sitemap.ts の PLANS）。当てはまらなければ汎用の見本 */
const INDUSTRY_PLAN: { key: RegExp; plan: string }[] = [
  { key: /飲食|カフェ|EC/, plan: 'p1' },
  { key: /建設|不動産|工務店|リフォーム/, plan: 'p2' },
  { key: /医療|歯科|クリニック/, plan: 'p3' },
  { key: /ブライダル|結婚/, plan: 'p4' },
  { key: /製造|精機/, plan: 'p5' },
  { key: /教育|NPO|学び/, plan: 'p6' },
  { key: /宿泊|観光|旅館/, plan: 'p8' },
];
export const planIdOf = (industry: string): string => INDUSTRY_PLAN.find((x) => x.key.test(industry))?.plan ?? 'generic';

/** 最も重要なコンバージョン → CTA のページ */
const CV_PAGE: Record<string, [string, string]> = {
  問い合わせ: ['お問い合わせ', '/contact'],
  資料請求: ['資料請求', '/request'],
  来店予約: ['ご予約', '/reserve'],
  購入: ['オンラインショップ', '/shop'],
  採用応募: ['エントリー', '/entry'],
};

/** きっかけ（目的）→ 第1階層に置くページ */
const PURPOSE_PAGE: Record<string, [string, string, string]> = {
  採用を強化したい: ['採用情報', '/recruit', '求職者が迷わず見つけられるよう第1階層に'],
  EC売上を伸ばしたい: ['オンラインショップ', '/shop', '商品一覧から購入までを短く'],
  ブランドを刷新したい: ['ストーリー', '/story', '想いと歩みを 1 ページの物語に'],
  更新を楽にしたい: ['お知らせ', '/news', '担当者がブラウザから更新できる'],
  問い合わせを増やしたい: ['選ばれる理由', '/reason', '問い合わせの前に、比べる材料を'],
};

/** 業種に関わらず足せるページ（15 ページでも必ず埋まる数を用意する） */
const FILLER: [string, string][] = [
  ['選ばれる理由', '/reason'], ['サービス', '/service'], ['実績', '/works'], ['お客様の声', '/voice'], ['ご利用の流れ', '/flow'],
  ['料金・プラン', '/price'], ['よくある質問', '/faq'], ['会社案内', '/company'], ['スタッフ紹介', '/staff'], ['採用情報', '/recruit'],
  ['お知らせ', '/news'], ['ブログ', '/blog'], ['アクセス', '/access'], ['ギャラリー', '/gallery'], ['プライバシーポリシー', '/privacy'],
];

/** 必ず掲載したいページの言葉 → パス（無ければ /page-n） */
const SLUG: [RegExp, string][] = [
  [/会社|企業/, '/company'], [/採用|求人/, '/recruit'], [/メニュー/, '/menu'], [/店舗/, '/store'], [/アクセス|地図/, '/access'],
  [/料金|価格|プラン/, '/price'], [/実績|事例|施工/, '/works'], [/サービス|事業/, '/service'], [/ブログ|コラム/, '/blog'],
  [/お知らせ|ニュース/, '/news'], [/質問|FAQ/i, '/faq'], [/声|口コミ/, '/voice'], [/スタッフ|講師|医師/, '/staff'],
  [/商品|製品/, '/products'], [/診療/, '/medical'], [/予約/, '/reserve'], [/問い合わせ|相談/, '/contact'], [/ギャラリー|写真/, '/gallery'],
  [/講座|教室/, '/courses'], [/客室|部屋/, '/rooms'],
];

export type PetitSource = 'cta' | 'must' | 'purpose' | 'industry' | 'filler';
export interface PetitPage { label: string; path: string; kind: SitemapNode['data']['kind']; reason?: string; source: PetitSource }

export interface PetitSitemap {
  state: SitemapState;
  /** 第1階層（並び順。CTA は最後） */
  pages: PetitPage[];
  /** 上限で外したページ（必ず掲載・目的・業種の見本のうち。足し合わせ用のページは数えない） */
  dropped: string[];
  homeReason: string;
}

const norm = (s: string) => s.replace(/\s/g, '');
const samePage = (a: { label: string; path: string }, b: { label: string; path: string }): boolean => {
  const x = norm(a.label);
  const y = norm(b.label);
  return x === y || a.path === b.path || (x.length >= 2 && y.length >= 2 && (x.includes(y) || y.includes(x)));
};

export function petitSitemap(i: PetitInput): PetitSitemap {
  const planId = planIdOf(i.industry);
  const plan = sitemapFor(planId);
  const top = firstLevel(plan);
  const planHome = plan.after.nodes.find((x) => x.data.kind === 'home');
  const planPages: PetitPage[] = top.map((x) => ({ label: x.data.label, path: x.data.path, kind: x.data.kind, reason: x.data.reason, source: 'industry' }));

  // CTA: コンバージョンの回答 → 見本の CTA → お問い合わせ
  const cvPage = CV_PAGE[i.cv];
  const planCta = planPages.find((p) => p.kind === 'cta');
  const cta: PetitPage = cvPage
    ? { label: cvPage[0], path: cvPage[1], kind: 'cta', reason: `「${i.cv}」を全ページから 1 クリックで`, source: 'cta' }
    : planCta
      ? { ...planCta, source: 'cta' }
      : { label: 'お問い合わせ', path: '/contact', kind: 'cta', reason: '全ページから 1 クリックで到達', source: 'cta' };

  const purposePages: PetitPage[] = i.purposes
    .map((p) => PURPOSE_PAGE[p])
    .filter((x): x is [string, string, string] => !!x)
    .map(([label, path, reason]) => ({ label, path, kind: 'new', reason, source: 'purpose' }));
  const fillerPages: PetitPage[] = FILLER.map(([label, path]) => ({ label, path, kind: 'page', reason: `${label}を、写真と短い文章で分かりやすく紹介します。`, source: 'filler' }));
  const pool = [...planPages.filter((p) => p.kind !== 'cta'), ...purposePages, ...fillerPages];

  let n = 0;
  const used: PetitPage[] = [];
  const mustPages: PetitPage[] = i.mustPages.map((m) => m.trim()).filter(Boolean).map((m) => {
    // 見本のページと同じか、その一部の言葉（例: 「ジャーナル」「採用」）なら見本のページを使う。長い自由入力（例: 「院長紹介ブログ」）はそのまま新しいページにする
    const hit = pool.find((p) => norm(p.label).includes(norm(m)));
    if (hit) return { ...hit, kind: hit.kind === 'cta' ? 'page' : hit.kind, reason: hit.reason ?? 'ヒアリングで必ず掲載したいと伺ったページ', source: 'must' };
    n += 1;
    const base = SLUG.find(([re]) => re.test(m))?.[1] ?? `/page-${n}`;
    // 自由入力のページは、ほかのページとパスが重なっても別のページとして残す（パスをずらす）
    let path = base;
    for (let k = 2; [...pool, cta, ...used].some((p) => p.path === path); k++) path = `${base}-${k}`;
    const page: PetitPage = { label: m, path, kind: 'new', reason: 'ヒアリングで必ず掲載したいと伺ったページ', source: 'must' };
    used.push(page);
    return page;
  });

  // 並び: 必ず掲載 → 目的 → 業種の見本 → 足し合わせ（重複は先にあるほうを残す）。CTA と同じページも外す
  const ordered: PetitPage[] = [];
  for (const p of [...mustPages, ...purposePages, ...planPages.filter((x) => x.kind !== 'cta'), ...fillerPages]) {
    if (samePage(p, cta) || ordered.some((o) => samePage(o, p))) continue;
    ordered.push(p);
  }
  const slots = i.cap - 1;
  const kept = ordered.slice(0, slots);
  const dropped = ordered.slice(slots).filter((p) => p.source !== 'filler').map((p) => p.label);
  const pages = [...kept, cta];

  const homeReason = planId !== 'generic' && planHome?.data.reason ? planHome.data.reason : `ファーストビューに強みと「${cta.label}」を配置`;
  const specs: SitemapSpec[] = [
    ['home', 'トップ', '/', 'home', homeReason],
    ...pages.map((p, k): SitemapSpec => [`k${k}`, p.label, p.path, p.kind, p.reason]),
  ];
  return { state: sitemapFromSpecs(specs), pages, dropped, homeReason };
}

/* ---------- デザイン ---------- */

const INDUSTRY_ACCENT: [RegExp, string][] = [
  [/飲食|カフェ|EC/, '#B45309'], [/建設|不動産|工務店|リフォーム/, '#1D4ED8'], [/医療|歯科|クリニック/, '#0D9488'],
  [/ブライダル|結婚/, '#BE185D'], [/製造|精機/, '#475569'], [/教育|NPO|学び/, '#15803D'], [/宿泊|観光|旅館/, '#C2410C'],
];
export function petitAccent(industry: string): string {
  const hit = INDUSTRY_ACCENT.find(([re]) => re.test(industry));
  if (hit) return hit[1];
  let h = 0;
  for (let k = 0; k < industry.length; k++) h = (h * 31 + industry.charCodeAt(k)) >>> 0;
  return ACCENT_PRESETS[h % ACCENT_PRESETS.length].value;
}

/** 「自動」のときの案（目的・業種から決める） */
export function autoDirection(i: PetitInput): DesignId {
  if (i.purposes.includes('ブランドを刷新したい') || /ブライダル|結婚|宿泊|旅館/.test(i.industry)) return 'premium';
  if (i.purposes.some((p) => p === '採用を強化したい' || p === 'EC売上を伸ばしたい') || /飲食|カフェ|EC/.test(i.industry)) return 'creative';
  return 'minimal';
}
export const directionOf = (i: PetitInput): DesignId => (i.direction === 'auto' ? autoDirection(i) : i.direction);

/** 見込み客のサイト（ストアに無い仮の案件）のデザインの中身。トップ以外の画面は第1階層のすべて */
export function petitDesignContext(i: PetitInput, sm: SitemapState): DesignContext {
  const name = i.clientName.trim() || 'お客様';
  const project: Project = {
    id: 'petit', clientName: name, siteName: name, siteUrl: i.siteUrl.trim() || 'https://your-site.example.jp', industry: i.industry.trim(),
    stage: 'hearing', progress: 0, ownerId: '', updatedAt: '', nextAction: '', accent: petitAccent(i.industry), pendingApprovals: 0,
  };
  const ctx = designContextOf(project, { requirements: { answers: petitAnswers(i) }, sitemap: sm, design: {} });
  return { ...ctx, pages: firstLevel(sm).map((node) => designPageOf(sm, node, ctx.ctaLabel, '')) };
}

/* ---------- 案件として登録 ---------- */

export function petitDraft(i: PetitInput, ownerId: string): ProjectDraft {
  const name = i.clientName.trim();
  return { clientName: name, siteName: name, siteUrl: i.siteUrl.trim(), industry: i.industry.trim(), ownerId, accent: petitAccent(i.industry), launchDate: '', nextAction: '' };
}

/** 登録できない理由（null なら登録できる）。作成と同じ入力チェック（validateProject）を使う */
export function registerBlocker(i: PetitInput, projects: Project[], ownerId: string): string | null {
  if (!i.siteUrl.trim()) return '現行サイトの URL を入れると案件として登録できます';
  const e = validateProject(petitDraft(i, ownerId), projects);
  const first = PROJECT_FIELD_ORDER.find((k) => e[k]);
  return first ? `${({ clientName: '見込み客名', siteName: '見込み客名', siteUrl: 'URL', industry: '業種' } as Record<string, string>)[first] ?? ''}: ${e[first]}` : null;
}
