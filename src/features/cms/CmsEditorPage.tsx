import { Box, Button, ButtonBase, Collapse, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputAdornment, Menu, MenuItem, Stack, TextField, Typography, ListItemText } from '@mui/material';
import { ArrowLeft, ChevronDown, Eye, GitCompare, History, LayoutTemplate, Megaphone, Plus, Search, Send, SlidersHorizontal, Save, Rocket, CalendarClock, Trash2, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink, Navigate, useBlocker, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import type { CmsPage, PageType } from '@/types';
import { currentProject, useDemo } from '@/store/DemoStore';
import { isSiteLive } from '@/data/projectContent';
import { SiteNotLive } from '@/features/projects/SiteNotLive';
import { useToast } from '@/hooks/useToast';
import { useBreakpoints } from '@/hooks/useMediaQueries';
import { tokens } from '@/theme/tokens';
import { formatDateTime, nowIso, relativeTime } from '@/services/time';
import { memberById } from '@/data/members';
import { PageHeader, StatusPill } from '@/components/ui';
import { useProjectRoutes } from '@/features/projects/projectRoutes';
import { useDevUser } from '@/features/dev/useDevUser';
import { RichEditor } from './RichEditor';
import { Inspector } from './Inspector';
import { NewPageDialog } from './NewPageDialog';
import { NewsCategoryField } from './NewsCategoryField';
import { PreviewDialog } from './PreviewDialog';
import { CompareDialog } from './CompareDialog';
import { PageHistoryDialog } from './PageHistoryDialog';
import { historyOf } from '@/data/pageHistory';
import { assetsOf } from '@/data/assets';
import { hasLiveVersion, pageDeleteBlock, samePage, STATUS_META, suggestSlug, toLocalInput, TYPE_LABEL, validateSlug, validateTitle, TITLE_MAX } from './cmsUtils';
import { NEWS_CATEGORY_DEFAULTS } from './newsCategories';

/** 上部バーの下に追従する列の最大高さ（上下の余白 16px ずつ） */
const STICKY_MAX_HEIGHT = `calc(100dvh - ${tokens.layout.topbar + 32}px)`;

/** お知らせの一覧に出す日付（公開日 → 予約日 → 更新日。2026-11-18） */
function newsDate(p: CmsPage): string {
  const d = new Date(p.publishedAt ?? p.scheduledAt ?? p.updatedAt);
  return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

/** 作成中（未保存）のお知らせの呼び名。題が空のときに「」と出さない（0.46.1） */
const CREATING_NAME = '作成中のお知らせ';
/** ダイアログ・読み上げに出す名前（題が空なら作成中のお知らせ／無題） */
function displayName(p: CmsPage, isNew: boolean): string {
  return p.title.trim() || (isNew ? CREATING_NAME : `無題の${TYPE_LABEL[p.type]}`);
}

/**
 * 一覧（ページ・お知らせのどちらか一方だけ）。2026-11-18 ユーザー指示「ページとお知らせを別物に」で、タブで切り替える 1 画面から 2 画面に分けた
 * （以前はお知らせのタブを開いても編集欄がトップページのままだった）。お知らせは日付・カテゴリーを先に、ページは URL を出す
 */
function PageList({ pages, kind, selectedId, creating, onSelect, onSelectCreating, onNew }: { pages: CmsPage[]; kind: PageType; selectedId?: string; /** 作成中（未保存）のお知らせの題（一覧の先頭に選択中として出す） */ creating?: string; onSelect: (id: string) => void; /** 作成中の行を押したとき（スマホで編集欄へ戻る。0.46.1） */ onSelectCreating?: () => void; onNew: () => void }) {
  const [q, setQ] = useState('');
  const news = kind === 'news';
  const list = pages.filter((p) => !q || p.title.includes(q) || p.slug.includes(q.toLowerCase()) || !!p.newsCategory?.includes(q));
  return (
    <Stack spacing={1.5} sx={{ minWidth: 0 }}>
      <Stack direction="row" alignItems="baseline" justifyContent="space-between">
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{TYPE_LABEL[kind]}の一覧</Typography>
        <Typography variant="caption" color="text.secondary">{pages.length} 件</Typography>
      </Stack>
      <TextField
        size="small" placeholder={news ? 'タイトル・URL・カテゴリーで検索' : 'タイトル・URLで検索'} value={q} onChange={(e) => setQ(e.target.value)} inputProps={{ 'aria-label': `${TYPE_LABEL[kind]}を検索` }}
        InputProps={{ startAdornment: <InputAdornment position="start"><Search size={15} /></InputAdornment> }}
      />
      <Stack spacing={0.75} component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {creating !== undefined && (
          <li>
            {/* 他の行と同じく押せる（0.46.1。以前は押せず、スマホで一覧へ戻ると作成中のお知らせを開き直せなかった） */}
            <ButtonBase
              onClick={onSelectCreating}
              aria-current="true"
              sx={{ width: '100%', display: 'block', textAlign: 'left', p: 1.5, borderRadius: '14px', bgcolor: tokens.color.surface, border: `1px dashed ${tokens.color.primary}`, '&:hover': { bgcolor: tokens.color.surface } }}
            >
              <Typography variant="caption" sx={{ color: tokens.color.primary, fontWeight: 650 }}>作成中</Typography>
              <Typography variant="body2" sx={{ fontWeight: 650, color: tokens.color.ink }} noWrap>{creating}</Typography>
            </ButtonBase>
          </li>
        )}
        {list.map((p) => {
          const active = p.id === selectedId;
          const meta = STATUS_META[p.status];
          return (
            <li key={p.id}>
              <ButtonBase
                onClick={() => onSelect(p.id)}
                aria-current={active ? 'true' : undefined}
                sx={{
                  width: '100%', display: 'block', textAlign: 'left', p: 1.5, borderRadius: '14px',
                  bgcolor: active ? tokens.color.surface : 'transparent', border: `1px solid ${active ? tokens.color.border : 'transparent'}`,
                  boxShadow: active ? tokens.shadow.sm : 'none', '&:hover': { bgcolor: tokens.color.surface },
                }}
              >
                {news ? (
                  // お知らせ: 日付・カテゴリー → タイトル（2 行まで）。URL は設定欄で見る
                  <>
                    <Stack direction="row" alignItems="center" spacing={0.75} sx={{ minWidth: 0 }}>
                      <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums', color: tokens.color.muted, flexShrink: 0 }}>{newsDate(p)}</Typography>
                      {/* お知らせのカテゴリー（2026-11-17 会議） */}
                      {p.newsCategory && <StatusPill tone="neutral" dot={false}>{p.newsCategory}</StatusPill>}
                    </Stack>
                    <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 650, color: tokens.color.ink, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.title}</Typography>
                    <Box sx={{ mt: 1 }}><StatusPill tone={meta.tone}>{meta.label}</StatusPill></Box>
                  </>
                ) : (
                  <>
                    <Typography variant="body2" sx={{ fontWeight: 650, color: tokens.color.ink }} noWrap>{p.title}</Typography>
                    <Typography sx={{ fontFamily: tokens.font.mono, fontSize: 12, color: tokens.color.muted }} noWrap>{p.slug}</Typography>
                    <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mt: 1, minWidth: 0 }}>
                      <StatusPill tone={meta.tone}>{meta.label}</StatusPill>
                      <Typography variant="caption" sx={{ ml: 'auto !important', flexShrink: 0 }}>{relativeTime(p.updatedAt)}</Typography>
                    </Stack>
                  </>
                )}
              </ButtonBase>
            </li>
          );
        })}
        {list.length === 0 && <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>{q ? `該当する${TYPE_LABEL[kind]}がありません` : `${TYPE_LABEL[kind]}はまだありません`}</Typography>}
      </Stack>
      <Button variant={news ? 'contained' : 'outlined'} startIcon={<Plus size={16} />} onClick={onNew}>{TYPE_LABEL[kind]}を作成</Button>
    </Stack>
  );
}

function ScheduleDialog({ open, onClose, onConfirm, initial }: { open: boolean; onClose: () => void; onConfirm: (iso: string) => void; initial?: string }) {
  const [value, setValue] = useState(toLocalInput(initial));
  useEffect(() => {
    if (open) setValue(toLocalInput(initial));
  }, [open, initial]);
  const t = new Date(value).getTime();
  const err = !value || Number.isNaN(t) ? '日時を入力してください' : t <= Date.now() ? '現在より後の日時を指定してください' : null;
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth aria-labelledby="schedule-title">
      <DialogTitle id="schedule-title">予約公開</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>指定した日時に自動で公開されます（デモでは状態のみ変わります）。</Typography>
        <TextField type="datetime-local" fullWidth label="公開日時" value={value} onChange={(e) => setValue(e.target.value)} error={!!err} helperText={err ?? ' '} InputLabelProps={{ shrink: true }} />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button variant="outlined" onClick={onClose}>キャンセル</Button>
        <Button variant="contained" disabled={!!err} onClick={() => onConfirm(new Date(value).toISOString())}>予約する</Button>
      </DialogActions>
    </Dialog>
  );
}

/** 削除の確認（0.33.0）。消せないページは理由と次にすることだけ出す */
function DeleteDialog({ open, page, dirty, dev, isNew, onClose, onDelete }: { open: boolean; page: CmsPage; dirty: boolean; dev: boolean; /** 保存前の作成中のお知らせ（削除ではなく破棄。0.46.1） */ isNew: boolean; onClose: () => void; onDelete: () => void }) {
  if (isNew) {
    return (
      <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth aria-labelledby="page-delete-title">
        <DialogTitle id="page-delete-title">{`${CREATING_NAME}を破棄しますか？`}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">まだ保存していないお知らせです。破棄すると、書いた内容は残りません。</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button variant="outlined" onClick={onClose}>キャンセル</Button>
          <Button variant="contained" color="error" onClick={onDelete}>破棄する</Button>
        </DialogActions>
      </Dialog>
    );
  }
  const block = pageDeleteBlock(page, dev);
  const name = displayName(page, false);
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth aria-labelledby="page-delete-title">
      <DialogTitle id="page-delete-title">{block ? `「${name}」は削除できません` : `「${name}」を削除しますか？`}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary">
          {block ?? [
            `${TYPE_LABEL[page.type]}「${name}」（${page.slug}）を削除します。`,
            page.status === 'review' ? '承認待ちの依頼も取り下げられ、公開承認の一覧から消えます。' : '',
            dirty ? '保存していない変更も破棄されます。' : '',
            '削除は元に戻せません（デモではこのブラウザのデータから消えます）。',
          ].join('')}
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
        {block ? (
          <Button variant="contained" onClick={onClose}>閉じる</Button>
        ) : (
          <>
            <Button variant="outlined" onClick={onClose}>キャンセル</Button>
            <Button variant="contained" color="error" onClick={onDelete}>削除する</Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}

/**
 * ページ・お知らせは案件ごと（0.30.0）。サイトの公開前（運用の段階より前）の案件は、編集の代わりに案内を出す（2026-11-13 ユーザー指示）。
 * 案件を切り替えたら編集中の状態を持ち越さないよう、案件ごとに作り直す（key）
 */
/** 戻る先（2026-11-16 ユーザー指示「ページ・お知らせから戻るボタンがない」。ポータルはメニューから外したのでホームの「サイトの更新」へ、開発者画面はプロジェクト詳細へ） */
function useBackTarget(): { to: string; label: string } {
  const { state } = useDemo();
  const routes = useProjectRoutes();
  return routes.dev ? { to: routes.detail(currentProject(state).id), label: 'プロジェクト詳細' } : { to: '/portal', label: 'ホーム' };
}

/** 種類ごとの見出し（2026-11-18 ページとお知らせを別の画面に） */
const KIND_META: Record<PageType, { title: string; icon: typeof LayoutTemplate; dev: string; portal: string; feature: string }> = {
  page: {
    title: 'ページ', icon: LayoutTemplate, feature: 'ページ編集',
    dev: 'お客様サイトの固定ページの下書きを編集し、お客様に承認を依頼します。公開はお客様がポータルの「確認・承認」（公開承認）で行います。',
    portal: 'サイトの固定ページを編集し、承認を経て公開します。公開はデモ上の状態変更のみで、実際のサーバーには反映されません。',
  },
  news: {
    title: 'お知らせ', icon: Megaphone, feature: 'お知らせ',
    dev: 'お知らせの下書きを書き、お客様に承認を依頼します。公開はお客様がポータルの「確認・承認」（公開承認）で行います。',
    portal: 'お知らせを書いて、すぐ公開するか日時を決めて予約公開します。公開はデモ上の状態変更のみで、実際のサーバーには反映されません。',
  },
};

/**
 * ページ（/portal/pages・/dev/cms）とお知らせ（/portal/news・/dev/news）は別の画面（2026-11-18 ユーザー指示）。
 * ?page=<id> / ?new=<種類> がもう一方の種類を指していたら、その種類の画面へ転送する（承認画面・アシスタントの古い行き先のため）
 */
export default function CmsEditorPage({ kind = 'page' }: { kind?: PageType }) {
  const { state } = useDemo();
  const routes = useProjectRoutes();
  const { search } = useLocation();
  const project = currentProject(state);
  const back = useBackTarget();
  const params = new URLSearchParams(search);
  const pageParam = params.get('page');
  const target = pageParam ? state.pages.find((p) => p.id === pageParam)?.type : params.get('new');
  if ((target === 'page' || target === 'news') && target !== kind) {
    return <Navigate to={`${target === 'news' ? routes.news : routes.cms}${search}`} replace />;
  }
  const meta = KIND_META[kind];
  const Icon = meta.icon;
  if (!isSiteLive(project.stage)) {
    return (
      <>
        <Button component={RouterLink} to={back.to} size="small" startIcon={<ArrowLeft size={16} />} sx={{ mb: 2, ml: -1 }}>{back.label}</Button>
        <PageHeader eyebrow={routes.dev ? '⑦ 運用' : 'お客様ポータル'} icon={<Icon size={15} />} title={meta.title} description={routes.dev ? meta.dev : meta.portal} />
        <SiteNotLive icon={<Icon size={26} />} feature={meta.feature} />
      </>
    );
  }
  return <CmsEditor key={`${project.id}-${kind}`} kind={kind} />;
}

function CmsEditor({ kind }: { kind: PageType }) {
  const { state, dispatch } = useDemo();
  const toast = useToast();
  const { isDesktop, isMobile } = useBreakpoints();
  // 開発者画面（/dev/cms。0.27.0）: 下書きの編集・作成・承認依頼まで。公開・予約公開はお客様の操作なので出さない（承認はポータルの公開承認）。
  // 操作者はログイン中の開発者として記録する（by: 'client' はポータルのとき）
  const { dev } = useProjectRoutes();
  const me = useDevUser();
  const actor = dev ? { devBy: me.id } : { by: 'client' as const };
  // お客様が書くお知らせは自分で公開・予約公開する。承認依頼はアフロ（開発者）からお客様への依頼だけ（2026-11-20 ユーザー決定）
  const canRequestApproval = dev || kind !== 'news';
  // slug の重複検査は全種類、一覧と選択はこの画面の種類だけ
  const allPages = state.pages;
  const pages = useMemo(() => allPages.filter((p) => p.type === kind), [allPages, kind]);
  // ダッシュボード・承認画面から ?page=<id>（そのページを開く）/ ?new=page|news（新規作成）で来る
  const [params, setParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string>(() => {
    const q = params.get('page');
    return (q && pages.some((p) => p.id === q) ? q : pages[0]?.id) ?? '';
  });
  // 作成中（まだ保存していない）お知らせ（2026-11-18 ユーザー指示「お知らせの作成を押すと右側で自由に題から決めれるように」）。
  // 保存するまでストアに入れない（空のお知らせを残さない）。保存・承認依頼・公開の最初の保存で一覧に入る
  const [isNew, setIsNew] = useState(false);
  const stored = pages.find((p) => p.id === selectedId) ?? (isNew ? undefined : pages[0]);
  const [draft, setDraft] = useState<CmsPage | undefined>(stored);
  // 履歴の版を読み込んだらエディタを作り直す（RichEditor は最初の content だけを読むため。0.39.1。2026-11-16 QA で発見）
  const [editorRev, setEditorRev] = useState(0);
  const [mobileView, setMobileView] = useState<'list' | 'editor'>(() => (params.get('page') ? 'editor' : 'list'));
  // お知らせ（?new=news）はダイアログを出さず編集欄で書き始めるので newType は使わない（0.46.1。以前は一瞬ページ作成のダイアログが出ていた）
  const [newType, setNewType] = useState<PageType | null>(() => (kind !== 'news' && params.get('new') === kind ? kind : null));
  const [newsOnOpen] = useState(() => kind === 'news' && params.get('new') === 'news');
  // 保存しようとしてタイトルが空だったら、作成直後でもタイトル欄に理由を出してフォーカスする（0.46.1）
  const [titleTouched, setTitleTouched] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  // URL のパラメータは開いた時点で使い終わるので消す（再読み込みで同じダイアログが開き直さないように）
  useEffect(() => {
    if (params.has('page') || params.has('new')) setParams({}, { replace: true });
  }, [params, setParams]);
  const [pending, setPending] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [compare, setCompare] = useState(false);
  // ページの履歴（0.35.0）。restoredFrom: 履歴の版を読み込んだ後の保存で「復元して保存」と残すための版の id
  const [history, setHistory] = useState(false);
  const [restoredFrom, setRestoredFrom] = useState<string | null>(null);
  const [schedule, setSchedule] = useState(false);
  const [publishAnchor, setPublishAnchor] = useState<HTMLElement | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  // 削除の確認（0.33.0）。消せないページは理由だけ出す
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteSnap, setDeleteSnap] = useState<CmsPage | null>(null);
  // 閉じる動きの間も「破棄」の見出しのままにする（作成中のお知らせを破棄したとき）
  const [deleteSnapNew, setDeleteSnapNew] = useState(false);

  // 保存・状態変更で store 側が変わったら、編集中でなければ追従
  useEffect(() => {
    if (!stored) return;
    setDraft((d) => (!d || d.id !== stored.id ? stored : { ...d, status: stored.status, updatedAt: stored.updatedAt, publishedAt: stored.publishedAt, publishedContent: stored.publishedContent, scheduledAt: stored.scheduledAt, updatedBy: stored.updatedBy }));
  }, [stored]);

  const dirty = !!draft && (isNew || (!!stored && !samePage(draft, stored)));
  const titleErr = draft ? validateTitle(draft.title) : null;
  const slugErr = draft ? validateSlug(draft.slug, allPages, draft.id) : null;
  const parentOptions = useMemo(() => Array.from(new Set(state.sitemap.after.nodes.map((n) => n.data.path))).sort(), [state.sitemap.after.nodes]);

  const patch = (p: Partial<CmsPage>) => setDraft((d) => (d ? { ...d, ...p } : d));

  /** お知らせの作成: ダイアログを出さず、右側の編集欄に空のお知らせを開く（URL は日付から自動。重なれば -2, -3…） */
  const startNewsNow = () => {
    const base = suggestSlug('news', '');
    let slug = base;
    // 直前に保存した作成中のお知らせはまだ allPages に入っていないので、その URL とも重ねない
    for (let n = 2; validateSlug(slug, allPages) || slug === draft?.slug; n++) slug = `${base}-${n}`;
    const page: CmsPage = {
      id: `pg-${Date.now().toString(36)}`, type: 'news', title: '', slug, content: '<p></p>',
      seoTitle: '', seoDescription: '', status: 'draft', updatedAt: nowIso(), authorId: 'm1', parentPath: '/journal',
      newsCategory: NEWS_CATEGORY_DEFAULTS[0],
    };
    setIsNew(true);
    setRestoredFrom(null);
    setTitleTouched(false);
    setSelectedId(page.id);
    setDraft(page);
    setMobileView('editor');
  };
  const startNews = () => (dirty ? setPendingNew(true) : startNewsNow());
  // ホームの「お知らせを書く」（?new=news）で来たときも、ダイアログではなく編集欄で書き始める
  useEffect(() => {
    if (newsOnOpen) startNewsNow();
    // 開いたときの 1 回だけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [pendingNew, setPendingNew] = useState(false);

  const open = (id: string) => {
    setIsNew(false);
    setRestoredFrom(null);
    setTitleTouched(false);
    setSelectedId(id);
    setDraft(pages.find((p) => p.id === id));
    setMobileView('editor');
  };
  const requestOpen = (id: string) => {
    if (id === selectedId) return setMobileView('editor');
    if (dirty) setPending(id);
    else open(id);
  };

  const save = (silent = false): boolean => {
    if (!draft) return false;
    if (titleErr || slugErr) {
      toast(titleErr ?? slugErr ?? '入力内容を確認してください', 'info');
      if (titleErr) {
        // 確認のダイアログから呼ばれたときは閉じた後でタイトル欄へ（そのダイアログはフォーカスを戻さない: disableRestoreFocus）
        setTitleTouched(true);
        setMobileView('editor');
        setTimeout(() => titleRef.current?.focus(), 0);
      }
      return false;
    }
    if (dirty) dispatch({ type: 'savePage', page: draft, ...actor, ...(restoredFrom ? { restoredFrom } : {}) });
    setIsNew(false);
    setRestoredFrom(null);
    if (!silent) toast('下書きを保存しました');
    return true;
  };
  const setStatus = (status: CmsPage['status'], scheduledAt?: string) => {
    if (!draft || !save(true)) return;
    dispatch({ type: 'setPageStatus', id: draft.id, status, scheduledAt, ...actor });
    toast(status === 'published' ? '公開しました（シミュレーション）' : status === 'review' ? (dev ? 'お客様に承認を依頼しました' : '承認を依頼しました') : '予約公開を設定しました', status === 'review' ? 'info' : 'success');
  };

  // 公開の取り消し（0.33.0。お客様だけ）。公開中・予約公開のページを下書きに戻す（削除の前に行う）
  const unpublish = () => {
    if (!draft || !save(true)) return;
    dispatch({ type: 'setPageStatus', id: draft.id, status: 'draft', ...actor });
    toast(`${dirty ? '変更を保存し、' : ''}${draft.status === 'scheduled' && !draft.publishedContent ? '予約公開' : '公開'}を取り消して下書きに戻しました（シミュレーション）`, 'info');
  };
  const remove = () => {
    if (!draft) return;
    // 保存前の作成中のお知らせは、捨てるだけ（ストアに無い）
    if (isNew) {
      const next = pages[0];
      setDeleteSnap(draft);
      setIsNew(false);
      setDeleteOpen(false);
      setSelectedId(next?.id ?? '');
      setDraft(next);
      setMobileView('list');
      toast('作成中のお知らせを破棄しました', 'info');
      return;
    }
    const gone = draft;
    // 閉じる動きの間もダイアログの見出しが消えたページのままになるよう、写しを残す
    setDeleteSnap(gone);
    setDeleteOpen(false);
    dispatch({ type: 'deletePage', id: gone.id, ...actor });
    // 残りのページの先頭を開く（無ければ空の一覧と作成の入口になる）
    const next = pages.find((p) => p.id !== gone.id);
    setSelectedId(next?.id ?? '');
    setDraft(next);
    setMobileView('list');
    toast(`「${gone.title}」を削除しました`, 'info');
  };

  // 戻る・サイドメニュー・下部タブ: 未保存の変更があれば確かめてから離れる（0.46.1。以前は戻るボタンだけで、メニューからの移動では黙って消えていた）。
  // 同じ画面の中の URL の変化（?page= を消すなど）は止めない。案件の切り替えは画面の移動ではないので止められない（CHANGELOG 0.46.1）
  const back = useBackTarget();
  const navigate = useNavigate();
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);
  // 再読み込み・タブを閉じるときはブラウザの確認を出す
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);
  const KindIcon = KIND_META[kind].icon;
  const header = (
    <>
    <Button size="small" startIcon={<ArrowLeft size={16} />} onClick={() => navigate(back.to)} sx={{ mb: 2, ml: -1 }}>{back.label}</Button>
    <Dialog open={blocker.state === 'blocked'} onClose={() => blocker.reset?.()} maxWidth="xs" fullWidth>
      <DialogTitle>保存していない変更があります</DialogTitle>
      <DialogContent><Typography variant="body2">{draft ? `このまま移動すると、「${displayName(draft, isNew)}」の保存していない変更は破棄されます。` : 'このまま移動すると、保存していない変更は破棄されます。'}</Typography></DialogContent>
      <DialogActions>
        <Button onClick={() => blocker.reset?.()}>編集を続ける</Button>
        <Button color="error" onClick={() => blocker.proceed?.()}>破棄して移動</Button>
      </DialogActions>
    </Dialog>
    <PageHeader
      eyebrow={dev ? '⑦ 運用' : 'お客様ポータル'}
      icon={<KindIcon size={15} />}
      title={KIND_META[kind].title}
      description={dev ? KIND_META[kind].dev : KIND_META[kind].portal}
    />
    </>
  );
  const newPageDialog = (
    <NewPageDialog
      open={!!newType}
      initialType={kind}
      pages={allPages}
      parentOptions={parentOptions}
      onClose={() => setNewType(null)}
      onCreate={(page) => {
        dispatch({ type: 'savePage', page, ...actor });
        setNewType(null);
        setSelectedId(page.id);
        setDraft(page);
        setMobileView('editor');
        toast(`「${page.title}」を作成しました`);
      }}
    />
  );
  // ページがまだ無い案件（見本の無い案件を公開した直後など。0.30.1）: 見出しと空の一覧から最初のページ・お知らせを作れるようにする
  // （以前は「ページがありません」の見出しだけで、作成の入口が無かった）
  if (!draft) {
    return (
      <>
        {header}
        <Box sx={{ maxWidth: 360 }}>
          <PageList pages={pages} kind={kind} onSelect={requestOpen} onNew={() => (kind === 'news' ? startNewsNow() : setNewType(kind))} />
        </Box>
        {newPageDialog}
      </>
    );
  }
  const showList = isDesktop || !isMobile || mobileView === 'list';
  const showEditor = isDesktop || !isMobile || mobileView === 'editor';

  return (
    <>
      {header}
      {/* お知らせは右側の欄（公開状態・設定）を出さず 2 列（2026-11-18 ユーザー指示「右側の公開状態、お知らせ設定をなくす」）。カテゴリーはタイトルの下 */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '240px minmax(0,1fr)', lg: kind === 'news' ? '260px minmax(0,1fr)' : '260px minmax(0,1fr) 320px' }, gap: { xs: 2, md: 3 }, alignItems: 'start' }}>
        {showList && (
          // 追従する一覧・設定は画面より高くなると下端に届かないので、画面の高さで区切って中をスクロールさせる
          <Box sx={{ position: { sm: 'sticky' }, top: { sm: tokens.layout.topbar + 16 }, maxHeight: { sm: STICKY_MAX_HEIGHT }, overflowY: { sm: 'auto' }, p: { sm: 0.5 }, m: { sm: -0.5 } }}>
            <PageList pages={pages} kind={kind} selectedId={isMobile ? undefined : draft.id} creating={isNew ? draft.title || '新しいお知らせ' : undefined} onSelect={requestOpen} onSelectCreating={() => setMobileView('editor')} onNew={() => (kind === 'news' ? startNews() : setNewType(kind))} />
          </Box>
        )}

        {showEditor && (
          // お知らせは 1 枚のカードにまとめる（2026-11-18 ユーザー指示「デザインをきれいに」）
          <Stack spacing={2} sx={{ minWidth: 0, ...(kind === 'news' ? { p: { xs: 2, md: 3.5 }, bgcolor: tokens.color.surface, border: `1px solid ${tokens.color.border}`, borderRadius: '20px', boxShadow: tokens.shadow.sm } : {}) }}>
            {isMobile && <Button startIcon={<ArrowLeft size={16} />} onClick={() => setMobileView('list')} sx={{ alignSelf: 'flex-start' }}>一覧へ戻る</Button>}
            {/* 状態の行と操作の行は常に 2 段（2026-11-18「デザインが変」: 3 列のときに中央が狭く、保存者の名前が「保存…」に切れていた） */}
            <Stack spacing={1.5}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ flex: 1, minWidth: 0 }}>
                {kind !== 'news' && <StatusPill tone="neutral" dot={false}>{TYPE_LABEL[draft.type]}</StatusPill>}
                <StatusPill tone={STATUS_META[draft.status].tone}>{STATUS_META[draft.status].label}</StatusPill>
                <Typography variant="caption" aria-live="polite" sx={{ color: dirty ? tokens.color.warning : tokens.color.muted, fontWeight: dirty ? 650 : 500, flex: 1, minWidth: 0 }} noWrap>
                  {isNew ? '新しいお知らせ（まだ保存していません）' : dirty ? '● 未保存の変更があります' : `保存済み・${draft.updatedBy ?? memberById(draft.authorId).name}`}
                  {/* お知らせは右側の公開状態が無いので、予約公開の日時をここに出す */}
                  {kind === 'news' && draft.status === 'scheduled' && draft.scheduledAt && `・${formatDateTime(draft.scheduledAt)} に公開予定`}
                </Typography>
                {/* ページの履歴（0.35.0）。スマホの操作バーは 1 行に収まらないので、状態の行に置く */}
                <IconButton onClick={() => setHistory(true)} aria-label="ページの履歴" sx={{ flexShrink: 0, color: tokens.color.muted, '&:hover': { color: tokens.color.primary } }}><History size={17} /></IconButton>
                {/* 削除（0.33.0）。消せないページ（公開中・予約公開・トップページ）でも押せて、理由を出す */}
                <IconButton onClick={() => { setDeleteSnap(null); setDeleteSnapNew(isNew); setDeleteOpen(true); }} aria-label={isNew ? `${CREATING_NAME}を破棄` : `「${displayName(draft, false)}」を削除`} sx={{ flexShrink: 0, color: tokens.color.muted, '&:hover': { color: tokens.color.danger } }}><Trash2 size={17} /></IconButton>
              </Stack>
              {/* スマホは「プレビュー・比較・保存・承認依頼」を1行、主操作の「公開」を幅いっぱいの2行目に置く */}
              <Box sx={{
                display: { xs: 'grid', sm: 'flex' }, gridTemplateColumns: canRequestApproval ? 'auto auto minmax(0,1fr) minmax(0,1fr)' : 'auto auto minmax(0,1fr)', flexWrap: 'wrap', gap: 1,
                '& > .MuiButton-root': { whiteSpace: 'nowrap', px: { xs: 1.25, sm: 2 } },
                '& > .MuiButton-containedPrimary': { gridColumn: { xs: '1 / -1' } },
              }}>
                <IconButton onClick={() => setPreview(true)} aria-label="公開プレビュー" sx={{ border: `1px solid ${tokens.color.border}`, bgcolor: tokens.color.surface }}><Eye size={17} /></IconButton>
                <IconButton onClick={() => setCompare(true)} aria-label="変更前後の比較" sx={{ border: `1px solid ${tokens.color.border}`, bgcolor: tokens.color.surface }}><GitCompare size={17} /></IconButton>
                <Button variant="outlined" startIcon={<Save size={16} />} onClick={() => save()} disabled={!dirty}>下書き保存</Button>
                {canRequestApproval && <Button variant="outlined" startIcon={<Send size={16} />} onClick={() => setStatus('review')} disabled={draft.status === 'review' && !dirty}>承認依頼</Button>}
                {!dev && <Button variant="contained" endIcon={<ChevronDown size={16} />} startIcon={<Rocket size={16} />} onClick={(e) => setPublishAnchor(e.currentTarget)} aria-haspopup="menu">公開</Button>}
                <Menu anchorEl={publishAnchor} open={!!publishAnchor} onClose={() => setPublishAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
                  <MenuItem onClick={() => { setPublishAnchor(null); setStatus('published'); }}>
                    <Rocket size={16} style={{ marginRight: 12 }} />
                    <ListItemText primary="今すぐ公開" secondary="即時に公開状態にします" primaryTypographyProps={{ fontWeight: 600, fontSize: 14 }} secondaryTypographyProps={{ fontSize: 12 }} />
                  </MenuItem>
                  <MenuItem onClick={() => { setPublishAnchor(null); setSchedule(true); }}>
                    <CalendarClock size={16} style={{ marginRight: 12 }} />
                    <ListItemText primary="予約公開…" secondary="日時を指定して公開" primaryTypographyProps={{ fontWeight: 600, fontSize: 14 }} secondaryTypographyProps={{ fontSize: 12 }} />
                  </MenuItem>
                  {hasLiveVersion(draft) && (
                    <MenuItem onClick={() => { setPublishAnchor(null); unpublish(); }}>
                      <Undo2 size={16} style={{ marginRight: 12 }} />
                      <ListItemText primary="公開を取り消す" secondary="下書きに戻します（削除の前に必要）" primaryTypographyProps={{ fontWeight: 600, fontSize: 14 }} secondaryTypographyProps={{ fontSize: 12 }} />
                    </MenuItem>
                  )}
                </Menu>
              </Box>
            </Stack>

            <TextField
              value={draft.title}
              onChange={(e) => patch({ title: e.target.value })}
              variant="standard"
              placeholder={kind === 'news' ? 'お知らせのタイトルを入力' : 'タイトル'}
              autoFocus={isNew}
              inputRef={titleRef}
              // 作成直後の空のタイトルは赤くしない（保存しようとしたときに知らせる）
              error={!!titleErr && (titleTouched || !(isNew && !draft.title))}
              helperText={(isNew && !draft.title && !titleTouched ? null : titleErr) ?? `${draft.title.length} / ${TITLE_MAX}`}
              inputProps={{ 'aria-label': 'タイトル' }}
              InputProps={{ disableUnderline: true, sx: { fontSize: { xs: 24, md: 30 }, fontWeight: 720, letterSpacing: '-0.02em' } }}
            />
            {kind === 'news' && (
              <Box sx={{ maxWidth: 320 }}>
                {/* 入力欄は最初の値だけを読むので、お知らせを切り替えたら作り直す（key） */}
                <NewsCategoryField key={`${draft.id}-${editorRev}`} size="small" value={draft.newsCategory} pages={allPages} onChange={(v) => patch({ newsCategory: v })} />
              </Box>
            )}
            <RichEditor key={`${draft.id}-${editorRev}`} content={draft.content} onChange={(html) => patch({ content: html })} pageType={draft.type} />

            {!isDesktop && kind !== 'news' && (
              <Box>
                <Button fullWidth variant="outlined" startIcon={<SlidersHorizontal size={16} />} onClick={() => setInspectorOpen((v) => !v)} aria-expanded={inspectorOpen}>
                  SEO・ページ設定を{inspectorOpen ? '閉じる' : '開く'}
                </Button>
                <Collapse in={inspectorOpen}><Box sx={{ pt: 2 }}><Inspector key={draft.id} draft={draft} onChange={patch} slugError={slugErr} /></Box></Collapse>
              </Box>
            )}
          </Stack>
        )}

        {isDesktop && kind !== 'news' && (
          <Box sx={{ position: 'sticky', top: tokens.layout.topbar + 16, maxHeight: STICKY_MAX_HEIGHT, overflowY: 'auto', p: 0.5, m: -0.5 }}>
            <Inspector key={draft.id} draft={draft} onChange={patch} slugError={slugErr} />
          </Box>
        )}
      </Box>

      {newPageDialog}
      <Dialog open={!!pending} onClose={() => setPending(null)} maxWidth="xs" fullWidth disableRestoreFocus>
        <DialogTitle>保存していない変更があります</DialogTitle>
        <DialogContent><Typography variant="body2" color="text.secondary">「{displayName(draft, isNew)}」の変更を保存してから移動しますか？</Typography></DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
          <Button onClick={() => { const id = pending; setPending(null); if (id) open(id); }}>破棄して移動</Button>
          <Button variant="contained" onClick={() => { const id = pending; setPending(null); if (id && save()) open(id); }}>保存して移動</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={pendingNew} onClose={() => setPendingNew(false)} maxWidth="xs" fullWidth disableRestoreFocus>
        <DialogTitle>保存していない変更があります</DialogTitle>
        <DialogContent><Typography variant="body2" color="text.secondary">「{displayName(draft, isNew)}」の変更を保存してから、新しいお知らせを作りますか？</Typography></DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
          <Button onClick={() => { setPendingNew(false); setIsNew(false); startNewsNow(); }}>破棄して作成</Button>
          <Button variant="contained" onClick={() => { setPendingNew(false); if (save()) startNewsNow(); }}>保存して作成</Button>
        </DialogActions>
      </Dialog>
      <DeleteDialog open={deleteOpen} page={deleteOpen ? draft : deleteSnap ?? draft} dirty={dirty} dev={dev} isNew={deleteOpen ? isNew : deleteSnapNew} onClose={() => setDeleteOpen(false)} onDelete={remove} />
      <PreviewDialog page={draft} open={preview} onClose={() => setPreview(false)} />
      <CompareDialog page={draft} open={compare} onClose={() => setCompare(false)} />
      <PageHistoryDialog
        open={history}
        page={draft}
        dirty={dirty}
        versions={historyOf(state, draft.id)}
        assets={assetsOf(state).items}
        onClose={() => setHistory(false)}
        onRestore={(snap, versionId) => {
          // エディタに読み込むだけ（状態・公開中の内容は変えない。保存すると「復元して保存」の版が残る）
          patch({ title: snap.title, content: snap.content, seoTitle: snap.seoTitle, seoDescription: snap.seoDescription, coverImage: snap.coverImage });
          setRestoredFrom(versionId);
          setEditorRev((n) => n + 1);
          setHistory(false);
          toast('この版をエディタに読み込みました。「下書き保存」で確定します', 'info');
        }}
      />
      <ScheduleDialog open={schedule} initial={draft.scheduledAt} onClose={() => setSchedule(false)} onConfirm={(iso) => { setSchedule(false); setStatus('scheduled', iso); }} />
    </>
  );
}
