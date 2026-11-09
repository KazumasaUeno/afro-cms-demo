import { Box, ButtonBase, Stack, Tooltip, Typography } from '@mui/material';
import { ExternalLink, Presentation } from 'lucide-react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { tokens } from '@/theme/tokens';
import { AREAS, areaOf, isActive, type AreaDef, type NavItem } from './nav';
import { Logo } from './Logo';
import { MemberAvatar } from '@/components/ui';
import { memberById } from '@/data/members';
import { useDevProjects, useDevUser } from '@/features/dev/useDevUser';
import { useDemo, currentProject } from '@/store/DemoStore';

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
        position: 'relative', width: '100%', justifyContent: 'flex-start', gap: 1.5, px: 1.5, height: 40, borderRadius: '12px',
        color: active ? tokens.color.ink : tokens.color.muted, fontWeight: active ? 650 : 550, fontSize: 14,
        bgcolor: active ? tokens.color.surface : 'transparent',
        boxShadow: active ? tokens.shadow.sm : 'none',
        border: `1px solid ${active ? tokens.color.border : 'transparent'}`,
        transition: `background-color .16s, color .16s, box-shadow .16s`,
        '&:hover': { color: tokens.color.ink, bgcolor: active ? tokens.color.surface : 'rgba(15,23,42,0.04)' },
      }}
    >
      <Icon size={18} strokeWidth={active ? 2.2 : 1.9} color={active ? color : 'currentColor'} />
      <span>{item.label}</span>
    </ButtonBase>
  );
}

/** ロゴの下に出す「いまどの立場の画面か」 */
function AreaBadge({ area }: { area: AreaDef }) {
  const Icon = area.icon;
  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 1.25, py: 0.75, borderRadius: '10px', bgcolor: area.soft, color: area.color }}>
      <Icon size={15} />
      <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: 'inherit' }} noWrap>{area.label}</Typography>
      <Typography sx={{ fontSize: 12, color: tokens.color.muted, ml: 'auto !important' }} noWrap>{area.audience}</Typography>
    </Stack>
  );
}

function AdminFooter({ onNavigate }: { onNavigate?: () => void }) {
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
