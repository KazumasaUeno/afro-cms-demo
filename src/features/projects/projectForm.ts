import type { Project } from '@/types';
import { MEMBERS } from '@/data/members';
import { validateUrl } from '@/features/requirements/validation';

/**
 * 新しいプロジェクトの入力（画面と reducer の両方で使う）。
 * 段階・進捗は入力させない（作成時は必ず要件定義・0%から始める）
 */
export interface ProjectDraft {
  clientName: string;
  siteName: string;
  siteUrl: string;
  industry: string;
  ownerId: string;
  accent: string;
  /** yyyy-mm-dd（空なら未定） */
  launchDate: string;
  /** 空なら DEFAULT_NEXT_ACTION */
  nextAction: string;
}
export type ProjectField = keyof ProjectDraft;

export const PROJECT_LIMITS = { clientName: 40, siteName: 40, industry: 20, nextAction: 40 } as const;

export const DEFAULT_NEXT_ACTION = 'AI要件定義を始める';

export const INDUSTRY_SUGGESTIONS = ['飲食・EC', '建設・不動産', '医療', 'ブライダル', '製造業', '教育・NPO', '美容・サロン', '士業・コンサル'];

/** ブランド色の候補（どれも白い文字を載せて読める濃さ） */
export const ACCENT_PRESETS: { value: string; name: string }[] = [
  { value: '#B45309', name: 'アンバー' },
  { value: '#C2410C', name: 'テラコッタ' },
  { value: '#BE185D', name: 'ローズ' },
  { value: '#7C3AED', name: 'バイオレット' },
  { value: '#1D4ED8', name: 'ブルー' },
  { value: '#0D9488', name: 'ティール' },
  { value: '#15803D', name: 'グリーン' },
  { value: '#475569', name: 'スレート' },
];

export const emptyProjectDraft = (ownerId: string = MEMBERS[0].id): ProjectDraft => ({
  clientName: '', siteName: '', siteUrl: '', industry: '', ownerId, accent: ACCENT_PRESETS[0].value, launchDate: '', nextAction: '',
});

/** 重複の判定に使うホスト名（大小文字と先頭の www. を無視する）。URL として読めなければ null */
export function siteHost(url: string): string | null {
  try {
    return new URL(url.trim()).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** 端末の日付で今日（yyyy-mm-dd） */
export function todayYmd(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** yyyy-mm-dd を ISO 文字列に（日付がずれないよう端末の時刻で正午にする）。実在しない日付は null */
export function ymdToIso(ymd: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d, 12);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date.toISOString();
}

/** 画面と reducer の両方で使う入力チェック（URL の重複は既存のすべてのプロジェクトと比べる） */
export function validateProject(d: ProjectDraft, projects: Project[]): Partial<Record<ProjectField, string>> {
  const e: Partial<Record<ProjectField, string>> = {};
  const clientName = d.clientName.trim();
  const siteName = d.siteName.trim();
  const industry = d.industry.trim();
  const nextAction = d.nextAction.trim();
  const launchDate = d.launchDate.trim();

  if (!clientName) e.clientName = 'お客様の会社名を入力してください';
  else if (clientName.length > PROJECT_LIMITS.clientName) e.clientName = `${PROJECT_LIMITS.clientName}文字以内で入力してください`;
  if (!siteName) e.siteName = 'サイト名を入力してください';
  else if (siteName.length > PROJECT_LIMITS.siteName) e.siteName = `${PROJECT_LIMITS.siteName}文字以内で入力してください`;

  const urlError = validateUrl(d.siteUrl);
  if (urlError) e.siteUrl = urlError;
  else {
    const host = siteHost(d.siteUrl);
    if (host && projects.some((p) => siteHost(p.siteUrl) === host)) e.siteUrl = 'このURLのプロジェクトはすでにあります';
  }

  if (!industry) e.industry = '業種を入力してください';
  else if (industry.length > PROJECT_LIMITS.industry) e.industry = `${PROJECT_LIMITS.industry}文字以内で入力してください`;
  if (!MEMBERS.some((m) => m.id === d.ownerId)) e.ownerId = '担当者を選んでください';
  if (!ACCENT_PRESETS.some((a) => a.value === d.accent)) e.accent = 'ブランド色を選んでください';
  if (launchDate) {
    if (!ymdToIso(launchDate)) e.launchDate = '日付の形式を確認してください';
    else if (launchDate < todayYmd()) e.launchDate = '今日以降の日付を選んでください';
  }
  if (nextAction.length > PROJECT_LIMITS.nextAction) e.nextAction = `${PROJECT_LIMITS.nextAction}文字以内で入力してください`;
  return e;
}

/** 入力から作るプロジェクト（id・更新日時以外）。reducer と画面のプレビューで同じ形にする */
export function projectFromDraft(d: ProjectDraft): Omit<Project, 'id' | 'updatedAt'> {
  const launchIso = d.launchDate.trim() ? ymdToIso(d.launchDate.trim()) : null;
  return {
    clientName: d.clientName.trim(),
    siteName: d.siteName.trim(),
    siteUrl: d.siteUrl.trim(),
    industry: d.industry.trim(),
    stage: 'requirements',
    progress: 0,
    ownerId: d.ownerId,
    nextAction: d.nextAction.trim() || DEFAULT_NEXT_ACTION,
    accent: d.accent,
    ...(launchIso ? { launchDate: launchIso } : {}),
    pendingApprovals: 0,
  };
}
