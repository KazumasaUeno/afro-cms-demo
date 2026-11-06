import { Box, Button, ButtonBase, Collapse, LinearProgress, Stack, Typography } from '@mui/material';
import { BadgeCheck, ChevronDown, Circle, Gauge, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { PageHeader, ProgressRing, SectionTitle, StatusPill, Surface } from '@/components/ui';
import { useDemo, devState } from '@/store/DemoStore';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useToast } from '@/hooks/useToast';
import { formatDateTime } from '@/services/time';
import { QUALITY_CATEGORIES, QUALITY_ITEMS } from '@/data/quality';
import { tokens } from '@/theme/tokens';
import type { QualityItem } from '@/types';
import { DevMono } from './DevMono';

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

type Checks = ReturnType<typeof useDemo>['state']['qualityChecks'];

export default function DevChecksPage() {
  const { state, dispatch } = useDemo();
  const reduced = useReducedMotion();
  const toast = useToast();
  const dev = devState(state);
  const [step, setStep] = useState<number | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const items = QUALITY_ITEMS.filter((i) => i.priority === 'A');
  const unchecked = items.filter((i) => !state.qualityChecks[i.id]?.afroAt);
  const done = items.filter((i) => state.qualityChecks[i.id]?.afroAt);
  const checked = done.length;
  const scores = dev.checksRunAt ? SCORES_AFTER : SCORES_BEFORE;
  const running = step !== null;
  /** null = 既定（全件確認済みなら開く）。ユーザーが押したらその値 */
  const [doneOpenPref, setDoneOpenPref] = useState<boolean | null>(null);
  const doneOpen = doneOpenPref ?? unchecked.length === 0;

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
          <Button variant="contained" startIcon={<Play size={16} />} onClick={run} disabled={running} sx={{ minHeight: 44 }}>
            {running ? 'チェック中…' : dev.checksRunAt ? 'もう一度実行する' : '自動チェックを実行する'}
          </Button>
        }
      />

      <Stack spacing={{ xs: 2.5, md: 3 }}>
        {step !== null && (
          <Surface aria-live="polite">
            <Typography variant="body2" sx={{ fontWeight: 650 }}>{STEPS[step]}（シミュレーション）</Typography>
            <LinearProgress variant="determinate" value={((step + 1) / STEPS.length) * 100} sx={{ mt: 1.5 }} aria-label="チェックの進み具合" />
          </Surface>
        )}

        <Box>
          <SectionTitle
            title="計測スコア"
            sub={
              <>
                <Typography variant="caption" sx={{ fontWeight: 650 }}>{dev.checksRunAt ? '最新の計測' : '初期計測'}</Typography>
                <StatusPill tone="neutral" dot={false}>シミュレーション</StatusPill>
              </>
            }
            action={<Typography variant="caption" sx={{ textAlign: 'right' }}>最終実行: {dev.checksRunAt ? <DevMono size="sm">{formatDateTime(dev.checksRunAt)}</DevMono> : '未実行'}</Typography>}
          />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0,1fr))', md: 'repeat(4, minmax(0,1fr))' }, gap: { xs: 1.5, md: 2 } }}>
            {scores.map((s, idx) => {
              const before = SCORES_BEFORE[idx]?.value ?? s.value;
              const diff = s.value - before;
              return (
                <Surface key={s.label} sx={{ textAlign: 'center' }} data-testid="score-card">
                  <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                    <ProgressRing value={s.value} size={72} stroke={7} color={scoreColor(s.value)} label={`${s.label} ${s.value}`}>
                      <Typography sx={{ fontSize: 20, fontWeight: 750, fontVariantNumeric: 'tabular-nums' }}>{s.value}</Typography>
                    </ProgressRing>
                  </Box>
                  <Typography variant="caption" sx={{ display: 'block', mt: 1, fontWeight: 650 }}>{s.label}</Typography>
                  {dev.checksRunAt && (
                    <Stack direction="row" useFlexGap flexWrap="wrap" justifyContent="center" alignItems="center" sx={{ gap: 0.75, mt: 0.75 }}>
                      <DevMono size="sm">{before} → {s.value}</DevMono>
                      {diff !== 0 && <StatusPill tone={diff > 0 ? 'success' : 'warning'} dot={false}>{diff > 0 ? `+${diff}` : `−${-diff}`}</StatusPill>}
                    </Stack>
                  )}
                </Surface>
              );
            })}
          </Box>
        </Box>

        <Surface>
          <SectionTitle title="A 区分の項目" />
          <Typography id="a-progress-label" variant="body2" sx={{ fontWeight: 650, fontVariantNumeric: 'tabular-nums' }}>
            {checked} / {items.length} 項目を確認済み
          </Typography>
          <LinearProgress
            variant="determinate" value={items.length ? (checked / items.length) * 100 : 0}
            aria-labelledby="a-progress-label"
            sx={{ mt: 1, mb: 2.5, height: 6, borderRadius: 3 }}
          />

          <Typography variant="h6" component="h3" sx={{ fontVariantNumeric: 'tabular-nums' }}>未確認（{unchecked.length}）</Typography>
          {unchecked.length === 0 ? (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 1.25 }} data-testid="a-all-done">
              <BadgeCheck size={18} color={tokens.color.success} aria-hidden />
              <Typography variant="body2" sx={{ fontWeight: 600 }}>A 区分はすべて確認済みです</Typography>
            </Stack>
          ) : (
            <ItemList items={unchecked} checks={state.qualityChecks} />
          )}

          <ButtonBase
            onClick={() => setDoneOpenPref(!doneOpen)}
            aria-expanded={doneOpen}
            aria-controls="a-done-list"
            sx={{
              mt: 1.5, width: '100%', minHeight: 44, justifyContent: 'space-between', textAlign: 'left',
              borderTop: `1px solid ${tokens.color.border}`, pt: 1,
              '&.Mui-focusVisible': { boxShadow: tokens.shadow.focus, borderRadius: `${tokens.radius.sm}px` },
            }}
          >
            <Typography variant="h6" component="span" sx={{ fontVariantNumeric: 'tabular-nums' }}>確認済み（{done.length}）</Typography>
            <Box component="span" sx={{ display: 'flex', color: tokens.color.muted, transform: doneOpen ? 'rotate(180deg)' : 'none', transition: reduced ? 'none' : `transform .2s ${tokens.motion.easeCss}` }}>
              <ChevronDown size={18} aria-hidden />
            </Box>
          </ButtonBase>
          <Collapse in={doneOpen} timeout={reduced ? 0 : 'auto'} id="a-done-list" data-testid="a-done-collapse">
            {done.length === 0
              ? <Typography variant="caption" sx={{ display: 'block', py: 1.25 }}>まだ確認済みの項目はありません</Typography>
              : <ItemList items={done} checks={state.qualityChecks} />}
          </Collapse>
        </Surface>
      </Stack>
    </>
  );
}

function ItemList({ items, checks }: { items: QualityItem[]; checks: Checks }) {
  return (
    <Stack component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {items.map((i, idx) => {
        const c = checks[i.id];
        const cat = QUALITY_CATEGORIES.find((x) => x.id === i.categoryId);
        return (
          <Stack component="li" key={i.id} direction="row" spacing={1.5} alignItems="center" sx={{ py: 1.25, minWidth: 0, borderTop: idx ? `1px solid ${tokens.color.border}` : 'none' }}>
            <Box sx={{ color: c?.afroAt ? tokens.color.success : tokens.color.faint, flexShrink: 0, display: 'flex' }}>
              {c?.afroAt ? <BadgeCheck size={18} aria-label="確認済み" /> : <Circle size={18} aria-label="未確認" />}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{i.text}</Typography>
              <Typography variant="caption" sx={{ display: 'block' }}>
                {cat ? `${cat.no}. ${cat.title}` : ''}
                {c?.afroAt ? <>・{c.afroBy ?? ''} <DevMono size="sm">{formatDateTime(c.afroAt)}</DevMono></> : '・未確認'}
              </Typography>
            </Box>
          </Stack>
        );
      })}
    </Stack>
  );
}
