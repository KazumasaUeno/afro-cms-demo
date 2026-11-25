/**
 * 提案 v3 の後処理と、全項目の組み立て（REQUIREMENTS_DOC_TEMPLATE.md §4.1「後処理」「最後にサーバーが全 129 項目を組み立てる」）。
 *
 * AI の項目（fill:'ai' だけ）: 許可されない id・重複（先勝ち）を捨てる／evidence を許可リスト（実際に送ったキー）に絞る／
 *   proposed・na で evidence か文が空なら open（文は空）／na は選択だけ（個別の na は open・文は空）／open は evidence が無ければ文を空に／
 *   URL・メール・電話・郵便番号を除く／入力に無い数字は flags.unsupportedNumbers に「項目 id:数字」で付ける（消さない。開発者が判断）
 * AI追加: 章の許可リスト外・evidence 0 件・ラベル/文/理由が空・ひな型の項目と同名・AI追加どうしの同名・1 章 5 件超・合計 10 件超を捨てる
 * 組み立て: 固定 → std_pending（文は空）／server → 決まった形の転記（選択式の回答と案件の欄だけ。自由記述は転記しない）／
 *   ai → 上の結果（無ければ open）／human → open。22 章の未決事項（t22-01）に open の項目名と AI の確認事項を集める
 */
import { REQ_DOC_LIMITS as D, type AiEditableV3, type ProposalV3Doc, type ReqDocAddedItem, type ReqDocItem } from './shared/aiDraft';
import type { ReqDocCatalogItem } from './shared/reqDocCatalog';
import { redactText } from './shared/redact';
import { numbersIn } from './shared/numbersIn';
import { postprocess } from './postprocess';
import { cut } from './schema';
import type { RawOutputV3 } from './reqDocSchema';
import { catalogOrThrow, CURRENT_TEMPLATE_VERSION, labelKey, reqDocAiChapterIds } from './reqDocCatalogView';

/** ヒアリングの選択式の選択肢（src/data/requirements.ts・firestore.rules の ansSingle と同じ。tests/functions/ai-reqdoc.test.mjs が照合する） */
export const DNS_OWNER_OPTIONS = ['お客様', '制作会社・他社', 'アフロ', '不明'] as const;
export const DNS_SWITCH_OPTIONS = ['アフロへ移管', 'お客様側で設定変更', '未定'] as const;
/** 「決まっていない」を表す選択肢（転記はするが状態は open） */
const UNDECIDED = new Set<string>(['不明', '未定']);

/**
 * サーバーが転記する材料（AI へは送らない。worker が案件の文書と回答から読む）。
 * dnsOwner・dnsSwitch は選択肢に無い値なら転記しない。日付は yyyy-mm-dd だけ
 */
export interface ReqDocServerFacts {
  siteName?: string;
  clientName?: string;
  dnsOwner?: string;
  dnsSwitch?: string;
  releaseDate?: string;
  deliveryDate?: string;
  buildDue?: string;
}

export interface PostprocessV3Ctx {
  allowedEvidence: ReadonlySet<string>;
  inputText: string;
  facts: ReqDocServerFacts;
}

const SITE_NAME_MAX = 100;
const MAX_FLAGS = 50;
const PER_CHAPTER_ADDED = 5;

const open = (by: ReqDocItem['by'], text = '', evidence: string[] = []): ReqDocItem => ({ status: 'open', text, evidence, by });
const isoDay = (v: unknown): string => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}(?:$|T)/.test(v) ? v.slice(0, 10) : '');
const nameOf = (v: unknown): string => (typeof v === 'string' ? cut(v.replace(/\s+/g, ' ').trim(), SITE_NAME_MAX) : '');
const choice = (v: unknown, opts: readonly string[]): string => (typeof v === 'string' && opts.includes(v) ? v : '');

/** server の 8 項目（t22-01 は組み立ての最後に作る） */
function serverItem(item: ReqDocCatalogItem, f: ReqDocServerFacts): ReqDocItem {
  const fixed = (text: string, evidence: string[], undecided = false): ReqDocItem =>
    ({ status: undecided ? 'open' : 'proposed', text, evidence, by: 'server' });
  const owner = choice(f.dnsOwner, DNS_OWNER_OPTIONS);
  const sw = choice(f.dnsSwitch, DNS_SWITCH_OPTIONS);
  switch (item.id) {
    case 't01-01': { const s = nameOf(f.siteName); return s ? fixed(s, ['project:siteName']) : open('server'); }
    case 't01-02': { const s = nameOf(f.clientName); return s ? fixed(s, ['project:clientName']) : open('server'); }
    case 't12-01': return owner ? fixed(`ドメインの管理: ${owner}`, ['q-dns-owner'], UNDECIDED.has(owner)) : open('server');
    case 't12-02': {
      const parts = [owner && `ドメイン・DNS の管理: ${owner}`, sw && `公開時の切り替え: ${sw}`].filter(Boolean) as string[];
      const ev = [owner && 'q-dns-owner', sw && 'q-dns-switch'].filter(Boolean) as string[];
      return parts.length ? fixed(parts.join('／'), ev, UNDECIDED.has(owner) || UNDECIDED.has(sw) || !owner || !sw) : open('server');
    }
    case 't18-02': return sw ? fixed(`公開時の切り替え: ${sw}`, ['q-dns-switch'], UNDECIDED.has(sw)) : open('server');
    case 't19-03': { const d = isoDay(f.buildDue); return d ? fixed(`実装の完了予定: ${d}`, ['schedule:buildDue']) : open('server'); }
    case 't19-05': { const d = isoDay(f.deliveryDate); return d ? fixed(`検収の期限（納品予定日）: ${d}`, ['schedule:deliveryDate']) : open('server'); }
    default: return open('server');
  }
}

export interface PostprocessV3Result { editable: AiEditableV3; unsupportedNumbers: string[] }

export function postprocessV3(raw: RawOutputV3, ctx: PostprocessV3Ctx): PostprocessV3Result {
  const catalog = catalogOrThrow(CURRENT_TEMPLATE_VERSION);
  const known = new Set(numbersIn(ctx.inputText));
  // 要約・改善ポイントは v2 と同じ後処理（draft は使わないので空）
  const base = postprocess(
    { summary: raw.summary, points: raw.points, draft: { goal: '', target: '', contents: '', features: '', nonFunctional: '', operation: '', schedule: '', openQuestions: [] } },
    { allowedEvidence: ctx.allowedEvidence, inputText: ctx.inputText },
  );
  const flags: string[] = [...base.unsupportedNumbers];
  const flag = (id: string, s: string) => {
    for (const n of numbersIn(s)) if (!known.has(n)) { const k = `${id}:${n}`; if (!flags.includes(k)) flags.push(k); }
  };
  const evidenceOf = (list: string[]) => [...new Set(list.filter((e) => ctx.allowedEvidence.has(e)))].slice(0, D.itemEvidence);
  const clean = (s: string) => redactText(s).trim();

  // AI の項目
  const aiItems = new Map(catalog.items.filter((i) => i.fill === 'ai').map((i) => [i.id, i]));
  const fromAi = new Map<string, ReqDocItem>();
  for (const r of raw.doc.items) {
    const cat = aiItems.get(r.id);
    if (!cat || fromAi.has(r.id)) continue; // 固定・server・human・未知の id は捨てる／重複は先勝ち
    const evidence = evidenceOf(r.evidence);
    let text = clean(r.text);
    let status: ReqDocItem['status'] = r.status;
    if (status === 'na' && cat.kubun !== 'optional') { status = 'open'; text = ''; }
    if ((status === 'proposed' || status === 'na') && (evidence.length === 0 || !text)) { status = 'open'; text = ''; }
    if (status === 'open' && evidence.length === 0) text = '';
    if (text) flag(r.id, text);
    fromAi.set(r.id, { status, text, evidence: status === 'open' && !text ? [] : evidence, by: 'ai' });
  }

  // 全項目の組み立て
  const items: Record<string, ReqDocItem> = {};
  for (const cat of catalog.items) {
    if (cat.fill === 'standard' || cat.kubun === 'fixed') items[cat.id] = { status: 'std_pending', text: '', evidence: [], by: 'server' };
    else if (cat.fill === 'server') items[cat.id] = serverItem(cat, ctx.facts);
    else if (cat.fill === 'ai') items[cat.id] = fromAi.get(cat.id) ?? open('ai');
    else items[cat.id] = open('human');
  }
  // 19 章の公開: 日程の公開予定日があれば AI の文より優先（AI は日付を作らない）
  const release = isoDay(ctx.facts.releaseDate);
  if (release && items['t19-06']) items['t19-06'] = { status: 'proposed', text: `公開予定日: ${release}`, evidence: ['schedule:releaseDate'], by: 'server' };

  // AI追加
  const chapters = new Set(reqDocAiChapterIds(CURRENT_TEMPLATE_VERSION));
  const catalogLabels = new Set(catalog.items.map((i) => labelKey(i.label)));
  const seen = new Set<string>();
  const perChapter = new Map<string, number>();
  const added: ReqDocAddedItem[] = [];
  for (const a of raw.doc.added) {
    if (added.length >= D.added) break;
    const label = clean(a.label);
    const text = clean(a.text);
    const reason = clean(a.reason);
    const evidence = evidenceOf(a.evidence);
    const key = labelKey(label);
    if (!chapters.has(a.chapterId) || !label || !text || !reason || evidence.length === 0) continue;
    if (catalogLabels.has(key) || seen.has(key) || (perChapter.get(a.chapterId) ?? 0) >= PER_CHAPTER_ADDED) continue;
    seen.add(key);
    perChapter.set(a.chapterId, (perChapter.get(a.chapterId) ?? 0) + 1);
    const id = `a${String(added.length + 1).padStart(2, '0')}`;
    for (const s of [label, text, reason]) flag(id, s);
    added.push({ id, chapterId: a.chapterId, label, status: 'proposed', text, reason, evidence, source: 'ai_added' });
  }

  // 22 章 未決事項: open の項目名（章ごと）＋ AI の確認事項
  const questions = raw.doc.questions.map(clean).filter(Boolean).slice(0, D.openQuestions);
  for (const q of questions) flag('t22-01', q);
  items['t22-01'] = openItemsItem(items, questions);

  const notes: Record<string, string> = Object.fromEntries(catalog.chapters.filter((c) => c.hasNotes).map((c) => [c.id, '']));
  const doc: ProposalV3Doc = {
    items,
    added,
    notes,
    // 表紙は会社名まで（氏名は入れない＝Q-11）。受注者・作成者・承認者は担当者が書く
    cover: { client: cut(nameOf(ctx.facts.clientName), D.coverField), vendor: '', author: '', approver: '' },
  };
  return { editable: { summary: base.editable.summary, points: base.editable.points, doc }, unsupportedNumbers: flags.slice(0, MAX_FLAGS) };
}

/** t22-01 の文（未確定の項目の一覧は itemText まで。章の途中で切らず「ほか n 章」） */
function openItemsItem(items: Record<string, ReqDocItem>, questions: string[]): ReqDocItem {
  const catalog = catalogOrThrow(CURRENT_TEMPLATE_VERSION);
  const groups: string[] = [];
  for (const ch of catalog.chapters) {
    const labels = catalog.items.filter((i) => i.chapterId === ch.id && i.id !== 't22-01' && items[i.id]?.status === 'open').map((i) => i.label);
    if (labels.length) groups.push(`${ch.no} ${labels.join('、')}`);
  }
  const head = '未確定の項目（生成時点）: ';
  let list = '';
  let shown = 0;
  for (const g of groups) {
    const next = list ? `${list}／${g}` : g;
    const rest = groups.length - shown - 1;
    if ([...head, ...next, ...(rest ? `／ほか ${rest} 章` : '')].length > D.itemText) break;
    list = next;
    shown++;
  }
  if (shown < groups.length) list += `${list ? '／' : ''}ほか ${groups.length - shown} 章`;
  const lines = [...(groups.length ? [`${head}${list}`] : []), ...questions.map((q) => `・${q}`)];
  const text = cut(lines.join('\n'), D.openItemsText);
  return { status: 'open', text, evidence: groups.length ? ['derived:openItems'] : [], by: 'server' };
}
