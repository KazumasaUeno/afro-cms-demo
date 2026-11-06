import { Box, Button, ButtonBase, Stack, Typography } from '@mui/material';
import { ArrowDownRight, ArrowUpRight, ChevronRight, MessageSquare, ScrollText } from 'lucide-react';
import { useState } from 'react';
import type { DiagnosisReport } from '@/types';
import { AiBadge, PageHeader, ProgressRing, SectionTitle, Surface } from '@/components/ui';
import { useDemo } from '@/store/DemoStore';
import { useToast } from '@/hooks/useToast';
import { formatDate } from '@/services/time';
import { MONTHLY_METRICS } from '@/data/insights';
import { tokens } from '@/theme/tokens';
import { AREAS } from '@/components/layout/nav';
import { DiagnosisDialog } from '@/features/insights/DiagnosisDialog';
import { DISCLAIMER } from '@/features/insights/DiagnosisReport';

const AREA = AREAS.portal;

function Kpi({ label, value, prev, unit = '', decimals = 0 }: { label: string; value: number; prev: number; unit?: string; decimals?: number }) {
  const diff = prev ? ((value - prev) / prev) * 100 : 0;
  const up = diff >= 0;
  return (
    <Surface>
      <Typography variant="caption" sx={{ fontWeight: 600 }}>{label}</Typography>
      <Typography sx={{ mt: 0.5, fontSize: 26, fontWeight: 750, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
        {value.toLocaleString('ja-JP', { maximumFractionDigits: decimals, minimumFractionDigits: decimals })}
        <Box component="span" sx={{ fontSize: 13, fontWeight: 600, color: tokens.color.muted, ml: 0.5 }}>{unit}</Box>
      </Typography>
      <Stack direction="row" spacing={0.25} alignItems="center" sx={{ color: up ? tokens.color.success : tokens.color.danger }}>
        {up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
        <Typography variant="caption" sx={{ color: 'inherit', fontWeight: 650 }}>前月比 {up ? '+' : ''}{diff.toFixed(1)}%</Typography>
      </Stack>
    </Surface>
  );
}

export default function PortalReportsPage() {
  const { state } = useDemo();
  const toast = useToast();
  const [open, setOpen] = useState<DiagnosisReport | null>(null);
  const reports = state.diagnoses;
  const latest = reports[0];
  const cur = MONTHLY_METRICS[MONTHLY_METRICS.length - 1];
  const prev = MONTHLY_METRICS[MONTHLY_METRICS.length - 2] ?? cur;

  return (
    <>
      <PageHeader
        eyebrow="お客様ポータル"
        icon={<ScrollText size={15} />}
        title="レポート"
        description="公開後は 4 か月ごとに AI がサイトを診断し、改善レポートをお届けします。レポートは HTML でダウンロードできます。"
      />

      <Stack spacing={{ xs: 2.5, md: 3 }}>
        <Box>
          <SectionTitle title={`${cur.month} のサイトの状況`} sub={<Typography variant="caption">デモデータ</Typography>} />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0,1fr))' }, gap: { xs: 1.5, md: 2 } }}>
            <Kpi label="訪問数" value={cur.sessions} prev={prev.sessions} unit="回" />
            <Kpi label="問い合わせ" value={cur.inquiries} prev={prev.inquiries} unit="件" />
            <Kpi label="問い合わせ率" value={cur.cvr} prev={prev.cvr} unit="%" decimals={2} />
          </Box>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0,1.4fr) minmax(0,1fr)' }, gap: { xs: 2.5, md: 3 }, alignItems: 'start' }}>
          <Surface>
            <SectionTitle title="改善レポート" sub={<AiBadge />} />
            {reports.length === 0 ? (
              <Typography variant="body2" color="text.secondary">まだレポートはありません。公開から 4 か月後に最初のレポートが届きます。</Typography>
            ) : (
              <Stack spacing={1}>
                {reports.map((r) => (
                  <ButtonBase
                    key={r.id}
                    onClick={() => setOpen(r)}
                    aria-label={`第${r.cycle}回の改善レポートを開く`}
                    sx={{ justifyContent: 'flex-start', gap: 2, textAlign: 'left', borderRadius: 3, p: 1.5, border: `1px solid ${tokens.color.border}`, '&:hover': { borderColor: tokens.color.borderStrong, bgcolor: tokens.color.surfaceMuted } }}
                  >
                    <ProgressRing value={r.score} size={48} stroke={5} color={AREA.color} label={`スコア ${r.score}`}>
                      <Typography sx={{ fontSize: 14, fontWeight: 750 }}>{r.score}</Typography>
                    </ProgressRing>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 650 }}>第{r.cycle}回 改善レポート{r === latest ? '（最新）' : ''}</Typography>
                      <Typography variant="caption" sx={{ display: 'block' }}>{formatDate(r.at)}・改善の提案 {r.findings.length} 件</Typography>
                    </Box>
                    <ChevronRight size={18} color={tokens.color.muted} />
                  </ButtonBase>
                ))}
              </Stack>
            )}
          </Surface>

          <Surface tone="muted">
            <SectionTitle title="より詳しい分析をご希望の場合" />
            <Stack spacing={1}>
              {DISCLAIMER.map((t) => <Typography key={t} variant="body2" color="text.secondary">{t}</Typography>)}
            </Stack>
            <Button fullWidth variant="contained" startIcon={<MessageSquare size={16} />} sx={{ mt: 2 }} onClick={() => toast('デモのため、お問い合わせは送信されません', 'info')}>
              詳しい分析を相談する
            </Button>
          </Surface>
        </Box>
      </Stack>

      <DiagnosisDialog open={!!open} report={open} onClose={() => setOpen(null)} />
    </>
  );
}
