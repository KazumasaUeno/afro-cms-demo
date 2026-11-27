import type { ReactNode } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import { CalendarDays, CalendarClock, ClipboardCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PageHeader, Reveal, Surface } from '@/components/ui';
import { todayYmd } from '@/features/projects/projectForm';
import { tokens } from '@/theme/tokens';
import { MILESTONES, jpDate, untilText } from '@/features/schedule/scheduleParts';

/**
 * お客様ポータルのスケジュールの見た目（PortalSchedulePage.tsx から分けた。LIVE_SCHEDULE_PLAN U4・L-13）。DemoStore を読まない
 * （demo は PortalSchedulePage が、live は src/live/pages/LivePortalSchedulePage.tsx が値を渡す。tests/unit/liveNoDemoStore.test.mjs）。
 * saved: 予定日（無ければ「ご用意します」）・waiting: 承認待ちの案内・wbs: 下に出す WBS（saved があるときだけ）。
 * notice は live だけ（再計画中の「調整中」の案内。demo に無い要素は渡したときだけ出す）
 */
export function PortalScheduleView({ saved, waiting, wbs, notice }: {
  saved: { buildDue?: string; deliveryDate: string; releaseDate: string } | undefined | null;
  waiting: boolean;
  wbs?: ReactNode;
  notice?: string;
}) {
  const navigate = useNavigate();
  const today = todayYmd();

  return (
    <>
      <PageHeader
        eyebrow="スケジュール"
        icon={<CalendarDays size={15} />}
        title="制作〜公開のスケジュール"
        description="サイトマップ・デザイン・制作・品質チェック・公開の予定と、いまの進み具合です。"
      />
      <Reveal>
        <Surface padding={{ xs: 2, md: 3 }}>
          {!saved ? (
            <Stack spacing={1.5} alignItems="flex-start" role="status">
              <Box aria-hidden sx={{ width: 40, height: 40, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: tokens.color.primarySoft, color: tokens.color.primary }}>
                <CalendarClock size={20} />
              </Box>
              <Typography variant="body1" sx={{ fontWeight: 600 }}>スケジュールは要件定義書の承認のあとにアフロがご用意します。</Typography>
            </Stack>
          ) : (
            <Stack spacing={2}>
              {waiting && (
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} sx={{ px: 2, py: 1.5, borderRadius: `${tokens.radius.md}px`, bgcolor: tokens.color.warningSoft, color: tokens.color.warningInk }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }}>このスケジュールの承認をお願いします。</Typography>
                  <Button variant="contained" startIcon={<ClipboardCheck size={16} />} onClick={() => navigate('/portal/approvals#schedule')}>
                    スケジュールを承認する
                  </Button>
                </Stack>
              )}
              {notice && (
                <Box role="status" sx={{ px: 2, py: 1.5, borderRadius: `${tokens.radius.md}px`, bgcolor: tokens.color.infoSoft, color: tokens.color.infoInk }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{notice}</Typography>
                </Box>
              )}
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', md: 'repeat(3, minmax(0,1fr))' }, gap: 1.5 }}>
                {MILESTONES.map((m) => {
                  const value = saved[m.key];
                  return (
                    <Box key={m.key} sx={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 2, minHeight: 104, borderRadius: `${tokens.radius.lg}px`, bgcolor: m.soft }}>
                      <Box aria-hidden sx={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', bgcolor: tokens.color.surface, color: m.accent }}>
                        {m.icon}
                      </Box>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: m.ink }}>{m.label}</Typography>
                        <Typography sx={{ fontSize: { xs: 22, md: 24 }, fontWeight: 700, lineHeight: 1.3, fontVariantNumeric: 'tabular-nums', color: value ? m.ink : tokens.color.muted }}>
                          {value ? jpDate(value) : '調整中'}
                        </Typography>
                        {value && <Typography variant="caption" sx={{ color: m.ink, fontWeight: 600 }}>{untilText(value, today)}</Typography>}
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            </Stack>
          )}
        </Surface>
      </Reveal>
      {saved && wbs}
    </>
  );
}
