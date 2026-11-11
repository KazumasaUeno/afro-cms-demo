import { Box, ButtonBase, Drawer, IconButton, Menu, MenuItem, Tooltip, Typography, ListItemIcon } from '@mui/material';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeftRight, Check, ChevronDown, LogOut, Menu as MenuIcon, Moon, Presentation, RotateCcw, Bell, Sun } from 'lucide-react';
import { Suspense, lazy, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useOutlet } from 'react-router-dom';
import { tokens } from '@/theme/tokens';
import { LANDSCAPE_PHONE } from '@/theme/media';
import { useDemo, currentProject } from '@/store/DemoStore';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useThemeMode } from '@/theme/ThemeMode';
import { navIndicatorSx } from './navIndicator';
import { Sidebar, SidebarContent } from './Sidebar';
import { LogoMark } from './Logo';
import { AREA_ORDER, AREAS, areaOf, CLIENT_PROJECT_ID, isActive, SETTINGS_ITEM, type AreaDef } from './nav';
import { ResetDemoDialog } from './ResetDemoDialog';
import { RouteLoader } from './RouteLoader';
import { LOGIN_PATH, logoutArea, useSessions } from '@/services/session';
import type { Project } from '@/types';
import { DevProjectGate } from '@/features/dev/DevProjectGate';
import { useDevProjects } from '@/features/dev/useDevUser';

/** プロジェクトの切替。projects を渡すとその中だけを出す（開発者画面: 担当のプロジェクトだけ） */
function ProjectSwitcher({ projects, emptyText }: { projects?: Project[]; emptyText?: string }) {
  const { state, dispatch } = useDemo();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const project = currentProject(state);
  const list = projects ?? state.projects;
  return (
    <>
      <ButtonBase
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-haspopup="menu"
        aria-label={`プロジェクトを切り替える（現在: ${project.siteName}）`}
        sx={{
          gap: 1, px: 1.25, height: { xs: 44, md: 36 }, minWidth: 0, borderRadius: '10px', border: `1px solid ${tokens.color.border}`, bgcolor: tokens.color.surface,
          maxWidth: { xs: 200, sm: 260 }, '&:hover': { borderColor: tokens.color.borderStrong },
        }}
      >
        <Box sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: project.accent, flexShrink: 0 }} />
        <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{project.siteName}</Typography>
        <ChevronDown size={15} color={tokens.color.muted} style={{ flexShrink: 0 }} />
      </ButtonBase>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)} slotProps={{ paper: { sx: { minWidth: 260 } } }}>
        {!list.length && emptyText && <MenuItem disabled sx={{ whiteSpace: 'normal' }}>{emptyText}</MenuItem>}
        {list.map((p) => (
          <MenuItem
            key={p.id}
            selected={p.id === project.id}
            onClick={() => {
              dispatch({ type: 'setCurrentProject', id: p.id });
              setAnchor(null);
            }}
          >
            <ListItemIcon><Box sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: p.accent }} /></ListItemIcon>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{p.siteName}</Typography>
              <Typography variant="caption" noWrap sx={{ display: 'block' }}>{p.clientName}</Typography>
            </Box>
            {p.id === project.id && <Check size={16} color={tokens.color.primary} />}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

/** 立場（管理者 / 開発者 / お客様ポータル）の切替。未ログインの画面はそのログイン画面へ */
function AreaSwitcher({ area }: { area: AreaDef }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const navigate = useNavigate();
  const sessions = useSessions();
  const Icon = area.icon;
  return (
    <>
      <Tooltip title="表示する画面を切り替える">
        <ButtonBase
          onClick={(e) => setAnchor(e.currentTarget)}
          aria-haspopup="menu"
          aria-label={`表示する画面を切り替える（現在: ${area.label}）`}
          sx={{
            gap: 0.75, px: { xs: 0, sm: 1.25 }, width: { xs: 44, sm: 'auto' }, height: { xs: 44, md: 36 }, flexShrink: 0, borderRadius: '10px',
            bgcolor: area.soft, color: area.color, fontWeight: 700, fontSize: 13, border: '1px solid transparent',
            '&:hover': { borderColor: area.color },
          }}
        >
          <Icon size={16} />
          <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' }, whiteSpace: 'nowrap' }}>{area.label}</Box>
          <Box component="span" sx={{ display: { xs: 'none', sm: 'inline-flex' }, opacity: 0.7 }}><ArrowLeftRight size={14} /></Box>
        </ButtonBase>
      </Tooltip>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)} slotProps={{ paper: { sx: { width: 320, maxWidth: 'calc(100vw - 32px)' } } }}>
        <Typography variant="overline" component="div" sx={{ px: 2, pt: 0.5, pb: 1 }}>表示する画面</Typography>
        {AREA_ORDER.map((id) => {
          const a = AREAS[id];
          const AIcon = a.icon;
          return (
            <MenuItem
              key={id}
              selected={id === area.id}
              onClick={() => {
                setAnchor(null);
                if (id !== area.id) navigate(sessions[id] ? a.home : LOGIN_PATH[id]);
              }}
              sx={{ py: 1.25, gap: 1.5, alignItems: 'flex-start', whiteSpace: 'normal' }}
            >
              <Box sx={{ width: 32, height: 32, borderRadius: '10px', bgcolor: a.soft, color: a.color, display: 'grid', placeItems: 'center', flexShrink: 0 }}><AIcon size={17} /></Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 650 }}>
                  {a.label}
                  <Box component="span" sx={{ ml: 1, fontSize: 12, fontWeight: 500, color: tokens.color.muted }}>{a.audience}</Box>
                </Typography>
                <Typography variant="caption" sx={{ display: 'block' }}>{a.description}</Typography>
                {!sessions[id] && <Typography variant="caption" sx={{ display: 'block', mt: 0.25, fontWeight: 600, color: tokens.color.inkSoft }}>未ログイン — ログイン画面へ移動します</Typography>}
              </Box>
              {id === area.id && <Check size={16} color={a.color} style={{ marginTop: 8, flexShrink: 0 }} />}
            </MenuItem>
          );
        })}
      </Menu>
    </>
  );
}


/** 開発者画面: ログイン中のメンバーの担当プロジェクトだけを切り替えられる */
function DevProjectSwitcher() {
  const projects = useDevProjects();
  return <ProjectSwitcher projects={projects} emptyText="担当プロジェクトがありません" />;
}

/** 配色の切替（ライト ⇄ ダーク）。押した位置から新しい配色が広がる。細かい設定（システムに従う）は設定画面 */
function ThemeToggle() {
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

function TopBar({ onMenu, area }: { onMenu: () => void; area: AreaDef }) {
  const [resetOpen, setResetOpen] = useState(false);
  const navigate = useNavigate();
  const { state } = useDemo();
  const pending = state.projects.reduce((s, p) => s + p.pendingApprovals, 0);
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
      {/* 管理者画面は案件をプロジェクト一覧・詳細で選び、お客様ポータルは案件が固定なので、上部バーに案件名を置かない（開発者画面だけ担当案件を切り替える） */}
      {area.id === 'dev' && <DevProjectSwitcher />}
      <AreaSwitcher area={area} />
      <Box sx={{ flex: 1 }} />
      <Typography variant="caption" sx={{ display: { xs: 'none', md: 'block' }, px: 1.5, py: 0.5, borderRadius: 2, bgcolor: tokens.color.warningSoft, color: tokens.color.warningInk, fontWeight: 500 }}>
        デモ環境 — データはこのブラウザだけに保存
      </Typography>
      {area.id === 'admin' && <Tooltip title={`承認待ち ${pending}件`}>
        <IconButton aria-label={`承認待ち ${pending}件を見る`} onClick={() => navigate('/projects')} sx={{ position: 'relative', display: { xs: 'none', sm: 'inline-flex' } }}>
          <Bell size={19} />
          {pending > 0 && <Box sx={{ position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: '50%', bgcolor: tokens.color.error, border: `2px solid ${tokens.color.bg}` }} />}
        </IconButton>
      </Tooltip>}
      {/* スマホは上部バーが狭いので、配色の切替は設定画面から行う */}
      <Box sx={{ display: { xs: 'none', sm: 'contents' } }}><ThemeToggle /></Box>
      <Tooltip title="デモを初期化">
        <IconButton aria-label="デモを初期化" onClick={() => setResetOpen(true)}><RotateCcw size={18} /></IconButton>
      </Tooltip>
      {area.id === 'admin' && <Tooltip title="営業プレゼンモード">
        <IconButton aria-label="営業プレゼンモードを開く" onClick={() => navigate('/present')} sx={{ display: { xs: 'none', sm: 'inline-flex', lg: 'none' } }}>
          <Presentation size={19} />
        </IconButton>
      </Tooltip>}
      <Tooltip title={`${area.label}からログアウト`}>
        <IconButton
          aria-label={`${area.label}からログアウト`}
          onClick={() => {
            logoutArea(area.id);
            navigate(LOGIN_PATH[area.id], { replace: true });
          }}
          sx={{ minWidth: 44, minHeight: 44, mr: { xs: -1, md: 0 } }}
        >
          <LogOut size={18} />
        </IconButton>
      </Tooltip>
      <ResetDemoDialog open={resetOpen} onClose={() => setResetOpen(false)} />
    </Box>
  );
}

/** スマホ・タブレット下部のタブ（よく使う4画面＋メニュー） */
function BottomTabs({ onMenu, area }: { onMenu: () => void; area: AreaDef }) {
  const { pathname } = useLocation();
  const items = area.bottom;
  return (
    <Box
      component="nav"
      aria-label="クイックメニュー"
      sx={{
        display: { xs: 'flex', md: 'none' }, position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 25,
        // M3 Navigation bar: surfaceContainer の面・罫線なし。選択中はアイコンの下に secondaryContainer の pill
        bgcolor: tokens.color.surfaceContainer,
        pb: 'env(safe-area-inset-bottom)',
        // 横向きのスマホは高さが足りないので下部タブを隠す（メニューは上部バーから開ける）
        [LANDSCAPE_PHONE]: { display: 'none' },
      }}
    >
      {items.map((item) => {
        const active = isActive(item, pathname);
        const Icon = item.icon;
        return (
          <ButtonBase
            // 選択中の判定は item.match で行う（NavLink だと aria-current が上書きされる）
            key={item.to} component={Link} to={item.to} aria-current={active ? 'page' : undefined}
            sx={{ flex: 1, flexDirection: 'column', gap: 0.5, height: 64, fontSize: 12, lineHeight: 1.2, whiteSpace: 'nowrap', fontWeight: active ? 700 : 500, color: active ? tokens.color.onSurface : tokens.color.onSurfaceVariant, ...navIndicatorSx(active) }}
          >
            <Box component="span" className="nav-ind" sx={{ display: 'grid', placeItems: 'center', width: 56, height: 28, color: active ? tokens.color.onSecondaryContainer : 'inherit' }}>
              <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
            </Box>
            {item.label}
          </ButtonBase>
        );
      })}
      <ButtonBase onClick={onMenu} aria-label="すべてのメニュー" sx={{ flex: 1, flexDirection: 'column', gap: 0.5, height: 64, fontSize: 12, lineHeight: 1.2, whiteSpace: 'nowrap', fontWeight: 500, color: tokens.color.onSurfaceVariant, ...navIndicatorSx(false) }}>
        <Box component="span" className="nav-ind" sx={{ display: 'grid', placeItems: 'center', width: 56, height: 28 }}><MenuIcon size={20} /></Box>
        メニュー
      </ButtonBase>
    </Box>
  );
}

/** ローディング画面に出す移動先の名前 */
function routeLabel(pathname: string): string {
  if (pathname === '/ai-studio/design') return 'AIデザインスタジオ';
  if (pathname === '/ai-studio') return 'AI要件定義';
  if (pathname === '/site') return 'サイトマップ';
  if (pathname === '/projects/new') return '新しいプロジェクト';
  if (/^\/projects\/[^/]+/.test(pathname)) return 'プロジェクト詳細';
  const area = AREAS[areaOf(pathname)];
  const item = [...area.items, SETTINGS_ITEM].find((i) => isActive(i, pathname));
  if (!item) return 'アフロCMS';
  return area.id === 'admin' ? item.label : `${area.label}・${item.label}`;
}

/** ページ切り替え: ローディング画面（約0.5秒）→ ページ（Motion。位置は M3 Expressive の spring、不透明度は 300ms） */
function AnimatedOutlet({ dev }: { dev: boolean }) {
  const outlet = useOutlet();
  const { pathname } = useLocation();
  const reduced = useReducedMotion();
  const key = pathname.split('/').slice(0, 3).join('/');
  const label = routeLabel(pathname);

  // readyKey と key が違う間は読み込み中。effect で true にする方式だと、
  // 新しいページが一瞬見えてからローダーに切り替わるため、差分で判定する。
  const [readyKey, setReadyKey] = useState<string | null>(null);
  const loading = readyKey !== key;
  useEffect(() => {
    window.scrollTo(0, 0);
    const t = window.setTimeout(() => setReadyKey(key), reduced ? 200 : 520);
    return () => window.clearTimeout(t);
  }, [key, reduced]);

  const loader = <RouteLoader label={label} reduced={reduced} />;
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={loading ? `loading:${key}` : key}
        initial={reduced ? false : { opacity: 0, y: loading ? 0 : 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduced ? { opacity: 1 } : { opacity: 0, y: loading ? 0 : -4 }}
        transition={reduced ? { duration: 0 } : {
          opacity: { duration: loading ? tokens.motion.fast : tokens.motion.base, ease: tokens.motion.ease },
          y: tokens.motion.spring.default,
        }}
        style={{ minWidth: 0 }}
      >
        {/* 遅延読み込み（画面のコード取得）が長引いた場合も同じローディング画面を出す */}
        {/* 開発者画面は、担当のプロジェクトのときだけ中身を出す。ダッシュボード（/dev）は担当案件の一覧を先に出すので、ページの中で分ける */}
        {loading ? loader : <Suspense fallback={loader}>{dev && pathname.replace(/\/+$/, '') !== '/dev' ? <DevProjectGate>{outlet}</DevProjectGate> : outlet}</Suspense>}
      </motion.div>
    </AnimatePresence>
  );
}

// お客様ポータルでだけ使うので、管理者画面・開発者画面の読み込みに含めない
const PortalAssistant = lazy(() => import('@/features/portal/assistant/PortalAssistant').then((m) => ({ default: m.PortalAssistant })));

export function AppShell() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const area = AREAS[areaOf(pathname)];
  const { state, dispatch } = useDemo();
  // お客様ポータルは MINAMO COFFEE の案件として表示する（データはこの 1 案件分だけ持っている）。
  // 開発者画面は固定せず、担当のプロジェクトから選ぶ（担当外・データの無い案件は DevProjectGate が理由を出す）
  useEffect(() => {
    if (area.id === 'portal' && state.currentProjectId !== CLIENT_PROJECT_ID) dispatch({ type: 'setCurrentProject', id: CLIENT_PROJECT_ID });
  }, [area.id, state.currentProjectId, dispatch]);
  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: tokens.color.bg }}>
      <a href="#main" className="skip-link">本文へスキップ</a>
      <Sidebar />
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        sx={{ display: { lg: 'none' } }}
        PaperProps={{ sx: { width: 280, bgcolor: tokens.color.bg, borderRadius: '0 16px 16px 0' } }}
      >
        <SidebarContent onNavigate={() => setOpen(false)} />
      </Drawer>
      <Box sx={{ pl: { lg: `${tokens.layout.sidebar}px` }, minWidth: 0 }}>
        <TopBar onMenu={() => setOpen(true)} area={area} />
        <Box
          component="main"
          id="main"
          tabIndex={-1}
          sx={{
            // ポータルは右下の AI アシスタントのボタン（56px）に最後の行が隠れないよう、PC でも下を広く空ける
            px: { xs: 2, sm: 3, md: 4, xl: 5 }, pt: { xs: 3, md: 4 }, pb: { xs: 'calc(96px + env(safe-area-inset-bottom))', md: area.id === 'portal' ? 12 : 6 },
            // 横向きのスマホ（高さが低い）は下部タブを出さないので余白も戻す
            [LANDSCAPE_PHONE]: { pb: 4 },
            maxWidth: tokens.layout.contentMax + 80, mx: 'auto', outline: 'none', minWidth: 0,
          }}
        >
          <AnimatedOutlet dev={area.id === 'dev'} />
        </Box>
      </Box>
      <BottomTabs onMenu={() => setOpen(true)} area={area} />
      {area.id === 'portal' && <Suspense fallback={null}><PortalAssistant /></Suspense>}
    </Box>
  );
}
