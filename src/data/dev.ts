import type { Deploy, DeployEnv, DevState, DevTask, DevTaskStatus } from '@/types';
import { BUILD_PAGES } from './designs';
import { daysAgo, hoursAgo } from '@/services/time';

/** 開発者画面のログインユーザー（デモでは固定） */
export const DEV_USER_ID = 'm3';

export const DEV_TASK_STATUSES: { id: DevTaskStatus; label: string }[] = [
  { id: 'todo', label: '未着手' },
  { id: 'doing', label: '作業中' },
  { id: 'review', label: 'レビュー待ち' },
  { id: 'done', label: '完了' },
];

export const DEV_ENVS: { id: DeployEnv; label: string; url: string }[] = [
  { id: 'development', label: '開発環境', url: 'https://dev.minamo-coffee.example.jp' },
  { id: 'staging', label: '検証環境', url: 'https://stg.minamo-coffee.example.jp' },
  { id: 'production', label: '本番環境', url: 'https://minamo-coffee.example.jp' },
];

export interface DevError { id: string; env: DeployEnv; level: 'error' | 'warning'; message: string; at: string; count: number }

/** 直近のエラー（デモデータ。実際の監視とは連携していない。時刻は表示時点から計算する） */
export function devRecentErrors(): DevError[] {
  return [
    { id: 'e1', env: 'staging', level: 'warning', message: 'オンラインショップ: 商品画像の読み込みに 2.4 秒かかっています', at: hoursAgo(3), count: 12 },
    { id: 'e2', env: 'development', level: 'error', message: 'お問い合わせ: 送信後の完了画面へ移動しません', at: hoursAgo(6), count: 3 },
    { id: 'e3', env: 'production', level: 'warning', message: '旧サイト: /shop/old-item へのリンク切れ（404）', at: daysAgo(1), count: 27 },
  ];
}

const STATUS_CYCLE: DevTaskStatus[] = ['done', 'done', 'review', 'doing', 'doing', 'todo', 'review', 'todo', 'todo'];

export function seedDev(): DevState {
  const tasks: DevTask[] = BUILD_PAGES.map((page, i) => ({
    id: `dt${i + 1}`,
    page,
    title: `${page}ページのコーディング`,
    assigneeId: i % 3 === 2 ? 'm2' : 'm3',
    status: STATUS_CYCLE[i % STATUS_CYCLE.length],
    updatedAt: hoursAgo(2 + i * 5),
  }));
  const deploys: Deploy[] = [
    { id: 'dp5', env: 'development', version: '0.9.3', at: hoursAgo(2), by: '黒田 蓮', status: 'success', note: 'ストーリーページのレイアウト調整' },
    { id: 'dp4', env: 'development', version: '0.9.2', at: hoursAgo(9), by: '佐倉 美緒', status: 'failed', note: 'ビルドエラー（画像の参照先が見つからない）' },
    { id: 'dp3', env: 'staging', version: '0.9.1', at: daysAgo(1), by: '黒田 蓮', status: 'success', note: 'トップページをお客様確認用に反映' },
    { id: 'dp2', env: 'development', version: '0.9.1', at: daysAgo(1.2), by: '黒田 蓮', status: 'success', note: 'トップページの実装' },
    { id: 'dp1', env: 'production', version: '0.8.0', at: daysAgo(30), by: '黒田 蓮', status: 'success', note: '旧サイトの最終更新' },
  ];
  return { tasks, deploys };
}

/** 環境ごとの最新の成功デプロイ */
export function latestSuccess(deploys: Deploy[], env: DeployEnv): Deploy | undefined {
  return deploys.find((d) => d.env === env && d.status === 'success');
}

/** 環境ごとの最新のデプロイ（失敗含む） */
export function latestDeploy(deploys: Deploy[], env: DeployEnv): Deploy | undefined {
  return deploys.find((d) => d.env === env);
}

/** 全履歴の中で最大のバージョンの次（パッチを 1 上げる） */
export function nextVersion(deploys: Deploy[]): string {
  const max = deploys.reduce<number[]>((acc, d) => {
    const v = d.version.split('.').map((n) => Number(n) || 0);
    for (let i = 0; i < 3; i++) {
      if ((v[i] ?? 0) !== (acc[i] ?? 0)) return (v[i] ?? 0) > (acc[i] ?? 0) ? v : acc;
    }
    return acc;
  }, [0, 0, 0]);
  return `${max[0]}.${max[1]}.${(max[2] ?? 0) + 1}`;
}

/**
 * デプロイできるか（理由つき）。
 * - development: いつでも新しいバージョンを作る
 * - staging: 開発環境の最新成功版を昇格する
 * - production: 検証環境の最新成功版が開発環境の最新成功版と一致し、かつトップデザインが承認済み
 */
export function deployGate(dev: DevState, env: DeployEnv, designApprovedAt: string | undefined): { ok: boolean; reason?: string; version?: string } {
  const devLatest = latestSuccess(dev.deploys, 'development');
  const stgLatest = latestSuccess(dev.deploys, 'staging');
  if (env === 'development') return { ok: true, version: nextVersion(dev.deploys) };
  if (env === 'staging') {
    if (!devLatest) return { ok: false, reason: '開発環境に成功したデプロイがありません' };
    if (stgLatest?.version === devLatest.version) return { ok: false, reason: `検証環境は最新（v${devLatest.version}）です` };
    return { ok: true, version: devLatest.version };
  }
  if (!devLatest || !stgLatest || stgLatest.version !== devLatest.version) {
    return { ok: false, reason: `先に開発環境の最新版${devLatest ? `（v${devLatest.version}）` : ''}を検証環境へ反映してください` };
  }
  if (!designApprovedAt) return { ok: false, reason: 'お客様のトップデザイン承認がまだです（お客様ポータルの「確認・承認」）' };
  const prodLatest = latestSuccess(dev.deploys, 'production');
  if (prodLatest?.version === stgLatest.version) return { ok: false, reason: `本番環境は最新（v${stgLatest.version}）です` };
  return { ok: true, version: stgLatest.version };
}
