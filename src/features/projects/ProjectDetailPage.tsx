import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { SitePreviewButton } from '@/features/quality/SitePreviewButton';
import type { Project } from '@/types';
import { useDemo } from '@/store/DemoStore';
import { workView } from '@/store/projectWork';
import { RouteLoader } from '@/components/layout/RouteLoader';
import { useRepositories } from '@/repositories';
import { memberById } from '@/data/members';
import { DevProjectGate } from '@/features/dev/DevProjectGate';
import { useDevProjects } from '@/features/dev/useDevUser';
import { nextBestAction } from './projectHelpers';
import { devNextWork, useProjectRoutes } from './projectRoutes';
import { ClientStatusPanel } from './ClientStatusPanel';
import { useWrite } from '@/hooks/useWrite';
import { EditProjectDialog } from './EditProjectDialog';
import { projectDevIds, type ProjectDraft } from './projectForm';
import { RequestApprovalButton } from '@/features/portal/RequestApprovalButton';
import { ProjectDetailView, ProjectNotFound } from './ProjectDetailView';
import { ProjectScheduleSection } from '@/features/schedule/ProjectScheduleSection';

/**
 * プロジェクト詳細（ヘッダーの直下に8段階のパイプライン、その下にお客様の対応状況）。
 * 管理者画面（/projects/:id）と開発者画面（/dev/projects/:id。0.26.0）で同じ画面。開発者画面では
 * URL の案件が担当かを確かめ（担当外は DevProjectGate の案内。転送はしない）、行き先は開発者画面の中だけにする（useProjectRoutes）
 */
export default function ProjectDetailPage() {
  const { projectId } = useParams();
  const routes = useProjectRoutes();
  const { projects } = useRepositories();
  const { data: list, loading } = projects.useList();
  const navigate = useNavigate();
  const p = list.find((x) => x.id === projectId);
  const currentId = projects.useCurrentId();
  const mine = useDevProjects();
  // 開発者画面: URL で開いた案件が担当なら、上部の表示中の案件をそれに揃える（ブラウザの戻る・URL 直打ちでも上部と本文を食い違わせない）。
  // 揃えた後は currentId が一致して syncId が null になるので繰り返さない（上部の切替は詳細へ移動するので URL も変わる）。担当外・存在しない id は選ばない。
  // 管理者画面は従来どおり開いただけでは選ばない（routes.dev の時だけ）
  const syncId = routes.dev && p && p.id !== currentId && mine.some((m) => m.id === p.id) ? p.id : null;
  useEffect(() => {
    if (syncId) projects.select(syncId);
  }, [syncId]);
  // 読み込み中は「見つからない」と判定しない（repositories/types.ts の決まり）
  if (loading) return <RouteLoader label="プロジェクト" />;
  if (!p) return <ProjectNotFound list={routes.list} />;
  if (routes.dev) {
    return (
      <DevProjectGate project={p} onOpen={(id) => { projects.select(id); navigate(routes.detail(id)); }}>
        <Detail p={p} />
      </DevProjectGate>
    );
  }
  return <Detail p={p} />;
}

function Detail({ p }: { p: Project }) {
  const routes = useProjectRoutes();
  // サイトマップ・デザイン・品質・CMS・診断は repository の範囲外（live では隠す。§14）なので DemoStore から読む
  // 制作データ（ヒアリング〜品質チェック）は案件ごと（0.29.0）。管理者画面は開いただけでは案件を選ばないので、この案件の分を差し込んで読む
  const { state: demoState } = useDemo();
  const state = workView(demoState, p.id);
  const { projects, accounts } = useRepositories();
  const { data: devAll } = accounts.useDevProjects();
  const { data: people } = accounts.useDevPeople();
  const navigate = useNavigate();
  const { data: allProjects } = projects.useList();
  const write = useWrite();
  // 情報の編集は管理者画面の demo だけ（live の repository は update を持たない。2026-11-12）
  const update = !routes.dev ? projects.update : undefined;
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveInfo = (draft: ProjectDraft) => {
    if (!update) return;
    setSaving(true);
    void write(update(p.id, draft), 'プロジェクトの情報を更新しました').then((ok) => {
      setSaving(false);
      if (ok) setEditing(false);
    });
  };

  const owner = memberById(p.ownerId);
  // 開発担当（ユーザー管理で決める。開発者画面の権限の有無は問わない。登録した開発者も含め、無効にした人は除く）
  const devPeople = people.filter((m) => !m.disabled);
  const devNames = devPeople.filter((m) => devAll[m.id]?.includes(p.id)).map((m) => m.name);
  // 運用（ページ）・改善（診断）も案件ごと（0.30.0）なので、どの案件でもその案件の数値と次の作業を出す
  const demoAction = nextBestAction(state);
  // 開発者画面はダッシュボードのカードと同じ「次の作業」（行き先は開発者画面の中だけ）
  const devWork = routes.dev ? devNextWork(p, state) : null;
  const next = devWork
    ? { label: devWork.next, to: devWork.to }
    : { label: demoAction.cta, to: demoAction.to };

  const go = (to: string) => {
    projects.select(p.id);
    navigate(to);
  };

  return (
    <ProjectDetailView
      p={p} state={state} routes={routes} owner={owner} devNames={devNames} allProjects={allProjects} next={next} go={go}
      openProject={(id) => navigate(routes.detail(id))}
      preview={<SitePreviewButton projectId={p.id} size="small" />}
      onEdit={update ? () => setEditing(true) : undefined}
      requestApproval={(key) => <RequestApprovalButton approvalKey={key} />}
      schedule={<ProjectScheduleSection view={state} dev={!!routes.dev} onOpen={() => go(routes.dev ? '/dev/schedule' : '/schedule')} />}
      clientStatus={<ClientStatusPanel project={p} />}
    >
      {update && (
        <EditProjectDialog
          project={editing ? p : null} projects={allProjects}
          devOptions={devPeople} devIds={projectDevIds(devAll, p.id, devPeople)}
          onClose={() => setEditing(false)} onSave={saveInfo} saving={saving} />
      )}
    </ProjectDetailView>
  );
}
