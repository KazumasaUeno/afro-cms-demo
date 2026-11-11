import { Box, ButtonBase, Popover, Stack, Tooltip, Typography } from '@mui/material';
import { ExternalLink, Presentation, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { tokens } from '@/theme/tokens';
import { AREAS, areaOf, isActive, type AreaDef, type NavItem } from './nav';
import { Logo, LogoMark } from './Logo';
import { navIndicatorSx } from './navIndicator';
import { MemberAvatar } from '@/components/ui';
import { memberById } from '@/data/members';
import { useDevProjects, useDevUser } from '@/features/dev/useDevUser';
import { useDemo, currentProject } from '@/store/DemoStore';

/** ドロワー（lg 未満）の行。M3 Navigation drawer item: 高さ 56・角丸 Full。選択中の印は中心から広がる */
function NavRow({ item, color, onNavigate }: { item: NavItem; color: string; onNavigate?: () => void }) {
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
      sx={{
        width: '100%', justifyContent: 'flex-start', gap: 1.5, px: 2, height: 56, borderRadius: `${tokens.radius.full}px`,
        color: active ? tokens.color.onSecondaryContainer : tokens.color.onSurfaceVariant, fontWeight: active ? 700 : 500, fontSize: 14,
        transition: 'color .2s',
        ...navIndicatorSx(active, { fill: true }),
      }}
    >
      <Box component="span" className="nav-ind" aria-hidden />
      <Icon size={20} strokeWidth={active ? 2.2 : 1.9} color={active ? color : 'currentColor'} />
      <span>{item.label}</span>
    </ButtonBase>
  );
}

/** PC のナビゲーションレールの項目（M3 Expressive: 56×32 の印＋12px のラベル） */
function RailItem({ to, label, icon: Icon, active, color, hint }: { to: string; label: string; icon: LucideIcon; active: boolean; color?: string; hint: string }) {
  return (
    <Tooltip title={hint} placement="right" enterDelay={600}>
      <ButtonBase
        component={Link}
        to={to}
        aria-current={active ? 'page' : undefined}
        sx={{
          width: '100%', flexDirection: 'column', gap: 0.5, py: 0.5, minHeight: 56, borderRadius: `${tokens.radius.md}px`,
          color: active ? tokens.color.onSurface : tokens.color.onSurfaceVariant,
          // 96px のレールで語の途中で折れないよう、M3 Label small（11px）で 1 行に収める
          fontSize: 11, lineHeight: '16px', fontWeight: active ? 700 : 500, letterSpacing: 0, textAlign: 'center', whiteSpace: 'nowrap',
          transition: 'color .2s',
          ...navIndicatorSx(active),
          // キーボードのフォーカスは印の外側に輪郭線を出す（ButtonBase は outline を消すので明示する）
          '&.Mui-focusVisible, &:focus-visible': { outline: 'none' },
          '&.Mui-focusVisible .nav-ind, &:focus-visible .nav-ind': { outline: `3px solid ${tokens.color.secondary}`, outlineOffset: 2 },
        }}
      >
        <Box component="span" className="nav-ind" sx={{ width: 56, height: 32, display: 'grid', placeItems: 'center', flexShrink: 0, color: active ? tokens.color.onSecondaryContainer : 'inherit' }}>
          <Icon size={22} strokeWidth={active ? 2.2 : 1.8} color={active && color ? color : 'currentColor'} />
        </Box>
        <Box component="span" sx={{ maxWidth: '100%', overflowWrap: 'anywhere' }}>{label}</Box>
      </ButtonBase>
    </Tooltip>
  );
}

/** ロゴの下に出す「いまどの立場の画面か」 */
function AreaBadge({ area }: { area: AreaDef }) {
  const Icon = area.icon;
  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 1.5, py: 0.75, borderRadius: `${tokens.radius.sm}px`, bgcolor: area.soft, color: area.color }}>
      <Icon size={15} />
      <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: 'inherit' }} noWrap>{area.label}</Typography>
      <Typography sx={{ fontSize: 12, color: tokens.color.muted, ml: 'auto !important' }} noWrap>{area.audience}</Typography>
    </Stack>
  );
}

function AdminFooter({ onNavigate, showPresent = true }: { onNavigate?: () => void; showPresent?: boolean }) {
  const { state } = useDemo();
  const project = currentProject(state);
  return (
    <>
      <Box sx={{ p: 1.5, borderRadius: 3, border: `1px solid ${tokens.color.border}`, bgcolor: tokens.color.surface }}>
        <Typography variant="overline" sx={{ display: 'block', lineHeight: 1.4 }}>作業中のプロジェクト</Typography>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.75 }}>
          <Box sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: project.accent, flexShrink: 0 }} />
          <Typography variant="h6" noWrap>{project.siteName}</Typography>
        </Stack>
        <Typography variant="caption" noWrap sx={{ display: 'block' }}>{project.nextAction}</Typography>
      </Box>

      {showPresent && <Tooltip title="顧客に見せる全画面のプレゼン表示" placement="right">
        <ButtonBase
          component={NavLink}
          to="/present"
          onClick={onNavigate}
          sx={{
            justifyContent: 'flex-start', gap: 1.5, px: 2, height: 56, borderRadius: '16px', color: tokens.color.onPrimaryContainer, fontWeight: 500, fontSize: 14,
            bgcolor: tokens.color.primaryContainer, boxShadow: tokens.shadow.sm, // M3 Extended FAB（tonal）。押すと角が締まる
            transition: `box-shadow .2s, border-radius .35s ${tokens.motion.easeSpringCss}`,
            '&:hover': { boxShadow: tokens.shadow.md }, '&:active': { borderRadius: '12px' },
          }}
        >
          <Presentation size={18} />
          営業プレゼンモード
        </ButtonBase>
      </Tooltip>}
    </>
  );
}

/** お客様ポータル・開発者画面: 誰としてログインしているかと案件の担当 */
function AreaFooter({ area }: { area: AreaDef }) {
  const { state } = useDemo();
  const project = currentProject(state);
  const dev = area.id === 'dev';
  // 開発者画面はログイン中のメンバー、ポータルは担当ディレクター
  const devUser = useDevUser();
  const person = dev ? devUser : memberById(project.ownerId);
  const devAssigned = useDevProjects().some((p) => p.id === project.id);
  return (
    <Box sx={{ p: 1.5, borderRadius: 3, border: `1px solid ${tokens.color.border}`, bgcolor: tokens.color.surface }}>
      <Typography variant="overline" sx={{ display: 'block', lineHeight: 1.4 }}>{dev ? (devAssigned ? '担当案件' : '表示中の案件（担当外）') : '担当ディレクター'}</Typography>
      {dev ? (
        <>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.75 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: project.accent, flexShrink: 0 }} />
            <Typography variant="h6" noWrap>{project.siteName}</Typography>
          </Stack>
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: tokens.color.muted }}>
            <Typography variant="caption" noWrap sx={{ fontFamily: tokens.font.mono }}>{project.siteUrl.replace(/^https?:\/\//, '')}</Typography>
            <ExternalLink size={12} aria-hidden />
          </Stack>
        </>
      ) : (
        <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mt: 0.75 }}>
          <MemberAvatar id={person.id} size={30} />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 650 }} noWrap>{person.name}</Typography>
            <Typography variant="caption" noWrap sx={{ display: 'block' }}>アフロ株式会社・{person.role}</Typography>
          </Box>
        </Stack>
      )}
      <Typography variant="caption" sx={{ display: 'block', mt: 1, pt: 1, borderTop: `1px solid ${tokens.color.border}` }} noWrap>
        ログイン中: {dev ? `${person.name}（${person.role}）` : project.clientName}
      </Typography>
    </Box>
  );
}

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname } = useLocation();
  const area = AREAS[areaOf(pathname)];
  return (
    <Stack sx={{ height: '100%', p: 2, gap: 2, overflowY: 'auto' }}>
      <Stack spacing={1.5} sx={{ px: 1, py: 0.5 }}>
        <Logo />
        <AreaBadge area={area} />
      </Stack>

      <Box component="nav" aria-label={`${area.label}のメニュー`}>
        <Stack spacing={0.5}>
          {area.items.map((item) => <NavRow key={item.to} item={item} color={area.color} onNavigate={onNavigate} />)}
        </Stack>
      </Box>

      <Box sx={{ flex: 1 }} />

      {area.id === 'admin' ? <AdminFooter onNavigate={onNavigate} /> : <AreaFooter area={area} />}

      {area.settings && <NavRow item={area.settings} color={area.color} onNavigate={onNavigate} />}
    </Stack>
  );
}

/** レールの下: ログイン中の情報（ドロワーではメニューの下に出しているもの）を Popover で出す */
function AccountButton({ area }: { area: AreaDef }) {
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
        {area.id === 'admin' ? <AdminFooter showPresent={false} /> : <AreaFooter area={area} />}
      </Popover>
    </>
  );
}

/** PC（lg 以上）: M3 Expressive のナビゲーションレール（幅 96）。項目が多く画面が低いときはレールの中でスクロールする */
export function Sidebar() {
  const { pathname } = useLocation();
  const area = AREAS[areaOf(pathname)];
  return (
    <Box
      component="aside"
      sx={{
        display: { xs: 'none', lg: 'flex' }, flexDirection: 'column', alignItems: 'center', gap: 1.5,
        position: 'fixed', inset: '0 auto 0 0', width: tokens.layout.sidebar, py: 2, px: 1,
        bgcolor: tokens.color.bg, zIndex: 20, overflowY: 'auto', overflowX: 'hidden', // M3 Navigation rail は罫線なし
      }}
    >
      <ButtonBase
        component={Link}
        to={area.home}
        aria-label={`アフロCMS ${area.label}のホーム`}
        sx={{
          borderRadius: '14px', mb: 1, flexShrink: 0, transition: `transform .35s ${tokens.motion.easeSpringCss}`, '&:active': { transform: 'scale(0.92)' },
          '&.Mui-focusVisible': { outline: `3px solid ${tokens.color.secondary}`, outlineOffset: 2 },
        }}
      >
        <LogoMark size={44} />
      </ButtonBase>

      <Box component="nav" aria-label={`${area.label}のメニュー`} sx={{ width: '100%' }}>
        <Stack spacing={1.5}>
          {area.items.map((item) => (
            <RailItem key={item.to} to={item.to} label={item.label} icon={item.icon} hint={item.hint} active={isActive(item, pathname)} color={area.color} />
          ))}
        </Stack>
      </Box>

      <Box sx={{ flex: 1, minHeight: 8 }} />

      {area.id === 'admin' && <RailItem to="/present" label="プレゼン" icon={Presentation} hint="顧客に見せる全画面のプレゼン表示" active={false} />}
      {area.settings && (
        <RailItem to={area.settings.to} label={area.settings.label} icon={area.settings.icon} hint={area.settings.hint} active={isActive(area.settings, pathname)} color={area.color} />
      )}
      <AccountButton area={area} />
    </Box>
  );
}
