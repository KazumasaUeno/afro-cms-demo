import { useMemo } from 'react';
import type { AnswerValue, DemoState, DesignId, DesignVariant, Project, SitemapNode, SitemapState } from '@/types';
import { sitemapCreated, sitemapFor } from '@/data/sitemap';
import { useDemoOptional } from '@/store/DemoStore';
import { workOf } from '@/store/projectWork';

/**
 * デザイン案（3 案）に流し込む、案件ごとの中身（0.29.5。2026-11-12 ユーザー決定「デザイン案は案件ごと」）。
 * 案（minimal / creative / premium）はレイアウトと書体だけを持ち、文言・ナビ・CTA・色はここから取る。
 * 出所: 案件（サイト名・URL・ブランド色・業種）、ヒアリング（q-strength・q-target・q-cv・q-content）、
 * デザイン要件定義（q-image・q-brand）、改善後のサイトマップ（ナビ・各案の 2〜3 画面目）。
 * MINAMO COFFEE（p1）はヒアリング前でも見本が崩れないよう、従来の見本の文言を持つ（P1_PRESET）
 */

export interface DesignBlock { title: string; text: string }

/** トップ以外にプレビューする画面（改善後サイトマップの第1階層から最大 2 つ） */
export interface DesignPage { key: string; label: string; path: string; lead: string; blocks: DesignBlock[]; cta: boolean }

/** 案ごとに差し替える見出し（p1 だけ。ほかの案件は 3 案で共通の見出しを使う） */
interface VariantCopy { eyebrow?: string; headline?: string[]; sub?: string; cta?: string; cta2?: string }

export interface DesignContext {
  projectId: string;
  siteName: string;
  /** ロゴの文字（短い） */
  logo: string;
  domain: string;
  /** ヘッダーのナビ（第1階層。CTA のページは除く） */
  nav: string[];
  ctaLabel: string;
  /** クリエイティブ案のヘッダー右の丸いボタン（短い） */
  ctaShort: string;
  eyebrow: string;
  headline: string[];
  sub: string;
  /** クリエイティブ案の大きな英字（3 行） */
  display: [string, string, string];
  strip: string;
  /** 案件のブランド色。undefined は各案の既定の色（p1） */
  accent?: string;
  brandNote?: string;
  mood?: string;
  highlights: { no: string; title: string; en: string; text: string }[];
  listTitle: string;
  items: { name: string; note: string; meta: string }[];
  /** コーヒーのイラストを使う（p1）。ほかの案件は図形のイラスト */
  coffee: boolean;
  footer: string;
  pages: DesignPage[];
  variantCopy?: Partial<Record<DesignId, VariantCopy>>;
}

const text = (v: AnswerValue | undefined): string => (typeof v === 'string' ? v.trim() : Array.isArray(v) ? v.join('・') : '');

/** 業種の言葉から、英字の見出し・小見出しを選ぶ（AI の生成の代わり） */
const INDUSTRY: { key: RegExp; eyebrow: string; display: [string, string, string] }[] = [
  { key: /飲食|カフェ|EC/, eyebrow: 'CAFE & ROASTERY', display: ['BREW', 'YOUR', 'MOOD.'] },
  { key: /医療|歯科|クリニック/, eyebrow: 'CLINIC', display: ['SMILE', 'EVERY', 'DAY.'] },
  { key: /宿泊|観光|旅館/, eyebrow: 'RYOKAN', display: ['STAY', 'SLOW', 'HERE.'] },
  { key: /ブライダル|結婚/, eyebrow: 'WEDDING', display: ['ONE', 'DAY', 'ONLY.'] },
  { key: /製造|精機/, eyebrow: 'PRECISION', display: ['MADE', 'TO', 'MICRON.'] },
  { key: /教育|NPO|学び/, eyebrow: 'COMMUNITY SCHOOL', display: ['LEARN', 'WITH', 'US.'] },
  { key: /建設|不動産|工務店|リフォーム/, eyebrow: 'CONSTRUCTION', display: ['BUILD', 'THE', 'TOWN.'] },
];

/** ヒアリングの「最も重要なコンバージョン」から CTA の文言 */
const CTA_BY_CV: Record<string, [string, string]> = {
  来店予約: ['ご予約はこちら', 'ご予約'],
  採用応募: ['エントリー', 'Entry'],
  問い合わせ: ['お問い合わせ', 'Contact'],
  購入: ['購入する', 'Shop'],
  資料請求: ['資料請求', '資料請求'],
};

/** p1（MINAMO COFFEE）の見本。ヒアリング前でも従来の見た目にする */
const P1_PRESET: Partial<DesignContext> = {
  logo: 'MINAMO',
  nav: ['SHOP', 'STORY', 'CAFE', 'JOURNAL'],
  ctaLabel: 'オンラインで購入',
  ctaShort: 'Order',
  eyebrow: 'SINGLE ORIGIN — ETHIOPIA',
  headline: ['一杯から、', '日常を少し', '特別に。'],
  sub: '産地を訪ねて選んだ豆を、店舗で毎朝焙煎しています。華やかな香りと、澄んだ後味を。',
  display: ['BREW', 'YOUR', 'MOOD.'],
  strip: 'NEW BLEND 凪 — 12.1 RELEASE — ROASTED DAILY — ',
  highlights: [
    { no: '01', title: '産地', en: 'Origin', text: '標高2,000mの農園を毎年訪ね、その年いちばんの豆だけを。' },
    { no: '02', title: '焙煎', en: 'Roast', text: '一釜ずつ、香りの頂点で火を止める。' },
    { no: '03', title: '包む', en: 'Wrap', text: '和紙と木箱で、開ける瞬間まで贈り物に。' },
  ],
  listTitle: 'COLLECTION',
  items: [
    { name: 'Ethiopia', note: '華やか・柑橘', meta: '¥1,620' },
    { name: 'Guatemala', note: 'まろやか・ナッツ', meta: '¥1,480' },
    { name: 'Blend 凪', note: '深煎り・甘い余韻', meta: '¥1,380' },
  ],
  coffee: true,
  footer: '© MINAMO COFFEE',
  variantCopy: {
    creative: { sub: '気分で選べる12の豆。焙煎したての一杯を、街のカフェとオンラインで。' },
    premium: {
      eyebrow: 'CORPORATE GIFT COLLECTION', headline: ['想いを、', '香りで贈る。'],
      sub: '周年記念、お歳暮、大切な取引先へ。名入れ50個から、焙煎士が選んだ一箱をお届けします。',
      cta: '法人ギフトを相談する', cta2: 'コレクションを見る',
    },
  },
};

const firstLevel = (sm: SitemapState): SitemapNode[] => {
  const g = sm.after;
  const home = g.nodes.find((x) => x.data.kind === 'home');
  const ids = g.edges.filter((x) => x.source === home?.id).map((x) => x.target);
  return g.nodes.filter((x) => ids.includes(x.id));
};

const childrenOf = (sm: SitemapState, id: string): SitemapNode[] => {
  const ids = sm.after.edges.filter((x) => x.source === id).map((x) => x.target);
  return sm.after.nodes.filter((x) => ids.includes(x.id));
};

/** 見出しを句読点で 3 行までに分ける（「創業 120 年。全室から庭が見え、…」→ 行ごと） */
const toLines = (s: string): string[] => s.split(/(?<=[。、])/).map((x) => x.trim()).filter(Boolean).slice(0, 3);

/** トップ以外にプレビューする画面: 中身のページ（new / section。サイトマップの並び順）を 1 つ、CTA のページを 1 つ（無ければ次の中身のページ） */
function choosePages(sm: SitemapState, ctaLabel: string, strength: string): DesignPage[] {
  const top = firstLevel(sm);
  const content = top.filter((x) => x.data.kind === 'new' || x.data.kind === 'section');
  const cta = top.find((x) => x.data.kind === 'cta');
  const picked = [content[0], cta ?? content[1]].filter((x): x is SitemapNode => !!x);
  return picked.map((node) => {
    const isCta = node.data.kind === 'cta';
    const kids = childrenOf(sm, node.id).map((k) => ({ title: k.data.label, text: k.data.reason ?? `${k.data.label}の内容を、写真と短い文章で紹介します。` }));
    const filler: DesignBlock[] = isCta
      ? [
          { title: `${ctaLabel}のフォーム`, text: '必要なことだけを入力して送信できます（3 項目・約 1 分）。' },
          { title: 'お電話でも', text: '受付時間内は、お電話でもご相談いただけます。' },
          { title: 'お返事の目安', text: '2 営業日以内に担当からご連絡します。' },
        ]
      : [
          { title: '概要', text: node.data.reason ?? `${node.data.label}を、写真と短い文章で分かりやすく紹介します。` },
          { title: '私たちの強み', text: strength || '選ばれる理由を、数字と事例で伝えます。' },
          { title: 'よくあるご質問', text: 'お客様からよくいただく質問に、先回りしてお答えします。' },
        ];
    return {
      key: node.id, label: node.data.label, path: node.data.path, cta: isCta,
      lead: node.data.reason ?? (isCta ? '迷わず 1 クリックでたどり着けるページです。' : `${node.data.label}のページです。`),
      blocks: [...kids, ...filler].slice(0, 3),
    };
  });
}

/** 案件と制作データから、デザイン案に流し込む中身を作る（project が無いときは p1 の見本） */
export function designContextOf(project: Project | undefined, work: { requirements: { answers: Record<string, AnswerValue> }; sitemap: SitemapState; design: { answers?: Record<string, AnswerValue> } } | undefined): DesignContext {
  const projectId = project?.id ?? 'p1';
  const isP1 = projectId === 'p1';
  const hearing = work?.requirements.answers ?? {};
  const designAns = work?.design.answers ?? {};
  const sm = work && sitemapCreated(work.sitemap) ? work.sitemap : sitemapFor(projectId);
  const siteName = project?.siteName ?? 'MINAMO COFFEE';
  const industry = INDUSTRY.find((x) => x.key.test(project?.industry ?? '')) ?? { eyebrow: 'OFFICIAL SITE', display: ['MAKE', 'IT', 'YOURS.'] as [string, string, string] };
  const strength = text(hearing['q-strength']);
  const target = text(hearing['q-target']);
  const mood = text(designAns['q-image']) || undefined;
  const brandNote = text(designAns['q-brand']) || undefined;
  const cv = text(hearing['q-cv']);
  const top = firstLevel(sm);
  const ctaNode = top.find((x) => x.data.kind === 'cta');
  const [ctaLabel, ctaShort] = CTA_BY_CV[cv] ?? (ctaNode ? [ctaNode.data.label, ctaNode.data.label] : ['お問い合わせ', 'Contact']);
  const nav = top.filter((x) => x.data.kind !== 'cta').map((x) => x.data.label).slice(0, 4);
  const contentWords = text(hearing['q-content']).split(/[・、,]/).map((x) => x.trim()).filter(Boolean);
  const highlightTitles = (contentWords.length ? contentWords : nav).slice(0, 3);
  const reasonOf = (label: string) => sm.after.nodes.find((x) => x.data.label.includes(label) || label.includes(x.data.label))?.data.reason;

  const base: DesignContext = {
    projectId,
    siteName,
    logo: siteName.split(/\s+/)[0],
    domain: (project?.siteUrl ?? 'https://minamo-coffee.example.jp').replace(/^https?:\/\//, ''),
    nav,
    ctaLabel,
    ctaShort,
    eyebrow: `${siteName.toUpperCase()} — ${industry.eyebrow}`,
    headline: strength ? toLines(strength) : [`${project?.clientName ?? siteName}の`, '想いを、', 'かたちに。'],
    sub: target ? `${target}へ。${mood ? `${mood.replace(/。$/, '')}。` : ''}` : `${project?.clientName ?? siteName}の公式サイトです。`,
    display: industry.display,
    strip: `${siteName.toUpperCase()} — ${industry.eyebrow} — ${ctaShort.toUpperCase()} — `,
    accent: project?.accent,
    brandNote,
    mood,
    highlights: highlightTitles.map((t, i) => ({ no: `0${i + 1}`, title: t, en: '', text: reasonOf(t) ?? `${t}を、写真と短い文章で分かりやすく伝えます。` })),
    listTitle: 'CONTENTS',
    items: top.filter((x) => x.data.kind !== 'cta').slice(0, 3).map((x) => ({ name: x.data.label, note: x.data.reason ?? `${x.data.label}のご案内`, meta: '→' })),
    coffee: false,
    footer: `© ${siteName}`,
    pages: choosePages(sm, ctaLabel, strength),
  };
  // p1 はヒアリングの回答が無くても見本の文言・色で出す（回答があっても見本の文言を優先。色も各案の既定）
  return isP1 ? { ...base, ...P1_PRESET, accent: undefined, pages: base.pages, brandNote, mood } as DesignContext : base;
}

/** 案ごとの見出し（p1 は案ごとの見本の文言、ほかの案件は共通） */
export function copyFor(ctx: DesignContext, id: DesignId): Required<VariantCopy> {
  const v = ctx.variantCopy?.[id] ?? {};
  return {
    eyebrow: v.eyebrow ?? ctx.eyebrow,
    headline: v.headline ?? ctx.headline,
    sub: v.sub ?? ctx.sub,
    cta: v.cta ?? ctx.ctaLabel,
    cta2: v.cta2 ?? (ctx.pages[0] ? `${ctx.pages[0].label}を見る` : '詳しく見る'),
  };
}

/* ---------- 色: 各案の配色に案件のブランド色を混ぜる ---------- */

const hex = (c: string) => c.replace('#', '').match(/.{2}/g)!.map((x) => parseInt(x, 16));
/** a と b を t（0〜1。1 で b）の割合で混ぜる */
export function mix(a: string, b: string, t: number): string {
  const [x, y] = [hex(a), hex(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

/** 案の配色 [背景, 文字, アクセント, 補助]。ブランド色の無い案件（p1）は案の既定の色 */
export function paletteFor(v: DesignVariant, ctx: DesignContext): [string, string, string, string] {
  const [bg, ink, accent, sub] = v.palette;
  const a = ctx.accent;
  if (!a) return [bg, ink, accent, sub];
  if (v.id === 'minimal') return [bg, ink, a, sub];
  if (v.id === 'creative') return [mix(a, '#FFFFFF', 0.93), ink, a, mix(a, '#FFFFFF', 0.55)];
  return [bg, ink, mix(accent, a, 0.45), sub];
}

/** 案件に合わせた案（配色・説明文）。p1 は従来の説明文 */
export function personalize(v: DesignVariant, ctx: DesignContext): DesignVariant {
  const palette = paletteFor(v, ctx);
  if (!ctx.accent) return { ...v, palette };
  const description = {
    minimal: `大きな余白と細い罫線で、${ctx.siteName}の誠実さを静かに伝える構成。伝えたいことを 1 つに絞ります。`,
    creative: '大胆なタイポグラフィと非対称グリッド、ブランド色のブロックで、初めての人の記憶に残す構成。',
    premium: `ダークトーンとブランド色のアクセント、ストーリー型の縦長構成で「${ctx.ctaLabel}」までを後押しします。`,
  }[v.id];
  const tagline = v.id === 'premium' ? '深い色で、確かな格を' : v.tagline;
  return { ...v, palette, description, tagline };
}

/** 案件のデザインの中身（projectId 省略時は選んでいる案件。ストアの外では p1 の見本） */
export function designContextFromState(state: DemoState | undefined, projectId?: string): DesignContext {
  if (!state) return designContextOf(undefined, undefined);
  const id = projectId ?? state.requirements.projectId;
  return designContextOf(state.projects.find((p) => p.id === id), workOf(state, id));
}

export function useDesignContext(projectId?: string): DesignContext {
  const store = useDemoOptional();
  const state = store?.state;
  return useMemo(() => designContextFromState(state, projectId), [state, projectId]);
}
