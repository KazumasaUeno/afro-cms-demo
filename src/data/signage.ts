import type { Display, SignageState, Slide, SlideAccent, SlideTemplate } from '@/types';
import { DEMO_IMAGES } from './cms';
import { daysAgo, hoursAgo } from '@/services/time';

/**
 * デジタルサイネージ（お客様ポータル）。
 * お客様（MINAMO COFFEE）が店頭の画面に流すコンテンツを作り、店舗の端末へ配信する。
 * デモのため実際の端末とは接続しない（配信・オンライン状態はシミュレーション）。
 */

export const SLIDE_TEMPLATES: { id: SlideTemplate; label: string; description: string }[] = [
  { id: 'promo', label: 'おすすめ', description: '季節の商品やキャンペーンを大きく見せる' },
  { id: 'menu', label: 'メニュー', description: '品名と価格を一覧で見せる（1〜6 品）' },
  { id: 'news', label: 'お知らせ', description: '営業時間の変更などを文章で伝える' },
];

export const TEMPLATE_LABEL: Record<SlideTemplate, string> = { promo: 'おすすめ', menu: 'メニュー', news: 'お知らせ' };

/** スライドの差し色（店舗のブランドに合わせた 4 色。UI のトークンではなくコンテンツ側の色） */
export const SLIDE_ACCENTS: { id: SlideAccent; label: string; color: string; soft: string }[] = [
  { id: 'roast', label: '焙煎ブラウン', color: '#7C4A1E', soft: '#F6EDE4' },
  { id: 'leaf', label: 'リーフグリーン', color: '#1F6B4F', soft: '#E6F2EC' },
  { id: 'night', label: 'ナイトネイビー', color: '#1E3A8A', soft: '#E8EDF9' },
  { id: 'berry', label: 'ベリーレッド', color: '#9F1D35', soft: '#F9E6EA' },
];

export const accentOf = (id: SlideAccent) => SLIDE_ACCENTS.find((a) => a.id === id) ?? SLIDE_ACCENTS[0];
/**
 * サイネージで使うデモ画像。CMS のデモ画像は左下に「demo image」の文字が入っており、
 * スライドでは切り抜かれて文字の一部だけが見えるため、文字を消した版を使う
 */
export const SIGNAGE_IMAGES = DEMO_IMAGES.map((i) => {
  const prefix = 'data:image/svg+xml;utf8,';
  if (!i.src.startsWith(prefix)) return i;
  const svg = decodeURIComponent(i.src.slice(prefix.length)).replace(/<text[\s\S]*?<\/text>/g, '');
  return { ...i, src: prefix + encodeURIComponent(svg) };
});
export const imageOf = (id: string | undefined) => (id ? SIGNAGE_IMAGES.find((i) => i.id === id) : undefined);

export const SLIDE_LIMITS = { title: 40, body: 120, items: 6, itemName: 20, priceMax: 99999, durationMin: 5, durationMax: 30 } as const;

/** 端末の再生順の上限（デモの見栄えと保存容量のため） */
export const DISPLAY_SLIDES_MAX = 12;

/* ---------- 日付（掲載期間は日単位。端末の現地時刻で判定する） ---------- */

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** ローカル日付の YYYY-MM-DD */
export function toYmd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const todayYmd = () => toYmd(new Date());
const ymdFromNow = (days: number) => toYmd(new Date(Date.now() + days * 86_400_000));

function isValidYmd(v: string): boolean {
  if (!YMD.test(v)) return false;
  const d = new Date(`${v}T00:00:00`);
  return !Number.isNaN(d.getTime()) && toYmd(d) === v;
}

export type SlidePeriodState = 'active' | 'upcoming' | 'ended';

/** 掲載期間に対して、今日が期間内か（YYYY-MM-DD は文字列のまま比較できる） */
export function periodState(slide: Pick<Slide, 'startAt' | 'endAt'>, today = todayYmd()): SlidePeriodState {
  if (slide.startAt && today < slide.startAt) return 'upcoming';
  if (slide.endAt && today > slide.endAt) return 'ended';
  return 'active';
}

const md = (ymd: string) => {
  const [, m, d] = ymd.split('-');
  return `${Number(m)}/${Number(d)}`;
};

/** 「11/1〜11/30」「11/1〜」「〜11/30」「期間指定なし」 */
export function periodLabel(slide: Pick<Slide, 'startAt' | 'endAt'>): string {
  if (!slide.startAt && !slide.endAt) return '期間指定なし';
  return `${slide.startAt ? md(slide.startAt) : ''}〜${slide.endAt ? md(slide.endAt) : ''}`;
}

export const formatPrice = (price: number) => `¥${price.toLocaleString('ja-JP')}`;

/* ---------- 入力の確認（画面と reducer の両方で使う） ---------- */

export type SlideField = 'template' | 'title' | 'body' | 'items' | 'accent' | 'image' | 'durationSec' | 'period';

/** 戻り値: 項目ごとのエラーメッセージ（問題なければ空） */
export function validateSlide(slide: Slide): Partial<Record<SlideField, string>> {
  const e: Partial<Record<SlideField, string>> = {};
  if (!SLIDE_TEMPLATES.some((t) => t.id === slide.template)) e.template = '種類を選んでください';
  const title = slide.title?.trim() ?? '';
  if (!title) e.title = 'タイトルを入力してください';
  else if (title.length > SLIDE_LIMITS.title) e.title = `タイトルは${SLIDE_LIMITS.title}文字以内にしてください`;
  if ((slide.body?.trim().length ?? 0) > SLIDE_LIMITS.body) e.body = `本文は${SLIDE_LIMITS.body}文字以内にしてください`;
  if (slide.template === 'menu') {
    const items = slide.items ?? [];
    if (items.length < 1) e.items = '品目を 1 つ以上入れてください';
    else if (items.length > SLIDE_LIMITS.items) e.items = `品目は${SLIDE_LIMITS.items}つまでです`;
    else if (items.some((i) => !i.name.trim() || i.name.trim().length > SLIDE_LIMITS.itemName)) e.items = `品名を${SLIDE_LIMITS.itemName}文字以内で入力してください`;
    else if (items.some((i) => !Number.isInteger(i.price) || i.price < 0 || i.price > SLIDE_LIMITS.priceMax)) e.items = '価格は 0〜99,999 の半角数字で入力してください';
  }
  if (!SLIDE_ACCENTS.some((a) => a.id === slide.accent)) e.accent = '色を選んでください';
  if (slide.image && !imageOf(slide.image)) e.image = '画像を選び直してください';
  if (!Number.isInteger(slide.durationSec) || slide.durationSec < SLIDE_LIMITS.durationMin || slide.durationSec > SLIDE_LIMITS.durationMax) {
    e.durationSec = `表示する秒数は${SLIDE_LIMITS.durationMin}〜${SLIDE_LIMITS.durationMax}秒にしてください`;
  }
  if ((slide.startAt && !isValidYmd(slide.startAt)) || (slide.endAt && !isValidYmd(slide.endAt))) e.period = '日付を正しく入力してください';
  else if (slide.startAt && slide.endAt && slide.endAt < slide.startAt) e.period = '終了日は開始日と同じか、それより後にしてください';
  return e;
}

/** 保存する形に整える（前後の空白・使わない項目を落とす） */
export function normalizeSlide(slide: Slide): Slide {
  const body = slide.body?.trim();
  return {
    ...slide,
    title: slide.title.trim(),
    body: body || undefined,
    items: slide.template === 'menu' ? (slide.items ?? []).map((i) => ({ name: i.name.trim(), price: i.price })) : undefined,
    image: slide.template === 'menu' ? undefined : slide.image || undefined,
    startAt: slide.startAt || undefined,
    endAt: slide.endAt || undefined,
  };
}

/* ---------- 端末 ---------- */

/** 端末が流している（配信済みの）スライド。配信時の写しを優先し、無ければ現在のスライドで代用する */
export function deliveredSlidesOf(display: Display, slides: Slide[]): Slide[] {
  return display.deliveredSlideIds
    .map((id) => display.deliveredSlides?.[id] ?? slides.find((s) => s.id === id))
    .filter((s): s is Slide => !!s);
}

/** 未配信の変更があるか（再生順の違い・配信後に編集したスライド） */
export function hasUndelivered(display: Display, slides: Slide[]): boolean {
  const a = display.slideIds;
  const b = display.deliveredSlideIds;
  if (a.length !== b.length || a.some((id, i) => id !== b[i])) return true;
  if (!display.deliveredSlides) return false;
  return a.some((id) => {
    const now = slides.find((s) => s.id === id);
    return !!now && now.updatedAt !== display.deliveredSlides?.[id]?.updatedAt;
  });
}

/** オフライン中に配信した内容は、端末がオンラインになったときに反映される */
export const waitingForSync = (display: Display) => !display.online && !!display.deliveredAt && display.deliveredAt > display.lastSeenAt;

/* ---------- 初期データ ---------- */

export function seedSignage(): SignageState {
  const slides: Slide[] = [
    {
      id: 'sl1', template: 'promo', title: '冬のメープルラテ はじめました', body: '焙煎したての豆とカナダ産メープルシロップ。ホット・アイスどちらも。',
      accent: 'roast', image: 'latte', durationSec: 10, startAt: ymdFromNow(-10), endAt: ymdFromNow(40), updatedAt: daysAgo(6),
    },
    {
      id: 'sl2', template: 'menu', title: 'モーニング 8:00–10:30', body: 'ドリンクはブレンドかカフェラテから選べます',
      items: [{ name: 'トーストセット', price: 580 }, { name: 'ホットサンドセット', price: 720 }, { name: 'グラノーラボウル', price: 650 }],
      accent: 'leaf', durationSec: 12, updatedAt: daysAgo(9),
    },
    {
      id: 'sl3', template: 'menu', title: 'ランチセット 11:00–14:00', body: 'スープとドリンク付き',
      items: [{ name: 'キッシュプレート', price: 1100 }, { name: '自家製カレー', price: 1050 }, { name: 'サンドイッチプレート', price: 980 }, { name: '本日のパスタ', price: 1200 }],
      accent: 'night', durationSec: 15, updatedAt: hoursAgo(20),
    },
    {
      id: 'sl4', template: 'news', title: '年末年始の営業について', body: '12月29日〜1月3日は休業いたします。オンラインショップのご注文は1月4日より順次発送します。',
      accent: 'night', durationSec: 10, sourcePageId: 'pg5', updatedAt: daysAgo(5),
    },
    {
      id: 'sl5', template: 'promo', title: 'コーヒーギフト 承ります', body: '名入れは50個から。のし・メッセージカード無料。',
      accent: 'berry', image: 'gift', durationSec: 8, startAt: ymdFromNow(5), endAt: ymdFromNow(50), updatedAt: daysAgo(2),
    },
  ];
  const snap = (ids: string[]) => Object.fromEntries(ids.map((id) => [id, slides.find((s) => s.id === id)!]));
  const displays: Display[] = [
    {
      id: 'ds1', name: '店頭入口', location: '入口の外向きウィンドウ', orientation: 'landscape', online: true, lastSeenAt: hoursAgo(0.02),
      slideIds: ['sl1', 'sl2', 'sl4'], deliveredSlideIds: ['sl1', 'sl2', 'sl4'], deliveredSlides: snap(['sl1', 'sl2', 'sl4']), deliveredAt: daysAgo(1),
    },
    {
      // ランチセットを追加したが、まだ配信していない（未配信の変更あり）
      id: 'ds2', name: 'レジ横', location: 'レジカウンターの横（縦置き）', orientation: 'portrait', online: true, lastSeenAt: hoursAgo(0.05),
      slideIds: ['sl1', 'sl3', 'sl2'], deliveredSlideIds: ['sl1', 'sl2'], deliveredSlides: snap(['sl1', 'sl2']), deliveredAt: daysAgo(3),
    },
    {
      id: 'ds3', name: '店内壁面', location: '客席奥の壁', orientation: 'landscape', online: false, lastSeenAt: daysAgo(2),
      slideIds: ['sl2', 'sl4'], deliveredSlideIds: ['sl2', 'sl4'], deliveredSlides: snap(['sl2', 'sl4']), deliveredAt: daysAgo(4),
    },
  ];
  return { displays, slides };
}
