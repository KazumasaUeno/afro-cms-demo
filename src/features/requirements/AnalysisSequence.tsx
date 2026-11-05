import { Box, Button, Stack, Typography } from '@mui/material';
import { gsap } from 'gsap';
import { Check, FileSearch, Layers, LineChart, ScrollText } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { ANALYSIS_STEPS } from '@/data/requirements';
import { AiBadge, AiMark, Surface } from '@/components/ui';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { tokens } from '@/theme/tokens';

const ICONS = [FileSearch, LineChart, Layers, ScrollText];

/** 各工程で「見つかったもの」として流す短い文（演出用の固定文言） */
const FINDINGS: string[][] = [
  ['24 ページを取得', 'メニュー項目 21 個', '画像 186 枚（4.2MB）'],
  ['競合 2 サイトと比較', 'LCP 4.8 秒（目標 2.5 秒）', 'スマホ比率 72%'],
  ['課題を 12 項目に分類', '優先度 高 3 件'],
  ['改善提案 6 件', '新しいサイト構成 案'],
];

/**
 * AI 分析の演出（GSAP タイムライン）。
 * GSAP が動かすのはこのコンポーネント内の要素だけ（外側のカード出現は Motion）。
 */
export function AnalysisSequence({ hostname, onDone }: { hostname: string; onDone: () => void }) {
  const reduced = useReducedMotion();
  const scope = useRef<HTMLDivElement>(null);
  const pctRef = useRef<HTMLSpanElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDoneRef.current();
  };

  useEffect(() => {
    if (reduced) finish();
  }, [reduced]);

  useLayoutEffect(() => {
    if (reduced || !scope.current) return;
    let timer = 0;
    const ctx = gsap.context(() => {
      gsap.set('.an-row', { opacity: 0.38 });
      gsap.set('.an-fill', { scaleX: 0, transformOrigin: 'left center' });
      gsap.set('.an-check', { scale: 0, opacity: 0 });
      gsap.set('.an-find', { opacity: 0, y: 6 });
      gsap.set('.an-total', { scaleX: 0, transformOrigin: 'left center' });

      const tl = gsap.timeline({
        delay: 0.2,
        onUpdate: () => {
          if (pctRef.current) pctRef.current.textContent = `${Math.round(tl.progress() * 100)}%`;
        },
        onComplete: () => {
          timer = window.setTimeout(finish, 450);
        },
      });
      tl.to('.an-total', { scaleX: 1, duration: 5.2, ease: 'none' }, 0);
      ANALYSIS_STEPS.forEach((_, i) => {
        const at = i * 1.3;
        tl.to(`.an-row-${i}`, { opacity: 1, duration: 0.25 }, at)
          .to(`.an-row-${i} .an-fill`, { scaleX: 1, duration: 1.1, ease: 'power2.inOut' }, at)
          .to(`.an-row-${i} .an-find`, { opacity: 1, y: 0, duration: 0.3, stagger: 0.28 }, at + 0.2)
          .to(`.an-row-${i} .an-check`, { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(2.2)' }, at + 1.1);
      });
      tlRef.current = tl;
    }, scope);
    return () => {
      window.clearTimeout(timer);
      tlRef.current = null;
      ctx.revert();
    };
  }, [reduced]);

  const skip = () => {
    tlRef.current?.progress(1);
    finish();
  };

  return (
    <Surface padding={{ xs: 2.5, md: 4 }}>
      <Box ref={scope}>
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}>
          <AiMark size={44} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
              <Typography variant="h3" component="h2">AIが分析しています</Typography>
              <AiBadge />
            </Stack>
            <Typography variant="body2" color="text.secondary" noWrap>{hostname} とご回答内容をもとに、改善提案書をつくっています</Typography>
          </Box>
          <Typography aria-live="polite" sx={{ fontSize: { xs: 24, md: 32 }, fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.03em' }}>
            <span ref={pctRef}>{reduced ? '100%' : '0%'}</span>
          </Typography>
        </Stack>

        <Box sx={{ height: 4, borderRadius: 2, bgcolor: tokens.color.bgSubtle, overflow: 'hidden', mb: 3 }}>
          <Box className="an-total" sx={{ height: '100%', background: tokens.aiGradient, borderRadius: 2 }} />
        </Box>

        <Stack spacing={1.5}>
          {ANALYSIS_STEPS.map((s, i) => {
            const Icon = ICONS[i];
            return (
              <Box
                key={s.key}
                className={`an-row an-row-${i}`}
                sx={{ display: 'grid', gridTemplateColumns: '44px 1fr', gap: 2, p: 2, borderRadius: 3, border: `1px solid ${tokens.color.border}`, bgcolor: tokens.color.surface }}
              >
                <Box sx={{ position: 'relative', width: 44, height: 44, borderRadius: 3, bgcolor: tokens.color.primarySoft, color: tokens.color.primary, display: 'grid', placeItems: 'center' }}>
                  <Icon size={20} />
                  <Box className="an-check" sx={{ position: 'absolute', right: -5, bottom: -5, width: 20, height: 20, borderRadius: '50%', bgcolor: tokens.color.success, color: '#fff', display: 'grid', placeItems: 'center', border: '2px solid #fff' }}>
                    <Check size={11} strokeWidth={3.5} />
                  </Box>
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Stack direction="row" spacing={1} alignItems="baseline" sx={{ mb: 0.25 }}>
                    <Typography variant="overline" sx={{ color: tokens.color.primary }}>STEP {i + 1}</Typography>
                    <Typography variant="h5" component="h3">{s.label}</Typography>
                  </Stack>
                  <Typography variant="body2" color="text.secondary">{s.detail}</Typography>
                  <Box sx={{ height: 3, borderRadius: 2, bgcolor: tokens.color.bgSubtle, overflow: 'hidden', my: 1.25 }}>
                    <Box className="an-fill" sx={{ height: '100%', bgcolor: tokens.color.primary, borderRadius: 2 }} />
                  </Box>
                  <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
                    {FINDINGS[i].map((f) => (
                      <Box key={f} className="an-find" sx={{ px: 1, py: 0.25, borderRadius: '7px', bgcolor: tokens.color.bgSubtle, fontSize: 12, fontWeight: 600, color: tokens.color.inkSoft }}>
                        {f}
                      </Box>
                    ))}
                  </Stack>
                </Box>
              </Box>
            );
          })}
        </Stack>

        <Stack direction="row" justifyContent="flex-end" sx={{ mt: 2.5 }}>
          <Button variant="text" onClick={skip}>演出をスキップ</Button>
        </Stack>
      </Box>
    </Surface>
  );
}
