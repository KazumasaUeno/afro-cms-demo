import type { Activity, Project, Stage } from '@/types';
import type { DevPerson } from './people';
import { daysAgo, daysFromNow, hoursAgo } from '@/services/time';

export const STAGES: { id: Stage; no: number; label: string; en: string; description: string }[] = [
  { id: 'requirements', no: 1, label: '要件定義', en: 'Discover', description: '現状と目的をAIと一緒に整理し、要件定義書をつくる' },
  { id: 'build', no: 2, label: '制作', en: 'Build', description: 'サイトマップ・デザイン案・全ページ構築を承認しながら進める' },
  { id: 'quality', no: 3, label: '品質管理', en: 'Assure', description: '12項目110問をアフロと顧客の双方で確認する' },
  { id: 'operation', no: 4, label: '運用', en: 'Operate', description: 'ページ更新・お知らせ・公開ワークフローを回す' },
  { id: 'improvement', no: 5, label: '改善', en: 'Improve', description: '4か月ごとにAIがサイトを診断し、改善を提案する' },
];

export const stageIndex = (s: Stage) => STAGES.findIndex((x) => x.id === s);

/** デモ用の架空の顧客・サイト（実在の企業ではない） */
export const seedProjects = (): Project[] => [
  {
    id: 'p1', clientName: '株式会社ミナモ珈琲', siteName: 'MINAMO COFFEE', siteUrl: 'https://minamo-coffee.example.jp',
    industry: '飲食・EC', stage: 'requirements', progress: 12, ownerId: 'm1', updatedAt: hoursAgo(1.5),
    // デモは要件定義（AI ウィザード）から始めるので、初期の要件データ（draft）と段階をそろえる
    nextAction: 'AI要件定義を始める', accent: '#B45309', launchDate: daysFromNow(38), pendingApprovals: 2,
  },
  {
    id: 'p2', clientName: '北条建設株式会社', siteName: 'HOJO Construction', siteUrl: 'https://hojo-kensetsu.example.jp',
    industry: '建設・不動産', stage: 'quality', progress: 72, ownerId: 'm5', updatedAt: hoursAgo(5),
    nextAction: '品質チェック（顧客側）の承認待ち', accent: '#1D4ED8', launchDate: daysFromNow(12), pendingApprovals: 4,
  },
  {
    id: 'p3', clientName: 'ひだまり歯科クリニック', siteName: 'Hidamari Dental', siteUrl: 'https://hidamari-dental.example.jp',
    industry: '医療', stage: 'requirements', progress: 18, ownerId: 'm2', updatedAt: daysAgo(1),
    nextAction: '要件ヒアリング（競合サイトの入力）', accent: '#0D9488', pendingApprovals: 0,
  },
  {
    id: 'p4', clientName: 'Lumière Atelier', siteName: 'Lumière Bridal', siteUrl: 'https://lumiere-bridal.example.jp',
    industry: 'ブライダル', stage: 'operation', progress: 88, ownerId: 'm4', updatedAt: daysAgo(2),
    nextAction: '秋フェアのお知らせを予約公開', accent: '#BE185D', pendingApprovals: 1,
  },
  {
    id: 'p5', clientName: 'ソラノ精機株式会社', siteName: 'SORANO Precision', siteUrl: 'https://sorano-seiki.example.jp',
    industry: '製造業', stage: 'improvement', progress: 100, ownerId: 'm3', updatedAt: daysAgo(4),
    nextAction: '第2回 AI改善診断のレポート送付', accent: '#475569', pendingApprovals: 0,
  },
  {
    id: 'p6', clientName: '一般社団法人まちの学び舎', siteName: 'Machi no Manabiya', siteUrl: 'https://manabiya.example.org',
    industry: '教育・NPO', stage: 'build', progress: 31, ownerId: 'm2', updatedAt: daysAgo(3),
    nextAction: 'サイトマップの承認', accent: '#7C3AED', launchDate: daysFromNow(64), pendingApprovals: 1,
  },
];

export const seedActivities = (): Activity[] => [
  { id: 'a1', at: hoursAgo(0.4), actor: 'AI', text: 'MINAMO COFFEE のデザイン案を3パターン生成しました', kind: 'ai', projectId: 'p1' },
  { id: 'a2', at: hoursAgo(1.2), actor: '佐倉 美緒', text: 'トップページのファーストビューを更新', kind: 'edit', projectId: 'p1' },
  { id: 'a3', at: hoursAgo(3), actor: '北条建設 担当者', text: '品質チェック「デザイン・ブランド」を承認', kind: 'approve', projectId: 'p2' },
  { id: 'a4', at: hoursAgo(6), actor: '森 あかり', text: '「秋のブライダルフェア」を予約公開に設定', kind: 'publish', projectId: 'p4' },
  { id: 'a5', at: daysAgo(1), actor: '藤井 慎', text: 'A区分 24項目を一括チェック', kind: 'check', projectId: 'p2' },
  { id: 'a6', at: daysAgo(1.3), actor: 'AI', text: 'SORANO Precision の第2回改善診断を作成（スコア 78）', kind: 'ai', projectId: 'p5' },
  { id: 'a7', at: daysAgo(2), actor: '上野 航', text: 'まちの学び舎のサイトマップ案にコメント', kind: 'comment', projectId: 'p6' },
];

/* ---------- プロジェクトの登録・編集（管理者画面） ---------- */

export const PROJECT_LIMITS = { siteName: 40, clientName: 40, industry: 20, siteUrl: 200 } as const;

/** 登録・編集ダイアログの入力（launchDate は日付入力の値 YYYY-MM-DD。空なら未定。devIds は開発担当の人の id） */
export interface ProjectDraft {
  id?: string;
  siteName: string;
  clientName: string;
  industry: string;
  siteUrl: string;
  ownerId: string;
  launchDate: string;
  devIds: string[];
}
export type ProjectField = 'siteName' | 'clientName' | 'industry' | 'siteUrl' | 'ownerId' | 'launchDate';

/** サイト名の比較用（前後・全角の空白、大小文字を吸収） */
export const normalizeSiteName = (v: string) => v.replace(/　/g, ' ').trim().replace(/\s+/g, ' ').toLowerCase();

/** http(s) の URL か（ホスト名に「.」を含むもの） */
export function isHttpUrl(v: string): boolean {
  try {
    const u = new URL(v.trim());
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.includes('.') && !/\s/.test(v.trim());
  } catch {
    return false;
  }
}

const pad = (n: number) => String(n).padStart(2, '0');
/** ISO の日時 → 日付入力の値（この端末の日付。未設定は空） */
export const toDateInput = (iso: string | undefined): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
/** 日付入力の値 → ISO（この端末の 0 時。空・不正は undefined） */
export const fromDateInput = (v: string): string | undefined => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const d = new Date(`${v}T00:00:00`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
};
export const todayInput = (): string => toDateInput(new Date().toISOString());

/**
 * 画面と reducer の両方で使うプロジェクトの入力チェック。
 * サイト名の重複は id が違うプロジェクトとだけ比べる。公開予定日は今日以降（編集で、もともとの日付のまま保存する場合は過去でもよい）
 */
export function validateProject(d: ProjectDraft, projects: Project[], ownerIds: string[]): Partial<Record<ProjectField, string>> {
  const e: Partial<Record<ProjectField, string>> = {};
  const siteName = d.siteName.trim();
  const clientName = d.clientName.trim();
  const industry = d.industry.trim();
  const siteUrl = d.siteUrl.trim();
  if (!siteName) e.siteName = 'サイト名を入力してください';
  else if (siteName.length > PROJECT_LIMITS.siteName) e.siteName = `${PROJECT_LIMITS.siteName}文字以内で入力してください`;
  else if (projects.some((p) => p.id !== d.id && normalizeSiteName(p.siteName) === normalizeSiteName(siteName))) e.siteName = 'このサイト名のプロジェクトはすでに登録されています';
  if (!clientName) e.clientName = 'お客様の会社名を入力してください';
  else if (clientName.length > PROJECT_LIMITS.clientName) e.clientName = `${PROJECT_LIMITS.clientName}文字以内で入力してください`;
  if (!industry) e.industry = '業種を入力してください';
  else if (industry.length > PROJECT_LIMITS.industry) e.industry = `${PROJECT_LIMITS.industry}文字以内で入力してください`;
  if (!siteUrl) e.siteUrl = '現行サイトのURLを入力してください';
  else if (siteUrl.length > PROJECT_LIMITS.siteUrl || !isHttpUrl(siteUrl)) e.siteUrl = 'URLの形式が正しくありません（例: https://example.jp）';
  if (!ownerIds.includes(d.ownerId)) e.ownerId = '担当ディレクターを選んでください';
  if (d.launchDate) {
    const prev = d.id ? toDateInput(projects.find((p) => p.id === d.id)?.launchDate) : '';
    if (!fromDateInput(d.launchDate)) e.launchDate = '日付の形式が正しくありません';
    else if (d.launchDate < todayInput() && d.launchDate !== prev) e.launchDate = '今日以降の日付を選んでください';
  }
  return e;
}

/** 新しいプロジェクトのブランド色（白い文字が読める濃さ。ほかのプロジェクトが使っていない色から順に。使い切ったら順番に回す） */
const ACCENT_PALETTE = ['#0E7490', '#15803D', '#9333EA', '#C2410C', '#4338CA', '#B91C1C', '#A16207', '#0F766E'];
export function pickAccent(projects: Project[]): string {
  const used = new Set(projects.map((p) => p.accent.toUpperCase()));
  return ACCENT_PALETTE.find((c) => !used.has(c.toUpperCase())) ?? ACCENT_PALETTE[projects.length % ACCENT_PALETTE.length];
}

/** 業種の候補（登録済みのプロジェクトの業種。重複を除き、登録順） */
export const industryOptions = (projects: Project[]): string[] => [...new Set(projects.map((p) => p.industry.trim()).filter(Boolean))];

/** 保存されているプロジェクト → 編集ダイアログの入力（開発担当は無効にしていない人のうち、このプロジェクトを担当している人） */
export function projectDraftOf(p: Project, people: DevPerson[], devProjects: Record<string, string[]>): ProjectDraft {
  return {
    id: p.id, siteName: p.siteName, clientName: p.clientName, industry: p.industry, siteUrl: p.siteUrl, ownerId: p.ownerId,
    launchDate: toDateInput(p.launchDate),
    devIds: people.filter((m) => !m.disabled && devProjects[m.id]?.includes(p.id)).map((m) => m.id),
  };
}

/** 入力 → 保存する項目（公開予定日を変えていなければ元の値〔時刻つき〕のまま） */
export function projectFields(d: ProjectDraft, prev?: Project): Pick<Project, 'siteName' | 'clientName' | 'industry' | 'siteUrl' | 'ownerId' | 'launchDate'> {
  return {
    siteName: d.siteName.trim(), clientName: d.clientName.trim(), industry: d.industry.trim(), siteUrl: d.siteUrl.trim(), ownerId: d.ownerId,
    launchDate: prev && toDateInput(prev.launchDate) === d.launchDate ? prev.launchDate : fromDateInput(d.launchDate),
  };
}

/** 編集で何が変わったか（画面の通知と reducer の記録で同じ判定を使う。before は projectDraftOf で作ったもの） */
export function projectChanged(before: ProjectDraft, d: ProjectDraft): { fields: boolean; devs: boolean } {
  const fields = before.siteName !== d.siteName.trim() || before.clientName !== d.clientName.trim() || before.industry !== d.industry.trim()
    || before.siteUrl !== d.siteUrl.trim() || before.ownerId !== d.ownerId || before.launchDate !== d.launchDate;
  const devs = before.devIds.length !== d.devIds.length || before.devIds.some((id) => !d.devIds.includes(id));
  return { fields, devs };
}
