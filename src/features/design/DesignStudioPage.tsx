import { Box, Button, ButtonBase, Dialog, IconButton, Stack, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import { ArrowRight, BadgeCheck, Check, Columns3, Expand, LayoutTemplate, Monitor, Network, Palette, ShieldCheck, Smartphone, Square, Tablet, Wand2, X, PenLine, ListTodo } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BuildFlowNav } from '@/components/layout/BuildFlowNav';
import { AiBadge, PageHeader, Reveal, StatusPill, Surface } from '@/components/ui';
import { BUILD_PAGES, DESIGN_VARIANTS } from '@/data/designs';
import { useDemo } from '@/store/DemoStore';
import { useToast } from '@/hooks/useToast';
import { formatDateTime } from '@/services/time';
import { tokens } from '@/theme/tokens';
import type { DesignId, DesignVariant } from '@/types';
import { DeviceFrame } from './DeviceFrame';
import { BuildSequence } from './BuildSequence';
import type { Device } from './previews/shared';
import { useProjectRoutes } from '@/features/projects/projectRoutes';
import { DESIGN_REQUIRED, designBlockers, designReady } from './designReq';
import { personalize, useDesignContext, type DesignContext } from './designContext';

const DEVICES: { id: Device; label: string; icon: typeof Monitor }[] = [
  { id: 'pc', label: 'PC', icon: Monitor },
  { id: 'tablet', label: 'タブレット', icon: Tablet },
  { id: 'phone', label: 'スマホ', icon: Smartphone },
];

/** 表示する端末の切替（営業プレゼンのプチ要件定義でも使う。0.32.0） */
export function DeviceToggle({ value, onChange }: { value: Device; onChange: (d: Device) => void }) {
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

/** 表示する画面（トップ＋改善後サイトマップの主要ページ最大 2 つ。0.29.5） */
function ScreenToggle({ ctx, value, onChange }: { ctx: DesignContext; value: number; onChange: (n: number) => void }) {
  const screens = ['トップ', ...ctx.pages.map((p) => p.label)];
  return (
    <ToggleButtonGroup exclusive size="small" value={value} onChange={(_, v) => v !== null && onChange(v)} aria-label="表示する画面" sx={{ flexWrap: 'wrap' }}>
      {screens.map((label, i) => (
        <ToggleButton key={label} value={i} sx={{ maxWidth: 200 }}>
          <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</Box>
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
      aria-label={`${v.label} ${v.name}を表示`}
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
          <Box sx={{ position: 'absolute', top: 8, right: 8, width: 26, height: 26, borderRadius: '50%', bgcolor: tokens.color.primary, color: tokens.color.onPrimary, display: 'grid', placeItems: 'center', boxShadow: tokens.shadow.sm }}>
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

/**
 * デザインスタジオ。管理者画面（/ai-studio/design）と開発者画面（/dev/design。0.26.0）で同じ画面。
 * 採用・承認はお客様ポータルだけ（管理者・開発者には採用待ちの表示。2026-11-12）。開発者画面では全ページ構築、CMS・品質チェックへの移動も出さず、
 * 案を選んでも見るだけ（お客様がポータルで選んだ案を変えない）。表示の出し分けだけで、実体はルール
 */
export default function DesignStudioPage() {
  const { state, dispatch } = useDemo();
  const { dev, quality: qualityRoute, cms: cmsRoute, designRequirements: designReqRoute, sitemap: sitemapRoute } = useProjectRoutes();
  const navigate = useNavigate();
  const toast = useToast();
  const design = state.design;
  const [focus, setFocus] = useState<DesignId>(design.selected ?? 'creative');
  const [device, setDevice] = useState<Device>('pc');
  const [mode, setMode] = useState<'single' | 'compare'>('single');
  const [expanded, setExpanded] = useState(false);
  const [building, setBuilding] = useState(false);
  const [screenNo, setScreen] = useState(0);
  const locked = !!design.approvedAt;
  // 案は案件ごと（ヒアリング・要件定義書・サイトマップ・デザイン要件定義から。0.29.5）
  const ctx = useDesignContext();
  const variants = DESIGN_VARIANTS.map((v) => personalize(v, ctx));
  const screen = Math.min(screenNo, ctx.pages.length);
  const current = variants.find((v) => v.id === focus) ?? variants[0];
  const selectedVariant = variants.find((v) => v.id === design.selected);
  // サイトマップのお客様承認と、デザイン要件定義（0.28.0）の必須の質問がそろうまでは 3 案を出さず、足りないものへ案内する（採用済みの保存データはそのまま出す）
  const sitemapOk = !!state.sitemap.approvedAt || locked;
  const reqOk = designReady(state);
  const ready = sitemapOk && reqOk;
  const missing = designBlockers(design.answers).length;

  // 案を選ぶのはお客様（ポータル）。ここでは表示を切り替えるだけで、お客様の選択（design.selected）は変えない（2026-11-12）
  const choose = (id: DesignId) => setFocus(id);

  return (
    <Box>
      <BuildFlowNav />
      <PageHeader
        eyebrow="③ 制作"
        icon={<Wand2 size={14} />}
        title="3つの方向性から、デザインを選ぶ"
        description="ヒアリング・要件定義書・サイトマップ・デザイン要件定義をもとに、AI が 3 つのデザイン案（各最大 3 画面）を作ります"
        actions={!ready ? <AiBadge /> : (
          <>
            <Button variant="outlined" size="small" startIcon={<Palette size={15} />} onClick={() => navigate(designReqRoute)}>デザイン要件定義</Button>
            <AiBadge />
            <ToggleButtonGroup exclusive size="small" value={mode} onChange={(_, v) => v && setMode(v)} aria-label="表示モード">
              <ToggleButton value="single" sx={{ gap: 0.75 }}><Square size={14} />単体</ToggleButton>
              <ToggleButton value="compare" sx={{ gap: 0.75 }}><Columns3 size={14} />比較</ToggleButton>
            </ToggleButtonGroup>
          </>
        )}
      />

      {!sitemapOk ? (
        <Reveal>
          <Surface sx={{ textAlign: 'center', py: { xs: 5, md: 7 }, px: { xs: 2.5, md: 4 }, maxWidth: 600, mx: 'auto' }}>
            <Stack alignItems="center" spacing={1.5}>
              <Network size={36} color={tokens.color.faint} aria-hidden />
              <Typography variant="h3" component="h2">サイトマップのお客様承認の後に作成します</Typography>
              <Typography variant="body2" color="text.secondary">
                トップ以外の画面は、承認済みサイトマップの主要ページから選びます。{!reqOk && `デザイン要件定義の必須（A）の質問もあと ${missing} 問あります。`}
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ pt: 1 }}>
                <Button variant="contained" endIcon={<ArrowRight size={16} />} onClick={() => navigate(sitemapRoute)}>サイトマップへ</Button>
                {!reqOk && <Button variant="outlined" startIcon={<Palette size={16} />} onClick={() => navigate(designReqRoute)}>デザイン要件定義へ</Button>}
              </Stack>
            </Stack>
          </Surface>
        </Reveal>
      ) : !ready ? (
        <Reveal>
          <Surface sx={{ textAlign: 'center', py: { xs: 5, md: 7 }, px: { xs: 2.5, md: 4 }, maxWidth: 600, mx: 'auto' }}>
            <Stack alignItems="center" spacing={1.5}>
              <Palette size={36} color={tokens.color.faint} aria-hidden />
              <Typography variant="h3" component="h2">先にデザイン要件定義を入力してください</Typography>
              <Typography variant="body2" color="text.secondary">
                必須（A）の {DESIGN_REQUIRED.length} 問に答えると、3つのデザイン案を作れます（あと {missing} 問）。
              </Typography>
              <Box sx={{ pt: 1 }}>
                <Button variant="contained" endIcon={<ArrowRight size={16} />} onClick={() => navigate(designReqRoute)}>デザイン要件定義へ</Button>
              </Box>
            </Stack>
          </Surface>
        </Reveal>
      ) : (<>

      {/* 案の選択 */}
      <Box sx={{ display: { xs: 'flex', md: 'grid' }, gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, mb: 3, overflowX: { xs: 'auto', md: 'visible' }, scrollSnapType: 'x mandatory', mx: { xs: -2, md: 0 }, px: { xs: 2, md: 0 }, pb: { xs: 1, md: 0 } }}>
        {variants.map((v, i) => (
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
            {/* 案に使った案件の情報（ブランド色・イメージ） */}
            <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
              {ctx.siteName}
              {ctx.brandNote && ` · ブランド色「${ctx.brandNote}」を各案に反映`}
              {ctx.mood && ` · イメージ「${ctx.mood}」`}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center" useFlexGap sx={{ flexWrap: 'wrap' }}>
            <ScreenToggle ctx={ctx} value={screen} onChange={setScreen} />
            <DeviceToggle value={device} onChange={setDevice} />
            {mode === 'single' && (
              <Tooltip title="大きくプレビュー">
                <IconButton aria-label="大きくプレビュー" onClick={() => setExpanded(true)}><Expand size={18} /></IconButton>
              </Tooltip>
            )}
          </Stack>
        </Stack>

        {mode === 'single' ? (
          <DeviceFrame design={current.id} device={device} screen={screen} viewportHeight={device === 'pc' ? 720 : undefined} label={`${current.name}のプレビュー`} />
        ) : (
          <Box sx={{ display: { xs: 'flex', lg: 'grid' }, gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, overflowX: { xs: 'auto', lg: 'visible' }, scrollSnapType: 'x mandatory' }}>
            {variants.map((v) => (
              <Box key={v.id} sx={{ flex: { xs: '0 0 86%', sm: '0 0 60%' }, scrollSnapAlign: 'center', minWidth: 0 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                  <Typography variant="h6">{v.label} · {v.name}</Typography>
                  {/* 採用後は「採用した案」を基準に表示する（見ている案と取り違えない） */}
                  <Button size="small" variant={(locked ? design.selected : focus) === v.id ? 'contained' : 'outlined'} disabled={locked && design.selected !== v.id} onClick={() => choose(v.id)}>
                    {/* 選んでも保存しない（見るだけ。選ぶのはお客様）ので「表示」と書く */}
                    {locked ? (design.selected === v.id ? '採用済み' : '不採用') : focus === v.id ? '表示中' : 'この案を表示'}
                  </Button>
                </Stack>
                <DeviceFrame design={v.id} device={device} screen={screen} viewportHeight={device === 'pc' ? 900 : undefined} label={`${v.name}のプレビュー`} />
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
                {/* 行き先はいまのエリアの中（開発者画面は /dev/tasks・/dev/quality。0.27.0） */}
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  {dev ? (
                    <Button variant="outlined" startIcon={<ListTodo size={16} />} onClick={() => navigate('/dev/tasks')}>構築タスクへ</Button>
                  ) : (
                    <Button variant="outlined" startIcon={<PenLine size={16} />} onClick={() => navigate(cmsRoute)}>CMSで編集</Button>
                  )}
                  <Button variant="contained" startIcon={<ShieldCheck size={16} />} onClick={() => navigate(qualityRoute)}>品質チェックへ</Button>
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
                  <Box role="status" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, mt: 1, px: 1.25, py: 0.5, borderRadius: 2, bgcolor: tokens.color.successSoft, color: tokens.color.successInk, fontSize: 13, fontWeight: 650 }}>
                    <BadgeCheck size={15} /> 承認済み {formatDateTime(design.approvedAt)}
                  </Box>
                </Box>
                {dev ? (
                  <Typography variant="body2" color="text.secondary" role="status">全ページ構築は管理者画面で行います</Typography>
                ) : (
                <Button size="large" variant="contained" endIcon={<ArrowRight size={18} />} onClick={() => { dispatch({ type: 'startBuild' }); setBuilding(true); }}
                  sx={{ background: tokens.aiGradient, '&:hover': { background: tokens.aiGradient, filter: 'brightness(1.06)' } }}>
                  全ページ構築へ進む
                </Button>
                )}
              </Stack>
            )}
          </Surface>
        </Reveal>
      ) : (
        // 採用・承認はお客様ポータルだけ（管理者・開発者は承認しない。2026-11-12 ユーザー判断）。ここでは案の比較だけ
        <Surface role="status" padding={{ xs: 2, md: 2.5 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 1.5, md: 2 }} alignItems={{ md: 'center' }}>
            <Box sx={{ width: 48, height: 48, borderRadius: 3, bgcolor: tokens.color.primarySoft, color: tokens.color.primary, display: { xs: 'none', md: 'grid' }, placeItems: 'center', flexShrink: 0 }}><LayoutTemplate size={22} /></Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="h4" component="h2" sx={{ fontSize: { xs: 16, md: undefined } }}>デザイン案の採用</Typography>
              <Typography variant="body2" color="text.secondary">
                {state.sitemap.approvedAt
                  ? 'お客様がお客様ポータルで 3 案から選んで承認します。承認されると、このデザインで全ページを構築できます。'
                  : 'サイトマップの承認の後に、お客様がお客様ポータルで選びます（ここでは案の比較だけできます）。'}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, minHeight: 40, borderRadius: 3, bgcolor: tokens.color.warningSoft, color: tokens.color.warningInk, fontWeight: 650, fontSize: 14, flexShrink: 0 , py: 0.75, whiteSpace: { sm: 'nowrap' } }}>
              お客様の採用待ち（お客様ポータルで選びます）
            </Box>
          </Stack>
        </Surface>
      )}
      </>)}

      <Dialog open={expanded} onClose={() => setExpanded(false)} fullScreen PaperProps={{ sx: { bgcolor: tokens.color.bgSubtle, borderRadius: 0, border: 'none' } }} aria-label="大きくプレビュー">
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ px: { xs: 2, md: 3 }, py: 1.5, bgcolor: tokens.color.surface, borderBottom: `1px solid ${tokens.color.border}` }}>
          <Typography variant="h5" sx={{ flex: 1, minWidth: 0, lineHeight: 1.3 }}>{current.label}<Box component="br" sx={{ display: { sm: 'none' } }} /><Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>：</Box>{current.name}</Typography>
          <Box sx={{ display: { xs: 'none', md: 'block' } }}><ScreenToggle ctx={ctx} value={screen} onChange={setScreen} /></Box>
          <DeviceToggle value={device} onChange={setDevice} />
          <IconButton aria-label="閉じる" onClick={() => setExpanded(false)}><X size={20} /></IconButton>
        </Stack>
        <Box sx={{ p: { xs: 1.5, md: 3 }, overflow: 'auto' }}>
          <Box sx={{ display: { md: 'none' }, mb: 1.5 }}><ScreenToggle ctx={ctx} value={screen} onChange={setScreen} /></Box>
          <DeviceFrame design={current.id} device={device} screen={screen} viewportHeight={device === 'pc' ? 760 : undefined} label={`${current.name}の拡大プレビュー`} />
        </Box>
      </Dialog>
    </Box>
  );
}
