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
}

export interface RequirementCategory {
  id: string;
  no: number;
  title: string;
  /** 資料上の質問数（デモで全問は持たない場合もあるため明示） */
  questionCount: number;
}

export type AnswerValue = string | string[];

export interface RequirementSession {
  projectId: string;
  answers: Record<string, AnswerValue>;
  competitors: string[];
  status: 'draft' | 'analyzed' | 'approved';
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
}
