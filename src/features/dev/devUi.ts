import type { DeployEnv, DevState, DevTaskStatus } from '@/types';
import type { PillTone } from '@/components/ui';
import { DEV_ENVS, DEV_TASK_STATUSES, DEV_USER_ID, latestDeploy, latestSuccess } from '@/data/dev';

/** 開発者画面の共通表示（状態の色と名前） */
export const TASK_TONE: Record<DevTaskStatus, PillTone> = { todo: 'neutral', doing: 'info', review: 'warning', done: 'success' };

export const taskLabel = (s: DevTaskStatus) => DEV_TASK_STATUSES.find((x) => x.id === s)?.label ?? s;

export const envDef = (env: DeployEnv) => DEV_ENVS.find((e) => e.id === env) ?? DEV_ENVS[0];

/** 環境の印の色（本番は AI ではないので accent を使わない） */
export const ENV_TONE: Record<DeployEnv, PillTone> = { development: 'neutral', staging: 'info', production: 'primary' };

/** 「次の状態へ進める」ボタンの文言（done は進める先がない） */
export const NEXT_STATUS: Partial<Record<DevTaskStatus, { to: DevTaskStatus; label: string }>> = {
  todo: { to: 'doing', label: '作業を始める' },
  doing: { to: 'review', label: 'レビューに出す' },
  review: { to: 'done', label: '完了にする' },
};

/**
 * 環境が「最新か」（前回のデプロイ結果ではなく、前段の最新成功版に追いついているか）。
 * 既存の latestSuccess / latestDeploy から算出する。データは変えない。
 */
export function envSync(dev: DevState, env: DeployEnv): { tone: PillTone; label: string } {
  const last = latestDeploy(dev.deploys, env);
  if (!last) return { tone: 'neutral', label: '未デプロイ' };
  if (env === 'development') return last.status === 'failed' ? { tone: 'danger', label: '前回失敗' } : { tone: 'neutral', label: '最新版' };
  const upstream = latestSuccess(dev.deploys, env === 'staging' ? 'development' : 'staging');
  const mine = latestSuccess(dev.deploys, env);
  return upstream && mine && upstream.version === mine.version ? { tone: 'success', label: '最新' } : { tone: 'warning', label: '未反映あり' };
}

export interface DevAction { title: string; cta?: string; to?: string }

/**
 * ダッシュボードの「次にやること」。上から最初に当てはまる 1 件。
 * 本番への公開可否はお客様のデザイン承認に依存する（deployGate と同じ条件）
 */
export function nextDevAction(dev: DevState, designApproved: boolean, userId: string = DEV_USER_ID): DevAction {
  const devLast = latestDeploy(dev.deploys, 'development');
  if (devLast?.status === 'failed') return { title: '開発環境のビルドが失敗しています', cta: 'デプロイ履歴を見る', to: '/dev/deploys' };
  const devOk = latestSuccess(dev.deploys, 'development');
  const stgOk = latestSuccess(dev.deploys, 'staging');
  if (devOk && devOk.version !== stgOk?.version) return { title: `v${devOk.version} を検証環境へ反映しましょう`, cta: '検証環境へ反映する', to: '/dev/deploys' };
  const prodOk = latestSuccess(dev.deploys, 'production');
  if (stgOk && stgOk.version !== prodOk?.version) {
    return designApproved
      ? { title: `v${stgOk.version} を本番環境へ公開できます`, cta: '本番へ公開する', to: '/dev/deploys' }
      : { title: `v${stgOk.version} はお客様のデザイン承認待ちです（承認後に本番へ公開できます）`, cta: '環境・デプロイを見る', to: '/dev/deploys' };
  }
  const review = dev.tasks.filter((t) => t.assigneeId === userId && t.status === 'review').length;
  if (review > 0) return { title: `レビュー待ちが ${review} 件あります`, cta: 'タスクを見る', to: '/dev/tasks' };
  if (!dev.checksRunAt) return { title: '自動チェックがまだです', cta: '自動チェックを実行する', to: '/dev/checks' };
  return { title: '今すぐ対応が必要なものはありません' };
}
