/**
 * AI による提案・要件定義書の下書き（docs/design/AI_REQUIREMENTS.md §5.3・§7、実装計画 §4 U1）。
 *
 * - 既存の `Proposal`（v1。`version` を持たない 8 キー）は変えない。保存される提案は `StoredProposal = Proposal | ProposalV2`
 * - edited の上限・列挙はクライアントの Rules では検査しない（計画の代替 F-a。最大の payload が Rules の 1000 式を超えた）。
 *   検査は callable saveAiDraftEdits（U2）がこの定数で行う。tests/rules/mutation.test.mjs「定数の食い違い」が
 *   Rules の v2 の等式のキー・列挙（分野 ⊇ improveOptions・送る質問 ID ⊂ Rules の質問 ID）・テストの最大値とこのファイルを照合する
 * - Firestore の Timestamp はここでは型に持ち込まない（repository 層で変換する。src/types/index.ts と同じ方針）
 */
import type { ISODate, Proposal } from './index';

/** Rules と共有する上限（文字数は String の長さ。Rules の `.{0,n}` はコードポイントで数える） */
export const AI_DRAFT_LIMITS = {
  /** 提案の要約 */
  summary: 400,
  /** 提案ポイントの件数 */
  points: 6,
  /** ポイントの各欄 */
  pointId: 40,
  pointTitle: 80,
  pointDetail: 600,
  pointImpact: 200,
  /** ポイント 1 件の根拠キー数 */
  evidence: 5,
  /** 要件定義書の下書きの各欄 */
  draftField: 800,
  /** 未確定事項の件数と 1 件の長さ */
  openQuestions: 10,
  openQuestion: 200,
  /** 基本チェックの項目数（generated.siteCheck.items。サーバーが書く） */
  siteCheckItems: 12,
  /** 管理者が編集を捨てた記録（discardLog。サーバーが書く） */
  discardLog: 10,
} as const;

/** ポイントの優先度（v1 と同じ 3 値） */
export const AI_POINT_PRIORITIES = ['high', 'medium', 'low'] as const;
export type AiPointPriority = (typeof AI_POINT_PRIORITIES)[number];

/**
 * ポイントの分野（列挙）。ヒアリングの「改善したいこと」（IMPROVE_OPTIONS）＋「その他」。
 * [DECISION database-engineer U1] 設計 §5.3 は「列挙」とだけ定めているため、既存の選択肢と同じ集合にした。変えるときは Rules と同時に
 */
export const AI_POINT_AREAS = [
  'ファーストビュー', 'ナビゲーション', 'スマホ表示', '表示速度', '問い合わせ導線', '写真・ビジュアル', 'SEO', '更新のしやすさ', 'その他',
] as const;
export type AiPointArea = (typeof AI_POINT_AREAS)[number];

/** AI へ送る質問 ID（設計 §4「送る」。q-infra・q-dns-* は送らない） */
export const AI_SENT_QUESTION_IDS = [
  'q-url', 'q-purpose', 'q-issue', 'q-competitor', 'q-improve', 'q-keep', 'q-target', 'q-strength',
  'q-market', 'q-content', 'q-feature', 'q-cv', 'q-seo', 'q-ops', 'q-schedule', 'q-other',
] as const;

/**
 * 基本チェックの項目キー（設計 §3「基本チェック」。siteCheck.items[].key と AI へ渡す site_facts のキー）。
 * [DECISION database-engineer U1] キー名はここで固定する（U2/U3 はこの定数を使う）
 */
export const AI_SITE_CHECK_KEYS = [
  'https', 'viewport', 'title-length', 'description', 'h1-count', 'alt-missing',
  'page-size', 'response-time', 'sitemap', 'structured-data',
] as const;
export type AiSiteCheckKey = (typeof AI_SITE_CHECK_KEYS)[number];

/** `points[].evidence` の許可リスト（Rules の hasOnly と同じ集合） */
export const AI_EVIDENCE_KEYS = [...AI_SENT_QUESTION_IDS, ...AI_SITE_CHECK_KEYS] as const;
export type AiEvidenceKey = (typeof AI_EVIDENCE_KEYS)[number];

export interface ProposalV2Point {
  id: string;
  area: AiPointArea;
  priority: AiPointPriority;
  title: string;
  detail: string;
  /** 定性表現（根拠のない数値を書かない。設計 §5.4） */
  impact: string;
  evidence: AiEvidenceKey[];
}

/** 要件定義書の下書き（各欄 ≤ draftField 文字。空文字可） */
export interface ProposalV2Draft {
  goal: string;
  target: string;
  contents: string;
  features: string;
  nonFunctional: string;
  operation: string;
  schedule: string;
  openQuestions: string[];
}

export interface SiteCheckItem {
  key: AiSiteCheckKey;
  ok: boolean;
  value: string | number | boolean | null;
}

export interface SiteCheck {
  status: 'ok' | 'blocked' | 'failed';
  fetchedAt?: ISODate;
  passed: number;
  total: number;
  items: SiteCheckItem[];
}

export interface ProposalOrigin {
  kind: 'ai';
  promptVersion: string;
  model: string;
}

/** 開発者が直せる 3 欄（aiDrafts.edited。Rules は edited.keys().hasOnly(この 3 つ)） */
export interface AiEditable {
  summary: string;
  points: ProposalV2Point[];
  draft: ProposalV2Draft;
}

/** サーバーが決める欄（generated にだけ置く。L-2） */
export interface ProposalV2ServerFields {
  hostname: string;
  issue: string;
  /** 生成時の回答（submit 時の回答から作り直さない） */
  purposes: string[];
  improves: string[];
  competitors: string[];
  siteCheck: SiteCheck | null;
  origin: ProposalOrigin;
}

/** お客様へ出す提案（requirements/current.proposal と approvals の写し）。flags は含めない */
export interface ProposalV2 extends ProposalV2ServerFields, AiEditable {
  version: 2;
}

/** AI の出力（aiDrafts.generated）。flags はサーバー欄で、提案には写らない */
export interface AiGenerated extends ProposalV2 {
  flags?: { unsupportedNumbers?: string[] };
}

/** 保存される提案（v1 は version を持たない。v3 は会社標準ひな型の章立て＝U4 で追加） */
export type StoredProposal = Proposal | ProposalV2 | ProposalV3;

export function isProposalV2(p: StoredProposal | null | undefined): p is ProposalV2 {
  return !!p && 'version' in p && p.version === 2;
}

/** 下書き・編集の欄（v2 か v3。v3 は doc を持つ） */
export type AnyAiEditable = AiEditable | AiEditableV3;
export type AnyAiGenerated = AiGenerated | AiGeneratedV3;

export function isEditableV3(e: AnyAiEditable | null | undefined): e is AiEditableV3 {
  return !!e && typeof e === 'object' && 'doc' in e && !!(e as AiEditableV3).doc;
}

export type AiDraftState = 'ready' | 'failed';
export type AiJobState = 'idle' | 'running';

/** projects/{pid}/aiDrafts/requirements（設計 §7）。作成と edited 以外の更新は Functions（Admin SDK）だけ */
export interface AiDraftDoc {
  schemaVersion: 1;
  state: AiDraftState;
  /**
   * 生成ジョブ（lease）。新しい下書きの作成は requestRequirementsDraft だけが行い、そのとき job は必ず running（state は failed で作り、結果で ready へ）。
   * running は leaseUntil を過ぎるまで実行中とみなす（過ぎれば次の押下が奪える）。結果を書けるのは job.requestId が自分のまま running の worker だけ（fencing）。
   * 終わると idle（requestId は最後の押下のまま。同じ requestId の再送は結果を返す）。role・discardEdits・quotaDay は running の間だけ意味を持つ
   */
  job: {
    state: AiJobState;
    requestId?: string;
    by?: string;
    startedAt?: ISODate;
    leaseUntil?: ISODate;
    role?: string;
    discardEdits?: boolean;
    /** 上限を加算した JST の日（返金はこの日の鍵で戻す） */
    quotaDay?: string;
  };
  /** 最後の失敗（種別だけ。本文・メッセージは入れない）。httpStatus・anthropicRequestId は Anthropic の失敗のときだけ */
  lastError?: { code: string; at: ISODate; requestId: string; httpStatus?: number; anthropicRequestId?: string };
  answersHash?: string;
  configHash?: string;
  /** v2 か v3（判定は isProposalV3。v3 を先に見る） */
  generated?: AnyAiGenerated;
  edited?: AnyAiEditable;
  editedAt?: ISODate;
  editedBy?: string;
  discardLog?: { by: string; at: ISODate; role: 'admin' }[];
  usage?: { input: number; output: number; cacheRead: number; costMicroUsd: number };
  quota?: { day: string; dayCount: number; month: string; monthCount: number };
  updatedAt: ISODate;
  updatedBy: string;
}

/** aiUsage/{yyyymm}（JST。admin だけが読める。書くのは Functions だけ） */
export interface AiUsageDoc {
  count: number;
  costMicroUsd: number;
  byDay: Record<string, number>;
  /** 利用者の日次の件数（quota.ts の上限に使う）。鍵は `${JST の yyyy-mm-dd}:${uid}`（月の文書の中に日付つきで持つ） */
  byUid: Record<string, number>;
}

// ---------------------------------------------------------------------------------------------
// 提案 v3（会社標準ひな型の章立ての要件定義書。docs/design/REQUIREMENTS_DOC_TEMPLATE.md §3）
// - 追加だけ。v1（Proposal）・v2（ProposalV2）と AI_DRAFT_LIMITS は変えない
// - 章・項目の一覧（カタログ）は src/shared/ai/reqDocCatalog.ts（版ごと）。doc.items のキーはカタログの項目 id と過不足なく一致させる（検査は U2 の saveAiDraftEdits）
// - StoredProposal へ ProposalV3 を足した（U4）。版の判定はいつも v3 → v2 → v1 の順（v1 は version を持たないので最後）
// ---------------------------------------------------------------------------------------------

/** v3 の上限（設計 §3.1 [TARGET]。文字数は String の長さ） */
export const REQ_DOC_LIMITS = {
  /** 項目の文（確定内容／採否・仕様） */
  itemText: 400,
  /** 項目 1 件の根拠キー数 */
  itemEvidence: 5,
  /** AI追加の件数・各欄 */
  added: 10,
  addedLabel: 40,
  addedReason: 200,
  /** 章末の「特記事項・対象外・追加費用・承認状況」 */
  notes: 400,
  /** 22 章「未決事項」に入れる確認事項の件数と 1 件の長さ */
  openQuestions: 20,
  openQuestion: 200,
  /** 表紙の各欄（会社名と役職まで。氏名は入れない＝Q-11） */
  coverField: 100,
  /**
   * 22 章「未決事項」（t22-01）の文だけの上限: 未確定の項目の一覧（itemText まで）＋確認事項（openQuestions 件 ×（openQuestion＋行頭「・」と改行））。
   * [DECISION ai-engineer U2 2026-11-25] 設計 §3.1 が確認事項 20 件×200 字をこの項目に入れるとしており、itemText 400 では入らないため
   */
  openItemsText: 400 + 20 * (200 + 2),
} as const;

/** v3 の項目の根拠キー（AI_EVIDENCE_KEYS ＋ 'site_text'＝現行トップページの本文。AI の文に付けてよいキー。サーバーの転記は 'project:*' などカタログの feeds を付ける） */
export const REQ_DOC_AI_EVIDENCE_KEYS = [...AI_EVIDENCE_KEYS, 'site_text'] as const;

/**
 * 項目の状態。proposed＝確定案（選択は「採用案」）／open＝未確定／na＝対象外（選択は「不採用」。理由の文が必須）／
 * std_pending＝確認中（標準仕様の確定後に記載。**固定の項目だけ・固定はこれ以外にできない**＝Q-1）
 */
export const REQ_DOC_ITEM_STATUSES = ['proposed', 'open', 'na', 'std_pending'] as const;
export type ReqDocItemStatus = (typeof REQ_DOC_ITEM_STATUSES)[number];

/** 項目の文を書いた者（ai＝AI の下書き／server＝サーバーの転記／human＝担当開発者） */
export const REQ_DOC_ITEM_AUTHORS = ['ai', 'server', 'human'] as const;
export type ReqDocItemAuthor = (typeof REQ_DOC_ITEM_AUTHORS)[number];

/** ひな型の区分（固定 / 個別 / 選択） */
export const REQ_DOC_KUBUN = ['fixed', 'individual', 'optional'] as const;
export type ReqDocKubun = (typeof REQ_DOC_KUBUN)[number];

/** 誰が下書きするか（設計 §2）。standard＝固定。アフロの標準仕様が決まるまで「確認中」で、AI は書かない */
export const REQ_DOC_FILLS = ['ai', 'server', 'human', 'standard'] as const;
export type ReqDocFill = (typeof REQ_DOC_FILLS)[number];

export interface ReqDocTemplateRef {
  id: 'TPL-WEB-REQ';
  /** 作った時のひな型の版（表示はこの版のカタログで描く） */
  version: string;
}

/** ひな型の 1 項目の中身（doc.items[itemId]） */
export interface ReqDocItem {
  status: ReqDocItemStatus;
  /** ≤ REQ_DOC_LIMITS.itemText。std_pending は空 */
  text: string;
  /** 根拠のキー（質問 ID・基本チェックのキー等）≤ REQ_DOC_LIMITS.itemEvidence。proposed・na は 1 つ以上 */
  evidence: string[];
  /** 開発者が書き換えられない（U2 の検査） */
  by: ReqDocItemAuthor;
}

/** AI追加（ひな型に無い項目の提案。≤ REQ_DOC_LIMITS.added 件） */
export interface ReqDocAddedItem {
  /** 'a01' 形式 */
  id: string;
  /** カタログの章 id（'c07' 形式） */
  chapterId: string;
  label: string;
  status: 'proposed' | 'na';
  text: string;
  reason: string;
  /** 1〜REQ_DOC_LIMITS.itemEvidence 件 */
  evidence: string[];
  source: 'ai_added';
}

/** 表紙（会社名と役職まで。Q-11） */
export interface ReqDocCover {
  client: string;
  vendor: string;
  author: string;
  approver: string;
}

export interface ProposalV3Doc {
  /** カタログの全項目（キーはカタログの項目 id と一致・過不足なし） */
  items: Record<string, ReqDocItem>;
  added: ReqDocAddedItem[];
  /** 章 id → 章末の特記欄（特記欄の無い 16 章を除く） */
  notes: Record<string, string>;
  cover: ReqDocCover;
}

/** v3 で開発者が直せる欄（aiDrafts.edited）。summary・points は v2 と同じ（改善提案は付録で残す＝Q-4） */
export interface AiEditableV3 {
  summary: string;
  points: ProposalV2Point[];
  doc: ProposalV3Doc;
}

/** お客様へ出す提案 v3（requirements/current.proposal と approvals の写し）。flags は含めない */
export interface ProposalV3 extends ProposalV2ServerFields, AiEditableV3 {
  version: 3;
  template: ReqDocTemplateRef;
}

/** AI の出力 v3（aiDrafts.generated）。flags はサーバー欄で、提案には写らない */
export interface AiGeneratedV3 extends ProposalV3 {
  flags?: { unsupportedNumbers?: string[] };
}

export function isProposalV3(p: unknown): p is ProposalV3 {
  return !!p && typeof p === 'object' && 'version' in p && (p as { version: unknown }).version === 3;
}
