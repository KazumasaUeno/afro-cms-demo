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
import {
  REQ_DOC_KUBUN_LABEL, REQ_DOC_REQUIRED_CHAPTERS, REQ_DOC_TEMPLATE, REQ_DOC_TEXT, reqDocCatalogOf, reqDocChapterHeading, reqDocChapterIntro, reqDocItemHeading, reqDocItemSentence,
  reqDocNotesLine, reqDocRequiredOk, reqDocTextOf, type ReqDocCatalog, type ReqDocCatalogItem, type ReqDocCoverLineKey, type ReqDocTemplateText,
} from '@/shared/ai/reqDocCatalog';
import {
  isEditableV3, isProposalV2, isProposalV3, REQ_DOC_LIMITS, type AiEditableV3, type AnyAiEditable, type ProposalV3, type ProposalV3Doc, type ReqDocAddedItem, type ReqDocItem,
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

/** 「表示／編集」の既定（開いたときは表示。開発者が「編集」を押して切り替える。2026-11-26 ユーザー決定。§3.2） */
export const REQ_DOC_DEFAULT_MODE: 'view' | 'edit' = 'view';

// ---------------- 文言（§6） ----------------

export const REQ_DOC_COPY = {
  sectionTitle: 'AI 要件定義（会社標準ひな型 v0.1）',
  count: { confirmed: '確定', open: '未確定', pending: '確認中', na: '対象外' },
  chapterSub: (n: number, total: number) => `確定 ${n} / ${total}`,
  required: '提出前に必須',
  openEmpty: '未確定（ヒアリングで確認します）',
  target: (t: string) => `確認対象: ${t}`,
  addedReason: (r: string) => `追加した理由: ${r}`,
  /** 編集の欄の名前（文の正は shared/ai/reqDocCatalog.ts の REQ_DOC_TEXT） */
  notesLabel: REQ_DOC_TEXT[REQ_DOC_TEMPLATE.version].notesLabel,
  addedClient: '追加項目',
  addedEditor: 'AI追加',
  legacy: '旧版の項目',
  view: '表示',
  edit: '編集',
  by: { ai: 'AI の下書き', server: 'ヒアリングの選択肢・案件情報から転記', human: '担当者が記入' } as Record<ReqDocItemAuthor, string>,
  naReasonRequired: '対象外（不採用）にするときは理由を書いてください',
  naReasonHold: (n: number) => `理由が未入力の項目が ${n} 件あります。入力すると保存します`,
  /** AI追加の項目名が空（サーバーの検査 reqDocEditable.ts は 1 文字以上。空のまま送ると保存がすべて拒否される） */
  addedLabelRequired: '項目名を入力してください',
  addedLabelHold: (n: number) => `項目名が未入力の追加項目が ${n} 件あります。入力すると保存します`,
  deleteTitle: 'この追加項目を削除しますか？ 作り直さない限り元に戻せません。',
  deleteCancel: 'キャンセル',
  deleteAction: '削除する',
  /** 画面の判定は通るのに、サーバーの submitReady が無い・false（保存し直しても拒否された） */
  requiredNotSaved: '必須の章（01・02・19・21）の内容の保存が確認できませんでした。少し待ってから、もう一度「承認を依頼する」を押してください。',
  /** 保存に失敗したまま確認済み（承認を依頼する前）。状態の行の注記の後ろに足す */
  saveBeforeRequest: '保存するまで承認は依頼できません。',
  requiredBlock: (n: number) => `01・02・19・21 章に未確定の項目が ${n} 件あります。埋めると承認を依頼できます。`,
  submitNote: (open: number, pending: number) => `未確定 ${open} 件・確認中 ${pending} 件のまま、お客様に提出します。`,
  ch23: {
    approval: (state: string) => `承認の状態: ${state}（このタブの下「要件定義書の承認」で記録します）`,
    overlap: '「4. 非機能要件」はアフロ標準のたたき台です。標準仕様が確定したら、固定の章（11・12・14・15・16）に記載し、そちらを正とします。',
  },
  coverHelper: '会社名と役職まで（氏名は入れません）',
  cover: { client: '発注者', vendor: '受注者', author: '作成者', approver: '承認者' } as Record<keyof ProposalV3Doc['cover'], string>,
  catalogMissing: (v: string) => `この要件定義書のひな型（版 ${v}）を表示できません。アフロの担当者へご連絡ください。`,
  pdfBusy: 'PDF を作っています…',
} as const;

export const KUBUN_LABEL: Record<ReqDocKubun, string> = REQ_DOC_KUBUN_LABEL;

/** 提出前に必須の章（§3.3。正は shared/ai/reqDocCatalog.ts の REQ_DOC_REQUIRED_CHAPTERS＝サーバーの submitReady と Rules も同じ） */
export const requiredChaptersOf = (templateVersion: string): readonly string[] =>
  Object.prototype.hasOwnProperty.call(REQ_DOC_REQUIRED_CHAPTERS, templateVersion) ? REQ_DOC_REQUIRED_CHAPTERS[templateVersion] : [];

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

// ---------------- 表示の行（§2.2・§2.3。文はひな型の文章のまま＝REQDOC_U4_UI.md 最終節） ----------------

export type ChipTone = 'neutral' | 'primary' | 'warning' | 'info';
export interface Chip { label: string; tone: ChipTone }

/** 表示の 1 行。根拠・書いた元・「AI追加」は持たない（お客様に出さない＝Q-8） */
export interface ReqDocRow {
  kind: 'item' | 'added' | 'legacy';
  id: string;
  /** ひな型の項目はひな型の見出し「案件名  ｜ 個別」 */
  label: string;
  /** 状態のチップ（文の横に出すだけ。文の代わりにしない） */
  chips: Chip[];
  /** ひな型の項目はひな型の文（確定内容が未記入なら「［記入］」）。空なら mutedText を出す */
  text: string;
  mutedText?: string;
  captions: string[];
}

export interface ReqDocChapterView {
  id: string;
  /** ひな型の章の見出し「01  プロジェクト概要・体制」 */
  heading: string;
  /** 章の冒頭の文 */
  intro: string;
  confirmed: number;
  total: number;
  required: boolean;
  hasNotes: boolean;
  rows: ReqDocRow[];
  /** 章末の特記の行（REQ_DOC_TEXT の notesLabel）（特記欄の無い 16 章は null） */
  notesLine: string | null;
}

export interface ReqDocCounts { confirmed: number; open: number; pending: number; na: number }

/** 表紙（ひな型の 1 行目・版の行・案件名〜改訂履歴の行） */
export interface ReqDocCoverView { title: string; versionLine: string; lines: string[] }

/** 項目の無い最終章（23） */
export interface ReqDocClosingView {
  heading: string;
  body: string;
  lines: string[];
  approvalLine: string;
  /** 承認の状態（ひな型の文ではない。承認待ち・承認済みのときだけ） */
  status: string | null;
}

export interface ReqDocView {
  version: string;
  /** その版のカタログか文章が無い（§2.3 最終行。章の代わりに文を出し、承認を止める） */
  catalogMissing: boolean;
  cover: ReqDocCoverView | null;
  purpose: ReqDocTemplateText['purpose'] | null;
  chapters: ReqDocChapterView[];
  legacy: ReqDocRow[];
  closing: ReqDocClosingView | null;
  counts: ReqDocCounts;
}

/** 23 章・表紙の承認の状態 */
export interface ReqDocApprovalState {
  status: 'draft' | 'analyzed' | 'approved';
  approvedAtText?: string;
  /** 承認日時（ISO）。表紙の承認日に YYYY/MM/DD で入れる */
  approvedAt?: string;
}

/** 状態の区分（集計と行で同じ） */
type Bucket = keyof ReqDocCounts;
function bucketOf(it: Pick<ReqDocItem, 'status' | 'text'>, fixed: boolean): Bucket {
  if (fixed || it.status === 'std_pending') return 'pending';
  if (it.status === 'na') return 'na';
  return isOpenItem(it) ? 'open' : 'confirmed';
}

function itemRow(cat: ReqDocCatalogItem, it: ReqDocItem | undefined, text: ReqDocTemplateText): ReqDocRow {
  const cur = it ?? { status: 'open' as const, text: '' };
  const b = bucketOf(cur, cat.kubun === 'fixed');
  const chips: Chip[] =
    b === 'pending' ? [{ label: '確認中', tone: 'info' }]
      : b === 'na' ? [{ label: cat.kubun === 'optional' ? '不採用' : '対象外', tone: 'neutral' }]
        : b === 'open' ? [{ label: '未確定', tone: 'warning' }]
          : cat.kubun === 'optional' ? [{ label: '採用案', tone: 'primary' }] : [];
  // 固定（確認中）は文を持たない（std_pending）。ひな型の「標準仕様：［確認中・確定後記載］」のまま出す
  const value = b === 'pending' ? '' : cur.text;
  return { kind: 'item', id: cat.id, label: reqDocItemHeading(cat), chips, text: reqDocItemSentence(cat, value, text), captions: [] };
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

const pad2 = (n: number) => String(n).padStart(2, '0');
/** ISO → YYYY/MM/DD（端末の日付。読めなければ空） */
function ymdSlash(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`;
}

function coverValue(key: ReqDocCoverLineKey, doc: ProposalV3Doc, catalog: ReqDocCatalog, text: ReqDocTemplateText, approval: ReqDocApprovalState | undefined): string {
  const c = doc?.cover;
  switch (key) {
    case 'project': {
      // 案件名は 01 章の案件名の項目（案件の欄から転記）を正とする
      const cat = catalog.items.find((i) => i.feeds.includes('project:siteName'));
      const it = cat && doc?.items && Object.prototype.hasOwnProperty.call(doc.items, cat.id) ? doc.items[cat.id] : undefined;
      return it && it.status !== 'na' ? it.text : '';
    }
    case 'client': return c?.client ?? '';
    case 'vendor': return c?.vendor ?? '';
    case 'authorApprover': {
      const a = (c?.author ?? '').trim();
      const b = (c?.approver ?? '').trim();
      return a || b ? `${a || text.blank}／${b || text.blank}` : '';
    }
    case 'approvedAt': return approval?.status === 'approved' ? ymdSlash(approval.approvedAt) : '';
    case 'history': return '';
  }
}

function approvalStatusText(a: ReqDocApprovalState | undefined): string | null {
  if (!a) return null;
  const state = a.status === 'approved' ? `承認済み ${a.approvedAtText ?? ''}`.trim() : a.status === 'analyzed' ? 'お客様の承認待ち' : '';
  return state ? REQ_DOC_COPY.ch23.approval(state) : null;
}

/** 表示の章と行。client かどうかで内容は変えない（お客様に出さない欄は最初から入れない） */
export function buildReqDocView(doc: ProposalV3Doc, templateVersion: string, approval?: ReqDocApprovalState): ReqDocView {
  const catalog = reqDocCatalogOf(templateVersion);
  const text = reqDocTextOf(templateVersion);
  const counts: ReqDocCounts = { confirmed: 0, open: 0, pending: 0, na: 0 };
  const items = doc?.items ?? {};
  const added = Array.isArray(doc?.added) ? doc.added : [];
  if (!catalog || !text) return { version: templateVersion, catalogMissing: true, cover: null, purpose: null, chapters: [], legacy: [], closing: null, counts };
  const requiredIds = requiredChaptersOf(templateVersion);
  const known = new Set(catalog.items.map((i) => i.id));
  const chapters = catalog.chapters.map((ch): ReqDocChapterView => {
    const cats = catalog.items.filter((i) => i.chapterId === ch.id);
    const rows: ReqDocRow[] = [];
    let confirmed = 0;
    for (const cat of cats) {
      const it = Object.prototype.hasOwnProperty.call(items, cat.id) ? items[cat.id] : undefined;
      const b = bucketOf(it ?? { status: 'open', text: '' }, cat.kubun === 'fixed');
      counts[b] += 1;
      if (b === 'confirmed') confirmed += 1;
      rows.push(itemRow(cat, it, text));
    }
    const adds = added.filter((a) => a.chapterId === ch.id);
    for (const a of adds) {
      const b: Bucket = a.status === 'na' ? 'na' : a.text.trim() ? 'confirmed' : 'open';
      counts[b] += 1;
      if (b === 'confirmed') confirmed += 1;
      rows.push(addedRow(a));
    }
    return {
      id: ch.id, heading: reqDocChapterHeading(ch.no, ch.title), intro: reqDocChapterIntro(ch.title), confirmed, total: cats.length + adds.length,
      required: requiredIds.includes(ch.id), hasNotes: ch.hasNotes, rows,
      notesLine: ch.hasNotes ? reqDocNotesLine(doc?.notes?.[ch.id] ?? '', text) : null,
    };
  });
  // カタログに無い id（旧版の項目）は落とさない（§2.3）
  const legacy: ReqDocRow[] = Object.keys(items).filter((id) => !known.has(id)).sort().map((id) => {
    const it = items[id];
    return { kind: 'legacy', id, label: id, chips: [{ label: REQ_DOC_COPY.legacy, tone: 'neutral' }], text: it?.text ?? '', ...(it?.text ? {} : { mutedText: REQ_DOC_COPY.openEmpty }), captions: [] };
  });
  const cover: ReqDocCoverView = {
    title: text.title, versionLine: text.versionLine,
    lines: text.cover.map((l) => `${l.label}：${coverValue(l.key, doc, catalog, text, approval).trim() || l.blank}`),
  };
  const cl = text.closing;
  const closing: ReqDocClosingView = {
    heading: reqDocChapterHeading(cl.no, cl.title), body: cl.body, lines: cl.lines.map((l) => `${l.label}：${l.blank}`), approvalLine: cl.approvalLine,
    status: approvalStatusText(approval),
  };
  return { version: templateVersion, catalogMissing: false, cover, purpose: text.purpose, chapters, legacy, closing, counts };
}

/**
 * ひな型の順に並べた文の行（表紙 → 本書の目的 → 01〜22 章 → 23 章）。画面と PDF はこの順と文で描く。
 * tests/unit/reqDocTemplateText.test.mjs が、空の doc の行とひな型の本文を照合する
 */
export function reqDocTemplateLines(view: ReqDocView): string[] {
  if (view.catalogMissing || !view.cover || !view.purpose || !view.closing) return [];
  return [
    view.cover.title, view.cover.versionLine, ...view.cover.lines,
    view.purpose.title, view.purpose.body, view.purpose.legend,
    ...view.chapters.flatMap((ch) => [ch.heading, ch.intro, ...ch.rows.flatMap((r) => [r.label, r.text]), ...(ch.notesLine ? [ch.notesLine] : [])]),
    view.closing.heading, view.closing.body, ...view.closing.lines, view.closing.approvalLine,
  ];
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

/**
 * 提出前に必須の章に残る、埋まっていない項目の件数（表示の数。可否の正は reqDocRequiredOk＝サーバーの submitReady と同じ関数）。
 * 数える規則も reqDocRequiredOk と同じ: 「確定案」か「対象外」で文が空白だけでない項目以外。AI追加は数えない（サーバーも見ない）
 */
export function requiredOpenCount(doc: ProposalV3Doc, templateVersion: string): number {
  const catalog = reqDocCatalogOf(templateVersion);
  if (!catalog) return 0;
  const chapters = requiredChaptersOf(templateVersion);
  const items = doc?.items ?? {};
  return catalog.items.filter((c) => {
    if (!chapters.includes(c.chapterId)) return false;
    const it = items[c.id];
    return !(it && (it.status === 'proposed' || it.status === 'na') && !isBlank(it.text));
  }).length;
}

const NL = '\n';

/** 空白だけ・文字列でない（保存値の形が崩れていても落ちない） */
const isBlank = (s: unknown): boolean => typeof s !== 'string' || !s.trim();

/** 対象外・不採用で理由（文）が空の件数（この間は自動保存を送らない。送ると reqDocEditable.ts:72・:90 で拒否） */
export function missingNaReasons(doc: ProposalV3Doc): number {
  const items = Object.values(doc?.items ?? {}).filter((it) => it?.status === 'na' && isBlank(it.text)).length;
  return items + (doc?.added ?? []).filter((a) => a?.status === 'na' && isBlank(a.text)).length;
}

/** AI追加で項目名が空の件数（サーバーは label 1 文字以上＝reqDocEditable.ts の str(a.label, 1, …)。空白だけも欠けとして数える） */
export function missingAddedLabels(doc: ProposalV3Doc): number {
  return (doc?.added ?? []).filter((a) => isBlank(a?.label)).length;
}

/** 自動保存を止める理由の件数（v3 だけ。v2 は常に 0） */
export interface SaveHoldReasons { naReason: number; addedLabel: number }

export function saveHoldReasons(e: AnyAiEditable | null | undefined): SaveHoldReasons {
  if (!e || !isEditableV3(e)) return { naReason: 0, addedLabel: 0 };
  return { naReason: missingNaReasons(e.doc), addedLabel: missingAddedLabels(e.doc) };
}

/** 自動保存を止める件数（v3 で対象外・不採用の理由が空＋AI追加の項目名が空）。useAiDraft の flush が見る（§3.2） */
export function saveHoldCount(e: AnyAiEditable | null | undefined): number {
  const r = saveHoldReasons(e);
  return r.naReason + r.addedLabel;
}

/** 保存を止めている理由の文（保存の状態の欄。理由の欠けを先に出す） */
export function saveHoldText(r: SaveHoldReasons): string {
  return [r.naReason ? REQ_DOC_COPY.naReasonHold(r.naReason) : '', r.addedLabel ? REQ_DOC_COPY.addedLabelHold(r.addedLabel) : ''].filter(Boolean).join('／');
}

/**
 * 承認の依頼の前に今の編集を送り直すか（v3）。サーバーの submitReady が無い・false・別の版のひな型で判定したものなら送り直す
 * （保存と同じ書き込みでサーバーが今の版で判定し直す。Rules が submitReady を提出の条件にする＝U3）
 */
export function needsResave(submitReady: { requiredOk: boolean; templateVersion: string } | undefined, templateVersion: string): boolean {
  return submitReady?.requiredOk !== true || submitReady.templateVersion !== templateVersion;
}

/** 提出を止める理由（押せるなら null）。approvalBlock（aiDraftState.ts）の後に見る */
export type ReqDocSubmitBlock =
  | { kind: 'catalog-missing'; version: string } | { kind: 'required-open'; count: number } | { kind: 'na-reason'; count: number } | { kind: 'added-label'; count: number };

export function reqDocSubmitBlock(e: AiEditableV3, templateVersion: string): ReqDocSubmitBlock | null {
  if (!reqDocCatalogOf(templateVersion)) return { kind: 'catalog-missing', version: templateVersion };
  const na = missingNaReasons(e.doc);
  if (na) return { kind: 'na-reason', count: na };
  const label = missingAddedLabels(e.doc);
  if (label) return { kind: 'added-label', count: label };
  // 可否は共有の reqDocRequiredOk（サーバーは保存のたびに同じ関数で aiDrafts.submitReady を書き、Rules が提出の条件にする＝U3。画面の制御は境界ではない）
  if (!reqDocRequiredOk(e.doc, templateVersion)) return { kind: 'required-open', count: Math.max(1, requiredOpenCount(e.doc, templateVersion)) };
  return null;
}

export function submitBlockText(b: ReqDocSubmitBlock): string {
  if (b.kind === 'catalog-missing') return REQ_DOC_COPY.catalogMissing(b.version);
  if (b.kind === 'na-reason') return REQ_DOC_COPY.naReasonHold(b.count);
  if (b.kind === 'added-label') return REQ_DOC_COPY.addedLabelHold(b.count);
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

/**
 * 「変更をコピー」用のプレーンテキスト（保存できなかった編集を手元に残す。useAiDraft の pendingText の v3 はこれだけ）。
 * 編集できる欄を漏らさない: 要約・改善ポイント・表紙の 4 欄・ひな型の項目（項目名・状態・文）・AI追加（項目名・採否・内容・追加した理由）・章末の特記事項
 */
export function editableTextV3(e: AiEditableV3, templateVersion: string): string {
  const catalog = reqDocCatalogOf(templateVersion);
  const label = (id: string) => catalog?.items.find((i) => i.id === id)?.label ?? id;
  const chapter = (id: string) => catalog?.chapters.find((c) => c.id === id)?.title ?? id;
  // 状態の名前は編集の切替と同じ（statusOptions。個別＝確定案／対象外、選択＝採用案／不採用）
  const status = (id: string, st: string) => {
    const cat = catalog?.items.find((i) => i.id === id);
    return (cat ? statusOptions(cat.kubun).find((o) => o.value === st)?.label : undefined) ?? (st === 'std_pending' ? REQ_DOC_COPY.count.pending : st);
  };
  const cover = (Object.keys(REQ_DOC_COPY.cover) as (keyof ProposalV3Doc['cover'])[]).filter((k) => e.doc.cover?.[k]).map((k) => `${REQ_DOC_COPY.cover[k]}: ${e.doc.cover[k]}`);
  return [
    e.summary, '',
    ...e.points.flatMap((p) => [`■ ${p.title}`, p.detail, p.impact, '']),
    ...cover,
    ...Object.entries(e.doc.items).filter(([, it]) => it.text || it.status === 'na').map(([id, it]) => [`■ ${label(id)}（${status(id, it.status)}）`, it.text].join(NL)),
    ...e.doc.added.map((a) => [`■ ${a.label}（${REQ_DOC_COPY.addedClient}・${a.status === 'na' ? '不採用' : '採用案'}）`, a.text, REQ_DOC_COPY.addedReason(a.reason)].join(NL)),
    ...Object.entries(e.doc.notes).filter(([, t]) => t).map(([id, t]) => [`■ ${chapter(id)} ${REQ_DOC_COPY.notesLabel}`, t].join(NL)),
  ].join(NL);
}

// ---------------- 要件定義書 PDF（§4。文は画面と同じ buildReqDocView の行） ----------------

const nl = (s: string) => esc(s).replace(/\n/g, '<br>');
const chipText = (chips: Chip[]) => (chips.length ? `<br><span class="muted">${esc(chips.map((c) => c.label).join('・'))}</span>` : '');

/** 「1. 改善提案」の後半: AI 要件定義（表紙・本書の目的・01〜22 章・旧版の項目・23 章）。要約・改善ポイント・基本チェックは proposalPointsHtml */
export function reqDocChaptersHtml(p: ProposalV3, approval: ReqDocApprovalState): string {
  const version = p.template?.version ?? '';
  const view = buildReqDocView(p.doc, version, approval);
  const head = `<h3>${esc(REQ_DOC_COPY.sectionTitle)}</h3>`;
  if (view.catalogMissing || !view.cover || !view.purpose || !view.closing) return `${head}<p class="muted">${esc(REQ_DOC_COPY.catalogMissing(version))}</p>`;
  const cover = `<h3>${esc(view.cover.title)}</h3><p>${esc(view.cover.versionLine)}</p><p>${view.cover.lines.map(esc).join('<br>')}</p>`;
  const purpose = `<h3>${esc(view.purpose.title)}</h3><p>${esc(view.purpose.body)}</p><p>${esc(view.purpose.legend)}</p>`;
  const row = (r: ReqDocRow) => {
    const k = r.kind === 'added' ? `${esc(r.label)}（${esc(REQ_DOC_COPY.addedClient)}）` : esc(r.label);
    const v = r.text.trim() ? nl(r.text) : `<span class="muted">${esc(r.mutedText ?? '')}</span>`;
    const chips = r.kind === 'added' ? chipText(r.chips.filter((c) => c.label !== REQ_DOC_COPY.addedClient)) : chipText(r.chips);
    return `<tr><th>${k}</th><td>${v}${chips}${r.captions.map((c) => `<br><span class="muted">${esc(c)}</span>`).join('')}</td></tr>`;
  };
  const chapters = view.chapters.map((ch) =>
    `<h3>${esc(ch.heading)}</h3><p>${esc(ch.intro)}</p><table class="reqdoc">${ch.rows.map(row).join('')}</table>${ch.notesLine ? `<p>${nl(ch.notesLine)}</p>` : ''}`).join('');
  const legacy = view.legacy.length ? `<h3>${esc(REQ_DOC_COPY.legacy)}</h3><table class="reqdoc">${view.legacy.map(row).join('')}</table>` : '';
  const c = view.closing;
  const closing = `<h3>${esc(c.heading)}</h3><p>${esc(c.body)}</p><p>${c.lines.map(esc).join('<br>')}</p><p>${esc(c.approvalLine)}</p>${c.status ? `<p class="muted">${esc(c.status)}</p>` : ''}<p class="muted">${esc(REQ_DOC_COPY.ch23.overlap)}</p>`;
  return `${head}${cover}${purpose}${chapters}${legacy}${closing}`;
}

export type { AiEditableV3, ProposalV3, ProposalV3Doc };
