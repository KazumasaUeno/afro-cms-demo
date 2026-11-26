import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { ApprovalLog, DemoState, Member, Project, RequirementSession } from '@/types';
import { RouteLoader } from '@/components/layout/RouteLoader';
import { useRepositories } from '@/repositories';
import { blankWork } from '@/store/projectWork';
import { devUserToPerson } from '@/data/people';
import { ProjectDetailView, ProjectNotFound } from '@/features/projects/ProjectDetailView';
import { ClientStatusPanel } from '@/features/projects/ClientStatusPanel';
import { devNextWork, useProjectRoutes } from '@/features/projects/projectRoutes';
import { SitePreviewPendingButton } from '@/features/quality/SitePreviewButton';
import { useAccountPeople, useLiveProjects } from '../repositories';
import { useLiveSession } from '../session';
import { LoadError } from './shared';

/**
 * live の案件の state（プロジェクト詳細の見た目の部品 ProjectDetailView・ClientStatusPanel が読む形）。
 * live が持つのは要件（ヒアリングの回答・状態・AI 分析／承認の日時）と承認の記録だけ（BACKEND_FIREBASE §14）。
 * 日程・サイトマップ・デザイン・品質・ページ・診断は持たないので、まだ始まっていない案件と同じ空の値（blankWork）。
 * live の「AI 分析済み」は承認の依頼（completeAnalysis＝submit）と同じ書き込みなので、依頼の日時は analyzedAt
 */
export function liveProjectView(p: Project, req: RequirementSession, logs: readonly ApprovalLog[]): DemoState {
  const work = blankWork(p.id);
  return {
    version: 0,
    userName: '',
    currentProjectId: p.id,
    projects: [p],
    requirements: req,
    sitemap: work.sitemap,
    design: work.design,
    qualityChecks: work.qualityChecks,
    pages: work.pages,
    diagnoses: work.diagnoses,
    signage: work.signage,
    approvalRequests: req.status !== 'draft' && req.analyzedAt ? { requirements: req.analyzedAt } : {},
    approvalLogs: logs.map((l) => ({ ...l, projectId: l.projectId ?? p.id })),
    activities: [],
    settings: { reducedMotion: 'system', companyName: '' },
  };
}

/** 名前を読めない（読み込み中・権限で読めない）担当者 */
const nobody = (id: string): Member => devUserToPerson({ id, name: '—', role: '', email: '', affiliation: 'internal', status: 'active', createdAt: '' });

/**
 * プロジェクトの詳細（管理者: どの案件でも見るだけ ／ 開発者: 担当の案件だけ＝一覧に無ければ「見つからない」）。
 * 見た目はデモの承認済みの画面と同じ部品（ProjectDetailView。2026-11-26 ユーザー指示「プロジェクトを開いた後の画面がデモと全く違う」）
 */
export default function LiveProjectDetailPage() {
  const { projectId = '' } = useParams();
  const { account } = useLiveSession();
  const dev = account.role === 'developer';
  const routes = useProjectRoutes();
  const { projects } = useRepositories();
  const { data: list, loading, error } = projects.useList();
  const p = list.find((x) => x.id === projectId);

  // 読み込み中は「見つからない」を出さない（repositories/types.ts の決まり）
  if (loading) return <RouteLoader label="プロジェクト" />;
  if (error) return <LoadError what="プロジェクト" />;
  if (!p) {
    return <ProjectNotFound list={routes.list} body={dev ? '担当から外れたか、削除された可能性があります。' : 'URLが間違っているか、削除された可能性があります。'} />;
  }
  return <Detail p={p} list={list} />;
}

function Detail({ p, list }: { p: Project; list: Project[] }) {
  const routes = useProjectRoutes();
  const navigate = useNavigate();
  const { projects, requirements, approvals } = useRepositories();
  const { data: req, loading: reqLoading, error: reqError } = requirements.useCurrent(p.id);
  const { data: logs } = approvals.useHistory(p.id);
  // 担当ディレクター（作成した人）と開発担当（memberUids）の名前は accounts から
  const doc = useLiveProjects().data.find((x) => x.id === p.id);
  const memberUids = doc?.memberUids ?? [];
  // useAccountPeople は uid の並びを文字列の key にして読むので、配列を毎回作ってよい
  const people = useAccountPeople([p.ownerId, ...memberUids]);
  const state = useMemo(() => liveProjectView(p, req, logs), [p, req, logs]);

  if (reqLoading) return <RouteLoader label="プロジェクト" />;
  if (reqError) return <LoadError what="プロジェクト" />;

  const owner = people[p.ownerId] ?? nobody(p.ownerId);
  const devNames = memberUids.map((u) => people[u]?.name).filter((n): n is string => !!n);
  // 開発者画面の「次に必要な作業」（デモと同じ判定）。承認済みの次（スケジュール）は live に画面が無いので要件定義を開く
  const work = devNextWork(p, state);
  const next = req.status === 'approved' ? { label: '要件定義書を見る', to: routes.requirements } : { label: work.next, to: work.to };
  const go = (to: string) => {
    projects.select(p.id);
    navigate(to);
  };

  return (
    <ProjectDetailView
      p={p} state={state} routes={routes} owner={owner} devNames={devNames} allProjects={list} next={next} go={go}
      openProject={(id) => navigate(routes.detail(id))}
      preview={<SitePreviewPendingButton size="small" />}
      clientStatus={<ClientStatusPanel project={p} view={state} />}
    />
  );
}
