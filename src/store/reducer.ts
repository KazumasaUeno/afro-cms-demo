import type {
  Activity, AnswerValue, ApprovalLog, CmsPage, DemoState, DesignId, DiagnosisReport,
  PageStatus, Project, QuestionPriority, SitemapEdge, SitemapNode, SitemapVariant,
} from '@/types';
import { QUALITY_CATEGORIES, QUALITY_ITEMS } from '@/data/quality';
import { nowIso } from '@/services/time';
import { createSeedState } from './seed';

export type Action =
  | { type: 'reset' }
  | { type: 'setCurrentProject'; id: string }
  | { type: 'updateProject'; id: string; patch: Partial<Project> }
  | { type: 'setAnswer'; questionId: string; value: AnswerValue }
  | { type: 'setCompetitors'; urls: string[] }
  | { type: 'completeAnalysis' }
  | { type: 'approveRequirements' }
  | { type: 'resetRequirements' }
  | { type: 'setSitemap'; variant: SitemapVariant; nodes: SitemapNode[]; edges: SitemapEdge[] }
  | { type: 'approveSitemap' }
  | { type: 'selectDesign'; id: DesignId }
  | { type: 'approveDesign' }
  | { type: 'startBuild' }
  | { type: 'completeBuild' }
  | { type: 'toggleQuality'; itemId: string; side: 'afro' | 'client' }
  | { type: 'bulkQuality'; side: 'afro' | 'client'; priority: QuestionPriority | 'all'; categoryId?: string }
  | { type: 'savePage'; page: CmsPage }
  | { type: 'setPageStatus'; id: string; status: PageStatus; scheduledAt?: string }
  | { type: 'addDiagnosis'; report: Omit<DiagnosisReport, 'id' | 'at' | 'cycle'> }
  | { type: 'updateSettings'; patch: Partial<DemoState['settings']> };

/** 操作した人（デモでは固定） */
const ACTOR = { afro: '上野 航', client: 'ミナモ珈琲 担当者' } as const;

let seq = 0;
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

function log(state: DemoState, text: string, kind: Activity['kind'], actor: string = ACTOR.afro): DemoState {
  const a: Activity = { id: uid('act'), at: nowIso(), actor, text, kind, projectId: state.currentProjectId };
  return { ...state, activities: [a, ...state.activities].slice(0, 60) };
}

function approval(state: DemoState, side: 'afro' | 'client', action: string, target: string): DemoState {
  const l: ApprovalLog = { id: uid('log'), at: nowIso(), actor: ACTOR[side], side, action, target };
  return { ...state, approvalLogs: [l, ...state.approvalLogs].slice(0, 100) };
}

function patchCurrent(state: DemoState, patch: Partial<Project>): DemoState {
  return {
    ...state,
    projects: state.projects.map((p) => (p.id === state.currentProjectId ? { ...p, ...patch, updatedAt: nowIso() } : p)),
  };
}

const STATUS_LABEL: Record<PageStatus, string> = { draft: '下書き保存', review: '承認依頼', scheduled: '予約公開', published: '公開' };

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
      return log(s, 'AI要件分析を完了し、改善提案書を作成しました', 'ai', 'AI');
    }

    case 'approveRequirements': {
      const s = patchCurrent(
        { ...state, requirements: { ...state.requirements, status: 'approved', approvedAt: nowIso() } },
        { stage: 'build', progress: Math.max(25, currentProject(state).progress), nextAction: 'サイトマップを承認する' },
      );
      return log(approval(s, 'client', '要件定義書を承認', '要件定義'), '要件定義書を承認しました', 'approve');
    }

    case 'resetRequirements':
      return { ...state, requirements: createSeedState().requirements };

    case 'setSitemap':
      return { ...state, sitemap: { ...state.sitemap, [action.variant]: { nodes: action.nodes, edges: action.edges } } };

    case 'approveSitemap': {
      const s = patchCurrent({ ...state, sitemap: { ...state.sitemap, approvedAt: nowIso() } }, {
        progress: Math.max(38, currentProject(state).progress), nextAction: 'デザイン案の採用を決める',
      });
      return log(approval(s, 'client', 'サイトマップを承認', '制作 / サイトマップ'), '改善後のサイトマップを承認しました', 'approve');
    }

    case 'selectDesign':
      return { ...state, design: { ...state.design, selected: action.id } };

    case 'approveDesign': {
      if (!state.design.selected) return state;
      const s = patchCurrent({ ...state, design: { ...state.design, approvedAt: nowIso() } }, {
        progress: Math.max(52, currentProject(state).progress), nextAction: '全ページを構築する',
      });
      return log(approval(s, 'client', 'トップデザインを承認', `制作 / デザイン（${state.design.selected}）`), 'トップデザイン案を採用・承認しました', 'approve');
    }

    case 'startBuild':
      return { ...state, design: { ...state.design, buildStartedAt: nowIso() } };

    case 'completeBuild': {
      const s = patchCurrent({ ...state, design: { ...state.design, buildCompletedAt: nowIso() } }, {
        stage: 'quality', progress: Math.max(64, currentProject(state).progress), nextAction: '品質チェック（110問）を進める',
      });
      return log(s, '採用デザインをもとに全 9 ページを構築しました（シミュレーション）', 'ai', 'AI');
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
      return log({ ...state, pages }, `「${page.title}」を${exists ? '保存' : '作成'}しました`, 'edit');
    }

    case 'setPageStatus': {
      const page = state.pages.find((p) => p.id === action.id);
      if (!page) return state;
      const at = nowIso();
      const updated: CmsPage = {
        ...page,
        status: action.status,
        updatedAt: at,
        ...(action.status === 'published' ? { publishedAt: at, publishedContent: page.content, scheduledAt: undefined } : {}),
        ...(action.status === 'scheduled' ? { scheduledAt: action.scheduledAt } : { ...(action.status !== 'published' ? { scheduledAt: undefined } : {}) }),
      };
      const s = { ...state, pages: state.pages.map((p) => (p.id === page.id ? updated : p)) };
      const kind: Activity['kind'] = action.status === 'published' || action.status === 'scheduled' ? 'publish' : 'edit';
      return log(s, `「${page.title}」を${STATUS_LABEL[action.status]}しました`, kind);
    }

    case 'addDiagnosis': {
      const report: DiagnosisReport = { ...action.report, id: uid('diag'), at: nowIso(), cycle: state.diagnoses.length + 1 };
      return log({ ...state, diagnoses: [report, ...state.diagnoses] }, `第${report.cycle}回 AIサイト診断を作成（スコア ${report.score}・デモデータ）`, 'ai', 'AI');
    }

    case 'updateSettings':
      return { ...state, settings: { ...state.settings, ...action.patch } };

    default:
      return state;
  }
}

export function currentProject(state: DemoState): Project {
  return state.projects.find((p) => p.id === state.currentProjectId) ?? state.projects[0];
}
