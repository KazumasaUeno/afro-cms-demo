import type { AnswerSide, AnswerValue, ApprovalLog, ClientAccount, DevUser, Project, RequirementSession } from '@/types';
import type { DevPerson } from '@/data/people';
import type { ClientAccountDraft, DevUserDraft } from '@/data/users';
import type { ProjectDraft } from '@/features/projects/projectForm';

/**
 * repository 層の型（BACKEND_FIREBASE §13.2。B0 = 型と demo 実装だけ）。
 * - 読み取りは購読するフック（useXxx）。データが変わると描画し直す。live は onSnapshot で実装し、
 *   読み込み中は loading: true と空の値を返す。demo は DemoStore の state をそのまま返す（loading: false）
 * - 書き込みは Promise を返す。demo は dispatch を同期で行ってから解決する（呼んだ直後に state が変わる従来の動きのまま）。
 *   不正な操作は従来どおり reducer が受け付けない（demo では失敗にしない）
 * - projectId は live で文書の場所を決めるために渡す。demo の要件・承認のデータは 1 案件分（requirements.projectId）だけ
 */
export interface Query<T> {
  data: T;
  loading: boolean;
  error: Error | null;
}

export interface ProjectsRepo {
  useList(): Query<Project[]>;
  /** 画面で選んでいる案件（表示の状態。保存先のデータではない） */
  useCurrentId(): string;
  select(id: string): void;
  /** 作成した案件は作業中の案件になる（useCurrentId が新しい id に変わる） */
  create(draft: ProjectDraft): Promise<void>;
}

export interface AnswerEntry {
  questionId: string;
  value: AnswerValue;
}

export interface RequirementsRepo {
  useCurrent(): Query<RequirementSession>;
  setAnswer(projectId: string, questionId: string, value: AnswerValue, by?: AnswerSide): Promise<void>;
  /** まとめて反映する（CSV の取り込み）。live は 1 回の書き込みにする */
  setAnswers(projectId: string, entries: readonly AnswerEntry[], by?: AnswerSide): Promise<void>;
  confirmAnswer(projectId: string, questionId: string, by: AnswerSide): Promise<void>;
  /** 入力途中の競合サイト（回答として確定するのは setAnswer） */
  setCompetitors(projectId: string, urls: string[]): Promise<void>;
  completeAnalysis(projectId: string): Promise<void>;
  reset(projectId: string): Promise<void>;
  /** いまの回答をすぐ保存する（「保存」ボタン）。保存できたら true */
  saveNow(): Promise<boolean>;
}

export interface ApprovalsRepo {
  useHistory(projectId: string): Query<ApprovalLog[]>;
  /** by: 実際に操作した側（省略時はアフロの代理承認。demo だけ） */
  approveRequirements(projectId: string, by?: AnswerSide): Promise<void>;
}

export interface AccountsRepo {
  useClientAccounts(): Query<ClientAccount[]>;
  useDevUsers(): Query<DevUser[]>;
  /** 固定のメンバー＋登録した開発者（無効の人も含む） */
  useDevPeople(): Query<DevPerson[]>;
  useDevAccess(): Query<Record<string, boolean>>;
  useDevProjects(): Query<Record<string, string[]>>;
  saveClientAccount(account: ClientAccountDraft): Promise<void>;
  setClientAccountStatus(id: string, enabled: boolean): Promise<void>;
  setDevAccess(memberId: string, enabled: boolean): Promise<void>;
  saveDevUser(user: DevUserDraft): Promise<void>;
  setDevUserStatus(id: string, enabled: boolean): Promise<void>;
  setDevProjects(memberId: string, projectIds: string[]): Promise<void>;
}

export interface Repositories {
  projects: ProjectsRepo;
  requirements: RequirementsRepo;
  approvals: ApprovalsRepo;
  accounts: AccountsRepo;
}
