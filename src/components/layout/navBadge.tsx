import { useMemo } from 'react';
import { useDemo } from '@/store/DemoStore';
import { useDirectorProjects } from '@/features/dev/useDevUser';
import type { NavItem } from './nav';

/**
 * メニューの件数バッジ（2026-11-17 会議: 開発者が複数の案件を持つと、どこに相談が来たか分からないため）。
 * サイドバー（ドロワー・レール）と下部タブで同じ数を出す。範囲は開発者画面にログインしている人が担当ディレクターの案件
 * （2026-11-17 ユーザー指示「担当ディレクターがチャット対応できる」。開発担当だけの案件は見られるが返信しないので数えない）
 */
export function useNavBadge(): (item: NavItem) => number {
  const { state } = useDemo();
  const directed = useDirectorProjects();
  const directorProjectIds = useMemo(() => directed.map((p) => p.id), [directed]);
  return (item) => (item.badge ? item.badge(state, { directorProjectIds }) : 0);
}

// 件数の印と読み上げの補足は live とも共用するので ShellParts に置く（DemoStore を読まない部品）
export { badgeLabel, NavCountBadge } from './ShellParts';
