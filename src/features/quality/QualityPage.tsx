import { Box, Button, Menu, MenuItem, Stack, Typography, ListItemText } from '@mui/material';
import { ArrowUpRight, CheckCheck, ShieldCheck, Building2, UserRound, History, Rocket } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { QualityCategory } from '@/types';
import { QUALITY_CATEGORIES, QUALITY_ITEMS, TOTAL_QUALITY_QUESTIONS } from '@/data/quality';
import { useDemo } from '@/store/DemoStore';
import { approvalLogsOf } from '@/repositories/demo';
import { useToast } from '@/hooks/useToast';
import { tokens } from '@/theme/tokens';
import { formatDateTime, relativeTime } from '@/services/time';
import { CountUp, PageHeader, ProgressRing, Reveal, SectionTitle, StatusPill, Surface } from '@/components/ui';
import { CategoryDetail, PriorityChip } from './CategoryDetail';
import { computeStats, isComplete } from './qualityStats';
import { useQualityDevBy } from './useQualityDevBy';

function MiniBar({ value, color, label }: { value: number; color: string; label: string }) {
  return (
    <Stack direction="row" alignItems="center" spacing={1}>
      <Typography sx={{ fontSize: 12, fontWeight: 600, color: tokens.color.muted, width: 40, flexShrink: 0 }}>{label}</Typography>
      <Box
        sx={{ flex: 1, height: 6, borderRadius: 99, bgcolor: tokens.color.bgSubtle, overflow: 'hidden' }}
        role="progressbar" aria-label={`${label} ${Math.round(value)}%`} aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}
      >
        <Box sx={{ width: `${value}%`, height: '100%', bgcolor: color, borderRadius: 99, transition: `width .5s ${tokens.motion.easeCss}` }} />
      </Box>
      <Typography sx={{ fontSize: 12, fontWeight: 700, width: 38, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{Math.round(value)}%</Typography>
    </Stack>
  );
}

/** アフロ側の一括チェック。顧客側の承認はお客様ポータルだけ（管理者画面からの再現操作は 2026-11-12 に廃止） */
function BulkMenu({ side }: { side: 'afro' }) {
  const { state, dispatch } = useDemo();
  const toast = useToast();
  const devBy = useQualityDevBy();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const label = 'アフロ側';
  const run = (priority: 'A' | 'B') => {
    setAnchor(null);
    const n = QUALITY_ITEMS.filter((i) => i.priority === priority && !state.qualityChecks[i.id]?.afroAt).length;
    if (n === 0) {
      toast(`${label}の${priority}区分はすべてチェック済みです`, 'info');
      return;
    }
    dispatch({ type: 'bulkQuality', side, priority, devBy });
    toast(`${label}で${priority}区分 ${n}件を一括チェックしました`);
  };
  return (
    <>
      <Button variant="contained" startIcon={<Building2 size={16} />} onClick={(e) => setAnchor(e.currentTarget)} aria-haspopup="menu">
        {label}で一括チェック
      </Button>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        {(['A', 'B'] as const).map((p) => (
          <MenuItem key={p} onClick={() => run(p)}>
            <Box sx={{ mr: 1.5 }}><PriorityChip priority={p} /></Box>
            <ListItemText
              primary={`${p}区分を一括チェック`}
              secondary={p === 'A' ? '機械的に確認できる項目' : '目視・判断が必要な項目'}
              primaryTypographyProps={{ fontSize: 14, fontWeight: 600 }}
              secondaryTypographyProps={{ fontSize: 12 }}
            />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

export default function QualityPage() {
  const { state, dispatch } = useDemo();
  const toast = useToast();
  const devBy = useQualityDevBy();
  // 管理者・開発者画面ではアフロ側の確認だけを行う。顧客側の承認はお客様ポータルだけ（開発者 0.27.0・管理者 2026-11-12）
  const [selected, setSelected] = useState<QualityCategory | null>(null);
  const overall = computeStats(QUALITY_ITEMS, state.qualityChecks);

  const perCategory = useMemo(
    () =>
      QUALITY_CATEGORIES.map((c) => {
        const items = QUALITY_ITEMS.filter((i) => i.categoryId === c.id);
        return { category: c, items, stats: computeStats(items, state.qualityChecks) };
      }),
    [state.qualityChecks],
  );

  const openItems = QUALITY_ITEMS.filter((i) => !isComplete(state.qualityChecks[i.id]));
  const openByCategory = perCategory.filter((c) => c.stats.open > 0).slice(0, 5);

  // 公開（0.30.1。2026-11-13 ユーザー指示）: 双方確認が済んだら開発者画面から運用の段階へ進める。管理者画面は見るだけ（文言だけ出す）
  const ownerStage = state.projects.find((p) => p.id === state.requirements.projectId)?.stage;
  const canLaunch = openItems.length === 0 && !!state.design.buildCompletedAt && ownerStage === 'quality' && state.requirements.projectId === state.currentProjectId;
  const launch = () => {
    dispatch({ type: 'launchSite', devBy });
    toast('サイトを公開しました。運用の段階へ進みます', 'success');
  };
  const doneText = ownerStage === 'operation' || ownerStage === 'improvement'
    ? 'すべての項目が完了し、サイトを公開しました（運用の段階）。'
    : devBy ? 'すべての項目が完了しました。サイトを公開すると運用の段階へ進みます。' : 'すべての項目が完了しました。開発者がサイトを公開すると運用の段階へ進みます。';

  const kpis = [
    { label: 'アフロ確認', value: overall.afroRate as number | null, n: overall.afro, color: tokens.color.primary, soft: tokens.color.primarySoft, icon: <Building2 size={16} /> },
    { label: '顧客承認', value: overall.clientRate as number | null, n: overall.client, color: tokens.color.success, soft: tokens.color.successSoft, icon: <UserRound size={16} /> },
    { label: '未完了', value: null, n: overall.open, color: tokens.color.warning, soft: tokens.color.warningSoft, icon: <CheckCheck size={16} /> },
  ];

  return (
    <>
      <PageHeader
        eyebrow="④ 品質管理"
        icon={<ShieldCheck size={15} />}
        title="品質チェック"
        description={`12項目${TOTAL_QUALITY_QUESTIONS}問の品質基準のうち、アフロ側の確認を行います。顧客の承認はお客様がお客様ポータルで行います（デモでは代表${QUALITY_ITEMS.length}問を収録）。`}
        actions={
          <>
            {devBy && canLaunch && (
              <Button variant="contained" startIcon={<Rocket size={16} />} onClick={launch}>サイトを公開して運用へ進む</Button>
            )}
            <BulkMenu side="afro" />
          </>
        }
      />

      <Reveal>
        <Surface padding={{ xs: 2.5, md: 3 }} sx={{ mb: 3 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'auto 1fr' }, gap: { xs: 3, md: 5 }, alignItems: 'center' }}>
            <Stack direction="row" spacing={2.5} alignItems="center">
              <ProgressRing value={overall.completeRate} size={112} stroke={10} color={tokens.color.success} label="品質チェック完了率">
                <Box sx={{ textAlign: 'center' }}>
                  <Typography sx={{ fontSize: 26, fontWeight: 750, lineHeight: 1, letterSpacing: '-0.02em' }}>
                    <CountUp value={Math.round(overall.completeRate)} suffix="%" />
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: tokens.color.muted, mt: 0.5 }}>完了</Typography>
                </Box>
              </ProgressRing>
              <Box>
                <Typography variant="h3">{overall.complete} / {overall.total} 項目が完了</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  アフロの確認と顧客の承認が両方揃った項目を「完了」とします
                </Typography>
              </Box>
            </Stack>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)' }, gap: 1.5 }}>
              {kpis.map((k) => (
                <Box
                  key={k.label}
                  sx={{ p: 2, borderRadius: '14px', bgcolor: tokens.color.surfaceMuted, border: `1px solid ${tokens.color.border}`, gridColumn: { xs: k.value === null ? 'span 2' : 'auto', sm: 'auto' } }}
                >
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ color: k.color, mb: 1 }}>
                    <Box sx={{ width: 28, height: 28, borderRadius: '9px', bgcolor: k.soft, display: 'grid', placeItems: 'center' }}>{k.icon}</Box>
                    <Typography variant="subtitle2" sx={{ color: tokens.color.inkSoft }}>{k.label}</Typography>
                  </Stack>
                  <Typography sx={{ fontSize: 26, fontWeight: 720, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                    {k.value === null ? <CountUp value={k.n} suffix="件" /> : <CountUp value={Math.round(k.value)} suffix="%" />}
                  </Typography>
                  <Typography variant="caption">{k.value === null ? 'どちらかが未確認' : `${k.n} / ${overall.total} 項目`}</Typography>
                </Box>
              ))}
            </Box>
          </Box>
        </Surface>
      </Reveal>

      <Surface sx={{ mb: 4 }}>
        <SectionTitle title="未完了の項目" sub={openItems.length > 0 ? <StatusPill tone="warning" dot={false}>{openItems.length}件</StatusPill> : undefined} />
        {openByCategory.length === 0 ? (
          <Typography variant="body2" color="text.secondary">{doneText}</Typography>
        ) : (
          <Stack spacing={1.5}>
            {openByCategory.map(({ category, items }) => {
              const open = items.filter((i) => !isComplete(state.qualityChecks[i.id]));
              return (
                <Box key={category.id} sx={{ p: 1.5, borderRadius: '14px', bgcolor: tokens.color.surfaceMuted }}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                    <Typography variant="h6">{category.no}. {category.title}</Typography>
                    <Button size="small" onClick={() => setSelected(category)} endIcon={<ArrowUpRight size={14} />} aria-label={`${category.title}を開く`}>開く</Button>
                  </Stack>
                  <Stack spacing={0.75}>
                    {open.slice(0, 3).map((i) => {
                      const c = state.qualityChecks[i.id];
                      return (
                        <Stack key={i.id} direction="row" spacing={1} alignItems={{ xs: 'flex-start', sm: 'center' }}>
                          <PriorityChip priority={i.priority} />
                          <Typography variant="body2" sx={{ flex: 1, minWidth: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{i.text}</Typography>
                          <Typography variant="caption" sx={{ flexShrink: 0 }}>{!c?.afroAt ? 'アフロ未確認' : '顧客未承認'}</Typography>
                        </Stack>
                      );
                    })}
                    {open.length > 3 && <Typography variant="caption">ほか {open.length - 3}件</Typography>}
                  </Stack>
                </Box>
              );
            })}
            {perCategory.filter((c) => c.stats.open > 0).length > openByCategory.length && (
              <Typography variant="caption">ほか {perCategory.filter((c) => c.stats.open > 0).length - openByCategory.length}カテゴリに未完了があります</Typography>
            )}
          </Stack>
        )}
      </Surface>

      <SectionTitle title="カテゴリ別の進捗" sub={<Typography variant="caption" sx={{ ml: 1, display: { xs: 'none', sm: 'block' } }}>カードを開いて項目を確認</Typography>} />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0,1fr))', lg: 'repeat(3, minmax(0,1fr))', xl: 'repeat(4, minmax(0,1fr))' }, gap: { xs: 1.5, sm: 2 }, mb: 4 }}>
        {perCategory.map(({ category, items, stats }, i) => {
          const done = stats.open === 0;
          return (
            <Reveal key={category.id} delay={Math.min(i * 0.03, 0.3)}>
              <Surface
                interactive
                role="button"
                tabIndex={0}
                aria-label={`${category.no}. ${category.title}　完了 ${stats.complete}/${stats.total}。詳細を開く`}
                onClick={() => setSelected(category)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelected(category);
                  }
                }}
                padding={{ xs: 1.5, sm: 2, md: 2.5 }}
                sx={{ height: '100%' }}
              >
                <Stack direction="row" alignItems="flex-start" spacing={1.5} sx={{ mb: { xs: 0, sm: 2 } }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: 12, fontWeight: 700, color: tokens.color.muted, fontVariantNumeric: 'tabular-nums' }}>{String(category.no).padStart(2, '0')}</Typography>
                    <Typography variant="h5" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: { sm: 'nowrap' }, fontSize: { xs: 14, sm: undefined } }}>{category.title}</Typography>
                    <Typography variant="caption" sx={{ display: { xs: 'none', sm: 'inline' } }}>{category.questionCount}問中 {items.length}問を収録</Typography>
                  </Box>
                  <ProgressRing value={stats.completeRate} size={44} stroke={5} color={done ? tokens.color.success : tokens.color.primary} label={`${category.title} 完了率`} />
                </Stack>
                <Stack spacing={0.75} sx={{ display: { xs: 'none', sm: 'flex' } }}>
                  <MiniBar label="アフロ" value={stats.afroRate} color={tokens.color.primary} />
                  <MiniBar label="顧客" value={stats.clientRate} color={tokens.color.success} />
                </Stack>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 2, display: { xs: 'none', sm: 'flex' } }}>
                  {done ? <StatusPill tone="success">完了</StatusPill> : <Typography sx={{ fontSize: 12, color: tokens.color.inkSoft }}>残り {stats.open}件</Typography>}
                  <ArrowUpRight size={16} color={tokens.color.faint} />
                </Stack>
              </Surface>
            </Reveal>
          );
        })}
      </Box>

      <Surface>
        <SectionTitle title="承認履歴" icon={<History size={18} color={tokens.color.muted} />} sub={<Typography variant="caption" sx={{ ml: 1 }}>タイムスタンプ付き</Typography>} />
        <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0, maxHeight: 440, overflowY: 'auto', pr: 1 }} aria-label="承認履歴">
          {/* 選んでいる案件の記録だけ（制作データは案件ごと。0.29.0） */}
          {approvalLogsOf(state, state.requirements.projectId).slice(0, 30).map((l, i, arr) => {
            const afro = l.side === 'afro';
            return (
              <Box component="li" key={l.id} sx={{ display: 'grid', gridTemplateColumns: '20px 1fr', gap: 1.5 }}>
                <Box sx={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
                  <Box sx={{ width: 10, height: 10, mt: 0.75, borderRadius: '50%', bgcolor: afro ? tokens.color.primary : tokens.color.success, boxShadow: `0 0 0 4px ${afro ? tokens.color.primarySoft : tokens.color.successSoft}`, zIndex: 1 }} />
                  {i < arr.length - 1 && <Box sx={{ position: 'absolute', top: 20, bottom: -4, width: 2, bgcolor: tokens.color.border }} />}
                </Box>
                <Box sx={{ pb: 2, minWidth: 0 }}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
                    <StatusPill tone={afro ? 'primary' : 'success'} dot={false}>{afro ? 'アフロ' : '顧客'}</StatusPill>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{l.action}</Typography>
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{l.target}</Typography>
                  <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatDateTime(l.at)}・{l.actor}・{relativeTime(l.at)}
                  </Typography>
                </Box>
              </Box>
            );
          })}
        </Box>
      </Surface>

      <CategoryDetail category={selected} onClose={() => setSelected(null)} />
    </>
  );
}
