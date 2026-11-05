import type { CmsPage, PageStatus, PageType } from '@/types';
import type { PillTone } from '@/components/ui';
import { sanitizeHtml } from './sanitize';

export const STATUS_META: Record<PageStatus, { label: string; tone: PillTone }> = {
  draft: { label: '下書き', tone: 'neutral' },
  review: { label: '承認待ち', tone: 'warning' },
  scheduled: { label: '予約公開', tone: 'info' },
  published: { label: '公開中', tone: 'success' },
};

export const TYPE_LABEL: Record<PageType, string> = { page: 'ページ', news: 'お知らせ' };

export const SEO_TITLE_MAX = 60;
export const SEO_DESC_MAX = 120;
export const TITLE_MAX = 60;

/** 日本語タイトルはローマ字化できないため、種別＋日付＋短いIDで URL を作る */
export function suggestSlug(type: PageType, title: string): string {
  const ascii = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40);
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const tail = ascii || `${ymd}-${Math.random().toString(36).slice(2, 6)}`;
  return type === 'news' ? `/journal/${tail}` : `/${tail}`;
}

/** 戻り値: エラーメッセージ（問題なければ null） */
export function validateSlug(slug: string, pages: CmsPage[], selfId?: string): string | null {
  if (!slug) return 'URL を入力してください';
  if (!slug.startsWith('/')) return 'URL は「/」で始めてください';
  if (slug.length > 80) return 'URL は80文字以内にしてください';
  if (!/^\/[a-z0-9\-_/]*$/.test(slug)) return '半角英小文字・数字・「-」「_」「/」だけが使えます';
  if (slug.length > 1 && slug.endsWith('/')) return '末尾の「/」は不要です';
  if (pages.some((p) => p.slug === slug && p.id !== selfId)) return 'この URL は別のページで使われています';
  return null;
}

export function validateTitle(title: string): string | null {
  if (!title.trim()) return 'タイトルを入力してください';
  if (title.length > TITLE_MAX) return `タイトルは${TITLE_MAX}文字以内にしてください`;
  return null;
}

/* ---------- 変更前後の比較 ---------- */

export interface DiffBlock {
  kind: 'same' | 'added' | 'removed';
  html: string;
}

function blocks(html: string | undefined): { key: string; html: string }[] {
  const clean = sanitizeHtml(html);
  if (!clean) return [];
  const doc = new DOMParser().parseFromString(`<body>${clean}</body>`, 'text/html');
  return Array.from(doc.body.children).map((el) => ({ key: `${el.tagName}:${el.textContent?.trim() ?? ''}:${el.getAttribute('src') ?? ''}`, html: el.outerHTML }));
}

/** 段落（ブロック要素）単位の LCS 差分 */
export function diffBlocks(before: string | undefined, after: string | undefined): DiffBlock[] {
  const a = blocks(before);
  const b = blocks(after);
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i].key === b[j].key ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffBlock[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i].key === b[j].key) {
      out.push({ kind: 'same', html: b[j].html });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ kind: 'removed', html: a[i++].html });
    } else {
      out.push({ kind: 'added', html: b[j++].html });
    }
  }
  while (i < m) out.push({ kind: 'removed', html: a[i++].html });
  while (j < n) out.push({ kind: 'added', html: b[j++].html });
  return out;
}

/** 同じ内容か（未保存の判定） */
export function samePage(a: CmsPage, b: CmsPage): boolean {
  return (
    a.title === b.title && a.slug === b.slug && a.content === b.content && a.seoTitle === b.seoTitle &&
    a.seoDescription === b.seoDescription && (a.coverImage ?? '') === (b.coverImage ?? '') && (a.parentPath ?? '') === (b.parentPath ?? '')
  );
}

/** datetime-local 入力用 */
export function toLocalInput(iso?: string): string {
  const d = iso ? new Date(iso) : new Date(Date.now() + 24 * 3600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
