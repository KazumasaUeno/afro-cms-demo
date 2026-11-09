import type {
  Activity, AnswerValue, ApprovalLog, CmsPage, DemoState, DeployEnv, DesignId, DevState, DevTaskStatus, DiagnosisReport,
  AnswerSide, PageStatus, Project, QuestionPriority, RequirementMode, SignageState, SitemapEdge, SitemapNode, SitemapVariant, Slide,
} from '@/types';
import { QUALITY_CATEGORIES, QUALITY_ITEMS } from '@/data/quality';
import { nowIso } from '@/services/time';
import { createSeedState } from './seed';
import { DEV_ENVS, DEV_TASK_STATUSES, DEV_USER_ID, deployGate, seedDev } from '@/data/dev';
import { memberById } from '@/data/members';
import { REQUIREMENT_QUESTIONS } from '@/data/requirements';
import { MODE_LABEL, pendingConfirmations, questionStatus } from '@/features/requirements/assignment';
import { isAnswered } from '@/features/requirements/validation';
import { DISPLAY_SLIDES_MAX, normalizeSlide, seedSignage, validateSlide } from '@/data/signage';

/** 操作した側。省略時はアフロ（管理者画面）。お客様の画面（CMS・ポータル）からは client を渡す */
export type Side = AnswerSide;

export type Action =
  | { type: 'reset' }
  | { type: 'setCurrentProject'; id: string }
  | { type: 'updateProject'; id: string; patch: Partial<Project> }
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
  | { type: 'setDevTaskStatus'; id: string; status: DevTaskStatus }
  | { type: 'runAutoChecks' }
  | { type: 'deploy'; env: DeployEnv }
  /** デジタルサイネージ（お客様ポータル。操作者はお客様） */
  | { type: 'saveSlide'; slide: Slide }
  | { type: 'deleteSlide'; id: string }
  | { type: 'setDisplaySlides'; id: string; slideIds: string[] }
  | { type: 'deliverDisplay'; id: string };

/** 操作した人（デモでは固定） */
const ACTOR = { afro: '上野 航', client: 'ミナモ珈琲 担当者' } as const;
/** 開発者画面の操作者（アフロ側の制作エンジニア） */
/** 開発者画面で操作する人（デモでは固定。名前の正は data/members） */
const DEV_ACTOR = memberById(DEV_USER_ID).name;

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

const ownerProject = (state: DemoState): Project => state.projects.find((p) => p.id === state.requirements.projectId) ?? currentProject(state);

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

export function reducer(state: DemoState, action: Action): DemoState {
  switch (action.type) {
    case 'reset':
      return createSeedState();

    case 'setCurrentProject':
      return state.projects.some((p) => p.id === action.id) ? { ...state, currentProjectId: action.id } : state;

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
      return log(s, `代理入力された回答「${q.text}」を確認しました`, 'approve', ACTOR[action.by], state.requirements.projectId);
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
        { stage: 'build', progress: Math.max(25, ownerProject(state).progress), nextAction: 'サイトマップを承認する' },
      );
      return log(approval(s, 'client', '要件定義書を承認', '要件定義'), '要件定義書を承認しました', 'approve', ACTOR[action.by ?? 'afro'], state.requirements.projectId);
    }

    case 'resetRequirements':
      return { ...state, requirements: { ...createSeedState().requirements, mode: state.requirements.mode } };

    case 'setSitemap':
      return { ...state, sitemap: { ...state.sitemap, [action.variant]: { nodes: action.nodes, edges: action.edges } } };

    case 'approveSitemap': {
      const s = patchOwner({ ...state, sitemap: { ...state.sitemap, approvedAt: nowIso() } }, {
        progress: Math.max(38, ownerProject(state).progress), nextAction: 'デザイン案の採用を決める',
      });
      return log(approval(s, 'client', 'サイトマップを承認', '制作 / サイトマップ'), '改善後のサイトマップを承認しました', 'approve', ACTOR[action.by ?? 'afro'], state.requirements.projectId);
    }

    case 'selectDesign':
      return { ...state, design: { ...state.design, selected: action.id } };

    case 'approveDesign': {
      if (!state.design.selected) return state;
      const s = patchOwner({ ...state, design: { ...state.design, approvedAt: nowIso() } }, {
        progress: Math.max(52, ownerProject(state).progress), nextAction: '全ページを構築する',
      });
      return log(approval(s, 'client', 'トップデザインを承認', `制作 / デザイン（${state.design.selected}）`), 'トップデザイン案を採用・承認しました', 'approve', ACTOR[action.by ?? 'afro'], state.requirements.projectId);
    }

    case 'startBuild':
      return { ...state, design: { ...state.design, buildStartedAt: nowIso() } };

    case 'completeBuild': {
      const s = patchOwner({ ...state, design: { ...state.design, buildCompletedAt: nowIso() } }, {
        stage: 'quality', progress: Math.max(64, ownerProject(state).progress), nextAction: '品質チェック（110問）を進める',
      });
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
      return log({ ...state, dev: { ...dev, tasks } }, `構築タスク「${task.title}」を${label}にしました`, 'edit', DEV_ACTOR);
    }

    case 'runAutoChecks': {
      const at = nowIso();
      const dev = devState(state);
      const checks = { ...state.qualityChecks };
      let count = 0;
      for (const t of QUALITY_ITEMS) {
        if (t.priority !== 'A' || checks[t.id]?.afroAt) continue;
        checks[t.id] = { ...checks[t.id], afroAt: at, afroBy: DEV_ACTOR };
        count++;
      }
      let s: DemoState = { ...state, qualityChecks: checks, dev: { ...dev, checksRunAt: at } };
      // 新たに確認した項目が無い再実行は、実行日時だけ更新する（アクティビティに「0件」を積まない）
      if (count === 0) return s;
      s = approval(s, 'afro', `自動チェックで A区分を確認（${count}件）`, '全カテゴリ', DEV_ACTOR);
      return log(s, `自動チェックを実行しました（A区分 ${count}件を新たに確認・シミュレーション）`, 'check', DEV_ACTOR);
    }

    case 'deploy': {
      const dev = devState(state);
      const gate = deployGate(dev, action.env, state.design.approvedAt);
      if (!gate.ok || !gate.version) return state;
      const env = DEV_ENVS.find((e) => e.id === action.env);
      const note = action.env === 'development' ? '最新の作業内容を反映' : `v${gate.version} を${action.env === 'staging' ? '開発環境' : '検証環境'}から昇格`;
      const deploy = { id: uid('dep'), env: action.env, version: gate.version, at: nowIso(), by: DEV_ACTOR, status: 'success' as const, note };
      const s: DemoState = { ...state, dev: { ...dev, deploys: [deploy, ...dev.deploys].slice(0, 50) } };
      return log(s, `${env?.label ?? action.env}へ v${gate.version} をデプロイしました（シミュレーション）`, 'publish', DEV_ACTOR);
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

    default:
      return state;
  }
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
