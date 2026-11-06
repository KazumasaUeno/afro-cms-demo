import {
  BarChart3, Building2, ClipboardCheck, FileText, FolderKanban, House, LayoutDashboard, LayoutTemplate, ListChecks, Network,
  ScrollText, Settings, ShieldCheck, Sparkles, Stamp, UserRound, type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** このパスで始まるページでアクティブ表示 */
  match: string[];
  hint: string;
  /** true のときは match と完全一致のときだけアクティブ（エリアのトップ用） */
  exact?: boolean;
}

/**
 * 立場ごとの画面（エリア）。
 * - admin: アフロ社内の管理者画面（制作の全工程を進める）
 * - cms: お客様が自社サイトを更新する CMS
 * - portal: お客様が進み具合の確認・承認・レポート閲覧をするポータル
 * ログイン・権限はデモの対象外のため、上部の切替で立場を選ぶ。
 */
export type AreaId = 'admin' | 'cms' | 'portal';

export interface AreaDef {
  id: AreaId;
  /** 切替メニューに出す名前 */
  label: string;
  /** 上部バーに出す短い名前 */
  short: string;
  /** 誰が使う画面か */
  audience: string;
  description: string;
  home: string;
  icon: LucideIcon;
  /** エリアの識別色（アクティブなメニューのアイコンと印に使う） */
  color: string;
  soft: string;
  items: NavItem[];
  /** スマホ下部タブに出すもの（最大4件。残りはメニュー） */
  bottom: NavItem[];
  settings?: NavItem;
}

const ADMIN_ITEMS: NavItem[] = [
  { to: '/', label: 'ホーム', icon: House, match: ['/'], exact: true, hint: '今日の状況' },
  { to: '/projects', label: 'プロジェクト', icon: FolderKanban, match: ['/projects'], hint: '制作案件の一覧' },
  { to: '/ai-studio', label: 'AI Studio', icon: Sparkles, match: ['/ai-studio'], hint: 'AI要件定義・デザイン生成' },
  { to: '/site', label: 'サイト制作', icon: Network, match: ['/site'], hint: 'サイトマップ・構築' },
  { to: '/quality', label: '品質チェック', icon: ShieldCheck, match: ['/quality'], hint: '12項目110問' },
  { to: '/insights', label: 'インサイト', icon: BarChart3, match: ['/insights'], hint: '解析と改善提案' },
];

const CMS_ITEMS: NavItem[] = [
  { to: '/cms', label: 'ダッシュボード', icon: LayoutDashboard, match: ['/cms'], exact: true, hint: '更新状況' },
  { to: '/cms/pages', label: 'ページ・お知らせ', icon: FileText, match: ['/cms/pages'], hint: '編集と公開' },
  { to: '/cms/approvals', label: '公開承認', icon: Stamp, match: ['/cms/approvals'], hint: '承認ワークフロー' },
];

const PORTAL_ITEMS: NavItem[] = [
  { to: '/portal', label: 'ホーム', icon: House, match: ['/portal'], exact: true, hint: '制作の進み具合' },
  { to: '/portal/approvals', label: '確認・承認', icon: ClipboardCheck, match: ['/portal/approvals'], hint: '要件・サイトマップ・デザイン' },
  { to: '/portal/quality', label: '品質確認', icon: ListChecks, match: ['/portal/quality'], hint: 'お客様側のチェック' },
  { to: '/portal/reports', label: 'レポート', icon: ScrollText, match: ['/portal/reports'], hint: '改善診断' },
];

export const SETTINGS_ITEM: NavItem = { to: '/settings', label: '設定', icon: Settings, match: ['/settings'], hint: 'デモの設定' };

export const AREAS: Record<AreaId, AreaDef> = {
  admin: {
    id: 'admin', label: '管理者画面', short: '管理者', audience: 'アフロ社内',
    description: '案件・要件・制作・品質・改善を進める', home: '/', icon: Building2,
    color: '#3B5BDB', soft: '#EEF2FF',
    items: ADMIN_ITEMS, bottom: [ADMIN_ITEMS[0], ADMIN_ITEMS[1], ADMIN_ITEMS[2], ADMIN_ITEMS[4]], settings: SETTINGS_ITEM,
  },
  cms: {
    id: 'cms', label: 'CMS画面', short: 'CMS', audience: 'お客様',
    description: 'ページ・お知らせの更新と公開', home: '/cms', icon: LayoutTemplate,
    color: '#B45309', soft: '#FDF3E7',
    items: CMS_ITEMS, bottom: CMS_ITEMS,
  },
  portal: {
    id: 'portal', label: 'お客様ポータル', short: 'ポータル', audience: 'お客様',
    description: '進み具合の確認・承認・レポート', home: '/portal', icon: UserRound,
    color: '#0F9D74', soft: '#E7F7F1',
    items: PORTAL_ITEMS, bottom: PORTAL_ITEMS,
  },
};

export const AREA_ORDER: AreaId[] = ['admin', 'cms', 'portal'];

/** お客様側の画面が扱う案件（デモのデータは MINAMO COFFEE の 1 案件分だけ持っている） */
export const CLIENT_PROJECT_ID = 'p1';

export function areaOf(pathname: string): AreaId {
  if (pathname === '/cms' || pathname.startsWith('/cms/')) return 'cms';
  if (pathname === '/portal' || pathname.startsWith('/portal/')) return 'portal';
  return 'admin';
}

export function isActive(item: NavItem, pathname: string): boolean {
  return item.match.some((m) => (item.exact ? pathname === m : pathname === m || pathname.startsWith(`${m}/`)));
}
