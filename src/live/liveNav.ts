import { CalendarDays, ClipboardCheck, FolderKanban, LayoutDashboard, ListTodo, MessageSquare } from 'lucide-react';
import { AREAS, type AreaId, type NavItem } from '@/components/layout/nav';
import { hasReply, unansweredCount } from './consult';
import type { ProjectDoc } from './model';
import type { LiveRole } from './session';

/** 役割ごとの画面の見た目（色・アイコン・名前）は demo の立場（AREAS）と同じものを使う */
export const ROLE_AREA: Record<LiveRole, AreaId> = { admin: 'admin', developer: 'dev', client: 'portal' };

/**
 * live のメニューに出す demo のメニュー項目（同じ画面は同じアイコン・名前）。fallback は demo のメニューから項目が消えたときの値
 * （読み込み時に例外にすると live が真っ白になるため。tests/unit/liveNav.test.mjs が demo 側に項目があることを確かめる）
 */
export const LIVE_DEMO_ITEMS = [
  { area: 'dev', fallback: { to: '/dev', label: 'ダッシュボード', icon: LayoutDashboard, match: ['/dev'], exact: true, hint: '担当案件と構築状況' } },
  { area: 'dev', fallback: { to: '/dev/projects', label: 'プロジェクト', icon: FolderKanban, match: ['/dev/projects'], hint: '担当案件' } },
  { area: 'dev', fallback: { to: '/dev/tasks', label: '構築タスク', icon: ListTodo, match: ['/dev/tasks'], hint: 'ページごとの実装状況' } },
  { area: 'dev', fallback: { to: '/dev/chat', label: '相談', icon: MessageSquare, match: ['/dev/chat'], hint: 'お客様からの相談に返信' } },
  { area: 'admin', fallback: { to: '/projects', label: 'プロジェクト', icon: FolderKanban, match: ['/projects', '/ai-studio'], hint: '制作案件の一覧' } },
  { area: 'portal', fallback: { to: '/portal/approvals', label: '確認・承認', icon: ClipboardCheck, match: ['/portal/approvals'], hint: '要件の確認・承認' } },
  { area: 'portal', fallback: { to: '/portal/schedule', label: 'スケジュール', icon: CalendarDays, match: ['/portal/schedule'], hint: '制作〜公開の予定' } },
  { area: 'portal', fallback: { to: '/portal/chat', label: '相談', icon: MessageSquare, match: ['/portal/chat'], hint: '担当者に相談' } },
] as const satisfies readonly { area: AreaId; fallback: NavItem }[];

/** demo のメニューから探す。無ければ fallback（件数バッジは demo のデータで数えるので live では使わない。live は liveNavMarks） */
export function demoItem(area: AreaId, to: string): NavItem {
  const found = AREAS[area].items.find((i) => i.to === to);
  const fallback = LIVE_DEMO_ITEMS.find((i) => i.area === area && i.fallback.to === to)?.fallback;
  const item = found ?? fallback;
  if (!item) return { to, label: to, icon: FolderKanban, match: [to], hint: '' };
  return { ...item, match: [...item.match], badge: undefined };
}

/** demo の項目の見た目（名前・アイコン）で、行き先と選択中の範囲を live の画面にする（demo の match には live に無い画面が入っている） */
function liveItem(area: AreaId, demoTo: string, to: string, match: string[], hint?: string): NavItem {
  const base = demoItem(area, demoTo);
  // exact（完全一致のときだけ選択中）は demo の項目のまま（ダッシュボード /dev は /dev/… の全画面に前方一致してしまうため）
  return { ...base, to, match, ...(hint ? { hint } : {}) };
}

/**
 * 役割ごとのナビ（2026-11-25 ユーザー決定 U4: admin と開発者はどちらも「ダッシュボード / プロジェクト / 構築タスク / 相談」の 4 つだけ。
 * admin は全案件で担当の開発者と同じ操作ができる（2026-11-26 ADMIN_FULL_RIGHTS_PLAN）。名前・アイコンは demo の開発者画面のレールと同じ）。
 * - ヒアリング・要件定義: メニューから外した（demo と同じ。プロジェクト詳細の「ヒアリング」から開く。開いている間は「プロジェクト」を選択中にする。
 *   admin の /ai-studio/requirements は '/ai-studio' の前方一致で入る）
 * - ユーザー管理（admin）: メニューから外した。上部バーのアカウントのメニューから開く（LiveShell）
 * - お客様: 確認・承認・スケジュール（demo のポータルと同じ並び。LIVE_SCHEDULE_PLAN L-20）・相談（担当者から返信があれば「返信あり」の印）
 * 画面（URL）は消していない（以前の最初の画面 /projects・/dev/projects もそのまま開ける）
 */
export const LIVE_NAV: Record<LiveRole, NavItem[]> = {
  admin: [
    liveItem('dev', '/dev', '/dashboard', ['/dashboard'], '全案件と構築状況'),
    liveItem('admin', '/projects', '/projects', ['/projects', '/ai-studio']),
    liveItem('dev', '/dev/tasks', '/tasks', ['/tasks'], '全案件の構築タスク'),
    liveItem('dev', '/dev/chat', '/chat', ['/chat'], '全案件のお客様からの相談'),
  ],
  developer: [
    liveItem('dev', '/dev', '/dev', ['/dev']),
    liveItem('dev', '/dev/projects', '/dev/projects', ['/dev/projects', '/dev/hearing', '/dev/requirements']),
    liveItem('dev', '/dev/tasks', '/dev/tasks', ['/dev/tasks']),
    liveItem('dev', '/dev/chat', '/dev/chat', ['/dev/chat']),
  ],
  client: [
    liveItem('portal', '/portal/approvals', '/portal/approvals', ['/portal/approvals']),
    liveItem('portal', '/portal/schedule', '/portal/schedule', ['/portal/schedule']),
    liveItem('portal', '/portal/chat', '/portal/chat', ['/portal/chat']),
  ],
};

/** スマホの下部タブの名前（demo と同じく、ダッシュボードは「ホーム」。5 つ並ぶ 320px で折れないように） */
export const LIVE_BOTTOM_LABEL: Record<string, string> = { '/dev': 'ホーム', '/dashboard': 'ホーム' };

/** メニューの印。count: 赤い件数（未対応の案件の数）。mark: 数字の代わりに点を出し、読み上げはこの文（お客様の「返信あり」） */
export interface LiveNavMark {
  count: number;
  mark?: string;
}

/**
 * メニューの印（案件一覧の consult から数える。追加の Read は無い。§4）。
 * 開発者・admin: 相談に未対応の案件の数（アーカイブは数えない。consult.ts unansweredCount）。お客様: 担当者から返信があれば「返信あり」
 */
export function liveNavMarks(role: LiveRole, docs: readonly ProjectDoc[], uid: string): Record<string, LiveNavMark> {
  if (role === 'client') return docs[0] && hasReply(docs[0]) ? { '/portal/chat': { count: 1, mark: '返信あり' } } : {};
  const count = unansweredCount(docs, role, uid);
  return count > 0 ? { [role === 'admin' ? '/chat' : '/dev/chat']: { count } } : {};
}
