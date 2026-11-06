import type {
  Activity, AnswerValue, ApprovalLog, CmsPage, DemoState, DeployEnv, DesignId, DevState, DevTaskStatus, DiagnosisReport,
  PageStatus, Project, QuestionPriority, SitemapEdge, SitemapNode, SitemapVariant,
} from '@/types';
import { QUALITY_CATEGORIES, QUALITY_ITEMS } from '@/data/quality';
import { nowIso } from '@/services/time';
import { createSeedState } from './seed';
import { DEV_ENVS, DEV_TASK_STATUSES, DEV_USER_ID, deployGate, seedDev } from '@/data/dev';
import { memberById } from '@/data/members';

/** 操作した側。省略時はアフロ（管理者画面）。お客様の画面（CMS・ポータル）からは client を渡す */
export type Side = 'afro' | 'client';

export type Action =
  | { type: 'reset' }
  | { type: 'setCurrentProject'; id: string }
  | { type: 'updateProject'; id: string; patch: Partial<Project> }
  | { type: 'setAnswer'; questionId: string; value: AnswerValue }
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
  | { type: 'deploy'; env: DeployEnv };

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

    case 'setAnswer':
      return { ...state, requirements: { ...state.requirements, answers: { ...state.requirements.answers, [action.questionId]: action.value } } };

    case 'setCompetitors':
      return { ...state, requirements: { ...state.requirements, competitors: action.urls } };

    case 'completeAnalysis': {
      const s = { ...state, requirements: { ...state.requirements, status: 'analyzed' as const, analyzedAt: nowIso() } };
      return log(s, 'AI要件分析を完了し、改善提案書を作成しました', 'ai', 'AI', state.requirements.projectId);
    }

    case 'approveRequirements': {
      const s = patchOwner(
        { ...state, requirements: { ...state.requirements, status: 'approved', approvedAt: nowIso() } },
        { stage: 'build', progress: Math.max(25, ownerProject(state).progress), nextAction: 'サイトマップを承認する' },
      );
      return log(approval(s, 'client', '要件定義書を承認', '要件定義'), '要件定義書を承認しました', 'approve', ACTOR[action.by ?? 'afro'], state.requirements.projectId);
    }

    case 'resetRequirements':
      return { ...state, requirements: createSeedState().requirements };

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

    default:
      return state;
  }
}

/** 開発者画面のデータ（0.5.0 より前の保存データには無いので初期値で補う） */
export function devState(state: DemoState): DevState {
  return state.dev ?? seedDev();
}

export function currentProject(state: DemoState): Project {
  return state.projects.find((p) => p.id === state.currentProjectId) ?? state.projects[0];
}
