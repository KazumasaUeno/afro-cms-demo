import type { DemoState } from '@/types';
import { clientActorName, seedActivities, seedProjects } from '@/data/projects';
import { emptySitemap } from '@/data/sitemap';
import { seedDev } from '@/data/dev';
import { seedContentFor } from '@/data/projectContent';
import { DEV_SEED_REV, seedClientAccounts, seedDevAccess, seedDevProjects } from '@/data/users';
import { approvalLogsFromWork, blankRequirements, seedWorkFor } from './projectWork';
import { jstYmd } from '@/features/home/homeDues';

/** dev（0.5.0）・requirements.mode / answerMeta（0.9.0）・signage（0.11.0）・clientAccounts / devAccess（0.13.0）・devProjects（0.14.0）は任意項目のため版を上げていない。古い保存データは既定値で補う */
export const STATE_VERSION = 1;

/** MINAMO COFFEE 以外の案件の制作データ（段階より前は入力・承認済み。0.29.0）と公開後のデータ（0.30.0） */
const seedProjectWork = (): DemoState['projectWork'] =>
  Object.fromEntries(seedProjects().filter((p) => p.id !== 'p1').map((p) => [p.id, seedWorkFor(p.id, p.stage)]));

// MINAMO COFFEE の公開後のデータ（ページ・診断・サイネージ）。ヒアリング前でも従来の見本を持ち、運用の段階になると画面に出る（0.30.0）
const p1Content = () => seedContentFor('p1');

/**
 * ほかの案件の承認の記録（承認履歴）。初期データの済んだ節目から作る（2026-11-17 会議「承認履歴が空」。以前は全案件で空）。
 * 品質チェック画面の承認履歴は案件で絞って出す（approvalLogsOf）ので、ほかの案件の記録を置いても混ざらない
 */
const seedApprovalLogs = (work: NonNullable<DemoState['projectWork']>): DemoState['approvalLogs'] =>
  seedProjects()
    .filter((p) => work[p.id])
    .flatMap((p) => approvalLogsFromWork(p.id, work[p.id], clientActorName(p.clientName)))
    .sort((a, b) => b.at.localeCompare(a.at));

export const createSeedState = (): DemoState => {
  const projectWork = seedProjectWork() ?? {};
  return {
    version: STATE_VERSION,
    // 新しい初期データは日程・承認の依頼・承認履歴を最初から持つので、補わない（0.41.0）
    scheduleMigrated: true,
    // 初期データを作った日（日本時間）。読み込みのたびに今日との差だけ日付をずらす（seedAnchor.ts。2026-11-24）
    seedAnchor: jstYmd(new Date()),
    userName: '上野',
    currentProjectId: 'p1',
    projects: seedProjects(),
    // 受託開発ではアフロ（ディレクター）がヒアリングして全問を入力する（2026-11-10 決定）
    requirements: blankRequirements('p1'),
    // サイトマップは要件定義書の承認のときに作る（はじめは無い。0.29.4）
    sitemap: emptySitemap(),
    design: { selected: null },
    // ミナモ珈琲（デモの案件）はヒアリング前なので、品質チェックと承認の記録は空から始める（2026-11-12 ユーザー指示）
    qualityChecks: {},
    projectWork,
    // ミナモ珈琲の承認の記録は空から始める。ほかの案件は済んだ節目の記録を置く（2026-11-17 会議）
    approvalLogs: seedApprovalLogs(projectWork),
    ...p1Content(),
    activities: seedActivities(),
    settings: { reducedMotion: 'system', companyName: 'アフロ株式会社' },
    dev: seedDev(),
    clientAccounts: seedClientAccounts(),
    devAccess: seedDevAccess(),
    devProjects: seedDevProjects(),
    devSeed: DEV_SEED_REV,
  };
};

export function isDemoState(v: unknown): v is DemoState {
  if (!v || typeof v !== 'object') return false;
  const s = v as Partial<DemoState>;
  return (
    s.version === STATE_VERSION &&
    Array.isArray(s.projects) && s.projects.length > 0 &&
    Array.isArray(s.pages) &&
    Array.isArray(s.activities) &&
    Array.isArray(s.diagnoses) &&
    Array.isArray(s.approvalLogs) &&
    !!s.sitemap && Array.isArray(s.sitemap.before?.nodes) && Array.isArray(s.sitemap.after?.nodes) &&
    !!s.requirements && typeof s.requirements.answers === 'object' &&
    !!s.design && !!s.settings && typeof s.qualityChecks === 'object'
  );
}
