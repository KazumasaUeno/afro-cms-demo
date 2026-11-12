import type { DemoState, ISODate, Project } from '@/types';
import { ACTOR } from '@/store/reducer';
import { CLIENT_PROJECT_ID } from '@/components/layout/nav';
import { workView } from '@/store/projectWork';
import { approvalSteps, type ApprovalKey, type ApprovalStatus } from '@/features/portal/portalSteps';

/**
 * 管理者画面の「お客様の対応状況」。お客様ポータルと同じ値（portalSteps）から導く（専用の状態は持たない）。
 * 案件ごとの制作データ（workView）で、どの案件でも出す（2026-11-12 ユーザー決定）。
 * 承認はお客様ポータルだけなので、承認した人は区別しない（アフロの代理承認は 2026-11-12 に廃止）。
 * ページ・お知らせ（CMS）は MINAMO COFFEE の分しか無いので、公開承認はその案件の運用・改善の段階のときだけ数える。
 */

export interface ClientApprovalRow {
  key: ApprovalKey;
  title: string;
  status: ApprovalStatus;
  approvedAt?: ISODate;
  progress?: { done: number; total: number };
  /** お客様へお願いした日（waiting のとき。導けないときは無し） */
  requestedAt?: ISODate;
  // 開く先はエリアで変わるので持たない（ClientStatusPanel が useProjectRoutes().approval で決める。0.26.0）
}

export interface ClientStatus {
  approvals: ClientApprovalRow[];
  /** いまお願いしていること（waiting の節目） */
  waiting: ClientApprovalRow[];
  /** 済んだこと（approved の節目） */
  done: ClientApprovalRow[];
  /** 次にお願いすること（最初の locked の節目） */
  next?: ClientApprovalRow;
  /** お客様の公開承認を待っているページ・お知らせ（MINAMO COFFEE の運用・改善の段階のときだけ。それ以外は 0） */
  publishWaiting: number;
  /** いまお願いしていることの数（waiting の節目 ＋ 公開承認があれば 1） */
  waitingCount: number;
  /** お客様が最後に操作した日時（この案件の分） */
  lastClientAt?: ISODate;
}

/** 「要件定義書の承認」のように、お願いする内容として読む名前 */
export const askTitle = (r: Pick<ClientApprovalRow, 'key' | 'title'>) => (r.key === 'quality' ? `${r.title}（公開前の確認）` : `${r.title}の承認`);

export function clientStatus(state: DemoState, project: Project): ClientStatus {
  const pid = project.id;
  const w = workView(state, pid);
  const req = w.requirements;
  // お願いした日 = 前の節目が終わった日（サイトマップは要件定義書の承認のときに AI が作る。0.29.4）
  const requested: Record<ApprovalKey, ISODate | undefined> = {
    requirements: req.analyzedAt, sitemap: req.approvedAt, design: w.sitemap.approvedAt, quality: w.design.buildCompletedAt,
  };
  // 古い記録（projectId なし）はデモのデータを持つ案件のもの
  const ofProject = (id: string | undefined) => (id ?? CLIENT_PROJECT_ID) === pid;
  const approvals = approvalSteps(w).map((s): ClientApprovalRow => {
    return {
      key: s.key, title: s.title, status: s.status, approvedAt: s.approvedAt, progress: s.progress,
      requestedAt: s.status === 'waiting' ? requested[s.key] : undefined,
    };
  });
  const waiting = approvals.filter((a) => a.status === 'waiting');
  const done = approvals.filter((a) => a.status === 'approved');
  const next = approvals.find((a) => a.status === 'locked');
  const publishWaiting = pid === CLIENT_PROJECT_ID && (project.stage === 'operation' || project.stage === 'improvement')
    ? state.pages.filter((p) => p.status === 'review').length
    : 0;
  // お客様の操作 = この案件のアクティビティ・承認の記録（お客様の担当者）と、品質チェックのお客様側の確認
  const lastClient = state.activities.find((a) => ofProject(a.projectId) && a.actor === ACTOR.client)?.at;
  const lastLog = state.approvalLogs.find((l) => ofProject(l.projectId) && l.side === 'client' && l.actor === ACTOR.client)?.at;
  const lastCheck = Object.values(w.qualityChecks).map((c) => c.clientAt).filter((v): v is string => !!v).sort().pop();
  return {
    approvals, waiting, done, next, publishWaiting,
    waitingCount: waiting.length + (publishWaiting > 0 ? 1 : 0),
    lastClientAt: [lastClient, lastLog, lastCheck].filter((v): v is string => !!v).sort().pop(),
  };
}
