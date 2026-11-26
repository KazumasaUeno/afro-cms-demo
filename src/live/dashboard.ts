import type { Project } from '@/types';
import { LIST_LIMIT, toProject, type ProjectDoc, type ReqStatus } from './model';
import type { LiveRole } from './session';

/**
 * live のダッシュボードの導出（docs/design/LIVE_DASHBOARD_TASKS_CONSULT.md §1.1・§7 U1）。
 * 材料は LiveDataProvider が既に購読している案件一覧だけ（追加の Read 0。新しいコレクション・Rules 変更なし）。
 * 構築状況（タスク。U2）は tasks.ts（taskCounts・myOpenTasks・nextBuildAction）。相談の未対応（U3）・最近のデプロイ（NC-6: live では出さない）はここでは扱わない。
 * 権限の実体は Firestore Rules（一覧の購読が admin は全件・開発者は memberUids の案件だけ）。ここは表示の出し分けだけ
 */

export type DashboardRole = Extract<LiveRole, 'admin' | 'developer'>;

/** 件数を出す順（ヒアリング入力中 → お客様の承認待ち → 承認済み） */
export const REQ_STATUS_ORDER: readonly ReqStatus[] = ['draft', 'analyzed', 'approved'];

/** 要件の状態ごとの案件数（どの状態も 0 で出す） */
export function statusCounts(docs: readonly Pick<ProjectDoc, 'requirements'>[]): Record<ReqStatus, number> {
  const out: Record<ReqStatus, number> = { draft: 0, analyzed: 0, approved: 0 };
  for (const d of docs) out[d.requirements.status] += 1;
  return out;
}

/** 案件のカードに出す値（段階・進捗・次の作業は requirements.status から導く。model.ts の toProject と同じ） */
export function dashboardCards(docs: readonly ProjectDoc[]): Project[] {
  return docs.map(toProject);
}

/** 役割ごとのプロジェクト詳細の置き場所（ProjectsListPage と同じ） */
export function projectBase(role: DashboardRole): '/projects' | '/dev/projects' {
  return role === 'developer' ? '/dev/projects' : '/projects';
}

export interface DashboardCopy {
  eyebrow: string;
  title: string;
  description: string;
  sectionTitle: string;
  empty: { title: string; body: string; action: { to: string; label: string } };
}

/**
 * 画面の文言（admin: 全案件 ／ developer: 担当案件）。
 * 空の表示は demo の開発者ダッシュボードと同じ文言。admin には作成とユーザー管理（担当の割り当て）を案内する（設計 §1.1）
 */
export function dashboardCopy(role: DashboardRole, count: number): DashboardCopy {
  const base = projectBase(role);
  if (role === 'developer') {
    return {
      eyebrow: '開発者画面',
      title: '担当案件',
      description: count
        ? `担当している案件は ${count} 件です。案件を押すと、その案件のプロジェクト詳細を開きます。`
        : '担当している案件はまだありません。',
      sectionTitle: '担当している案件',
      empty: {
        title: '担当している案件がありません',
        body: '開発者画面は、担当の案件だけを開けます。管理者に担当の追加を依頼してください（管理者画面の「ユーザー管理」で設定します）。新しいプロジェクトを作成することもできます。',
        action: { to: `${base}/new`, label: '新しいプロジェクト' },
      },
    };
  }
  return {
    eyebrow: '管理者画面',
    title: 'すべての案件',
    description: count
      ? `プロジェクトは ${count} 件です。案件を押すと、その案件のプロジェクト詳細を開きます。`
      : 'プロジェクトはまだありません。',
    sectionTitle: 'すべての案件',
    empty: {
      title: 'プロジェクトはまだありません',
      body: '新しいプロジェクトを作成すると、ここに表示されます。担当の開発者は作成時に選ぶか、「ユーザー管理」で後から割り当てます。',
      action: { to: `${base}/new`, label: '新しいプロジェクト' },
    },
  };
}

/**
 * 案件一覧が購読の上限（LIST_LIMIT 件。更新の新しい順）に達したときの注記。達していなければ null。
 * 上限ちょうどの件数は「それ以上あるかもしれない」（limit は超過を知らせない）ので、件数の表示と合わせて出す
 */
export function listLimitNote(count: number, max: number = LIST_LIMIT): string | null {
  return count >= max ? `表示は更新の新しい順に上限の ${max} 件までです。それより古いプロジェクトはここに出ません。` : null;
}
