import { Box, ButtonBase, Stack, Tooltip, Typography } from '@mui/material';
import { Presentation } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { tokens } from '@/theme/tokens';
import { isActive, NAV_ITEMS, SETTINGS_ITEM, type NavItem } from './nav';
import { Logo } from './Logo';
import { useDemo, currentProject } from '@/store/DemoStore';

function NavRow({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const { pathname } = useLocation();
  const active = isActive(item, pathname);
  const Icon = item.icon;
  return (
    <ButtonBase
      component={NavLink}
      to={item.to}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      sx={{
        position: 'relative', width: '100%', justifyContent: 'flex-start', gap: 1.5, px: 1.5, height: 40, borderRadius: '12px',
        color: active ? tokens.color.ink : tokens.color.muted, fontWeight: active ? 650 : 550, fontSize: 14,
        bgcolor: active ? tokens.color.surface : 'transparent',
        boxShadow: active ? tokens.shadow.sm : 'none',
        border: `1px solid ${active ? tokens.color.border : 'transparent'}`,
        transition: `background-color .16s, color .16s, box-shadow .16s`,
        '&:hover': { color: tokens.color.ink, bgcolor: active ? tokens.color.surface : 'rgba(15,23,42,0.04)' },
      }}
    >
      <Icon size={18} strokeWidth={active ? 2.2 : 1.9} color={active ? tokens.color.primary : 'currentColor'} />
      <span>{item.label}</span>
    </ButtonBase>
  );
}

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { state } = useDemo();
  const project = currentProject(state);
  return (
    <Stack sx={{ height: '100%', p: 2, gap: 2 }}>
      <Box sx={{ px: 1, py: 0.5 }}>
        <Logo />
      </Box>

      <Box component="nav" aria-label="メインメニュー">
        <Stack spacing={0.5}>
          {NAV_ITEMS.map((item) => <NavRow key={item.to} item={item} onNavigate={onNavigate} />)}
        </Stack>
      </Box>

      <Box sx={{ flex: 1 }} />

      <Box sx={{ p: 1.5, borderRadius: 3, border: `1px solid ${tokens.color.border}`, bgcolor: tokens.color.surface }}>
        <Typography variant="overline" sx={{ display: 'block', lineHeight: 1.4 }}>作業中のプロジェクト</Typography>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.75 }}>
          <Box sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: project.accent, flexShrink: 0 }} />
          <Typography variant="h6" noWrap>{project.siteName}</Typography>
        </Stack>
        <Typography variant="caption" noWrap sx={{ display: 'block' }}>{project.nextAction}</Typography>
      </Box>

      <Tooltip title="顧客に見せる全画面のプレゼン表示" placement="right">
        <ButtonBase
          component={NavLink}
          to="/present"
          onClick={onNavigate}
          sx={{
            justifyContent: 'flex-start', gap: 1.5, px: 1.5, height: 44, borderRadius: '12px', color: '#fff', fontWeight: 650, fontSize: 14,
            bgcolor: tokens.color.ink, transition: 'transform .16s, box-shadow .16s',
            '&:hover': { boxShadow: tokens.shadow.md, transform: 'translateY(-1px)' },
          }}
        >
          <Presentation size={18} />
          営業プレゼンモード
        </ButtonBase>
      </Tooltip>

      <NavRow item={SETTINGS_ITEM} onNavigate={onNavigate} />
    </Stack>
  );
}

export function Sidebar() {
  return (
    <Box
      component="aside"
      sx={{
        display: { xs: 'none', lg: 'block' }, position: 'fixed', inset: '0 auto 0 0', width: tokens.layout.sidebar,
        bgcolor: tokens.color.bg, borderRight: `1px solid ${tokens.color.border}`, zIndex: 20,
      }}
    >
      <SidebarContent />
    </Box>
  );
}
