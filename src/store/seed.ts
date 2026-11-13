import type { DemoState } from '@/types';
import { seedActivities, seedProjects } from '@/data/projects';
import { emptySitemap } from '@/data/sitemap';
import { seedDev } from '@/data/dev';
import { seedContentFor } from '@/data/projectContent';
import { seedClientAccounts, seedDevAccess, seedDevProjects } from '@/data/users';
import { blankRequirements, seedWorkFor } from './projectWork';

/** dev（0.5.0）・requirements.mode / answerMeta（0.9.0）・signage（0.11.0）・clientAccounts / devAccess（0.13.0）・devProjects（0.14.0）は任意項目のため版を上げていない。古い保存データは既定値で補う */
export const STATE_VERSION = 1;

/** MINAMO COFFEE 以外の案件の制作データ（段階より前は入力・承認済み。0.29.0）と公開後のデータ（0.30.0） */
const seedProjectWork = (): DemoState['projectWork'] =>
  Object.fromEntries(seedProjects().filter((p) => p.id !== 'p1').map((p) => [p.id, seedWorkFor(p.id, p.stage)]));

// MINAMO COFFEE の公開後のデータ（ページ・診断・サイネージ）。ヒアリング前でも従来の見本を持ち、運用の段階になると画面に出る（0.30.0）
const p1Content = () => seedContentFor('p1');

export const createSeedState = (): DemoState => ({
  version: STATE_VERSION,
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
  projectWork: seedProjectWork(),
  // 承認の記録も空から始める（品質チェック画面の承認履歴は案件で絞らずに出すため、他の案件の記録も置かない）
  approvalLogs: [],
  ...p1Content(),
  activities: seedActivities(),
  settings: { reducedMotion: 'system', companyName: 'アフロ株式会社' },
  dev: seedDev(),
  clientAccounts: seedClientAccounts(),
  devAccess: seedDevAccess(),
  devProjects: seedDevProjects(),
});

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
