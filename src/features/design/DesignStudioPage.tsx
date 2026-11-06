import { Box, Button, ButtonBase, Dialog, IconButton, Stack, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import { ArrowRight, BadgeCheck, Check, Columns3, Expand, LayoutTemplate, Monitor, ShieldCheck, Smartphone, Square, Tablet, Wand2, X, PenLine } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BuildFlowNav } from '@/components/layout/BuildFlowNav';
import { AiBadge, PageHeader, Reveal, StatusPill, Surface } from '@/components/ui';
import { BUILD_PAGES, DESIGN_VARIANTS } from '@/data/designs';
import { useDemo } from '@/store/DemoStore';
import { useToast } from '@/hooks/useToast';
import { formatDateTime } from '@/services/time';
import { tokens } from '@/theme/tokens';
import { LANDSCAPE_PHONE, TOUCH } from '@/theme/media';
import type { DesignId, DesignVariant } from '@/types';
import { DeviceFrame } from './DeviceFrame';
import { BuildSequence } from './BuildSequence';
import type { Device } from './previews/shared';

const DEVICES: { id: Device; label: string; icon: typeof Monitor }[] = [
  { id: 'pc', label: 'PC', icon: Monitor },
  { id: 'tablet', label: 'タブレット', icon: Tablet },
  { id: 'phone', label: 'スマホ', icon: Smartphone },
];

function DeviceToggle({ value, onChange }: { value: Device; onChange: (d: Device) => void }) {
  return (
    <ToggleButtonGroup exclusive size="small" value={value} onChange={(_, v) => v && onChange(v)} aria-label="表示する端末">
      {DEVICES.map(({ id, label, icon: Icon }) => (
        <ToggleButton key={id} value={id} aria-label={label} sx={{ gap: 0.75 }}>
          <Icon size={15} /><Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>{label}</Box>
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <Stack direction="row" alignItems="center" spacing={1}>
      <Typography sx={{ fontSize: 12, color: tokens.color.muted, width: 64, flexShrink: 0 }}>{label}</Typography>
      <Box sx={{ flex: 1, height: 4, borderRadius: 2, bgcolor: tokens.color.bgSubtle }}>
        <Box sx={{ width: `${value}%`, height: '100%', borderRadius: 2, bgcolor: tokens.color.primary, transition: 'width .6s' }} />
      </Box>
      <Typography sx={{ fontSize: 12, fontWeight: 700, width: 22, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
    </Stack>
  );
}

function VariantCard({ v, selected, adopted, locked, onSelect }: { v: DesignVariant; selected: boolean; adopted: boolean; locked: boolean; onSelect: () => void }) {
  return (
    <ButtonBase
      onClick={onSelect}
      disabled={locked && !selected}
      aria-pressed={selected}
      aria-label={`${v.label} ${v.name}を選ぶ`}
      sx={{
        display: 'block', textAlign: 'left', width: '100%', borderRadius: `${tokens.radius.lg}px`, p: 1.25, bgcolor: tokens.color.surface,
        border: `1.5px solid ${selected ? tokens.color.primary : tokens.color.border}`,
        boxShadow: selected ? `0 0 0 4px ${tokens.color.primarySoft}` : tokens.shadow.xs,
        transition: `transform .24s ${tokens.motion.easeCss}, box-shadow .24s, border-color .24s`,
        '&:hover': { transform: 'translateY(-2px)', boxShadow: selected ? `0 0 0 4px ${tokens.color.primarySoft}, ${tokens.shadow.md}` : tokens.shadow.md },
        '&.Mui-disabled': { opacity: 0.55 },
      }}
    >
      <Box sx={{ position: 'relative', borderRadius: '10px', overflow: 'hidden', bgcolor: tokens.color.bgSubtle }}>
        <DeviceFrame design={v.id} device="pc" thumbnail viewportHeight={760} />
        {/* チェック印は採用済みの案だけ（表示中の案は青枠のみ） */}
        {adopted && (
          <Box sx={{ position: 'absolute', top: 8, right: 8, width: 26, height: 26, borderRadius: '50%', bgcolor: tokens.color.primary, color: '#fff', display: 'grid', placeItems: 'center', boxShadow: tokens.shadow.sm }}>
            <Check size={15} strokeWidth={3} />
          </Box>
        )}
      </Box>
      <Box sx={{ px: 0.75, pt: 1.5, pb: 0.5 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
          <Typography variant="overline" sx={{ color: tokens.color.primary }}>{v.label}</Typography>
          {adopted && <StatusPill tone="success">採用</StatusPill>}
        </Stack>
        <Typography variant="h4" component="h3">{v.name}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{v.tagline}</Typography>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
          <Stack direction="row" sx={{ '& > *:not(:first-of-type)': { ml: -0.5 } }}>
            {v.palette.map((c) => <Box key={c} sx={{ width: 18, height: 18, borderRadius: '50%', bgcolor: c, border: '2px solid #fff', boxShadow: `0 0 0 1px ${tokens.color.border}` }} />)}
          </Stack>
          <Typography sx={{ fontSize: 12, color: tokens.color.muted }} noWrap>{v.fonts}</Typography>
        </Stack>
        <Stack spacing={0.6}>
          <ScoreBar label="ブランド" value={v.score.brand} />
          <ScoreBar label="成約導線" value={v.score.conversion} />
          <ScoreBar label="読みやすさ" value={v.score.readability} />
        </Stack>
      </Box>
    </ButtonBase>
  );
}

export default function DesignStudioPage() {
  const { state, dispatch } = useDemo();
  const navigate = useNavigate();
  const toast = useToast();
  const design = state.design;
  const [focus, setFocus] = useState<DesignId>(design.selected ?? 'creative');
  const [device, setDevice] = useState<Device>('pc');
  const [mode, setMode] = useState<'single' | 'compare'>('single');
  const [expanded, setExpanded] = useState(false);
  const [building, setBuilding] = useState(false);
  const locked = !!design.approvedAt;
  const current = DESIGN_VARIANTS.find((v) => v.id === focus) ?? DESIGN_VARIANTS[0];
  const selectedVariant = DESIGN_VARIANTS.find((v) => v.id === design.selected);

  /** 表示中の案をそのまま採用する（既存 action のみ: 選択 → 承認） */
  const adoptCurrent = () => {
    dispatch({ type: 'selectDesign', id: current.id });
    dispatch({ type: 'approveDesign' });
    toast(`${current.name}デザインを採用・承認しました`);
  };

  const choose = (id: DesignId) => {
    setFocus(id);
    if (!locked) dispatch({ type: 'selectDesign', id });
  };

  return (
    <Box>
      <BuildFlowNav />
      <PageHeader
        eyebrow="② 制作"
        icon={<Wand2 size={14} />}
        title="3つの方向性から、トップページを選ぶ"
        description="要件定義の回答と承認済みサイトマップから、レイアウト・タイポグラフィ・構成の異なる3案を生成しました。実際のHTML/CSSで描画しているので、端末ごとの見え方まで確認できます。"
        actions={
          <>
            <AiBadge />
            <ToggleButtonGroup exclusive size="small" value={mode} onChange={(_, v) => v && setMode(v)} aria-label="表示モード">
              <ToggleButton value="single" sx={{ gap: 0.75 }}><Square size={14} />単体</ToggleButton>
              <ToggleButton value="compare" sx={{ gap: 0.75 }}><Columns3 size={14} />比較</ToggleButton>
            </ToggleButtonGroup>
          </>
        }
      />

      {/* 案の選択 */}
      <Box sx={{ display: { xs: 'flex', md: 'grid' }, gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, mb: 3, overflowX: { xs: 'auto', md: 'visible' }, scrollSnapType: 'x mandatory', mx: { xs: -2, md: 0 }, px: { xs: 2, md: 0 }, pb: { xs: 1, md: 0 } }}>
        {DESIGN_VARIANTS.map((v, i) => (
          <Box key={v.id} sx={{ flex: { xs: '0 0 78%', sm: '0 0 46%' }, scrollSnapAlign: 'start', minWidth: 0 }}>
            <Reveal delay={i * 0.07}>
              <VariantCard v={v} selected={focus === v.id} adopted={locked && design.selected === v.id} locked={locked} onSelect={() => choose(v.id)} />
            </Reveal>
          </Box>
        ))}
      </Box>

      {/* プレビュー */}
      <Surface padding={{ xs: 1.5, md: 2.5 }} sx={{ mb: 3, bgcolor: tokens.color.surfaceMuted }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'center' }} sx={{ mb: 2 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {mode === 'single' ? (
              <>
                <Typography variant="h4" component="h2">{current.label}：{current.name}</Typography>
                <Typography variant="body2" color="text.secondary">{current.description}</Typography>
              </>
            ) : (
              <Typography variant="h4" component="h2">3案を並べて比較</Typography>
            )}
          </Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <DeviceToggle value={device} onChange={setDevice} />
            {mode === 'single' && (
              <Tooltip title="大きくプレビュー">
                <IconButton aria-label="大きくプレビュー" onClick={() => setExpanded(true)}><Expand size={18} /></IconButton>
              </Tooltip>
            )}
          </Stack>
        </Stack>

        {mode === 'single' ? (
          <DeviceFrame design={current.id} device={device} viewportHeight={device === 'pc' ? 720 : undefined} label={`${current.name}のプレビュー`} />
        ) : (
          <Box sx={{ display: { xs: 'flex', lg: 'grid' }, gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, overflowX: { xs: 'auto', lg: 'visible' }, scrollSnapType: 'x mandatory' }}>
            {DESIGN_VARIANTS.map((v) => (
              <Box key={v.id} sx={{ flex: { xs: '0 0 86%', sm: '0 0 60%' }, scrollSnapAlign: 'center', minWidth: 0 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                  <Typography variant="h6">{v.label} · {v.name}</Typography>
                  {/* 採用後は「採用した案」を基準に表示する（見ている案と取り違えない） */}
                  <Button size="small" variant={(locked ? design.selected : focus) === v.id ? 'contained' : 'outlined'} disabled={locked && design.selected !== v.id} onClick={() => choose(v.id)}>
                    {locked ? (design.selected === v.id ? '採用済み' : '不採用') : focus === v.id ? '選択中' : 'この案を選ぶ'}
                  </Button>
                </Stack>
                <DeviceFrame design={v.id} device={device} viewportHeight={device === 'pc' ? 900 : undefined} label={`${v.name}のプレビュー`} />
              </Box>
            ))}
          </Box>
        )}
      </Surface>

      {/* 採用・構築 */}
      {locked ? (
        <Reveal>
          <Surface>
            {design.buildCompletedAt ? (
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
                <Box sx={{ width: 48, height: 48, borderRadius: 3, bgcolor: tokens.color.successSoft, color: tokens.color.success, display: 'grid', placeItems: 'center', flexShrink: 0 }}><BadgeCheck size={24} /></Box>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="h4" component="h2">全 {BUILD_PAGES.length} ページの構築が完了しました</Typography>
                  <Typography variant="body2" color="text.secondary">{selectedVariant?.name}デザインで構築 · {formatDateTime(design.buildCompletedAt)}（シミュレーション）。次は品質チェックとページ編集へ。</Typography>
                </Box>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <Button variant="outlined" startIcon={<PenLine size={16} />} onClick={() => navigate('/portal/pages')}>CMSで編集</Button>
                  <Button variant="contained" startIcon={<ShieldCheck size={16} />} onClick={() => navigate('/quality')}>品質チェックへ</Button>
                </Stack>
              </Stack>
            ) : building ? (
              <BuildSequence
                accent={selectedVariant?.palette[2] ?? tokens.color.primary}
                onDone={() => { dispatch({ type: 'completeBuild' }); setBuilding(false); toast('全ページを構築しました', 'ai'); }}
              />
            ) : (
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="h4" component="h2">{selectedVariant?.label}「{selectedVariant?.name}」を採用しました</Typography>
                  <Box role="status" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, mt: 1, px: 1.25, py: 0.5, borderRadius: 2, bgcolor: tokens.color.successSoft, color: '#08765A', fontSize: 13, fontWeight: 650 }}>
                    <BadgeCheck size={15} /> 承認済み {formatDateTime(design.approvedAt)}
                  </Box>
                </Box>
                <Button size="large" variant="contained" endIcon={<ArrowRight size={18} />} onClick={() => { dispatch({ type: 'startBuild' }); setBuilding(true); }}
                  sx={{ background: tokens.aiGradient, '&:hover': { background: tokens.aiGradient, filter: 'brightness(1.06)' } }}>
                  全ページ構築へ進む
                </Button>
              </Stack>
            )}
          </Surface>
        </Reveal>
      ) : (
        // 採用の帯は画面下に固定（出現アニメーションなし）。390 は下部タブの上
        <Surface
          role="region"
          aria-label="デザイン案の採用"
          padding={{ xs: 2, md: 2.5 }}
          sx={{
            position: 'sticky', zIndex: 10, bottom: { xs: 'calc(64px + env(safe-area-inset-bottom) + 8px)', md: 16 },
            [LANDSCAPE_PHONE]: { bottom: 16 },
            bgcolor: tokens.color.surface, boxShadow: tokens.shadow.md,
          }}
        >
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 1.5, md: 2 }} alignItems={{ md: 'center' }}>
            <Box sx={{ width: 48, height: 48, borderRadius: 3, bgcolor: tokens.color.primarySoft, color: tokens.color.primary, display: { xs: 'none', md: 'grid' }, placeItems: 'center', flexShrink: 0 }}><LayoutTemplate size={22} /></Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="h4" component="h2" sx={{ fontSize: { xs: 16, md: undefined } }}>{current.label}「{current.name}」を採用しますか？</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>採用すると承認の記録が残り、このデザインで全ページを構築できます。</Typography>
            </Box>
            <Button size="large" variant="contained" startIcon={<Check size={18} />} onClick={adoptCurrent}
              sx={{ flexShrink: 0, minHeight: 48, [TOUCH]: { minHeight: 48 }, width: { xs: '100%', md: 'auto' } }}>
              この案を採用して承認
            </Button>
          </Stack>
        </Surface>
      )}

      <Dialog open={expanded} onClose={() => setExpanded(false)} fullScreen PaperProps={{ sx: { bgcolor: tokens.color.bgSubtle, borderRadius: 0, border: 'none' } }} aria-label="大きくプレビュー">
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ px: { xs: 2, md: 3 }, py: 1.5, bgcolor: tokens.color.surface, borderBottom: `1px solid ${tokens.color.border}` }}>
          <Typography variant="h5" sx={{ flex: 1, minWidth: 0, lineHeight: 1.3 }}>{current.label}<Box component="br" sx={{ display: { sm: 'none' } }} /><Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>：</Box>{current.name}</Typography>
          <DeviceToggle value={device} onChange={setDevice} />
          <IconButton aria-label="閉じる" onClick={() => setExpanded(false)}><X size={20} /></IconButton>
        </Stack>
        <Box sx={{ p: { xs: 1.5, md: 3 }, overflow: 'auto' }}>
          <DeviceFrame design={current.id} device={device} viewportHeight={device === 'pc' ? 760 : undefined} label={`${current.name}の拡大プレビュー`} />
        </Box>
      </Dialog>
    </Box>
  );
}
