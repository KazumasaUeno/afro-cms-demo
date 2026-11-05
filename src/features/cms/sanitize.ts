/**
 * CMS 本文（HTML）の許可リスト型サニタイザ。
 * プレビュー・比較で dangerouslySetInnerHTML に渡す前に必ず通す。
 * 許可: p,h2,h3,ul,ol,li,strong,em,blockquote,br,img[src=data:image/ | https:],a[href=http(s)]
 * それ以外の要素は中身（テキスト）だけ残して外し、属性はすべて捨てる。
 */

const ALLOWED = new Set(['P', 'H2', 'H3', 'UL', 'OL', 'LI', 'STRONG', 'EM', 'BLOCKQUOTE', 'BR', 'IMG', 'A']);
/** 中身ごと捨てる要素 */
const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'TEMPLATE', 'NOSCRIPT', 'SVG', 'MATH', 'FORM', 'INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'LINK', 'META']);
/** 見た目の都合で同等の許可タグへ寄せる */
const ALIAS: Record<string, string> = { B: 'STRONG', I: 'EM', H1: 'H2', H4: 'H3', H5: 'H3', H6: 'H3' };

const safeImgSrc = (v: string) => /^data:image\/(png|jpe?g|gif|webp|svg\+xml);/i.test(v) || /^https:\/\//i.test(v);
const safeHref = (v: string) => /^https?:\/\//i.test(v);

function cleanNode(node: Node, doc: Document): Node[] {
  if (node.nodeType === Node.TEXT_NODE) return [doc.createTextNode(node.textContent ?? '')];
  if (node.nodeType !== Node.ELEMENT_NODE) return [];
  const el = node as Element;
  const tag = ALIAS[el.tagName] ?? el.tagName;
  if (DROP.has(tag)) return [];

  const children = Array.from(el.childNodes).flatMap((c) => cleanNode(c, doc));
  if (!ALLOWED.has(tag)) return children;

  const out = doc.createElement(tag.toLowerCase());
  if (tag === 'IMG') {
    const src = el.getAttribute('src') ?? '';
    if (!safeImgSrc(src)) return [];
    out.setAttribute('src', src);
    const alt = el.getAttribute('alt');
    if (alt) out.setAttribute('alt', alt.slice(0, 200));
    return [out];
  }
  if (tag === 'A') {
    const href = el.getAttribute('href') ?? '';
    if (!safeHref(href)) return children;
    out.setAttribute('href', href);
    out.setAttribute('rel', 'noopener noreferrer nofollow');
    out.setAttribute('target', '_blank');
  }
  children.forEach((c) => out.appendChild(c));
  return [out];
}

export function sanitizeHtml(html: string | undefined): string {
  if (!html) return '';
  if (typeof DOMParser === 'undefined') return '';
  const parsed = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const target = document.implementation.createHTMLDocument('');
  const wrap = target.createElement('div');
  Array.from(parsed.body.childNodes)
    .flatMap((n) => cleanNode(n, target))
    .forEach((n) => wrap.appendChild(n));
  return wrap.innerHTML;
}

/** HTML からプレーンテキスト（ディスクリプション生成・文字数用） */
export function htmlToText(html: string | undefined): string {
  if (!html || typeof DOMParser === 'undefined') return '';
  // ブロック要素の境目に空白を入れてから文字だけを取り出す
  const spaced = html.replace(/<\/(p|h[1-6]|li|blockquote)>/gi, '$& ').replace(/<br\s*\/?>/gi, ' ');
  const doc = new DOMParser().parseFromString(`<body>${spaced}</body>`, 'text/html');
  doc.querySelectorAll('script,style').forEach((n) => n.remove());
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
}
