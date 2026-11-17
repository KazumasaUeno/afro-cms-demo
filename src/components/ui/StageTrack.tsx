import { Box, ButtonBase, Stack, Typography } from '@mui/material';
import { Check } from 'lucide-react';
import type { Stage } from '@/types';
import { STAGES, stageIndex } from '@/data/projects';
import { tokens } from '@/theme/tokens';

/**
 * 8段階（ヒアリング→要件定義→スケジュール→制作→品質管理・納品検収→リリース→運用→改善。2026-11-17 会議）の横並び表示。
 * onSelect があれば各段階（番号と名前）を押せる。selected はいま選んでいる段階（プロジェクト詳細。2026-11-17 ユーザー指示「クリックしたところを大きく」）
 */
export function StageTrack({ stage, compact, onSelect, selected }: { stage: Stage; compact?: boolean; onSelect?: (s: Stage) => void; selected?: Stage }) {
  const cur = stageIndex(stage);
  return (
    <Stack direction="row" sx={{ width: '100%' }} component="ol" aria-label="プロジェクトの進行段階" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {STAGES.map((s, i) => {
        const done = i < cur;
        const active = i === cur;
        const color = done ? tokens.color.success : active ? tokens.color.primary : tokens.color.borderStrong;
        const isSel = !!onSelect && s.id === (selected ?? stage);
        const dot = (
          <Box
            sx={{
              width: compact ? 20 : 26, height: compact ? 20 : 26, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center',
              bgcolor: done ? color : active ? tokens.color.primarySoft : tokens.color.surface,
              border: `2px solid ${color}`, color: done ? tokens.color.onSuccess : color, fontSize: 12, fontWeight: 700,
              boxShadow: isSel ? `0 0 0 3px ${tokens.color.surface}, 0 0 0 5px ${tokens.color.ink}` : active ? `0 0 0 4px ${tokens.color.primarySoft}` : 'none',
            }}
          >
            {done ? <Check size={compact ? 10 : 14} strokeWidth={3} /> : s.no}
          </Box>
        );
        return (
          <Box key={s.id} component="li" aria-current={active ? 'step' : undefined} sx={{ flex: i < STAGES.length - 1 ? 1 : '0 0 auto', minWidth: 0 }}>
            <Stack direction="row" alignItems="center">
              {onSelect ? (
                <ButtonBase onClick={() => onSelect(s.id)} aria-label={`${s.label}を表示`} aria-pressed={isSel} sx={{ borderRadius: '50%', p: 0.5, m: -0.5 }}>{dot}</ButtonBase>
              ) : dot}
              {i < STAGES.length - 1 && <Box sx={{ flex: 1, height: 2, mx: 0.5, borderRadius: 1, bgcolor: done ? tokens.color.success : tokens.color.border }} />}
            </Stack>
            {!compact && (() => {
              const label = (
                <Typography
                  variant="caption"
                  sx={{
                    display: { xs: (onSelect ? isSel : active) ? 'block' : 'none', sm: 'block' }, mt: 0.75, whiteSpace: 'nowrap',
                    fontWeight: active || isSel ? 700 : 500, color: isSel ? tokens.color.ink : active ? tokens.color.ink : tokens.color.muted,
                    borderBottom: onSelect ? `2px solid ${isSel ? tokens.color.ink : 'transparent'}` : undefined, pb: onSelect ? 0.25 : 0,
                  }}
                >
                  {s.label}
                </Typography>
              );
              // 名前も押せる（番号の丸だけだと小さいので）。読み上げは丸のボタンで足りるので、こちらは読ませない
              return onSelect ? <ButtonBase tabIndex={-1} aria-hidden onClick={() => onSelect(s.id)} sx={{ display: 'block', textAlign: 'left', borderRadius: 1 }}>{label}</ButtonBase> : label;
            })()}
          </Box>
        );
      })}
    </Stack>
  );
}
