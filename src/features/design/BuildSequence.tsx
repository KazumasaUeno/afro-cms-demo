import { Box, Button, Stack, Typography } from '@mui/material';
import { gsap } from 'gsap';
import { Check } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { AiBadge, AiMark } from '@/components/ui';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { BUILD_PAGES } from '@/data/designs';
import { tokens } from '@/theme/tokens';

/** 全ページ構築の演出（GSAP。動かすのは内側のタイルだけ） */
export function BuildSequence({ accent, onDone }: { accent: string; onDone: () => void }) {
  const reduced = useReducedMotion();
  const scope = useRef<HTMLDivElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const done = useRef(false);
  const cb = useRef(onDone);
  cb.current = onDone;
  const finish = () => {
    if (done.current) return;
    done.current = true;
    cb.current();
  };

  useEffect(() => {
    if (reduced) finish();
  }, [reduced]);

  useLayoutEffect(() => {
    if (reduced || !scope.current) return;
    let timer = 0;
    const ctx = gsap.context(() => {
      gsap.set('.bt-tile', { opacity: 0.35 });
      gsap.set('.bt-line', { scaleX: 0, transformOrigin: 'left center' });
      gsap.set('.bt-check', { scale: 0 });
      const tl = gsap.timeline({ delay: 0.2, onComplete: () => { timer = window.setTimeout(finish, 500); } });
      BUILD_PAGES.forEach((_, i) => {
        const at = i * 0.42;
        tl.to(`.bt-${i}`, { opacity: 1, y: -2, duration: 0.25 }, at)
          .to(`.bt-${i} .bt-line`, { scaleX: 1, duration: 0.4, stagger: 0.08, ease: 'power2.out' }, at)
          .to(`.bt-${i} .bt-check`, { scale: 1, duration: 0.25, ease: 'back.out(2.4)' }, at + 0.5)
          .call(() => { if (countRef.current) countRef.current.textContent = String(i + 1); }, [], at + 0.5);
      });
      tlRef.current = tl;
    }, scope);
    return () => {
      window.clearTimeout(timer);
      tlRef.current = null;
      ctx.revert();
    };
  }, [reduced]);

  return (
    <Box ref={scope}>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2.5 }}>
        <AiMark size={40} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center"><Typography variant="h3" component="h2">全ページを構築しています</Typography><AiBadge /></Stack>
          <Typography variant="body2" color="text.secondary">採用デザインのルールを、承認済みサイトマップの全ページへ展開しています</Typography>
        </Box>
        <Typography aria-live="polite" sx={{ fontSize: 28, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
          <span ref={countRef}>{reduced ? BUILD_PAGES.length : 0}</span>
          <Box component="span" sx={{ color: tokens.color.muted, fontSize: 18 }}> / {BUILD_PAGES.length}</Box>
        </Typography>
      </Stack>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)' }, gap: 1.5 }}>
        {BUILD_PAGES.map((p, i) => (
          <Box key={p} className={`bt-tile bt-${i}`} sx={{ position: 'relative', p: 1.5, borderRadius: 3, border: `1px solid ${tokens.color.border}`, bgcolor: tokens.color.surface }}>
            <Box sx={{ height: 44, borderRadius: 2, mb: 1, bgcolor: tokens.color.bgSubtle, overflow: 'hidden' }}>
              <Box className="bt-line" sx={{ height: '100%', bgcolor: accent, opacity: 0.85 }} />
            </Box>
            {[80, 55].map((w) => (
              <Box key={w} sx={{ height: 6, width: `${w}%`, borderRadius: 1, bgcolor: tokens.color.bgSubtle, mb: 0.75, overflow: 'hidden' }}>
                <Box className="bt-line" sx={{ height: '100%', bgcolor: tokens.color.borderStrong }} />
              </Box>
            ))}
            <Typography sx={{ fontSize: 12.5, fontWeight: 650, mt: 1 }} noWrap>{p}</Typography>
            <Box className="bt-check" sx={{ position: 'absolute', top: 8, right: 8, width: 20, height: 20, borderRadius: '50%', bgcolor: tokens.color.success, color: tokens.color.onSuccess, display: 'grid', placeItems: 'center' }}>
              <Check size={12} strokeWidth={3.5} />
            </Box>
          </Box>
        ))}
      </Box>
      <Stack direction="row" justifyContent="flex-end" sx={{ mt: 2 }}>
        <Button variant="text" onClick={() => { tlRef.current?.progress(1); finish(); }}>演出をスキップ</Button>
      </Stack>
    </Box>
  );
}
