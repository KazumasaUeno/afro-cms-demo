import { Box, Button, ButtonBase, Dialog, DialogActions, DialogContent, DialogTitle, ListItemText, Menu, MenuItem, Stack, Tab, Tabs, Typography } from '@mui/material';
import { AlertTriangle, ChevronDown, Eye, Megaphone, Monitor, Pencil, Plus, Send, Trash2, WifiOff } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader, Reveal, StatusPill, Surface } from '@/components/ui';
import { signageState, useDemo } from '@/store/DemoStore';
import { useToast } from '@/hooks/useToast';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useFullScreenDialog } from '@/hooks/useMediaQueries';
import { formatDate, relativeTime } from '@/services/time';
import { tokens } from '@/theme/tokens';
import { AREAS } from '@/components/layout/nav';
import type { CmsPage, Display, Slide, SlideTemplate } from '@/types';
import {
  deliveredSlidesOf, hasUndelivered, periodLabel, periodState, SLIDE_LIMITS, SLIDE_TEMPLATES, TEMPLATE_LABEL, waitingForSync,
} from '@/data/signage';
import { htmlToText } from '@/features/cms/sanitize';
import { EmptyScreen, SlideView } from './signage/SlideView';
import { SlideEditorDialog } from './signage/SlideEditorDialog';
import { DisplaySlidesDialog } from './signage/DisplaySlidesDialog';
import { PlayerDialog } from './signage/PlayerDialog';

const AREA = AREAS.portal;

type TabId = 'displays' | 'content';

const DEFAULT_ACCENT = { promo: 'roast', menu: 'leaf', news: 'night' } as const;

function newSlide(template: SlideTemplate, patch: Partial<Slide> = {}): Slide {
  return {
    id: `sl-${Date.now().toString(36)}`, template, title: '', body: '', accent: DEFAULT_ACCENT[template], durationSec: 10, updatedAt: '',
    ...patch,
  };
}

/** 文字数の上限で切る（はみ出した分は「…」） */
const cut = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** 端末カードの小さな画面。配信済みの内容を、表示秒数ごとに切り替える（動きを減らす設定では 1 枚目で止める） */
function LiveThumb({ display, slides }: { display: Display; slides: Slide[] }) {
  const reduced = useReducedMotion();
  const list = useMemo(() => deliveredSlidesOf(display, slides).filter((s) => periodState(s) === 'active'), [display, slides]);
  const [i, setI] = useState(0);
  const index = list.length ? i % list.length : 0;
  const cur = list[index];
  useEffect(() => {
    if (reduced || !display.online || list.length < 2 || !cur) return;
    const t = window.setTimeout(() => setI((v) => (v + 1) % list.length), cur.durationSec * 1000);
    return () => window.clearTimeout(t);
  }, [reduced, display.online, list.length, cur]);

  const portrait = display.orientation === 'portrait';
  return (
    <Box sx={{ position: 'relative', bgcolor: '#111827', borderRadius: `${tokens.radius.md}px`, p: 1.5, display: 'grid', placeItems: 'center', minHeight: 150 }}>
      <Box sx={{ width: portrait ? 112 : 'min(100%, 340px)', borderRadius: '4px', overflow: 'hidden', opacity: display.online ? 1 : 0.55, filter: display.online ? 'none' : 'grayscale(.6)' }}>
        {cur ? <SlideView slide={cur} orientation={display.orientation} /> : <EmptyScreen orientation={display.orientation} text={list.length || !display.deliveredSlideIds.length ? '配信内容がありません' : '掲載期間内のコンテンツがありません'} />}
      </Box>
      <Box sx={{
        position: 'absolute', top: 10, left: 10, display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 0.75, height: 20, borderRadius: '6px',
        fontSize: 11, fontWeight: 700, bgcolor: 'rgba(0,0,0,.55)', color: '#fff',
      }}>
        <Box component="span" sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: display.online && cur ? '#34D399' : '#9CA3AF' }} />
        {display.online ? (cur ? `再生中 ${index + 1}/${list.length}` : '待機中') : '停止中'}
      </Box>
    </Box>
  );
}

function DisplayCard({ display, slides, onEdit, onPreview, onDeliver }: { display: Display; slides: Slide[]; onEdit: () => void; onPreview: () => void; onDeliver: () => void }) {
  const changed = hasUndelivered(display, slides);
  const waiting = waitingForSync(display);
  const draft = display.slideIds.map((id) => slides.find((s) => s.id === id)).filter((s): s is Slide => !!s);
  return (
    <Surface padding={{ xs: 2, md: 2.5 }} sx={{ display: 'flex', flexDirection: 'column', gap: 1.75, height: '100%' }}>
      <Stack direction="row" spacing={1} alignItems="flex-start">
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h4" component="h3">{display.name}</Typography>
          <Typography variant="caption" sx={{ display: 'block' }}>{display.location}</Typography>
        </Box>
        <Stack direction="row" sx={{ gap: 0.5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {display.online
            ? <StatusPill tone="success">オンライン</StatusPill>
            : <StatusPill tone="warning" icon={<WifiOff size={12} />}>オフライン</StatusPill>}
          <StatusPill tone="neutral" dot={false}>{display.orientation === 'portrait' ? '縦置き' : '横置き'}</StatusPill>
        </Stack>
      </Stack>

      <LiveThumb display={display} slides={slides} />

      <Box>
        <Typography variant="caption" sx={{ display: 'block' }}>
          {display.deliveredAt ? `最終配信 ${relativeTime(display.deliveredAt)}・配信中 ${display.deliveredSlideIds.length} 件` : 'まだ配信していません'}
          {!display.online && `・最終接続 ${relativeTime(display.lastSeenAt)}`}
        </Typography>
        <Typography variant="caption" component="p" sx={{ mt: 0.5, color: tokens.color.inkSoft, overflowWrap: 'anywhere' }}>
          流す内容: {draft.length ? draft.map((s, i) => `${i + 1}. ${s.title}`).join('　') : 'なし'}
        </Typography>
      </Box>

      {changed && (
        <Stack direction="row" spacing={1} alignItems="flex-start" role="status" sx={{ px: 1.5, py: 1, borderRadius: 2, bgcolor: tokens.color.warningSoft, color: '#8A5402' }}>
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
          <Typography variant="caption" sx={{ color: 'inherit', fontWeight: 650 }}>未配信の変更があります。「配信する」を押すまで、店頭の画面は変わりません。</Typography>
        </Stack>
      )}
      {waiting && !changed && (
        <Stack direction="row" spacing={1} alignItems="flex-start" role="status" sx={{ px: 1.5, py: 1, borderRadius: 2, bgcolor: tokens.color.infoSoft, color: '#0B6699' }}>
          <WifiOff size={15} style={{ flexShrink: 0, marginTop: 2 }} />
          <Typography variant="caption" sx={{ color: 'inherit', fontWeight: 650 }}>配信済みです。端末がオンラインになったら反映されます。</Typography>
        </Stack>
      )}

      <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', mt: 'auto', '& > *': { flex: '1 1 auto' } }}>
        <Button variant="outlined" startIcon={<Pencil size={15} />} onClick={onEdit}>内容を編集</Button>
        <Button variant="outlined" startIcon={<Eye size={15} />} onClick={onPreview}>プレビュー</Button>
        <Button variant="contained" startIcon={<Send size={15} />} disabled={!changed} onClick={onDeliver}>配信する</Button>
      </Stack>
    </Surface>
  );
}

function SlideCard({ slide, usedBy, onEdit, onDelete }: { slide: Slide; usedBy: string[]; onEdit: () => void; onDelete: () => void }) {
  const st = periodState(slide);
  return (
    <Surface padding={{ xs: 1.5, md: 2 }} sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, height: '100%' }}>
      <Box sx={{ borderRadius: '8px', overflow: 'hidden', border: `1px solid ${tokens.color.border}` }}>
        <SlideView slide={slide} orientation="landscape" />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="h5" component="h3" sx={{ overflowWrap: 'anywhere' }}>{slide.title}</Typography>
        <Stack direction="row" sx={{ gap: 0.5, flexWrap: 'wrap', mt: 0.75 }}>
          <StatusPill tone="primary" dot={false}>{TEMPLATE_LABEL[slide.template]}</StatusPill>
          <StatusPill tone="neutral" dot={false}>{slide.durationSec} 秒</StatusPill>
          <StatusPill tone={st === 'active' ? 'success' : st === 'upcoming' ? 'info' : 'neutral'}>
            {st === 'active' ? '掲載中' : st === 'upcoming' ? '掲載前' : '掲載終了'}・{periodLabel(slide)}
          </StatusPill>
        </Stack>
        <Typography variant="caption" sx={{ display: 'block', mt: 0.75 }}>
          {usedBy.length ? `使っている端末: ${usedBy.join('・')}` : 'どの端末でも使っていません'}
          {slide.sourcePageId && '・お知らせから作成'}
        </Typography>
      </Box>
      <Stack direction="row" sx={{ gap: 1, mt: 'auto' }}>
        <Button variant="outlined" startIcon={<Pencil size={15} />} onClick={onEdit} sx={{ flex: 1 }}>編集</Button>
        <Button variant="text" color="error" startIcon={<Trash2 size={15} />} onClick={onDelete} aria-label={`「${slide.title}」を削除`}>削除</Button>
      </Stack>
    </Surface>
  );
}

/** 公開中のお知らせを選んで、お知らせのスライドを作る */
function NewsPickerDialog({ open, pages, onClose, onPick }: { open: boolean; pages: CmsPage[]; onClose: () => void; onPick: (p: CmsPage) => void }) {
  const fullScreen = useFullScreenDialog();
  const news = pages.filter((p) => p.type === 'news' && p.status === 'published');
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth fullScreen={fullScreen} aria-labelledby="news-picker-title">
      <DialogTitle id="news-picker-title">お知らせから作る</DialogTitle>
      <DialogContent dividers>
        <Typography variant="caption" component="p" sx={{ mb: 1.5 }}>
          公開中のお知らせのタイトルと本文から、お知らせのスライドを作ります。作ったあとで文言を整えられます。
        </Typography>
        {news.length ? (
          <Stack component="ul" spacing={1} sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {news.map((p) => (
              <li key={p.id}>
                <ButtonBase
                  onClick={() => onPick(p)}
                  sx={{ width: '100%', display: 'block', textAlign: 'left', p: 1.5, minHeight: 44, borderRadius: '12px', border: `1px solid ${tokens.color.border}`, '&:hover': { borderColor: AREA.color, bgcolor: AREA.soft } }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 650 }}>{p.title}</Typography>
                  <Typography variant="caption" sx={{ display: 'block' }}>公開 {formatDate(p.publishedAt)}・{cut(htmlToText(p.content), 48)}</Typography>
                </ButtonBase>
              </li>
            ))}
          </Stack>
        ) : (
          <Typography variant="body2" sx={{ px: 1.5, py: 1.25, borderRadius: 2, bgcolor: tokens.color.bgSubtle }}>
            公開中のお知らせがありません。「ページ・お知らせ」でお知らせを公開すると、ここから選べます。
          </Typography>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button variant="outlined" onClick={onClose}>閉じる</Button>
      </DialogActions>
    </Dialog>
  );
}

/** お客様ポータル: 店頭の画面（デジタルサイネージ）のコンテンツ作成と配信（デモ: 実際の端末には接続しない） */
export default function PortalSignagePage() {
  const { state, dispatch } = useDemo();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab: TabId = params.get('tab') === 'content' ? 'content' : 'displays';
  const { displays, slides } = signageState(state);

  const [editing, setEditing] = useState<{ slide: Slide; isNew: boolean } | null>(null);
  const [editorSlide, setEditorSlide] = useState<Slide | null>(null);
  const [displayEditId, setDisplayEditId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Slide | null>(null);
  const [lastDeleting, setLastDeleting] = useState<Slide | null>(null);
  const [newsOpen, setNewsOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  if (deleting && deleting !== lastDeleting) setLastDeleting(deleting);

  const usedBy = (id: string) => displays.filter((d) => d.slideIds.includes(id)).map((d) => d.name);
  const changedCount = displays.filter((d) => hasUndelivered(d, slides)).length;
  const offlineCount = displays.filter((d) => !d.online).length;

  const openEditor = (slide: Slide, isNew: boolean) => {
    setEditing({ slide, isNew });
    setEditorSlide(slide);
  };
  const closeEditor = () => setEditorSlide(null);

  const save = (slide: Slide) => {
    dispatch({ type: 'saveSlide', slide });
    const used = usedBy(slide.id);
    toast(editing?.isNew
      ? 'コンテンツを作成しました。「端末」の「内容を編集」で、流す画面に追加できます'
      : used.length ? 'コンテンツを保存しました。店頭の画面に反映するには、端末ごとに「配信する」を押してください' : 'コンテンツを保存しました');
    closeEditor();
  };

  const deliver = (d: Display) => {
    dispatch({ type: 'deliverDisplay', id: d.id });
    if (d.online) toast(`「${d.name}」へ配信しました`);
    else toast(`「${d.name}」へ配信しました。オフラインのため、オンラインになったら反映されます`, 'info');
  };

  const fromNews = (p: CmsPage) => {
    setNewsOpen(false);
    openEditor(newSlide('news', {
      title: cut(p.title, SLIDE_LIMITS.title),
      body: cut(htmlToText(p.content), SLIDE_LIMITS.body),
      sourcePageId: p.id,
    }), true);
  };

  const displayEdit = displays.find((d) => d.id === displayEditId) ?? null;
  const preview = displays.find((d) => d.id === previewId) ?? null;
  const shownDelete = deleting ?? lastDeleting;

  return (
    <>
      <PageHeader
        eyebrow="お客様ポータル"
        icon={<Monitor size={15} />}
        title="サイネージ"
        description="店頭の画面に流すコンテンツを作り、店舗の端末へ配信します。デモのため、実際の端末には接続していません。"
      />

      <Stack spacing={{ xs: 2, md: 2.5 }}>
        <Reveal>
          <Surface padding={{ xs: 1.5, md: 2 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
              <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap', flex: 1 }}>
                <StatusPill tone="neutral" dot={false}>端末 {displays.length} 台</StatusPill>
                {changedCount > 0 && <StatusPill tone="warning">未配信の変更 {changedCount} 台</StatusPill>}
                {offlineCount > 0 && <StatusPill tone="neutral" icon={<WifiOff size={12} />}>オフライン {offlineCount} 台</StatusPill>}
                <StatusPill tone="neutral" dot={false}>コンテンツ {slides.length} 件</StatusPill>
              </Stack>
              <Typography variant="caption">作る → 端末で流す内容を選ぶ → 配信する、の順に進めます</Typography>
            </Stack>
          </Surface>
        </Reveal>

        <Tabs
          value={tab}
          onChange={(_, v: TabId) => setParams(v === 'content' ? { tab: 'content' } : {}, { replace: true })}
          aria-label="サイネージの表示"
          sx={{ borderBottom: `1px solid ${tokens.color.border}` }}
        >
          <Tab value="displays" label={`端末 ${displays.length}`} id="signage-tab-displays" aria-controls="signage-panel" />
          <Tab value="content" label={`コンテンツ ${slides.length}`} id="signage-tab-content" aria-controls="signage-panel" />
        </Tabs>

        <Box id="signage-panel" role="tabpanel" aria-labelledby={`signage-tab-${tab}`}>
          {tab === 'displays' ? (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', md: 'repeat(2, minmax(0,1fr))', xl: 'repeat(3, minmax(0,1fr))' }, gap: { xs: 2, md: 2.5 } }}>
              {displays.map((d, i) => (
                <Reveal key={d.id} delay={i * 0.04}>
                  <DisplayCard display={d} slides={slides} onEdit={() => setDisplayEditId(d.id)} onPreview={() => setPreviewId(d.id)} onDeliver={() => deliver(d)} />
                </Reveal>
              ))}
            </Box>
          ) : (
            <Stack spacing={2}>
              <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
                <Button
                  variant="contained" startIcon={<Plus size={16} />} endIcon={<ChevronDown size={14} />}
                  aria-haspopup="menu" aria-expanded={!!menuAnchor} aria-controls={menuAnchor ? 'signage-new-menu' : undefined}
                  onClick={(e) => setMenuAnchor(e.currentTarget)}
                >
                  新しく作る
                </Button>
                <Button variant="outlined" startIcon={<Megaphone size={16} />} onClick={() => setNewsOpen(true)}>お知らせから作る</Button>
              </Stack>
              <Menu id="signage-new-menu" anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>
                {SLIDE_TEMPLATES.map((t) => (
                  <MenuItem key={t.id} onClick={() => { setMenuAnchor(null); openEditor(newSlide(t.id), true); }}>
                    <ListItemText primary={t.label} secondary={t.description} />
                  </MenuItem>
                ))}
              </Menu>

              {slides.length ? (
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', sm: 'repeat(2, minmax(0,1fr))', lg: 'repeat(3, minmax(0,1fr))' }, gap: { xs: 2, md: 2.5 } }}>
                  {slides.map((s, i) => (
                    <Reveal key={s.id} delay={Math.min(i, 6) * 0.03}>
                      <SlideCard slide={s} usedBy={usedBy(s.id)} onEdit={() => openEditor(s, false)} onDelete={() => setDeleting(s)} />
                    </Reveal>
                  ))}
                </Box>
              ) : (
                <Surface padding={{ xs: 3, md: 4 }} sx={{ textAlign: 'center' }}>
                  <Typography variant="h5" component="p">まだコンテンツがありません</Typography>
                  <Typography variant="body2" sx={{ mt: 0.5, color: tokens.color.muted }}>「新しく作る」から、おすすめ・メニュー・お知らせを作れます。</Typography>
                </Surface>
              )}
            </Stack>
          )}
        </Box>
      </Stack>

      <SlideEditorDialog
        slide={editorSlide}
        isNew={!!editing?.isNew}
        usedBy={editing ? usedBy(editing.slide.id) : []}
        onClose={closeEditor}
        onSave={save}
      />

      <DisplaySlidesDialog
        display={displayEdit}
        slides={slides}
        onClose={() => setDisplayEditId(null)}
        onSave={(ids) => {
          const changed = !!displayEdit && ids.join(',') !== displayEdit.slideIds.join(',');
          if (displayEdit && changed) dispatch({ type: 'setDisplaySlides', id: displayEdit.id, slideIds: ids });
          setDisplayEditId(null);
          // 変えていないときは知らせない（reducer も何もしない）
          if (changed) toast('流す内容を保存しました。店頭の画面に反映するには「配信する」を押してください', 'info');
        }}
      />

      <PlayerDialog open={!!preview} display={preview} slides={slides} onClose={() => setPreviewId(null)} />

      <NewsPickerDialog open={newsOpen} pages={state.pages} onClose={() => setNewsOpen(false)} onPick={fromNews} />

      <Dialog open={!!deleting} onClose={() => setDeleting(null)} maxWidth="xs" fullWidth aria-labelledby="slide-delete-title">
        <DialogTitle id="slide-delete-title">「{shownDelete?.title}」を削除しますか？</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {shownDelete && usedBy(shownDelete.id).length
              ? `${usedBy(shownDelete.id).join('・')} の流す内容から外れます。配信済みの画面では、次に配信するまで流れ続けます。削除は元に戻せません。`
              : '削除は元に戻せません。'}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button variant="outlined" onClick={() => setDeleting(null)}>キャンセル</Button>
          <Button
            variant="contained" color="error"
            onClick={() => {
              if (deleting) {
                dispatch({ type: 'deleteSlide', id: deleting.id });
                toast(`「${deleting.title}」を削除しました`, 'info');
              }
              setDeleting(null);
            }}
          >
            削除する
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
