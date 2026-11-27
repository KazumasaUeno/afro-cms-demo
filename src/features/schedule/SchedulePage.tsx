import { currentProject, useDemo } from '@/store/DemoStore';
import { useToast } from '@/hooks/useToast';
import { useQualityDevBy } from '@/features/quality/useQualityDevBy';
import { RequestApprovalButton } from '@/features/portal/RequestApprovalButton';
import { validateSchedule, type ScheduleDraft } from '@/data/schedule';
import { ScheduleView } from './ScheduleView';

// 以前ここにあった表示の部品（予定日のカード・日付の文言）は scheduleParts.tsx へ移した。従来の import 先のまま使えるように再び出す
export { MILESTONES, jpDate, untilText } from './scheduleParts';

/**
 * 制作〜公開のスケジュール（demo。2026-11-17 会議「要件定義のあと、開発担当者がスケジュールを入れる。入れるまで制作へ進めない」）。
 * 入力・保存は開発者画面（/dev/schedule）だけ。管理者画面（/schedule）は見るだけ。
 * 要件定義書の承認の前は入れられない（reducer の saveSchedule でも止めている）。
 * 表示は ScheduleView（live と共用。LIVE_SCHEDULE_PLAN L-13）。ここは DemoStore の値と操作をつなぐだけ（live から import しない）
 */
export default function SchedulePage() {
  const { state, dispatch } = useDemo();
  const devBy = useQualityDevBy();
  const toast = useToast();
  const project = currentProject(state);
  const saved = state.schedule;
  const approved = state.requirements.status === 'approved';
  const editable = !!devBy && approved;

  const save = (draft: ScheduleDraft) => {
    dispatch({ type: 'saveSchedule', schedule: draft, devBy });
    toast(saved ? 'スケジュールを変更しました' : 'スケジュールを保存しました。お客様へスケジュールの承認を依頼できます');
    return true;
  };

  return (
    <ScheduleView
      source={{
        projectId: project.id, saved, approved, editable, devBy, validate: validateSchedule, save, token: '',
        // 段階の最後のお客様の承認（2026-11-17 ユーザー指示）。保存の後に依頼できる
        approval: <RequestApprovalButton approvalKey="schedule" />,
      }}
    />
  );
}
