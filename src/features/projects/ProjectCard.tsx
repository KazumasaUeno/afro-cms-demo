import { Box, LinearProgress, Stack, Typography } from '@mui/material';
import { Clock, Globe } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import type { Project } from '@/types';
import { STAGES } from '@/data/projects';
import { memberById } from '@/data/members';
import { MemberAvatar, StageTrack, StatusPill, Surface } from '@/components/ui';
import { relativeTime } from '@/services/time';
import { tokens } from '@/theme/tokens';
import { stageLabel } from './projectHelpers';

/**
 * プロジェクトのカード。onOpen があればクリックで開けるカード、無ければ見るだけ（新規作成画面のプレビュー）
 */
export function ProjectCard({ p, onOpen }: { p: Project; onOpen?: () => void }) {
  const owner = memberById(p.ownerId);
  const open = onOpen
    ? {
        interactive: true,
        role: 'link',
        tabIndex: 0,
        'aria-label': `${p.siteName}（${p.clientName}）の詳細を開く`,
        onClick: onOpen,
        onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpen();
          }
        },
      }
    : {};
  return (
    <Surface
      {...open}
      padding={0}
      sx={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
    >
      {/* ブランド色の帯＋サイトのミニプレビュー */}
      <Box sx={{ position: 'relative', height: 96, background: `linear-gradient(135deg, ${p.accent} 0%, ${p.accent}B3 100%)`, overflow: 'hidden' }} aria-hidden>
        <Box sx={{ position: 'absolute', left: 20, right: 20, bottom: -18, height: 82, borderRadius: '12px 12px 0 0', bgcolor: `color-mix(in srgb, ${tokens.color.surface} 94%, transparent)`, boxShadow: tokens.shadow.md, p: 1.25 }}>
          <Stack direction="row" spacing={0.5} sx={{ mb: 1 }}>
            {[0, 1, 2].map((i) => <Box key={i} sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: tokens.color.borderStrong }} />)}
          </Stack>
          <Box sx={{ width: '46%', height: 7, borderRadius: 4, bgcolor: p.accent, opacity: 0.85, mb: 0.75 }} />
          <Box sx={{ width: '70%', height: 5, borderRadius: 4, bgcolor: tokens.color.border, mb: 0.5 }} />
          <Box sx={{ width: '58%', height: 5, borderRadius: 4, bgcolor: tokens.color.border }} />
        </Box>
        <Box sx={{ position: 'absolute', top: 12, right: 12 }}>
          <StatusPill tone="neutral">{p.industry}</StatusPill>
        </Box>
      </Box>

      <Box sx={{ p: { xs: 2, md: 2.5 }, pt: 3, display: 'flex', flexDirection: 'column', gap: 1.75, flex: 1 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="caption" noWrap sx={{ display: 'block' }}>{p.clientName}</Typography>
          <Typography variant="h4" component="h2" noWrap>{p.siteName}</Typography>
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ color: tokens.color.muted, mt: 0.25 }}>
            <Globe size={13} style={{ flexShrink: 0 }} />
            <Typography variant="caption" noWrap>{p.siteUrl.replace(/^https?:\/\//, '')}</Typography>
          </Stack>
        </Box>

        <Box>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
            <StatusPill tone={p.stage === 'improvement' ? 'success' : p.stage === 'requirements' ? 'accent' : 'primary'}>
              {STAGES.find((s) => s.id === p.stage)?.no}. {stageLabel(p.stage)}
            </StatusPill>
            <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{p.progress}%</Typography>
          </Stack>
          <LinearProgress variant="determinate" value={p.progress} aria-label="進捗率" sx={{ mb: 1.5, '& .MuiLinearProgress-bar': { bgcolor: p.accent } }} />
          <StageTrack stage={p.stage} compact />
        </Box>

        <Box sx={{ p: 1.25, borderRadius: 2.5, bgcolor: tokens.color.surfaceMuted, border: `1px solid ${tokens.color.border}` }}>
          <Typography variant="overline" sx={{ display: 'block', lineHeight: 1.4 }}>次に必要な作業</Typography>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>{p.nextAction}</Typography>
        </Box>

        <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 'auto' }}>
          <MemberAvatar id={p.ownerId} size={26} />
          <Typography variant="caption" noWrap sx={{ flex: 1, minWidth: 0 }}>{owner.name}</Typography>
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: tokens.color.muted, flexShrink: 0 }}>
            <Clock size={13} />
            <Typography variant="caption">{relativeTime(p.updatedAt)}</Typography>
          </Stack>
          {p.pendingApprovals > 0 && <StatusPill tone="warning">承認 {p.pendingApprovals}</StatusPill>}
        </Stack>
      </Box>
    </Surface>
  );
}
