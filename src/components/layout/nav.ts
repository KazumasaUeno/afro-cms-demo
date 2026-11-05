import { BarChart3, FolderKanban, House, LayoutTemplate, Network, Settings, ShieldCheck, Sparkles, type LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** このパスで始まるページでアクティブ表示 */
  match: string[];
  hint: string;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'ホーム', icon: House, match: ['/'], hint: '今日の状況' },
  { to: '/projects', label: 'プロジェクト', icon: FolderKanban, match: ['/projects'], hint: '制作案件の一覧' },
  { to: '/ai-studio', label: 'AI Studio', icon: Sparkles, match: ['/ai-studio'], hint: 'AI要件定義・デザイン生成' },
  { to: '/site', label: 'サイト制作', icon: Network, match: ['/site'], hint: 'サイトマップ・構築' },
  { to: '/quality', label: '品質チェック', icon: ShieldCheck, match: ['/quality'], hint: '12項目110問' },
  { to: '/cms', label: 'CMS', icon: LayoutTemplate, match: ['/cms'], hint: 'ページ編集と公開' },
  { to: '/insights', label: 'インサイト', icon: BarChart3, match: ['/insights'], hint: '解析と改善提案' },
];

export const SETTINGS_ITEM: NavItem = { to: '/settings', label: '設定', icon: Settings, match: ['/settings'], hint: 'デモの設定' };

export function isActive(item: NavItem, pathname: string): boolean {
  return item.match.some((m) => (m === '/' ? pathname === '/' : pathname === m || pathname.startsWith(`${m}/`)));
}
