import type { Project, ProjectClient, ProjectDraft } from '@/types';
import { MEMBERS } from '@/data/members';
import { CLIENT_LIMITS, EMAIL_RE, normalizeEmail } from '@/data/users';
import { validateUrl } from '@/features/requirements/validation';

/**
 * 新しいプロジェクトの入力（画面と reducer の両方で使う）。
 * 段階・進捗は入力させない（作成時は必ず要件定義・0%から始める）
 */
// 型は repositories からも使うので @/types に置く（repositories → features の依存を作らない。B0 レビュー Minor）
export type { ProjectDraft } from '@/types';
export type ProjectField = keyof ProjectDraft;

export const PROJECT_LIMITS = { clientName: 40, siteName: 40, industry: 20, nextAction: 40 } as const;

/** お客様の連絡先の上限（2026-11-17 会議）。担当者名・メールはお客様アカウント（CLIENT_LIMITS）とそろえる */
export const CLIENT_INFO_LIMITS = { clientAddress: 100, clientPhone: 20, clientContactName: CLIENT_LIMITS.name, clientEmail: CLIENT_LIMITS.email } as const;

/** 電話番号はゆるく見る（数字・ハイフン・括弧・空白・先頭の +。数字は 10〜15 桁。2026-11-17 会議） */
const PHONE_RE = /^\+?[0-9()\-\s]+$/;

export const DEFAULT_NEXT_ACTION = 'ヒアリングを入力する';

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
  // お客様の連絡先・担当開発者（2026-11-17 会議。管理者画面の作成で入れる）
  clientAddress: '', clientPhone: '', clientContactName: '', clientEmail: '', devIds: [],
});

/**
 * 案件の担当開発者を devIds にそろえた devProjects（2026-11-17 ユーザー指示「担当開発者は複数選択可」。作成と編集で同じ形）。
 * editable: 変えてよい人（無効にした人は含めない＝いまの担当のまま残す）。order: プロジェクト一覧の並び順（ユーザー管理の setDevProjects と同じ並びにする）。
 * 何も変わらなければ null
 */
export function withProjectDevs(
  all: Record<string, string[]>, projectId: string, devIds: string[], editable: string[], order: string[],
): Record<string, string[]> | null {
  let changed = false;
  const next = { ...all };
  for (const id of editable) {
    const cur = all[id] ?? [];
    const want = devIds.includes(id);
    if (want === cur.includes(projectId)) continue;
    changed = true;
    const ids = want ? [...cur, projectId] : cur.filter((x) => x !== projectId);
    next[id] = order.filter((x) => ids.includes(x));
  }
  return changed ? next : null;
}

/** 案件のいまの担当開発者（devProjects から。並びは people の順） */
export function projectDevIds(all: Record<string, string[]>, projectId: string, people: { id: string }[]): string[] {
  return people.filter((m) => all[m.id]?.includes(projectId)).map((m) => m.id);
}

/** 入力のお客様の連絡先（空の項目は持たない。メールは小文字にそろえる）。どれも空なら undefined */
export function clientFromDraft(d: ProjectDraft): ProjectClient | undefined {
  const c: ProjectClient = {};
  const address = d.clientAddress?.trim();
  const phone = d.clientPhone?.trim();
  const contactName = d.clientContactName?.trim();
  const email = d.clientEmail ? normalizeEmail(d.clientEmail) : '';
  if (address) c.address = address;
  if (phone) c.phone = phone;
  if (contactName) c.contactName = contactName;
  if (email) c.email = email;
  return Object.keys(c).length ? c : undefined;
}

/**
 * お客様の連絡先の入力チェック（2026-11-17 会議。validateProject とは分ける: live の作成画面・ぷちリニューアルは連絡先を持たないため）。
 * requireEmail: 管理者画面の作成ではメールを必須にする（お客様ポータルのログインをこのアドレスで作るため）
 */
export function validateClientInfo(d: ProjectDraft, requireEmail: boolean): Partial<Record<ProjectField, string>> {
  const e: Partial<Record<ProjectField, string>> = {};
  const address = d.clientAddress?.trim() ?? '';
  const phone = d.clientPhone?.trim() ?? '';
  const contactName = d.clientContactName?.trim() ?? '';
  const email = d.clientEmail ? normalizeEmail(d.clientEmail) : '';
  if (address.length > CLIENT_INFO_LIMITS.clientAddress) e.clientAddress = `${CLIENT_INFO_LIMITS.clientAddress}文字以内で入力してください`;
  if (phone) {
    const digits = phone.replace(/\D/g, '').length;
    if (phone.length > CLIENT_INFO_LIMITS.clientPhone || !PHONE_RE.test(phone) || digits < 10 || digits > 15) e.clientPhone = '電話番号の形式を確認してください（例: 03-1234-5678）';
  }
  if (contactName.length > CLIENT_INFO_LIMITS.clientContactName) e.clientContactName = `${CLIENT_INFO_LIMITS.clientContactName}文字以内で入力してください`;
  if (!email) {
    if (requireEmail) e.clientEmail = 'メールアドレスを入力してください（お客様ポータルのログインに使います）';
  } else if (email.length > CLIENT_INFO_LIMITS.clientEmail || !EMAIL_RE.test(email)) e.clientEmail = 'メールアドレスの形式が正しくありません（例: name@example.com）';
  return e;
}

/** 重複の判定に使うホスト名（大小文字と先頭の www. を無視する）。URL として読めなければ null */
export function siteHost(url: string): string | null {
  try {
    return new URL(url.trim()).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * 追加開発（0.31.0）をたどった一番元の案件の id。元の案件が無ければ自分の id。
 * 一覧に無い元の案件（削除済みなど）で止め、循環しても止まるよう、たどる回数を案件の数までにする
 */
export function projectRoot(projects: Project[], p: Project): string {
  let cur = p;
  for (let i = 0; i < projects.length && cur.parentProjectId; i++) {
    const parent = projects.find((x) => x.id === cur.parentProjectId);
    if (!parent) break;
    cur = parent;
  }
  return cur.id;
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

/** エラーがあるとき、最初にフォーカスを移す順（画面の上から） */
export const PROJECT_FIELD_ORDER: ProjectField[] = [
  'clientName', 'siteName', 'siteUrl', 'industry',
  'clientContactName', 'clientEmail', 'clientPhone', 'clientAddress',
  'ownerId', 'devIds', 'launchDate', 'nextAction', 'accent',
];

/**
 * 画面と reducer の両方で使う入力チェック（URL の重複は既存のすべてのプロジェクトと比べる）。
 * self: 編集する案件（2026-11-12）。重複の判定から自分を外し、いまの公開予定日（過去でも）・いまのブランド色（候補に無くても）は
 * 変えていなければそのまま通す（初期データには過去日・候補外の色の案件があり、ほかの項目だけ直せなくなるため）。省略時は作成と同じ判定
 */
export function validateProject(d: ProjectDraft, projects: Project[], self?: Project): Partial<Record<ProjectField, string>> {
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
    // 編集では、元の案件と追加開発（0.31.0）は同じサイトなので重複に数えない。作成（self なし）は従来どおりすべてと比べる
    const root = self ? projectRoot(projects, self) : null;
    if (host && projects.some((p) => p.id !== self?.id && (!root || projectRoot(projects, p) !== root) && siteHost(p.siteUrl) === host)) e.siteUrl = 'このURLのプロジェクトはすでにあります';
  }

  if (!industry) e.industry = '業種を入力してください';
  else if (industry.length > PROJECT_LIMITS.industry) e.industry = `${PROJECT_LIMITS.industry}文字以内で入力してください`;
  if (!MEMBERS.some((m) => m.id === d.ownerId)) e.ownerId = '担当者を選んでください';
  const keptAccent = !!self && d.accent === self.accent;
  if (!keptAccent && !ACCENT_PRESETS.some((a) => a.value === d.accent)) e.accent = 'ブランド色を選んでください';
  if (launchDate) {
    if (!ymdToIso(launchDate)) e.launchDate = '日付の形式を確認してください';
    else if (launchDate < todayYmd() && !(self?.launchDate && launchDate === isoToYmd(self.launchDate))) e.launchDate = '今日以降の日付を選んでください';
  }
  if (nextAction.length > PROJECT_LIMITS.nextAction) e.nextAction = `${PROJECT_LIMITS.nextAction}文字以内で入力してください`;
  return e;
}

/** 入力から作るプロジェクト（id・更新日時以外）。reducer と画面のプレビューで同じ形にする */
export function projectFromDraft(d: ProjectDraft): Omit<Project, 'id' | 'updatedAt'> {
  const launchIso = d.launchDate.trim() ? ymdToIso(d.launchDate.trim()) : null;
  const client = clientFromDraft(d);
  return {
    clientName: d.clientName.trim(),
    siteName: d.siteName.trim(),
    siteUrl: d.siteUrl.trim(),
    industry: d.industry.trim(),
    stage: 'hearing',
    progress: 0,
    ownerId: d.ownerId,
    nextAction: d.nextAction.trim() || DEFAULT_NEXT_ACTION,
    accent: d.accent,
    ...(launchIso ? { launchDate: launchIso } : {}),
    ...(client ? { client } : {}),
    pendingApprovals: 0,
  };
}

/** ISO 文字列を端末の日付で yyyy-mm-dd に（ymdToIso の逆。読めなければ空） */
export function isoToYmd(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : todayYmd(date);
}

/** 編集の入力の初期値（いまの案件の値。次の作業は段階と同じくデータから導くので入力させない） */
export function projectToDraft(p: Project): ProjectDraft {
  return {
    clientName: p.clientName, siteName: p.siteName, siteUrl: p.siteUrl, industry: p.industry, ownerId: p.ownerId, accent: p.accent,
    // 次の作業は編集の対象外（隠した欄でエラーを出さないよう空にする。projectPatchFromDraft も使わない）
    // 公開予定日は入力欄を外した（2026-11-17 会議。日程＝schedule で決める）が、いまの値をそのまま残す
    launchDate: p.launchDate ? isoToYmd(p.launchDate) : '', nextAction: '',
    clientAddress: p.client?.address ?? '', clientPhone: p.client?.phone ?? '', clientContactName: p.client?.contactName ?? '', clientEmail: p.client?.email ?? '',
  };
}

/** 編集で変えてよい項目。段階・進捗・次の作業・承認待ちの数はデータから導く（syncDemoProject）ので含めない */
export type ProjectInfoPatch = Pick<Project, 'clientName' | 'siteName' | 'siteUrl' | 'industry' | 'ownerId' | 'accent' | 'launchDate' | 'client'>;

/** 編集の入力から案件へ書く値（projectFromDraft と同じ整形）。launchDate / client が undefined なら項目ごと消す */
export function projectPatchFromDraft(d: ProjectDraft): ProjectInfoPatch {
  const { clientName, siteName, siteUrl, industry, ownerId, accent, launchDate, client } = projectFromDraft(d);
  return { clientName, siteName, siteUrl, industry, ownerId, accent, launchDate, client };
}

/** 連絡先が同じか（項目ごとに比べる） */
const sameClient = (a?: ProjectClient, b?: ProjectClient) =>
  (a?.address ?? '') === (b?.address ?? '') && (a?.phone ?? '') === (b?.phone ?? '')
  && (a?.contactName ?? '') === (b?.contactName ?? '') && (a?.email ?? '') === (b?.email ?? '');

/** 編集の値をいまの案件に当てる（公開予定日を空にしたら項目ごと消す。同じ日付なら元の時刻を残す）。何も変わらなければ null */
export function applyProjectPatch(p: Project, patch: ProjectInfoPatch): Project | null {
  const sameDay = !!patch.launchDate && !!p.launchDate && isoToYmd(patch.launchDate) === isoToYmd(p.launchDate);
  const fixed: ProjectInfoPatch = { ...patch, launchDate: sameDay ? p.launchDate : patch.launchDate };
  const keys = Object.keys(fixed) as (keyof ProjectInfoPatch)[];
  if (keys.every((k) => (k === 'client' ? sameClient(p.client, fixed.client) : p[k] === fixed[k]))) return null;
  const next: Project = { ...p, ...fixed };
  if (!fixed.launchDate) delete next.launchDate;
  if (!fixed.client) delete next.client;
  return next;
}
