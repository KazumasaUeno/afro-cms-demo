import { Box, ButtonBase, Stack, Typography } from '@mui/material';
import { Check } from 'lucide-react';
import type { Stage } from '@/types';
import { STAGES, stageIndex } from '@/data/projects';
import { tokens } from '@/theme/tokens';

/** 5段階（要件定義→制作→品質管理→運用→改善）の横並び表示 */
export function StageTrack({ stage, compact, onSelect }: { stage: Stage; compact?: boolean; onSelect?: (s: Stage) => void }) {
  const cur = stageIndex(stage);
  return (
    <Stack direction="row" sx={{ width: '100%' }} component="ol" aria-label="プロジェクトの進行段階" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {STAGES.map((s, i) => {
        const done = i < cur;
        const active = i === cur;
        const color = done ? tokens.color.success : active ? tokens.color.primary : tokens.color.borderStrong;
        const dot = (
          <Box
            sx={{
              width: compact ? 18 : 26, height: compact ? 18 : 26, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center',
              bgcolor: done ? color : active ? tokens.color.primarySoft : tokens.color.surface,
              border: `2px solid ${color}`, color: done ? '#fff' : color, fontSize: compact ? 9 : 11, fontWeight: 700,
              boxShadow: active ? `0 0 0 4px ${tokens.color.primarySoft}` : 'none',
            }}
          >
            {done ? <Check size={compact ? 10 : 14} strokeWidth={3} /> : s.no}
          </Box>
        );
        return (
          <Box key={s.id} component="li" aria-current={active ? 'step' : undefined} sx={{ flex: i < STAGES.length - 1 ? 1 : '0 0 auto', minWidth: 0 }}>
            <Stack direction="row" alignItems="center">
              {onSelect ? (
                <ButtonBase onClick={() => onSelect(s.id)} aria-label={`${s.label}を開く`} sx={{ borderRadius: '50%' }}>{dot}</ButtonBase>
              ) : dot}
              {i < STAGES.length - 1 && <Box sx={{ flex: 1, height: 2, mx: 0.5, borderRadius: 1, bgcolor: done ? tokens.color.success : tokens.color.border }} />}
            </Stack>
            {!compact && (
              <Typography
                variant="caption"
                sx={{ display: { xs: active ? 'block' : 'none', sm: 'block' }, mt: 0.75, fontWeight: active ? 700 : 500, color: active ? tokens.color.ink : tokens.color.muted, whiteSpace: 'nowrap' }}
              >
                {s.label}
              </Typography>
            )}
          </Box>
        );
      })}
    </Stack>
  );
}
