import { Box, ButtonBase, Stack, Tooltip, Typography } from '@mui/material';
import { ExternalLink, Presentation } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { tokens } from '@/theme/tokens';
import { AREAS, areaOf, isActive, visibleItems, type AreaDef } from './nav';
import { Logo } from './Logo';
import { useNavBadge } from './navBadge';
import { AccountButtonView, AreaBadge, DrawerColumn, DrawerNav, NavRow, RailItem, ShellRail } from './ShellParts';
import { MemberAvatar } from '@/components/ui';
import { memberById } from '@/data/members';
import { useDevProjects, useDevUser } from '@/features/dev/useDevUser';
import { useDemo, currentProject } from '@/store/DemoStore';

/** 管理者画面のメニューの下はプレゼンと設定だけ（2026-11-19 ユーザー指示。作業中のプロジェクトは上のバーの案件切り替えに出ている） */
function AdminFooter({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Tooltip title="顧客に見せる全画面のプレゼン表示" placement="right">
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
    </Tooltip>
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
  const { state } = useDemo();
  const badge = useNavBadge();
  return (
    <DrawerColumn>
      <Stack spacing={1.5} sx={{ px: 1, py: 0.5 }}>
        <Logo />
        <AreaBadge area={area} />
      </Stack>

      <DrawerNav label={`${area.label}のメニュー`}>
        {visibleItems(area.items, state).map((item) => <NavRow key={item.to} item={item} color={area.color} onNavigate={onNavigate} count={badge(item)} />)}
      </DrawerNav>

      <Box sx={{ flex: 1 }} />

      {area.id === 'admin' ? <AdminFooter onNavigate={onNavigate} /> : <AreaFooter area={area} />}

      {area.settings && <NavRow item={area.settings} color={area.color} onNavigate={onNavigate} />}
    </DrawerColumn>
  );
}

/** レールの下: ログイン中の情報（ドロワーではメニューの下に出しているもの）を Popover で出す */
function AccountButton({ area }: { area: AreaDef }) {
  return <AccountButtonView area={area}><AreaFooter area={area} /></AccountButtonView>;
}

/** PC（lg 以上）: M3 Expressive のナビゲーションレール（幅 96）。項目が多く画面が低いときはレールの中でスクロールする */
export function Sidebar() {
  const { pathname } = useLocation();
  const area = AREAS[areaOf(pathname)];
  const { state } = useDemo();
  const badge = useNavBadge();
  return (
    <ShellRail
      home={area.home}
      homeLabel={`アフロCMS ${area.label}のホーム`}
      navLabel={`${area.label}のメニュー`}
      footer={(
        <>
          {area.id === 'admin' && <RailItem to="/present" label="プレゼン" icon={Presentation} hint="顧客に見せる全画面のプレゼン表示" active={false} />}
          {area.settings && (
            <RailItem to={area.settings.to} label={area.settings.label} icon={area.settings.icon} hint={area.settings.hint} active={isActive(area.settings, pathname)} color={area.color} />
          )}
          {area.id !== 'admin' && <AccountButton area={area} />}
        </>
      )}
    >
      {visibleItems(area.items, state).map((item) => (
        <RailItem key={item.to} to={item.to} label={item.label} icon={item.icon} hint={item.hint} active={isActive(item, pathname)} color={area.color} tone={item.tone} count={badge(item)} />
      ))}
    </ShellRail>
  );
}
