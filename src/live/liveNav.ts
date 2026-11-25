import { ClipboardCheck, FolderKanban, MessageSquareText, UsersRound } from 'lucide-react';
import { AREAS, type AreaId, type NavItem } from '@/components/layout/nav';
import type { LiveRole } from './session';

/** 役割ごとの画面の見た目（色・アイコン・名前）は demo の立場（AREAS）と同じものを使う */
export const ROLE_AREA: Record<LiveRole, AreaId> = { admin: 'admin', developer: 'dev', client: 'portal' };

/**
 * live のメニューに出す demo のメニュー項目（同じ画面は同じアイコン・名前）。fallback は demo のメニューから項目が消えたときの値
 * （読み込み時に例外にすると live が真っ白になるため。tests/unit/liveNav.test.mjs が demo 側に項目があることを確かめる）
 */
export const LIVE_DEMO_ITEMS = [
  { area: 'admin', fallback: { to: '/projects', label: 'プロジェクト', icon: FolderKanban, match: ['/projects', '/ai-studio'], hint: '制作案件の一覧' } },
  { area: 'admin', fallback: { to: '/users', label: 'ユーザー管理', icon: UsersRound, match: ['/users'], hint: 'お客様の登録・開発者画面の権限' } },
  { area: 'dev', fallback: { to: '/dev/projects', label: 'プロジェクト', icon: FolderKanban, match: ['/dev/projects'], hint: '担当案件' } },
  { area: 'portal', fallback: { to: '/portal/approvals', label: '確認・承認', icon: ClipboardCheck, match: ['/portal/approvals'], hint: '要件の確認・承認' } },
] as const satisfies readonly { area: AreaId; fallback: NavItem }[];

/** demo のメニューから探す。無ければ fallback（件数バッジは demo のデータで数えるので live では使わない） */
export function demoItem(area: AreaId, to: string): NavItem {
  const found = AREAS[area].items.find((i) => i.to === to);
  const fallback = LIVE_DEMO_ITEMS.find((i) => i.area === area && i.fallback.to === to)?.fallback;
  const item = found ?? fallback;
  if (!item) return { to, label: to, icon: FolderKanban, match: [to], hint: '' };
  return { ...item, match: [...item.match], badge: undefined };
}

/**
 * 役割ごとのナビ（§14 の範囲内の画面だけ。2026-11-25 ユーザー選択 A: demo と同じ枠で、live にある画面だけ）。
 * 開発者のヒアリングは demo ではメニューに無い（プロジェクトの中から開く）が、live は以前からメニューに出していたので残す。
 * そのため demo の「プロジェクト」の match（/dev/hearing を含む）を live の画面だけに絞る
 */
export const LIVE_NAV: Record<LiveRole, NavItem[]> = {
  admin: [demoItem('admin', '/projects'), demoItem('admin', '/users')],
  developer: [
    { ...demoItem('dev', '/dev/projects'), match: ['/dev/projects'] },
    { to: '/dev/hearing', label: 'ヒアリング', icon: MessageSquareText, match: ['/dev/hearing'], hint: '選んでいるプロジェクトのヒアリング' },
  ],
  client: [demoItem('portal', '/portal/approvals')],
};
