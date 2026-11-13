/**
 * アフロCMS デモ — ドメイン型。
 * Firebase 移行時はこの型をそのまま Firestore ドキュメントの形として使う想定
 * （日時は ISO 文字列で保持し、Timestamp への変換は repository 層で行う）。
 */

export type ISODate = string;

/* ---------- 共通 ---------- */

export type Stage = 'hearing' | 'requirements' | 'build' | 'quality' | 'operation' | 'improvement';

export interface Member {
  id: string;
  name: string;
  role: string;
  /** アバターの背景色（トークン外の識別色） */
  color: string;
  initials: string;
  /** ログインに使うメールアドレス（架空。開発者画面の権限の照合に使う） */
  email: string;
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

/** 新しいプロジェクトの入力（画面・reducer・repository で使う。検査は features/projects/projectForm.ts） */
export interface ProjectDraft {
  clientName: string;
  siteName: string;
  siteUrl: string;
  industry: string;
  ownerId: string;
  accent: string;
  /** yyyy-mm-dd（空なら未定） */
  launchDate: string;
  /** 空なら DEFAULT_NEXT_ACTION */
  nextAction: string;
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
  /** AI 分析に使う主要な質問か（入力画面で「AI分析に必要」と表示） */
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
  /** live だけ: 確認依頼（分析完了）のときに保存した要件定義書の写し（BACKEND_FIREBASE §3・§5.5）。demo は持たず回答から毎回作る */
  proposal?: Proposal;
}

export interface ProposalPoint {
  id: string;
  title: string;
  detail: string;
  priority: 'high' | 'medium' | 'low';
  impact: string;
  area: string;
}

/** 要件定義書（改善提案）。buildProposal() の結果。live は分析完了時の写しを保存する */
export interface Proposal {
  hostname: string;
  issue: string;
  purposes: string[];
  improves: string[];
  competitors: string[];
  /** 現状スコア（0-100、デモ用の決定的な値） */
  currentScore: number;
  /** 改善後の見込みスコア */
  projectedScore: number;
  points: ProposalPoint[];
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
  /** デザイン要件定義の回答（0.28.0。src/data/designRequirements.ts）。無い保存データは未回答として扱う（版は上げない） */
  answers?: Record<string, AnswerValue>;
  /** デザイン要件定義の回答の記録（入力した時刻。ヒアリングの answerMeta と同じ形） */
  answerMeta?: Record<string, AnswerMeta>;
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
  /** どの案件の承認か（0.20.0 から。無い古い記録はデモのデータを持つ案件のもの） */
  projectId?: string;
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
  /**
   * 最後に保存・状態の変更をした人の表示名（0.30.2 から。2026-11-13 ユーザー指示）。
   * エディタの「保存済み・○○」が作成者（authorId）のままで、ポータルから保存しても「上野 航」と出ていたため。無い古い記録は authorId の人を出す
   */
  updatedBy?: string;
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
  /**
   * お客様側の操作の印（0.30.3。2026-11-13 ユーザー指示）。お客様の操作かを名前ではなくこの印で見分ける（会社名を後から直しても数えられるように）。
   * 0.30.2 までの記録には無い（clientStatus.ts は名前で見分ける）
   */
  side?: 'client';
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

/* ---------- ユーザー管理（管理者画面。デモのため実際の招待メール・認証は行わない） ---------- */

/** お客様アカウントの状態。invited=招待済み・未ログイン / active=ログイン済み / disabled=管理者が無効にした */
export type ClientAccountStatus = 'invited' | 'active' | 'disabled';

/** お客様ポータルにログインできるお客様（担当者 1 人 = 1 アカウント） */
export interface ClientAccount {
  id: string;
  company: string;
  /** 担当者名 */
  name: string;
  /** 小文字・前後の空白なしで保持する（重複の判定とログインの照合に使う） */
  email: string;
  /** 担当案件（Project.id） */
  projectId: string;
  status: ClientAccountStatus;
  createdAt: ISODate;
  /** 初めてお客様ポータルにログインした日時 */
  activatedAt?: ISODate;
  disabledAt?: ISODate;
}

/** 開発者の所属。internal=アフロの社員 / partner=外部の協力会社 */
export type DevAffiliation = 'internal' | 'partner';

/**
 * 管理者がユーザー管理で登録した開発者（固定のメンバー MEMBERS とは別に持つ）。
 * 頭文字・アバターの色は名前と id から作る（保存しない）
 */
export interface DevUser {
  id: string;
  name: string;
  /** 役割（例: フロントエンドエンジニア） */
  role: string;
  /** 小文字・前後の空白なしで保持する（重複の判定とログインの照合に使う） */
  email: string;
  affiliation: DevAffiliation;
  /** 外部パートナーの会社名（affiliation が partner のときだけ必須） */
  partnerCompany?: string;
  /** disabled=管理者が無効にした（開発者画面にログインできない） */
  status: 'active' | 'disabled';
  createdAt: ISODate;
  disabledAt?: ISODate;
}

/* ---------- ストア全体 ---------- */

/** 1 案件分の公開後のデータ（ページ・お知らせ、AI 診断、サイネージ。0.30.0 から案件ごと。2026-11-13 ユーザー指示） */
export interface ProjectContent {
  pages: CmsPage[];
  diagnoses: DiagnosisReport[];
  signage: SignageState;
}

/**
 * 1 案件分の制作データ（ヒアリング・要件定義・サイトマップ・デザイン・品質チェック）と公開後のデータ。
 * 公開後のデータは 0.30.0 で足したので、0.29 までの保存データには無い（読み込み時に補う。store/DemoStore.tsx。版は上げない）
 */
export interface ProjectWork extends Partial<ProjectContent> {
  requirements: RequirementSession;
  sitemap: SitemapState;
  design: DesignState;
  qualityChecks: Record<string, QualityCheck>;
}

export interface DemoState {
  version: number;
  userName: string;
  currentProjectId: string;
  projects: Project[];
  requirements: RequirementSession;
  sitemap: SitemapState;
  design: DesignState;
  qualityChecks: Record<string, QualityCheck>;
  /**
   * 選んでいない案件の制作データ（ヒアリング〜品質チェック。0.29.0）。選んでいる案件の分は上の requirements・sitemap・design・qualityChecks
   * （持ち主は requirements.projectId）。案件を切り替えるときに入れ替える（store/projectWork.ts）。無い保存データは初期データで補う（版は上げない）
   */
  projectWork?: Record<string, ProjectWork>;
  approvalLogs: ApprovalLog[];
  /** ページ・お知らせと AI 診断（選んでいる案件の分。持ち主は requirements.projectId。ほかの案件の分は projectWork。0.30.0） */
  pages: CmsPage[];
  diagnoses: DiagnosisReport[];
  activities: Activity[];
  settings: { reducedMotion: 'system' | 'on' | 'off'; companyName: string };
  /** 開発者画面のデータ。0.5.0 で追加したため、それ以前の保存データには無い（devState() で補う） */
  dev?: DevState;
  /**
   * デジタルサイネージ（選んでいる案件の分。0.30.0 から案件ごと）。0.11.0 で追加したため、それ以前の保存データには無い
   * （読み込み時に補う。store/DemoStore.tsx）
   */
  signage?: SignageState;
  /** お客様アカウント。0.13.0 で追加したため、それ以前の保存データには無い（clientAccountsState() で補う） */
  clientAccounts?: ClientAccount[];
  /** 開発者画面を開けるメンバー（Member.id → 可否）。0.13.0 で追加（devAccessState() で補う） */
  devAccess?: Record<string, boolean>;
  /** 開発者が担当するプロジェクト（Member.id → Project.id の一覧）。0.14.0 で追加（devProjectsState() で補う） */
  devProjects?: Record<string, string[]>;
  /** 管理者が登録した開発者。0.15.0 で追加（devUsersState() で補う） */
  devUsers?: DevUser[];
}
