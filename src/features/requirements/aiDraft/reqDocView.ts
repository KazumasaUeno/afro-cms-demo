/**
 * 提案 v3（会社標準ひな型 TPL-WEB-REQ の章立て）の表示・編集・提出の判定と、要件定義書 PDF の節（docs/design/REQDOC_U4_UI.md §2・§3・§4・§6）。
 *
 * - 純粋関数だけ（React・Firebase・mode.ts を import しない。tests/unit/reqDocView.test.mjs が Node で直接読む）
 * - 表示の行（buildReqDocView）は**お客様にも開発者の「表示」にも同じ**。根拠・書いた元（by）・「AI追加」の文字は入れない（§2.3・Q-8）。
 *   それらは編集の欄（ReqDocV3Editor）だけが generated / local から直接読む
 * - 編集の可否は functions/src/ai/reqDocEditable.ts（サーバーの検査が正）と同じ規則: 固定は std_pending・文は空のまま／対象外は理由が必須／AI追加は編集と削除だけ
 * - 版の判定は v3 → v2 → v1（v1 は version を持たない）
 * - HTML の文字列はすべて esc() を通す
 */
import { reqDocCatalogOf, type ReqDocCatalog, type ReqDocCatalogItem } from '@/shared/ai/reqDocCatalog';
import {
  isProposalV2, isProposalV3, REQ_DOC_LIMITS, type AiEditableV3, type ProposalV3, type ProposalV3Doc, type ReqDocAddedItem, type ReqDocItem,
  type ReqDocItemAuthor, type ReqDocItemStatus, type ReqDocKubun, type StoredProposal,
} from '@/types/aiDraft';
import { esc } from './proposalV2Format';
import { numbersIn } from '@/shared/ai/numbersIn';

// ---------------- 版の判定（§2・§5） ----------------

export type ProposalVersion = 1 | 2 | 3;

/** v3 → v2 → v1 の順に判定する（v1 は version を持たない。v3 を v1 として扱わない） */
export function proposalVersionOf(p: StoredProposal | null | undefined): ProposalVersion {
  if (isProposalV3(p)) return 3;
  if (isProposalV2(p)) return 2;
  return 1;
}

/**
 * live の「要件定義書のつくり方」のいまここ（0〜4。RequirementsHowTo の current。§3.1）。
 * draft で下書きが無い（未生成・生成中・失敗）＝2. AI がたたき台を作成、下書きあり＝3. 内容を確認して承認を依頼、承認待ち＝4. お客様が承認、承認済み＝すべて済み
 */
export function liveHowToStep(status: 'draft' | 'analyzed' | 'approved', hasDraft: boolean): number {
  if (status === 'approved') return 4;
  if (status === 'analyzed') return 3;
  return hasDraft ? 2 : 1;
}

// ---------------- 文言（§6） ----------------

export const REQ_DOC_COPY = {
  sectionTitle: 'AI 要件定義（会社標準ひな型 v0.1）',
  sectionBody: 'WEBサイト構築 要件定義書ひな型 v0.1 の章立てです。区分: 固定＝アフロの標準仕様／個別＝この案件で決める／選択＝採否を決める。',
  count: { confirmed: '確定', open: '未確定', pending: '確認中', na: '対象外' },
  chapterSub: (n: number, total: number) => `確定 ${n} / ${total}`,
  required: '提出前に必須',
  openEmpty: '未確定（ヒアリングで確認します）',
  stdPending: 'アフロの標準仕様の確定後に記載します',
  target: (t: string) => `確認対象: ${t}`,
  addedReason: (r: string) => `追加した理由: ${r}`,
  notesLabel: '特記事項・対象外・追加費用・承認状況',
  addedClient: '追加項目',
  addedEditor: 'AI追加',
  legacy: '旧版の項目',
  view: '表示',
  edit: '編集',
  by: { ai: 'AI の下書き', server: 'ヒアリングの選択肢・案件情報から転記', human: '担当者が記入' } as Record<ReqDocItemAuthor, string>,
  naReasonRequired: '対象外（不採用）にするときは理由を書いてください',
  naReasonHold: (n: number) => `理由が未入力の項目が ${n} 件あります。入力すると保存します`,
  deleteTitle: 'この追加項目を削除しますか？ 作り直さない限り元に戻せません。',
  deleteCancel: 'キャンセル',
  deleteAction: '削除する',
  requiredBlock: (n: number) => `01・02・19・21 章に未確定の項目が ${n} 件あります。埋めると承認を依頼できます。`,
  submitNote: (open: number, pending: number) => `未確定 ${open} 件・確認中 ${pending} 件のまま、お客様に提出します。`,
  ch23: {
    title: '23. 標準仕様の管理・最終承認',
    std: '標準仕様書',
    stdText: '名称・版・適用日・承認者は、標準仕様の確定後に記載します',
    open: '未決事項',
    openText: '22. 未決事項・課題管理 のとおりです',
    approval: '承認',
    approvalText: 'このタブの下「要件定義書の承認」で記録します',
    overlap: '「4. 非機能要件」はアフロ標準のたたき台です。標準仕様が確定したら、固定の章（11・12・14・15・16）に記載し、そちらを正とします。',
  },
  coverHelper: '会社名と役職まで（氏名は入れません）',
  cover: { client: '発注者', vendor: '受注者', author: '作成者', approver: '承認者' } as Record<keyof ProposalV3Doc['cover'], string>,
  catalogMissing: (v: string) => `この要件定義書のひな型（版 ${v}）を表示できません。アフロの担当者へご連絡ください。`,
  pdfBusy: 'PDF を作っています…',
} as const;

export const KUBUN_LABEL: Record<ReqDocKubun, string> = { fixed: '固定', individual: '個別', optional: '選択' };

/** 提出前に必須の章（§3.3。lead-architect 決定） */
export const REQUIRED_CHAPTER_IDS: readonly string[] = ['c01', 'c02', 'c19', 'c21'];

// ---------------- 項目の状態 ----------------

/** 未確定: open、または文が空の proposed（§2.3） */
export function isOpenItem(it: Pick<ReqDocItem, 'status' | 'text'> | undefined): boolean {
  if (!it) return true;
  return it.status === 'open' || (it.status === 'proposed' && !it.text.trim());
}

/** 文の上限（t22-01 だけ未決事項の一覧を入れるため長い） */
export const itemTextMax = (id: string): number => (id === 't22-01' ? REQ_DOC_LIMITS.openItemsText : REQ_DOC_LIMITS.itemText);

/** 編集で入力と状態の操作を出せるか（固定は出さない。検査の正は reqDocEditable.ts:67-68） */
export const isKubunEditable = (k: ReqDocKubun): boolean => k !== 'fixed';

export interface StatusOption { value: Exclude<ReqDocItemStatus, 'std_pending'>; label: string }

/** 状態の切替の選択肢（個別＝確定案／未確定／対象外、選択＝採用案／未確定／不採用。固定は無し） */
export function statusOptions(k: ReqDocKubun): StatusOption[] {
  if (k === 'fixed') return [];
  return k === 'optional'
    ? [{ value: 'proposed', label: '採用案' }, { value: 'open', label: '未確定' }, { value: 'na', label: '不採用' }]
    : [{ value: 'proposed', label: '確定案' }, { value: 'open', label: '未確定' }, { value: 'na', label: '対象外' }];
}

// ---------------- 表示の行（§2.2・§2.3） ----------------

export type ChipTone = 'neutral' | 'primary' | 'warning' | 'info';
export interface Chip { label: string; tone: ChipTone }

/** 表示の 1 行。根拠・書いた元・「AI追加」は持たない（お客様に出さない＝Q-8） */
export interface ReqDocRow {
  kind: 'item' | 'added' | 'notes' | 'legacy';
  id: string;
  label: string;
  chips: Chip[];
  /** 文（空なら mutedText を出す） */
  text: string;
  mutedText?: string;
  captions: string[];
}

export interface ReqDocChapterView {
  id: string;
  heading: string;
  confirmed: number;
  total: number;
  required: boolean;
  hasNotes: boolean;
  rows: ReqDocRow[];
}

export interface ReqDocCounts { confirmed: number; open: number; pending: number; na: number }

export interface ReqDocView {
  version: string;
  /** その版のカタログが無い（§2.3 最終行。章の代わりに文を出し、承認を止める） */
  catalogMissing: boolean;
  chapters: ReqDocChapterView[];
  legacy: ReqDocRow[];
  counts: ReqDocCounts;
}

const kubunChip = (k: ReqDocKubun): Chip => ({ label: KUBUN_LABEL[k], tone: 'neutral' });

/** 状態の区分（集計と行で同じ） */
type Bucket = keyof ReqDocCounts;
function bucketOf(it: Pick<ReqDocItem, 'status' | 'text'>, fixed: boolean): Bucket {
  if (fixed || it.status === 'std_pending') return 'pending';
  if (it.status === 'na') return 'na';
  return isOpenItem(it) ? 'open' : 'confirmed';
}

function itemRow(cat: ReqDocCatalogItem, it: ReqDocItem | undefined): ReqDocRow {
  const base = { kind: 'item' as const, id: cat.id, label: cat.label, captions: [] as string[] };
  const fixed = cat.kubun === 'fixed';
  const cur = it ?? { status: 'open' as const, text: '' };
  const b = bucketOf(cur, fixed);
  if (b === 'pending') {
    return { ...base, chips: [kubunChip(cat.kubun), { label: '確認中', tone: 'info' }], text: '', mutedText: REQ_DOC_COPY.stdPending, captions: [REQ_DOC_COPY.target(cat.target)] };
  }
  if (b === 'na') {
    return { ...base, chips: [kubunChip(cat.kubun), { label: cat.kubun === 'optional' ? '不採用' : '対象外', tone: 'neutral' }], text: cur.text };
  }
  if (b === 'open') {
    return { ...base, chips: [kubunChip(cat.kubun), { label: '未確定', tone: 'warning' }], text: cur.text, mutedText: REQ_DOC_COPY.openEmpty };
  }
  const chips: Chip[] = [kubunChip(cat.kubun)];
  if (cat.kubun === 'optional') chips.push({ label: '採用案', tone: 'primary' });
  return { ...base, chips, text: cur.text };
}

function addedRow(a: ReqDocAddedItem): ReqDocRow {
  const empty = a.status === 'proposed' && !a.text.trim();
  return {
    kind: 'added', id: a.id, label: a.label,
    chips: [
      { label: REQ_DOC_COPY.addedClient, tone: 'neutral' },
      a.status === 'na' ? { label: '不採用', tone: 'neutral' } : empty ? { label: '未確定', tone: 'warning' } : { label: '採用案', tone: 'primary' },
    ],
    text: a.text, ...(empty ? { mutedText: REQ_DOC_COPY.openEmpty } : {}),
    captions: a.reason.trim() ? [REQ_DOC_COPY.addedReason(a.reason)] : [],
  };
}

/** 表示の章と行。client かどうかで内容は変えない（お客様に出さない欄は最初から入れない） */
export function buildReqDocView(doc: ProposalV3Doc, templateVersion: string): ReqDocView {
  const catalog = reqDocCatalogOf(templateVersion);
  const counts: ReqDocCounts = { confirmed: 0, open: 0, pending: 0, na: 0 };
  const items = doc?.items ?? {};
  const added = Array.isArray(doc?.added) ? doc.added : [];
  if (!catalog) return { version: templateVersion, catalogMissing: true, chapters: [], legacy: [], counts };
  const known = new Set(catalog.items.map((i) => i.id));
  const chapters = catalog.chapters.map((ch): ReqDocChapterView => {
    const cats = catalog.items.filter((i) => i.chapterId === ch.id);
    const rows: ReqDocRow[] = [];
    let confirmed = 0;
    for (const cat of cats) {
      const it = items[cat.id];
      const b = bucketOf(it ?? { status: 'open', text: '' }, cat.kubun === 'fixed');
      counts[b] += 1;
      if (b === 'confirmed') confirmed += 1;
      rows.push(itemRow(cat, it));
    }
    const adds = added.filter((a) => a.chapterId === ch.id);
    for (const a of adds) {
      const b: Bucket = a.status === 'na' ? 'na' : a.text.trim() ? 'confirmed' : 'open';
      counts[b] += 1;
      if (b === 'confirmed') confirmed += 1;
      rows.push(addedRow(a));
    }
    const note = ch.hasNotes ? (doc?.notes?.[ch.id] ?? '') : '';
    if (note.trim()) rows.push({ kind: 'notes', id: `${ch.id}-notes`, label: REQ_DOC_COPY.notesLabel, chips: [], text: note, captions: [] });
    return {
      id: ch.id, heading: `${ch.no}. ${ch.title}`, confirmed, total: cats.length + adds.length,
      required: REQUIRED_CHAPTER_IDS.includes(ch.id), hasNotes: ch.hasNotes, rows,
    };
  });
  // カタログに無い id（旧版の項目）は落とさない（§2.3）
  const legacy: ReqDocRow[] = Object.keys(items).filter((id) => !known.has(id)).sort().map((id) => {
    const it = items[id];
    return { kind: 'legacy', id, label: id, chips: [{ label: REQ_DOC_COPY.legacy, tone: 'neutral' }], text: it?.text ?? '', ...(it?.text ? {} : { mutedText: REQ_DOC_COPY.openEmpty }), captions: [] };
  });
  return { version: templateVersion, catalogMissing: false, chapters, legacy, counts };
}

/** 件数のチップ（0 件は出さない。§2.1） */
export function countChips(c: ReqDocCounts): Chip[] {
  const out: Chip[] = [];
  if (c.confirmed) out.push({ label: `${REQ_DOC_COPY.count.confirmed} ${c.confirmed}`, tone: 'primary' });
  if (c.open) out.push({ label: `${REQ_DOC_COPY.count.open} ${c.open}`, tone: 'warning' });
  if (c.pending) out.push({ label: `${REQ_DOC_COPY.count.pending} ${c.pending}`, tone: 'info' });
  if (c.na) out.push({ label: `${REQ_DOC_COPY.count.na} ${c.na}`, tone: 'neutral' });
  return out;
}

// ---------------- 提出の判定（§3.3） ----------------

/** 提出前に必須の章（01・02・19・21）に残る未確定の件数（AI追加の文の無い採用案も数える） */
export function requiredOpenCount(doc: ProposalV3Doc, templateVersion: string): number {
  const catalog = reqDocCatalogOf(templateVersion);
  if (!catalog) return 0;
  const items = doc?.items ?? {};
  let n = catalog.items.filter((c) => REQUIRED_CHAPTER_IDS.includes(c.chapterId) && c.kubun !== 'fixed' && isOpenItem(items[c.id])).length;
  n += (doc?.added ?? []).filter((a) => REQUIRED_CHAPTER_IDS.includes(a.chapterId) && a.status === 'proposed' && !a.text.trim()).length;
  return n;
}

/** 対象外・不採用で理由（文）が空の件数（この間は自動保存を送らない。送ると reqDocEditable.ts:72・:90 で拒否） */
export function missingNaReasons(doc: ProposalV3Doc): number {
  const items = Object.values(doc?.items ?? {}).filter((it) => it.status === 'na' && !it.text.trim()).length;
  return items + (doc?.added ?? []).filter((a) => a.status === 'na' && !a.text.trim()).length;
}

/** 提出を止める理由（押せるなら null）。approvalBlock（aiDraftState.ts）の後に見る */
export type ReqDocSubmitBlock = { kind: 'catalog-missing'; version: string } | { kind: 'required-open'; count: number } | { kind: 'na-reason'; count: number };

export function reqDocSubmitBlock(e: AiEditableV3, templateVersion: string): ReqDocSubmitBlock | null {
  if (!reqDocCatalogOf(templateVersion)) return { kind: 'catalog-missing', version: templateVersion };
  const na = missingNaReasons(e.doc);
  if (na) return { kind: 'na-reason', count: na };
  const req = requiredOpenCount(e.doc, templateVersion);
  if (req) return { kind: 'required-open', count: req };
  // TODO(U3 後): 同じ判定をサーバーでも行う（lead-architect 決定 2026-11-26。画面の制御は境界ではない＝CLAUDE.md 1.8）。
  //   置き場所（Rules の提出の検査か Functions か）は U3 の結果を見て決める。クライアントは src/live/repositories.tsx の completeAnalysis でも同じ関数で止めている
  return null;
}

export function submitBlockText(b: ReqDocSubmitBlock): string {
  if (b.kind === 'catalog-missing') return REQ_DOC_COPY.catalogMissing(b.version);
  if (b.kind === 'na-reason') return REQ_DOC_COPY.naReasonHold(b.count);
  return REQ_DOC_COPY.requiredBlock(b.count);
}

// ---------------- 要確認の数字（開発者だけ。flags.unsupportedNumbers） ----------------

/**
 * flags.unsupportedNumbers は 2 つの形が混ざる: 要約・改善ポイントの数字は「18」、ひな型の項目・AI追加は「t01-03:18」「a01:3」（reqDocPostprocess.ts）。
 * id を渡すとその項目の数字、渡さないと「:」の無いもの（要約・改善ポイント）を返す。お客様の表示には渡さない
 */
export function flagsFor(flags: readonly string[] | undefined, id?: string): string[] {
  if (!flags?.length) return [];
  const out: string[] = [];
  for (const f of flags) {
    const at = f.indexOf(':');
    if (id === undefined) { if (at < 0) out.push(f); }
    else if (at > 0 && f.slice(0, at) === id) out.push(f.slice(at + 1));
  }
  return [...new Set(out)];
}

/** 今の文にまだ残っている要確認の数字（表示用に「項目名: 数字」。要約・改善ポイントは数字だけ） */
export function remainingFlaggedV3(e: AiEditableV3, flags: readonly string[] | undefined, templateVersion: string): string[] {
  if (!flags?.length) return [];
  const out: string[] = [];
  const hit = (text: string, list: string[]) => { const have = new Set(numbersIn(text)); return list.filter((n) => have.has(n)); };
  const top = flagsFor(flags);
  out.push(...hit([e.summary, ...e.points.flatMap((p) => [p.title, p.detail, p.impact])].join('\n'), top));
  const catalog = reqDocCatalogOf(templateVersion);
  for (const cat of catalog?.items ?? []) {
    const it = e.doc.items[cat.id];
    if (it) for (const n of hit(it.text, flagsFor(flags, cat.id))) out.push(`${cat.label}: ${n}`);
  }
  for (const a of e.doc.added) for (const n of hit([a.label, a.text, a.reason].join('\n'), flagsFor(flags, a.id))) out.push(`${a.label}: ${n}`);
  return [...new Set(out)];
}

// ---------------- 編集の更新（純粋関数。サーバーの検査と同じ形を保つ） ----------------

export function setItem(e: AiEditableV3, id: string, patch: Partial<Pick<ReqDocItem, 'status' | 'text'>>, catalog: ReqDocCatalog | undefined): AiEditableV3 {
  const cat = catalog?.items.find((i) => i.id === id);
  const cur = e.doc.items[id];
  if (!cat || !cur || !isKubunEditable(cat.kubun)) return e; // 固定・カタログに無い項目は変えない
  if (patch.status === 'std_pending') return e;
  const text = patch.text !== undefined ? patch.text.slice(0, itemTextMax(id)) : cur.text;
  return { ...e, doc: { ...e.doc, items: { ...e.doc.items, [id]: { ...cur, ...patch, text } } } };
}

export function setAdded(e: AiEditableV3, id: string, patch: Partial<Pick<ReqDocAddedItem, 'label' | 'status' | 'text' | 'reason'>>): AiEditableV3 {
  const clip = (s: string | undefined, n: number) => (s === undefined ? undefined : s.slice(0, n));
  const p = {
    ...patch,
    ...(patch.label !== undefined ? { label: clip(patch.label, REQ_DOC_LIMITS.addedLabel) } : {}),
    ...(patch.text !== undefined ? { text: clip(patch.text, REQ_DOC_LIMITS.itemText) } : {}),
    ...(patch.reason !== undefined ? { reason: clip(patch.reason, REQ_DOC_LIMITS.addedReason) } : {}),
  };
  return { ...e, doc: { ...e.doc, added: e.doc.added.map((a) => (a.id === id ? { ...a, ...p } as ReqDocAddedItem : a)) } };
}

/** AI追加の削除（足すことはできない＝reqDocEditable.ts:76-95） */
export function removeAdded(e: AiEditableV3, id: string): AiEditableV3 {
  return { ...e, doc: { ...e.doc, added: e.doc.added.filter((a) => a.id !== id) } };
}

export function setNote(e: AiEditableV3, chapterId: string, text: string): AiEditableV3 {
  if (!Object.prototype.hasOwnProperty.call(e.doc.notes, chapterId)) return e; // 特記欄の無い章（16 章）には足さない
  return { ...e, doc: { ...e.doc, notes: { ...e.doc.notes, [chapterId]: text.slice(0, REQ_DOC_LIMITS.notes) } } };
}

export function setCover(e: AiEditableV3, key: keyof ProposalV3Doc['cover'], text: string): AiEditableV3 {
  return { ...e, doc: { ...e.doc, cover: { ...e.doc.cover, [key]: text.slice(0, REQ_DOC_LIMITS.coverField) } } };
}

/** 「変更をコピー」用のプレーンテキスト */
export function editableTextV3(e: AiEditableV3, templateVersion: string): string {
  const catalog = reqDocCatalogOf(templateVersion);
  const label = (id: string) => catalog?.items.find((i) => i.id === id)?.label ?? id;
  return [
    e.summary, '',
    ...e.points.flatMap((p) => [`■ ${p.title}`, p.detail, p.impact, '']),
    ...Object.entries(e.doc.items).filter(([, it]) => it.text).map(([id, it]) => `■ ${label(id)}\n${it.text}`),
    ...e.doc.added.map((a) => `■ ${a.label}（${REQ_DOC_COPY.addedClient}）\n${a.text}\n${a.reason}`),
    ...Object.values(e.doc.notes).filter(Boolean),
  ].join('\n');
}

// ---------------- 要件定義書 PDF（§4） ----------------

const nl = (s: string) => esc(s).replace(/\n/g, '<br>');

/** PDF の表紙に足す行（<dl> の中身） */
export function proposalV3CoverHtml(p: ProposalV3): string {
  const c = p.doc?.cover ?? { client: '', vendor: '', author: '', approver: '' };
  const v = (s: string) => (s && s.trim() ? esc(s) : '—');
  return `<dt>ひな型</dt><dd>${esc(p.template?.id ?? 'TPL-WEB-REQ')} 版 ${esc(p.template?.version ?? '')}</dd>
<dt>${REQ_DOC_COPY.cover.client}</dt><dd>${v(c.client)}</dd>
<dt>${REQ_DOC_COPY.cover.vendor}</dt><dd>${v(c.vendor)}</dd>
<dt>${REQ_DOC_COPY.cover.author}</dt><dd>${v(c.author)}</dd>
<dt>${REQ_DOC_COPY.cover.approver}</dt><dd>${v(c.approver)}</dd>
`;
}

const STATUS_PREFIX = (it: Pick<ReqDocItem, 'status' | 'text'>, kubun: ReqDocKubun): string => {
  if (it.status === 'na') return kubun === 'optional' ? '［不採用］' : '［対象外］';
  if (isOpenItem(it)) return '［未確定］';
  return kubun === 'optional' ? '［採用案］' : '';
};

/** 23 章の承認の行の状態 */
export interface ReqDocApprovalState { status: 'draft' | 'analyzed' | 'approved'; approvedAtText?: string }

export function chapter23Rows(a: ReqDocApprovalState): { k: string; v: string; muted?: boolean }[] {
  const state = a.status === 'approved' ? `承認済み ${a.approvedAtText ?? ''}`.trim() : a.status === 'analyzed' ? 'お客様の承認待ち' : '';
  return [
    { k: REQ_DOC_COPY.ch23.std, v: `確認中・${REQ_DOC_COPY.ch23.stdText}`, muted: true },
    { k: REQ_DOC_COPY.ch23.open, v: REQ_DOC_COPY.ch23.openText },
    { k: REQ_DOC_COPY.ch23.approval, v: state ? `${REQ_DOC_COPY.ch23.approvalText}（${state}）` : REQ_DOC_COPY.ch23.approvalText },
  ];
}

/** 「1. 改善提案」の後半: AI 要件定義（01〜22 章・旧版の項目・23 章）。要約・改善ポイント・基本チェックは proposalPointsHtml */
export function reqDocChaptersHtml(p: ProposalV3, approval: ReqDocApprovalState): string {
  const version = p.template?.version ?? '';
  const catalog = reqDocCatalogOf(version);
  const head = `<h3>${esc(REQ_DOC_COPY.sectionTitle)}</h3><p class="muted">${esc(REQ_DOC_COPY.sectionBody)}</p>`;
  if (!catalog) return `${head}<p class="muted">${esc(REQ_DOC_COPY.catalogMissing(version))}</p>`;
  const items = p.doc?.items ?? {};
  const added = p.doc?.added ?? [];
  const known = new Set(catalog.items.map((i) => i.id));
  const tr = (k: string, kubun: string, v: string) => `<tr><th>${k}</th><td>${kubun}</td><td>${v}</td></tr>`;
  const chapters = catalog.chapters.map((ch) => {
    const rows = catalog.items.filter((i) => i.chapterId === ch.id).map((cat) => {
      const it = items[cat.id] ?? { status: 'open' as const, text: '' };
      if (cat.kubun === 'fixed' || it.status === 'std_pending') return tr(esc(cat.label), esc(KUBUN_LABEL[cat.kubun]), '標準仕様：［確認中・確定後記載］');
      return tr(esc(cat.label), esc(KUBUN_LABEL[cat.kubun]), `${STATUS_PREFIX(it, cat.kubun)}${nl(it.text)}`);
    });
    for (const a of added.filter((x) => x.chapterId === ch.id)) {
      const pre = a.status === 'na' ? '［不採用］' : a.text.trim() ? '［採用案］' : '［未確定］';
      rows.push(tr(`${esc(a.label)}（${REQ_DOC_COPY.addedClient}）`, '', `${pre}${nl(a.text)}${a.reason.trim() ? `<br><span class="muted">${esc(REQ_DOC_COPY.addedReason(a.reason))}</span>` : ''}`));
    }
    if (ch.hasNotes) {
      const note = p.doc?.notes?.[ch.id] ?? '';
      rows.push(tr(esc(REQ_DOC_COPY.notesLabel), '', note.trim() ? nl(note) : '<span class="muted">記載なし</span>'));
    }
    return `<h3>${esc(ch.no)}. ${esc(ch.title)}</h3><table class="reqdoc"><tr><th>項目</th><th>区分</th><th>内容</th></tr>${rows.join('')}</table>`;
  }).join('');
  const legacyIds = Object.keys(items).filter((id) => !known.has(id)).sort();
  const legacy = legacyIds.length
    ? `<h3>${esc(REQ_DOC_COPY.legacy)}</h3><table class="reqdoc">${legacyIds.map((id) => tr(esc(id), '', nl(items[id]?.text ?? ''))).join('')}</table>`
    : '';
  const ch23 = `<h3>${esc(REQ_DOC_COPY.ch23.title)}</h3><table>${chapter23Rows(approval).map((r) => `<tr><th>${esc(r.k)}</th><td>${esc(r.v)}</td></tr>`).join('')}</table><p class="muted">${esc(REQ_DOC_COPY.ch23.overlap)}</p>`;
  return `${head}${chapters}${legacy}${ch23}`;
}

export type { AiEditableV3, ProposalV3, ProposalV3Doc };
