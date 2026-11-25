import type { Project } from '@/types';
import { useDemo } from '@/store/DemoStore';
import { releaseDateOf } from '@/data/schedule';
import { FollowUpBadge } from '@/features/projects/FollowUpBadge';
import { ProjectCardView } from './ProjectCardView';

/**
 * 開発者画面: 担当している案件のカード（進捗・いまの段階・次の作業・公開予定日）。
 * カード全体を押すと、その案件のプロジェクト詳細（開発者画面の中の /dev/projects/:id。0.26.0）を開く。見た目は管理者ホームの「進行中のプロジェクト」に合わせる。
 * 見た目は ProjectCardView（live のダッシュボードと共有）。ここは demo のデータ（公開予定日・追加開発の元の案件）を渡すだけ
 */
export function DevProjectCard({ p, next, onOpen }: { p: Project; next: string; onOpen: () => void }) {
  // スケジュールの公開予定日があればそれを使う（2026-11-17 会議）
  const { state } = useDemo();
  return (
    <ProjectCardView
      p={p}
      next={next}
      launchDate={releaseDateOf(state, p)}
      onOpen={onOpen}
      // 追加開発の案件（0.31.0）は元の案件の名前を添える
      extra={p.parentProjectId ? <FollowUpBadge p={p} /> : undefined}
    />
  );
}
