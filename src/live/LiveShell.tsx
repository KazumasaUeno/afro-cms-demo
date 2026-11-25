import { Box, Button, Dialog, DialogActions, DialogContent, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import { LogOut, Menu as MenuIcon, WifiOff } from 'lucide-react';
import { Suspense, useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Logo } from '@/components/layout/Logo';
import { RouteLoader } from '@/components/layout/RouteLoader';
import { AREAS, isActive, type AreaDef } from '@/components/layout/nav';
import {
  AccountButtonView, AreaBadge, BottomNavItem, DrawerColumn, DrawerNav, NavRow, RailItem,
  ShellBottomNav, ShellColumn, ShellDrawer, ShellRail, ShellRoot, ShellTopBar, ThemeToggle,
} from '@/components/layout/ShellParts';
import { useToast } from '@/hooks/useToast';
import { useRepositories } from '@/repositories';
import { tokens } from '@/theme/tokens';
import { useLiveAuth } from './auth';
import { LIVE_NAV, ROLE_AREA } from './liveNav';
import { flushBeforeSignOut, type FlushResult } from './pendingWrites';
import { LiveDataProvider } from './repositories';
import { LiveSessionContext, ROLE_HOME, type LiveAccount, type LiveRole } from './session';

const ROLE_LABEL: Record<LiveRole, string> = { admin: '管理者', developer: '開発者', client: 'お客様' };

function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

/**
 * ログアウト（LiveDataProvider の内側に置く）。書き込み待ちの回答を先に送り切ってから signOut する
 * （signOut の後に送ると Rules が拒否し、ログアウト直前の入力が失われる）。送れなければログアウトを止めて理由を出す
 */
function LiveLogoutButton({ signOut }: { signOut: () => Promise<void> }) {
  const { requirements } = useRepositories();
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState<Exclude<FlushResult, 'saved'> | null>(null);
  const toast = useToast();
  /** signOut が失敗したらボタンを戻して理由を出す（押せないまま・未処理の reject にしない） */
  const doSignOut = async () => {
    setBusy(true);
    try {
      await signOut();
    } catch {
      toast('ログアウトできませんでした。接続を確かめて、もう一度お試しください', 'error');
    } finally {
      setBusy(false);
    }
  };
  const logout = async () => {
    setBusy(true);
    let r: FlushResult;
    try {
      r = await flushBeforeSignOut(() => requirements.saveNow());
    } catch {
      r = 'failed';
    } finally {
      setBusy(false);
    }
    if (r === 'saved') {
      await doSignOut();
      return;
    }
    setBlocked(r);
  };
  return (
    <>
      <Tooltip title="ログアウト">
        <span>
          <IconButton aria-label="ログアウト" disabled={busy} onClick={() => { void logout(); }} sx={{ minWidth: 44, minHeight: 44, mr: { xs: -1, md: 0 } }}>
            <LogOut size={18} />
          </IconButton>
        </span>
      </Tooltip>
      <Dialog open={!!blocked} onClose={() => setBlocked(null)} maxWidth="xs" fullWidth aria-labelledby="live-logout-unsaved-title">
        <DialogContent sx={{ pt: 3 }}>
          <Typography id="live-logout-unsaved-title" variant="h3" sx={{ mb: 1 }}>保存できていない入力があります</Typography>
          <Typography variant="body2" color="text.secondary">
            {blocked === 'timeout'
              ? '保存が終わっていません。接続を確かめて、しばらく待ってからログアウトしてください。'
              : '入力の保存に失敗しました。接続を確かめ、入力した内容が残っているかを確かめてからログアウトしてください。'}
            このままログアウトすると、保存していない入力は失われます。
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button variant="outlined" color="error" onClick={() => { setBlocked(null); void doSignOut(); }}>保存せずにログアウト</Button>
          <Button variant="contained" onClick={() => setBlocked(null)}>ログアウトしない</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

/** ログイン中の人（ドロワーの下・レールの Popover） */
function AccountCard({ account }: { account: LiveAccount }) {
  return (
    <Box sx={{ p: 1.5, borderRadius: 3, border: `1px solid ${tokens.color.border}`, bgcolor: tokens.color.surface }}>
      <Typography variant="overline" sx={{ display: 'block', lineHeight: 1.4 }}>ログイン中</Typography>
      <Typography variant="body2" sx={{ fontWeight: 650, mt: 0.5, overflowWrap: 'anywhere' }}>{account.name}</Typography>
      <Typography variant="caption" sx={{ display: 'block', overflowWrap: 'anywhere' }}>
        {ROLE_LABEL[account.role]}{account.company ? `・${account.company}` : ''}
      </Typography>
    </Box>
  );
}

function LiveTopBar({ onMenu, account, signOut }: { onMenu: () => void; account: LiveAccount; signOut: () => Promise<void> }) {
  return (
    <ShellTopBar onMenu={onMenu}>
      <Box sx={{ flex: 1 }} />
      <Box sx={{ textAlign: 'right', minWidth: 0, display: { xs: 'none', md: 'block' } }}>
        <Typography variant="body2" sx={{ fontWeight: 650, overflowWrap: 'anywhere' }}>{account.name}</Typography>
        <Typography variant="caption">{ROLE_LABEL[account.role]}{account.company ? `・${account.company}` : ''}</Typography>
      </Box>
      {/* live には設定画面が無いので、スマホでも上部バーから配色を切り替える（demo のスマホは設定画面から） */}
      <ThemeToggle />
      <LiveLogoutButton signOut={signOut} />
    </ShellTopBar>
  );
}

function OfflineNotice() {
  const online = useOnline();
  if (online) return null;
  return (
    <Stack
      direction="row" spacing={1} alignItems="center" role="status"
      sx={{ position: 'sticky', top: tokens.layout.topbar, zIndex: 14, px: { xs: 2, md: 4 }, py: 0.75, bgcolor: tokens.color.warningSoft, color: tokens.color.warningInk }}
    >
      <WifiOff size={16} style={{ flexShrink: 0 }} />
      <Typography variant="caption" sx={{ color: 'inherit', fontWeight: 650 }}>
        オフラインです。接続が戻るまで保存・確認依頼・承認はできません。
      </Typography>
    </Stack>
  );
}

/**
 * live のログイン後の枠。demo と同じ部品（ShellParts: ナビゲーションレール・ドロワー・上部バー・スマホ下部タブ）で、
 * メニューは live にある画面だけ（0.48.2。2026-11-25 ユーザー指摘「デモとデザインが違う / サイドナビもない」）。
 * ログインしていなければ /login へ（?next= で戻り先）。権限の実体は Rules（ここは表示の出し分け）
 */
export function LiveShell() {
  const { state, signOut } = useLiveAuth();
  const { pathname, search } = useLocation();
  const [open, setOpen] = useState(false);

  if (state.kind === 'loading') return <RouteLoader label="ログイン情報" />;
  if (state.kind !== 'active') {
    const next = `${pathname}${search}`;
    return <Navigate to={next === '/' ? '/login' : `/login?next=${encodeURIComponent(next)}`} replace />;
  }
  const { session } = state;
  const { account } = session;
  const area: AreaDef = AREAS[ROLE_AREA[account.role]];
  const items = LIVE_NAV[account.role];
  const close = () => setOpen(false);

  return (
    <LiveSessionContext.Provider value={session}>
      <LiveDataProvider session={session}>
        <ShellRoot>
          <ShellRail
            home={ROLE_HOME[account.role]}
            homeLabel={`アフロCMS ${area.label}のホーム`}
            navLabel={`${area.label}のメニュー`}
            footer={<AccountButtonView area={area}><AccountCard account={account} /></AccountButtonView>}
          >
            {items.map((item) => (
              <RailItem key={item.to} to={item.to} label={item.label} icon={item.icon} hint={item.hint} active={isActive(item, pathname)} color={area.color} />
            ))}
          </ShellRail>
          <ShellDrawer open={open} onClose={close}>
            <DrawerColumn>
              <Stack spacing={1.5} sx={{ px: 1, py: 0.5 }}>
                <Logo />
                <AreaBadge area={area} />
              </Stack>
              <DrawerNav label={`${area.label}のメニュー`}>
                {items.map((item) => <NavRow key={item.to} item={item} color={area.color} onNavigate={close} />)}
              </DrawerNav>
              <Box sx={{ flex: 1 }} />
              <AccountCard account={account} />
            </DrawerColumn>
          </ShellDrawer>
          <ShellColumn top={<><LiveTopBar onMenu={() => setOpen(true)} account={account} signOut={() => signOut()} /><OfflineNotice /></>}>
            <Suspense fallback={<RouteLoader />}>
              <Outlet />
            </Suspense>
          </ShellColumn>
          <ShellBottomNav>
            {items.map((item) => (
              <BottomNavItem key={item.to} to={item.to} active={isActive(item, pathname)} label={item.label} icon={item.icon} />
            ))}
            <BottomNavItem onClick={() => setOpen(true)} active={false} label="メニュー" icon={MenuIcon} ariaLabel="すべてのメニュー" />
          </ShellBottomNav>
        </ShellRoot>
      </LiveDataProvider>
    </LiveSessionContext.Provider>
  );
}
