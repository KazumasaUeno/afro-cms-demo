import { Box } from '@mui/material';
import { useMemo } from 'react';
import { useDemo } from '@/store/DemoStore';
import { useDirectorProjects } from '@/features/dev/useDevUser';
import { tokens } from '@/theme/tokens';
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

/** 読み上げ用の補足（ラベルの後ろに付ける。見た目は数字だけ） */
export const badgeLabel = (count: number) => (count > 0 ? `（未対応 ${count}件）` : '');

/** 赤い件数の印。アイコンの右上に重ねる（親は position: relative） */
export function NavCountBadge({ count, inline = false }: { count: number; inline?: boolean }) {
  if (count <= 0) return null;
  return (
    <Box
      component="span"
      aria-hidden
      sx={{
        ...(inline ? { ml: 'auto' } : { position: 'absolute', top: -2, right: 6 }),
        minWidth: 18, height: 18, px: 0.5, borderRadius: '9px', display: 'inline-grid', placeItems: 'center',
        bgcolor: tokens.color.danger, color: '#fff', fontSize: 11, fontWeight: 700, lineHeight: 1, fontVariantNumeric: 'tabular-nums',
        boxShadow: `0 0 0 2px ${tokens.color.navBg}`,
      }}
    >
      {count > 99 ? '99+' : count}
    </Box>
  );
}
