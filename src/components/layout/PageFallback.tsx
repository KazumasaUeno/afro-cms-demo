import { Box, Skeleton, Stack } from '@mui/material';

/** 画面の遅延読み込み中に出す骨組み */
export function PageFallback() {
  return (
    <Stack spacing={2} aria-busy="true" aria-label="読み込み中">
      <Skeleton variant="rounded" width={220} height={36} />
      <Skeleton variant="rounded" width="60%" height={20} />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2, pt: 2 }}>
        {[0, 1, 2].map((i) => <Skeleton key={i} variant="rounded" height={160} sx={{ borderRadius: 4 }} />)}
      </Box>
    </Stack>
  );
}
