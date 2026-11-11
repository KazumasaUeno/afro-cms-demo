import { Box, Button, IconButton, Stack, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography, ButtonBase } from '@mui/material';
import {
  addEdge, Background, BackgroundVariant, Controls, MarkerType, MiniMap, Panel, ReactFlow, ReactFlowProvider,
  useEdgesState, useNodesState, useReactFlow, type Connection, type Edge, type EdgeChange, type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ArrowRight, BadgeCheck, CheckCircle2, Lightbulb, Lock, Maximize2, Network, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BuildFlowNav } from '@/components/layout/BuildFlowNav';
import { AiBadge, PageHeader, Reveal, StatusPill, Surface } from '@/components/ui';
import { useDemo } from '@/store/DemoStore';
import { useToast } from '@/hooks/useToast';
import { formatDateTime } from '@/services/time';
import { tokens } from '@/theme/tokens';
import { useThemeMode } from '@/theme/ThemeMode';
import { LANDSCAPE_PHONE, TOUCH } from '@/theme/media';
import type { SitemapEdge, SitemapNode, SitemapVariant } from '@/types';
import { PageNode, KIND_META, type PageFlowNode } from './PageNode';
import { AddPageDialog, type NewPageInput } from './AddPageDialog';
import { sitemapMetrics, validateLabel } from './metrics';
import { useProjectRoutes } from '@/features/projects/projectRoutes';

const nodeTypes = { page: PageNode };
const defaultEdgeOptions = {
  type: 'smoothstep',
  style: { stroke: tokens.color.outline, strokeWidth: 1.5 },
  markerEnd: { type: MarkerType.ArrowClosed, color: tokens.color.outline, width: 16, height: 16 },
};

const toFlow = (n: SitemapNode): PageFlowNode => ({ id: n.id, type: 'page', position: n.position, data: n.data, deletable: n.data.kind !== 'home' });
const toStoreNodes = (ns: PageFlowNode[]): SitemapNode[] =>
  ns.map((n) => ({ id: n.id, position: { x: Math.round(n.position.x), y: Math.round(n.position.y) }, data: n.data }));
const toStoreEdges = (es: Edge[]): SitemapEdge[] => es.map((e) => ({ id: e.id, source: e.source, target: e.target }));
const sig = (n: SitemapNode[], e: SitemapEdge[]) => JSON.stringify([n, e]);

function Editor({ variant, onVariant }: { variant: SitemapVariant; onVariant: (v: SitemapVariant) => void }) {
  const { state, dispatch } = useDemo();
  const { mode } = useThemeMode();
  const stored = state.sitemap[variant];
  const flow = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<PageFlowNode>(stored.nodes.map(toFlow));
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(stored.edges);
  const [adding, setAdding] = useState(false);
  const lastSig = useRef(sig(stored.nodes, stored.edges));
  // お客様の承認後は閲覧だけ（管理者・開発者とも。選択して内容を読むことはできる）。ストア側（setSitemap）でも止めている
  const locked = !!state.sitemap.approvedAt;
  // 承認後に届く変更は、選択と大きさの計測だけ通す（移動・削除・追加をキャンバス上でも起こさない）
  const onNodesChangeGuarded = (cs: NodeChange<PageFlowNode>[]) =>
    onNodesChange(locked ? cs.filter((c) => c.type === 'select' || c.type === 'dimensions') : cs);
  const onEdgesChangeGuarded = (cs: EdgeChange<Edge>[]) => onEdgesChange(locked ? cs.filter((c) => c.type === 'select') : cs);

  // 外部（デモ初期化など）でストアが変わったら取り込む
  useEffect(() => {
    const s = sig(stored.nodes, stored.edges);
    if (s === lastSig.current) return;
    lastSig.current = s;
    setNodes(stored.nodes.map(toFlow));
    setEdges(stored.edges);
  }, [stored, setNodes, setEdges]);

  // 編集をストアへ保存（ドラッグ中は保存しない・まとめて書く）
  useEffect(() => {
    if (locked || nodes.some((n) => n.dragging)) return;
    const t = window.setTimeout(() => {
      const sn = toStoreNodes(nodes);
      const se = toStoreEdges(edges);
      const s = sig(sn, se);
      if (s === lastSig.current) return;
      lastSig.current = s;
      dispatch({ type: 'setSitemap', variant, nodes: sn, edges: se });
    }, 300);
    return () => window.clearTimeout(t);
  }, [nodes, edges, variant, dispatch, locked]);

  const selected = nodes.find((n) => n.selected);
  const storeNodes = useMemo(() => toStoreNodes(nodes), [nodes]);
  const metrics = useMemo(() => sitemapMetrics(storeNodes, toStoreEdges(edges)), [storeNodes, edges]);
  const before = useMemo(() => sitemapMetrics(state.sitemap.before.nodes, state.sitemap.before.edges), [state.sitemap.before]);
  const after = useMemo(() => sitemapMetrics(state.sitemap.after.nodes, state.sitemap.after.edges), [state.sitemap.after]);

  const focusNode = (id: string) => {
    setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === id })));
    const n = nodes.find((x) => x.id === id);
    if (n) flow.setCenter(n.position.x + 92, n.position.y + 30, { zoom: 1.1, duration: 400 });
  };
  const patchSelected = (patch: Partial<PageFlowNode['data']>) =>
    !locked && setNodes((ns) => ns.map((n) => (n.id === selected?.id ? { ...n, data: { ...n.data, ...patch } } : n)));

  const onConnect = (c: Connection) => !locked && setEdges((es) => addEdge({ ...c, id: `${c.source}-${c.target}` }, es));

  const addPage = (input: NewPageInput) => {
    if (locked) return;
    const id = `${variant === 'after' ? 'a' : 'b'}-${Date.now().toString(36)}`;
    const parent = nodes.find((n) => n.id === input.parentId);
    const siblings = parent ? edges.filter((e) => e.source === parent.id).length : 0;
    const position = parent ? { x: parent.position.x + siblings * 60 - 40, y: parent.position.y + 150 } : { x: 0, y: 460 };
    const node: PageFlowNode = { id, type: 'page', position, selected: true, deletable: true, data: { label: input.label, path: input.path, kind: input.kind, reason: input.reason || undefined } };
    setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), node]);
    if (parent) setEdges((es) => addEdge({ id: `${parent.id}-${id}`, source: parent.id, target: id }, es));
    setAdding(false);
    window.setTimeout(() => flow.setCenter(position.x + 92, position.y + 30, { zoom: 1.1, duration: 400 }), 50);
  };

  const reasons = nodes.filter((n) => n.data.reason);
  const labelErr = selected ? validateLabel(selected.data.label) : null;

  return (
    <>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', md: 'center' }} sx={{ mb: 2 }}>
        <ToggleButtonGroup exclusive size="small" value={variant} onChange={(_, v) => v && onVariant(v)} aria-label="表示するサイトマップ">
          <ToggleButton value="before">現在 Before</ToggleButton>
          <ToggleButton value="after">改善後 After</ToggleButton>
        </ToggleButtonGroup>
        <Stack direction="row" spacing={2} sx={{ flex: 1, flexWrap: 'wrap', rowGap: 0.5, color: tokens.color.muted, fontSize: 13 }}>
          <span>ページ <b style={{ color: tokens.color.ink }}>{metrics.pages}</b></span>
          <span>最大階層 <b style={{ color: tokens.color.ink }}>{metrics.maxDepth}</b></span>
          <span>問い合わせまで <b style={{ color: tokens.color.ink }}>{metrics.contactClicks ?? '—'}</b> クリック</span>
        </Stack>
        <Stack direction="row" spacing={1}>
          {!locked && <Button variant="outlined" size="small" startIcon={<Plus size={16} />} onClick={() => setAdding(true)}>ページを追加</Button>}
          {!locked && <Tooltip title={selected?.deletable === false ? 'トップページは削除できません' : '選択したページを削除（Delete キー）'}>
            <span>
              <IconButton aria-label="選択したページを削除" disabled={!selected || selected.deletable === false}
                onClick={() => selected && flow.deleteElements({ nodes: [{ id: selected.id }] })}>
                <Trash2 size={17} />
              </IconButton>
            </span>
          </Tooltip>}
          <Tooltip title="全体を表示">
            <IconButton aria-label="全体を表示" onClick={() => flow.fitView({ padding: 0.2, duration: 400 })}><Maximize2 size={17} /></IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      {locked && (
        <Box role="note" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, px: 1.5, py: 1, borderRadius: 2, bgcolor: tokens.color.surfaceMuted, color: tokens.color.inkSoft, fontSize: 13.5 }}>
          <Lock size={15} aria-hidden /> お客様が承認済みのため編集できません
        </Box>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0,1fr) 320px' }, gap: 2.5, alignItems: 'start' }}>
        <Surface padding={0} sx={{ overflow: 'hidden',
          // タッチではキャンバス上のドラッグが画面のスクロールにならないので、上下に指を置ける余白を必ず残す
          height: { xs: 'clamp(300px, 58dvh, 560px)', lg: 'calc(100dvh - 320px)' }, minHeight: { lg: 420 },
          [LANDSCAPE_PHONE]: { height: 'calc(100dvh - 140px)', minHeight: 220 },
          '& .react-flow__controls-button': { [TOUCH]: { width: 44, height: 44 } },
          // 接続の点は指で掴める大きさにする（インライン style より優先させる）
          '& .react-flow__handle': { [TOUCH]: { width: '16px !important', height: '16px !important' } },
          '& .react-flow__controls': { boxShadow: tokens.shadow.sm, borderRadius: '10px', overflow: 'hidden', border: `1px solid ${tokens.color.border}` },
          '& .react-flow__minimap': { borderRadius: '12px', overflow: 'hidden', border: `1px solid ${tokens.color.border}`, display: { xs: 'none', md: 'block' } } }}>
          <ReactFlow
            colorMode={mode}
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChangeGuarded}
            onEdgesChange={onEdgesChangeGuarded}
            onConnect={onConnect}
            nodesDraggable={!locked}
            nodesConnectable={!locked}
            isValidConnection={(c) => c.source !== c.target}
            defaultEdgeOptions={defaultEdgeOptions}
            deleteKeyCode={locked ? null : ['Delete', 'Backspace']}
            fitView
            // 初期表示はページ名が読める倍率を優先（はみ出す分はパン。全体は右上「全体を表示」で）
            fitViewOptions={{ padding: 0.08, minZoom: 0.85 }}
            minZoom={0.3}
            maxZoom={2}
            aria-label={`${variant === 'after' ? '改善後' : '現在'}のサイトマップ`}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1.4} color={tokens.color.outlineVariant} />
            <Controls showInteractive={false} position="bottom-left" />
            <MiniMap pannable zoomable position="bottom-right" nodeBorderRadius={6}
              nodeColor={(n) => (n.data as PageFlowNode['data']).kind === 'new' ? tokens.color.accent : (n.data as PageFlowNode['data']).kind === 'cta' ? tokens.color.primary : tokens.color.outlineVariant}
              style={{ width: 140, height: 96 }} />
            <Panel position="top-left">
              <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 1.25, py: 0.75, borderRadius: '10px', bgcolor: `color-mix(in srgb, ${tokens.color.surface} 90%, transparent)`, border: `1px solid ${tokens.color.border}`, fontSize: 12, color: tokens.color.muted }}>
                <StatusPill tone={variant === 'after' ? 'accent' : 'neutral'}>{variant === 'after' ? '改善後' : '現在'}</StatusPill>
                <Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>{locked ? '閲覧のみ · ページを選ぶと内容を確認できます' : 'ドラッグで移動 · 下の点から引っぱって接続'}</Box>
              </Stack>
            </Panel>
          </ReactFlow>
        </Surface>

        <Stack spacing={2}>
          {selected ? (
            <Surface>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                <StatusPill tone={selected.data.kind === 'new' ? 'accent' : selected.data.kind === 'cta' ? 'primary' : 'neutral'}>{KIND_META[selected.data.kind].label}</StatusPill>
                <Typography variant="caption" sx={{ fontFamily: tokens.font.mono }}>{selected.data.path}</Typography>
              </Stack>
              <TextField fullWidth size="small" label="ページ名" value={selected.data.label} error={!!labelErr} helperText={labelErr ?? ' '}
                inputProps={{ maxLength: 30, readOnly: locked }} onChange={(e) => patchSelected({ label: e.target.value })} />
              {variant === 'after' ? (
                <TextField fullWidth size="small" multiline minRows={3} label="改善理由" value={selected.data.reason ?? ''} inputProps={{ maxLength: 140, readOnly: locked }}
                  helperText={`${(selected.data.reason ?? '').length} / 140`} onChange={(e) => patchSelected({ reason: e.target.value || undefined })} sx={{ mt: 1 }} />
              ) : selected.data.reason ? (
                <Box sx={{ mt: 1, p: 1.5, borderRadius: 2, bgcolor: tokens.color.warningSoft, fontSize: 13, color: tokens.color.warningInk }}>課題：{selected.data.reason}</Box>
              ) : null}
              <Typography variant="caption" sx={{ display: 'block', mt: 1.5 }}>
                つながり：親 {edges.filter((e) => e.target === selected.id).length} · 子 {edges.filter((e) => e.source === selected.id).length}
              </Typography>
            </Surface>
          ) : (
            <Surface>
              <Typography variant="h5" component="h2" sx={{ mb: 1.5 }}>Before → After</Typography>
              {[
                ['ページ数', before.pages, after.pages],
                ['最大階層', before.maxDepth, after.maxDepth],
                ['第1階層の入口', before.firstLevel, after.firstLevel],
                ['問い合わせまで', before.contactClicks ?? '—', after.contactClicks ?? '—'],
              ].map(([k, b, a]) => (
                <Stack key={k as string} direction="row" alignItems="center" sx={{ py: 0.9, borderBottom: `1px solid ${tokens.color.border}`, fontSize: 13.5 }}>
                  <Box sx={{ flex: 1, color: tokens.color.muted }}>{k}</Box>
                  <Box sx={{ width: 36, textAlign: 'right', color: tokens.color.muted, fontVariantNumeric: 'tabular-nums' }}>{b}</Box>
                  <ArrowRight size={13} color={tokens.color.faint} style={{ margin: '0 8px' }} />
                  <Box sx={{ width: 28, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{a}</Box>
                </Stack>
              ))}
              <Typography variant="caption" sx={{ display: 'block', mt: 1.5 }}>{locked ? 'ページを選ぶと詳細と改善理由を確認できます。' : 'ページを選ぶと詳細と改善理由を編集できます。'}</Typography>
            </Surface>
          )}

          <Surface>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
              <Lightbulb size={16} color={tokens.color.warning} />
              <Typography variant="h5" component="h2">{variant === 'after' ? '改善理由' : '現状の課題'}</Typography>
              <AiBadge label="AI提案" />
            </Stack>
            <Stack spacing={0.75}>
              {reasons.length === 0 && <Typography variant="body2" color="text.secondary">まだありません</Typography>}
              {reasons.map((n) => (
                <ButtonBase key={n.id} onClick={() => focusNode(n.id)} sx={{ display: 'block', textAlign: 'left', p: 1.25, borderRadius: 2, border: `1px solid ${n.selected ? tokens.color.primary : tokens.color.border}`, '&:hover': { bgcolor: tokens.color.surfaceMuted } }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 650 }}>{n.data.label}</Typography>
                  <Typography variant="caption" sx={{ display: 'block' }}>{n.data.reason}</Typography>
                </ButtonBase>
              ))}
            </Stack>
          </Surface>
        </Stack>
      </Box>

      <AddPageDialog open={adding && !locked} variant={variant} nodes={storeNodes} defaultParentId={selected?.id} onClose={() => setAdding(false)} onAdd={addPage} />
    </>
  );
}

/**
 * サイトマップ。管理者画面（/site）と開発者画面（/dev/sitemap。0.26.0）で同じ画面。
 * 構造の編集はお客様の承認前だけ（管理者・開発者とも。承認後は閲覧のみ。2026-11-11 ユーザー判断）。
 * 開発者画面では構造の確認・編集はできるが、承認（アフロがお客様の代わりに承認する操作）は出さない（表示の出し分けだけ。実体はルール）
 */
export default function SitemapPage() {
  const { state, dispatch } = useDemo();
  const routes = useProjectRoutes();
  const navigate = useNavigate();
  const toast = useToast();
  const [variant, setVariant] = useState<SitemapVariant>('after');
  const approvedAt = state.sitemap.approvedAt;
  // ウォーターフォール: 要件定義書の承認が先
  const reqApproved = state.requirements.status === 'approved';

  return (
    <Box>
      <BuildFlowNav />
      <PageHeader
        eyebrow="③ 制作"
        icon={<Network size={14} />}
        title="サイトの構造を、見ながら組み替える"
        description={approvedAt
          ? '現在のサイトと、要件定義から導いた改善後の構造を切り替えて比較できます。お客様の承認後は閲覧だけできます。'
          : '現在のサイトと、要件定義から導いた改善後の構造を切り替えて比較できます。ページの追加・移動・接続はそのまま保存されます。'}
        actions={
          approvedAt ? (
            <>
              <Box role="status" sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, minHeight: 40, borderRadius: 3, bgcolor: tokens.color.successSoft, color: tokens.color.successInk, fontWeight: 650, fontSize: 14 }}>
                <BadgeCheck size={18} /> 承認済み {formatDateTime(approvedAt)}
              </Box>
              <Button variant="contained" endIcon={<ArrowRight size={16} />} onClick={() => navigate(routes.design)}>デザインへ進む</Button>
            </>
          ) : routes.dev ? (
            <Box role="status" sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, minHeight: 40, borderRadius: 3, bgcolor: tokens.color.surfaceMuted, color: tokens.color.inkSoft, fontWeight: 600, fontSize: 14 }}>
              未承認（承認は管理者画面で行います）
            </Box>
          ) : (
            <Stack alignItems={{ xs: 'stretch', sm: 'flex-end' }} spacing={0.5}>
              <Button variant="contained" startIcon={<CheckCircle2 size={16} />} disabled={!reqApproved} onClick={() => { dispatch({ type: 'approveSitemap' }); toast('改善後のサイトマップを承認しました'); }}>
                改善後のサイトマップを承認
              </Button>
              {!reqApproved && <Typography variant="caption">要件定義書の承認の後に承認できます</Typography>}
            </Stack>
          )
        }
      />
      <Reveal>
        <ReactFlowProvider key={variant}>
          <Editor variant={variant} onVariant={setVariant} />
        </ReactFlowProvider>
      </Reveal>
    </Box>
  );
}
