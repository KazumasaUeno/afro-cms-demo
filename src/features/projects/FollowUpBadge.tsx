import { Box } from '@mui/material';
import type { Project } from '@/types';
import { StatusPill } from '@/components/ui';
import { useRepositories } from '@/repositories';

/** プロジェクトのカード: 追加開発の案件（0.31.0）の印と元の案件の名前（見つからなければ印だけ） */
export function FollowUpBadge({ p }: { p: Project }) {
  const { projects } = useRepositories();
  const { data } = projects.useList();
  const parent = data.find((x) => x.id === p.parentProjectId);
  return (
    <Box sx={{ mt: 0.5, minWidth: 0, display: 'flex' }}>
      <StatusPill tone="info" dot={false}>
        <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>
          追加開発{parent ? `・元: ${parent.siteName}` : ''}
        </Box>
      </StatusPill>
    </Box>
  );
}
