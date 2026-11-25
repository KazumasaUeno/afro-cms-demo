import { Box, ButtonBase, Drawer, IconButton, ListItemIcon, Menu, MenuItem, Popover, Stack, Tooltip, Typography } from '@mui/material';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronDown, Menu as MenuIcon, Moon, Sun, type LucideIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { tokens } from '@/theme/tokens';
import { LANDSCAPE_PHONE } from '@/theme/media';
import { useThemeMode } from '@/theme/ThemeMode';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { isActive, type AreaDef, type NavItem } from './nav';
import { LogoMark } from './Logo';
import { navIndicatorSx, navToneSx, toneIndicator } from './navIndicator';

/**
 * 画面の枠（ナビゲーションレール・ドロワー・上部バー・スマホ下部タブ・本文）の見た目の部品。
 * demo（AppShell / Sidebar）と live（LiveShell）で同じものを使う（0.48.2。2026-11-25 ユーザー指摘「デモとデザインが違う / サイドナビもない」）。
 * ここは DemoStore（useDemo）を読まない（live から import する。tests/unit/liveNoDemoStore.test.mjs）。データは呼び出し側が渡す
 */

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

/** ドロワー（lg 未満）の行。M3 Navigation drawer item: 高さ 56・角丸 Full。選択中の印は中心から広がる */
export function NavRow({ item, color, onNavigate, count = 0 }: { item: NavItem; color: string; onNavigate?: () => void; count?: number }) {
  const { pathname } = useLocation();
  const active = isActive(item, pathname);
  const Icon = item.icon;
  return (
    // 選択中の判定は item.match で行う（NavLink は aria-current を自分の判定で上書きするので Link を使う）
    <ButtonBase
      component={Link}
      to={item.to}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      aria-label={count > 0 ? `${item.label}${badgeLabel(count)}` : undefined}
      sx={{
        width: '100%', justifyContent: 'flex-start', gap: 1.5, px: 2, height: 56, borderRadius: `${tokens.radius.full}px`,
        color: active ? tokens.color.onSecondaryContainer : tokens.color.onSurfaceVariant, fontWeight: active ? 700 : 500, fontSize: 14,
        transition: 'color .2s',
        ...navIndicatorSx(active, { fill: true, indicator: toneIndicator(item.tone) ?? tokens.color.navIndicator }),
        ...(item.tone && navToneSx(item.tone)),
      }}
    >
      <Box component="span" className="nav-ind" aria-hidden />
      <Icon size={20} strokeWidth={active ? 2.2 : 1.9} color={item.tone ? 'currentColor' : active ? color : 'currentColor'} />
      <span>{item.label}</span>
      <NavCountBadge count={count} inline />
    </ButtonBase>
  );
}

/** PC のナビゲーションレールの項目（M3 Expressive: 56×32 の印＋12px のラベル） */
export function RailItem({ to, label, icon: Icon, active, color, hint, tone, count = 0 }: { to: string; label: string; icon: LucideIcon; active: boolean; color?: string; hint: string; tone?: NavItem['tone']; count?: number }) {
  return (
    <Tooltip title={hint} placement="right" enterDelay={600}>
      <ButtonBase
        component={Link}
        to={to}
        aria-current={active ? 'page' : undefined}
        aria-label={count > 0 ? `${label}${badgeLabel(count)}` : undefined}
        sx={{
          width: '100%', flexDirection: 'column', gap: 0.5, py: 0.5, minHeight: 56, borderRadius: `${tokens.radius.md}px`,
          color: active ? tokens.color.onSurface : tokens.color.onSurfaceVariant,
          // 96px のレールで語の途中で折れないよう、M3 Label small（11px）で 1 行に収める
          fontSize: 11, lineHeight: '16px', fontWeight: active ? 700 : 500, letterSpacing: 0, textAlign: 'center', whiteSpace: 'nowrap',
          transition: 'color .2s',
          ...navIndicatorSx(active, { indicator: toneIndicator(tone) ?? tokens.color.navIndicator }),
          // キーボードのフォーカスは印の外側に輪郭線を出す（ButtonBase は outline を消すので明示する）
          '&.Mui-focusVisible, &:focus-visible': { outline: 'none' },
          '&.Mui-focusVisible .nav-ind, &:focus-visible .nav-ind': { outline: `3px solid ${tokens.color.secondary}`, outlineOffset: 2 },
          ...(tone && navToneSx(tone)),
        }}
      >
        <Box component="span" className="nav-ind" sx={{ position: 'relative', width: 56, height: 32, display: 'grid', placeItems: 'center', flexShrink: 0, color: active ? tokens.color.onSecondaryContainer : 'inherit' }}>
          <Icon size={22} strokeWidth={active ? 2.2 : 1.8} color={!tone && active && color ? color : 'currentColor'} />
          <NavCountBadge count={count} />
        </Box>
        <Box component="span" sx={{ maxWidth: '100%', overflowWrap: 'anywhere' }}>{label}</Box>
      </ButtonBase>
    </Tooltip>
  );
}

/** ロゴの下に出す「いまどの立場の画面か」 */
export function AreaBadge({ area }: { area: Pick<AreaDef, 'icon' | 'label' | 'audience' | 'soft' | 'color'> }) {
  const Icon = area.icon;
  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 1.5, py: 0.75, borderRadius: `${tokens.radius.sm}px`, bgcolor: area.soft, color: area.color }}>
      <Icon size={15} />
      <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: 'inherit' }} noWrap>{area.label}</Typography>
      <Typography sx={{ fontSize: 12, color: tokens.color.muted, ml: 'auto !important' }} noWrap>{area.audience}</Typography>
    </Stack>
  );
}

type AreaLook = Pick<AreaDef, 'icon' | 'label' | 'audience' | 'soft' | 'color'>;

/** レールの下: ログイン中の情報を Popover で出すボタン（中身は children。立場の印 AreaBadge の下に出す） */
export function AccountButtonView({ area, children }: { area: AreaLook; children: ReactNode }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const Icon = area.icon;
  const label = `${area.label}（${area.audience}）の情報`;
  return (
    <>
      <Tooltip title={label} placement="right">
        <ButtonBase
          onClick={(e) => setAnchor(e.currentTarget)}
          aria-haspopup="dialog"
          aria-expanded={!!anchor}
          aria-label={label}
          sx={{
            width: 48, height: 48, flexShrink: 0, borderRadius: '24px', bgcolor: area.soft, color: area.color,
            transition: `border-radius .35s ${tokens.motion.easeSpringCss}`,
            '&:hover, &[aria-expanded="true"]': { borderRadius: '16px' },
            '&.Mui-focusVisible': { outline: `3px solid ${tokens.color.secondary}`, outlineOffset: 2 },
          }}
        >
          <Icon size={20} />
        </ButtonBase>
      </Tooltip>
      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{ paper: { role: 'dialog', 'aria-label': 'ログイン中の情報', sx: { ml: 1.5, width: 300, p: 2, bgcolor: tokens.color.surfaceContainer, display: 'flex', flexDirection: 'column', gap: 1.5 } } }}
      >
        <AreaBadge area={area} />
        {children}
      </Popover>
    </>
  );
}

/** PC（lg 以上）: M3 Expressive のナビゲーションレール（幅 96）。項目が多く画面が低いときはレールの中でスクロールする */
export function ShellRail({ home, homeLabel, navLabel, children, footer }: { home: string; homeLabel: string; navLabel: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <Box
      component="aside"
      sx={{
        display: { xs: 'none', lg: 'flex' }, flexDirection: 'column', alignItems: 'center', gap: 1.5,
        position: 'fixed', inset: '0 auto 0 0', width: tokens.layout.sidebar, py: 2, px: 1,
        bgcolor: tokens.color.navBg, borderRight: `1px solid ${tokens.color.outlineVariant}`, zIndex: 20, overflowY: 'auto', overflowX: 'hidden', // 本文の地と区別するため面の色を変え、境目に罫線
      }}
    >
      <ButtonBase
        component={Link}
        to={home}
        aria-label={homeLabel}
        sx={{
          borderRadius: '14px', mb: 1, flexShrink: 0, transition: `transform .35s ${tokens.motion.easeSpringCss}`, '&:active': { transform: 'scale(0.92)' },
          '&.Mui-focusVisible': { outline: `3px solid ${tokens.color.secondary}`, outlineOffset: 2 },
        }}
      >
        <LogoMark size={44} />
      </ButtonBase>

      <Box component="nav" aria-label={navLabel} sx={{ width: '100%' }}>
        <Stack spacing={1.5}>{children}</Stack>
      </Box>

      <Box sx={{ flex: 1, minHeight: 8 }} />

      {footer}
    </Box>
  );
}

/** lg 未満: 左から出るナビゲーションドロワー */
export function ShellDrawer({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      sx={{ display: { lg: 'none' } }}
      PaperProps={{ sx: { width: 280, bgcolor: tokens.color.navBg, borderRadius: '0 16px 16px 0' } }}
    >
      {children}
    </Drawer>
  );
}

/** ドロワーの中身の並び（画面が低いときは子を縮めずに中でスクロールさせる。flex の既定の縮みで下のボタンが潰れていた） */
export function DrawerColumn({ children }: { children: ReactNode }) {
  return <Stack sx={{ height: '100%', p: 2, gap: 2, overflowY: 'auto', '& > *': { flexShrink: 0 } }}>{children}</Stack>;
}

/** ドロワーのメニュー（行の並び） */
export function DrawerNav({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box component="nav" aria-label={label}>
      <Stack spacing={0.5}>{children}</Stack>
    </Box>
  );
}

/** 上部バー（M3 Top app bar）。左にメニュー（lg 未満）とロゴ、その後ろに children */
export function ShellTopBar({ onMenu, children }: { onMenu: () => void; children: ReactNode }) {
  return (
    <Box
      component="header"
      sx={{
        position: 'sticky', top: 0, zIndex: 15, height: tokens.layout.topbar, display: 'flex', alignItems: 'center', gap: { xs: 0.5, sm: 1.5 },
        // M3 Top app bar: 画面の地と同じ面。本文との境目は surfaceContainerHighest の細い線だけで示す
        px: { xs: 2, md: 4 }, bgcolor: tokens.color.bg,
        boxShadow: `inset 0 -1px 0 ${tokens.color.surfaceContainerHighest}`,
      }}
    >
      <IconButton onClick={onMenu} aria-label="メニューを開く" sx={{ display: { lg: 'none' }, ml: -1 }}>
        <MenuIcon size={20} />
      </IconButton>
      <Box sx={{ display: { xs: 'none', sm: 'block', lg: 'none' } }}><LogoMark size={28} /></Box>
      {children}
    </Box>
  );
}

/** 配色の切替（ライト ⇄ ダーク）。押した位置から新しい配色が広がる。細かい設定（システムに従う）は設定画面 */
export function ThemeToggle() {
  const { mode, setPref } = useThemeMode();
  const reduced = useReducedMotion();
  const next = mode === 'dark' ? 'light' : 'dark';
  const label = next === 'dark' ? 'ダークモードに切り替える' : 'ライトモードに切り替える';
  return (
    <Tooltip title={label}>
      <IconButton
        aria-label={label}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setPref(next, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
        }}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={mode}
            style={{ display: 'grid', placeItems: 'center' }}
            initial={reduced ? false : { rotate: -90, scale: 0.4, opacity: 0 }}
            animate={{ rotate: 0, scale: 1, opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { rotate: 90, scale: 0.4, opacity: 0 }}
            transition={reduced ? { duration: 0 } : tokens.motion.spring.default}
          >
            {mode === 'dark' ? <Moon size={19} /> : <Sun size={19} />}
          </motion.span>
        </AnimatePresence>
      </IconButton>
    </Tooltip>
  );
}

export interface SwitcherProject {
  id: string;
  siteName: string;
  clientName: string;
  accent: string;
}

/** プロジェクトの切替（見た目）。list の中から選ぶ。current が無いとき（担当案件が 0 件など）は emptyText をボタンにも出す */
export function ProjectSwitcherView({ current, list, emptyText, onSelect }: { current?: SwitcherProject; list: SwitcherProject[]; emptyText?: string; onSelect: (id: string) => void }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const name = current?.siteName ?? emptyText ?? '';
  return (
    <>
      <ButtonBase
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-haspopup="menu"
        aria-label={`プロジェクトを切り替える（現在: ${name}）`}
        sx={{
          gap: 1, px: 1.25, height: { xs: 44, md: 36 }, minWidth: 0, borderRadius: '10px', border: `1px solid ${tokens.color.border}`, bgcolor: tokens.color.surface,
          maxWidth: { xs: 200, sm: 260 }, '&:hover': { borderColor: tokens.color.borderStrong },
        }}
      >
        {current && <Box sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: current.accent, flexShrink: 0 }} />}
        <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{name}</Typography>
        <ChevronDown size={15} color={tokens.color.muted} style={{ flexShrink: 0 }} />
      </ButtonBase>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)} slotProps={{ paper: { sx: { minWidth: 260 } } }}>
        {!list.length && emptyText && <MenuItem disabled sx={{ whiteSpace: 'normal' }}>{emptyText}</MenuItem>}
        {list.map((p) => (
          <MenuItem
            key={p.id}
            selected={p.id === current?.id}
            onClick={() => {
              onSelect(p.id);
              setAnchor(null);
            }}
          >
            <ListItemIcon><Box sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: p.accent }} /></ListItemIcon>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{p.siteName}</Typography>
              <Typography variant="caption" noWrap sx={{ display: 'block' }}>{p.clientName}</Typography>
            </Box>
            {p.id === current?.id && <Check size={16} color={tokens.color.primary} />}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

/** スマホ・タブレット下部のタブの枠（md 未満。横向きのスマホは高さが足りないので隠す。メニューは上部バーから開ける） */
export function ShellBottomNav({ children }: { children: ReactNode }) {
  return (
    <Box
      component="nav"
      aria-label="クイックメニュー"
      sx={{
        display: { xs: 'flex', md: 'none' }, position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 25,
        // M3 Navigation bar: surfaceContainer の面・罫線なし。選択中はアイコンの下に secondaryContainer の pill
        bgcolor: tokens.color.surfaceContainer,
        pb: 'env(safe-area-inset-bottom)',
        [LANDSCAPE_PHONE]: { display: 'none' },
      }}
    >
      {children}
    </Box>
  );
}

/** 下部タブの 1 つ。to があればリンク、無ければ onClick のボタン（「メニュー」） */
export function BottomNavItem({ to, onClick, active, label, icon: Icon, count = 0, ariaLabel }: { to?: string; onClick?: () => void; active: boolean; label: string; icon: LucideIcon; count?: number; ariaLabel?: string }) {
  const link = to ? { component: Link, to } : { onClick };
  return (
    <ButtonBase
      // 選択中の判定は item.match で行う（NavLink だと aria-current が上書きされる）
      {...link}
      aria-current={active ? 'page' : undefined}
      aria-label={ariaLabel}
      sx={{ flex: 1, flexDirection: 'column', gap: 0.5, height: 64, fontSize: 12, lineHeight: 1.2, whiteSpace: 'nowrap', fontWeight: active ? 700 : 500, color: active ? tokens.color.onSurface : tokens.color.onSurfaceVariant, ...navIndicatorSx(active) }}
    >
      <Box component="span" className="nav-ind" sx={{ position: 'relative', display: 'grid', placeItems: 'center', width: 56, height: 28, color: active ? tokens.color.onSecondaryContainer : 'inherit' }}>
        <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
        <NavCountBadge count={count} />
      </Box>
      {label}
    </ButtonBase>
  );
}

/** 画面全体の地と「本文へスキップ」 */
export function ShellRoot({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: tokens.color.bg }}>
      <a href="#main" className="skip-link">本文へスキップ</a>
      {children}
    </Box>
  );
}

/** レールの右の列（上部バー＋本文）。本文の下の余白はスマホの下部タブ（64px）に隠れない高さ */
export function ShellColumn({ top, children, pbMd = 6 }: { top: ReactNode; children: ReactNode; pbMd?: number }) {
  return (
    <Box sx={{ pl: { lg: `${tokens.layout.sidebar}px` }, minWidth: 0 }}>
      {top}
      <Box
        component="main"
        id="main"
        tabIndex={-1}
        sx={{
          px: { xs: 2, sm: 3, md: 4, xl: 5 }, pt: { xs: 3, md: 4 }, pb: { xs: 'calc(96px + env(safe-area-inset-bottom))', md: pbMd },
          // 横向きのスマホ（高さが低い）は下部タブを出さないので余白も戻す
          [LANDSCAPE_PHONE]: { pb: 4 },
          maxWidth: tokens.layout.contentMax + 80, mx: 'auto', outline: 'none', minWidth: 0,
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
