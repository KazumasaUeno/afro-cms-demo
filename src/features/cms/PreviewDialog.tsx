import { Box, Dialog, IconButton, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { Monitor, Smartphone, Tablet, X, Lock } from 'lucide-react';
import { useState } from 'react';
import type { CmsPage } from '@/types';
import { useDemo, currentProject } from '@/store/DemoStore';
import { tokens } from '@/theme/tokens';
import { SitePreview } from './SitePreview';

type Device = 'pc' | 'tablet' | 'mobile';
const WIDTH: Record<Device, number> = { pc: 1180, tablet: 768, mobile: 390 };

export function PreviewDialog({ page, open, onClose }: { page: CmsPage; open: boolean; onClose: () => void }) {
  const [device, setDevice] = useState<Device>('pc');
  const { state } = useDemo();
  const project = currentProject(state);
  return (
    <Dialog open={open} onClose={onClose} fullScreen aria-labelledby="preview-title" PaperProps={{ sx: { bgcolor: tokens.color.bgSubtle, borderRadius: 0, border: 'none' } }}>
      <Stack direction="row" alignItems="center" spacing={2} sx={{ px: { xs: 2, md: 3 }, height: 64, bgcolor: tokens.color.surface, borderBottom: `1px solid ${tokens.color.border}`, flexShrink: 0 }}>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography id="preview-title" variant="h5" noWrap>公開プレビュー</Typography>
          <Typography variant="caption" noWrap sx={{ display: 'block' }}>実際には公開されません（デモ）</Typography>
        </Box>
        <ToggleButtonGroup exclusive size="small" value={device} onChange={(_, v: Device | null) => v && setDevice(v)} aria-label="表示デバイス">
          <ToggleButton value="pc" aria-label="PC"><Monitor size={16} /><Box component="span" sx={{ ml: 0.75, display: { xs: 'none', sm: 'inline' } }}>PC</Box></ToggleButton>
          <ToggleButton value="tablet" aria-label="タブレット"><Tablet size={16} /><Box component="span" sx={{ ml: 0.75, display: { xs: 'none', sm: 'inline' } }}>タブレット</Box></ToggleButton>
          <ToggleButton value="mobile" aria-label="スマホ"><Smartphone size={16} /><Box component="span" sx={{ ml: 0.75, display: { xs: 'none', sm: 'inline' } }}>スマホ</Box></ToggleButton>
        </ToggleButtonGroup>
        <IconButton onClick={onClose} aria-label="プレビューを閉じる"><X size={20} /></IconButton>
      </Stack>
      <Box sx={{ flex: 1, overflow: 'auto', p: { xs: 1.5, md: 4 } }}>
        <Box
          sx={{
            width: WIDTH[device], maxWidth: '100%', mx: 'auto', borderRadius: device === 'mobile' ? '28px' : '16px', overflow: 'hidden',
            bgcolor: '#fff', boxShadow: tokens.shadow.lg, border: `1px solid ${tokens.color.border}`,
            transition: `width .34s ${tokens.motion.easeCss}, border-radius .34s`,
          }}
        >
          <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 2, height: 38, bgcolor: '#F1F3F7', borderBottom: `1px solid ${tokens.color.border}` }}>
            {['#FF5F57', '#FEBC2E', '#28C840'].map((c) => <Box key={c} sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: c, display: device === 'mobile' ? 'none' : 'block' }} />)}
            <Stack direction="row" alignItems="center" spacing={0.75} sx={{ flex: 1, mx: 1, px: 1.25, height: 24, borderRadius: 99, bgcolor: '#fff', fontSize: 12, color: tokens.color.muted, minWidth: 0 }}>
              <Lock size={11} />
              <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {project.siteUrl.replace(/^https?:\/\//, '')}{page.slug === '/' ? '' : page.slug}
              </Box>
            </Stack>
          </Stack>
          <SitePreview page={page} compact={device !== 'pc'} />
        </Box>
      </Box>
    </Dialog>
  );
}
