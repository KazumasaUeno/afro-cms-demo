import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Member, Project } from '@/types';
import { RouteLoader } from '@/components/layout/RouteLoader';
import { useRepositories } from '@/repositories';
import { devUserToPerson } from '@/data/people';
import { ProjectDetailView, ProjectNotFound } from '@/features/projects/ProjectDetailView';
import { ClientStatusPanel } from '@/features/projects/ClientStatusPanel';
import { devNextWork, useProjectRoutes } from '@/features/projects/projectRoutes';
import { SitePreviewPendingButton } from '@/features/quality/SitePreviewButton';
import { useAccountPeople, useLiveProjects, useLiveSchedule, useLiveSitemap } from '../repositories';
import { liveScheduleState } from '../schedule';
import { liveSitemapProjectState } from '../sitemap';
import { liveSitemapNext } from '@/features/sitemap/liveSitemapUi';
import { ProjectScheduleSection } from '@/features/schedule/ProjectScheduleSection';
import { liveDetailNext } from '@/features/schedule/liveScheduleUi';
import { useLiveWbsSource } from './LiveSchedulePage';
import { useLiveSession } from '../session';
import { LoadError } from './shared';
import { liveProjectView } from '../projectView';
import { blankWork } from '@/store/projectWork';

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
  const { data: logs, loading: logsLoading, error: logsError } = approvals.useHistory(p.id);
  // 担当ディレクター（作成した人）と開発担当（memberUids）の名前は accounts から
  const doc = useLiveProjects().data.find((x) => x.id === p.id);
  const memberUids = doc?.memberUids ?? [];
  // useAccountPeople は uid の並びを文字列の key にして読むので、配列を毎回作ってよい
  const people = useAccountPeople([p.ownerId, ...memberUids]);
  // スケジュール（LIVE_SCHEDULE_PLAN U3-b。納品予定日・公開予定日の欄とスケジュールの区画が state.schedule を読む）
  const sch = useLiveSchedule(p.id);
  const sched = useMemo(() => liveScheduleState(sch.summary, sch.current, sch.internal), [sch.summary, sch.current, sch.internal]);
  // サイトマップ（LIVE_SITEMAP_IMPL_PLAN U3-b。区画の状態と「次に必要な作業」。AC-28）
  const site = useLiveSitemap(p.id);
  const siteState = useMemo(() => liveSitemapProjectState(site.summary, site.internal, site.version), [site.summary, site.internal, site.version]);
  const state = useMemo(() => liveProjectView(p, req, logs, blankWork(p.id), sched, siteState), [p, req, logs, sched, siteState]);
  const { account } = useLiveSession();
  const canEdit = (account.role === 'admin' || account.role === 'developer') && req.status === 'approved' && !!doc && !doc.archived;
  const wbs = useLiveWbsSource(p.id, sch, state, false);

  if (reqLoading || logsLoading || site.loading) return <RouteLoader label="プロジェクト" />;
  if (reqError) return <LoadError what="プロジェクト" />;
  // 承認の記録が読めないとき「履歴なし」と同じ見た目にしない（review 2026-11-26 Minor）
  if (logsError) return <LoadError what="承認の記録" />;

  const owner = people[p.ownerId] ?? nobody(p.ownerId);
  const devNames = memberUids.map((u) => people[u]?.name).filter((n): n is string => !!n);
  // 開発者画面の「次に必要な作業」（デモと同じ判定）。要件定義書の承認後はスケジュール（文言は段階の文言。影響分析 3）
  const work = devNextWork(p, state);
  const scheduleTo = routes.approval.schedule ?? (routes.dev ? '/dev/schedule' : '/schedule');
  // スケジュールの承認後は、サイトマップの段階の作業（それまでは従来どおり）
  const next = liveSitemapNext(
    { reqApproved: req.status === 'approved', scheduleApproved: sch.summary?.approvedRevision !== undefined, status: site.summary?.status ?? null, sitemapTo: routes.sitemap },
    liveDetailNext(req.status, p.nextAction, scheduleTo, work),
  );
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
      schedule={<ProjectScheduleSection view={state} dev={canEdit} onOpen={() => go(scheduleTo)} wbs={wbs} />}
    />
  );
}
