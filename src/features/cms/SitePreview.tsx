import { Box, Stack, Typography } from '@mui/material';
import { useMemo } from 'react';
import type { CmsPage } from '@/types';
import { useDemo, currentProject } from '@/store/DemoStore';
import { formatDate } from '@/services/time';
import { sanitizeHtml } from './sanitize';

/** 公開サイト風の表示（中身は必ずサニタイズしてから描画する） */
export const proseSx = {
  fontSize: 16, lineHeight: 1.9, color: '#1f2937',
  '& > * + *': { mt: 1.75 },
  '& h2': { fontSize: { xs: 24, sm: 30 }, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.3, m: 0, mt: 3 },
  '& h2:first-of-type': { mt: 0 },
  '& h3': { fontSize: 20, fontWeight: 680, mt: 3 },
  '& p': { m: 0, mt: 1.5 },
  '& ul, & ol': { pl: 3, m: 0, mt: 1.5 },
  '& blockquote': { borderLeft: '3px solid currentColor', pl: 2, ml: 0, opacity: 0.8 },
  '& img': { display: 'block', maxWidth: '100%', borderRadius: '12px', my: 2.5 },
  '& a': { color: 'inherit' },
} as const;

export function SitePreview({ page, compact }: { page: CmsPage; compact?: boolean }) {
  const { state } = useDemo();
  const project = currentProject(state);
  const html = useMemo(() => sanitizeHtml(page.content), [page.content]);
  const nav = state.sitemap.after.nodes.filter((n) => n.data.kind !== 'home' && n.data.path.split('/').length === 2).slice(0, 5);
  return (
    <Box sx={{ bgcolor: '#fff', color: '#111827', fontFamily: '"Noto Sans JP", system-ui, sans-serif', minHeight: '100%', containerType: 'inline-size' }}>
      <Stack direction="row" alignItems="center" spacing={2} sx={{ px: { xs: 2.5, sm: 4 }, py: 2, borderBottom: '1px solid #eee' }}>
        <Typography sx={{ fontWeight: 800, letterSpacing: '0.08em', fontSize: 15, color: project.accent }}>{project.siteName}</Typography>
        <Box sx={{ flex: 1 }} />
        <Stack direction="row" spacing={2.5} sx={{ display: compact ? 'none' : 'flex', '@container (max-width: 640px)': { display: 'none' } }}>
          {nav.map((n) => <Typography key={n.id} sx={{ fontSize: 13, color: '#4b5563' }}>{n.data.label}</Typography>)}
        </Stack>
        <Box sx={{ px: 1.5, py: 0.75, borderRadius: 99, bgcolor: project.accent, color: '#fff', fontSize: 12, fontWeight: 700 }}>お問い合わせ</Box>
      </Stack>
      {page.coverImage && <Box component="img" src={page.coverImage} alt="" sx={{ display: 'block', width: '100%', aspectRatio: '21/8', objectFit: 'cover' }} />}
      <Box sx={{ maxWidth: 720, mx: 'auto', px: { xs: 2.5, sm: 4 }, py: { xs: 4, sm: 6 } }}>
        <Typography sx={{ fontSize: 12, letterSpacing: '0.12em', color: project.accent, fontWeight: 700, mb: 1 }}>
          {page.type === 'news' ? `NEWS ・ ${formatDate(page.publishedAt ?? page.scheduledAt ?? page.updatedAt)}` : page.slug}
        </Typography>
        <Typography component="h1" sx={{ fontSize: { xs: 26, sm: 34 }, fontWeight: 750, letterSpacing: '-0.02em', lineHeight: 1.3, mb: 3 }}>{page.title}</Typography>
        <Box sx={proseSx} dangerouslySetInnerHTML={{ __html: html }} />
      </Box>
      <Box sx={{ px: 4, py: 3, borderTop: '1px solid #eee', fontSize: 12, color: '#6b7280', textAlign: 'center' }}>
        © {new Date().getFullYear()} {project.clientName}
      </Box>
    </Box>
  );
}
