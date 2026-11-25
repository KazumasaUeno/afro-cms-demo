// 機械の検査（1 画面ごと・1 回の出力ごと）。依存なし（HTML パーサーを足さない。軽い字句解析で見る＝[INFERENCE] 精度はブラウザと同じではない）。
// 合格基準は docs/design/DESIGN_AI_SELECTION_2026-11-25.md §3.2 の案を評価前に固定したもの（MACHINE_CRITERIA）。結果を見て緩めない

export const LIMITS = { minBytes: 1_500, maxBytes: 60_000, minJapaneseChars: 30, minContrast: 4.5 };

/* ---------------- 出力の読み取り ---------------- */

const HEX6 = /^#[0-9a-f]{6}$/i;
/** モデルの応答本文（JSON 文字列）→ { ok, proposals } か { ok:false, reason } */
export function parseOutput(text) {
  let j;
  const raw = String(text ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { j = JSON.parse(raw); } catch { return { ok: false, reason: 'json' }; }
  const ps = j?.proposals;
  if (!Array.isArray(ps) || ps.length !== 3) return { ok: false, reason: `proposals=${Array.isArray(ps) ? ps.length : typeof ps}` };
  for (const [i, p] of ps.entries()) {
    if (typeof p?.name !== 'string' || typeof p?.concept !== 'string') return { ok: false, reason: `p${i}.name/concept` };
    const pal = p.palette ?? {};
    for (const k of ['background', 'text', 'accent', 'sub']) if (typeof pal[k] !== 'string' || !HEX6.test(pal[k].trim())) return { ok: false, reason: `p${i}.palette.${k}` };
    if (typeof p?.pages?.top !== 'string' || typeof p?.pages?.main !== 'string') return { ok: false, reason: `p${i}.pages` };
  }
  return { ok: true, proposals: ps.map((p) => ({ name: p.name, concept: p.concept, palette: Object.fromEntries(Object.entries(p.palette).map(([k, v]) => [k, v.trim().toLowerCase()])), pages: { top: p.pages.top, main: p.pages.main } })) };
}

/* ---------------- 色 ---------------- */

const NAMED = { white: '#ffffff', black: '#000000', transparent: null, red: '#ff0000', gray: '#808080', grey: '#808080', navy: '#000080', silver: '#c0c0c0', ivory: '#fffff0', beige: '#f5f5dc', whitesmoke: '#f5f5f5', snow: '#fffafa' };
/** CSS の色 1 つ → { r,g,b,a } か null（var や gradient は呼ぶ前に解く） */
export function parseColor(s) {
  const t = String(s ?? '').trim().toLowerCase();
  let m;
  if ((m = t.match(/^#([0-9a-f]{3,8})$/))) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    const n = (i) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
  }
  if ((m = t.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/))) {
    const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return { r: +m[1], g: +m[2], b: +m[3], a };
  }
  if (t in NAMED) return NAMED[t] ? parseColor(NAMED[t]) : { r: 0, g: 0, b: 0, a: 0 };
  return null;
}
export const toHex = ({ r, g, b }) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const blend = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
const lum = ({ r, g, b }) => {
  const f = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
/** WCAG 2.x のコントラスト比 */
export function contrastRatio(a, b) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
export const colorDistance = (a, b) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);

/* ---------------- CSS の取り出し ---------------- */

/** <style> の中身と style 属性をまとめた CSS 文字列 */
export function cssOf(html) {
  const blocks = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
  const inline = [...html.matchAll(/\sstyle\s*=\s*("([^"]*)"|'([^']*)')/gi)].map((m) => m[2] ?? m[3]);
  return { sheet: blocks.join('\n'), inline, all: [...blocks, ...inline].join('\n') };
}

/** 素朴な CSS の規則の列（@media の中は外して数える。後勝ちの順を保つ） */
export function rulesOf(sheet) {
  const css = sheet.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const sel = m[1].replace(/@media[^{]*$/i, '').replace(/^[\s\S]*@media[^{]*\{/i, '').trim();
    const inMedia = /@media/i.test(m[1]) || isInsideMedia(css, m.index);
    const decl = {};
    for (const d of m[2].split(';')) {
      const i = d.indexOf(':');
      if (i < 0) continue;
      decl[d.slice(0, i).trim().toLowerCase()] = d.slice(i + 1).replace(/!important/i, '').trim();
    }
    out.push({ selectors: sel.split(',').map((s) => s.trim().toLowerCase()), decl, inMedia });
  }
  return out;
}
function isInsideMedia(css, idx) {
  const before = css.slice(0, idx);
  const open = before.lastIndexOf('@media');
  if (open < 0) return false;
  const seg = before.slice(open);
  return (seg.match(/\{/g) ?? []).length > (seg.match(/\}/g) ?? []).length;
}

/** :root / html / body の CSS 変数 */
function varsOf(rules) {
  const v = {};
  for (const r of rules) if (!r.inMedia && r.selectors.some((s) => s === ':root' || s === 'html' || s === 'body')) for (const [k, val] of Object.entries(r.decl)) if (k.startsWith('--')) v[k] = val;
  return v;
}
function resolveVar(val, vars, depth = 0) {
  if (depth > 5 || val == null) return val;
  return val.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)/g, (_, name, fb) => (vars[name] !== undefined ? resolveVar(vars[name], vars, depth + 1) : fb ?? ''));
}

/** 要素の最終的な宣言（メディアクエリの外・単純セレクタだけ。body の style 属性も足す） */
function declFor(rules, names, extra = {}) {
  const d = {};
  for (const r of rules) if (!r.inMedia && r.selectors.some((s) => names.includes(s))) Object.assign(d, r.decl);
  return { ...d, ...extra };
}
const bgColorOf = (decl, vars) => {
  const bgc = resolveVar(decl['background-color'], vars);
  const bg = resolveVar(decl.background, vars);
  if (bg && /gradient|url\(/i.test(bg)) return { unknown: 'background が gradient / 画像' };
  const src = bgc ?? (bg ? bg.split(/\s+(?![^(]*\))/)[0] : undefined);
  if (src === undefined) return { none: true };
  const c = parseColor(src);
  return c ? { color: c } : { unknown: `背景色を読めない: ${src.slice(0, 40)}` };
};

/**
 * 本文の文字色と背景色のコントラスト（計算できたときだけ）。
 * 背景: body → html → 既定の白。文字: p → body → 既定の黒。gradient・画像・読めない色は UNKNOWN
 */
export function bodyContrast(html) {
  const { sheet } = cssOf(html);
  const rules = rulesOf(sheet);
  const vars = varsOf(rules);
  const bodyTag = html.match(/<body\b([^>]*)>/i)?.[1] ?? '';
  const bodyInline = {};
  const st = bodyTag.match(/style\s*=\s*("([^"]*)"|'([^']*)')/i);
  if (st) for (const d of (st[2] ?? st[3]).split(';')) { const i = d.indexOf(':'); if (i > 0) bodyInline[d.slice(0, i).trim().toLowerCase()] = d.slice(i + 1).trim(); }
  let body = declFor(rules, ['body'], bodyInline);
  const htmlDecl = declFor(rules, ['html', ':root']);
  // body / html に色が無く、body 直下の最初の要素が style 属性で背景を持つなら、それを画面の地とみなす（テンプレートの形: <body><div style="background:…;color:…">）
  if (!body.background && !body['background-color'] && !htmlDecl.background && !htmlDecl['background-color']) {
    const first = html.match(/<body\b[^>]*>\s*<[a-z][\w-]*\b[^>]*?\sstyle\s*=\s*("([^"]*)"|'([^']*)')/i);
    if (first) {
      const d = {};
      for (const x of (first[2] ?? first[3]).replace(/&quot;/g, '"').split(';')) { const i = x.indexOf(':'); if (i > 0) d[x.slice(0, i).trim().toLowerCase()] = x.slice(i + 1).trim(); }
      if (d.background || d['background-color']) body = { ...body, ...d };
    }
  }
  let bg = bgColorOf(body, vars);
  if (bg.none) bg = bgColorOf(htmlDecl, vars);
  if (bg.unknown) return { ratio: null, unknown: bg.unknown };
  let bgc = bg.none ? { r: 255, g: 255, b: 255, a: 1 } : bg.color;
  if (bgc.a < 1) bgc = blend(bgc, { r: 255, g: 255, b: 255, a: 1 });
  const p = declFor(rules, ['p']);
  const textSrc = resolveVar(p.color ?? body.color ?? htmlDecl.color, vars);
  let fg = textSrc === undefined ? { r: 0, g: 0, b: 0, a: 1 } : parseColor(textSrc);
  if (!fg) return { ratio: null, unknown: `文字色を読めない: ${String(textSrc).slice(0, 40)}` };
  if (fg.a < 1) fg = blend(fg, bgc);
  return { ratio: +contrastRatio(fg, bgc).toFixed(2), fg: toHex(fg), bg: toHex(bgc) };
}

/* ---------------- 安全（外部読み込み・スクリプト） ---------------- */

/** 禁止の項目を数える（0 件で合格）。見つけた種類と抜粋を返す */
export function forbiddenOf(html) {
  const hits = [];
  const add = (kind, m) => hits.push({ kind, at: String(m).slice(0, 80) });
  for (const m of html.matchAll(/<script\b/gi)) add('script', m[0]);
  for (const m of html.matchAll(/<[a-z][^>]*?\son[a-z]+\s*=/gi)) add('on-handler', m[0]);
  for (const m of html.matchAll(/javascript:/gi)) add('javascript-url', m[0]);
  for (const m of html.matchAll(/https?:\/\/[^\s"'<>)]*/gi)) {
    // SVG の名前空間（xmlns="http://www.w3.org/2000/svg" など）は読み込みではない
    if (/^https?:\/\/www\.w3\.org\//i.test(m[0])) continue;
    add('external-url', m[0]);
  }
  for (const m of html.matchAll(/(?:["'(=\s])\/\/[a-z0-9][^\s"'<>)]*/gi)) add('protocol-relative-url', m[0]);
  for (const m of html.matchAll(/@import\b[^;]*/gi)) add('css-import', m[0]);
  for (const m of html.matchAll(/url\(\s*(['"]?)(?!data:|#)([^'")]+)\1\s*\)/gi)) add('css-url', m[0]);
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) add('link-tag', m[0]);
  for (const m of html.matchAll(/<(iframe|object|embed|frame|base|meta\s+http-equiv\s*=\s*["']?refresh)\b[^>]*>/gi)) add('embed-tag', m[0]);
  for (const m of html.matchAll(/<form\b[^>]*\saction\s*=/gi)) add('form-action', m[0]);
  for (const m of html.matchAll(/<(?:img|source|video|audio)\b[^>]*\ssrc(?:set)?\s*=\s*["']?(?!data:)[^"'\s>]+/gi)) add('media-src', m[0]);
  for (const m of html.matchAll(/\shref\s*=\s*["']?(?!#|["'])([^"'\s>]+)/gi)) if (!/^#/.test(m[1])) add('href-not-anchor', m[0]);
  // 同じ箇所を 2 つの規則で数えない（例: <link href="https://..."> は link-tag と external-url で 2 件になるのは許す＝種類別に数えたい）
  return hits;
}

/* ---------------- HTML の形 ---------------- */

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr', 'path', 'circle', 'rect', 'ellipse', 'line', 'polyline', 'polygon', 'stop', 'use']);
const OPTIONAL_CLOSE = new Set(['p', 'li', 'dt', 'dd', 'tr', 'td', 'th', 'thead', 'tbody', 'tfoot', 'option', 'colgroup', 'rt', 'rp', 'optgroup']);
/** HTML として読めるか（字句の目安。ブラウザは壊れた HTML も表示するので「ブラウザで開けない」とは別） */
export function parseHtml(html) {
  const problems = [];
  if (!/^\s*<!doctype html>/i.test(html)) problems.push('doctype なし');
  if (!/<html\b[^>]*\blang\s*=\s*["']?ja/i.test(html)) problems.push('html lang="ja" なし');
  if (!/<meta\b[^>]*charset\s*=\s*["']?utf-8/i.test(html)) problems.push('meta charset=utf-8 なし');
  if (!/<meta\b[^>]*name\s*=\s*["']?viewport/i.test(html)) problems.push('viewport なし');
  if (!/<body\b/i.test(html) || !/<\/body>/i.test(html)) problems.push('body なし');
  if (!/<\/html>\s*$/i.test(html)) problems.push('</html> で終わらない');
  const body = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  const stack = [];
  for (const m of body.matchAll(/<(\/?)([a-zA-Z][\w-]*)\b[^>]*?(\/?)>/g)) {
    const [, close, nameRaw, selfClose] = m;
    const name = nameRaw.toLowerCase();
    if (name === '!doctype' || VOID.has(name) || selfClose) continue;
    if (!close) { stack.push(name); continue; }
    while (stack.length && stack.at(-1) !== name && OPTIONAL_CLOSE.has(stack.at(-1))) stack.pop();
    if (stack.at(-1) === name) stack.pop();
    else { problems.push(`閉じタグの対応がずれる: </${name}>`); break; }
  }
  const left = stack.filter((t) => !OPTIONAL_CLOSE.has(t));
  if (left.length) problems.push(`閉じていない: ${left.slice(-3).join(',')}`);
  return { ok: problems.length === 0, problems };
}

/* ---------------- 文字 ---------------- */

/** 画面に出る文字（style・script・タグ・SVG の中の文字以外） */
export function visibleText(html) {
  return html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(style|script|head)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/\s+/g, ' ').trim();
}
const JP = /[぀-ヿ㐀-鿿ｦ-ﾟ]/g;
// 文字化けの目印: U+FFFD・UTF-8 を Latin-1 で読んだ形・UTF-8 を Shift_JIS で読んだときに出やすい字（縺 繧 繝 譁 蜷 は通常の文ではまず使わない）
const MOJIBAKE = /�|Ã[\u0080-¿]|â€|ã[\u0080-¿]|[縺繧繝]|譁ｰ|蜷|�/g;
export function textChecks(html, inputs = '') {
  const text = visibleText(html);
  const jp = (text.match(JP) ?? []).length;
  const mojibake = [...text.matchAll(MOJIBAKE)].map((m) => m[0]);
  // 入力に無い数字（年・件数・料金など）。半角・全角の数字の並び。入力の数字と、15,000 のような区切りは正規化して照合
  const norm = (s) => s.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0)).replace(/,/g, '');
  const known = new Set((norm(inputs).match(/\d+/g) ?? []));
  const unsupportedNumbers = [...new Set((norm(text).match(/\d+/g) ?? []).filter((n) => !known.has(n) && !/^0?[1-9]$|^0[1-9]$/.test(n)))];
  return { japaneseChars: jp, japaneseOk: jp >= LIMITS.minJapaneseChars, mojibake: mojibake.length, mojibakeSamples: [...new Set(mojibake)].slice(0, 5), unsupportedNumbers, text };
}

/* ---------------- ブランド色 ---------------- */

/** CSS の中の色をすべて拾う（#hex・rgb()） */
export function colorsInCss(css) {
  const out = [];
  for (const m of css.matchAll(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi)) { const c = parseColor(m[0]); if (c) out.push(c); }
  return out;
}
/** ブランド色が CSS に「そのまま」あるか（#abc → #aabbcc・大文字小文字・rgb() も同じ色として数える）。近い色との距離も返す */
export function brandCheck(html, brandHex) {
  const brand = parseColor(brandHex);
  const colors = colorsInCss(cssOf(html).all);
  const exact = colors.some((c) => c.r === brand.r && c.g === brand.g && c.b === brand.b);
  const nearest = colors.length ? Math.min(...colors.map((c) => colorDistance(c, brand))) : null;
  return { present: exact, nearestDistance: nearest === null ? null : +nearest.toFixed(1) };
}

/* ---------------- 1 画面の検査 ---------------- */

export function checkPage(html, { brandHex, inputs = '', ctaWords = [], page = 'top' }) {
  const bytes = Buffer.byteLength(html, 'utf8');
  const parse = parseHtml(html);
  const forbidden = forbiddenOf(html);
  const brand = brandCheck(html, brandHex);
  const t = textChecks(html, inputs);
  const contrast = bodyContrast(html);
  const responsive = /@media\b[^{]*\b(max|min)-width/i.test(cssOf(html).sheet);
  return {
    page,
    bytes,
    sizeOk: bytes >= LIMITS.minBytes && bytes <= LIMITS.maxBytes,
    parseOk: parse.ok, parseProblems: parse.problems,
    forbidden: forbidden.length, forbiddenKinds: [...new Set(forbidden.map((h) => h.kind))], forbiddenSamples: forbidden.slice(0, 5),
    brandPresent: brand.present, brandNearest: brand.nearestDistance,
    japaneseOk: t.japaneseOk, japaneseChars: t.japaneseChars, mojibake: t.mojibake, mojibakeSamples: t.mojibakeSamples,
    unsupportedNumbers: t.unsupportedNumbers,
    contrast: contrast.ratio, contrastFg: contrast.fg ?? null, contrastBg: contrast.bg ?? null, contrastUnknown: contrast.ratio === null ? contrast.unknown : null,
    contrastOk: contrast.ratio === null ? null : contrast.ratio >= LIMITS.minContrast,
    responsive,
    ctaPresent: page === 'top' ? ctaWords.some((w) => t.text.includes(w)) : null,
  };
}

/* ---------------- 3 案の違い ---------------- */

/** レイアウトの特徴: 要素名の並び（3 連）と、CSS の display / grid / flex の値 */
function layoutFeatures(html) {
  const tags = [...html.replace(/<(style|head)\b[^>]*>[\s\S]*?<\/\1>/gi, '').matchAll(/<([a-z][\w-]*)\b/gi)].map((m) => m[1].toLowerCase());
  const grams = new Set();
  for (let i = 0; i + 2 < tags.length; i++) grams.add(tags.slice(i, i + 3).join('>'));
  const css = cssOf(html).all;
  for (const m of css.matchAll(/(display|grid-template-columns|flex-direction|position|text-align|writing-mode)\s*:\s*([^;}"]+)/gi)) grams.add(`${m[1].toLowerCase()}:${m[2].trim().toLowerCase()}`);
  return grams;
}
const jaccard = (a, b) => { const i = [...a].filter((x) => b.has(x)).length; const u = new Set([...a, ...b]).size; return u ? i / u : 1; };

/**
 * 同じ案件の 3 案が見分けられるか（目安）。2 案の組ごとに「配色が近い（背景色の距離 < 40 かつ文字色の距離 < 40）かつ
 * レイアウトが近い（トップの特徴の Jaccard > 0.8）」なら似ている。似ている組が 0 なら distinct。人の判定（盲検）が正
 */
export function distinctness(proposals) {
  const feats = proposals.map((p) => layoutFeatures(p.pages.top));
  const pairs = [];
  for (let i = 0; i < proposals.length; i++) for (let j = i + 1; j < proposals.length; j++) {
    const [a, b] = [proposals[i].palette, proposals[j].palette];
    const bgD = colorDistance(parseColor(a.background), parseColor(b.background));
    const txD = colorDistance(parseColor(a.text), parseColor(b.text));
    const lay = jaccard(feats[i], feats[j]);
    pairs.push({ pair: `${i + 1}-${j + 1}`, bgDistance: +bgD.toFixed(1), textDistance: +txD.toFixed(1), layoutSimilarity: +lay.toFixed(2), similar: bgD < 40 && txD < 40 && lay > 0.8 });
  }
  return { distinct: pairs.every((p) => !p.similar), pairs };
}

/* ---------------- 集計 ---------------- */

export const p90 = (xs) => { const s = xs.filter((x) => typeof x === 'number').sort((a, b) => a - b); return s.length ? s[Math.ceil(s.length * 0.9) - 1] : null; };

/**
 * 機械の合格基準（評価前に固定。§3.2 の案。結果を見て緩めない）。
 * 時間は §3.2 の「1 案 p90 ≤ 180 秒」を、3 案を 1 回で出すこの道具では「1 回 p90 ≤ 540 秒」と読む [TARGET・解釈はユーザー確認待ち]
 */
export const MACHINE_CRITERIA = {
  text: '全回: Schema どおり・HTML の形・禁止 0・ブランド色が全画面の CSS に・CTA がトップに・日本語あり・文字化け 0・コントラスト不合格 0（UNKNOWN は目視へ）・サイズ内・3 案が見分けられる（目安）／ p90 ≤ 540 秒/回',
  p90MsPerCall: 540_000,
};
export function machinePass(s) {
  return s.n > 0 && s.schemaOk === s.n && s.pages === s.schemaOk * 6 && s.parseFail === 0 && s.forbidden === 0 && s.brandMissing === 0 && s.ctaMissing === 0
    && s.japaneseFail === 0 && s.mojibake === 0 && s.contrastFail === 0 && s.sizeFail === 0 && s.notDistinct === 0
    && s.p90ms !== null && s.p90ms <= MACHINE_CRITERIA.p90MsPerCall;
}

/** モデル 1 つ分の行（1 行 = 1 回の呼び出し）を集計する */
export function summarize(model, rows) {
  const m = rows.filter((r) => r.model === model);
  const pages = m.flatMap((r) => r.pageChecks ?? []);
  const s = {
    model, n: m.length, schemaOk: m.filter((r) => r.code === 'ok').length, pages: pages.length,
    parseFail: pages.filter((p) => !p.parseOk).length,
    forbidden: pages.reduce((a, p) => a + p.forbidden, 0),
    brandMissing: pages.filter((p) => !p.brandPresent).length,
    ctaMissing: pages.filter((p) => p.page === 'top' && !p.ctaPresent).length,
    japaneseFail: pages.filter((p) => !p.japaneseOk).length,
    mojibake: pages.reduce((a, p) => a + p.mojibake, 0),
    contrastFail: pages.filter((p) => p.contrastOk === false).length,
    contrastUnknown: pages.filter((p) => p.contrastOk === null).length,
    sizeFail: pages.filter((p) => !p.sizeOk).length,
    notResponsive: pages.filter((p) => !p.responsive).length,
    unsupportedNumberPages: pages.filter((p) => p.unsupportedNumbers.length).length,
    notDistinct: m.filter((r) => r.distinct === false).length,
    p90ms: p90(m.map((r) => r.ms)),
    costUsd: +(m.reduce((a, r) => a + (r.costMicroUsd ?? 0), 0) / 1e6).toFixed(4),
  };
  return { ...s, machinePass: machinePass(s) };
}
