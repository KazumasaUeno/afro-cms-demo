import { Box, Button, ButtonBase, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import { useForceLightMode } from '@/theme/ThemeMode';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Check, ChevronLeft, ChevronRight, Maximize2, Minimize2, Play, RotateCcw, X } from 'lucide-react';
import gsap from 'gsap';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDemo } from '@/store/DemoStore';
import { STAGES } from '@/data/projects';
import { ANALYSIS_STEPS, PROPOSAL_LIBRARY } from '@/data/requirements';
import { DESIGN_VARIANTS } from '@/data/designs';
import { MONTHLY_METRICS, RENEWAL_MONTH } from '@/data/insights';
import { AiBadge, ProgressRing, StatusPill } from '@/components/ui';
import { LogoMark } from '@/components/layout/Logo';
import { ResetDemoDialog } from '@/components/layout/ResetDemoDialog';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { tokens } from '@/theme/tokens';
import { LANDSCAPE_PHONE } from '@/theme/media';
import type { DesignId } from '@/types';

const c = tokens.color;

function SlideFrame({ eyebrow, title, lead, children }: { eyebrow: string; title: ReactNode; lead?: ReactNode; children?: ReactNode }) {
  return (
    <Box sx={{ maxWidth: 1120, mx: 'auto', width: '100%' }}>
      <Typography variant="overline" sx={{ color: c.primary, fontSize: 12 }}>{eyebrow}</Typography>
      <Typography component="h2" sx={{ fontSize: { xs: 26, md: 40 }, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.2, mt: 0.5 }}>{title}</Typography>
      {lead && <Typography sx={{ fontSize: { xs: 15, md: 18 }, color: c.muted, mt: 1.5, maxWidth: 760, lineHeight: 1.7 }}>{lead}</Typography>}
      {children && <Box sx={{ mt: { xs: 3, md: 5 } }}>{children}</Box>}
    </Box>
  );
}

/* 1. タイトル */
function TitleSlide() {
  return (
    <Box sx={{ maxWidth: 1000, mx: 'auto', textAlign: 'center' }}>
      <Box sx={{ display: 'inline-flex', mb: 3 }}><LogoMark size={64} /></Box>
      <Typography variant="overline" sx={{ display: 'block', color: c.primary, fontSize: 13 }}>アフロCMS — AI Web Production Platform</Typography>
      <Typography component="h1" sx={{ fontSize: { xs: 34, md: 64 }, fontWeight: 750, letterSpacing: '-0.04em', lineHeight: 1.12, mt: 2 }}>
        Webサイトを<br />作る<Box component="span" sx={{ background: tokens.aiGradient, WebkitBackgroundClip: 'text', color: 'transparent' }}>「まえ・なか・あと」</Box>を<br />ひとつに。
      </Typography>
      <Typography sx={{ fontSize: { xs: 15, md: 19 }, color: c.muted, mt: 3, lineHeight: 1.8 }}>
        営業・要件定義・制作・品質管理・運用・改善まで。<br />AIが寄り添い、顧客と同じ画面で承認しながら進めます。
      </Typography>
    </Box>
  );
}

/* 2. 5段階 */
function FlowSlide() {
  const groups = ['まえ', 'なか', 'なか', 'あと', 'あと'];
  return (
    <SlideFrame eyebrow="全体の流れ" title="5つの段階を、ひとつのプラットフォームで" lead="段階ごとに「承認」を挟むので、顧客と制作者の認識がずれません。">
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(5, 1fr)' }, gap: 2 }}>
        {STAGES.map((s, i) => (
          <motion.div key={s.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.1, duration: 0.4, ease: tokens.motion.ease }}>
            <Box sx={{ p: 2.5, borderRadius: 4, bgcolor: '#fff', border: `1px solid ${c.border}`, boxShadow: tokens.shadow.sm, height: '100%' }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Box sx={{ width: 40, height: 40, borderRadius: '12px', background: tokens.aiGradient, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 750 }}>{s.no}</Box>
                <StatusPill tone="neutral" dot={false}>作る{groups[i]}</StatusPill>
              </Stack>
              <Typography sx={{ fontSize: 20, fontWeight: 700, mt: 2 }}>{s.label}</Typography>
              <Typography variant="overline">{s.en}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{s.description}</Typography>
            </Box>
          </motion.div>
        ))}
      </Box>
    </SlideFrame>
  );
}

/* 3. AI要件定義（GSAP タイムラインは内側の要素だけを動かす） */
function AnalysisSlide({ reduced }: { reduced: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const [done, setDone] = useState(reduced);
  const [run, setRun] = useState(0);

  useLayoutEffect(() => {
    if (!root.current) return;
    if (reduced) {
      setDone(true);
      return;
    }
    setDone(false);
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ onComplete: () => setDone(true) });
      ANALYSIS_STEPS.forEach((_, i) => {
        tl.fromTo(`[data-row="${i}"]`, { opacity: 0.35 }, { opacity: 1, duration: 0.2 })
          .fromTo(`[data-bar="${i}"]`, { scaleX: 0 }, { scaleX: 1, duration: 0.7, ease: 'power2.inOut' }, '<')
          .fromTo(`[data-check="${i}"]`, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.25, ease: 'back.out(2)' });
      });
    }, root);
    return () => ctx.revert();
  }, [reduced, run]);

  return (
    <SlideFrame eyebrow="① 要件定義" title="URLを入れるだけで、AIが課題を整理" lead="13項目84問のヒアリングを 1 問ずつ入力（CSV で一括も可）。現行サイトと競合を分析し、改善提案書のたたき台を数分で作ります。">
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1.2fr' }, gap: 3 }}>
        <Box ref={root} sx={{ p: 3, borderRadius: 4, bgcolor: '#fff', border: `1px solid ${c.border}`, boxShadow: tokens.shadow.sm }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Typography sx={{ fontWeight: 700 }}>AI分析</Typography>
            <AiBadge />
          </Stack>
          <Stack spacing={2}>
            {ANALYSIS_STEPS.map((s, i) => (
              <Box key={s.key} data-row={i}>
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <Box data-check={i} sx={{ width: 22, height: 22, borderRadius: '50%', bgcolor: c.success, color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}><Check size={13} strokeWidth={3} /></Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 650 }}>{s.label}</Typography>
                    <Typography variant="caption">{s.detail}</Typography>
                  </Box>
                </Stack>
                <Box sx={{ height: 4, borderRadius: 2, bgcolor: c.bgSubtle, mt: 1, overflow: 'hidden' }}>
                  <Box data-bar={i} sx={{ height: '100%', background: tokens.aiGradient, transformOrigin: 'left' }} />
                </Box>
              </Box>
            ))}
          </Stack>
          <Button size="small" startIcon={<Play size={14} />} onClick={() => setRun((r) => r + 1)} sx={{ mt: 2 }} disabled={reduced}>もう一度再生</Button>
        </Box>
        <Stack spacing={1.5} aria-live="polite">
          {(done ? PROPOSAL_LIBRARY.slice(0, 4) : []).map((pp, i) => (
            <motion.div key={pp.id} initial={reduced ? false : { opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1, duration: 0.35, ease: tokens.motion.ease }}>
              <Box sx={{ p: 2, borderRadius: 3, bgcolor: '#fff', border: `1px solid ${c.border}`, display: 'flex', gap: 1.5 }}>
                <StatusPill tone={pp.priority === 'high' ? 'danger' : 'warning'}>{pp.priority === 'high' ? '優先度 高' : '優先度 中'}</StatusPill>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>{pp.title}</Typography>
                  <Typography variant="caption" sx={{ color: c.success, fontWeight: 600 }}>{pp.impact}</Typography>
                </Box>
              </Box>
            </motion.div>
          ))}
          {!done && <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>分析が終わると、改善提案がここに並びます…</Typography>}
        </Stack>
      </Box>
    </SlideFrame>
  );
}

/* 4. デザイン案（簡易のHTML/CSSモック） */
function MiniSite({ id }: { id: DesignId }) {
  const v = DESIGN_VARIANTS.find((d) => d.id === id)!;
  const [bg, ink, accent, sub] = v.palette;
  if (id === 'minimal') {
    return (
      <Box sx={{ bgcolor: bg, color: ink, p: 2, height: '100%' }}>
        <Stack direction="row" justifyContent="space-between" sx={{ fontSize: 9, letterSpacing: '0.2em' }}><span>MINAMO</span><span>SHOP　STORY</span></Stack>
        <Box sx={{ mt: 3, fontFamily: 'serif', fontSize: 18, lineHeight: 1.5 }}>一杯から、<br />日常を少し特別に。</Box>
        <Box sx={{ mt: 2, height: 70, bgcolor: sub, borderRadius: 0.5 }} />
        <Box sx={{ mt: 1.5, fontSize: 9, borderBottom: `1px solid ${accent}`, display: 'inline-block', color: accent }}>オンラインで購入 →</Box>
      </Box>
    );
  }
  if (id === 'creative') {
    return (
      <Box sx={{ bgcolor: bg, color: ink, p: 2, height: '100%', position: 'relative', overflow: 'hidden' }}>
        <Box sx={{ position: 'absolute', right: -30, top: -20, width: 120, height: 120, borderRadius: '50%', bgcolor: sub, opacity: 0.6 }} />
        <Box sx={{ fontSize: 9, fontWeight: 800 }}>MINAMO★COFFEE</Box>
        <Box sx={{ mt: 2.5, fontSize: 26, fontWeight: 900, lineHeight: 1, position: 'relative' }}>BREW<br /><Box component="span" sx={{ color: accent }}>YOUR</Box><br />DAY.</Box>
        <Stack direction="row" spacing={0.75} sx={{ mt: 2 }}>
          <Box sx={{ flex: 2, height: 46, bgcolor: accent, borderRadius: 2 }} /><Box sx={{ flex: 1, height: 46, bgcolor: ink, borderRadius: 2 }} />
        </Stack>
      </Box>
    );
  }
  return (
    <Box sx={{ bgcolor: bg, color: ink, p: 2, height: '100%', textAlign: 'center' }}>
      <Box sx={{ fontSize: 9, letterSpacing: '0.3em', color: accent }}>MINAMO COFFEE</Box>
      <Box sx={{ mt: 1.5, height: 64, bgcolor: sub, borderRadius: 1, border: `1px solid ${accent}55` }} />
      <Box sx={{ mt: 1.5, fontFamily: 'serif', fontSize: 16 }}>想いを届ける、<br />特別な一杯を。</Box>
      <Box sx={{ mt: 1.5, display: 'inline-block', px: 1.5, py: 0.5, border: `1px solid ${accent}`, color: accent, fontSize: 9 }}>法人ギフトを見る</Box>
    </Box>
  );
}

function DesignSlide() {
  const [sel, setSel] = useState<DesignId>('creative');
  return (
    <SlideFrame eyebrow="② 制作" title="要件から、3つのデザイン案を生成" lead="色違いではなく、レイアウト・書体・構成まで異なる3案。顧客と並べて比べ、その場で採用できます。（クリックで選択）">
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2.5 }}>
        {DESIGN_VARIANTS.map((d) => {
          const on = sel === d.id;
          return (
            <ButtonBase key={d.id} onClick={() => setSel(d.id)} aria-pressed={on} sx={{ display: 'block', textAlign: 'left', borderRadius: 4, border: `2px solid ${on ? c.primary : c.border}`, bgcolor: '#fff', overflow: 'hidden', boxShadow: on ? tokens.shadow.lg : tokens.shadow.sm, transform: on ? 'translateY(-4px)' : 'none', transition: `all .24s ${tokens.motion.easeCss}` }}>
              <Box sx={{ height: { xs: 180, md: 210 } }}><MiniSite id={d.id} /></Box>
              <Box sx={{ p: 2, borderTop: `1px solid ${c.border}` }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography sx={{ fontWeight: 700 }}>{d.label}：{d.name}</Typography>
                  {on && <StatusPill tone="primary">選択中</StatusPill>}
                </Stack>
                <Typography variant="caption">{d.tagline}</Typography>
              </Box>
            </ButtonBase>
          );
        })}
      </Box>
    </SlideFrame>
  );
}

/* 5. ビフォーアフター */
function BeforeAfterSlide() {
  const { state } = useDemo();
  const firstLevel = (v: 'before' | 'after') => {
    const g = state.sitemap[v];
    const home = g.nodes.find((n) => n.data.kind === 'home');
    const ids = g.edges.filter((e) => e.source === home?.id).map((e) => e.target);
    return g.nodes.filter((n) => ids.includes(n.id));
  };
  const idx = MONTHLY_METRICS.findIndex((m) => m.month === RENEWAL_MONTH);
  const before = MONTHLY_METRICS.slice(0, idx);
  const avg = (k: 'sessions' | 'inquiries' | 'cvr') => before.reduce((s, m) => s + m[k], 0) / Math.max(1, before.length);
  const last = MONTHLY_METRICS[MONTHLY_METRICS.length - 1];
  const kpis = [
    { label: '月間アクセス', b: Math.round(avg('sessions')).toLocaleString(), a: last.sessions.toLocaleString() },
    { label: '問い合わせ', b: `${Math.round(avg('inquiries'))}件`, a: `${last.inquiries}件` },
    { label: 'CVR', b: `${avg('cvr').toFixed(2)}%`, a: `${last.cvr.toFixed(2)}%` },
  ];
  const Col = ({ v, title }: { v: 'before' | 'after'; title: string }) => (
    <Box sx={{ p: 2.5, borderRadius: 4, bgcolor: v === 'after' ? '#fff' : c.bgSubtle, border: `1px solid ${v === 'after' ? c.primary : c.border}` }}>
      <StatusPill tone={v === 'after' ? 'primary' : 'neutral'}>{title}</StatusPill>
      <Box sx={{ mt: 2, mx: 'auto', width: 'fit-content', px: 2, py: 0.75, borderRadius: 2, bgcolor: c.ink, color: '#fff', fontSize: 13, fontWeight: 700 }}>トップ</Box>
      <Stack direction="row" sx={{ mt: 2, flexWrap: 'wrap', gap: 1, justifyContent: 'center' }}>
        {firstLevel(v).map((n) => (
          <Box key={n.id} sx={{ px: 1.25, py: 0.75, borderRadius: 2, fontSize: 12, fontWeight: 600, bgcolor: n.data.kind === 'cta' ? c.primary : n.data.kind === 'new' ? c.accentSoft : '#fff', color: n.data.kind === 'cta' ? '#fff' : c.ink, border: `1px solid ${c.border}` }}>
            {n.data.label}
          </Box>
        ))}
      </Stack>
    </Box>
  );
  return (
    <SlideFrame eyebrow="ビフォーアフター" title="迷わない構造と、数字で見える成果" lead="目的別の入口に再編し、問い合わせまでの距離を短く。リニューアル前後の推移を同じ画面で確認できます（デモデータ）。">
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2.5 }}>
        <Col v="before" title="Before：現行サイト" />
        <Col v="after" title="After：改善後" />
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.5, mt: 2.5 }}>
        {kpis.map((k) => (
          <Box key={k.label} sx={{ p: 2, borderRadius: 3, bgcolor: '#fff', border: `1px solid ${c.border}` }}>
            <Typography variant="caption">{k.label}</Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'baseline' }} spacing={{ sm: 1 }}>
              <Typography variant="body2" sx={{ color: c.faint, textDecoration: 'line-through' }}>{k.b}</Typography>
              <Typography sx={{ fontSize: { xs: 18, md: 26 }, fontWeight: 750, color: c.success }}>{k.a}</Typography>
            </Stack>
          </Box>
        ))}
      </Box>
    </SlideFrame>
  );
}

/* 6. 改善 */
function ImproveSlide() {
  const { state } = useDemo();
  const latest = state.diagnoses[0];
  const cycles = ['リニューアル', '4か月後', '8か月後', '12か月後'];
  return (
    <SlideFrame eyebrow="⑤ 改善" title="4か月ごとに、AIが自動で改善提案" lead="8カテゴリー60問でサイトを診断し、改善レポートを自動でお届け。実数値を含む詳しい分析もご相談いただけます。">
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '280px 1fr' }, gap: 3, alignItems: 'center' }}>
        <Stack alignItems="center" spacing={1.5} sx={{ p: 3, borderRadius: 4, bgcolor: '#fff', border: `1px solid ${c.border}` }}>
          <ProgressRing value={latest?.score ?? 0} size={160} stroke={12} color={c.accent} label="AI診断スコア">
            <Box sx={{ textAlign: 'center' }}><Box sx={{ fontSize: 40, fontWeight: 750 }}>{latest?.score ?? '—'}</Box><Box sx={{ fontSize: 12, color: c.muted }}>/ 100</Box></Box>
          </ProgressRing>
          <AiBadge label="診断結果はデモデータ" />
        </Stack>
        <Box>
          <Stack direction="row" sx={{ mb: 3 }}>
            {cycles.map((t, i) => (
              <Box key={t} sx={{ flex: 1, textAlign: 'center' }}>
                <Stack direction="row" alignItems="center">
                  <Box sx={{ flex: 1, height: 2, bgcolor: i === 0 ? 'transparent' : c.accent }} />
                  <Box sx={{ width: 14, height: 14, borderRadius: '50%', bgcolor: c.accent, boxShadow: `0 0 0 4px ${c.accentSoft}` }} />
                  <Box sx={{ flex: 1, height: 2, bgcolor: i === cycles.length - 1 ? 'transparent' : c.accent }} />
                </Stack>
                <Typography variant="caption" sx={{ display: 'block', mt: 1, fontWeight: 600 }}>{t}</Typography>
              </Box>
            ))}
          </Stack>
          <Stack spacing={1}>
            {(latest?.findings ?? []).slice(0, 3).map((f) => (
              <Box key={f.title} sx={{ p: 1.75, borderRadius: 3, bgcolor: '#fff', border: `1px solid ${c.border}` }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>{f.title}</Typography>
                <Typography variant="caption">{f.detail}</Typography>
              </Box>
            ))}
          </Stack>
        </Box>
      </Box>
    </SlideFrame>
  );
}

/* 7. クロージング */
function ClosingSlide({ onReset }: { onReset: () => void }) {
  const navigate = useNavigate();
  return (
    <Box sx={{ maxWidth: 820, mx: 'auto', textAlign: 'center' }}>
      <Typography component="h2" sx={{ fontSize: { xs: 30, md: 52 }, fontWeight: 750, letterSpacing: '-0.035em', lineHeight: 1.2 }}>
        「作って終わり」から、<br />「育て続ける」Webサイトへ。
      </Typography>
      <Typography sx={{ fontSize: { xs: 15, md: 18 }, color: c.muted, mt: 3 }}>実際に操作して、使い心地をお確かめください。</Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="center" sx={{ mt: 4 }}>
        <Button variant="contained" size="large" endIcon={<ArrowRight size={18} />} onClick={() => navigate('/')}>デモを触る</Button>
        <Button variant="outlined" size="large" startIcon={<RotateCcw size={17} />} onClick={onReset}>デモデータを初期化</Button>
      </Stack>
    </Box>
  );
}

const TITLES = ['はじめに', '全体の流れ', 'AI要件定義', 'デザイン案', 'ビフォーアフター', 'AI改善診断', 'おわりに'];

/** 営業プレゼンモード（全画面のスライド） */
export default function PresentPage() {
  // プレゼンモードはライト固定（プロジェクター・顧客に見せる画面。白いカードを前提にした配色のため）
  useForceLightMode();
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(1);
  const [full, setFull] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const total = TITLES.length;

  const go = useCallback((n: number) => {
    setIndex((cur) => {
      const next = Math.max(0, Math.min(total - 1, n));
      setDir(next >= cur ? 1 : -1);
      return next;
    });
  }, [total]);

  useEffect(() => {
    const onFs = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (resetOpen) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || (e.key === ' ' && t?.tagName !== 'BUTTON')) {
        e.preventDefault();
        go(index + 1);
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        go(index - 1);
      } else if (e.key === 'Escape' && !document.fullscreenElement) {
        navigate('/');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, index, navigate, resetOpen]);

  const toggleFull = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      /* 全画面に対応しない環境ではそのまま表示する */
    }
  };

  const slides = [
    <TitleSlide key="t" />, <FlowSlide key="f" />, <AnalysisSlide key="a" reduced={reduced} />, <DesignSlide key="d" />,
    <BeforeAfterSlide key="b" />, <ImproveSlide key="i" />, <ClosingSlide key="c" onReset={() => setResetOpen(true)} />,
  ];

  return (
    <Box sx={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', bgcolor: c.bg, backgroundImage: `radial-gradient(60% 50% at 100% 0%, ${c.accentSoft} 0%, transparent 70%), radial-gradient(50% 50% at 0% 100%, ${c.primarySoft} 0%, transparent 70%)` }}>
      <Stack component="header" direction="row" alignItems="center" spacing={1.5} sx={{ px: { xs: 2, md: 4 }, height: 64, flexShrink: 0, [LANDSCAPE_PHONE]: { height: 52 } }}>
        <LogoMark size={28} />
        <Typography sx={{ fontWeight: 700, fontSize: 14 }} noWrap>アフロCMS</Typography>
        <Typography variant="caption" sx={{ display: { xs: 'none', sm: 'block' } }} noWrap>{index + 1} / {total}・{TITLES[index]}</Typography>
        <Box sx={{ flex: 1 }} />
        <Tooltip title={full ? '全画面を終了' : '全画面表示'}>
          <IconButton onClick={toggleFull} aria-label={full ? '全画面を終了' : '全画面表示'}>{full ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</IconButton>
        </Tooltip>
        <Tooltip title="プレゼンを終了（Esc）">
          <IconButton onClick={() => navigate('/')} aria-label="プレゼンを終了"><X size={20} /></IconButton>
        </Tooltip>
      </Stack>

      <Box component="main" aria-live="polite" aria-label={`スライド ${index + 1}：${TITLES[index]}`} sx={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', px: { xs: 2, md: 6 }, py: { xs: 2, md: 4 }, display: 'flex' }}>
        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.div
            key={index}
            custom={dir}
            initial={reduced ? false : { opacity: 0, x: dir * 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduced ? { opacity: 1 } : { opacity: 0, x: dir * -40 }}
            transition={{ duration: reduced ? 0 : tokens.motion.slow, ease: tokens.motion.ease }}
            style={{ margin: 'auto 0', width: '100%' }}
          >
            {slides[index]}
          </motion.div>
        </AnimatePresence>
      </Box>

      <Stack
        component="footer" direction="row" alignItems="center" justifyContent="space-between"
        sx={{ px: { xs: 2, md: 4 }, height: 'calc(72px + env(safe-area-inset-bottom))', flexShrink: 0, pb: 'env(safe-area-inset-bottom)', [LANDSCAPE_PHONE]: { height: 'calc(56px + env(safe-area-inset-bottom))' } }}
      >
        <Button variant="outlined" startIcon={<ChevronLeft size={18} />} onClick={() => go(index - 1)} disabled={index === 0} aria-label="前のスライド">
          <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>前へ</Box>
        </Button>
        {/* スマホは点が指で押せる大きさにならないので、位置を文字で示す（移動は前へ・次へ） */}
        <Typography variant="body2" aria-hidden sx={{ display: { xs: 'block', sm: 'none' }, fontWeight: 600, color: c.muted, fontVariantNumeric: 'tabular-nums', textAlign: 'center', px: 1, minWidth: 0 }} noWrap>
          {index + 1} / {total}・{TITLES[index]}
        </Typography>
        <Stack direction="row" component="nav" aria-label="スライド一覧" sx={{ display: { xs: 'none', sm: 'flex' } }}>
          {TITLES.map((t, i) => (
            <ButtonBase
              key={t}
              onClick={() => go(i)}
              aria-label={`${i + 1}. ${t}`}
              aria-current={i === index ? 'step' : undefined}
              // 見た目の点は小さいまま、押せる範囲は高さ 44px・幅 24px 以上にする
              sx={{ height: 44, minWidth: 24, px: 0.75, borderRadius: 99, '&::before': { content: '""', display: 'block', width: i === index ? 28 : 10, height: 10, borderRadius: 99, bgcolor: i === index ? c.primary : c.borderStrong, transition: `all .24s ${tokens.motion.easeCss}` } }}
            />
          ))}
        </Stack>
        <Button variant="contained" endIcon={<ChevronRight size={18} />} onClick={() => go(index + 1)} disabled={index === total - 1} aria-label="次のスライド">
          <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>次へ</Box>
        </Button>
      </Stack>

      <ResetDemoDialog open={resetOpen} onClose={() => setResetOpen(false)} onDone={() => go(0)} />
    </Box>
  );
}
