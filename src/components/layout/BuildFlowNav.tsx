import { Box, ButtonBase, Stack, Typography } from '@mui/material';
import { CheckCircle2, Circle, FileSearch, LayoutTemplate, Network } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { useDemo } from '@/store/DemoStore';
import { tokens } from '@/theme/tokens';

/**
 * 「要件定義 → サイトマップ → デザイン」の制作フロー。
 * AI Studio の各画面（要件・サイトマップ・デザイン）の上部に置き、どこまで承認済みかを示す。
 */
export function BuildFlowNav() {
  const { state } = useDemo();
  const { pathname } = useLocation();
  const steps = [
    { to: '/ai-studio', label: 'AI要件定義', short: '要件', icon: FileSearch, done: state.requirements.status === 'approved' },
    { to: '/site', label: 'サイトマップ', short: 'サイトマップ', icon: Network, done: !!state.sitemap.approvedAt },
    { to: '/ai-studio/design', label: 'デザイン・構築', short: 'デザイン', icon: LayoutTemplate, done: !!state.design.approvedAt },
  ];
  return (
    <Box
      component="nav"
      aria-label="制作フロー"
      sx={{ display: 'inline-flex', p: 0.5, gap: 0.5, mb: 3, borderRadius: '14px', bgcolor: tokens.color.bgSubtle, maxWidth: '100%', overflowX: 'auto' }}
    >
      {steps.map((s, i) => {
        // ヒアリングの回答の一覧（/ai-studio/hearing）は要件定義の段階に含める
        const active = pathname === s.to || (s.to === '/ai-studio' && pathname === '/ai-studio/hearing');
        const Icon = s.icon;
        return (
          <ButtonBase
            key={s.to}
            component={NavLink}
            to={s.to}
            end
            aria-current={active ? 'page' : undefined}
            sx={{
              gap: { xs: 0.75, sm: 1 }, px: { xs: 1, sm: 1.5 }, height: { xs: 44, md: 36 }, borderRadius: '10px', whiteSpace: 'nowrap', flexShrink: 0,
              bgcolor: active ? tokens.color.surface : 'transparent', boxShadow: active ? tokens.shadow.sm : 'none',
              color: active ? tokens.color.ink : tokens.color.muted, '&:hover': { color: tokens.color.ink },
            }}
          >
            <Typography component="span" sx={{ fontSize: 12, fontWeight: 700, color: tokens.color.muted }}>{i + 1}</Typography>
            <Box component="span" sx={{ display: { xs: 'none', sm: 'flex' } }}><Icon size={16} /></Box>
            <Typography component="span" sx={{ fontSize: 13, fontWeight: 600, display: { xs: 'none', sm: 'inline' } }}>{s.label}</Typography>
            <Typography component="span" sx={{ fontSize: 13, fontWeight: 600, display: { xs: 'inline', sm: 'none' } }}>{s.short}</Typography>
            <Stack component="span" sx={{ color: s.done ? tokens.color.success : tokens.color.borderStrong }} aria-label={s.done ? '承認済み' : '未承認'}>
              {s.done ? <CheckCircle2 size={15} /> : <Circle size={15} />}
            </Stack>
          </ButtonBase>
        );
      })}
    </Box>
  );
}
