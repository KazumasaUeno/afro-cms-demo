import type { CmsPage } from '@/types';

/**
 * お知らせのカテゴリー（2026-11-17 会議）。既定の 3 つに加え、その案件のお知らせで使っているカテゴリーを選択肢に出す。
 * カテゴリーの一覧は別に保存しない（新しいカテゴリーは、お知らせに付けて保存した時点で選択肢に増える）
 */
export const NEWS_CATEGORY_DEFAULTS = ['お知らせ', 'キャンペーン', 'イベント'] as const;
export const NEWS_CATEGORY_MAX = 20;

export function newsCategoryOptions(pages: Pick<CmsPage, 'type' | 'newsCategory'>[]): string[] {
  const used = pages.flatMap((p) => (p.type === 'news' && p.newsCategory ? [p.newsCategory] : []));
  const extra = Array.from(new Set(used.filter((c) => !(NEWS_CATEGORY_DEFAULTS as readonly string[]).includes(c)))).sort((a, b) => a.localeCompare(b, 'ja'));
  return [...NEWS_CATEGORY_DEFAULTS, ...extra];
}

/** 入力されたカテゴリーを整える（前後の空白を落とし、長すぎるものは切る。空なら未分類） */
export const normalizeNewsCategory = (v: string | null | undefined): string | undefined => {
  const t = (v ?? '').trim().slice(0, NEWS_CATEGORY_MAX);
  return t || undefined;
};
