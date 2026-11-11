import { Box, LinearProgress, Stack, Typography } from '@mui/material';
import { ArrowRight, CalendarDays } from 'lucide-react';
import type { Project } from '@/types';
import { STAGES } from '@/data/projects';
import { StageTrack, StatusPill, Surface } from '@/components/ui';
import { formatDate } from '@/services/time';
import { tokens } from '@/theme/tokens';
import { stageLabel } from '@/features/projects/projectHelpers';

/**
 * 開発者画面: 担当している案件のカード（進捗・いまの段階・次の作業・公開予定日）。
 * カード全体を押すと、その案件の作業画面（管理者画面）を開く。見た目は管理者ホームの「進行中のプロジェクト」に合わせる
 */
export function DevProjectCard({ p, next, onOpen }: { p: Project; next: string; onOpen: () => void }) {
  const stage = STAGES.find((s) => s.id === p.stage);
  return (
    <Surface
      interactive
      role="button"
      tabIndex={0}
      data-testid="dev-project-card"
      aria-label={`${p.siteName}（${stageLabel(p.stage)}・進捗 ${p.progress}%）の作業を開く。次の作業: ${next}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      sx={{ height: '100%', display: 'flex', flexDirection: 'column', '&:focus-visible': { outline: 'none', boxShadow: tokens.shadow.focus } }}
    >
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
        <Box sx={{ width: 40, height: 40, borderRadius: '12px', bgcolor: p.accent, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 15, flexShrink: 0 }} aria-hidden>
          {p.siteName.slice(0, 1)}
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="h5" component="h3" noWrap>{p.siteName}</Typography>
          <Typography variant="caption" noWrap sx={{ display: 'block' }}>{p.clientName}</Typography>
        </Box>
      </Stack>
      <StageTrack stage={p.stage} compact />
      <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} sx={{ mt: 2, mb: 0.75 }}>
        <StatusPill tone={p.stage === 'improvement' ? 'success' : p.stage === 'hearing' || p.stage === 'requirements' ? 'accent' : 'primary'}>
          {stage?.no}. {stageLabel(p.stage)}
        </StatusPill>
        <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{p.progress}%</Typography>
      </Stack>
      <LinearProgress variant="determinate" value={p.progress} aria-label={`${p.siteName}の進捗`} sx={{ '& .MuiLinearProgress-bar': { bgcolor: p.accent } }} />

      <Box sx={{ mt: 2, p: 1.25, borderRadius: 2.5, bgcolor: tokens.color.surfaceMuted, border: `1px solid ${tokens.color.border}` }}>
        <Typography variant="overline" sx={{ display: 'block', lineHeight: 1.4 }}>次の作業</Typography>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>{next}</Typography>
      </Box>

      <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 'auto', pt: 2, flexWrap: 'wrap', rowGap: 0.75 }}>
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: tokens.color.muted, flex: 1, minWidth: 0 }}>
          <CalendarDays size={14} style={{ flexShrink: 0 }} aria-hidden />
          <Typography variant="caption" noWrap>公開予定 {p.launchDate ? formatDate(p.launchDate) : '未定'}</Typography>
        </Stack>
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: tokens.color.primary, flexShrink: 0 }} aria-hidden>
          <Typography variant="body2" sx={{ fontWeight: 650, color: 'inherit' }}>作業を開く</Typography>
          <ArrowRight size={15} />
        </Stack>
      </Stack>
    </Surface>
  );
}
