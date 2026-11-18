import { Box, Button, Collapse, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Stack, Switch, Typography } from '@mui/material';
import { ArrowLeft, BadgeCheck, CheckCircle2, ChevronDown, ListChecks, Lock } from 'lucide-react';
import { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { NotYetPanel, PageHeader, ProgressRing, Surface } from '@/components/ui';
import { useDemo } from '@/store/DemoStore';
import { useToast } from '@/hooks/useToast';
import { QUALITY_CATEGORIES, QUALITY_ITEMS } from '@/data/quality';
import { tokens } from '@/theme/tokens';
import { formatDateTime } from '@/services/time';
import { AREAS } from '@/components/layout/nav';
import { CheckToggle } from '@/features/quality/CheckToggle';
import { approvalSteps } from './portalSteps';
import { SitePreviewButton } from '@/features/quality/SitePreviewButton';

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
  // 全項目にチェックしたら「完了」を押す。押した後はチェックを変えられない（0.39.7。2026-11-16 ユーザー指示。reducer でも止めている）
  const approvedAt = state.design.qualityApprovedAt;
  const approved = !!approvedAt;
  // 完了の後はアフロ側も変えられないので、アフロ側の確認が全部済んでから完了できる（reducer と同じ条件）
  const afroDone = QUALITY_ITEMS.every((i) => !!checks[i.id]?.afroAt);
  const allChecked = !approved && total > 0 && done === total && !!state.design.buildCompletedAt;
  const canComplete = allChecked && afroDone;
  const [confirm, setConfirm] = useState(false);
  const completeQuality = () => {
    dispatch({ type: 'approveQuality', by: 'client' });
    setConfirm(false);
    toast('品質チェックを完了しました', 'success');
  };
  const navigate = useNavigate();
  // まだ依頼されていない（確認・承認の「品質チェック」が locked）ときは、URL を直接開いてもチェックを出さず理由を出す（2026-11-17 会議）
  const step = approvalSteps(state).find((x) => x.key === 'quality');
  const back = (
    <Button component={RouterLink} to="/portal/approvals" size="small" startIcon={<ArrowLeft size={16} />} sx={{ mb: 2, ml: -1 }}>
      確認・承認
    </Button>
  );
  if (!approved && step?.status === 'locked') {
    return (
      <>
        {back}
        <PageHeader eyebrow="お客様ポータル" icon={<ListChecks size={15} />} title="品質確認" description="公開前に、お客様の目で確認していただきたい項目です。" />
        <NotYetPanel
          icon={<Lock size={26} />}
          title="品質確認はまだ始まっていません"
          description={step.lockedReason ?? '準備ができると、確認のお願いが届きます。'}
          actionLabel="確認・承認へ"
          onAction={() => navigate('/portal/approvals')}
        />
      </>
    );
  }

  return (
    <>
      {/* 戻る導線（2026-11-16 ユーザー指示）。メニューから外し、確認・承認の「品質チェック」から開く画面なので確認・承認へ戻す */}
      <Button component={RouterLink} to="/portal/approvals" size="small" startIcon={<ArrowLeft size={16} />} sx={{ mb: 2, ml: -1 }}>
        確認・承認
      </Button>
      <PageHeader
        eyebrow="お客様ポータル"
        icon={<ListChecks size={15} />}
        title="品質確認"
        description="公開前に、お客様の目で確認していただきたい項目です。確認した項目にチェックを付けてください（チェックした日時が記録されます）。"
        actions={<SitePreviewButton checkScreen="品質確認" />}
      />

      <Stack spacing={{ xs: 2, md: 2.5 }}>
        {approved && (
          <Box role="note" sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1, borderRadius: 2, bgcolor: tokens.color.surfaceMuted, color: tokens.color.inkSoft, fontSize: 13.5 }}>
            <Lock size={15} aria-hidden /> 品質チェックは完了済み（{formatDateTime(approvedAt)}）のため、チェックを変更できません
          </Box>
        )}
        {allChecked && !afroDone && (
          <Box role="status" sx={{ px: 2, py: 1.5, borderRadius: 3, bgcolor: tokens.color.bgSubtle }}>
            <Typography variant="body2">すべての項目を確認しました。アフロの確認が終わると「完了する」を押せます（いまアフロ確認済み {QUALITY_ITEMS.filter((i) => !!checks[i.id]?.afroAt).length} / {total}）。</Typography>
          </Box>
        )}
        {canComplete && (
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} role="status" sx={{ px: 2, py: 1.5, borderRadius: 3, bgcolor: AREA.soft }}>
            <Typography variant="body2" sx={{ flex: 1, fontWeight: 600 }}>すべての項目を確認しました。内容に問題がなければ「完了する」を押してください。</Typography>
            <Button variant="contained" startIcon={<CheckCircle2 size={16} />} onClick={() => setConfirm(true)} sx={{ flexShrink: 0 }}>完了する</Button>
          </Stack>
        )}
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
                        <CheckToggle side="client" label="お客様" check={checks[item.id]} itemText={item.text} readOnly={approved} onToggle={() => dispatch({ type: 'toggleQuality', itemId: item.id, side: 'client' })} />
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

      <Dialog open={confirm} onClose={() => setConfirm(false)} maxWidth="xs" fullWidth>
        <DialogTitle>品質チェックを完了しますか？</DialogTitle>
        <DialogContent>
          <Typography variant="body2">完了すると、チェックの取り消し・変更はできなくなります。アフロが公開の準備に進みます。</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(false)}>キャンセル</Button>
          <Button variant="contained" onClick={completeQuality}>完了する</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
