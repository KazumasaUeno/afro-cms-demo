import { useMemo } from 'react';
import { RouteLoader } from '@/components/layout/RouteLoader';
import { useCurrentRequirements } from '@/repositories';
import { blankWork } from '@/store/projectWork';
import { PortalScheduleView } from '@/features/portal/PortalScheduleView';
import { approvalSteps } from '@/features/portal/portalSteps';
import { WbsSection } from '@/features/schedule/WbsSection';
import { clientScheduleView } from '../schedule';
import { clientScheduleNotice, clientScheduleState, clientWbsCurrent, isPermissionDenied } from '../portalSchedule';
import { toProject, type ProjectDoc } from '../model';
import { useLiveProjects, useLiveSchedule, type LiveScheduleQuery } from '../repositories';
import { liveProjectView } from '../projectView';
import { useLiveWbsSource } from './LiveSchedulePage';
import { LoadError } from './shared';

/**
 * お客様ポータルのスケジュール（live。/portal/schedule。LIVE_SCHEDULE_PLAN U4）。見た目は demo と同じ PortalScheduleView と WbsSection の client。
 * 担当の 1 案件（accounts.projectId）だけ。見せるのは clientScheduleView の値だけ（未作成・rev 0・差し戻し後で承認歴なし → 「ご用意します」／
 * 依頼中 → 承認の案内／承認済み／再計画中 → 最後に承認された版と「調整中」の案内）。メモ・担当・保存者・構築タスクは出さない（AC-09）。
 * 表示の出し分けで、権限の実体は firestore.rules（お客様は current を revision >= 1 のときだけ読める・internal は読めない）
 */
export default function LivePortalSchedulePage() {
  const { data: list, loading, error } = useLiveProjects();
  const doc = list[0];
  if (loading) return <RouteLoader label="スケジュール" />;
  if (error) return <LoadError what="スケジュール" />;
  if (!doc) return <PortalScheduleView saved={null} waiting={false} />;
  return <ClientSchedule key={doc.id} doc={doc} />;
}

function ClientSchedule({ doc }: { doc: ProjectDoc }) {
  const pid = doc.id;
  const req = useCurrentRequirements();
  const sch = useLiveSchedule(pid);
  // 読めない版（Rules の拒否）は未作成と同じ表示（S-1）。それ以外の失敗は再読み込みの案内
  const denied = isPermissionDenied(sch.error);
  const cv = useMemo(
    () => (denied ? { kind: 'none' as const } : clientScheduleView(sch.summary, sch.current, sch.approvedCopy)),
    [denied, sch.summary, sch.current, sch.approvedCopy],
  );
  const project = useMemo(() => toProject(doc), [doc]);
  const st = useMemo(() => clientScheduleState(cv, sch.summary), [cv, sch.summary]);
  const view = useMemo(() => liveProjectView(project, req.data, [], blankWork(pid), st), [project, req.data, pid, st]);
  const wbsQuery = useMemo<LiveScheduleQuery>(() => ({ ...sch, internal: null, current: clientWbsCurrent(cv, sch.current) }), [sch, cv]);
  const wbs = useLiveWbsSource(pid, wbsQuery, view, false);

  if (sch.loading || req.loading) return <RouteLoader label="スケジュール" />;
  if ((sch.error && !denied) || req.error) return <LoadError what="スケジュール" />;

  const waiting = approvalSteps(view).find((s) => s.key === 'schedule')?.status === 'waiting';
  return (
    <PortalScheduleView
      saved={view.schedule}
      waiting={waiting}
      notice={clientScheduleNotice(cv)}
      wbs={<WbsSection editable={false} client view={view} source={wbs} />}
    />
  );
}
