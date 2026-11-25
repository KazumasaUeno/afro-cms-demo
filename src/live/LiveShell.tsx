import { Box, Button, Dialog, DialogActions, DialogContent, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import { LogOut, Moon, Sun, WifiOff } from 'lucide-react';
import { Suspense, useEffect, useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { LogoMark } from '@/components/layout/Logo';
import { RouteLoader } from '@/components/layout/RouteLoader';
import { useToast } from '@/hooks/useToast';
import { useRepositories } from '@/repositories';
import { useThemeMode } from '@/theme/ThemeMode';
import { tokens } from '@/theme/tokens';
import { TOUCH } from '@/theme/media';
import { useLiveAuth } from './auth';
import { flushBeforeSignOut, type FlushResult } from './pendingWrites';
import { LiveDataProvider } from './repositories';
import { LiveSessionContext, type LiveRole } from './session';

const ROLE_LABEL: Record<LiveRole, string> = { admin: '管理者', developer: '開発者', client: 'お客様' };

/** 役割ごとのナビ（§14 の範囲内の画面だけ） */
const NAV: Record<LiveRole, { to: string; label: string }[]> = {
  admin: [{ to: '/projects', label: 'プロジェクト' }, { to: '/users', label: 'ユーザー' }],
  developer: [{ to: '/dev/projects', label: 'プロジェクト' }, { to: '/dev/hearing', label: 'ヒアリング' }],
  client: [{ to: '/portal/approvals', label: '確認・承認' }],
};

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

function ThemeButton() {
  const { mode, setPref } = useThemeMode();
  const next = mode === 'dark' ? 'light' : 'dark';
  const label = next === 'dark' ? 'ダークモードに切り替える' : 'ライトモードに切り替える';
  return (
    <Tooltip title={label}>
      <IconButton aria-label={label} onClick={() => setPref(next)}>
        {mode === 'dark' ? <Moon size={19} /> : <Sun size={19} />}
      </IconButton>
    </Tooltip>
  );
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
          <IconButton aria-label="ログアウト" disabled={busy} onClick={() => { void logout(); }}>
            <LogOut size={19} />
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

/**
 * live のログイン後の枠（ヘッダー・役割のナビ・オフラインの表示・ログアウト）。
 * ログインしていなければ /login へ（?next= で戻り先）。権限の実体は Rules（ここは表示の出し分け）
 */
export function LiveShell() {
  const { state, signOut } = useLiveAuth();
  const { pathname, search } = useLocation();
  const online = useOnline();

  if (state.kind === 'loading') return <RouteLoader label="ログイン情報" />;
  if (state.kind !== 'active') {
    const next = `${pathname}${search}`;
    return <Navigate to={next === '/' ? '/login' : `/login?next=${encodeURIComponent(next)}`} replace />;
  }
  const { session } = state;
  const { account } = session;

  return (
    <LiveSessionContext.Provider value={session}>
      <LiveDataProvider session={session}>
        <Box sx={{ minHeight: '100dvh', bgcolor: tokens.color.bg }}>
          <Box
            component="header"
            sx={{
              position: 'sticky', top: 0, zIndex: 10, bgcolor: tokens.color.surface, borderBottom: `1px solid ${tokens.color.outlineVariant}`,
            }}
          >
            <Stack direction="row" alignItems="center" spacing={1.5} sx={{ px: { xs: 1.5, md: 3 }, minHeight: 56 }}>
              <LogoMark size={28} />
              <Typography variant="body2" sx={{ fontWeight: 700, display: { xs: 'none', sm: 'block' }, whiteSpace: 'nowrap' }}>アフロCMS</Typography>
              <Box component="nav" aria-label="メインメニュー" sx={{ display: 'flex', gap: 0.5, flex: 1, minWidth: 0, overflowX: 'auto' }}>
                {NAV[account.role].map((n) => (
                  <Button
                    key={n.to} component={NavLink} to={n.to} size="small"
                    sx={{
                      whiteSpace: 'nowrap', color: tokens.color.inkSoft, minHeight: 40, [TOUCH]: { minHeight: 44 },
                      '&.active': { color: tokens.color.primary, bgcolor: tokens.color.primarySoft },
                    }}
                  >
                    {n.label}
                  </Button>
                ))}
              </Box>
              <Box sx={{ textAlign: 'right', minWidth: 0, display: { xs: 'none', md: 'block' } }}>
                <Typography variant="body2" sx={{ fontWeight: 650, overflowWrap: 'anywhere' }}>{account.name}</Typography>
                <Typography variant="caption">{ROLE_LABEL[account.role]}{account.company ? `・${account.company}` : ''}</Typography>
              </Box>
              <ThemeButton />
              <LiveLogoutButton signOut={() => signOut()} />
            </Stack>
            {!online && (
              <Stack
                direction="row" spacing={1} alignItems="center" role="status"
                sx={{ px: { xs: 1.5, md: 3 }, py: 0.75, bgcolor: tokens.color.warningSoft, color: tokens.color.warningInk }}
              >
                <WifiOff size={16} style={{ flexShrink: 0 }} />
                <Typography variant="caption" sx={{ color: 'inherit', fontWeight: 650 }}>
                  オフラインです。接続が戻るまで保存・確認依頼・承認はできません。
                </Typography>
              </Stack>
            )}
          </Box>
          <Box component="main" sx={{ px: { xs: 2, md: 4 }, py: { xs: 2, md: 3 }, maxWidth: 1280, mx: 'auto' }}>
            <Suspense fallback={<RouteLoader />}>
              <Outlet />
            </Suspense>
          </Box>
        </Box>
      </LiveDataProvider>
    </LiveSessionContext.Provider>
  );
}
