import type { DemoState, QualityCheck } from '@/types';
import { seedActivities, seedProjects } from '@/data/projects';
import { seedSitemap } from '@/data/sitemap';
import { seedPages } from '@/data/cms';
import { seedDiagnoses } from '@/data/insights';
import { QUALITY_ITEMS } from '@/data/quality';
import { seedDev } from '@/data/dev';
import { seedSignage } from '@/data/signage';
import { seedClientAccounts, seedDevAccess } from '@/data/users';
import { daysAgo, hoursAgo } from '@/services/time';

/** dev（0.5.0）・requirements.mode / answerMeta（0.9.0）・signage（0.11.0）・clientAccounts / devAccess（0.13.0）は任意項目のため版を上げていない。古い保存データは既定値で補う */
export const STATE_VERSION = 1;

/** 最初から一部チェック済みにしておく（デモの見栄えのため） */
function seedQualityChecks(): Record<string, QualityCheck> {
  const checks: Record<string, QualityCheck> = {};
  QUALITY_ITEMS.forEach((item, i) => {
    if (item.categoryId === 'qc1' || item.categoryId === 'qc2') {
      checks[item.id] = {
        afroAt: daysAgo(2 - i * 0.05), afroBy: '藤井 慎',
        ...(i % 3 !== 2 ? { clientAt: hoursAgo(20 - i), clientBy: 'ミナモ珈琲 担当者' } : {}),
      };
    } else if (item.categoryId === 'qc5' && item.priority === 'A') {
      checks[item.id] = { afroAt: hoursAgo(9), afroBy: '黒田 蓮' };
    }
  });
  return checks;
}

export const createSeedState = (): DemoState => ({
  version: STATE_VERSION,
  userName: '上野',
  currentProjectId: 'p1',
  projects: seedProjects(),
  requirements: {
    projectId: 'p1',
    answers: {},
    competitors: [],
    status: 'draft',
    mode: 'shared',
    answerMeta: {},
  },
  sitemap: seedSitemap(),
  design: { selected: null },
  qualityChecks: seedQualityChecks(),
  approvalLogs: [
    { id: 'l1', at: hoursAgo(19), actor: 'ミナモ珈琲 担当者', side: 'client', action: 'カテゴリを承認', target: '1. 事業目的・KPI' },
    { id: 'l2', at: daysAgo(1.6), actor: '藤井 慎', side: 'afro', action: 'B区分を一括チェック', target: '2. デザイン・ブランド' },
    { id: 'l3', at: daysAgo(2), actor: '藤井 慎', side: 'afro', action: 'B区分を一括チェック', target: '1. 事業目的・KPI' },
  ],
  pages: seedPages(),
  diagnoses: seedDiagnoses(),
  activities: seedActivities(),
  settings: { reducedMotion: 'system', companyName: 'アフロ株式会社' },
  dev: seedDev(),
  signage: seedSignage(),
  clientAccounts: seedClientAccounts(),
  devAccess: seedDevAccess(),
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
