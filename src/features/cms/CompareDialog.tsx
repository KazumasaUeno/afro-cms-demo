import { Box, Dialog, DialogContent, IconButton, Stack, Tab, Tabs, Typography } from '@mui/material';
import { Minus, Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { CmsPage } from '@/types';
import { tokens } from '@/theme/tokens';
import { useFullScreenDialog } from '@/hooks/useMediaQueries';
import { formatDateTime } from '@/services/time';
import { StatusPill } from '@/components/ui';
import { diffBlocks } from './cmsUtils';
import { sanitizeHtml } from './sanitize';
import { proseSx } from './SitePreview';

function Pane({ label, sub, html, tone, empty = 'まだ公開されていません（新規ページ）' }: { label: string; sub: string; html: string; tone: 'before' | 'after'; empty?: string }) {
  return (
    <Box sx={{ minWidth: 0, borderRadius: '16px', border: `1px solid ${tokens.color.border}`, bgcolor: tokens.color.surface, overflow: 'hidden' }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 2, py: 1.25, borderBottom: `1px solid ${tokens.color.border}`, bgcolor: tokens.color.surfaceMuted }}>
        <StatusPill tone={tone === 'before' ? 'neutral' : 'primary'}>{label}</StatusPill>
        <Typography variant="caption" noWrap>{sub}</Typography>
      </Stack>
      <Box sx={{ p: { xs: 2, md: 3 }, ...proseSx, fontSize: 15, color: tokens.color.ink }}>
        {html ? <div dangerouslySetInnerHTML={{ __html: html }} /> : <Typography variant="body2" color="text.secondary">{empty}</Typography>}
      </Box>
    </Box>
  );
}

/** 比較する片側（ページの履歴から開くとき。0.35.0）。無ければ従来どおり 公開中の内容 / 編集中の内容 */
export interface CompareSide { html: string | undefined; label: string; sub: string }

export function CompareDialog({ page, open, onClose, before: beforeSide, after: afterSide }: { page: CmsPage; open: boolean; onClose: () => void; before?: CompareSide; after?: CompareSide }) {
  const fullScreen = useFullScreenDialog();
  const [tab, setTab] = useState<'side' | 'diff'>('side');
  const beforeRaw = beforeSide ? beforeSide.html : page.publishedContent;
  const afterRaw = afterSide ? afterSide.html : page.content;
  const before = useMemo(() => sanitizeHtml(beforeRaw), [beforeRaw]);
  const after = useMemo(() => sanitizeHtml(afterRaw), [afterRaw]);
  const diff = useMemo(() => (open ? diffBlocks(beforeRaw, afterRaw) : []), [open, beforeRaw, afterRaw]);
  const added = diff.filter((d) => d.kind === 'added').length;
  const removed = diff.filter((d) => d.kind === 'removed').length;

  return (
    <Dialog open={open} onClose={onClose} fullScreen={fullScreen} maxWidth="lg" fullWidth aria-labelledby="compare-title">
      <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 3, pt: 2.5, pb: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography id="compare-title" variant="h3">変更前後の比較</Typography>
          <Typography variant="caption">{page.title} ・ 段落単位で比較しています</Typography>
        </Box>
        <IconButton onClick={onClose} aria-label="閉じる"><X size={20} /></IconButton>
      </Stack>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 3, flexWrap: 'wrap', gap: 1 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} aria-label="比較の表示方法">
          <Tab value="side" label="並べて比較" />
          <Tab value="diff" label="差分のみ" />
        </Tabs>
        <Stack direction="row" spacing={1}>
          <StatusPill tone="success" dot={false} icon={<Plus size={12} />}>追加 {added}</StatusPill>
          <StatusPill tone="danger" dot={false} icon={<Minus size={12} />}>削除 {removed}</StatusPill>
        </Stack>
      </Stack>
      <DialogContent sx={{ bgcolor: tokens.color.bgSubtle, mt: 1, p: { xs: 2, md: 3 } }}>
        {tab === 'side' ? (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
            <Pane label={beforeSide?.label ?? 'Before'} sub={beforeSide?.sub ?? (page.publishedAt ? `公開中の内容（${formatDateTime(page.publishedAt)}）` : '公開履歴なし')} html={before} tone="before" {...(beforeSide ? { empty: '本文がありません' } : {})} />
            <Pane label={afterSide?.label ?? 'After'} sub={afterSide?.sub ?? '編集中の内容'} html={after} tone="after" {...(afterSide ? { empty: '本文がありません' } : {})} />
          </Box>
        ) : (
          <Stack spacing={1} sx={{ maxWidth: 760, mx: 'auto' }}>
            {diff.length === 0 && <Typography variant="body2" color="text.secondary">比較できる内容がありません。</Typography>}
            {diff.map((d, i) => (
              <Box
                key={i}
                sx={{
                  position: 'relative', p: 2, pl: 5, borderRadius: '12px', ...proseSx, fontSize: 15, color: tokens.color.ink,
                  bgcolor: d.kind === 'added' ? tokens.color.successSoft : d.kind === 'removed' ? tokens.color.dangerSoft : tokens.color.surface,
                  border: `1px solid ${d.kind === 'added' ? tokens.color.successLine : d.kind === 'removed' ? tokens.color.dangerLine : tokens.color.border}`,
                  opacity: d.kind === 'same' ? 0.7 : 1,
                  '& > div > *:first-of-type': { mt: 0 },
                  ...(d.kind === 'removed' && { '& > div': { textDecoration: 'line-through', textDecorationColor: `color-mix(in srgb, ${tokens.color.danger} 50%, transparent)` } }),
                }}
              >
                <Box sx={{ position: 'absolute', left: 14, top: 18, color: d.kind === 'added' ? tokens.color.successInk : d.kind === 'removed' ? tokens.color.dangerInk : tokens.color.faint }} aria-label={d.kind === 'added' ? '追加' : d.kind === 'removed' ? '削除' : '変更なし'}>
                  {d.kind === 'added' ? <Plus size={16} /> : d.kind === 'removed' ? <Minus size={16} /> : <Box sx={{ width: 16, textAlign: 'center' }}>·</Box>}
                </Box>
                <div dangerouslySetInnerHTML={{ __html: d.html }} />
              </Box>
            ))}
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
}
