import {
  Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputAdornment, MenuItem, Stack, Tab, Tabs, TextField,
  ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { ArrowLeft, FileText, FileType, Film, FolderOpen, Image as ImageIcon, LayoutGrid, List, Pencil, Search, Trash2, Upload } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import type { Asset } from '@/types';
import { PageHeader, StatusPill, Surface } from '@/components/ui';
import { areaOf } from '@/components/layout/nav';
import { currentProject, useDemo } from '@/store/DemoStore';
import { useDevUser } from '@/features/dev/useDevUser';
import { useToast } from '@/hooks/useToast';
import { useFullScreenDialog } from '@/hooks/useMediaQueries';
import { formatDateTime } from '@/services/time';
import { tokens } from '@/theme/tokens';
import { STATUS_META } from '@/features/cms/cmsUtils';
import {
  ASSET_ACCEPT, ASSET_LIMITS, ASSET_TYPES, assetDeleteBlock, assetPageOptions, assetsOf, assetSrc, assetType, assetTypeLabel, assetUsage, formatBytes, uploadCount,
  validateAssetName,
} from '@/data/assets';
import type { AssetPageOption, AssetType } from '@/data/assets';
import { assetFolderList } from '@/data/assetFolders';
import { useAssetUpload } from './useAssetUpload';
import { useProjectRoutes } from '@/features/projects/projectRoutes';

const ALL = '__all__';

/** 戻る導線（2026-11-16 ユーザー指示）。管理者・開発者画面ともプロジェクト詳細へ */
function BackButton() {
  const { state } = useDemo();
  const routes = useProjectRoutes();
  return (
    <Button component={RouterLink} to={routes.detail(currentProject(state).id)} size="small" startIcon={<ArrowLeft size={16} />} sx={{ mb: 2, ml: -1 }}>
      プロジェクト詳細
    </Button>
  );
}

/**
 * 素材ドライブ（0.36.0。案件ごと）。開発者画面（/dev/assets）はアップロード・名前とページの変更・削除、管理者画面（/assets）は見るだけ。
 * 2026-11-18 からページ別に、画像・PDF・テキスト・動画で分ける（ユーザー指示「素材ドライブは、ページ別で画像、PDF、テキスト、動画で分ける」）。
 * お客様ポータル（/portal/assets。2026-11-17 会議でメニューに追加）は見るのとアップロードだけ（制作中から使える）
 * （写真・PDF・原稿など。名前・カテゴリーの変更・削除は開発者）
 */
export default function AssetDrivePage() {
  const { state } = useDemo();
  const project = currentProject(state);
  const area = areaOf(useLocation().pathname);
  const dev = area === 'dev';
  const client = area === 'portal';
  // 公開前（制作中）から使える（2026-11-17 会議: お客様から提供される写真・チラシ・原稿を制作中にドライブへ入れてもらう）。
  // 以前は運用・改善の段階だけだった（0.36.0）
  return <AssetDrive key={project.id} dev={dev} client={client} />;
}

/** client: お客様ポータル（2026-11-17 会議）。一覧を見るのと、アップロードだけ（選んでいるページへ入れる） */

/** ページ未設定（page が無い素材。0.43 までの保存データもここ） */
const NONE = '';

/**
 * 2026-11-18 ユーザー指示「素材ドライブは、ページ別で画像、PDF、テキスト、動画で分ける」。
 * 分け方の主はページ（サイトマップ（after）のページ）。ページの中を画像・PDF・テキスト・動画に分ける。
 * 以前の主の分け方だったカテゴリー（folder。2026-11-17 会議）は保存データに残し、一覧の補足と編集で見せるだけ（カテゴリーの作成・削除の操作は出さない）
 */
function AssetDrive({ dev, client = false }: { dev: boolean; client?: boolean }) {
  const { state, dispatch } = useDemo();
  const me = useDevUser();
  const toast = useToast();
  const drive = assetsOf(state);
  const items = drive.items;
  const [query, setQuery] = useState('');
  const [page, setPage] = useState<string>(ALL);
  const [type, setType] = useState<AssetType | typeof ALL>(ALL);
  // アップロード先のページ（既定は絞り込み中のページ。2026-11-18）
  const [target, setTarget] = useState<string>(NONE);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [edit, setEdit] = useState<Asset | null>(null);
  const [del, setDel] = useState<Asset | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // 検査・縮小・保存はページ編集の画像選択と同じ（useAssetUpload。2026-11-17 会議で切り出し）
  // お客様は by: 'client' で写真も資料も（2026-11-17 会議）
  const { upload, busy } = useAssetUpload(client ? { by: 'client' } : { devBy: me.id }, {});

  // カテゴリーは編集で選ぶだけ（保存データの互換）
  const folders = useMemo(() => assetFolderList(drive), [drive]);
  // ページはサイトマップ（after）から。サイトマップに無いページの素材も後ろに出す
  const pages = useMemo(() => assetPageOptions(state.sitemap.after.nodes, items), [state.sitemap.after.nodes, items]);
  const labelOf = (path: string) => (path === NONE ? 'ページ未設定' : pages.find((p) => p.path === path)?.label ?? path);
  const q = query.trim().toLowerCase();
  const matched = items.filter((a) => (page === ALL || (a.page ?? NONE) === page) && (!q || a.name.toLowerCase().includes(q)));
  const typeCount = (t: AssetType) => matched.filter((a) => assetType(a) === t).length;
  const shown = matched.filter((a) => type === ALL || assetType(a) === type);
  const groups = (page === ALL ? [...pages.map((p) => p.path), NONE] : [page])
    .map((path) => ({ path, list: shown.filter((a) => (a.page ?? NONE) === path) }))
    .filter((g) => g.list.length > 0);
  const used = uploadCount(items);
  const pageCount = (path: string) => items.filter((a) => (a.page ?? NONE) === path).length;
  // アップロード先はサイトマップのページか未設定だけ（サイトマップに無いページで絞り込んでも、選べない値にしない。0.46.1）
  const uploadable = (path: string) => path === NONE || pages.some((p) => p.inSitemap && p.path === path);
  const choosePage = (v: string) => {
    setPage(v);
    if (v !== ALL) setTarget(uploadable(v) ? v : NONE);
  };
  // サイトマップの変更で選んでいたページが無くなったときも未設定に戻す
  const uploadTarget = uploadable(target) ? target : NONE;

  const uploadActions = (
    <>
      <input ref={fileRef} type="file" accept={ASSET_ACCEPT} hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(f, '', uploadTarget); }} />
      <TextField select size="small" label="アップロード先のページ" value={uploadTarget} onChange={(e) => setTarget(e.target.value)} sx={{ minWidth: 200, maxWidth: '100%' }}>
        <MenuItem value={NONE}>ページ未設定</MenuItem>
        {pages.filter((p) => p.inSitemap).map((p) => <MenuItem key={p.path} value={p.path}>{p.label}（{p.path}）</MenuItem>)}
      </TextField>
      <Button variant="contained" startIcon={busy ? <CircularProgress size={15} color="inherit" /> : <Upload size={16} />} disabled={busy} onClick={() => fileRef.current?.click()}>
        {uploadTarget ? `「${labelOf(uploadTarget)}」にアップロード` : 'アップロード'}
      </Button>
    </>
  );

  const renderItems = (list: Asset[]) => (view === 'grid' ? (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0,1fr))', sm: 'repeat(3, minmax(0,1fr))', lg: 'repeat(4, minmax(0,1fr))' }, gap: 1.5 }}>
      {list.map((a) => <AssetCard key={a.id} a={a} dev={dev} uses={assetUsage(a, state.pages).length} onEdit={() => setEdit(a)} onDelete={() => setDel(a)} />)}
    </Box>
  ) : (
    <Stack component="ul" spacing={1} sx={{ listStyle: 'none', p: 0, m: 0 }}>
      {list.map((a) => (
        <Box component="li" key={a.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1, borderRadius: '12px', border: `1px solid ${tokens.color.border}` }}>
          <Thumb a={a} size={48} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{a.name}</Typography>
            <Typography variant="caption" noWrap component="p">
              {assetTypeLabel(a)}・{formatBytes(a.size)}{a.folder ? `・${a.folder}` : ''}・{formatDateTime(a.createdAt)}・{a.createdBy}{assetType(a) === 'video' ? `・${VIDEO_NOTE}` : ''}
            </Typography>
          </Box>
          <UseCount n={assetUsage(a, state.pages).length} />
          {dev && <RowActions a={a} onEdit={() => setEdit(a)} onDelete={() => setDel(a)} />}
        </Box>
      ))}
    </Stack>
  ));

  return (
    <>
      {!client && <BackButton />}
      <PageHeader
        eyebrow={dev ? '素材' : client ? currentProject(state).siteName : 'プロジェクト'}
        icon={<FolderOpen size={15} />}
        title="素材ドライブ"
        description={dev
          ? 'ページごとに、画像・PDF・テキスト・動画を分けて管理します。画像はブラウザの中で縮小して保存します（元の画像は保存しません。PDF・テキスト・動画は名前と大きさだけ）。お客様はページ編集の画像選択から使えます。'
          : client
            ? 'サイトで使う写真・資料のお渡し場所です。ページを選んで、写真・チラシの PDF・原稿・動画などをアップロードすると、担当者が制作やページ・お知らせで使います（写真はブラウザの中で縮小して保存します）。名前の変更・削除は担当者にご相談ください。'
            : 'ページごとの画像・PDF・テキスト・動画の一覧です（管理者画面は見るだけ。追加・削除は開発者画面で行います）。'}
        actions={dev || client ? uploadActions : undefined}
      />

      <Surface>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }} sx={{ mb: 1 }}>
          <TextField
            size="small" placeholder="名前で検索" value={query} onChange={(e) => setQuery(e.target.value)} inputProps={{ 'aria-label': '素材を名前で検索' }}
            InputProps={{ startAdornment: <InputAdornment position="start"><Search size={16} /></InputAdornment> }} sx={{ flex: { md: '0 0 240px' } }}
          />
          <TextField select size="small" label="ページ" value={page} onChange={(e) => choosePage(e.target.value)} sx={{ flex: { md: '0 0 280px' } }}>
            <MenuItem value={ALL}>すべてのページ（{items.length}）</MenuItem>
            {pages.map((p) => <MenuItem key={p.path} value={p.path}>{p.label}{p.inSitemap ? '' : '（サイトマップにないページ）'}（{pageCount(p.path)}）</MenuItem>)}
            <MenuItem value={NONE}>ページ未設定（{pageCount(NONE)}）</MenuItem>
          </TextField>
          <Box sx={{ flex: 1 }} />
          <ToggleButtonGroup exclusive size="small" value={view} onChange={(_, v: 'grid' | 'list' | null) => v && setView(v)} aria-label="表示方法">
            <ToggleButton value="grid" aria-label="グリッド表示"><LayoutGrid size={16} /></ToggleButton>
            <ToggleButton value="list" aria-label="一覧表示"><List size={16} /></ToggleButton>
          </ToggleButtonGroup>
        </Stack>
        {/* 画像・PDF・テキスト・動画（件数つき。0 件の種類は押せない薄い表示） */}
        <Tabs value={type} onChange={(_, v: AssetType | typeof ALL) => setType(v)} variant="scrollable" allowScrollButtonsMobile aria-label="素材の種類" sx={{ mb: 1.5 }}>
          <Tab value={ALL} label={`すべて ${matched.length}`} />
          {ASSET_TYPES.map((t) => <Tab key={t.key} value={t.key} label={`${t.label} ${typeCount(t.key)}`} disabled={typeCount(t.key) === 0 && type !== t.key} />)}
        </Tabs>
        <Typography variant="caption" component="p" sx={{ mb: 1.5 }}>
          {shown.length} 件を表示（全 {items.length} 件・アップロード {used} / {ASSET_LIMITS.uploads} 件）
        </Typography>

        {shown.length === 0 ? (
          <Box sx={{ py: 5, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              {items.length === 0 ? '素材がありません。'
                : !q && type === ALL && page !== ALL ? `このページにはまだ素材がありません。${dev ? '「アップロード」で追加するか、ほかの素材の編集（鉛筆）からこのページへ移せます。' : client ? '「アップロード」で追加できます。' : ''}`
                  : '条件に合う素材がありません。'}
            </Typography>
          </Box>
        ) : (
          <Stack spacing={3}>
            {groups.map((g, i) => (
              <Box component="section" key={g.path || '__none__'} aria-labelledby={`asset-page-${i}`}>
                <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 1.25, minWidth: 0, flexWrap: 'wrap', rowGap: 0.25 }}>
                  <Typography id={`asset-page-${i}`} variant="subtitle1" component="h2" sx={{ fontWeight: 700, minWidth: 0, overflowWrap: 'anywhere' }}>
                    {labelOf(g.path)}
                  </Typography>
                  {g.path && <Typography variant="caption" sx={{ color: tokens.color.muted, overflowWrap: 'anywhere' }}>{g.path}</Typography>}
                  <Typography variant="caption" sx={{ color: tokens.color.muted, flexShrink: 0 }}>{g.list.length} 件</Typography>
                </Stack>
                <Stack spacing={2}>
                  {ASSET_TYPES.map((t) => ({ t, list: g.list.filter((a) => assetType(a) === t.key) })).filter((x) => x.list.length > 0).map(({ t, list }) => (
                    <Box key={t.key}>
                      <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.75, color: tokens.color.muted }}>
                        <TypeIcon type={t.key} size={15} />
                        <Typography variant="caption" component="h3" sx={{ fontWeight: 700, color: 'inherit' }}>{t.label} {list.length}</Typography>
                      </Stack>
                      {renderItems(list)}
                    </Box>
                  ))}
                </Stack>
              </Box>
            ))}
          </Stack>
        )}
      </Surface>

      {dev && edit && (
        <EditDialog
          a={edit} folders={folders} pages={pages}
          onClose={() => setEdit(null)}
          onSave={(name, f, pg) => { dispatch({ type: 'renameAsset', id: edit.id, name, folder: f, page: pg, devBy: me.id }); setEdit(null); toast('素材を更新しました'); }}
        />
      )}
      {dev && del && <DeleteDialog a={del} onClose={() => setDel(null)} onDelete={() => { dispatch({ type: 'deleteAsset', id: del.id, devBy: me.id }); toast(`「${del.name}」を削除しました`, 'info'); setDel(null); }} />}
    </>
  );
}

/** 動画は中身を保存しない（2026-11-18） */
const VIDEO_NOTE = 'デモでは動画の中身は保存しません';

function TypeIcon({ type, size }: { type: AssetType; size: number }) {
  if (type === 'image') return <ImageIcon size={size} aria-hidden />;
  if (type === 'pdf') return <FileText size={size} aria-hidden />;
  if (type === 'video') return <Film size={size} aria-hidden />;
  return <FileType size={size} aria-hidden />;
}

function Thumb({ a, size }: { a: Asset; size?: number }) {
  const src = assetSrc(a);
  const sx = size ? { width: size, height: size, flexShrink: 0, borderRadius: '10px' } : { width: '100%', aspectRatio: '16/10' };
  return src ? (
    <Box component="img" src={src} alt="" loading="lazy" sx={{ ...sx, display: 'block', objectFit: 'cover', bgcolor: tokens.color.surfaceMuted }} />
  ) : (
    <Box sx={{ ...sx, display: 'grid', placeItems: 'center', bgcolor: tokens.color.surfaceMuted, color: tokens.color.muted }}><TypeIcon type={assetType(a)} size={size ? 20 : 28} /></Box>
  );
}

const UseCount = ({ n }: { n: number }) => (n > 0 ? <StatusPill tone="info" dot={false}>{n} ページで使用</StatusPill> : null);

function RowActions({ a, onEdit, onDelete }: { a: Asset; onEdit: () => void; onDelete: () => void }) {
  return (
    <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
      <IconButton onClick={onEdit} aria-label={`「${a.name}」の名前・ページを変更`}><Pencil size={16} /></IconButton>
      <IconButton onClick={onDelete} aria-label={`「${a.name}」を削除`} sx={{ '&:hover': { color: tokens.color.danger } }}><Trash2 size={16} /></IconButton>
    </Stack>
  );
}

function AssetCard({ a, dev, uses, onEdit, onDelete }: { a: Asset; dev: boolean; uses: number; onEdit: () => void; onDelete: () => void }) {
  return (
    <Box sx={{ borderRadius: '14px', overflow: 'hidden', border: `1px solid ${tokens.color.border}`, bgcolor: tokens.color.surface, minWidth: 0 }}>
      <Thumb a={a} />
      <Box sx={{ p: 1.25 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap title={a.name}>{a.name}</Typography>
        <Typography variant="caption" component="p" noWrap>{assetTypeLabel(a)}・{formatBytes(a.size)}</Typography>
        {assetType(a) === 'video' && <Typography variant="caption" component="p" sx={{ color: tokens.color.muted }}>{VIDEO_NOTE}</Typography>}
        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 0.5, minHeight: 32 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}><UseCount n={uses} /></Box>
          {dev && <RowActions a={a} onEdit={onEdit} onDelete={onDelete} />}
        </Stack>
      </Box>
    </Box>
  );
}

function EditDialog({ a, folders, pages, onClose, onSave }: {
  a: Asset; folders: string[]; pages: AssetPageOption[]; onClose: () => void; onSave: (name: string, folder: string, page: string) => void;
}) {
  const fullScreen = useFullScreenDialog();
  const [name, setName] = useState(a.name);
  const [folder, setFolder] = useState(a.folder);
  const [page, setPage] = useState(a.page ?? '');
  const err = validateAssetName(name, folder, page);
  // カテゴリーは作ってあるものから選ぶ（2026-11-17 会議。以前は自由入力で、打ち間違いで別のフォルダができた）
  const options = folders.includes(a.folder) || !a.folder ? folders : [...folders, a.folder];
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth fullScreen={fullScreen} aria-labelledby="asset-edit-title">
      <DialogTitle id="asset-edit-title">名前・ページの変更</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label="名前" value={name} onChange={(e) => setName(e.target.value)} required error={!!err && !!validateAssetName(name, '')} helperText={`${name.length} / ${ASSET_LIMITS.name}`} />
          {/* どのページの素材か（2026-11-18 ユーザー指示「素材ドライブは、ページ別で画像、PDF、テキスト、動画で分ける」） */}
          <TextField select label="ページ（移動先）" value={page} onChange={(e) => setPage(e.target.value)} helperText="サイトマップのページから選びます">
            <MenuItem value="">ページ未設定</MenuItem>
            {pages.map((p) => <MenuItem key={p.path} value={p.path}>{p.label}{p.inSitemap ? `（${p.path}）` : '（サイトマップにないページ）'}</MenuItem>)}
          </TextField>
          {options.length > 0 && (
            <TextField select label="カテゴリー（任意）" value={folder} onChange={(e) => setFolder(e.target.value)} helperText="以前の分け方です。ページの中の補足として残せます">
              <MenuItem value="">カテゴリーなし</MenuItem>
              {options.map((f) => <MenuItem key={f} value={f}>{f}</MenuItem>)}
            </TextField>
          )}
          {err && <Typography variant="caption" color="error" role="alert">{err}</Typography>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
        <Button onClick={onClose}>キャンセル</Button>
        <Button variant="contained" disabled={!!err} onClick={() => onSave(name, folder, page)}>保存</Button>
      </DialogActions>
    </Dialog>
  );
}

function DeleteDialog({ a, onClose, onDelete }: { a: Asset; onClose: () => void; onDelete: () => void }) {
  const { state } = useDemo();
  const uses = assetUsage(a, state.pages);
  const block = assetDeleteBlock(a, state.pages);
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth aria-labelledby="asset-del-title">
      <DialogTitle id="asset-del-title">{block ? '削除できません' : `「${a.name}」を削除しますか？`}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: uses.length ? 1.5 : 0 }}>
          {block ?? (uses.length ? '下書きのページで使っています。削除しても、ページに入れた画像はそのまま残ります（素材ドライブから選べなくなります）。' : '素材ドライブから削除します。元に戻せません。')}
        </Typography>
        {uses.length > 0 && (
          <Stack component="ul" spacing={0.75} sx={{ listStyle: 'none', p: 0, m: 0 }} aria-label="使っているページ">
            {uses.map((u) => (
              <Stack component="li" key={u.page.id} direction="row" spacing={1} alignItems="center">
                <StatusPill tone={STATUS_META[u.page.status].tone}>{STATUS_META[u.page.status].label}</StatusPill>
                <Typography variant="body2" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>{u.page.title}{u.live ? '（公開中の内容で使用）' : ''}</Typography>
              </Stack>
            ))}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
        <Button onClick={onClose}>{block ? '閉じる' : 'キャンセル'}</Button>
        {!block && <Button variant="contained" color="error" onClick={onDelete}>削除する</Button>}
      </DialogActions>
    </Dialog>
  );
}
