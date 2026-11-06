import { Box, Button, Collapse, FormControlLabel, Stack, Switch, Typography } from '@mui/material';
import { BadgeCheck, ChevronDown, ListChecks } from 'lucide-react';
import { useState } from 'react';
import { PageHeader, ProgressRing, Surface } from '@/components/ui';
import { useDemo } from '@/store/DemoStore';
import { useToast } from '@/hooks/useToast';
import { QUALITY_CATEGORIES, QUALITY_ITEMS } from '@/data/quality';
import { tokens } from '@/theme/tokens';
import { AREAS } from '@/components/layout/nav';
import { CheckToggle } from '@/features/quality/CheckToggle';

const AREA = AREAS.portal;

/**
 * お客様側の品質確認。アフロ側のチェックは管理者画面で行い、ここでは「顧客確認」だけを付ける。
 * 資料: 12項目110問（デモは代表 58 項目を収録）、チェックするとタイムスタンプに変わる。
 */
export default function PortalQualityPage() {
  const { state, dispatch } = useDemo();
  const toast = useToast();
  const [openId, setOpenId] = useState<string | null>(QUALITY_CATEGORIES[0]?.id ?? null);
  const [onlyTodo, setOnlyTodo] = useState(false);
  const checks = state.qualityChecks;
  const done = QUALITY_ITEMS.filter((i) => !!checks[i.id]?.clientAt).length;
  const total = QUALITY_ITEMS.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <>
      <PageHeader
        eyebrow="お客様ポータル"
        icon={<ListChecks size={15} />}
        title="品質確認"
        description="公開前に、お客様の目で確認していただきたい項目です。確認した項目にチェックを付けてください（チェックした日時が記録されます）。"
      />

      <Stack spacing={{ xs: 2, md: 2.5 }}>
        <Surface>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
            <Stack direction="row" spacing={2} alignItems="center" sx={{ flex: 1 }}>
              <ProgressRing value={pct} size={64} stroke={7} color={AREA.color} label={`お客様の確認 ${pct}%`}>
                <Typography sx={{ fontWeight: 750, fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>{pct}%</Typography>
              </ProgressRing>
              <Box>
                <Typography variant="h4" component="p">{done} / {total} 項目を確認済み</Typography>
                <Typography variant="caption">アフロの確認が済んだ項目には「アフロ確認済み」と表示しています</Typography>
              </Box>
            </Stack>
            <FormControlLabel control={<Switch checked={onlyTodo} onChange={(e) => setOnlyTodo(e.target.checked)} />} label="未確認のみ表示" sx={{ mr: 0 }} />
          </Stack>
        </Surface>

        {QUALITY_CATEGORIES.map((c) => {
          const items = QUALITY_ITEMS.filter((i) => i.categoryId === c.id);
          if (items.length === 0) return null;
          const catDone = items.filter((i) => !!checks[i.id]?.clientAt).length;
          const shown = onlyTodo ? items.filter((i) => !checks[i.id]?.clientAt) : items;
          if (onlyTodo && shown.length === 0) return null;
          const open = openId === c.id;
          const complete = catDone === items.length;
          return (
            <Surface key={c.id} padding={0} sx={{ overflow: 'hidden' }}>
              <Box
                component="button"
                type="button"
                onClick={() => setOpenId(open ? null : c.id)}
                aria-expanded={open}
                sx={{
                  all: 'unset', boxSizing: 'border-box', width: '100%', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 1.5, px: { xs: 2, md: 2.5 }, py: 1.75,
                  '&:focus-visible': { boxShadow: `inset ${tokens.shadow.focus}` }, '&:hover': { bgcolor: tokens.color.surfaceMuted },
                }}
              >
                <Box sx={{ width: 30, height: 30, borderRadius: '9px', flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700, bgcolor: complete ? tokens.color.successSoft : tokens.color.bgSubtle, color: complete ? tokens.color.success : tokens.color.inkSoft }}>
                  {complete ? <BadgeCheck size={16} /> : c.no}
                </Box>
                <Typography variant="body1" sx={{ flex: 1, minWidth: 0, fontWeight: 650 }} noWrap>{c.title}</Typography>
                <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 650 }}>{catDone} / {items.length}</Typography>
                <ChevronDown size={18} color={tokens.color.muted} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s', flexShrink: 0 }} />
              </Box>
              <Collapse in={open} unmountOnExit>
                <Box sx={{ borderTop: `1px solid ${tokens.color.border}`, px: { xs: 2, md: 2.5 }, py: 1.5 }}>
                  <Stack component="ul" spacing={0} sx={{ listStyle: 'none', m: 0, p: 0 }}>
                    {shown.map((item) => (
                      <Stack
                        component="li" key={item.id} direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1, sm: 2 }} alignItems={{ sm: 'center' }}
                        sx={{ py: 1.25, '&:not(:last-of-type)': { borderBottom: `1px dashed ${tokens.color.border}` } }}
                      >
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="body2" sx={{ fontWeight: 550 }}>{item.text}</Typography>
                          {checks[item.id]?.afroAt && <Typography variant="caption" sx={{ color: tokens.color.primary }}>アフロ確認済み</Typography>}
                        </Box>
                        <CheckToggle side="client" label="お客様" check={checks[item.id]} itemText={item.text} onToggle={() => dispatch({ type: 'toggleQuality', itemId: item.id, side: 'client' })} />
                      </Stack>
                    ))}
                  </Stack>
                  {!complete && (
                    <Button
                      size="small" variant="outlined" sx={{ mt: 1.5 }}
                      onClick={() => { dispatch({ type: 'bulkQuality', side: 'client', priority: 'all', categoryId: c.id }); toast(`「${c.title}」をまとめて確認しました`); }}
                    >
                      このカテゴリをまとめて確認
                    </Button>
                  )}
                </Box>
              </Collapse>
            </Surface>
          );
        })}
      </Stack>
    </>
  );
}
