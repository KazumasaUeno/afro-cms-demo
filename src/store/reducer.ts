import type {
  Activity, AnswerValue, ApprovalLog, ClientAccount, CmsPage, DevUser, DemoState, DeployEnv, DesignId, DevState, DevTaskStatus, DiagnosisReport,
  AnswerSide, PageStatus, Project, QuestionPriority, RequirementMode, SignageState, SitemapEdge, SitemapNode, SitemapVariant, Slide,
} from '@/types';
import { QUALITY_CATEGORIES, QUALITY_ITEMS } from '@/data/quality';
import { nowIso } from '@/services/time';
import { sitemapCreated, sitemapFor } from '@/data/sitemap';
import { createSeedState } from './seed';
import { blankRequirements, blankWork, demoDesignApprovedAt, switchWork, workOf } from './projectWork';
import { syncDemoProject } from './demoProject';
import { DEV_ENVS, DEV_TASK_STATUSES, DEV_USER_ID, deployGate, seedDev } from '@/data/dev';
import { memberById } from '@/data/members';
import { clientActorName } from '@/data/projects';
import { devUsersState, personById } from '@/data/people';
import { REQUIREMENT_QUESTIONS } from '@/data/requirements';
import { DESIGN_QUESTIONS } from '@/data/designRequirements';
import { MODE_LABEL, pendingConfirmations, questionStatus } from '@/features/requirements/assignment';
import { isAnswered } from '@/features/requirements/validation';
import { DISPLAY_SLIDES_MAX, normalizeSlide, validateSlide } from '@/data/signage';
import {
  DEV_AFFILIATION, normalizeEmail, seedClientAccounts, seedDevAccess, seedDevProjects, validateClientAccount, validateDevUser,
  type ClientAccountDraft, type DevUserDraft,
} from '@/data/users';
import { applyProjectPatch, DEFAULT_NEXT_ACTION, projectFromDraft, projectPatchFromDraft, validateProject, type ProjectDraft } from '@/features/projects/projectForm';
import { followUpName } from '@/features/projects/followUp';
import { hasLiveVersion, pageDeleteBlock } from '@/features/cms/cmsUtils';
import { REPORT_SEND_HISTORY_MAX, reportRecipients, reportSendOf } from '@/data/reportSend';
import { withoutPage, withVersion } from '@/data/pageHistory';
import { ASSET_LIMITS, assetDeleteBlock, assetsOf, overStorageBudget, uploadCount, validateAssetName, validThumb } from '@/data/assets';
import { formsOf, validateForm, type FormDraft } from '@/data/forms';
import type { Asset, PageVersionKind } from '@/types';

/** 操作した側。省略時はアフロ（管理者画面）。お客様の画面（CMS・ポータル）からは client を渡す */
export type Side = AnswerSide;

export type Action =
  | { type: 'reset' }
  | { type: 'setCurrentProject'; id: string }
  /** 案件の情報の編集（管理者画面・demo だけ。2026-11-12）。id・段階・進捗・次の作業・承認待ちの数は変えない */
  | { type: 'updateProject'; id: string; project: ProjectDraft }
  /** 新しいプロジェクト（管理者画面）。要件定義・0% で作り、作業中のプロジェクトにする */
  | { type: 'createProject'; project: ProjectDraft }
  /**
   * 追加開発の案件を起こす（0.31.0。開発者画面のインサイトだけ）。改善の段階の案件の最新の AI 改善提案から 1 件以上を採用し、
   * 元の案件とつながった新しい案件（ヒアリングの回答を写す）を作って作業中にする。元の案件は変えない。
   * createProject とは別（URL の重複の検査は同じサイトなので当てはめない）
   */
  | { type: 'startFollowUp'; parentId: string; proposals: string[]; devBy?: string }
  /** by を省略するとアフロ（管理者画面）。お客様ポータルからは client */
  | { type: 'setAnswer'; questionId: string; value: AnswerValue; by?: Side }
  /** 回答の分担を切り替える（承認前のみ） */
  | { type: 'setRequirementMode'; mode: RequirementMode }
  /** 担当ではない側が入力した回答（代理回答）を、担当側が確認する */
  | { type: 'confirmAnswer'; questionId: string; by: Side }
  | { type: 'setCompetitors'; urls: string[] }
  | { type: 'completeAnalysis' }
  | { type: 'approveRequirements'; by?: Side }
  | { type: 'resetRequirements' }
  | { type: 'sendBackRequirements' }
  | { type: 'setSitemap'; variant: SitemapVariant; nodes: SitemapNode[]; edges: SitemapEdge[] }
  | { type: 'approveSitemap'; by?: Side }
  | { type: 'selectDesign'; id: DesignId }
  /** デザイン要件定義の回答（0.28.0）。デザインの採用・承認の後は変えない */
  | { type: 'setDesignAnswer'; questionId: string; value: AnswerValue }
  | { type: 'approveDesign'; by?: Side }
  | { type: 'startBuild' }
  | { type: 'completeBuild' }
  /** サイトの公開（0.30.1。開発者画面だけ）。品質チェックが双方とも済んだ案件を運用の段階へ進める */
  | { type: 'launchSite'; devBy?: string }
  // devBy: 開発者画面（0.27.0）で操作したメンバーの id。アフロ側の確認者をその人の名前で残す（省略時は従来どおり ACTOR）
  | { type: 'toggleQuality'; itemId: string; side: 'afro' | 'client'; devBy?: string }
  | { type: 'bulkQuality'; side: 'afro' | 'client'; priority: QuestionPriority | 'all'; categoryId?: string; devBy?: string }
  // devBy: 開発者画面（/dev/cms。0.27.0）で操作したメンバーの id（操作者の名前に使う。by より優先）
  // restoredFrom: 履歴の版を読み込んで保存したとき、その版の id（0.35.0。履歴に「復元して保存」と残す）
  | { type: 'savePage'; page: CmsPage; by?: Side; devBy?: string; restoredFrom?: string }
  | { type: 'setPageStatus'; id: string; status: PageStatus; scheduledAt?: string; by?: Side; devBy?: string }
  /** 承認ワークフロー: 承認依頼中のページを承認して公開する / コメントを付けて差し戻す */
  | { type: 'reviewPage'; id: string; decision: 'approve' | 'reject'; comment?: string; by?: Side }
  /**
   * ページ・お知らせの削除（0.33.0。2026-11-13 ユーザー指示）。下書き・承認待ちだけ。公開中・予約公開は先にお客様が公開を取り消す（下書きに戻す）。
   * トップページ（/）は消せない。ほかの案件のページは選んでいる案件ではないので触らない（state.pages は選んでいる案件の分）
   */
  | { type: 'deletePage'; id: string; by?: Side; devBy?: string }
  | { type: 'addDiagnosis'; report: Omit<DiagnosisReport, 'id' | 'at' | 'cycle'> }
  | { type: 'updateSettings'; patch: Partial<DemoState['settings']> }
  /**
   * 改善レポートの自動送信（0.34.0。選んでいる案件の分。開発者画面のインサイトから。管理者画面・お客様ポータルは見るだけ）。
   * オンの間は addDiagnosis のたびに送信の記録を残す。テスト送信は記録だけ残す（どちらも実際のメールは送らない）
   */
  | { type: 'setReportSend'; enabled: boolean; devBy?: string }
  | { type: 'testReportSend'; devBy?: string }
  /**
   * 素材ドライブ（0.36.0。選んでいる案件の分）。管理は開発者画面だけ（devBy が無ければ何もしない）。
   * 画像は縮小済みの JPEG（24KB 以下）だけ受け付け、資料は中身を持たない。件数・保存データの大きさの上限もここで確かめる
   */
  | { type: 'addAsset'; asset: Pick<Asset, 'name' | 'kind' | 'folder' | 'mime' | 'size' | 'src'>; devBy?: string }
  | { type: 'renameAsset'; id: string; name: string; folder: string; devBy?: string }
  | { type: 'deleteAsset'; id: string; devBy?: string }
  /**
   * フォーム管理（0.37.0。選んでいる案件の分）。フォームの作成・編集・受付の停止は開発者画面だけ（devBy）。
   * 受信した問い合わせの対応状況はお客様ポータルだけ（by: 'client'）。管理者画面は見るだけ
   */
  | { type: 'saveForm'; form: FormDraft; devBy?: string }
  | { type: 'setFormEnabled'; id: string; enabled: boolean; devBy?: string }
  | { type: 'setSubmissionStatus'; id: string; status: 'open' | 'done'; by?: Side; devBy?: string }
  /** 開発者画面（操作者は制作エンジニア） */
  // by: 操作したメンバーの id（ログイン中の人。省略時は DEV_USER_ID）
  | { type: 'setDevTaskStatus'; id: string; status: DevTaskStatus; by?: string }
  | { type: 'runAutoChecks'; by?: string }
  | { type: 'deploy'; env: DeployEnv; by?: string }
  /** デジタルサイネージ（お客様ポータル。操作者はお客様） */
  | { type: 'saveSlide'; slide: Slide }
  | { type: 'deleteSlide'; id: string }
  | { type: 'setDisplaySlides'; id: string; slideIds: string[] }
  | { type: 'deliverDisplay'; id: string }
  /** ユーザー管理（管理者画面）。id が無ければ新規登録（招待中で作る） */
  | { type: 'saveClientAccount'; account: ClientAccountDraft }
  | { type: 'setClientAccountStatus'; id: string; enabled: boolean }
  /** お客様ポータルに初めてログインしたとき（招待中 → 有効） */
  | { type: 'activateClientAccount'; email: string }
  | { type: 'setDevAccess'; memberId: string; enabled: boolean }
  /** 開発者が担当するプロジェクトをまとめて置き換える（存在しない id は捨て、重複は除く） */
  | { type: 'setDevProjects'; memberId: string; projectIds: string[] }
  /** 開発者の登録（id なし。権限オン・選んだ担当で作る）と編集（id あり。氏名・役割・メール・所属だけ） */
  | { type: 'saveDevUser'; user: DevUserDraft }
  /** 登録した開発者を無効にする / 有効に戻す（固定のメンバーは対象外） */
  | { type: 'setDevUserStatus'; id: string; enabled: boolean };

/** 操作した人の表示名（デモでは固定）。client は MINAMO COFFEE（p1）の担当者で、ほかの案件は clientActorOf を使う */
export const ACTOR = { afro: '上野 航', client: 'ミナモ珈琲 担当者' } as const;
/**
 * お客様側の操作者の表示名（案件ごと。既定は承認・制作データの持ち主の案件）。お客様の操作かどうかの判定にも使う。
 * 以前はどの案件でも「ミナモ珈琲 担当者」で残っていた（0.30.2。2026-11-13 ユーザー指示）。案件が見つからなければ従来の ACTOR.client。
 * 保存済みの記録は書き換えない（p1 は同じ文字列なので従来の記録もそのまま一致する）
 */
export function clientActorOf(state: DemoState, projectId: string = state.requirements.projectId): string {
  const p = state.projects.find((x) => x.id === projectId);
  return p ? clientActorName(p.clientName) : ACTOR.client;
}
/** 操作した側の表示名（アフロは ACTOR.afro、お客様はその案件の担当者） */
const actorOf = (state: DemoState, side: Side, projectId?: string) => (side === 'client' ? clientActorOf(state, projectId) : ACTOR.afro);
/** 承認したときにアクティビティへ残す文（管理者画面の「お客様の対応状況」が承認した人を探すのにも使う） */
export const APPROVE_TEXT = {
  requirements: '要件定義書を承認しました', sitemap: '改善後のサイトマップを承認しました', design: 'トップデザイン案を採用・承認しました',
} as const;
/** 開発者画面の操作者の名前（ログイン中の人。登録した開発者も含む。省略時・見つからないときは DEV_USER_ID） */
const devActor = (state: DemoState, by?: string) => (personById(state, by) ?? memberById(DEV_USER_ID)).name;
/** 品質チェックの確認者。開発者画面のアフロ側の確認はログイン中の開発者、それ以外は actorOf（顧客側は開発者画面から操作しない） */
const qualityActor = (state: DemoState, side: 'afro' | 'client', devBy?: string) => (side === 'afro' && devBy ? devActor(state, devBy) : actorOf(state, side));

let seq = 0;
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

function log(state: DemoState, text: string, kind: Activity['kind'], actor: string = ACTOR.afro, projectId: string = state.currentProjectId, side?: 'client'): DemoState {
  // その時点のお客様の担当者名で残した操作には、お客様側の印を付ける（0.30.3。呼び出し側は変えない）
  const a: Activity = { id: uid('act'), at: nowIso(), actor, text, kind, projectId, ...(side === 'client' || actor === clientActorOf(state, projectId) ? { side: 'client' as const } : {}) };
  return { ...state, activities: [a, ...state.activities].slice(0, 60) };
}

function approval(state: DemoState, side: 'afro' | 'client', action: string, target: string, actor: string = actorOf(state, side)): DemoState {
  // 承認の記録は後で示す証跡なので件数で消さない。承認の対象（要件・制作・品質・CMS）はデモのデータを持つ案件のもの
  const l: ApprovalLog = { id: uid('log'), at: nowIso(), actor, side, action, target, projectId: state.requirements.projectId };
  return { ...state, approvalLogs: [l, ...state.approvalLogs] };
}

/**
 * 承認などで、データの持ち主の案件の更新日時を進める（段階・進捗は syncDemoProject が導く）。
 * 要件・サイトマップ・デザインのデータの持ち主は requirements.projectId（選んでいる案件。ほかの案件の分は projectWork）。
 * それらの承認で進める案件は、データの持ち主にする
 */
function patchOwner(state: DemoState, patch: Partial<Project>): DemoState {
  const id = state.requirements.projectId;
  return {
    ...state,
    projects: state.projects.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: nowIso() } : p)),
  };
}

const modeOfReq = (state: DemoState): RequirementMode => state.requirements.mode ?? 'shared';

const STATUS_LABEL: Record<PageStatus, string> = { draft: '下書き保存', review: '承認依頼', scheduled: '予約公開', published: '公開' };

/** ページの状態を変える（公開時は公開版の内容を記録し、予約日時を整理する） */
function withStatus(page: CmsPage, status: PageStatus, scheduledAt?: string): CmsPage {
  const at = nowIso();
  return {
    ...page,
    status,
    updatedAt: at,
    ...(status === 'published' ? { publishedAt: at, publishedContent: page.content, scheduledAt: undefined } : {}),
    ...(status === 'scheduled' ? { scheduledAt } : { ...(status !== 'published' ? { scheduledAt: undefined } : {}) }),
  };
}

/** 改善レポートの送信の記録（選んでいる案件の分。宛先は送った時点のもの）とアクティビティを残す。実際のメールは送らない */
function recordReportSend(state: DemoState, kind: 'diagnosis' | 'test', by: string, cycle?: number): DemoState {
  const projectId = state.requirements.projectId;
  const cur = reportSendOf(state);
  const recipients = reportRecipients(clientAccountsState(state), state.projects.find((p) => p.id === projectId));
  const entry = { id: uid('send'), at: nowIso(), kind, recipients, by, ...(cycle ? { cycle } : {}) };
  const s = { ...state, reportSend: { ...cur, history: [entry, ...cur.history].slice(0, REPORT_SEND_HISTORY_MAX) } };
  const what = cycle ? `第${cycle}回の改善レポート` : '改善レポート';
  const to = recipients.map((r) => r.name).join('・');
  return log(s, kind === 'test' ? `${what}をテスト送信しました（宛先 ${to}・シミュレーション）` : `${what}を${to}へ自動送信しました（シミュレーション）`, kind === 'test' ? 'edit' : 'ai', by === '自動' ? 'AI' : by, projectId);
}

/** ページの履歴に 1 件残す（0.35.0。選んでいる案件の分。素材ドライブの画像は参照で残す） */
function recordVersion(state: DemoState, page: CmsPage, kind: PageVersionKind, by: string): DemoState {
  const pageHistory = withVersion(state.pageHistory, page, kind, by, nowIso(), uid('ver'), assetsOf(state).items);
  return pageHistory === state.pageHistory ? state : { ...state, pageHistory };
}

/** 段階・進捗・次の作業・承認待ちの数は、patchOwner で書かず syncDemoProject がデモのデータから導く */
export function reducer(state: DemoState, action: Action): DemoState {
  return syncDemoProject(baseReducer(state, action));
}

function baseReducer(state: DemoState, action: Action): DemoState {
  switch (action.type) {
    case 'reset':
      return createSeedState();

    case 'setCurrentProject':
      // 制作データ（ヒアリング〜品質チェック）も、選んだ案件の分へ入れ替える（0.29.0）
      return state.projects.some((p) => p.id === action.id) ? { ...switchWork(state, action.id), currentProjectId: action.id } : state;

    case 'createProject': {
      // 画面でも止めているが、不正な値・URL の重複はここでも作らない
      if (Object.keys(validateProject(action.project, state.projects)).length > 0) return state;
      const created: Project = { id: uid('p'), ...projectFromDraft(action.project), updatedAt: nowIso() };
      const s = { ...switchWork({ ...state, projects: [created, ...state.projects] }, created.id), currentProjectId: created.id };
      return log(s, `プロジェクト「${created.siteName}」（${created.clientName}）を作成しました`, 'edit', ACTOR.afro, created.id);
    }

    case 'startFollowUp': {
      // 起こせるのは改善の段階の案件だけ。採用する提案は、その案件の最新の診断の提案の中から 1 件以上（画面でも止めている）
      const parent = state.projects.find((p) => p.id === action.parentId);
      if (!parent || parent.stage !== 'improvement') return state;
      const parentWork = workOf(state, parent.id);
      const titles = new Set(parentWork.diagnoses[0]?.findings.map((f) => f.title) ?? []);
      const proposals = [...new Set(action.proposals)].filter((t) => titles.has(t));
      if (proposals.length === 0 || proposals.length !== new Set(action.proposals).size) return state;
      const created: Project = {
        id: uid('p'), clientName: parent.clientName, siteName: followUpName(parent, state.projects), siteUrl: parent.siteUrl, industry: parent.industry,
        stage: 'hearing', progress: 0, ownerId: parent.ownerId, updatedAt: nowIso(), nextAction: DEFAULT_NEXT_ACTION, accent: parent.accent,
        pendingApprovals: 0, parentProjectId: parent.id, adoptedProposals: proposals,
      };
      // ヒアリングの回答（回答者・分担・競合サイトを含む）だけを写す。AI 分析・承認・サイトマップ・デザイン・品質・公開後のデータは空から
      const src = parentWork.requirements;
      const work = blankWork(created.id);
      work.requirements = {
        ...work.requirements, answers: { ...src.answers }, competitors: [...src.competitors],
        ...(src.mode ? { mode: src.mode } : {}), answerMeta: { ...(src.answerMeta ?? {}) },
      };
      // 開発担当は元の案件の担当をそのまま引き継ぐ（作った開発者が開けるように）
      const devAll = devProjectsState(state);
      const devProjects = Object.fromEntries(Object.entries(devAll).map(([m, ids]) => [m, ids.includes(parent.id) ? [...ids, created.id] : ids]));
      const added: DemoState = {
        ...state, projects: [created, ...state.projects], projectWork: { ...(state.projectWork ?? {}), [created.id]: work }, devProjects,
      };
      const actor = action.devBy ? devActor(state, action.devBy) : ACTOR.afro;
      let s: DemoState = { ...switchWork(added, created.id), currentProjectId: created.id };
      s = log(s, `追加開発のプロジェクト「${created.siteName}」を作成しました（採用した改善提案 ${proposals.length}件）`, 'edit', actor, parent.id);
      return log(s, `「${parent.siteName}」の改善提案から追加開発を始めました（ヒアリングの回答を引き継ぎ）`, 'edit', actor, created.id);
    }

    case 'updateProject': {
      // 作成と同じ入力チェック（URL の重複は自分を除く）。不正な値・何も変わらない編集は受け付けない
      const prev = state.projects.find((p) => p.id === action.id);
      if (!prev || Object.keys(validateProject(action.project, state.projects, prev)).length > 0) return state;
      const next = applyProjectPatch(prev, projectPatchFromDraft(action.project));
      if (!next) return state;
      const updated: Project = { ...next, updatedAt: nowIso() };
      const s = { ...state, projects: state.projects.map((p) => (p.id === prev.id ? updated : p)) };
      return log(s, `プロジェクト「${updated.siteName}」（${updated.clientName}）の情報を更新しました`, 'edit', ACTOR.afro, prev.id);
    }

    case 'setAnswer': {
      // 回答を変えられるのは AI 分析の前だけ（分析後の「ヒアリングを確認」は閲覧だけ。2026-11-12 ユーザー指示。承認後も変えない）
      if (state.requirements.status !== 'draft') return state;
      const { answerMeta = {}, ...req } = state.requirements;
      const meta = { ...answerMeta };
      // 書き換えた人が新しい回答者になる（代理回答の確認は取り消し）。空にしたら記録も消す
      if (isAnswered(action.value)) meta[action.questionId] = { by: action.by ?? 'afro', at: nowIso() };
      else delete meta[action.questionId];
      // 競合サイトは提案書が competitors を読むため、回答と同じ値に揃える（表現を 1 つにする）
      const competitors = action.questionId === 'q-competitor' && Array.isArray(action.value) ? action.value : req.competitors;
      return { ...state, requirements: { ...req, competitors, answers: { ...req.answers, [action.questionId]: action.value }, answerMeta: meta } };
    }

    case 'setRequirementMode': {
      // 分担を変えられるのは回答の受付中（AI 分析前）だけ。分析後に変えると、回答済みの質問が確認待ちに変わってしまう
      if (state.requirements.status !== 'draft' || modeOfReq(state) === action.mode) return state;
      const s = { ...state, requirements: { ...state.requirements, mode: action.mode } };
      return log(s, `要件の回答の分担を「${MODE_LABEL[action.mode].label}」に切り替えました`, 'edit', ACTOR.afro, state.requirements.projectId);
    }

    case 'confirmAnswer': {
      const q = REQUIREMENT_QUESTIONS.find((x) => x.id === action.questionId);
      if (!q) return state;
      const st = questionStatus(q, state.requirements);
      // 確認できるのは、担当側が、確認待ちの代理回答を確認するときだけ
      if (st.state !== 'proxy' || st.assignee !== action.by || !st.meta) return state;
      const meta = { ...state.requirements.answerMeta, [q.id]: { ...st.meta, confirmedAt: nowIso() } };
      const s = { ...state, requirements: { ...state.requirements, answerMeta: meta } };
      return log(s, `回答「${q.text}」の内容を確認しました`, 'approve', actorOf(state, action.by), state.requirements.projectId);
    }

    case 'setCompetitors':
      return { ...state, requirements: { ...state.requirements, competitors: action.urls } };

    case 'completeAnalysis': {
      const s = { ...state, requirements: { ...state.requirements, status: 'analyzed' as const, analyzedAt: nowIso() } };
      return log(s, 'AI要件分析を完了し、改善提案書を作成しました', 'ai', 'AI', state.requirements.projectId);
    }

    case 'approveRequirements': {
      // 確認待ちの代理回答が残っている間は承認できない（画面でも止めている）
      if (state.requirements.status !== 'analyzed' || pendingConfirmations(state.requirements).length > 0) return state;
      const s = patchOwner(
        { ...state, requirements: { ...state.requirements, status: 'approved', approvedAt: nowIso() } },
        {},
      );
      // 承認の記録には実際に操作した人を残す（アフロが代わりに承認した場合はアフロの名前）
      const approved = log(approval(s, 'client', '要件定義書を承認', '要件定義', actorOf(state, action.by ?? 'afro')), APPROVE_TEXT.requirements, 'approve', actorOf(state, action.by ?? 'afro'), state.requirements.projectId);
      // サイトマップは初めは無く、要件定義書の承認のときに作る（0.29.4。2026-11-12 ユーザー指示）
      if (sitemapCreated(approved.sitemap)) return approved;
      return log({ ...approved, sitemap: sitemapFor(state.requirements.projectId) }, 'AI がサイトマップ案を作成しました', 'ai', 'AI', state.requirements.projectId);
    }

    case 'sendBackRequirements': {
      // 差し戻す: AI 分析済み（承認待ち）からヒアリングの入力へ戻す。回答は残す（live の差し戻しと同じ。0.29.3）
      if (state.requirements.status !== 'analyzed') return state;
      const { analyzedAt: _analyzedAt, ...req } = state.requirements;
      return log({ ...state, requirements: { ...req, status: 'draft' } }, 'ヒアリングを差し戻し、入力に戻しました', 'edit', ACTOR.afro, state.requirements.projectId);
    }

    case 'resetRequirements':
      // 承認後はやり直せない（後ろの段階の承認が残り、表示が食い違うため。回答の変更を止めるのと同じ方針）
      if (state.requirements.status === 'approved') return state;
      return { ...state, requirements: { ...blankRequirements(state.requirements.projectId), mode: state.requirements.mode } };

    case 'setSitemap':
      // お客様の承認後は構造を変えない（管理者・開発者とも。2026-11-11 ユーザー判断。ページの追加・削除・移動・接続・名前の変更はすべてこの action を通る）
      if (state.sitemap.approvedAt || !sitemapCreated(state.sitemap)) return state;
      return { ...state, sitemap: { ...state.sitemap, [action.variant]: { nodes: action.nodes, edges: action.edges } } };

    case 'approveSitemap': {
      // ウォーターフォール: 要件定義書の承認の後だけ（画面でも止めている）
      if (state.requirements.status !== 'approved' || state.sitemap.approvedAt || !sitemapCreated(state.sitemap)) return state;
      const s = patchOwner({ ...state, sitemap: { ...state.sitemap, approvedAt: nowIso() } }, {});
      return log(approval(s, 'client', 'サイトマップを承認', '制作 / サイトマップ', actorOf(state, action.by ?? 'afro')), APPROVE_TEXT.sitemap, 'approve', actorOf(state, action.by ?? 'afro'), state.requirements.projectId);
    }

    case 'selectDesign':
      return { ...state, design: { ...state.design, selected: action.id } };

    case 'setDesignAnswer': {
      // 採用・承認の後は変えない（承認した案の前提が変わるため。ヒアリングの承認後と同じ方針）。収録していない質問は受け付けない
      if (state.design.approvedAt || !DESIGN_QUESTIONS.some((q) => q.id === action.questionId)) return state;
      const meta = { ...(state.design.answerMeta ?? {}) };
      if (isAnswered(action.value)) meta[action.questionId] = { by: 'afro', at: nowIso() };
      else delete meta[action.questionId];
      return { ...state, design: { ...state.design, answers: { ...(state.design.answers ?? {}), [action.questionId]: action.value }, answerMeta: meta } };
    }

    case 'approveDesign': {
      if (!state.design.selected || !state.sitemap.approvedAt) return state;
      const s = patchOwner({ ...state, design: { ...state.design, approvedAt: nowIso() } }, {});
      return log(approval(s, 'client', 'トップデザインを承認', `制作 / デザイン（${state.design.selected}）`, actorOf(state, action.by ?? 'afro')), APPROVE_TEXT.design, 'approve', actorOf(state, action.by ?? 'afro'), state.requirements.projectId);
    }

    case 'startBuild':
      if (!state.design.approvedAt) return state;
      return { ...state, design: { ...state.design, buildStartedAt: nowIso() } };

    case 'completeBuild': {
      if (!state.design.approvedAt) return state;
      const s = patchOwner({ ...state, design: { ...state.design, buildCompletedAt: nowIso() } }, {});
      return log(s, '採用デザインをもとに全 9 ページを構築しました（シミュレーション）', 'ai', 'AI', state.requirements.projectId);
    }

    case 'launchSite': {
      // 品質チェックの段階から運用へ進める手段が無かった（2026-11-13 ユーザー指示「残課題を進めて」。0.30.1）。
      // 運用・改善は制作データから導けないので、ここで段階を書き、以後は syncDemoProject が保つ（buildCompletedAt がある間）
      const id = state.requirements.projectId;
      const owner = state.projects.find((p) => p.id === id);
      if (id !== state.currentProjectId || owner?.stage !== 'quality' || !state.design.buildCompletedAt) return state;
      if (!QUALITY_ITEMS.every((i) => state.qualityChecks[i.id]?.afroAt && state.qualityChecks[i.id]?.clientAt)) return state;
      const s = patchOwner(state, { stage: 'operation', progress: 88, nextAction: 'ページ・お知らせを更新する' });
      return log(s, 'サイトを公開しました（運用の段階へ）', 'publish', action.devBy ? devActor(state, action.devBy) : ACTOR.afro, id);
    }

    case 'toggleQuality': {
      const prev = state.qualityChecks[action.itemId] ?? {};
      const atKey = action.side === 'afro' ? 'afroAt' : 'clientAt';
      const byKey = action.side === 'afro' ? 'afroBy' : 'clientBy';
      const actor = qualityActor(state, action.side, action.devBy);
      const next = prev[atKey]
        ? { ...prev, [atKey]: undefined, [byKey]: undefined }
        : { ...prev, [atKey]: nowIso(), [byKey]: actor };
      const item = QUALITY_ITEMS.find((i) => i.id === action.itemId);
      const s = { ...state, qualityChecks: { ...state.qualityChecks, [action.itemId]: next } };
      return item ? approval(s, action.side, prev[atKey] ? 'チェックを取り消し' : 'チェック', item.text, actor) : s;
    }

    case 'bulkQuality': {
      const at = nowIso();
      const atKey = action.side === 'afro' ? 'afroAt' : 'clientAt';
      const byKey = action.side === 'afro' ? 'afroBy' : 'clientBy';
      const targets = QUALITY_ITEMS.filter(
        (i) => (action.priority === 'all' || i.priority === action.priority) && (!action.categoryId || i.categoryId === action.categoryId),
      );
      const actor = qualityActor(state, action.side, action.devBy);
      const checks = { ...state.qualityChecks };
      let count = 0;
      for (const t of targets) {
        if (checks[t.id]?.[atKey]) continue;
        checks[t.id] = { ...checks[t.id], [atKey]: at, [byKey]: actor };
        count++;
      }
      if (count === 0) return state;
      const cat = QUALITY_CATEGORIES.find((c) => c.id === action.categoryId);
      const label = action.priority === 'all' ? '全項目' : `${action.priority}区分`;
      const s = approval({ ...state, qualityChecks: checks }, action.side, `${label}を一括チェック（${count}件）`, cat ? `${cat.no}. ${cat.title}` : '全カテゴリ', actor);
      return log(s, `品質チェック ${label} ${count}件を一括チェック`, 'check', actor);
    }

    case 'savePage': {
      const exists = state.pages.some((p) => p.id === action.page.id);
      const actor = action.devBy ? devActor(state, action.devBy) : actorOf(state, action.by ?? 'afro');
      // 最後に保存・状態を変えた人をページにも持つ（エディタの「保存済み・○○」が作成者のままで、ポータルから保存しても「上野 航」と出ていた。0.30.2・2026-11-13 ユーザー指示）
      const page = { ...action.page, updatedAt: nowIso(), updatedBy: actor };
      const pages = exists ? state.pages.map((p) => (p.id === page.id ? page : p)) : [page, ...state.pages];
      const restored = !!action.restoredFrom && exists;
      const s = recordVersion({ ...state, pages }, page, !exists ? 'create' : restored ? 'restore' : 'save', actor);
      return log(s, `「${page.title}」を${!exists ? '作成' : restored ? '以前の版から復元して保存' : '保存'}しました`, 'edit', actor);
    }

    case 'setPageStatus': {
      const page = state.pages.find((p) => p.id === action.id);
      if (!page) return state;
      // 公開・予約公開はお客様の操作。開発者画面からは下書き・承認依頼だけ（画面でも出さない。0.27.0）
      if (action.devBy && (action.status === 'published' || action.status === 'scheduled')) return state;
      // 公開中の版があるページを下書きに戻す = 公開の取り消し（0.33.0）。お客様の操作なので開発者画面からは受け付けない。
      // 公開版（publishedContent・publishedAt）も消して「下書き = 公開されていない」にする（削除の前に行う）
      const unpublish = action.status === 'draft' && hasLiveVersion(page);
      if (unpublish && action.devBy) return state;
      const actor = action.devBy ? devActor(state, action.devBy) : actorOf(state, action.by ?? 'afro');
      const base = withStatus(page, action.status, action.scheduledAt);
      const updated = { ...(unpublish ? { ...base, publishedContent: undefined, publishedAt: undefined } : base), updatedBy: actor };
      const vkind: PageVersionKind = unpublish ? 'unpublish' : action.status === 'published' ? 'publish' : action.status === 'scheduled' ? 'schedule' : action.status === 'review' ? 'review' : 'save';
      const s = recordVersion({ ...state, pages: state.pages.map((p) => (p.id === page.id ? updated : p)) }, updated, vkind, actor);
      const kind: Activity['kind'] = action.status === 'published' || action.status === 'scheduled' ? 'publish' : 'edit';
      // 公開中・予約公開を下書きに戻すのは「公開の取り消し」（0.33.0。削除の前にお客様が行う）
      if (unpublish) {
        return log(s, `「${page.title}」の${page.status === 'scheduled' && !page.publishedContent ? '予約公開' : '公開'}を取り消しました（下書きに戻しました）`, 'publish', actor);
      }
      return log(s, `「${page.title}」を${STATUS_LABEL[action.status]}しました`, kind, actor);
    }

    case 'reviewPage': {
      const page = state.pages.find((p) => p.id === action.id);
      if (!page || page.status !== 'review') return state;
      const side = action.by ?? 'afro';
      const approve = action.decision === 'approve';
      const actor = actorOf(state, side);
      const updated = { ...withStatus(page, approve ? 'published' : 'draft'), updatedBy: actor };
      const paged = { ...state, pages: state.pages.map((p) => (p.id === page.id ? updated : p)) };
      const s = approval(
        approve ? recordVersion(paged, updated, 'publish', actor) : paged,
        side, approve ? '承認して公開' : '差し戻し', `CMS / ${page.title}`, actor,
      );
      const note = action.comment?.trim();
      return approve
        ? log(s, `「${page.title}」を承認して公開しました`, 'publish', actor)
        : log(s, `「${page.title}」を差し戻しました${note ? `（${note}）` : ''}`, 'comment', actor);
    }

    case 'deletePage': {
      const page = state.pages.find((p) => p.id === action.id);
      // 画面でも止めているが、公開中・予約公開・トップページはここでも消さない
      if (!page || pageDeleteBlock(page, !!action.devBy)) return state;
      const actor = action.devBy ? devActor(state, action.devBy) : actorOf(state, action.by ?? 'afro');
      const kind = page.type === 'news' ? 'お知らせ' : 'ページ';
      const note = page.status === 'review' ? '（承認待ちを取り下げ）' : '';
      // 消したページの履歴も消す（0.35.0）
      const pageHistory = withoutPage(state.pageHistory, page.id);
      return log({ ...state, pages: state.pages.filter((p) => p.id !== page.id), ...(pageHistory !== state.pageHistory ? { pageHistory } : {}) }, `${kind}「${page.title}」を削除しました${note}`, 'edit', actor);
    }

    case 'addDiagnosis': {
      const report: DiagnosisReport = { ...action.report, id: uid('diag'), at: nowIso(), cycle: state.diagnoses.length + 1 };
      let s = log({ ...state, diagnoses: [report, ...state.diagnoses] }, `第${report.cycle}回 AIサイト診断を作成（スコア ${report.score}・デモデータ）`, 'ai', 'AI');
      // 自動送信がオンなら、診断の後にお客様へ送った記録を残す（0.34.0。実際のメールは送らない）
      if (reportSendOf(state).enabled) s = recordReportSend(s, 'diagnosis', '自動', report.cycle);
      // 運用の段階の案件は、最初の診断で改善の段階へ進める（運用から先へ進む手段が無かった。2026-11-13 ユーザー指示。0.30.1）
      const ownerId = state.requirements.projectId;
      if (state.projects.find((p) => p.id === ownerId)?.stage === 'operation') {
        s = patchOwner(s, { stage: 'improvement', progress: 100, nextAction: '改善の提案を確認する' });
        s = log(s, 'AIサイト診断の結果をもとに改善の段階へ進みました', 'ai', 'AI', ownerId);
      }
      return s;
    }

    case 'updateSettings':
      return { ...state, settings: { ...state.settings, ...action.patch } };

    case 'setReportSend': {
      // 設定は開発者画面だけ（管理者画面・お客様ポータルは見るだけ。画面でも出さない）
      if (!action.devBy) return state;
      const cur = reportSendOf(state);
      if (cur.enabled === action.enabled) return state;
      const actor = devActor(state, action.devBy);
      const s = { ...state, reportSend: { ...cur, enabled: action.enabled, updatedAt: nowIso(), updatedBy: actor } };
      return log(s, `改善レポートの自動送信を${action.enabled ? 'オン' : 'オフ'}にしました`, 'edit', actor, state.requirements.projectId);
    }

    case 'testReportSend':
      if (!action.devBy) return state;
      return recordReportSend(state, 'test', devActor(state, action.devBy), state.diagnoses[0]?.cycle);

    case 'addAsset': {
      if (!action.devBy) return state;
      const a = action.asset;
      const items = assetsOf(state).items;
      const name = a.name.trim();
      const folder = a.folder.trim();
      if (validateAssetName(name, folder) || uploadCount(items) >= ASSET_LIMITS.uploads) return state;
      if (a.kind === 'image' ? !validThumb(a.src) : a.src !== undefined) return state;
      // 保存データが上限を超えるなら受け付けない（画面では先に確かめてエラーを出す）
      if (overStorageBudget(state, (a.src?.length ?? 0) + 300)) return state;
      const actor = devActor(state, action.devBy);
      const asset: Asset = { id: uid('asset'), name, kind: a.kind, folder, mime: a.mime, size: a.size, ...(a.src ? { src: a.src } : {}), createdAt: nowIso(), createdBy: actor };
      return log({ ...state, assets: { items: [asset, ...items] } }, `素材「${name}」をアップロードしました`, 'edit', actor, state.requirements.projectId);
    }

    case 'renameAsset': {
      if (!action.devBy) return state;
      const items = assetsOf(state).items;
      const cur = items.find((x) => x.id === action.id);
      const name = action.name.trim();
      const folder = action.folder.trim();
      if (!cur || validateAssetName(name, folder) || (cur.name === name && cur.folder === folder)) return state;
      const actor = devActor(state, action.devBy);
      const s = { ...state, assets: { items: items.map((x) => (x.id === cur.id ? { ...x, name, folder } : x)) } };
      return log(s, cur.name === name ? `素材「${cur.name}」をフォルダ「${folder || 'なし'}」へ移しました` : `素材「${cur.name}」の名前を「${name}」に変更しました`, 'edit', actor, state.requirements.projectId);
    }

    case 'deleteAsset': {
      if (!action.devBy) return state;
      const items = assetsOf(state).items;
      const cur = items.find((x) => x.id === action.id);
      // 公開中のページで使っている素材は消さない（画面でも止めている）
      if (!cur || assetDeleteBlock(cur, state.pages)) return state;
      const actor = devActor(state, action.devBy);
      return log({ ...state, assets: { items: items.filter((x) => x.id !== cur.id) } }, `素材「${cur.name}」を削除しました`, 'edit', actor, state.requirements.projectId);
    }

    case 'saveForm': {
      if (!action.devBy) return state;
      const cur = formsOf(state);
      if (Object.keys(validateForm(action.form, cur.forms)).length > 0) return state;
      const prev = action.form.id ? cur.forms.find((f) => f.id === action.form.id) : undefined;
      if (action.form.id && !prev) return state;
      const actor = devActor(state, action.devBy);
      const f = action.form;
      const form = {
        id: prev?.id ?? uid('form'), name: f.name.trim(), enabled: prev?.enabled ?? true, updatedAt: nowIso(), updatedBy: actor,
        recipients: f.recipients.map((r) => normalizeEmail(r)).filter(Boolean),
        fields: f.fields.map((x) => ({
          id: x.id || uid('fld'), label: x.label.trim(), type: x.type, required: x.required,
          ...(x.type === 'select' ? { options: (x.options ?? []).map((o) => o.trim()).filter(Boolean) } : {}),
        })),
      };
      const forms = prev ? cur.forms.map((x) => (x.id === prev.id ? form : x)) : [...cur.forms, form];
      return log({ ...state, forms: { ...cur, forms } }, `フォーム「${form.name}」を${prev ? '保存' : '作成'}しました`, 'edit', actor, state.requirements.projectId);
    }

    case 'setFormEnabled': {
      if (!action.devBy) return state;
      const cur = formsOf(state);
      const form = cur.forms.find((f) => f.id === action.id);
      if (!form || form.enabled === action.enabled) return state;
      const actor = devActor(state, action.devBy);
      const forms = cur.forms.map((f) => (f.id === form.id ? { ...f, enabled: action.enabled, updatedAt: nowIso(), updatedBy: actor } : f));
      return log({ ...state, forms: { ...cur, forms } }, `フォーム「${form.name}」の受付を${action.enabled ? '再開' : '停止'}しました`, 'edit', actor, state.requirements.projectId);
    }

    case 'setSubmissionStatus': {
      // 問い合わせへの対応はお客様の業務なので、お客様ポータルからだけ受け付ける（開発者画面・管理者画面は見るだけ）
      if (action.devBy || action.by !== 'client') return state;
      const cur = formsOf(state);
      const sub = cur.submissions.find((x) => x.id === action.id);
      if (!sub || sub.status === action.status) return state;
      const actor = actorOf(state, 'client');
      const done = action.status === 'done';
      const submissions = cur.submissions.map((x) => {
        if (x.id !== sub.id) return x;
        const { handledBy: _by, handledAt: _at, ...rest } = x;
        return done ? { ...rest, status: 'done' as const, handledBy: actor, handledAt: nowIso() } : { ...rest, status: 'open' as const };
      });
      const form = cur.forms.find((f) => f.id === sub.formId);
      return log({ ...state, forms: { ...cur, submissions } }, `「${form?.name ?? 'フォーム'}」の問い合わせを${done ? '対応済み' : '未対応'}にしました`, 'edit', actor, state.requirements.projectId);
    }

    case 'setDevTaskStatus': {
      const dev = devState(state);
      const task = dev.tasks.find((t) => t.id === action.id);
      if (!task || task.status === action.status) return state;
      const tasks = dev.tasks.map((t) => (t.id === task.id ? { ...t, status: action.status, updatedAt: nowIso() } : t));
      const label = DEV_TASK_STATUSES.find((x) => x.id === action.status)?.label ?? action.status;
      return log({ ...state, dev: { ...dev, tasks } }, `構築タスク「${task.title}」を${label}にしました`, 'edit', devActor(state, action.by));
    }

    case 'runAutoChecks': {
      const at = nowIso();
      const dev = devState(state);
      const checks = { ...state.qualityChecks };
      let count = 0;
      for (const t of QUALITY_ITEMS) {
        if (t.priority !== 'A' || checks[t.id]?.afroAt) continue;
        checks[t.id] = { ...checks[t.id], afroAt: at, afroBy: devActor(state, action.by) };
        count++;
      }
      let s: DemoState = { ...state, qualityChecks: checks, dev: { ...dev, checksRunAt: at } };
      // 新たに確認した項目が無い再実行は、実行日時だけ更新する（アクティビティに「0件」を積まない）
      if (count === 0) return s;
      s = approval(s, 'afro', `自動チェックで A区分を確認（${count}件）`, '全カテゴリ', devActor(state, action.by));
      return log(s, `自動チェックを実行しました（A区分 ${count}件を新たに確認・シミュレーション）`, 'check', devActor(state, action.by));
    }

    case 'deploy': {
      const dev = devState(state);
      const gate = deployGate(dev, action.env, demoDesignApprovedAt(state));
      if (!gate.ok || !gate.version) return state;
      const env = DEV_ENVS.find((e) => e.id === action.env);
      const note = action.env === 'development' ? '最新の作業内容を反映' : `v${gate.version} を${action.env === 'staging' ? '開発環境' : '検証環境'}から昇格`;
      const deploy = { id: uid('dep'), env: action.env, version: gate.version, at: nowIso(), by: devActor(state, action.by), status: 'success' as const, note };
      const s: DemoState = { ...state, dev: { ...dev, deploys: [deploy, ...dev.deploys].slice(0, 50) } };
      return log(s, `${env?.label ?? action.env}へ v${gate.version} をデプロイしました（シミュレーション）`, 'publish', devActor(state, action.by));
    }

    case 'saveSlide': {
      // 画面でも止めているが、不正な値はここでも保存しない
      if (Object.keys(validateSlide(action.slide)).length > 0) return state;
      const sg = signageState(state);
      const exists = sg.slides.some((x) => x.id === action.slide.id);
      const prev = sg.slides.find((x) => x.id === action.slide.id);
      const normalized = normalizeSlide(action.slide);
      // 何も変えずに保存したときは更新日時を進めない（進めると配信済みの端末が「未配信の変更あり」になる）
      if (prev && JSON.stringify({ ...normalized, updatedAt: '' }) === JSON.stringify({ ...normalizeSlide(prev), updatedAt: '' })) return state;
      const slide = { ...normalized, updatedAt: nowIso() };
      const slides = exists ? sg.slides.map((x) => (x.id === slide.id ? slide : x)) : [slide, ...sg.slides];
      return log({ ...state, signage: { ...sg, slides } }, `サイネージのコンテンツ「${slide.title}」を${exists ? '保存' : '作成'}しました`, 'edit', clientActorOf(state), state.requirements.projectId);
    }

    case 'deleteSlide': {
      const sg = signageState(state);
      const slide = sg.slides.find((x) => x.id === action.id);
      if (!slide) return state;
      // 編集中の再生順からは外す。配信済みの内容（写し）は残し、再配信するまで端末は流し続ける
      const displays = sg.displays.map((d) => (d.slideIds.includes(slide.id) ? { ...d, slideIds: d.slideIds.filter((id) => id !== slide.id) } : d));
      const s = { ...state, signage: { displays, slides: sg.slides.filter((x) => x.id !== slide.id) } };
      return log(s, `サイネージのコンテンツ「${slide.title}」を削除しました`, 'edit', clientActorOf(state), state.requirements.projectId);
    }

    case 'setDisplaySlides': {
      const sg = signageState(state);
      const display = sg.displays.find((d) => d.id === action.id);
      if (!display) return state;
      // 存在しない id・重複は落とす
      const known = new Set(sg.slides.map((x) => x.id));
      const ids = [...new Set(action.slideIds)].filter((id) => known.has(id)).slice(0, DISPLAY_SLIDES_MAX);
      if (ids.length === display.slideIds.length && ids.every((id, i) => id === display.slideIds[i])) return state;
      const displays = sg.displays.map((d) => (d.id === display.id ? { ...d, slideIds: ids } : d));
      return log({ ...state, signage: { ...sg, displays } }, `サイネージ「${display.name}」の再生内容を変更しました`, 'edit', clientActorOf(state), state.requirements.projectId);
    }

    case 'deliverDisplay': {
      const sg = signageState(state);
      const display = sg.displays.find((d) => d.id === action.id);
      if (!display) return state;
      // 配信時点のスライドを写して持つ（配信後の編集・削除は、次の配信まで端末に届かない）
      const delivered = display.slideIds
        .map((id) => sg.slides.find((x) => x.id === id))
        .filter((x): x is Slide => !!x);
      const at = nowIso();
      const displays = sg.displays.map((d) => (d.id === display.id ? {
        ...d,
        deliveredSlideIds: delivered.map((x) => x.id),
        deliveredSlides: Object.fromEntries(delivered.map((x) => [x.id, x])),
        deliveredAt: at,
      } : d));
      const note = display.online ? '' : '（オフラインのため、オンラインになったら反映・シミュレーション）';
      return log({ ...state, signage: { ...sg, displays } }, `サイネージ「${display.name}」へ ${delivered.length} 件を配信しました${note}`, 'publish', clientActorOf(state), state.requirements.projectId);
    }

    case 'saveClientAccount': {
      const accounts = clientAccountsState(state);
      // 画面でも止めているが、不正な値・重複はここでも保存しない
      if (Object.keys(validateClientAccount(action.account, accounts, state.projects)).length > 0) return state;
      const a = action.account;
      const fields = { company: a.company.trim(), name: a.name.trim(), email: normalizeEmail(a.email), projectId: a.projectId };
      const prev = a.id ? accounts.find((x) => x.id === a.id) : undefined;
      if (a.id && !prev) return state;
      if (prev) {
        if ((Object.keys(fields) as (keyof typeof fields)[]).every((k) => prev[k] === fields[k])) return state;
        // メールアドレスを変えたら、新しいアドレスでのログインはまだなので「招待中」に戻す（無効はそのまま）
        const reinvite = prev.email !== fields.email && prev.status === 'active';
        const next = accounts.map((x) => (x.id === prev.id ? { ...x, ...fields, ...(reinvite ? { status: 'invited' as const, activatedAt: undefined } : {}) } : x));
        return log({ ...state, clientAccounts: next }, `お客様「${fields.company} ${fields.name}」の登録内容を変更しました`, 'edit', ACTOR.afro, fields.projectId);
      }
      const created: ClientAccount = { id: uid('ca'), ...fields, status: 'invited', createdAt: nowIso() };
      return log({ ...state, clientAccounts: [created, ...accounts] }, `お客様「${fields.company} ${fields.name}」を登録し、招待メールを送信しました（デモ: 実際には送信しない）`, 'edit', ACTOR.afro, fields.projectId);
    }

    case 'setClientAccountStatus': {
      const accounts = clientAccountsState(state);
      const prev = accounts.find((x) => x.id === action.id);
      if (!prev || (prev.status === 'disabled') === !action.enabled) return state;
      // 有効に戻すときは、ログインしたことがあれば「有効」、まだなら「招待中」に戻す
      const updated: ClientAccount = action.enabled
        ? { ...prev, status: prev.activatedAt ? 'active' : 'invited', disabledAt: undefined }
        : { ...prev, status: 'disabled', disabledAt: nowIso() };
      const s = { ...state, clientAccounts: accounts.map((x) => (x.id === prev.id ? updated : x)) };
      return log(s, `お客様「${prev.company} ${prev.name}」を${action.enabled ? '有効に戻しました' : '無効にしました'}`, 'edit', ACTOR.afro, prev.projectId);
    }

    case 'activateClientAccount': {
      const accounts = clientAccountsState(state);
      const email = normalizeEmail(action.email);
      const prev = accounts.find((x) => x.email === email);
      if (!prev || prev.status !== 'invited') return state;
      const s = { ...state, clientAccounts: accounts.map((x) => (x.id === prev.id ? { ...x, status: 'active' as const, activatedAt: nowIso() } : x)) };
      // 担当者の名前で残すので、お客様側の印を明示する（0.30.4。「お客様の対応状況」の最後の操作に数える）
      return log(s, `お客様ポータルに初めてログインしました（${prev.company}）`, 'edit', prev.name, prev.projectId, 'client');
    }

    case 'setDevAccess': {
      const access = devAccessState(state);
      const member = personById(state, action.memberId);
      if (!member || !!access[member.id] === action.enabled) return state;
      const s = { ...state, devAccess: { ...access, [member.id]: action.enabled } };
      return log(s, `${member.name}の開発者画面の権限を${action.enabled ? '追加しました' : '外しました'}`, 'edit', ACTOR.afro);
    }

    case 'setDevProjects': {
      const all = devProjectsState(state);
      const member = personById(state, action.memberId);
      if (!member) return state;
      // プロジェクト一覧の並び順にそろえる（存在しない id は捨て、重複は除く）
      const ids = state.projects.filter((p) => action.projectIds.includes(p.id)).map((p) => p.id);
      const prev = all[member.id] ?? [];
      if (prev.length === ids.length && prev.every((id, i) => id === ids[i])) return state;
      const names = ids.map((id) => state.projects.find((p) => p.id === id)?.siteName).join('・');
      const s = { ...state, devProjects: { ...all, [member.id]: ids } };
      return log(s, ids.length ? `${member.name}の担当プロジェクトを「${names}」にしました` : `${member.name}の担当プロジェクトをすべて外しました`, 'edit', ACTOR.afro);
    }

    case 'saveDevUser': {
      const users = devUsersState(state);
      const accounts = clientAccountsState(state);
      // 画面でも止めているが、不正な値・重複はここでも保存しない
      if (Object.keys(validateDevUser(action.user, users, accounts)).length > 0) return state;
      const d = action.user;
      const partner = d.affiliation === 'partner';
      const fields = {
        name: d.name.trim(), role: d.role.trim(), email: normalizeEmail(d.email), affiliation: d.affiliation,
        partnerCompany: partner ? d.partnerCompany.trim() : undefined,
      };
      const where = partner ? `${DEV_AFFILIATION.partner}・${fields.partnerCompany}` : DEV_AFFILIATION.internal;
      if (d.id) {
        const prev = users.find((u) => u.id === d.id);
        if (!prev) return state;
        if ((Object.keys(fields) as (keyof typeof fields)[]).every((k) => prev[k] === fields[k])) return state;
        const next = users.map((u) => (u.id === prev.id ? { ...u, ...fields } : u));
        return log({ ...state, devUsers: next }, `開発者「${fields.name}」の登録内容を変更しました（${where}）`, 'edit', ACTOR.afro);
      }
      const created: DevUser = { id: uid('du'), ...fields, status: 'active', createdAt: nowIso() };
      if (!partner) delete created.partnerCompany;
      // 担当はプロジェクト一覧の並び順にそろえる（存在しない id は捨て、重複は除く）
      const ids = state.projects.filter((p) => d.projectIds.includes(p.id)).map((p) => p.id);
      const s: DemoState = {
        ...state,
        devUsers: [...users, created],
        devAccess: { ...devAccessState(state), [created.id]: true },
        devProjects: { ...devProjectsState(state), [created.id]: ids },
      };
      return log(s, `開発者「${created.name}」を登録しました（${where}・担当 ${ids.length}件）`, 'edit', ACTOR.afro);
    }

    case 'setDevUserStatus': {
      const users = devUsersState(state);
      const prev = users.find((u) => u.id === action.id);
      if (!prev || (prev.status === 'disabled') === !action.enabled) return state;
      const updated: DevUser = action.enabled
        ? { ...prev, status: 'active', disabledAt: undefined }
        : { ...prev, status: 'disabled', disabledAt: nowIso() };
      const s = { ...state, devUsers: users.map((u) => (u.id === prev.id ? updated : u)) };
      return log(s, `開発者「${prev.name}」を${action.enabled ? '有効に戻しました' : '無効にしました'}`, 'edit', ACTOR.afro);
    }

    default:
      return state;
  }
}

/** お客様アカウント（0.13.0 より前の保存データには無いので初期値で補う。描画のたびに作り直さないよう 1 回だけ作る） */
let clientAccountsFallback: ClientAccount[] | null = null;
export function clientAccountsState(state: DemoState): ClientAccount[] {
  return state.clientAccounts ?? (clientAccountsFallback ??= seedClientAccounts());
}

/** 開発者画面の権限（0.13.0 より前の保存データには無いので初期値で補う） */
let devAccessFallback: Record<string, boolean> | null = null;
export function devAccessState(state: DemoState): Record<string, boolean> {
  return state.devAccess ?? (devAccessFallback ??= seedDevAccess());
}

/** 開発者の担当プロジェクト（0.14.0 より前の保存データには無いので初期値で補う。描画のたびに作り直さないよう 1 回だけ作る） */
let devProjectsFallback: Record<string, string[]> | null = null;
export function devProjectsState(state: DemoState): Record<string, string[]> {
  return state.devProjects ?? (devProjectsFallback ??= seedDevProjects());
}

/**
 * サイネージのデータ（選んでいる案件の分）。0.30.0 から読み込み時に必ず入れる（DemoStore の withProjectContent）ので、無いときは空にする
 * （MINAMO COFFEE の見本を出すと、ほかの案件に MINAMO の画面が出てしまう）。描画のたびに作り直すとタイマーが毎回やり直しになるので 1 回だけ作る
 */
let signageFallback: SignageState | null = null;
export function signageState(state: DemoState): SignageState {
  return state.signage ?? (signageFallback ??= { displays: [], slides: [] });
}

/** 開発者画面のデータ（0.5.0 より前の保存データには無いので初期値で補う） */
export function devState(state: DemoState): DevState {
  return state.dev ?? seedDev();
}

export function currentProject(state: DemoState): Project {
  return state.projects.find((p) => p.id === state.currentProjectId) ?? state.projects[0];
}
