import { Box, ButtonBase, Stack, Typography } from '@mui/material';
import { CheckCircle2, Circle, FileSearch, LayoutTemplate, Network } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { useDemo } from '@/store/DemoStore';
import { tokens } from '@/theme/tokens';
import { useProjectRoutes } from '@/features/projects/projectRoutes';
import { useHearingRoutes } from '@/features/requirements/hearingRoutes';

/**
 * 「要件定義 → サイトマップ → デザイン」の制作フロー。
 * AI Studio の各画面（要件・サイトマップ・デザイン）の上部に置き、どこまで承認済みかを示す。
 * 行き先はいまのエリアの中（管理者画面 /ai-studio・/site・/ai-studio/design、開発者画面 /dev/hearing・/dev/sitemap・/dev/design。0.26.0）
 */
export function BuildFlowNav() {
  const { state } = useDemo();
  const { pathname } = useLocation();
  const routes = useProjectRoutes();
  const hearing = useHearingRoutes();
  // 要件定義の段階（ヒアリングの入力・回答）では、サイトマップ・デザインの段階ナビを出さない（2026-11-10 決定）
  if (pathname === hearing.input || pathname === hearing.answers) return null;
  const steps = [
    { to: routes.requirements, label: 'AI要件定義', short: '要件', icon: FileSearch, done: state.requirements.status === 'approved' },
    { to: routes.sitemap, label: 'サイトマップ', short: 'サイトマップ', icon: Network, done: !!state.sitemap.approvedAt },
    { to: routes.design, label: 'デザイン・構築', short: 'デザイン', icon: LayoutTemplate, done: !!state.design.approvedAt },
  ];
  return (
    <Box
      component="nav"
      aria-label="制作フロー"
      sx={{ display: 'inline-flex', p: 0.5, gap: 0.5, mb: 3, borderRadius: '14px', bgcolor: tokens.color.bgSubtle, maxWidth: '100%', overflowX: 'auto' }}
    >
      {steps.map((s, i) => {
        // デザインの段階はデザイン要件定義（0.28.0）とデザインスタジオの両方で選択中にする
        const active = pathname === s.to || (s.to === routes.design && pathname === routes.designRequirements);
        const Icon = s.icon;
        return (
          <ButtonBase
            key={s.to}
            component={NavLink}
            to={s.to}
            // NavLink は自分の判定で aria-current を付け直すため、デザインの段階は配下（デザイン要件定義）も一致させる
            end={s.to !== routes.design}
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
