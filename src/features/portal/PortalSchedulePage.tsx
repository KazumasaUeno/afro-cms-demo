import { useDemo } from '@/store/DemoStore';
import { WbsSection } from '@/features/schedule/WbsSection';
import { approvalSteps } from './portalSteps';
import { PortalScheduleView } from './PortalScheduleView';

/**
 * お客様ポータルのスケジュール（2026-11-17 ユーザー指示「お客さんもスケジュールが見れるように」）。見るだけ。
 * 予定日のカードと WBS（バー・今日の線・節目の ◆）を出す。社内向けのメモ・保存した人・担当者・構築タスクは出さない。
 * スケジュールの承認を待っている間は、確認・承認の画面への案内を出す。
 * 見た目は PortalScheduleView（live の LivePortalSchedulePage と共用。LIVE_SCHEDULE_PLAN U4）。ここは demo の DemoStore の配線だけ
 */
export default function PortalSchedulePage() {
  const { state } = useDemo();
  const waiting = approvalSteps(state).find((s) => s.key === 'schedule')?.status === 'waiting';
  return <PortalScheduleView saved={state.schedule} waiting={waiting} wbs={<WbsSection editable={false} client />} />;
}
