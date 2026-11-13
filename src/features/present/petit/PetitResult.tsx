import { Box, Button, ButtonBase, Stack, Tab, Tabs, Typography } from '@mui/material';
import { ArrowRight, FolderPlus, Globe, Pencil, Quote, Target, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DESIGN_VARIANTS } from '@/data/designs';
import { AiBadge, CountUp, ProgressRing, StatusPill, Surface } from '@/components/ui';
import { DeviceFrame } from '@/features/design/DeviceFrame';
import { DeviceToggle } from '@/features/design/DesignStudioPage';
import { personalize } from '@/features/design/designContext';
import type { Device } from '@/features/design/previews/shared';
import { palette, tokens } from '@/theme/tokens';
import type { DesignId } from '@/types';
import { directionOf, petitDesignContext, petitProposal, petitSitemap, type PetitInput } from './petitPlan';
import { PetitSitemapTree } from './PetitSitemapTree';

const c = tokens.color;

function Summary({ input }: { input: PetitInput }) {
  const proposal = useMemo(() => petitProposal(input), [input]);
  return (
    <Stack spacing={2}>
      <Surface padding={0} sx={{ overflow: 'hidden' }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.4fr 1fr' } }}>
          <Box sx={{ p: { xs: 2.5, md: 3 } }}>
            <Typography variant="overline" sx={{ display: 'block' }}>Petit Requirements</Typography>
            <Typography variant="h3" component="h2" sx={{ mb: 1 }}>{input.clientName.trim()} 様 プチ要件定義</Typography>
            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ color: c.muted, mb: 2 }}>
              <Globe size={15} aria-hidden />
              <Typography variant="body2" sx={{ fontWeight: 600, color: c.inkSoft }}>{input.siteUrl.trim() ? proposal.hostname : '現行サイト（URL 未入力）'}</Typography>
              <Typography variant="body2">／ {input.industry.trim()}</Typography>
            </Stack>
            {proposal.issue && (
              <Box sx={{ display: 'flex', gap: 1.25, p: 2, borderRadius: 3, bgcolor: c.surfaceMuted, border: `1px solid ${c.border}`, mb: 2 }}>
                <Quote size={18} color={c.faint} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden />
                <Box>
                  <Typography variant="caption" sx={{ display: 'block', mb: 0.25 }}>伺った課題</Typography>
                  <Typography variant="body2" sx={{ color: c.ink }}>{proposal.issue}</Typography>
                </Box>
              </Box>
            )}
            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
              {[...proposal.purposes, ...(input.target.trim() ? [`ターゲット: ${input.target.trim()}`] : []), ...(input.cv ? [`ゴール: ${input.cv}`] : [])].map((t) => (
                <StatusPill key={t} tone="primary" dot={false} icon={<Target size={12} />}>{t}</StatusPill>
              ))}
            </Stack>
          </Box>
          <Box sx={{ p: { xs: 2.5, md: 3 }, bgcolor: c.scoreboardBg, color: '#fff', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
            <Typography variant="overline" sx={{ color: 'rgba(255,255,255,.6)' }}>サイトスコア（AI推定）</Typography>
            <Stack direction="row" spacing={3} alignItems="center">
              <ProgressRing value={proposal.currentScore} size={84} stroke={7} color="#94A3B8" track="rgba(255,255,255,.12)" label="現状スコア">
                <Box sx={{ textAlign: 'center' }}>
                  <Box sx={{ fontSize: 22, fontWeight: 700 }}><CountUp value={proposal.currentScore} /></Box>
                  <Box sx={{ fontSize: 12, opacity: 0.6, fontWeight: 600 }}>現状</Box>
                </Box>
              </ProgressRing>
              <ArrowRight size={20} color="rgba(255,255,255,.4)" aria-hidden />
              <ProgressRing value={proposal.projectedScore} size={84} stroke={7} color={palette.light.inversePrimary} track="rgba(255,255,255,.12)" label="改善後の見込みスコア">
                <Box sx={{ textAlign: 'center' }}>
                  <Box sx={{ fontSize: 22, fontWeight: 700 }}><CountUp value={proposal.projectedScore} duration={1400} /></Box>
                  <Box sx={{ fontSize: 12, opacity: 0.6, fontWeight: 600 }}>改善後</Box>
                </Box>
              </ProgressRing>
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center">
              <TrendingUp size={16} color="#6EE7B7" aria-hidden />
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,.85)' }}>提案を実施すると <b>+{proposal.projectedScore - proposal.currentScore}pt</b> の改善見込み</Typography>
            </Stack>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,.55)' }}>デモ用の推定値です。</Typography>
          </Box>
        </Box>
      </Surface>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5 }}>
        {proposal.points.slice(0, 4).map((pp) => (
          <Box key={pp.id} sx={{ p: 2, borderRadius: 3, bgcolor: c.surface, border: `1px solid ${c.border}`, display: 'flex', gap: 1.5, minWidth: 0 }}>
            <StatusPill tone={pp.priority === 'high' ? 'danger' : 'warning'}>{pp.priority === 'high' ? '優先度 高' : '優先度 中'}</StatusPill>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>{pp.title}</Typography>
              <Typography variant="caption" sx={{ display: 'block' }}>{pp.detail}</Typography>
              <Typography variant="caption" sx={{ color: c.success, fontWeight: 600 }}>{pp.impact}</Typography>
            </Box>
          </Box>
        ))}
      </Box>
    </Stack>
  );
}

function Design({ input }: { input: PetitInput }) {
  const sitemap = useMemo(() => petitSitemap(input), [input]);
  const ctx = useMemo(() => petitDesignContext(input, sitemap.state), [input, sitemap]);
  const [design, setDesign] = useState<DesignId>(() => directionOf(input));
  const [device, setDevice] = useState<Device>('pc');
  const [screen, setScreen] = useState(0);
  const screens = ['トップ', ...ctx.pages.map((p) => p.label)];
  const current = DESIGN_VARIANTS.find((d) => d.id === design)!;

  return (
    <Stack spacing={2}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: { xs: 1, md: 2 } }} role="group" aria-label="デザインの方向">
        {DESIGN_VARIANTS.map((d) => {
          const on = d.id === design;
          return (
            <ButtonBase key={d.id} onClick={() => setDesign(d.id)} aria-pressed={on}
              sx={{ display: 'block', textAlign: 'left', borderRadius: 3, overflow: 'hidden', bgcolor: c.surface, border: `2px solid ${on ? c.primary : c.border}`, boxShadow: on ? tokens.shadow.md : 'none' }}>
              <DeviceFrame design={d.id} device="pc" thumbnail viewportHeight={760} ctx={ctx} />
              <Box sx={{ p: { xs: 1, md: 1.5 }, borderTop: `1px solid ${c.border}` }}>
                <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                  <Typography sx={{ fontWeight: 700, fontSize: { xs: 13, md: 15 } }} noWrap>{d.label}：{d.name}</Typography>
                  {on && <Box sx={{ display: { xs: 'none', md: 'block' } }}><StatusPill tone="primary">選択中</StatusPill></Box>}
                </Stack>
                <Typography variant="caption" sx={{ display: { xs: 'none', md: 'block' } }}>{personalize(d, ctx).tagline}</Typography>
              </Box>
            </ButtonBase>
          );
        })}
      </Box>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'flex-start' }} justifyContent="space-between">
        <Box role="group" aria-label="表示する画面" sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, minWidth: 0 }}>
          {screens.map((label, i) => (
            <ButtonBase key={`${label}-${i}`} onClick={() => setScreen(i)} aria-pressed={screen === i}
              sx={{ minHeight: 44, px: 1.5, borderRadius: 99, fontSize: 13, fontWeight: 600, maxWidth: 220, border: `1px solid ${screen === i ? c.primary : c.border}`, bgcolor: screen === i ? c.primarySoft : c.surface, color: screen === i ? c.primary : c.inkSoft }}>
              <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</Box>
            </ButtonBase>
          ))}
        </Box>
        <Box sx={{ flexShrink: 0 }}><DeviceToggle value={device} onChange={setDevice} /></Box>
      </Stack>
      <DeviceFrame design={design} device={device} screen={Math.min(screen, ctx.pages.length)} ctx={ctx} viewportHeight={device === 'pc' ? 720 : undefined} label={`${current.name}のプレビュー（${screens[screen] ?? 'トップ'}）`} />
    </Stack>
  );
}

type View = 'summary' | 'sitemap' | 'design';

/** 分析のあとに見せる結果（要件のまとめ・サイトマップ・デザイン） */
export function PetitResult({ input, onEdit, onRegister, registerBlocker }: { input: PetitInput; onEdit: () => void; onRegister: () => void; registerBlocker: string | null }) {
  const [view, setView] = useState<View>('summary');
  const sitemap = useMemo(() => petitSitemap(input), [input]);
  return (
    <Box sx={{ maxWidth: 1120, mx: 'auto', width: '100%' }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} justifyContent="space-between" sx={{ mb: 1 }}>
        <Tabs value={view} onChange={(_, v: View) => setView(v)} aria-label="結果の表示" variant="scrollable" allowScrollButtonsMobile>
          <Tab value="summary" label="要件のまとめ" id="petit-tab-summary" aria-controls="petit-panel" />
          <Tab value="sitemap" label={`サイトマップ（${sitemap.pages.length + 1}）`} id="petit-tab-sitemap" aria-controls="petit-panel" />
          <Tab value="design" label="デザイン" id="petit-tab-design" aria-controls="petit-panel" />
        </Tabs>
        <AiBadge />
      </Stack>
      <Box role="tabpanel" id="petit-panel" aria-labelledby={`petit-tab-${view}`} sx={{ mt: 1.5 }}>
        {view === 'summary' && <Summary input={input} />}
        {view === 'sitemap' && <Surface padding={{ xs: 2, md: 3 }}><PetitSitemapTree sitemap={sitemap} /></Surface>}
        {view === 'design' && <Design input={input} />}
      </Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} justifyContent="flex-end" sx={{ mt: 2.5 }}>
        <Button variant="outlined" startIcon={<Pencil size={16} />} onClick={onEdit}>入力を直す</Button>
        <Box>
          <Button variant="contained" startIcon={<FolderPlus size={16} />} onClick={onRegister} disabled={!!registerBlocker} fullWidth>案件として登録</Button>
        </Box>
      </Stack>
      {registerBlocker && <Typography variant="body2" sx={{ color: c.muted, mt: 1, textAlign: { sm: 'right' } }}>{registerBlocker}</Typography>}
    </Box>
  );
}
