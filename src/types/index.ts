/**
 * アフロCMS デモ — ドメイン型。
 * Firebase 移行時はこの型をそのまま Firestore ドキュメントの形として使う想定
 * （日時は ISO 文字列で保持し、Timestamp への変換は repository 層で行う）。
 */

export type ISODate = string;

/* ---------- 共通 ---------- */

export type Stage = 'requirements' | 'build' | 'quality' | 'operation' | 'improvement';

export interface Member {
  id: string;
  name: string;
  role: string;
  /** アバターの背景色（トークン外の識別色） */
  color: string;
  initials: string;
}

/* ---------- プロジェクト ---------- */

export interface Project {
  id: string;
  clientName: string;
  siteName: string;
  siteUrl: string;
  industry: string;
  stage: Stage;
  /** 0-100 */
  progress: number;
  ownerId: string;
  updatedAt: ISODate;
  nextAction: string;
  /** プレビュー用のブランド色 */
  accent: string;
  launchDate?: ISODate;
  pendingApprovals: number;
}

/* ---------- 要件定義（12項目81問） ---------- */

export type QuestionPriority = 'A' | 'B';
export type QuestionKind = 'text' | 'longtext' | 'url' | 'single' | 'multi';

export interface RequirementQuestion {
  id: string;
  categoryId: string;
  priority: QuestionPriority;
  text: string;
  kind: QuestionKind;
  options?: string[];
  placeholder?: string;
  /** デモのウィザードで実際に聞く代表質問か */
  featured?: boolean;
  /** 共同モードでこの質問に答える側（事業・好みはお客様、技術・分析はアフロ） */
  owner: AnswerSide;
}

export interface RequirementCategory {
  id: string;
  no: number;
  title: string;
  /** 資料上の質問数（デモで全問は持たない場合もあるため明示） */
  questionCount: number;
}

export type AnswerValue = string | string[];

/** 要件の回答を誰が入力するか。shared=質問ごとに分担（既定）/ afro=アフロが代理で全部 / client=お客様が全部 */
export type RequirementMode = 'shared' | 'afro' | 'client';
/** 操作した側 */
export type AnswerSide = 'afro' | 'client';

/** 回答の記録。担当ではない側が入力した回答（代理回答）は、担当側の確認（confirmedAt）が要る */
export interface AnswerMeta {
  by: AnswerSide;
  at: ISODate;
  confirmedAt?: ISODate;
}

export interface RequirementSession {
  projectId: string;
  answers: Record<string, AnswerValue>;
  competitors: string[];
  status: 'draft' | 'analyzed' | 'approved';
  /** 0.9.0 で追加。無い保存データは 'shared' として扱う（版は上げない） */
  mode?: RequirementMode;
  /** 0.9.0 で追加。無い回答は担当側が答えたものとして扱う */
  answerMeta?: Record<string, AnswerMeta>;
  analyzedAt?: ISODate;
  approvedAt?: ISODate;
}

export interface ProposalPoint {
  id: string;
  title: string;
  detail: string;
  priority: 'high' | 'medium' | 'low';
  impact: string;
  area: string;
}

/* ---------- サイトマップ ---------- */

export type SitemapVariant = 'before' | 'after';

export interface SitemapNodeData {
  label: string;
  path: string;
  kind: 'home' | 'section' | 'page' | 'cta' | 'new';
  reason?: string;
  [key: string]: unknown;
}

export interface SitemapNode {
  id: string;
  position: { x: number; y: number };
  data: SitemapNodeData;
}

export interface SitemapEdge {
  id: string;
  source: string;
  target: string;
}

export interface SitemapState {
  before: { nodes: SitemapNode[]; edges: SitemapEdge[] };
  after: { nodes: SitemapNode[]; edges: SitemapEdge[] };
  approvedAt?: ISODate;
}

/* ---------- デザイン ---------- */

export type DesignId = 'minimal' | 'creative' | 'premium';

export interface DesignVariant {
  id: DesignId;
  label: string;
  name: string;
  tagline: string;
  description: string;
  palette: string[];
  fonts: string;
  score: { brand: number; conversion: number; readability: number };
}

export interface DesignState {
  selected: DesignId | null;
  approvedAt?: ISODate;
  buildStartedAt?: ISODate;
  buildCompletedAt?: ISODate;
}

/* ---------- 品質管理（12項目110問） ---------- */

export interface QualityCategory {
  id: string;
  no: number;
  title: string;
  questionCount: number;
}

export interface QualityItem {
  id: string;
  categoryId: string;
  /** A: 定量的・機械的に確認できる / B: 判断・目視が必要 */
  priority: QuestionPriority;
  text: string;
}

export interface QualityCheck {
  afroAt?: ISODate;
  afroBy?: string;
  clientAt?: ISODate;
  clientBy?: string;
}

export interface ApprovalLog {
  id: string;
  at: ISODate;
  actor: string;
  side: 'afro' | 'client';
  action: string;
  target: string;
}

/* ---------- CMS ---------- */

export type PageStatus = 'draft' | 'review' | 'scheduled' | 'published';
export type PageType = 'page' | 'news';

export interface CmsPage {
  id: string;
  type: PageType;
  title: string;
  slug: string;
  /** Tiptap の HTML */
  content: string;
  /** 最後に公開された内容（Before/After 比較用） */
  publishedContent?: string;
  coverImage?: string;
  seoTitle: string;
  seoDescription: string;
  status: PageStatus;
  updatedAt: ISODate;
  publishedAt?: ISODate;
  scheduledAt?: ISODate;
  authorId: string;
  parentPath?: string;
}

/* ---------- インサイト ---------- */

export interface MonthlyMetric {
  month: string;
  sessions: number;
  inquiries: number;
  cvr: number;
}

export interface DiagnosisReport {
  id: string;
  at: ISODate;
  /** リニューアルからの経過（4か月単位） */
  cycle: number;
  score: number;
  categories: { name: string; score: number }[];
  findings: { title: string; detail: string; priority: 'high' | 'medium' | 'low' }[];
  isDemo: true;
}

/* ---------- アクティビティ ---------- */

export interface Activity {
  id: string;
  at: ISODate;
  actor: string;
  text: string;
  kind: 'approve' | 'publish' | 'ai' | 'edit' | 'check' | 'comment';
  projectId?: string;
}

/* ---------- 開発者画面（アフロ制作エンジニア） ---------- */

export type DevTaskStatus = 'todo' | 'doing' | 'review' | 'done';

/** 構築タスク（1 ページ = 1 タスク） */
export interface DevTask {
  id: string;
  /** 対象ページ名（BUILD_PAGES のいずれか） */
  page: string;
  title: string;
  assigneeId: string;
  status: DevTaskStatus;
  updatedAt: ISODate;
}

export type DeployEnv = 'development' | 'staging' | 'production';

/** デプロイ履歴（シミュレーション。実際のサーバーへは公開しない） */
export interface Deploy {
  id: string;
  env: DeployEnv;
  /** semver（例: 1.4.2） */
  version: string;
  at: ISODate;
  by: string;
  status: 'success' | 'failed';
  note: string;
}

export interface DevState {
  tasks: DevTask[];
  /** 新しい順 */
  deploys: Deploy[];
  checksRunAt?: ISODate;
}

/* ---------- デジタルサイネージ（お客様ポータル。デモのため実際の端末とは接続しない） ---------- */

export type SignageOrientation = 'landscape' | 'portrait';
export type SlideTemplate = 'promo' | 'menu' | 'news';
/** スライドの差し色（data/signage の SLIDE_ACCENTS のいずれか） */
export type SlideAccent = 'roast' | 'leaf' | 'night' | 'berry';

export interface SlideMenuItem {
  name: string;
  /** 税込の円（整数） */
  price: number;
}

/** 店頭の画面に流すコンテンツ 1 枚 */
export interface Slide {
  id: string;
  template: SlideTemplate;
  title: string;
  body?: string;
  /** menu のときだけ使う（1〜6 品） */
  items?: SlideMenuItem[];
  accent: SlideAccent;
  /** デモ画像の id（data/cms の DEMO_IMAGES） */
  image?: string;
  /** 1 枚を表示する秒数（5〜30） */
  durationSec: number;
  /** 掲載期間（YYYY-MM-DD・その日を含む）。無ければ常に表示 */
  startAt?: string;
  endAt?: string;
  /** お知らせから作ったときの元ページ */
  sourcePageId?: string;
  updatedAt: ISODate;
}

/** 店舗に置いた画面（端末） */
export interface Display {
  id: string;
  name: string;
  location: string;
  orientation: SignageOrientation;
  online: boolean;
  lastSeenAt: ISODate;
  /** 編集中の再生順（配信するまで端末には届かない） */
  slideIds: string[];
  /** 端末へ配信した再生順 */
  deliveredSlideIds: string[];
  /**
   * 配信した時点のスライドの写し。配信後にスライドを編集・削除しても、再配信するまで端末は配信時の内容を流し続ける。
   * 無い場合（古い保存データ）は現在のスライドで代用する
   */
  deliveredSlides?: Record<string, Slide>;
  deliveredAt?: ISODate;
}

export interface SignageState {
  displays: Display[];
  slides: Slide[];
}

/* ---------- ストア全体 ---------- */

export interface DemoState {
  version: number;
  userName: string;
  currentProjectId: string;
  projects: Project[];
  requirements: RequirementSession;
  sitemap: SitemapState;
  design: DesignState;
  qualityChecks: Record<string, QualityCheck>;
  approvalLogs: ApprovalLog[];
  pages: CmsPage[];
  diagnoses: DiagnosisReport[];
  activities: Activity[];
  settings: { reducedMotion: 'system' | 'on' | 'off'; companyName: string };
  /** 開発者画面のデータ。0.5.0 で追加したため、それ以前の保存データには無い（devState() で補う） */
  dev?: DevState;
  /** デジタルサイネージ。0.11.0 で追加したため、それ以前の保存データには無い（signageState() で補う） */
  signage?: SignageState;
}
