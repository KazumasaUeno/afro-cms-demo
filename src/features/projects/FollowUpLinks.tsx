import { Box, Button, Stack, Typography } from '@mui/material';
import { ArrowRight, GitBranch } from 'lucide-react';
import type { Project } from '@/types';
import { StatusPill, Surface } from '@/components/ui';
import { tokens } from '@/theme/tokens';
import { stageLabel } from './projectHelpers';
import { followUpsOf } from './followUp';

/**
 * プロジェクト詳細: 追加開発のつながり（0.31.0）。追加開発の案件には元の案件と採用した改善提案、
 * 元の案件にはそこから起こした追加開発の一覧を出す。どちらも無ければ何も出さない
 */
export function FollowUpLinks({ p, projects, onOpen }: { p: Project; projects: Project[]; onOpen: (id: string) => void }) {
  const parent = p.parentProjectId ? projects.find((x) => x.id === p.parentProjectId) : undefined;
  const children = followUpsOf(projects, p.id);
  if (!p.parentProjectId && children.length === 0) return null;

  const row = (x: Project) => (
    <Button
      key={x.id}
      variant="outlined"
      size="small"
      endIcon={<ArrowRight size={15} />}
      onClick={() => onOpen(x.id)}
      aria-label={`${x.siteName}（${stageLabel(x.stage)}）のプロジェクト詳細を開く`}
      sx={{ justifyContent: 'space-between', gap: 1, minHeight: 40, textAlign: 'left' }}
    >
      <Box component="span" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>{x.siteName}</Box>
      <StatusPill tone={x.stage === 'improvement' ? 'success' : 'primary'}>{stageLabel(x.stage)}</StatusPill>
    </Button>
  );

  return (
    <Surface sx={{ mb: { xs: 3, md: 4 } }}>
      <Stack spacing={2} direction={{ xs: 'column', md: 'row' }} sx={{ '& > *': { flex: 1, minWidth: 0 } }}>
        {p.parentProjectId && (
          <Box>
            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 1 }}>
              <GitBranch size={15} color={tokens.color.muted} aria-hidden />
              <Typography variant="subtitle2" component="h2">元の案件</Typography>
            </Stack>
            {parent ? <Stack>{row(parent)}</Stack> : <Typography variant="body2" color="text.secondary">元の案件は見つかりません（削除された可能性があります）</Typography>}
            {!!p.adoptedProposals?.length && (
              <>
                <Typography variant="caption" component="p" sx={{ mt: 1.5, mb: 0.5 }}>採用した改善提案（{p.adoptedProposals.length}件）</Typography>
                <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                  {p.adoptedProposals.map((t) => <Typography key={t} component="li" variant="body2" sx={{ overflowWrap: 'anywhere' }}>{t}</Typography>)}
                </Box>
              </>
            )}
          </Box>
        )}
        {children.length > 0 && (
          <Box>
            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 1 }}>
              <GitBranch size={15} color={tokens.color.muted} aria-hidden />
              <Typography variant="subtitle2" component="h2">追加開発（{children.length}件）</Typography>
            </Stack>
            <Stack spacing={0.75}>{children.map(row)}</Stack>
          </Box>
        )}
      </Stack>
    </Surface>
  );
}
