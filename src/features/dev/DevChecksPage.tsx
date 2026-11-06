import { Box, Button, LinearProgress, Stack, Typography } from '@mui/material';
import { BadgeCheck, Circle, Gauge, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { PageHeader, ProgressRing, SectionTitle, StatusPill, Surface } from '@/components/ui';
import { useDemo, devState } from '@/store/DemoStore';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useToast } from '@/hooks/useToast';
import { formatDateTime } from '@/services/time';
import { QUALITY_CATEGORIES, QUALITY_ITEMS } from '@/data/quality';
import { tokens } from '@/theme/tokens';
import { AREAS } from '@/components/layout/nav';

const AREA = AREAS.dev;

const STEPS = ['ページを読み込んでいます', '表示速度を計測しています', 'アクセシビリティを確認しています', 'SEO の設定を確認しています', '結果をまとめています'];

/** 計測スコア（シミュレーション。実際の Lighthouse は実行していない） */
const SCORES_BEFORE = [
  { label: 'Performance', value: 71 },
  { label: 'Accessibility', value: 86 },
  { label: 'SEO', value: 88 },
  { label: 'Best Practices', value: 92 },
];
const SCORES_AFTER = [
  { label: 'Performance', value: 94 },
  { label: 'Accessibility', value: 98 },
  { label: 'SEO', value: 100 },
  { label: 'Best Practices', value: 96 },
];

const scoreColor = (v: number) => (v >= 90 ? tokens.color.success : v >= 50 ? tokens.color.warning : tokens.color.danger);

export default function DevChecksPage() {
  const { state, dispatch } = useDemo();
  const reduced = useReducedMotion();
  const toast = useToast();
  const dev = devState(state);
  const [step, setStep] = useState<number | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const items = QUALITY_ITEMS.filter((i) => i.priority === 'A');
  const checked = items.filter((i) => state.qualityChecks[i.id]?.afroAt).length;
  const scores = dev.checksRunAt ? SCORES_AFTER : SCORES_BEFORE;
  const running = step !== null;

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const finish = () => {
    const before = checked;
    dispatch({ type: 'runAutoChecks' });
    setStep(null);
    toast(`自動チェックが完了しました（A区分 ${items.length - before}件を新たに確認・シミュレーション）`);
  };

  const run = () => {
    if (running) return;
    if (reduced) { finish(); return; }
    const tick = (i: number) => {
      setStep(i);
      timer.current = window.setTimeout(() => (i + 1 < STEPS.length ? tick(i + 1) : finish()), 450);
    };
    tick(0);
  };

  return (
    <>
      <PageHeader
        eyebrow="開発者画面"
        icon={<Gauge size={15} />}
        title="自動チェック"
        description="品質チェックのうち、機械的に確認できる A 区分の項目を自動で確認します。結果はアフロ側のチェックとして品質管理に反映されます。"
        actions={
          <Button variant="contained" startIcon={<Play size={16} />} onClick={run} disabled={running} sx={{ bgcolor: AREA.color, '&:hover': { bgcolor: AREA.color, filter: 'brightness(0.92)' } }}>
            {running ? 'チェック中…' : '自動チェックを実行'}
          </Button>
        }
      />

      <Stack spacing={{ xs: 2.5, md: 3 }}>
        {step !== null && (
          <Surface aria-live="polite">
            <Typography variant="body2" sx={{ fontWeight: 650 }}>{STEPS[step]}（シミュレーション）</Typography>
            <LinearProgress variant="determinate" value={((step + 1) / STEPS.length) * 100} sx={{ mt: 1.5, '& .MuiLinearProgress-bar': { bgcolor: AREA.color } }} />
          </Surface>
        )}

        <Box>
          <SectionTitle
            title="計測スコア"
            sub={<StatusPill tone="neutral" dot={false}>シミュレーション</StatusPill>}
            action={<Typography variant="caption">最終実行: {dev.checksRunAt ? formatDateTime(dev.checksRunAt) : '未実行'}</Typography>}
          />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0,1fr))', md: 'repeat(4, minmax(0,1fr))' }, gap: { xs: 1.5, md: 2 } }}>
            {scores.map((s) => (
              <Surface key={s.label} sx={{ textAlign: 'center' }}>
                <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                  <ProgressRing value={s.value} size={72} stroke={7} color={scoreColor(s.value)} label={`${s.label} ${s.value}`}>
                    <Typography sx={{ fontSize: 20, fontWeight: 750, fontVariantNumeric: 'tabular-nums' }}>{s.value}</Typography>
                  </ProgressRing>
                </Box>
                <Typography variant="caption" sx={{ display: 'block', mt: 1, fontWeight: 650 }}>{s.label}</Typography>
              </Surface>
            ))}
          </Box>
        </Box>

        <Surface>
          <SectionTitle
            title="A 区分の項目"
            sub={<StatusPill tone={checked === items.length ? 'success' : 'warning'}>{checked} / {items.length} 確認済み</StatusPill>}
          />
          <Stack component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }} divider={<Box sx={{ borderTop: `1px solid ${tokens.color.border}` }} />}>
            {items.map((i) => {
              const c = state.qualityChecks[i.id];
              const cat = QUALITY_CATEGORIES.find((x) => x.id === i.categoryId);
              return (
                <Stack component="li" key={i.id} direction="row" spacing={1.5} alignItems="center" sx={{ py: 1.25, minWidth: 0 }}>
                  <Box sx={{ color: c?.afroAt ? tokens.color.success : tokens.color.faint, flexShrink: 0, display: 'flex' }}>
                    {c?.afroAt ? <BadgeCheck size={18} aria-label="確認済み" /> : <Circle size={18} aria-label="未確認" />}
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{i.text}</Typography>
                    <Typography variant="caption" sx={{ display: 'block' }}>
                      {cat ? `${cat.no}. ${cat.title}` : ''}{c?.afroAt ? `・${c.afroBy ?? ''} ${formatDateTime(c.afroAt)}` : '・未確認'}
                    </Typography>
                  </Box>
                </Stack>
              );
            })}
          </Stack>
        </Surface>
      </Stack>
    </>
  );
}
