import { Box, Button, ButtonBase, Stack, Typography } from '@mui/material';
import { BarChart3, Info, ScanSearch, TrendingDown, TrendingUp, ArrowUpRight } from 'lucide-react';
import { useState } from 'react';
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DiagnosisReport } from '@/types';
import { MONTHLY_METRICS, PAGE_PERFORMANCE, RENEWAL_MONTH, TRAFFIC_SOURCES } from '@/data/insights';
import { useDemo } from '@/store/DemoStore';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { tokens } from '@/theme/tokens';
import { daysFromNow, formatDate, formatDateTime } from '@/services/time';
import { AiBadge, CountUp, PageHeader, Reveal, SectionTitle, StatusPill, Surface } from '@/components/ui';
import { DiagnosisDialog } from './DiagnosisDialog';

const last = MONTHLY_METRICS[MONTHLY_METRICS.length - 1];
const before = MONTHLY_METRICS[MONTHLY_METRICS.findIndex((m) => m.month === RENEWAL_MONTH) - 1];

function Kpi({ label, value, base, decimals = 0, suffix = '' }: { label: string; value: number; base: number; decimals?: number; suffix?: string }) {
  const delta = ((value - base) / base) * 100;
  const up = delta >= 0;
  return (
    <Surface>
      <Typography variant="subtitle2">{label}</Typography>
      <Typography sx={{ fontSize: { xs: 28, md: 34 }, fontWeight: 740, letterSpacing: '-0.03em', mt: 1, lineHeight: 1.1 }}>
        <CountUp value={value} decimals={decimals} suffix={suffix} />
      </Typography>
      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 1 }}>
        <StatusPill tone={up ? 'success' : 'danger'} dot={false} icon={up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}>
          {up ? '+' : ''}{delta.toFixed(0)}%
        </StatusPill>
        <Typography variant="caption">リニューアル前（{before.month}）比</Typography>
      </Stack>
    </Surface>
  );
}

const CHART_Y_WIDTH = 40;

/** 推移グラフ 1 段分（上下 2 段で同じ x 位置に揃える） */
function TrendChart({ dataKey, name, color, gradientId, latest, unit, showXAxis, tickFormatter, anim, ariaLabel }: {
  dataKey: 'sessions' | 'inquiries'; name: string; color: string; gradientId: string; latest: number; unit: string;
  showXAxis?: boolean; tickFormatter?: (v: number) => string; anim: boolean; ariaLabel: string;
}) {
  return (
    <Box sx={{ '& + &': { mt: 1.5 } }}>
      <Stack direction="row" spacing={0.75} alignItems="baseline" sx={{ mb: 0.25 }}>
        <Box sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: color, alignSelf: 'center' }} />
        <Typography variant="caption" sx={{ fontWeight: 600, color: tokens.color.inkSoft }}>{name}</Typography>
        <Typography sx={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{latest.toLocaleString('ja-JP')}{unit}</Typography>
        <Typography variant="caption">（{last.month}）</Typography>
      </Stack>
      <Box sx={{ height: 150 }} role="img" aria-label={ariaLabel}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={MONTHLY_METRICS} syncId="insightsTrend" margin={{ top: 18, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity={0.2} /><stop offset="1" stopColor={color} stopOpacity={0} /></linearGradient>
            </defs>
            <CartesianGrid stroke={tokens.color.border} strokeDasharray="0" vertical={false} />
            <XAxis dataKey="month" hide={!showXAxis} tickFormatter={(m: string) => m.slice(5) + '月'} tick={{ fontSize: 12, fill: tokens.color.muted }} axisLine={false} tickLine={false} />
            <YAxis width={CHART_Y_WIDTH} tick={{ fontSize: 12, fill: tokens.color.muted }} axisLine={false} tickLine={false} tickFormatter={tickFormatter} />
            <Tooltip contentStyle={{ borderRadius: 12, border: `1px solid ${tokens.color.border}`, boxShadow: tokens.shadow.md, fontSize: 12 }} formatter={(v) => [Number(v).toLocaleString('ja-JP'), name]} />
            <ReferenceLine x={RENEWAL_MONTH} stroke={tokens.color.ink} strokeDasharray="4 4" label={{ value: 'リニューアル', position: 'top', fontSize: 12, fill: tokens.color.ink }} />
            <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} fill={`url(#${gradientId})`} isAnimationActive={anim} />
          </AreaChart>
        </ResponsiveContainer>
      </Box>
    </Box>
  );
}

export default function InsightsPage() {
  const { state } = useDemo();
  const reduced = useReducedMotion();
  const [dialog, setDialog] = useState<{ open: boolean; report: DiagnosisReport | null }>({ open: false, report: null });
  const latest = state.diagnoses[0];
  const anim = !reduced;

  // 4か月単位の診断サイクル（リニューアル 2026/05 を起点）
  const cycles = [
    { label: 'リニューアル', sub: '2026/05' },
    { label: '4か月後', sub: '第1回 診断' },
    { label: '8か月後', sub: '第2回 診断' },
    { label: '12か月後', sub: '第3回 診断' },
  ];
  const doneCycles = Math.min(state.diagnoses.length, 3);
  const nextAt = formatDate(daysFromNow(state.diagnoses.length > 1 ? 120 : 18));

  return (
    <>
      <PageHeader
        eyebrow="⑤ 改善"
        icon={<BarChart3 size={15} />}
        title="インサイト"
        description="アクセスと問い合わせの推移を見ながら、4か月ごとのAI診断で次の改善を決めます。"
        actions={<Button variant="contained" startIcon={<ScanSearch size={16} />} onClick={() => setDialog({ open: true, report: null })}>AIサイト診断を実行</Button>}
      />

      <Stack direction="row" spacing={1.25} alignItems="center" role="note" sx={{ mb: 3, px: 2, py: 1.25, borderRadius: '14px', bgcolor: tokens.color.warningSoft, color: tokens.color.warningInk }}>
        <Info size={17} style={{ flexShrink: 0 }} />
        <Typography variant="body2" sx={{ fontWeight: 600 }}>この画面の数値・グラフ・診断結果はすべてデモデータです（実際の計測値ではありません）。</Typography>
      </Stack>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 2, mb: 3 }}>
        <Reveal><Kpi label={`月間アクセス（${last.month}）`} value={last.sessions} base={before.sessions} /></Reveal>
        <Reveal delay={0.05}><Kpi label="月間問い合わせ" value={last.inquiries} base={before.inquiries} suffix="件" /></Reveal>
        <Reveal delay={0.1}><Kpi label="コンバージョン率" value={last.cvr} base={before.cvr} decimals={2} suffix="%" /></Reveal>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' }, gap: 3, mb: 3 }}>
        <Surface>
          <SectionTitle title="アクセスと問い合わせの推移" sub={<Typography variant="caption" sx={{ ml: 1, display: { xs: 'none', sm: 'block' } }}>月次</Typography>} />
          {/* 二軸をやめて上下 2 段。x 軸と参照線の位置を揃えるため、y 軸の幅と余白を両方で同じにする */}
          <TrendChart
            dataKey="sessions" name="アクセス数" color={tokens.color.primary} gradientId="gSessions" latest={last.sessions} unit=""
            tickFormatter={(v) => `${v / 1000}k`} anim={anim}
            ariaLabel={`アクセス数は ${MONTHLY_METRICS[0].sessions.toLocaleString('ja-JP')} から ${last.sessions.toLocaleString('ja-JP')} へ推移`}
          />
          <TrendChart
            dataKey="inquiries" name="問い合わせ数" color={tokens.color.info} gradientId="gInq" latest={last.inquiries} unit="件"
            showXAxis anim={anim}
            ariaLabel={`問い合わせは ${MONTHLY_METRICS[0].inquiries} 件から ${last.inquiries} 件へ推移`}
          />
        </Surface>

        <Surface>
          <SectionTitle title="流入経路" />
          <Box sx={{ height: 180, position: 'relative' }} role="img" aria-label={TRAFFIC_SOURCES.map((s) => `${s.name} ${s.value}%`).join('、')}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={TRAFFIC_SOURCES} dataKey="value" nameKey="name" innerRadius={56} outerRadius={80} paddingAngle={2} stroke="none" isAnimationActive={anim}>
                  {TRAFFIC_SOURCES.map((s) => <Cell key={s.name} fill={s.color} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', textAlign: 'center' }}>
              <Box><Typography sx={{ fontSize: 22, fontWeight: 740 }}>{TRAFFIC_SOURCES[0].value}%</Typography><Typography variant="caption">自然検索</Typography></Box>
            </Box>
          </Box>
          <Stack spacing={1} sx={{ mt: 1 }}>
            {TRAFFIC_SOURCES.map((s) => (
              <Stack key={s.name} direction="row" alignItems="center" spacing={1}>
                <Box sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: s.color }} />
                <Typography variant="body2" sx={{ flex: 1 }}>{s.name}</Typography>
                <Typography variant="body2" sx={{ fontWeight: 650, fontVariantNumeric: 'tabular-nums' }}>{s.value}%</Typography>
              </Stack>
            ))}
          </Stack>
        </Surface>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 3, mb: 3 }}>
        <Surface>
          <SectionTitle title="ページ別パフォーマンス" />
          <Stack spacing={1.75}>
            {PAGE_PERFORMANCE.map((p) => {
              const max = Math.max(...PAGE_PERFORMANCE.map((x) => x.views));
              return (
                <Box key={p.path}>
                  <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 0.5 }}>
                    <Typography variant="body2" sx={{ fontWeight: 650 }}>{p.page}</Typography>
                    <Typography sx={{ fontFamily: tokens.font.mono, fontSize: 12, color: tokens.color.muted, flex: 1 }} noWrap>{p.path}</Typography>
                    <Typography variant="caption" sx={{ color: p.trend >= 0 ? tokens.color.successInk : tokens.color.dangerInk, fontWeight: 650 }}>{p.trend >= 0 ? '▲' : '▼'} {Math.abs(p.trend)}%</Typography>
                  </Stack>
                  <Stack direction="row" alignItems="center" spacing={1.5}>
                    <Box sx={{ flex: 1, height: 10, borderRadius: 99, bgcolor: tokens.color.bgSubtle }}>
                      <Box sx={{ width: `${(p.views / max) * 100}%`, height: '100%', borderRadius: 99, bgcolor: tokens.color.primary, opacity: 0.85 }} />
                    </Box>
                    <Typography variant="caption" sx={{ minWidth: 132, textAlign: 'right', fontVariantNumeric: 'tabular-nums', flexShrink: 0, lineHeight: 1.35 }}>
                      <Box component="span" sx={{ display: 'block', whiteSpace: 'nowrap' }}>{p.views.toLocaleString('ja-JP')} PV</Box>
                      <Box component="span" sx={{ display: 'block', whiteSpace: 'nowrap' }}>CVR {p.cvr}%</Box>
                    </Typography>
                  </Stack>
                </Box>
              );
            })}
          </Stack>
        </Surface>

        <Surface>
          <SectionTitle title="AI改善提案" sub={<Box sx={{ ml: 1 }}><AiBadge /></Box>} />
          {latest ? (
            <Stack spacing={1.25}>
              {latest.findings.slice(0, 3).map((f) => (
                <Box key={f.title} sx={{ p: 1.75, borderRadius: '14px', bgcolor: tokens.color.surfaceMuted, border: `1px solid ${tokens.color.border}` }}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                    <StatusPill tone={f.priority === 'high' ? 'danger' : f.priority === 'medium' ? 'warning' : 'neutral'}>{f.priority === 'high' ? '高' : f.priority === 'medium' ? '中' : '低'}</StatusPill>
                    <Typography variant="h6">{f.title}</Typography>
                  </Stack>
                  <Typography variant="body2" color="text.secondary">{f.detail}</Typography>
                </Box>
              ))}
              <Button size="small" endIcon={<ArrowUpRight size={14} />} onClick={() => setDialog({ open: true, report: latest })} sx={{ alignSelf: 'flex-start' }}>レポート全体を見る</Button>
            </Stack>
          ) : <Typography variant="body2" color="text.secondary">まだ診断がありません。</Typography>}
        </Surface>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 3 }}>
        <Surface>
          <SectionTitle title="4か月ごとの改善診断" sub={<Typography variant="caption" sx={{ ml: 1 }}>次回 {nextAt}（予定）</Typography>} />
          <Stack direction="row" component="ol" sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {cycles.map((c, i) => {
              const done = i <= doneCycles;
              return (
                <Box component="li" key={c.label} sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" alignItems="center">
                    <Box sx={{ width: 14, height: 14, borderRadius: '50%', flexShrink: 0, bgcolor: done ? tokens.color.primary : tokens.color.surface, border: `2px solid ${done ? tokens.color.primary : tokens.color.borderStrong}` }} />
                    {i < cycles.length - 1 && <Box sx={{ flex: 1, height: 2, bgcolor: i < doneCycles ? tokens.color.primary : tokens.color.border }} />}
                  </Stack>
                  <Typography variant="body2" sx={{ fontWeight: 650, mt: 1, pr: 1, lineHeight: 1.4 }}>{c.label}</Typography>
                  <Typography variant="caption" sx={{ display: 'block', pr: 1 }}>{c.sub}</Typography>
                </Box>
              );
            })}
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2.5 }}>リニューアル後も4か月ごとにAIがサイトを診断し、改善提案を自動で作成・送付します。</Typography>
        </Surface>

        <Surface>
          <SectionTitle title="過去の診断履歴" />
          <Stack spacing={1}>
            {state.diagnoses.map((d) => (
              <ButtonBase
                key={d.id}
                onClick={() => setDialog({ open: true, report: d })}
                aria-label={`第${d.cycle}回 診断レポートを開く（スコア ${d.score}）`}
                sx={{ justifyContent: 'flex-start', gap: 2, p: 1.5, borderRadius: '14px', textAlign: 'left', border: `1px solid ${tokens.color.border}`, '&:hover': { bgcolor: tokens.color.surfaceMuted } }}
              >
                <Box sx={{ width: 44, height: 44, borderRadius: '12px', bgcolor: tokens.color.primarySoft, color: tokens.color.primary, display: 'grid', placeItems: 'center', fontWeight: 750, fontSize: 16, flexShrink: 0 }}>{d.score}</Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="h6">第{d.cycle}回 AIサイト診断</Typography>
                  <Typography variant="caption">{formatDateTime(d.at)} ・ 提案 {d.findings.length}件</Typography>
                </Box>
                <StatusPill tone="warning" dot={false}>デモ</StatusPill>
                <ArrowUpRight size={16} color={tokens.color.faint} />
              </ButtonBase>
            ))}
          </Stack>
        </Surface>
      </Box>

      <DiagnosisDialog open={dialog.open} report={dialog.report} onClose={() => setDialog({ open: false, report: null })} />
    </>
  );
}
