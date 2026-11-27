import type { ApprovalLog, DemoState, Project, RequirementSession } from '@/types';
import type { FullWork } from '@/store/projectWork';
import type { LiveScheduleState } from './schedule';

/**
 * live の案件の state（プロジェクト詳細の見た目の部品 ProjectDetailView・ClientStatusPanel が読む形）。
 * live が持つのは要件（ヒアリングの回答・状態・AI 分析／承認の日時）と承認の記録だけ（BACKEND_FIREBASE §14）。
 * 日程・サイトマップ・デザイン・品質・ページ・診断は持たないので、まだ始まっていない案件と同じ空の値（blankWork）。
 * live の「AI 分析済み」は承認の依頼（completeAnalysis＝submit）と同じ書き込みなので、依頼の日時は analyzedAt。
 * work は呼び出し側が blankWork(p.id) を渡す（projectWork はデモの画像データまで読み、単体テストから import できないため）。
 * sched は live のスケジュール（schedule.ts liveScheduleState。ProjectDetailView の納品予定日・公開予定日が state.schedule を読む。
 * LIVE_SCHEDULE_PLAN U2-1）。依頼中なら承認の依頼の日時（approvalRequests.schedule）も立てる
 */
export function liveProjectView(p: Project, req: RequirementSession, logs: readonly ApprovalLog[], work: FullWork, sched?: LiveScheduleState | null): DemoState {
  const reqAsked = req.status !== 'draft' && req.analyzedAt ? { requirements: req.analyzedAt } : {};
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
    ...(sched ? { schedule: sched.schedule } : {}),
    approvalRequests: { ...reqAsked, ...(sched?.requestedAt ? { schedule: sched.requestedAt } : {}) },
    approvalLogs: logs.map((l) => ({ ...l, projectId: l.projectId ?? p.id })),
    activities: [],
    settings: { reducedMotion: 'system', companyName: '' },
  };
}
