import type { Deploy, DeployEnv, DevState, DevTask, DevTaskStatus, Stage } from '@/types';
import { BUILD_PAGES } from './designs';
import { memberById } from './members';
import { sitemapFor } from './sitemap';
import { seedDevProjects } from './users';
import { daysAgo, hoursAgo } from '@/services/time';

/** 開発者画面の既定のログインユーザー（ログインしたメールがメンバーに当たらないときに使う。正は features/dev/useDevUser） */
export const DEV_USER_ID = 'm3';

export const DEV_TASK_STATUSES: { id: DevTaskStatus; label: string }[] = [
  { id: 'todo', label: '未着手' },
  { id: 'doing', label: '作業中' },
  { id: 'review', label: 'レビュー待ち' },
  { id: 'done', label: '完了' },
];

export interface DevEnvDef { id: DeployEnv; label: string; url: string }

/** 案件の 3 環境。URL は案件のサイトの URL から作る（2026-11-17 全案件に開発データを持たせたため） */
export function devEnvs(siteUrl: string): DevEnvDef[] {
  let host = 'example.jp';
  try { host = new URL(siteUrl).host || host; } catch { /* 不正な URL は既定のホスト */ }
  return [
    { id: 'development', label: '開発環境', url: `https://dev.${host}` },
    { id: 'staging', label: '検証環境', url: `https://stg.${host}` },
    { id: 'production', label: '本番環境', url: `https://${host}` },
  ];
}

/** 環境の名前を引くための既定（画面に出す URL は devEnvs で案件ごとに作る） */
export const DEV_ENVS: DevEnvDef[] = devEnvs('https://minamo-coffee.example.jp');

export interface DevError { id: string; env: DeployEnv; level: 'error' | 'warning'; message: string; at: string; count: number }

/** 直近のエラー（デモデータ。実際の監視とは連携していない。時刻は表示時点から計算する） */
export function devRecentErrors(): DevError[] {
  return [
    { id: 'e3', env: 'production', level: 'warning', message: '旧サイト: /shop/old-item へのリンク切れ（404）', at: daysAgo(1), count: 27 },
  ];
}

/** MINAMO COFFEE はヒアリング前なので、構築タスクはすべて未着手・デプロイは旧サイトの分だけ（2026-11-12 ユーザー指示） */
export function seedDev(): DevState {
  return seedDevFor('p1', 'hearing');
}

/**
 * 段階の分け方（2026-11-17 会議でスケジュール・リリースの段階を足した。添字で比べると段階を足すたびにずれるので名前で分ける）
 * - before: 制作の前（ヒアリング・要件定義・スケジュール） / build: 制作 / checking: 品質管理・リリース（公開前） / live: 運用・改善
 */
const DEV_PHASE: Record<Stage, 'before' | 'build' | 'checking' | 'live'> = {
  hearing: 'before', requirements: 'before', schedule: 'before', build: 'build', quality: 'checking', release: 'checking', operation: 'live', improvement: 'live',
};

/** 旧サイトの最後の版（案件ごとに少し変える。新サイトは 0.9.x で作り、1.0.0 で公開する） */
const OLD_VERSION: Record<string, string> = { p1: '0.8.0', p2: '0.6.3', p3: '0.4.1', p4: '0.7.2', p5: '0.5.4', p6: '0.3.0', p7: '0.2.1', p8: '0.8.5' };

/**
 * 案件の開発データ（構築タスク・デプロイ）の初期値。段階に合わせる（2026-11-17 ユーザー指示「全プロジェクトに環境デプロイのデモ・構築タスクも」）。
 * - ヒアリング〜スケジュール: タスクはすべて未着手、デプロイは旧サイトの分だけ
 * - 制作: 上に加えて、開発環境に新サイトの土台（v0.9.0）
 * - 品質管理・リリース: タスクはほぼ完了（品質管理は最後の 2 件がレビュー待ち。リリースは全部完了）、開発・検証は最新、本番は旧サイトのまま
 * - 運用・改善: タスクはすべて完了、v1.0.0 で本番公開し、その後の更新も本番まで反映済み
 * ページはその案件のサイトマップの改善後のページ（MINAMO COFFEE は採用デザインの構築ページ）。担当は初期の開発担当から順に割り振る
 */
export function seedDevFor(projectId: string, stage: Stage, devIds?: string[]): DevState {
  const phase = DEV_PHASE[stage];
  const pages = projectId === 'p1' ? BUILD_PAGES : sitemapFor(projectId).after.nodes.map((n) => n.data.label).slice(0, 10);
  // 担当は保存データの開発担当（devIds。作った案件・改善の続きの案件も含む）。渡されなければ初期の担当
  const devs = devIds ?? Object.entries(seedDevProjects()).filter(([, ids]) => ids.includes(projectId)).map(([id]) => id);
  // MINAMO COFFEE は以前の割り振り（黒田 2・佐倉 1 の繰り返し）のまま
  const team = projectId === 'p1' ? ['m3', 'm3', 'm2'] : devs.length ? devs : [DEV_USER_ID];
  const nameOf = (i: number) => memberById(team[i % team.length]).name;
  const tasks: DevTask[] = pages.map((page, i) => ({
    id: `dt${i + 1}`,
    page,
    title: `${page}ページのコーディング`,
    assigneeId: team[i % team.length],
    // リリースの段階は品質管理が終わっているので、タスクも全部完了
    status: phase === 'before' || phase === 'build' ? 'todo' : stage === 'quality' && i >= pages.length - 2 ? 'review' : 'done',
    updatedAt: phase === 'before' || phase === 'build' ? hoursAgo(2 + i * 5) : phase === 'checking' ? hoursAgo(6 + i * 9) : daysAgo(12 + i),
  }));
  const d = (n: number, env: DeployEnv, version: string, when: string, by: string, note: string, status: Deploy['status'] = 'success'): Deploy =>
    ({ id: `dp${n}`, env, version, at: when, by, status, note });
  const old = d(1, 'production', OLD_VERSION[projectId] ?? '0.8.0', daysAgo(phase === 'live' ? 120 : 30), '黒田 蓮', '旧サイトの最終更新');
  // 新しい順（DevState.deploys）
  let deploys: Deploy[] = [old];
  if (phase === 'build') deploys = [d(2, 'development', '0.9.0', daysAgo(1), nameOf(0), '新サイトの土台（共通レイアウト・ルーティング）を準備'), old];
  if (phase === 'checking') {
    deploys = [
      d(8, 'staging', '0.9.4', hoursAgo(10), nameOf(1), 'v0.9.4 を開発環境から昇格'),
      d(7, 'development', '0.9.4', hoursAgo(12), nameOf(0), '品質チェックの指摘（表示崩れ・リンク切れ）を修正'),
      d(6, 'development', '0.9.3', daysAgo(1), nameOf(0), '画像の最適化と OGP の設定', 'failed'),
      d(5, 'staging', '0.9.2', daysAgo(3), nameOf(1), 'v0.9.2 を開発環境から昇格'),
      d(4, 'development', '0.9.2', daysAgo(3.2), nameOf(0), '全ページの構築を反映'),
      d(3, 'development', '0.9.1', daysAgo(10), nameOf(0), '採用デザインのトップ・共通パーツを実装'),
      d(2, 'development', '0.9.0', daysAgo(20), nameOf(0), '新サイトの土台（共通レイアウト・ルーティング）を準備'),
      old,
    ];
  }
  if (phase === 'live') {
    const later: Deploy[] = stage === 'improvement'
      ? [
        d(14, 'production', '1.1.0', daysAgo(0.6), nameOf(1), 'v1.1.0 を検証環境から昇格'),
        d(13, 'staging', '1.1.0', daysAgo(0.8), nameOf(1), 'v1.1.0 を開発環境から昇格'),
        d(12, 'development', '1.1.0', daysAgo(1), nameOf(0), 'AIサイト診断の改善提案を反映（トップの導線・表示速度）'),
      ]
      : [];
    deploys = [
      ...later,
      d(11, 'production', '1.0.1', daysAgo(2), nameOf(1), 'v1.0.1 を検証環境から昇格'),
      d(10, 'staging', '1.0.1', daysAgo(2.2), nameOf(1), 'v1.0.1 を開発環境から昇格'),
      d(9, 'development', '1.0.1', daysAgo(2.5), nameOf(0), '公開後の軽微な修正（お知らせ一覧の表示）'),
      d(8, 'production', '1.0.0', daysAgo(5), nameOf(1), '新サイトを公開（v1.0.0 を検証環境から昇格）'),
      d(7, 'staging', '1.0.0', daysAgo(5.2), nameOf(1), 'v1.0.0 を開発環境から昇格'),
      d(6, 'staging', '1.0.0', daysAgo(5.3), nameOf(1), '検証環境への反映がタイムアウト（再実行で成功）', 'failed'),
      d(5, 'development', '1.0.0', daysAgo(5.5), nameOf(0), '品質チェックの指摘をすべて反映'),
      d(4, 'staging', '0.9.4', daysAgo(9), nameOf(1), 'v0.9.4 を開発環境から昇格'),
      d(3, 'development', '0.9.4', daysAgo(9.2), nameOf(0), '全ページの構築を反映'),
      d(2, 'development', '0.9.0', daysAgo(25), nameOf(0), '新サイトの土台（共通レイアウト・ルーティング）を準備'),
      old,
    ];
  }
  return { projectId, tasks, deploys };
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

/** デプロイできない理由の種類（latest: 反映済み／blocked: 前段が未反映など／needsApproval: お客様のデザイン承認待ち） */
export type DeployGateKind = 'latest' | 'blocked' | 'needsApproval';

export interface DeployGate { ok: boolean; reason?: string; version?: string; kind?: DeployGateKind }

/**
 * デプロイできるか（理由つき）。
 * - development: いつでも新しいバージョンを作る
 * - staging: 開発環境の最新成功版を昇格する
 * - production: 検証環境の最新成功版が開発環境の最新成功版と一致し、かつトップデザインが承認済み
 * kind は ok=false のときだけ付く（表示の出し分け用。保存データには含めない）
 */
export function deployGate(dev: DevState, env: DeployEnv, designApprovedAt: string | undefined): DeployGate {
  const devLatest = latestSuccess(dev.deploys, 'development');
  const stgLatest = latestSuccess(dev.deploys, 'staging');
  if (env === 'development') return { ok: true, version: nextVersion(dev.deploys) };
  if (env === 'staging') {
    if (!devLatest) return { ok: false, kind: 'blocked', reason: '開発環境に成功したデプロイがありません' };
    if (stgLatest?.version === devLatest.version) return { ok: false, kind: 'latest', reason: `検証環境は最新（v${devLatest.version}）です` };
    return { ok: true, version: devLatest.version };
  }
  if (!devLatest || !stgLatest || stgLatest.version !== devLatest.version) {
    return { ok: false, kind: 'blocked', reason: `先に開発環境の最新版${devLatest ? `（v${devLatest.version}）` : ''}を検証環境へ反映してください` };
  }
  if (!designApprovedAt) return { ok: false, kind: 'needsApproval', reason: 'お客様のトップデザイン承認がまだです（お客様ポータルの「確認・承認」）' };
  const prodLatest = latestSuccess(dev.deploys, 'production');
  if (prodLatest?.version === stgLatest.version) return { ok: false, kind: 'latest', reason: `本番環境は最新（v${stgLatest.version}）です` };
  return { ok: true, version: stgLatest.version };
}
