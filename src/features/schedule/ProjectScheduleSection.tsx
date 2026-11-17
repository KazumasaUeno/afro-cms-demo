import { Box, Button, Stack, Typography } from '@mui/material';
import { ArrowRight, CalendarDays } from 'lucide-react';
import type { DemoState } from '@/types';
import { SectionTitle, Surface } from '@/components/ui';
import { todayYmd } from '@/features/projects/projectForm';
import { tokens } from '@/theme/tokens';
import { MILESTONES, jpDate, untilText } from './SchedulePage';
import { WbsSection } from './WbsSection';

/**
 * プロジェクト詳細のスケジュール（2026-11-17 ユーザー指示「プロジェクト選択後にスケジュールを表示しておきたい」）。見るだけ。
 * 詳細で開いている案件は選んでいる案件と違うことがあるので、案件のデータ（workView）を view で受け取る。
 * 編集はスケジュール画面へ（onOpen。案件を選んでから開く）
 */
export function ProjectScheduleSection({ view, dev, onOpen }: { view: DemoState; dev: boolean; onOpen: () => void }) {
  const saved = view.schedule;
  const today = todayYmd();
  return (
    <Box sx={{ mt: { xs: 3, md: 4 } }}>
      <Surface padding={{ xs: 2, md: 3 }}>
        <SectionTitle
          title="スケジュール"
          icon={<CalendarDays size={18} />}
          action={<Button size="small" endIcon={<ArrowRight size={14} />} onClick={onOpen}>{dev ? 'スケジュールを編集' : 'スケジュールを開く'}</Button>}
        />
        {!saved ? (
          <Typography variant="body2" role="status" sx={{ color: 'text.secondary' }}>
            スケジュールはまだありません（要件定義書の承認のあとに開発担当者が入れます）
          </Typography>
        ) : (
          <Stack spacing={1}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', sm: 'repeat(3, minmax(0,1fr))' }, gap: 1 }}>
              {MILESTONES.map((m) => {
                const value = saved[m.key];
                return (
                  <Box key={m.key} sx={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 1.25, px: 1.5, py: 1.25, borderRadius: `${tokens.radius.md}px`, bgcolor: m.soft }}>
                    <Box aria-hidden sx={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', bgcolor: tokens.color.surface, color: m.accent }}>
                      {m.icon}
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="caption" sx={{ fontWeight: 600, color: m.ink, display: 'block' }}>{m.label}</Typography>
                      <Typography variant="body1" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: value ? m.ink : tokens.color.muted }}>
                        {value ? jpDate(value) : '未設定'}
                        {value && <Typography component="span" variant="caption" sx={{ ml: 1, fontWeight: 600 }}>{untilText(value, today)}</Typography>}
                      </Typography>
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </Stack>
        )}
      </Surface>
      {saved && <WbsSection editable={false} view={view} />}
    </Box>
  );
}
