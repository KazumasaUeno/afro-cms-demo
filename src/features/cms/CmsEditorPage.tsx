import { Box, Button, ButtonBase, Collapse, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputAdornment, Menu, MenuItem, Stack, Tab, Tabs, TextField, Typography, ListItemText } from '@mui/material';
import { ArrowLeft, ChevronDown, Eye, GitCompare, LayoutTemplate, Plus, Search, Send, SlidersHorizontal, Save, Rocket, CalendarClock } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { CmsPage, PageType } from '@/types';
import { currentProject, useDemo } from '@/store/DemoStore';
import { isSiteLive } from '@/data/projectContent';
import { SiteNotLive } from '@/features/projects/SiteNotLive';
import { useToast } from '@/hooks/useToast';
import { useBreakpoints } from '@/hooks/useMediaQueries';
import { tokens } from '@/theme/tokens';
import { relativeTime } from '@/services/time';
import { memberById } from '@/data/members';
import { PageHeader, StatusPill } from '@/components/ui';
import { useProjectRoutes } from '@/features/projects/projectRoutes';
import { useDevUser } from '@/features/dev/useDevUser';
import { RichEditor } from './RichEditor';
import { Inspector } from './Inspector';
import { NewPageDialog } from './NewPageDialog';
import { PreviewDialog } from './PreviewDialog';
import { CompareDialog } from './CompareDialog';
import { samePage, STATUS_META, toLocalInput, TYPE_LABEL, validateSlug, validateTitle, TITLE_MAX } from './cmsUtils';

/** 上部バーの下に追従する列の最大高さ（上下の余白 16px ずつ） */
const STICKY_MAX_HEIGHT = `calc(100dvh - ${tokens.layout.topbar + 32}px)`;

function PageList({ pages, selectedId, onSelect, onNew }: { pages: CmsPage[]; selectedId?: string; onSelect: (id: string) => void; onNew: (t: PageType) => void }) {
  const [tab, setTab] = useState<PageType>('page');
  const [q, setQ] = useState('');
  const list = pages.filter((p) => p.type === tab && (!q || p.title.includes(q) || p.slug.includes(q.toLowerCase())));
  return (
    <Stack spacing={1.5} sx={{ minWidth: 0 }}>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth" aria-label="種類">
        <Tab value="page" label={`ページ ${pages.filter((p) => p.type === 'page').length}`} />
        <Tab value="news" label={`お知らせ ${pages.filter((p) => p.type === 'news').length}`} />
      </Tabs>
      <TextField
        size="small" placeholder="タイトル・URLで検索" value={q} onChange={(e) => setQ(e.target.value)} inputProps={{ 'aria-label': 'ページを検索' }}
        InputProps={{ startAdornment: <InputAdornment position="start"><Search size={15} /></InputAdornment> }}
      />
      <Stack spacing={0.75} component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
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
                <Typography variant="body2" sx={{ fontWeight: 650, color: tokens.color.ink }} noWrap>{p.title}</Typography>
                <Typography sx={{ fontFamily: tokens.font.mono, fontSize: 12, color: tokens.color.muted }} noWrap>{p.slug}</Typography>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 1 }}>
                  <StatusPill tone={meta.tone}>{meta.label}</StatusPill>
                  <Typography variant="caption">{relativeTime(p.updatedAt)}</Typography>
                </Stack>
              </ButtonBase>
            </li>
          );
        })}
        {list.length === 0 && <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>該当するページがありません</Typography>}
      </Stack>
      <Button variant="outlined" startIcon={<Plus size={16} />} onClick={() => onNew(tab)}>{TYPE_LABEL[tab]}を作成</Button>
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

/**
 * ページ・お知らせは案件ごと（0.30.0）。サイトの公開前（運用の段階より前）の案件は、編集の代わりに案内を出す（2026-11-13 ユーザー指示）。
 * 案件を切り替えたら編集中の状態を持ち越さないよう、案件ごとに作り直す（key）
 */
export default function CmsEditorPage() {
  const { state } = useDemo();
  const { dev } = useProjectRoutes();
  const project = currentProject(state);
  if (!isSiteLive(project.stage)) {
    return (
      <>
        <PageHeader eyebrow={dev ? '⑤ 運用' : 'お客様ポータル'} icon={<LayoutTemplate size={15} />} title="ページ・お知らせ" description="ページとお知らせを編集し、承認を経て公開します。" />
        <SiteNotLive icon={<LayoutTemplate size={26} />} feature="ページ編集" />
      </>
    );
  }
  return <CmsEditor key={project.id} />;
}

function CmsEditor() {
  const { state, dispatch } = useDemo();
  const toast = useToast();
  const { isDesktop, isMobile } = useBreakpoints();
  // 開発者画面（/dev/cms。0.27.0）: 下書きの編集・作成・承認依頼まで。公開・予約公開はお客様の操作なので出さない（承認はポータルの公開承認）。
  // 操作者はログイン中の開発者として記録する（by: 'client' はポータルのとき）
  const { dev } = useProjectRoutes();
  const me = useDevUser();
  const actor = dev ? { devBy: me.id } : { by: 'client' as const };
  const pages = state.pages;
  // ダッシュボード・承認画面から ?page=<id>（そのページを開く）/ ?new=page|news（新規作成）で来る
  const [params, setParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string>(() => {
    const q = params.get('page');
    return (q && pages.some((p) => p.id === q) ? q : pages[0]?.id) ?? '';
  });
  const stored = pages.find((p) => p.id === selectedId) ?? pages[0];
  const [draft, setDraft] = useState<CmsPage | undefined>(stored);
  const [mobileView, setMobileView] = useState<'list' | 'editor'>(() => (params.get('page') ? 'editor' : 'list'));
  const [newType, setNewType] = useState<PageType | null>(() => {
    const q = params.get('new');
    return q === 'page' || q === 'news' ? q : null;
  });

  // URL のパラメータは開いた時点で使い終わるので消す（再読み込みで同じダイアログが開き直さないように）
  useEffect(() => {
    if (params.has('page') || params.has('new')) setParams({}, { replace: true });
  }, [params, setParams]);
  const [pending, setPending] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [compare, setCompare] = useState(false);
  const [schedule, setSchedule] = useState(false);
  const [publishAnchor, setPublishAnchor] = useState<HTMLElement | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);

  // 保存・状態変更で store 側が変わったら、編集中でなければ追従
  useEffect(() => {
    if (!stored) return;
    setDraft((d) => (!d || d.id !== stored.id ? stored : { ...d, status: stored.status, updatedAt: stored.updatedAt, publishedAt: stored.publishedAt, publishedContent: stored.publishedContent, scheduledAt: stored.scheduledAt, updatedBy: stored.updatedBy }));
  }, [stored]);

  const dirty = !!draft && !!stored && !samePage(draft, stored);
  const titleErr = draft ? validateTitle(draft.title) : null;
  const slugErr = draft ? validateSlug(draft.slug, pages, draft.id) : null;
  const parentOptions = useMemo(() => Array.from(new Set(state.sitemap.after.nodes.map((n) => n.data.path))).sort(), [state.sitemap.after.nodes]);

  const patch = (p: Partial<CmsPage>) => setDraft((d) => (d ? { ...d, ...p } : d));

  const open = (id: string) => {
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
      return false;
    }
    if (dirty) dispatch({ type: 'savePage', page: draft, ...actor });
    if (!silent) toast('下書きを保存しました');
    return true;
  };
  const setStatus = (status: CmsPage['status'], scheduledAt?: string) => {
    if (!draft || !save(true)) return;
    dispatch({ type: 'setPageStatus', id: draft.id, status, scheduledAt, ...actor });
    toast(status === 'published' ? '公開しました（シミュレーション）' : status === 'review' ? (dev ? 'お客様に承認を依頼しました' : '承認を依頼しました') : '予約公開を設定しました', status === 'review' ? 'info' : 'success');
  };

  const header = (
    <PageHeader
      eyebrow={dev ? '⑤ 運用' : 'お客様ポータル'}
      icon={<LayoutTemplate size={15} />}
      title="ページ・お知らせ"
      description={dev
        ? 'お客様サイトのページとお知らせの下書きを編集し、お客様に承認を依頼します。公開はお客様がポータルの「公開承認」で行います。'
        : 'ページとお知らせを編集し、承認を経て公開します。公開はデモ上の状態変更のみで、実際のサーバーには反映されません。'}
    />
  );
  const newPageDialog = (
    <NewPageDialog
      open={!!newType}
      initialType={newType ?? 'page'}
      pages={pages}
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
          <PageList pages={pages} onSelect={requestOpen} onNew={(t) => setNewType(t)} />
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
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '240px minmax(0,1fr)', lg: '260px minmax(0,1fr) 320px' }, gap: { xs: 2, md: 3 }, alignItems: 'start' }}>
        {showList && (
          // 追従する一覧・設定は画面より高くなると下端に届かないので、画面の高さで区切って中をスクロールさせる
          <Box sx={{ position: { sm: 'sticky' }, top: { sm: tokens.layout.topbar + 16 }, maxHeight: { sm: STICKY_MAX_HEIGHT }, overflowY: { sm: 'auto' }, p: { sm: 0.5 }, m: { sm: -0.5 } }}>
            <PageList pages={pages} selectedId={isMobile ? undefined : draft.id} onSelect={requestOpen} onNew={(t) => setNewType(t)} />
          </Box>
        )}

        {showEditor && (
          <Stack spacing={2} sx={{ minWidth: 0 }}>
            {isMobile && <Button startIcon={<ArrowLeft size={16} />} onClick={() => setMobileView('list')} sx={{ alignSelf: 'flex-start' }}>一覧へ戻る</Button>}
            <Stack direction={{ xs: 'column', xl: 'row' }} spacing={1.5} alignItems={{ xl: 'center' }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ flex: 1, minWidth: 0 }}>
                <StatusPill tone="neutral" dot={false}>{TYPE_LABEL[draft.type]}</StatusPill>
                <StatusPill tone={STATUS_META[draft.status].tone}>{STATUS_META[draft.status].label}</StatusPill>
                <Typography variant="caption" aria-live="polite" sx={{ color: dirty ? tokens.color.warning : tokens.color.muted, fontWeight: dirty ? 650 : 500 }} noWrap>
                  {dirty ? '● 未保存の変更があります' : `保存済み・${draft.updatedBy ?? memberById(draft.authorId).name}`}
                </Typography>
              </Stack>
              {/* スマホは「プレビュー・比較・保存・承認依頼」を1行、主操作の「公開」を幅いっぱいの2行目に置く */}
              <Box sx={{
                display: { xs: 'grid', sm: 'flex' }, gridTemplateColumns: 'auto auto minmax(0,1fr) minmax(0,1fr)', flexWrap: 'wrap', gap: 1,
                '& > .MuiButton-root': { whiteSpace: 'nowrap', px: { xs: 1.25, sm: 2 } },
                '& > .MuiButton-containedPrimary': { gridColumn: { xs: '1 / -1' } },
              }}>
                <IconButton onClick={() => setPreview(true)} aria-label="公開プレビュー" sx={{ border: `1px solid ${tokens.color.border}`, bgcolor: tokens.color.surface }}><Eye size={17} /></IconButton>
                <IconButton onClick={() => setCompare(true)} aria-label="変更前後の比較" sx={{ border: `1px solid ${tokens.color.border}`, bgcolor: tokens.color.surface }}><GitCompare size={17} /></IconButton>
                <Button variant="outlined" startIcon={<Save size={16} />} onClick={() => save()} disabled={!dirty}>下書き保存</Button>
                <Button variant="outlined" startIcon={<Send size={16} />} onClick={() => setStatus('review')} disabled={draft.status === 'review' && !dirty}>承認依頼</Button>
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
                </Menu>
              </Box>
            </Stack>

            <TextField
              value={draft.title}
              onChange={(e) => patch({ title: e.target.value })}
              variant="standard"
              placeholder="タイトル"
              error={!!titleErr}
              helperText={titleErr ?? `${draft.title.length} / ${TITLE_MAX}`}
              inputProps={{ 'aria-label': 'タイトル' }}
              InputProps={{ disableUnderline: true, sx: { fontSize: { xs: 24, md: 30 }, fontWeight: 720, letterSpacing: '-0.02em' } }}
            />
            <RichEditor key={draft.id} content={draft.content} onChange={(html) => patch({ content: html })} />

            {!isDesktop && (
              <Box>
                <Button fullWidth variant="outlined" startIcon={<SlidersHorizontal size={16} />} onClick={() => setInspectorOpen((v) => !v)} aria-expanded={inspectorOpen}>
                  SEO・ページ設定を{inspectorOpen ? '閉じる' : '開く'}
                </Button>
                <Collapse in={inspectorOpen}><Box sx={{ pt: 2 }}><Inspector key={draft.id} draft={draft} onChange={patch} slugError={slugErr} /></Box></Collapse>
              </Box>
            )}
          </Stack>
        )}

        {isDesktop && (
          <Box sx={{ position: 'sticky', top: tokens.layout.topbar + 16, maxHeight: STICKY_MAX_HEIGHT, overflowY: 'auto', p: 0.5, m: -0.5 }}>
            <Inspector key={draft.id} draft={draft} onChange={patch} slugError={slugErr} />
          </Box>
        )}
      </Box>

      {newPageDialog}
      <Dialog open={!!pending} onClose={() => setPending(null)} maxWidth="xs" fullWidth>
        <DialogTitle>保存していない変更があります</DialogTitle>
        <DialogContent><Typography variant="body2" color="text.secondary">「{draft.title}」の変更を保存してから移動しますか？</Typography></DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
          <Button onClick={() => { const id = pending; setPending(null); if (id) open(id); }}>破棄して移動</Button>
          <Button variant="contained" onClick={() => { const id = pending; setPending(null); if (id && save()) open(id); }}>保存して移動</Button>
        </DialogActions>
      </Dialog>
      <PreviewDialog page={draft} open={preview} onClose={() => setPreview(false)} />
      <CompareDialog page={draft} open={compare} onClose={() => setCompare(false)} />
      <ScheduleDialog open={schedule} initial={draft.scheduledAt} onClose={() => setSchedule(false)} onConfirm={(iso) => { setSchedule(false); setStatus('scheduled', iso); }} />
    </>
  );
}
