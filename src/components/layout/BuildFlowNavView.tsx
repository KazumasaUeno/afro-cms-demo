import { Box, ButtonBase, Stack, Typography } from '@mui/material';
import { CalendarDays, CheckCircle2, Circle, FileSearch, LayoutTemplate, Network } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { tokens } from '@/theme/tokens';
import { useProjectRoutes } from '@/features/projects/projectRoutes';
import { useHearingRoutes } from '@/features/requirements/hearingRoutes';

/** 各段階が済んだか（demo は DemoStore、live は Firestore の要約から入れる） */
export interface BuildFlowDone { requirements: boolean; schedule: boolean; sitemap: boolean; design: boolean }

/**
 * 「要件定義 → スケジュール → サイトマップ → デザイン」の制作フロー（スケジュールは 2026-11-17 会議で追加）。見た目だけ（DemoStore を読まない。LIVE_SITEMAP_IMPL_PLAN P-13）。
 * demo は BuildFlowNav（DemoStore の入れ物）、live はここを直接使う。
 * AI Studio の各画面（要件・サイトマップ・デザイン）の上部に置き、どこまで承認済みかを示す。
 * 行き先はいまのエリアの中（管理者画面 /ai-studio・/site・/ai-studio/design、開発者画面 /dev/hearing・/dev/sitemap・/dev/design。0.26.0）。
 * designAvailable: false（live。デザインの画面がまだ無い。P-10）のとき、デザインの段は未到達と同じ見た目で押せない（段を隠さない＝番号と並びを demo と同じに保つ）
 */
export function BuildFlowNavView({ done, designAvailable = true }: { done: BuildFlowDone; designAvailable?: boolean }) {
  const { pathname } = useLocation();
  const routes = useProjectRoutes();
  const hearing = useHearingRoutes();
  // 要件定義の段階（ヒアリングの入力・回答）では、サイトマップ・デザインの段階ナビを出さない（2026-11-10 決定）
  if (pathname === hearing.input || pathname === hearing.answers) return null;
  const steps = [
    { to: routes.requirements, label: 'AI要件定義', short: '要件', icon: FileSearch, done: done.requirements },
    // 開発者画面は入力（/dev/schedule）、管理者画面は見るだけ（/schedule）
    { to: routes.sitemap.startsWith('/dev') ? '/dev/schedule' : '/schedule', label: 'スケジュール', short: '日程', icon: CalendarDays, done: done.schedule },
    { to: routes.sitemap, label: 'サイトマップ', short: 'サイトマップ', icon: Network, done: done.sitemap },
    { to: routes.design, label: 'デザイン・構築', short: 'デザイン', icon: LayoutTemplate, done: done.design },
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
        const sx = {
          gap: { xs: 0.75, sm: 1 }, px: { xs: 1, sm: 1.5 }, height: { xs: 44, md: 36 }, borderRadius: '10px', whiteSpace: 'nowrap', flexShrink: 0,
          bgcolor: active ? tokens.color.surface : 'transparent', boxShadow: active ? tokens.shadow.sm : 'none',
          color: active ? tokens.color.ink : tokens.color.muted, '&:hover': { color: tokens.color.ink },
        } as const;
        const inner = (
          <>
            <Typography component="span" sx={{ fontSize: 12, fontWeight: 700, color: tokens.color.muted }}>{i + 1}</Typography>
            <Box component="span" sx={{ display: { xs: 'none', sm: 'flex' } }}><Icon size={16} /></Box>
            <Typography component="span" sx={{ fontSize: 13, fontWeight: 600, display: { xs: 'none', sm: 'inline' } }}>{s.label}</Typography>
            <Typography component="span" sx={{ fontSize: 13, fontWeight: 600, display: { xs: 'inline', sm: 'none' } }}>{s.short}</Typography>
            <Stack component="span" sx={{ color: s.done ? tokens.color.success : tokens.color.borderStrong }} aria-label={s.done ? '承認済み' : '未承認'}>
              {s.done ? <CheckCircle2 size={15} /> : <Circle size={15} />}
            </Stack>
          </>
        );
        if (!designAvailable && s.to === routes.design) {
          // live: デザインの画面がまだ無い（リンクにしない。押せない段として未到達と同じ見た目）
          return (
            <ButtonBase key={s.to} component="span" disabled aria-disabled title="デザインの段階は準備中です" sx={sx}>
              {inner}
            </ButtonBase>
          );
        }
        return (
          <ButtonBase
            key={s.to}
            component={NavLink}
            to={s.to}
            // NavLink は自分の判定で aria-current を付け直すため、デザインの段階は配下（デザイン要件定義）も一致させる
            end={s.to !== routes.design}
            aria-current={active ? 'page' : undefined}
            sx={sx}
          >
            {inner}
          </ButtonBase>
        );
      })}
    </Box>
  );
}
