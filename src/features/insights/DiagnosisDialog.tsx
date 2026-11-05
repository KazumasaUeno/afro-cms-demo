import { Box, Button, Dialog, DialogContent, IconButton, Stack, Typography } from '@mui/material';
import { X, ScanSearch } from 'lucide-react';
import gsap from 'gsap';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { DiagnosisReport } from '@/types';
import { DIAGNOSIS_CATEGORIES, NEXT_DIAGNOSIS_TEMPLATE, TOTAL_DIAGNOSIS_QUESTIONS } from '@/data/insights';
import { useDemo, currentProject } from '@/store/DemoStore';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useBreakpoints } from '@/hooks/useMediaQueries';
import { tokens } from '@/theme/tokens';
import { AiBadge } from '@/components/ui';
import { DiagnosisReportView } from './DiagnosisReport';

/**
 * AIサイト診断（シミュレーション）。
 * GSAP はダイアログ内の進捗バーとカウンタ（内側の要素）だけを動かす。ダイアログ自体は MUI の遷移。
 */
function Scanner({ onDone }: { onDone: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const counter = useRef<HTMLSpanElement>(null);
  const tl = useRef<gsap.core.Timeline | null>(null);
  const done = useRef(false);
  const reduced = useReducedMotion();
  const finish = () => {
    if (done.current) return;
    done.current = true;
    onDone();
  };

  useLayoutEffect(() => {
    if (reduced) {
      finish();
      return;
    }
    const ctx = gsap.context(() => {
      const t = gsap.timeline({ onComplete: finish });
      const proxy = { n: 0 };
      t.to(proxy, {
        n: TOTAL_DIAGNOSIS_QUESTIONS, duration: 5.6, ease: 'none',
        onUpdate: () => { if (counter.current) counter.current.textContent = String(Math.round(proxy.n)); },
      }, 0);
      DIAGNOSIS_CATEGORIES.forEach((_, i) => {
        t.fromTo(`[data-bar="${i}"]`, { scaleX: 0 }, { scaleX: 1, duration: 0.7, ease: 'power2.out' }, i * 0.68);
        t.fromTo(`[data-row="${i}"]`, { opacity: 0.35 }, { opacity: 1, duration: 0.3 }, i * 0.68);
        t.to(`[data-check="${i}"]`, { opacity: 1, scale: 1, duration: 0.25, ease: 'back.out(2)' }, i * 0.68 + 0.6);
      });
      t.to({}, { duration: 0.4 });
      tl.current = t;
    }, root);
    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  return (
    <Box ref={root}>
      <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 2.5 }}>
        <Typography sx={{ fontSize: 44, fontWeight: 750, letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
          <span ref={counter}>0</span>
        </Typography>
        <Typography variant="body2" color="text.secondary">/ {TOTAL_DIAGNOSIS_QUESTIONS}問を診断中</Typography>
      </Stack>
      <Stack spacing={1.25} aria-hidden>
        {DIAGNOSIS_CATEGORIES.map((c, i) => (
          <Box key={c.name} data-row={i} sx={{ display: 'grid', gridTemplateColumns: '112px 1fr 20px', alignItems: 'center', gap: 1.5, opacity: 0.35 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{c.name}</Typography>
            <Box sx={{ height: 8, borderRadius: 99, bgcolor: tokens.color.bgSubtle, overflow: 'hidden' }}>
              <Box data-bar={i} sx={{ height: '100%', background: tokens.aiGradient, transformOrigin: 'left', transform: 'scaleX(0)' }} />
            </Box>
            <Box data-check={i} sx={{ width: 18, height: 18, borderRadius: '50%', bgcolor: tokens.color.success, opacity: 0, transform: 'scale(0.4)' }} />
          </Box>
        ))}
      </Stack>
      <Typography role="status" variant="caption" sx={{ display: 'block', mt: 2 }}>公開サイトの構造・表示速度・導線・コンテンツを8カテゴリーで確認しています（デモ演出）</Typography>
      <Button sx={{ mt: 2 }} onClick={() => tl.current?.progress(1)}>スキップ</Button>
    </Box>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** 指定時は既存レポートを表示（診断は走らせない） */
  report?: DiagnosisReport | null;
}

export function DiagnosisDialog({ open, onClose, report }: Props) {
  const { state, dispatch } = useDemo();
  const { isMobile } = useBreakpoints();
  const [phase, setPhase] = useState<'scan' | 'report'>('scan');
  useEffect(() => {
    if (open) setPhase(report ? 'report' : 'scan');
  }, [open, report]);
  const shown = report ?? state.diagnoses[0];
  const siteName = currentProject(state).siteName;

  return (
    <Dialog open={open} onClose={onClose} fullScreen={isMobile} maxWidth="md" fullWidth aria-labelledby="diag-title">
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ px: 3, pt: 2.5 }}>
        <Box sx={{ width: 36, height: 36, borderRadius: '11px', background: tokens.aiGradient, color: '#fff', display: 'grid', placeItems: 'center' }}><ScanSearch size={18} /></Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography id="diag-title" variant="h4">{phase === 'scan' ? 'AIサイト診断を実行中' : '改善レポート'}</Typography>
          <Typography variant="caption">{siteName}</Typography>
        </Box>
        <AiBadge />
        <IconButton onClick={onClose} aria-label="閉じる"><X size={20} /></IconButton>
      </Stack>
      <DialogContent sx={{ pt: 3 }}>
        {phase === 'scan' && open ? (
          <Scanner
            onDone={() => {
              dispatch({ type: 'addDiagnosis', report: NEXT_DIAGNOSIS_TEMPLATE });
              setPhase('report');
            }}
          />
        ) : shown ? (
          <DiagnosisReportView report={shown} siteName={siteName} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
