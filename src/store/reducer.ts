import type {
  Activity, AnswerValue, ApprovalLog, ClientAccount, CmsPage, DevUser, DemoState, DeployEnv, DesignId, DevState, DevTaskStatus, DiagnosisReport,
  AnswerSide, PageStatus, Project, QuestionPriority, RequirementMode, SignageState, SitemapEdge, SitemapNode, SitemapVariant, Slide,
} from '@/types';
import { QUALITY_CATEGORIES, QUALITY_ITEMS } from '@/data/quality';
import { nowIso } from '@/services/time';
import { createSeedState } from './seed';
import { syncDemoProject } from './demoProject';
import { DEV_ENVS, DEV_TASK_STATUSES, DEV_USER_ID, deployGate, seedDev } from '@/data/dev';
import { memberById } from '@/data/members';
import { devUsersState, personById } from '@/data/people';
import { REQUIREMENT_QUESTIONS } from '@/data/requirements';
import { MODE_LABEL, pendingConfirmations, questionStatus } from '@/features/requirements/assignment';
import { isAnswered } from '@/features/requirements/validation';
import { DISPLAY_SLIDES_MAX, normalizeSlide, seedSignage, validateSlide } from '@/data/signage';
import {
  DEV_AFFILIATION, normalizeEmail, seedClientAccounts, seedDevAccess, seedDevProjects, validateClientAccount, validateDevUser,
  type ClientAccountDraft, type DevUserDraft,
} from '@/data/users';
import { projectFromDraft, validateProject, type ProjectDraft } from '@/features/projects/projectForm';

/** 操作した側。省略時はアフロ（管理者画面）。お客様の画面（CMS・ポータル）からは client を渡す */
export type Side = AnswerSide;

export type Action =
  | { type: 'reset' }
  | { type: 'setCurrentProject'; id: string }
  | { type: 'updateProject'; id: string; patch: Partial<Project> }
  /** 新しいプロジェクト（管理者画面）。要件定義・0% で作り、作業中のプロジェクトにする */
  | { type: 'createProject'; project: ProjectDraft }
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
  | { type: 'setSitemap'; variant: SitemapVariant; nodes: SitemapNode[]; edges: SitemapEdge[] }
  | { type: 'approveSitemap'; by?: Side }
  | { type: 'selectDesign'; id: DesignId }
  | { type: 'approveDesign'; by?: Side }
  | { type: 'startBuild' }
  | { type: 'completeBuild' }
  | { type: 'toggleQuality'; itemId: string; side: 'afro' | 'client' }
  | { type: 'bulkQuality'; side: 'afro' | 'client'; priority: QuestionPriority | 'all'; categoryId?: string }
  | { type: 'savePage'; page: CmsPage; by?: Side }
  | { type: 'setPageStatus'; id: string; status: PageStatus; scheduledAt?: string; by?: Side }
  /** 承認ワークフロー: 承認依頼中のページを承認して公開する / コメントを付けて差し戻す */
  | { type: 'reviewPage'; id: string; decision: 'approve' | 'reject'; comment?: string; by?: Side }
  | { type: 'addDiagnosis'; report: Omit<DiagnosisReport, 'id' | 'at' | 'cycle'> }
  | { type: 'updateSettings'; patch: Partial<DemoState['settings']> }
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

/** 操作した人の表示名（デモでは固定）。お客様の操作かどうかの判定にも使う */
export const ACTOR = { afro: '上野 航', client: 'ミナモ珈琲 担当者' } as const;
/** 承認したときにアクティビティへ残す文（管理者画面の「お客様の対応状況」が承認した人を探すのにも使う） */
export const APPROVE_TEXT = {
  requirements: '要件定義書を承認しました', sitemap: '改善後のサイトマップを承認しました', design: 'トップデザイン案を採用・承認しました',
} as const;
/** 開発者画面の操作者の名前（ログイン中の人。登録した開発者も含む。省略時・見つからないときは DEV_USER_ID） */
const devActor = (state: DemoState, by?: string) => (personById(state, by) ?? memberById(DEV_USER_ID)).name;

let seq = 0;
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

function log(state: DemoState, text: string, kind: Activity['kind'], actor: string = ACTOR.afro, projectId: string = state.currentProjectId): DemoState {
  const a: Activity = { id: uid('act'), at: nowIso(), actor, text, kind, projectId };
  return { ...state, activities: [a, ...state.activities].slice(0, 60) };
}

function approval(state: DemoState, side: 'afro' | 'client', action: string, target: string, actor: string = ACTOR[side]): DemoState {
  const l: ApprovalLog = { id: uid('log'), at: nowIso(), actor, side, action, target };
  return { ...state, approvalLogs: [l, ...state.approvalLogs].slice(0, 100) };
}

/**
 * 承認などで、データの持ち主の案件の更新日時を進める（段階・進捗は syncDemoProject が導く）。
 * 要件・サイトマップ・デザインのデータは 1 案件分（requirements.projectId）だけ持つ。
 * それらの承認で進める案件は、画面で選んでいる案件ではなくデータの持ち主にする
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

/** 段階・進捗・次の作業・承認待ちの数は、patchOwner で書かず syncDemoProject がデモのデータから導く */
export function reducer(state: DemoState, action: Action): DemoState {
  return syncDemoProject(baseReducer(state, action));
}

function baseReducer(state: DemoState, action: Action): DemoState {
  switch (action.type) {
    case 'reset':
      return createSeedState();

    case 'setCurrentProject':
      return state.projects.some((p) => p.id === action.id) ? { ...state, currentProjectId: action.id } : state;

    case 'createProject': {
      // 画面でも止めているが、不正な値・URL の重複はここでも作らない
      if (Object.keys(validateProject(action.project, state.projects)).length > 0) return state;
      const created: Project = { id: uid('p'), ...projectFromDraft(action.project), updatedAt: nowIso() };
      const s = { ...state, projects: [created, ...state.projects], currentProjectId: created.id };
      return log(s, `プロジェクト「${created.siteName}」（${created.clientName}）を作成しました`, 'edit', ACTOR.afro, created.id);
    }

    case 'updateProject':
      return { ...state, projects: state.projects.map((p) => (p.id === action.id ? { ...p, ...action.patch, updatedAt: nowIso() } : p)) };

    case 'setAnswer': {
      // 承認後は回答を変えない（変えると確認待ちが生まれ、承認し直す手段が無い）
      if (state.requirements.status === 'approved') return state;
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
      return log(s, `回答「${q.text}」の内容を確認しました`, 'approve', ACTOR[action.by], state.requirements.projectId);
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
      return log(approval(s, 'client', '要件定義書を承認', '要件定義', ACTOR[action.by ?? 'afro']), APPROVE_TEXT.requirements, 'approve', ACTOR[action.by ?? 'afro'], state.requirements.projectId);
    }

    case 'resetRequirements':
      // 承認後はやり直せない（後ろの段階の承認が残り、表示が食い違うため。回答の変更を止めるのと同じ方針）
      if (state.requirements.status === 'approved') return state;
      return { ...state, requirements: { ...createSeedState().requirements, mode: state.requirements.mode } };

    case 'setSitemap':
      return { ...state, sitemap: { ...state.sitemap, [action.variant]: { nodes: action.nodes, edges: action.edges } } };

    case 'approveSitemap': {
      // ウォーターフォール: 要件定義書の承認の後だけ（画面でも止めている）
      if (state.requirements.status !== 'approved' || state.sitemap.approvedAt) return state;
      const s = patchOwner({ ...state, sitemap: { ...state.sitemap, approvedAt: nowIso() } }, {});
      return log(approval(s, 'client', 'サイトマップを承認', '制作 / サイトマップ', ACTOR[action.by ?? 'afro']), APPROVE_TEXT.sitemap, 'approve', ACTOR[action.by ?? 'afro'], state.requirements.projectId);
    }

    case 'selectDesign':
      return { ...state, design: { ...state.design, selected: action.id } };

    case 'approveDesign': {
      if (!state.design.selected || !state.sitemap.approvedAt) return state;
      const s = patchOwner({ ...state, design: { ...state.design, approvedAt: nowIso() } }, {});
      return log(approval(s, 'client', 'トップデザインを承認', `制作 / デザイン（${state.design.selected}）`, ACTOR[action.by ?? 'afro']), APPROVE_TEXT.design, 'approve', ACTOR[action.by ?? 'afro'], state.requirements.projectId);
    }

    case 'startBuild':
      if (!state.design.approvedAt) return state;
      return { ...state, design: { ...state.design, buildStartedAt: nowIso() } };

    case 'completeBuild': {
      if (!state.design.approvedAt) return state;
      const s = patchOwner({ ...state, design: { ...state.design, buildCompletedAt: nowIso() } }, {});
      return log(s, '採用デザインをもとに全 9 ページを構築しました（シミュレーション）', 'ai', 'AI', state.requirements.projectId);
    }

    case 'toggleQuality': {
      const prev = state.qualityChecks[action.itemId] ?? {};
      const atKey = action.side === 'afro' ? 'afroAt' : 'clientAt';
      const byKey = action.side === 'afro' ? 'afroBy' : 'clientBy';
      const next = prev[atKey]
        ? { ...prev, [atKey]: undefined, [byKey]: undefined }
        : { ...prev, [atKey]: nowIso(), [byKey]: ACTOR[action.side] };
      const item = QUALITY_ITEMS.find((i) => i.id === action.itemId);
      const s = { ...state, qualityChecks: { ...state.qualityChecks, [action.itemId]: next } };
      return item ? approval(s, action.side, prev[atKey] ? 'チェックを取り消し' : 'チェック', item.text) : s;
    }

    case 'bulkQuality': {
      const at = nowIso();
      const atKey = action.side === 'afro' ? 'afroAt' : 'clientAt';
      const byKey = action.side === 'afro' ? 'afroBy' : 'clientBy';
      const targets = QUALITY_ITEMS.filter(
        (i) => (action.priority === 'all' || i.priority === action.priority) && (!action.categoryId || i.categoryId === action.categoryId),
      );
      const checks = { ...state.qualityChecks };
      let count = 0;
      for (const t of targets) {
        if (checks[t.id]?.[atKey]) continue;
        checks[t.id] = { ...checks[t.id], [atKey]: at, [byKey]: ACTOR[action.side] };
        count++;
      }
      if (count === 0) return state;
      const cat = QUALITY_CATEGORIES.find((c) => c.id === action.categoryId);
      const label = action.priority === 'all' ? '全項目' : `${action.priority}区分`;
      const s = approval({ ...state, qualityChecks: checks }, action.side, `${label}を一括チェック（${count}件）`, cat ? `${cat.no}. ${cat.title}` : '全カテゴリ');
      return log(s, `品質チェック ${label} ${count}件を一括チェック`, 'check', ACTOR[action.side]);
    }

    case 'savePage': {
      const exists = state.pages.some((p) => p.id === action.page.id);
      const page = { ...action.page, updatedAt: nowIso() };
      const pages = exists ? state.pages.map((p) => (p.id === page.id ? page : p)) : [page, ...state.pages];
      return log({ ...state, pages }, `「${page.title}」を${exists ? '保存' : '作成'}しました`, 'edit', ACTOR[action.by ?? 'afro']);
    }

    case 'setPageStatus': {
      const page = state.pages.find((p) => p.id === action.id);
      if (!page) return state;
      const updated = withStatus(page, action.status, action.scheduledAt);
      const s = { ...state, pages: state.pages.map((p) => (p.id === page.id ? updated : p)) };
      const kind: Activity['kind'] = action.status === 'published' || action.status === 'scheduled' ? 'publish' : 'edit';
      return log(s, `「${page.title}」を${STATUS_LABEL[action.status]}しました`, kind, ACTOR[action.by ?? 'afro']);
    }

    case 'reviewPage': {
      const page = state.pages.find((p) => p.id === action.id);
      if (!page || page.status !== 'review') return state;
      const side = action.by ?? 'afro';
      const approve = action.decision === 'approve';
      const updated = withStatus(page, approve ? 'published' : 'draft');
      const s = approval(
        { ...state, pages: state.pages.map((p) => (p.id === page.id ? updated : p)) },
        side, approve ? '承認して公開' : '差し戻し', `CMS / ${page.title}`,
      );
      const note = action.comment?.trim();
      return approve
        ? log(s, `「${page.title}」を承認して公開しました`, 'publish', ACTOR[side])
        : log(s, `「${page.title}」を差し戻しました${note ? `（${note}）` : ''}`, 'comment', ACTOR[side]);
    }

    case 'addDiagnosis': {
      const report: DiagnosisReport = { ...action.report, id: uid('diag'), at: nowIso(), cycle: state.diagnoses.length + 1 };
      return log({ ...state, diagnoses: [report, ...state.diagnoses] }, `第${report.cycle}回 AIサイト診断を作成（スコア ${report.score}・デモデータ）`, 'ai', 'AI');
    }

    case 'updateSettings':
      return { ...state, settings: { ...state.settings, ...action.patch } };

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
      const gate = deployGate(dev, action.env, state.design.approvedAt);
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
      return log({ ...state, signage: { ...sg, slides } }, `サイネージのコンテンツ「${slide.title}」を${exists ? '保存' : '作成'}しました`, 'edit', ACTOR.client, state.requirements.projectId);
    }

    case 'deleteSlide': {
      const sg = signageState(state);
      const slide = sg.slides.find((x) => x.id === action.id);
      if (!slide) return state;
      // 編集中の再生順からは外す。配信済みの内容（写し）は残し、再配信するまで端末は流し続ける
      const displays = sg.displays.map((d) => (d.slideIds.includes(slide.id) ? { ...d, slideIds: d.slideIds.filter((id) => id !== slide.id) } : d));
      const s = { ...state, signage: { displays, slides: sg.slides.filter((x) => x.id !== slide.id) } };
      return log(s, `サイネージのコンテンツ「${slide.title}」を削除しました`, 'edit', ACTOR.client, state.requirements.projectId);
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
      return log({ ...state, signage: { ...sg, displays } }, `サイネージ「${display.name}」の再生内容を変更しました`, 'edit', ACTOR.client, state.requirements.projectId);
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
      return log({ ...state, signage: { ...sg, displays } }, `サイネージ「${display.name}」へ ${delivered.length} 件を配信しました${note}`, 'publish', ACTOR.client, state.requirements.projectId);
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
      return log(s, `お客様ポータルに初めてログインしました（${prev.company}）`, 'edit', prev.name, prev.projectId);
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

/** サイネージのデータ（0.11.0 より前の保存データには無いので初期値で補う） */
/** 0.11.0 より前の保存データ用の初期値。描画のたびに作り直すとタイマーが毎回やり直しになるので 1 回だけ作る */
let signageFallback: SignageState | null = null;
export function signageState(state: DemoState): SignageState {
  return state.signage ?? (signageFallback ??= seedSignage());
}

/** 開発者画面のデータ（0.5.0 より前の保存データには無いので初期値で補う） */
export function devState(state: DemoState): DevState {
  return state.dev ?? seedDev();
}

export function currentProject(state: DemoState): Project {
  return state.projects.find((p) => p.id === state.currentProjectId) ?? state.projects[0];
}
