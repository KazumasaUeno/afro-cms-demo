import { tokens } from '@/theme/tokens';
import type { DemoState } from '@/types';
import {
  Building2, ClipboardCheck, MessageSquare, Code2, FolderKanban, FolderOpen, House, LayoutDashboard, ListTodo, Monitor,
  Rocket, ScrollText, Settings, Stamp, UserRound, UsersRound, type LucideIcon,
} from 'lucide-react';
import { unansweredCount } from '@/features/chat/unanswered';

/** バッジの数を数えるときに渡す、いまの人の範囲（開発者画面: ログイン中の開発者の担当案件） */
export interface NavBadgeScope {
  devProjectIds: string[];
}

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** このパスで始まるページでアクティブ表示 */
  match: string[];
  hint: string;
  /** true のときは match と完全一致のときだけアクティブ（エリアのトップ用） */
  exact?: boolean;
  /** ほかの項目と色を変えて目立たせる（info = 青。開発者画面の「デザイン」。2026-11-13 ユーザー指示） */
  tone?: 'info';
  /** 'designApproved': 選んでいる案件のトップデザインをお客様が承認するまでメニューに出さない（お客様ポータル。2026-11-16 ユーザー指示） */
  requires?: 'designApproved';
  /** メニューに出す件数のバッジ（赤。0 なら出さない）。2026-11-17 会議: 開発者の「相談」に未対応の件数 */
  badge?: (state: DemoState, scope: NavBadgeScope) => number;
}

/** いま出すメニュー項目（requires の条件を満たすものだけ）。表示の出し分けで、画面（URL）自体は止めない */
export function visibleItems(items: NavItem[], state: Pick<DemoState, 'design'>): NavItem[] {
  return items.filter((i) => i.requires !== 'designApproved' || !!state.design.approvedAt);
}

/**
 * 立場ごとの画面（エリア）。
 * - admin: アフロ社内の管理者画面（制作の全工程を進める）
 * - portal: お客様の画面（進み具合の確認・承認・ページ更新・レポート）
 * - dev: アフロの制作エンジニアの画面（担当案件・プロジェクト・ヒアリング・構築タスク・環境とデプロイ）
 * エリアごとにログイン画面（/login・/dev/login・/portal/login）がある。デモのため実際の認証・権限制御は行わない。
 */
export type AreaId = 'admin' | 'portal' | 'dev';

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
  // AI Studio（要件・サイトマップ・デザイン）・品質チェック・インサイトはプロジェクトの中の画面なので、メニューには出さず
  // プロジェクト詳細の段階ごとのボタンから開く。開いている間は「プロジェクト」を選択中にする
  { to: '/projects', label: 'プロジェクト', icon: FolderKanban, match: ['/projects', '/ai-studio', '/schedule', '/site', '/quality', '/insights', '/assets', '/forms', '/client-view'], hint: '制作案件の一覧' },
  { to: '/users', label: 'ユーザー管理', icon: UsersRound, match: ['/users'], hint: 'お客様の登録・開発者画面の権限' },
  // 相談チャット（0.38.2）は 2026-11-17 ユーザー指示「管理者画面に相談は要らない」で外した（/chat はホームへ転送。開発者画面・お客様ポータルには残す）
];

const PORTAL_ITEMS: NavItem[] = [
  { to: '/portal', label: 'ホーム', icon: House, match: ['/portal'], exact: true, hint: '制作の進み具合' },
  // ヒアリング（/portal/requirements）は 0.18.0 で廃止（受託開発ではアフロが入力する）。URL は確認・承認へ転送する
  // 品質確認（/portal/quality）はメニューから外した（2026-11-16 ユーザー指示）。画面は残し、確認・承認の「品質チェック」から開く。開いている間は確認・承認を選択中にする
  { to: '/portal/approvals', label: '確認・承認', icon: ClipboardCheck, match: ['/portal/approvals', '/portal/quality'], hint: '要件・サイトマップ・デザイン' },
  // 公開承認・レポート・サイネージはトップデザインの承認後に出す（requires。2026-11-16 ユーザー指示）
  // ページ・お知らせ（/portal/pages）はメニューから外した（2026-11-16 ユーザー指示）。画面は残し、ホームの「サイトの更新」から開く
  { to: '/portal/publish', label: '公開承認', icon: Stamp, match: ['/portal/publish'], hint: '更新の承認ワークフロー', requires: 'designApproved' },
  { to: '/portal/reports', label: 'レポート', icon: ScrollText, match: ['/portal/reports'], hint: '改善診断', requires: 'designApproved' },
  // 下部タブは添字で選んでいるため（下の bottom）、新しい項目は末尾に足す
  { to: '/portal/signage', label: 'サイネージ', icon: Monitor, match: ['/portal/signage'], hint: '店頭の画面', requires: 'designApproved' },
  // フォームの問い合わせ（0.37.0）はメニューから外した（2026-11-16 ユーザー指示）。画面（/portal/forms）は残す
  // 担当者への相談（0.38.0）。下部タブの添字が変わらないよう末尾に足す
  { to: '/portal/chat', label: '相談', icon: MessageSquare, match: ['/portal/chat'], hint: '担当者に相談' },
  // 素材ドライブ（2026-11-17 会議）。お客様は見るのと画像のアップロードだけ。公開承認などと同じくトップデザインの承認後に出す。下部タブの添字が変わらないよう末尾に足す
  { to: '/portal/assets', label: '素材ドライブ', icon: FolderOpen, match: ['/portal/assets'], hint: '写真・資料をお渡しする' },
];

const DEV_ITEMS: NavItem[] = [
  { to: '/dev', label: 'ダッシュボード', icon: LayoutDashboard, match: ['/dev'], exact: true, hint: '担当案件と構築状況' },
  // プロジェクト（0.26.0）: 管理者画面と同じ一覧・詳細（担当案件だけ）。
  // 選択中の規則: URL が属するメニュー項目を選択中にし、どこから開いたかでは変えない。
  //   メニューに項目が無いサイトマップ（/dev/sitemap）・品質（/dev/quality）・ページ編集（/dev/cms）・改善（/dev/insights。0.27.0）は、
  //   常に「プロジェクト」を選択中にする（下の match）
  // デザイン（/dev/design・/dev/design/requirements）も、メニューから外したので「プロジェクト」を選択中にする（2026-11-17 会議）
  { to: '/dev/projects', label: 'プロジェクト', icon: FolderKanban, match: ['/dev/projects', '/dev/hearing', '/dev/requirements', '/dev/schedule', '/dev/sitemap', '/dev/design', '/dev/quality', '/dev/cms', '/dev/insights', '/dev/assets', '/dev/forms', '/dev/client-view'], hint: '担当案件の8段階' },
  // ヒアリング（/dev/hearing・/dev/requirements）はメニューから外した（2026-11-12 ユーザー指示）。プロジェクト詳細・担当案件から開き、「プロジェクト」を選択中にする
  { to: '/dev/tasks', label: '構築タスク', icon: ListTodo, match: ['/dev/tasks'], hint: 'ページごとの実装状況' },
  // 自動チェック（/dev/checks）は 0.19.0 でメニューから外した（11/10 レビュー）。URL はダッシュボードへ転送する
  // 下部タブは添字 [0,1,2,3]（ホーム・プロジェクト・構築タスク・環境・デプロイ）
  { to: '/dev/deploys', label: '環境・デプロイ', icon: Rocket, match: ['/dev/deploys'], hint: '開発・検証・本番' },
  // デザイン（/dev/design）は 2026-11-17 会議でメニューから外した（デザインはプロジェクトの中で開く: プロジェクト詳細の段階ボタン・ダッシュボード）。
  // 画面（URL）は残す。下部タブは添字 [0..3] なので、外しても変わらない
  // 相談チャット（0.38.1。2026-11-16 ユーザー指示「開発者画面からも開く」）。下部タブの添字が変わらないよう末尾に足す。
  // 未対応（最後がお客様のメッセージ）の担当案件の数を赤いバッジで出す（2026-11-17 会議）
  { to: '/dev/chat', label: '相談', icon: MessageSquare, match: ['/dev/chat'], hint: 'お客様からの相談に返信', badge: (state, scope) => unansweredCount(state, scope.devProjectIds) },
];

export const SETTINGS_ITEM: NavItem = { to: '/settings', label: '設定', icon: Settings, match: ['/settings'], hint: 'デモの設定' };

export const AREAS: Record<AreaId, AreaDef> = {
  admin: {
    id: 'admin', label: '管理者画面', short: '管理者', audience: 'アフロ社内',
    description: '案件・要件・制作・品質・改善を進める', home: '/', icon: Building2,
    color: tokens.color.primary, soft: tokens.color.primaryContainer,
    items: ADMIN_ITEMS, bottom: [ADMIN_ITEMS[0], ADMIN_ITEMS[1], ADMIN_ITEMS[2]], settings: SETTINGS_ITEM,
  },
  portal: {
    id: 'portal', label: 'お客様ポータル', short: 'ポータル', audience: 'お客様',
    description: '進み具合の確認・承認・ページ更新・レポート・サイネージ', home: '/portal', icon: UserRound,
    color: tokens.color.success, soft: tokens.color.successSoft,
    items: PORTAL_ITEMS, bottom: [PORTAL_ITEMS[0], PORTAL_ITEMS[1], PORTAL_ITEMS[3], PORTAL_ITEMS[5]],
  },
  dev: {
    id: 'dev', label: '開発者画面', short: '開発者', audience: '制作エンジニア',
    description: '担当案件・プロジェクト・ヒアリング・構築タスク・環境とデプロイ・相談', home: '/dev', icon: Code2,
    color: tokens.color.tertiary, soft: tokens.color.tertiaryContainer,
    items: DEV_ITEMS, bottom: [{ ...DEV_ITEMS[0], label: 'ホーム' }, DEV_ITEMS[1], DEV_ITEMS[2], DEV_ITEMS[3]],
  },
};

export const AREA_ORDER: AreaId[] = ['admin', 'dev', 'portal'];

/** デモの基準の案件（MINAMO COFFEE）。営業プレゼンはこの案件の分だけ持っている（0.30.0。開発データは 2026-11-17 から全案件） */
export const CLIENT_PROJECT_ID = 'p1';

export function areaOf(pathname: string): AreaId {
  if (pathname === '/dev' || pathname.startsWith('/dev/')) return 'dev';
  if (pathname === '/portal' || pathname.startsWith('/portal/')) return 'portal';
  return 'admin';
}

export function isActive(item: NavItem, pathname: string): boolean {
  return item.match.some((m) => (item.exact ? pathname === m : pathname === m || pathname.startsWith(`${m}/`)));
}
