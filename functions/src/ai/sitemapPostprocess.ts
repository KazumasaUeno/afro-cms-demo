/**
 * サイトマップの AI 出力の検査と正規化（LIVE_SITEMAP_AI.md §3.2 の ②〜⑫。①の形は sitemapSchema.ts）。純粋関数。
 * AI の出力を信用しない: ページ名・パス・種類・階層・件数を検査し、ID 採番・接続・配置はサーバーが決める。
 * 「現在」の図はルールで作った木（P-4）に課題（理由欄）を付けるだけで、AI はページを足せない。
 * 出力の notes・drop は種別と件数だけ（ページ名・パス・理由を入れない。ログに出せる形）
 */
import { SITEMAP_AI_LIMITS as L } from './limits';
import { numbersIn } from './shared/numbersIn';
import { tree, type SitemapSpec } from './shared/sitemapLayout';
import { SITEMAP_LIMITS, validateLabel, validatePath } from './shared/sitemapRules';
import type { SitemapEdge, SitemapNode } from './shared/types';
import { redactText } from './shared/redact';
import {
  beforeSpecs, CONTROL_ALL, cutUnits, KEY_RE, normalizePath, sanitizeText, UNSAFE_LABEL_RE, type BeforeSource, type BeforeTree,
} from './sitemapPayload';
import type { RawSitemapOutput, SitemapOutChange } from './sitemapSchema';

export interface Diagram { nodes: SitemapNode[]; edges: SitemapEdge[] }
export type SitemapNoteCode = 'home-added' | 'home-fixed' | 'home-extra' | 'parent-fixed' | 'depth-moved' | 'limit-cut';
export interface SitemapNote { code: SitemapNoteCode; count: number }
export interface SitemapDrops { key: number; label: number; path: number; dup: number; limit: number }

export interface SitemapPostprocessed {
  before: Diagram;
  after: Diagram;
  summary: string;
  openQuestions: string[];
  beforeSource: BeforeSource;
  notes: SitemapNote[];
  flags: { unsupportedNumbers: string[]; missingReason: string[] };
  /** 理由の対象（機械で確かめる用。画面には出さない）: 改善後の ID → 変更の種類と由来の現在 ID */
  changes: { id: string; change: SitemapOutChange; from: string[] }[];
  stats: { pagesRaw: number; pagesKept: number; drop: SitemapDrops };
}

const cutCp = (s: string, n: number) => [...s].slice(0, n).join('');

interface Page { key: string; label: string; path: string; kind: SitemapNode['data']['kind']; parent: string | null; change: SitemapOutChange; from: string[]; reason: string }

/**
 * ③ ページ名: `<` `>`・`javascript:`・`data:` を含むものは捨てる（S-16。制御文字を除いてから判定＝間に挟んだ回避も捨てる）→
 * 消毒 → trim → validateLabel。長ければ 24 コードポイントで切って再判定。不正なら null
 */
function cleanLabel(raw: string): string | null {
  if (UNSAFE_LABEL_RE.test(redactText(String(raw ?? '')).replace(CONTROL_ALL, ''))) return null;
  let l = sanitizeText(raw, { singleLine: true });
  if (validateLabel(l) === '24文字以内で入力してください') l = cutCp(l, SITEMAP_LIMITS.label).trim();
  return validateLabel(l) === null ? l : null;
}

export function postprocessSitemap(raw: RawSitemapOutput, ctx: { before: BeforeTree; inputText: string }): SitemapPostprocessed {
  const drop: SitemapDrops = { key: 0, label: 0, path: 0, dup: 0, limit: 0 };
  const notes = new Map<SitemapNoteCode, number>();
  const note = (c: SitemapNoteCode, n = 1) => notes.set(c, (notes.get(c) ?? 0) + n);
  const known = new Set(numbersIn(ctx.inputText));
  const unsupported = new Set<string>();
  // ② 文の消毒（除去・制御文字・< > ・javascript: / data:）＋ ⑪ 入力に無い数字の印
  const text = (s: string, max: number, singleLine = false) => {
    // 長さは UTF-16（validateSitemapDoc の reason ≤ 140 と同じ数え方。絵文字で保存時の検査に落ちない）
    const t = cutUnits(sanitizeText(s, { singleLine }), max).trim();
    for (const n of numbersIn(t)) if (!known.has(n)) unsupported.add(n);
    return t;
  };
  const beforeKeys = new Set(ctx.before.pages.map((p) => p.key));

  // ⑤ トップ: 最初の home だけ。path '/'・parentKey null・key 'home' に揃える。2 件目以降は page。無ければ補う
  const homeIdx = raw.after.findIndex((p) => p.kind === 'home');
  const homeRaw = homeIdx >= 0 ? raw.after[homeIdx] : null;
  const homeKeyAlias = homeRaw && KEY_RE.test(homeRaw.key) ? homeRaw.key : 'home';
  const homeLabel = homeRaw ? cleanLabel(homeRaw.label) : null;
  if (!homeRaw) note('home-added');
  else if (homeRaw.path !== '/' || homeRaw.parentKey !== null || homeRaw.key !== 'home' || homeLabel === null) note('home-fixed');
  const home: Page = {
    key: 'home', label: homeLabel ?? 'トップ', path: '/', kind: 'home', parent: null,
    change: homeRaw?.change ?? 'keep', from: homeRaw?.fromBeforeKeys ?? [], reason: homeRaw?.reason ?? '',
  };
  const pages: Page[] = [home];
  const keys = new Set<string>(['home']);
  const nodesForPath: SitemapNode[] = [{ id: 'a-home', position: { x: 0, y: 0 }, data: { label: home.label, path: '/', kind: 'home' } }];

  raw.after.forEach((p, i) => {
    if (i === homeIdx) return;
    // key（ID の元）: 形が違えば捨てる・重複も捨てる
    if (!KEY_RE.test(p.key)) { drop.key += 1; return; }
    if (keys.has(p.key) || p.key === homeKeyAlias) { drop.dup += 1; return; }
    const label = cleanLabel(p.label);
    if (label === null) { drop.label += 1; return; }
    // ④ パス: 正規化 → validatePath（同じ図で重複不可）
    const path = normalizePath(p.path);
    const pe = validatePath(path, nodesForPath);
    if (pe === '同じパスのページがすでにあります') { drop.dup += 1; return; }
    if (pe !== null) { drop.path += 1; return; }
    let kind = p.kind;
    if (kind === 'home') { kind = 'page'; note('home-extra'); }
    keys.add(p.key);
    nodesForPath.push({ id: `a-${p.key}`, position: { x: 0, y: 0 }, data: { label, path, kind } });
    const parent = p.parentKey === null || p.parentKey === homeKeyAlias || p.parentKey === 'home' ? null : p.parentKey;
    pages.push({ key: p.key, label, path, kind, parent, change: p.change, from: p.fromBeforeKeys, reason: p.reason });
  });
  const pagesRaw = raw.after.length;

  // ⑥ 階層: 存在しない・自分・循環 → トップ直下。第 3 階層以下は第 1 階層の祖先へ寄せる（トップ → 第1 → 第2 まで。F-10）
  const byKey = new Map(pages.map((p) => [p.key, p]));
  for (const p of pages) {
    if (p === home || p.parent === null) continue;
    if (p.parent === p.key || !byKey.has(p.parent)) { p.parent = null; note('parent-fixed'); }
  }
  // 循環: たどって戻ってきたら、輪を閉じている辺（最後にたどったページの親）を外す。輪の外から輪を指すページは動かさない
  for (const p of pages) {
    const seen = new Set<string>([p.key]);
    let last: Page = p;
    let cur = p.parent;
    while (cur !== null) {
      if (seen.has(cur)) { last.parent = null; note('parent-fixed'); break; }
      seen.add(cur);
      const next = byKey.get(cur);
      if (!next) break;
      last = next;
      cur = next.parent;
    }
  }
  const firstAncestor = (p: Page): string | null => {
    let cur: Page = p;
    while (cur.parent !== null) {
      const up = byKey.get(cur.parent);
      if (!up || up.parent === null) return cur.parent;
      cur = up;
    }
    return null;
  };
  for (const p of pages) {
    if (p.parent === null) continue;
    const top = firstAncestor(p);
    if (top !== p.parent) { p.parent = top; note('depth-moved'); }
  }

  // ⑦ 件数（トップを含めて 30）: 超過は第 2 階層の後ろから、それでも多ければ第 1 階層の後ろ（子ごと）から切る
  const max = Math.min(L.afterPages, SITEMAP_LIMITS.aiPages);
  let kept = pages;
  if (kept.length > max) {
    const before = kept.length;
    const second = kept.filter((p) => p.parent !== null);
    const removeSecond = new Set(second.slice(Math.max(0, second.length - (kept.length - max))).map((p) => p.key));
    kept = kept.filter((p) => !removeSecond.has(p.key));
    while (kept.length > max) {
      const last = [...kept].reverse().find((p) => p !== home && p.parent === null);
      if (!last) break;
      kept = kept.filter((p) => p !== last && p.parent !== last.key);
    }
    drop.limit += before - kept.length;
    note('limit-cut', before - kept.length);
  }

  // ⑧ 長さ（理由・課題・要約・未確定事項）。change ≠ keep で理由が空なら印。⑩ 由来は現在の key だけ
  const missingReason: string[] = [];
  const changes: SitemapPostprocessed['changes'] = [];
  const specs: SitemapSpec[] = kept.map((p) => {
    const reason = text(p.reason, L.reason);
    const id = `a-${p.key}`;
    if (p.change !== 'keep' && !reason) missingReason.push(id);
    const from = [...new Set(p.from.filter((k) => beforeKeys.has(k)))].map((k) => `b-${k}`);
    changes.push({ id, change: p.change, from });
    return [p.key, p.label, p.path, p.kind, reason || undefined, p.parent ?? undefined] as SitemapSpec;
  });
  // ⑨ 課題は現在の key だけ・1 key 1 件（先勝ち）
  const issues = new Map<string, string>();
  for (const i of raw.beforeIssues) {
    if (!beforeKeys.has(i.key) || issues.has(i.key)) continue;
    const t = text(i.issue, L.issue);
    if (t) issues.set(i.key, t);
  }
  const summary = text(raw.summary, L.summary);
  const openQuestions = raw.openQuestions.slice(0, L.openQuestions).map((q) => text(q, L.openQuestion)).filter(Boolean);

  // ⑫ ID 採番（b-{key} / a-{key}）・接続は親子から・配置は tree() と同じ（src/data/sitemap.ts の見本と同じ並べ方）
  const after = tree('a', specs);
  const before = tree('b', beforeSpecs(ctx.before, issues));
  const out = [...notes.entries()].map(([code, count]) => ({ code, count }));
  return {
    before: stripUndefined(before),
    after: stripUndefined(after),
    summary,
    openQuestions,
    beforeSource: ctx.before.source,
    notes: out,
    flags: { unsupportedNumbers: [...unsupported].slice(0, 50), missingReason },
    changes,
    stats: { pagesRaw, pagesKept: kept.length, drop },
  };
}

/** tree() は reason: undefined を置く。Firestore と cleanDiagram の形に合わせ、未定義のキーを持たない */
function stripUndefined(d: Diagram): Diagram {
  return {
    nodes: d.nodes.map((n) => ({
      id: n.id,
      position: { x: n.position.x, y: n.position.y },
      data: { label: n.data.label, path: n.data.path, kind: n.data.kind, ...(typeof n.data.reason === 'string' && n.data.reason ? { reason: n.data.reason } : {}) },
    })),
    edges: d.edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
  };
}
