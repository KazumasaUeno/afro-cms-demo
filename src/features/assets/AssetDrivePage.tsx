import {
  Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputAdornment, Stack, TextField,
  ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { FileText, FolderOpen, LayoutGrid, List, Pencil, Search, Trash2, Upload } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { Asset } from '@/types';
import { PageHeader, StatusPill, Surface } from '@/components/ui';
import { areaOf } from '@/components/layout/nav';
import { currentProject, useDemo } from '@/store/DemoStore';
import { isSiteLive } from '@/data/projectContent';
import { SiteNotLive } from '@/features/projects/SiteNotLive';
import { useDevUser } from '@/features/dev/useDevUser';
import { useToast } from '@/hooks/useToast';
import { useFullScreenDialog } from '@/hooks/useMediaQueries';
import { formatDateTime } from '@/services/time';
import { tokens } from '@/theme/tokens';
import { STATUS_META } from '@/features/cms/cmsUtils';
import {
  ASSET_ACCEPT, ASSET_LIMITS, assetDeleteBlock, assetsOf, assetSrc, assetTypeLabel, assetUsage, checkUpload, formatBytes, overStorageBudget,
  uploadCount, validateAssetName,
} from '@/data/assets';
import { makeThumbnail } from './thumbnail';

const ALL = '__all__';

/**
 * 素材ドライブ（0.36.0。案件ごと）。開発者画面（/dev/assets）はアップロード・名前とフォルダの変更・削除、管理者画面（/assets）は見るだけ。
 * お客様ポータルには画面を出さず、ページ編集の画像選択で使う（2026-11-13 lead 決定: 運用の作業は開発者）
 */
export default function AssetDrivePage() {
  const { state } = useDemo();
  const project = currentProject(state);
  const dev = areaOf(useLocation().pathname) === 'dev';
  if (!isSiteLive(project.stage)) {
    return (
      <>
        <PageHeader eyebrow={dev ? '⑤ 運用' : 'プロジェクト'} icon={<FolderOpen size={15} />} title="素材ドライブ" description="ページ・お知らせで使う画像と資料を管理します。" />
        <SiteNotLive icon={<FolderOpen size={26} />} feature="素材ドライブ" />
      </>
    );
  }
  return <AssetDrive key={project.id} dev={dev} />;
}

function AssetDrive({ dev }: { dev: boolean }) {
  const { state, dispatch } = useDemo();
  const me = useDevUser();
  const toast = useToast();
  const items = assetsOf(state).items;
  const [query, setQuery] = useState('');
  const [folder, setFolder] = useState(ALL);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<Asset | null>(null);
  const [del, setDel] = useState<Asset | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const folders = useMemo(() => Array.from(new Set(items.map((a) => a.folder))).sort((a, b) => a.localeCompare(b, 'ja')), [items]);
  const q = query.trim().toLowerCase();
  const shown = items.filter((a) => (folder === ALL || a.folder === folder) && (!q || a.name.toLowerCase().includes(q)));
  const used = uploadCount(items);

  const upload = async (file: File) => {
    const check = checkUpload(file, items);
    if ('error' in check) return toast(check.error, 'error');
    const name = file.name.replace(/\.[^.]+$/, '').slice(0, ASSET_LIMITS.name) || '無題';
    const into = folder === ALL || folder === '見本' ? '' : folder;
    let src: string | undefined;
    if (check.kind === 'image') {
      setBusy(true);
      src = (await makeThumbnail(file)) ?? undefined;
      setBusy(false);
      if (!src) return toast('この画像は読み込めませんでした（壊れているか、対応していない形式です）', 'error');
    }
    // 保存データの上限（localStorage）を超えるなら保存しない。黙って保存に失敗しないよう、ここで理由を出す
    if (overStorageBudget(state, (src?.length ?? 0) + 300)) {
      return toast('保存できる容量の上限に達しました。使っていない素材を削除してからアップロードしてください', 'error');
    }
    dispatch({ type: 'addAsset', asset: { name, kind: check.kind, folder: into, mime: file.type, size: file.size, ...(src ? { src } : {}) }, devBy: me.id });
    toast(check.kind === 'image' ? `「${name}」をアップロードしました（縮小して保存）` : `「${name}」を登録しました（デモのため中身は保存しません）`);
  };

  return (
    <>
      <PageHeader
        eyebrow={dev ? '⑤ 運用' : 'プロジェクト'}
        icon={<FolderOpen size={15} />}
        title="素材ドライブ"
        description={dev
          ? 'ページ・お知らせで使う画像と資料を管理します。画像はブラウザの中で縮小して保存します（元の画像は保存しません）。お客様はページ編集の画像選択から使えます。'
          : 'ページ・お知らせで使う画像と資料の一覧です（管理者画面は見るだけ。追加・削除は開発者画面で行います）。'}
        actions={dev ? (
          <>
            <input ref={fileRef} type="file" accept={ASSET_ACCEPT} hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(f); }} />
            <Button variant="contained" startIcon={busy ? <CircularProgress size={15} color="inherit" /> : <Upload size={16} />} disabled={busy} onClick={() => fileRef.current?.click()}>
              アップロード
            </Button>
          </>
        ) : undefined}
      />

      <Surface>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }} sx={{ mb: 2 }}>
          <TextField
            size="small" placeholder="名前で検索" value={query} onChange={(e) => setQuery(e.target.value)} inputProps={{ 'aria-label': '素材を名前で検索' }}
            InputProps={{ startAdornment: <InputAdornment position="start"><Search size={16} /></InputAdornment> }} sx={{ flex: { md: '0 0 260px' } }}
          />
          <Stack direction="row" spacing={1} sx={{ flex: 1, minWidth: 0, flexWrap: 'wrap', rowGap: 1 }} role="group" aria-label="フォルダ">
            {[ALL, ...folders].map((f) => (
              <Chip key={f} label={f === ALL ? 'すべて' : f || 'フォルダなし'} onClick={() => setFolder(f)} color={folder === f ? 'primary' : 'default'} variant={folder === f ? 'filled' : 'outlined'} aria-pressed={folder === f} />
            ))}
          </Stack>
          <ToggleButtonGroup exclusive size="small" value={view} onChange={(_, v: 'grid' | 'list' | null) => v && setView(v)} aria-label="表示方法">
            <ToggleButton value="grid" aria-label="グリッド表示"><LayoutGrid size={16} /></ToggleButton>
            <ToggleButton value="list" aria-label="一覧表示"><List size={16} /></ToggleButton>
          </ToggleButtonGroup>
        </Stack>
        <Typography variant="caption" component="p" sx={{ mb: 1.5 }}>
          {shown.length} 件を表示（全 {items.length} 件・アップロード {used} / {ASSET_LIMITS.uploads} 件）
        </Typography>

        {shown.length === 0 ? (
          <Box sx={{ py: 5, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">{items.length === 0 ? '素材がありません。' : '条件に合う素材がありません。'}</Typography>
          </Box>
        ) : view === 'grid' ? (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0,1fr))', sm: 'repeat(3, minmax(0,1fr))', lg: 'repeat(4, minmax(0,1fr))' }, gap: 1.5 }}>
            {shown.map((a) => <AssetCard key={a.id} a={a} dev={dev} uses={assetUsage(a, state.pages).length} onEdit={() => setEdit(a)} onDelete={() => setDel(a)} />)}
          </Box>
        ) : (
          <Stack component="ul" spacing={1} sx={{ listStyle: 'none', p: 0, m: 0 }}>
            {shown.map((a) => (
              <Box component="li" key={a.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1, borderRadius: '12px', border: `1px solid ${tokens.color.border}` }}>
                <Thumb a={a} size={48} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{a.name}</Typography>
                  <Typography variant="caption" noWrap component="p">{assetTypeLabel(a)}・{formatBytes(a.size)}・{a.folder || 'フォルダなし'}・{formatDateTime(a.createdAt)}・{a.createdBy}</Typography>
                </Box>
                <UseCount n={assetUsage(a, state.pages).length} />
                {dev && <RowActions a={a} onEdit={() => setEdit(a)} onDelete={() => setDel(a)} />}
              </Box>
            ))}
          </Stack>
        )}
      </Surface>

      {dev && edit && <EditDialog a={edit} folders={folders} onClose={() => setEdit(null)} onSave={(name, f) => { dispatch({ type: 'renameAsset', id: edit.id, name, folder: f, devBy: me.id }); setEdit(null); toast('素材を更新しました'); }} />}
      {dev && del && <DeleteDialog a={del} onClose={() => setDel(null)} onDelete={() => { dispatch({ type: 'deleteAsset', id: del.id, devBy: me.id }); toast(`「${del.name}」を削除しました`, 'info'); setDel(null); }} />}
    </>
  );
}

function Thumb({ a, size }: { a: Asset; size?: number }) {
  const src = assetSrc(a);
  const sx = size ? { width: size, height: size, flexShrink: 0, borderRadius: '10px' } : { width: '100%', aspectRatio: '16/10' };
  return src ? (
    <Box component="img" src={src} alt="" loading="lazy" sx={{ ...sx, display: 'block', objectFit: 'cover', bgcolor: tokens.color.surfaceMuted }} />
  ) : (
    <Box sx={{ ...sx, display: 'grid', placeItems: 'center', bgcolor: tokens.color.surfaceMuted, color: tokens.color.muted }}><FileText size={size ? 20 : 28} aria-hidden /></Box>
  );
}

const UseCount = ({ n }: { n: number }) => (n > 0 ? <StatusPill tone="info" dot={false}>{n} ページで使用</StatusPill> : null);

function RowActions({ a, onEdit, onDelete }: { a: Asset; onEdit: () => void; onDelete: () => void }) {
  return (
    <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
      <IconButton onClick={onEdit} aria-label={`「${a.name}」の名前・フォルダを変更`}><Pencil size={16} /></IconButton>
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
        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 0.5, minHeight: 32 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}><UseCount n={uses} /></Box>
          {dev && <RowActions a={a} onEdit={onEdit} onDelete={onDelete} />}
        </Stack>
      </Box>
    </Box>
  );
}

function EditDialog({ a, folders, onClose, onSave }: { a: Asset; folders: string[]; onClose: () => void; onSave: (name: string, folder: string) => void }) {
  const fullScreen = useFullScreenDialog();
  const [name, setName] = useState(a.name);
  const [folder, setFolder] = useState(a.folder);
  const err = validateAssetName(name, folder);
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth fullScreen={fullScreen} aria-labelledby="asset-edit-title">
      <DialogTitle id="asset-edit-title">名前・フォルダの変更</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label="名前" value={name} onChange={(e) => setName(e.target.value)} required error={!!err && !!validateAssetName(name, '')} helperText={`${name.length} / ${ASSET_LIMITS.name}`} />
          <TextField
            label="フォルダ（空欄 = フォルダなし）" value={folder} onChange={(e) => setFolder(e.target.value)} error={folder.length > ASSET_LIMITS.folder}
            helperText={folders.filter(Boolean).length ? `既存: ${folders.filter(Boolean).join('・')}` : `${ASSET_LIMITS.folder}文字以内`}
          />
          {err && <Typography variant="caption" color="error" role="alert">{err}</Typography>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
        <Button onClick={onClose}>キャンセル</Button>
        <Button variant="contained" disabled={!!err} onClick={() => onSave(name, folder)}>保存</Button>
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
