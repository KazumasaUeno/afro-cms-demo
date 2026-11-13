import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Stack, Typography } from '@mui/material';
import { GitCompare, History, RotateCcw, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Asset, CmsPage, PageSnapshot, PageVersion, PageVersionKind } from '@/types';
import { tokens } from '@/theme/tokens';
import { useFullScreenDialog } from '@/hooks/useMediaQueries';
import { formatDateTime } from '@/services/time';
import { StatusPill, type PillTone } from '@/components/ui';
import { HISTORY_MAX_ENTRIES, resolveSnapshot, snapAt, VERSION_LABEL } from '@/data/pageHistory';
import { CompareDialog } from './CompareDialog';

const TONE: Record<PageVersionKind, PillTone> = {
  create: 'neutral', save: 'neutral', restore: 'accent', review: 'warning', schedule: 'info', publish: 'success', unpublish: 'danger',
};

interface Row { id: string; at?: string; by?: string; kind?: PageVersionKind; label: string; snap: PageSnapshot | undefined; changed: boolean }

interface Props {
  open: boolean;
  /** エディタで開いているページ（未保存の変更を含む） */
  page: CmsPage;
  dirty: boolean;
  versions: PageVersion[];
  assets: Asset[];
  onClose: () => void;
  /** 版の内容をエディタに読み込む（保存はエディタの「下書き保存」で行う） */
  onRestore: (snap: PageSnapshot, versionId: string) => void;
}

/**
 * ページの履歴（0.35.0）。誰が・いつ・何をしたか（保存・承認依頼・公開など）と、その時点の内容。
 * 「比較」は その版 と 編集中の内容 を並べる（CompareDialog）。「この版に戻す」はエディタに読み込むだけで、状態・公開中の内容は変えない
 */
export function PageHistoryDialog({ open, page, dirty, versions, assets, onClose, onRestore }: Props) {
  const fullScreen = useFullScreenDialog();
  const [compare, setCompare] = useState<Row | null>(null);
  const [confirm, setConfirm] = useState<Row | null>(null);

  const rows = useMemo<Row[]>(() => {
    const list: Row[] = versions.map((v, i) => {
      const s = snapAt(versions, i);
      return { id: v.id, at: v.at, by: v.by, kind: v.kind, label: VERSION_LABEL[v.kind], snap: s ? resolveSnapshot(s, assets) : undefined, changed: !!v.snap };
    });
    // 履歴を記録する前（0.34 まで）に公開したページは、いまの公開中の内容を 1 件として出す（保存はしない）
    if (versions.length === 0 && page.publishedContent) {
      list.push({
        id: 'published', at: page.publishedAt, label: '現在の公開版', changed: true,
        snap: { title: page.title, content: page.publishedContent, seoTitle: page.seoTitle, seoDescription: page.seoDescription, ...(page.coverImage ? { coverImage: page.coverImage } : {}) },
      });
    }
    return list;
  }, [versions, assets, page]);

  const restore = (r: Row) => {
    if (!r.snap) return;
    setConfirm(null);
    onRestore(r.snap, r.id);
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} fullScreen={fullScreen} maxWidth="sm" fullWidth aria-labelledby="history-title">
        <DialogTitle id="history-title" sx={{ pr: 6 }}>
          <Stack direction="row" spacing={1} alignItems="center"><History size={18} aria-hidden /><span>ページの履歴</span></Stack>
          <Typography variant="caption" component="p" sx={{ mt: 0.5 }}>
            「{page.title}」の保存・承認依頼・公開の記録です（新しい順・最新 {HISTORY_MAX_ENTRIES} 件まで）。戻すとエディタに読み込みます。公開の状態は変わりません。
          </Typography>
          <IconButton onClick={onClose} aria-label="閉じる" sx={{ position: 'absolute', right: 12, top: 12 }}><X size={18} /></IconButton>
        </DialogTitle>
        <DialogContent>
          {rows.length === 0 ? (
            <Box sx={{ py: 4, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">まだ履歴がありません。下書き保存・承認依頼・公開をすると記録されます。</Typography>
            </Box>
          ) : (
            <Stack component="ol" spacing={1} sx={{ listStyle: 'none', p: 0, m: 0 }}>
              {rows.map((r) => (
                <Box
                  component="li"
                  key={r.id}
                  sx={{ p: 1.5, borderRadius: '12px', border: `1px solid ${tokens.color.border}`, bgcolor: tokens.color.surface, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}
                >
                  <Box sx={{ flex: '1 1 220px', minWidth: 0 }}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
                      <StatusPill tone={r.kind ? TONE[r.kind] : 'success'}>{r.label}</StatusPill>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatDateTime(r.at)}</Typography>
                    </Stack>
                    <Typography variant="caption" component="p" sx={{ mt: 0.5, overflowWrap: 'anywhere' }}>
                      {r.by ? `${r.by}・` : ''}{r.snap ? `「${r.snap.title}」` : '内容の記録なし'}{r.changed ? '' : '（内容の変更なし）'}
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1}>
                    <Button size="small" variant="outlined" startIcon={<GitCompare size={15} />} disabled={!r.snap} onClick={() => setCompare(r)}>比較</Button>
                    <Button size="small" variant="outlined" startIcon={<RotateCcw size={15} />} disabled={!r.snap} onClick={() => (dirty ? setConfirm(r) : restore(r))}>この版に戻す</Button>
                  </Stack>
                </Box>
              ))}
            </Stack>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirm} onClose={() => setConfirm(null)} maxWidth="xs" fullWidth aria-labelledby="restore-confirm-title">
        <DialogTitle id="restore-confirm-title">保存していない変更があります</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">この版を読み込むと、編集中の変更は置き換わります（保存するまでページには反映されません）。</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
          <Button onClick={() => setConfirm(null)}>やめる</Button>
          <Button variant="contained" onClick={() => confirm && restore(confirm)}>読み込む</Button>
        </DialogActions>
      </Dialog>

      {compare && (
        <CompareDialog
          page={page}
          open={!!compare}
          onClose={() => setCompare(null)}
          before={{ html: compare.snap?.content, label: compare.label, sub: `${formatDateTime(compare.at)}${compare.by ? `・${compare.by}` : ''}` }}
          after={{ html: page.content, label: '編集中', sub: dirty ? '編集中の内容（未保存）' : '現在の内容' }}
        />
      )}
    </>
  );
}
