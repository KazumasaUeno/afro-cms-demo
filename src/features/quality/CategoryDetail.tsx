import { Box, Button, Dialog, Drawer, FormControlLabel, IconButton, LinearProgress, Stack, Switch, Tooltip, Typography } from '@mui/material';
import { CheckCheck, X } from 'lucide-react';
import { useState } from 'react';
import type { QualityCategory } from '@/types';
import { QUALITY_ITEMS } from '@/data/quality';
import { useDemo } from '@/store/DemoStore';
import { useBreakpoints } from '@/hooks/useMediaQueries';
import { useToast } from '@/hooks/useToast';
import { tokens } from '@/theme/tokens';
import { CheckToggle } from './CheckToggle';
import { computeStats, isComplete } from './qualityStats';

export function PriorityChip({ priority }: { priority: 'A' | 'B' }) {
  const isA = priority === 'A';
  return (
    <Tooltip title={isA ? 'A区分：数値・設定など機械的に確認できる項目' : 'B区分：目視や判断が必要な項目'}>
      <Box
        component="span"
        tabIndex={0}
        aria-label={isA ? 'A区分（機械的に確認）' : 'B区分（判断が必要）'}
        sx={{
          width: 24, height: 24, borderRadius: '7px', display: 'inline-grid', placeItems: 'center', flexShrink: 0,
          fontSize: 11.5, fontWeight: 750,
          bgcolor: isA ? tokens.color.infoSoft : tokens.color.accentSoft, color: isA ? '#0B6699' : '#5B3FD6',
        }}
      >
        {priority}
      </Box>
    </Tooltip>
  );
}

function SideBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
        <Typography variant="caption" sx={{ fontWeight: 600 }}>{label}</Typography>
        <Typography variant="caption" sx={{ fontWeight: 700, color: tokens.color.ink, fontVariantNumeric: 'tabular-nums' }}>{Math.round(value)}%</Typography>
      </Stack>
      <LinearProgress variant="determinate" value={value} sx={{ '& .MuiLinearProgress-bar': { bgcolor: color } }} aria-label={`${label} ${Math.round(value)}%`} />
    </Box>
  );
}

interface Props {
  category: QualityCategory | null;
  onClose: () => void;
}

export function CategoryDetail({ category, onClose }: Props) {
  const { isMobile } = useBreakpoints();
  const open = !!category;
  const body = category ? <DetailBody category={category} onClose={onClose} /> : null;
  if (isMobile) {
    return (
      <Dialog open={open} onClose={onClose} fullScreen aria-labelledby="qc-detail-title" PaperProps={{ sx: { borderRadius: 0, border: 'none' } }}>
        {body}
      </Dialog>
    );
  }
  return (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: 560, maxWidth: '100vw', bgcolor: tokens.color.bg, borderLeft: `1px solid ${tokens.color.border}` } }}>
      {body}
    </Drawer>
  );
}

function DetailBody({ category, onClose }: { category: QualityCategory; onClose: () => void }) {
  const { state, dispatch } = useDemo();
  const toast = useToast();
  const [openOnly, setOpenOnly] = useState(false);
  const items = QUALITY_ITEMS.filter((i) => i.categoryId === category.id);
  const stats = computeStats(items, state.qualityChecks);
  const shown = openOnly ? items.filter((i) => !isComplete(state.qualityChecks[i.id])) : items;

  const bulk = (side: 'afro' | 'client', priority: 'A' | 'B') => {
    const targets = items.filter((i) => i.priority === priority && !(side === 'afro' ? state.qualityChecks[i.id]?.afroAt : state.qualityChecks[i.id]?.clientAt));
    if (targets.length === 0) {
      toast(`${priority}区分はすべて${side === 'afro' ? 'アフロ確認' : '顧客承認'}済みです`, 'info');
      return;
    }
    dispatch({ type: 'bulkQuality', side, priority, categoryId: category.id });
    toast(`${priority}区分 ${targets.length}件を${side === 'afro' ? 'アフロ確認' : '顧客承認'}しました`);
  };

  return (
    <Stack sx={{ height: '100%', minHeight: 0 }}>
      <Box sx={{ p: { xs: 2, sm: 3 }, pb: 2, borderBottom: `1px solid ${tokens.color.border}`, bgcolor: tokens.color.surface }}>
        <Stack direction="row" alignItems="flex-start" spacing={1}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="overline">カテゴリ {category.no} / 12</Typography>
            <Typography id="qc-detail-title" variant="h3" component="h2">{category.title}</Typography>
            <Typography variant="caption">
              資料上 {category.questionCount}問 ・ デモ収録 {items.length}問 ・ 完了 {stats.complete}/{items.length}
            </Typography>
          </Box>
          <IconButton onClick={onClose} aria-label="閉じる"><X size={20} /></IconButton>
        </Stack>
        <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
          <SideBar label="アフロ確認" value={stats.afroRate} color={tokens.color.primary} />
          <SideBar label="顧客承認" value={stats.clientRate} color={tokens.color.success} />
        </Stack>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mt: 2 }}>
          {(['afro', 'client'] as const).map((side) => (
            <Stack key={side} direction="row" spacing={0.75} sx={{ p: 0.75, borderRadius: '12px', bgcolor: tokens.color.bgSubtle }}>
              {(['A', 'B'] as const).map((p) => (
                <Button
                  key={p} size="small" variant="outlined" fullWidth onClick={() => bulk(side, p)}
                  startIcon={<CheckCheck size={14} />}
                  sx={{ minWidth: 0, px: 1, fontSize: 12, whiteSpace: 'nowrap' }}
                  aria-label={`${side === 'afro' ? 'アフロ' : '顧客'}側で${p}区分を一括チェック`}
                >
                  {side === 'afro' ? 'アフロ' : '顧客'} {p}一括
                </Button>
              ))}
            </Stack>
          ))}
        </Box>
      </Box>

      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: { xs: 2, sm: 3 }, py: 1 }}>
        <Typography variant="subtitle2">{shown.length}件を表示</Typography>
        <FormControlLabel
          control={<Switch size="small" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />}
          label={<Typography variant="body2">未完了のみ</Typography>}
          sx={{ mr: 0 }}
        />
      </Stack>

      <Box sx={{ flex: 1, overflowY: 'auto', px: { xs: 2, sm: 3 }, pb: 3 }}>
        <Stack spacing={1}>
          {shown.length === 0 && (
            <Box sx={{ py: 6, textAlign: 'center' }}>
              <Typography variant="h5">このカテゴリはすべて完了しています</Typography>
              <Typography variant="caption">アフロ確認と顧客承認の両方が揃いました</Typography>
            </Box>
          )}
          {shown.map((item) => {
            const check = state.qualityChecks[item.id];
            const done = isComplete(check);
            return (
              <Box
                key={item.id}
                sx={{
                  p: 1.5, borderRadius: '14px', bgcolor: tokens.color.surface,
                  border: `1px solid ${done ? '#CDEDE1' : tokens.color.border}`,
                  transition: 'border-color .2s',
                }}
              >
                <Stack direction="row" spacing={1.25} alignItems="flex-start" sx={{ mb: 1.25 }}>
                  <PriorityChip priority={item.priority} />
                  <Typography variant="body2" sx={{ fontWeight: 550, pt: 0.25, flex: 1, color: tokens.color.ink }}>{item.text}</Typography>
                </Stack>
                <Stack direction="row" spacing={1}>
                  <CheckToggle side="afro" check={check} itemText={item.text} onToggle={() => dispatch({ type: 'toggleQuality', itemId: item.id, side: 'afro' })} />
                  <CheckToggle side="client" check={check} itemText={item.text} onToggle={() => dispatch({ type: 'toggleQuality', itemId: item.id, side: 'client' })} />
                </Stack>
              </Box>
            );
          })}
        </Stack>
      </Box>
    </Stack>
  );
}
