import { Box, Button, ButtonBase, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';
import { ArrowRight, BadgeCheck, Check, CheckCircle2, ClipboardCheck, Download, Lock, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PageHeader, Reveal, StatusPill, Surface } from '@/components/ui';
import { useDemo } from '@/store/DemoStore';
import { useRepositories } from '@/repositories';
import { useToast } from '@/hooks/useToast';
import { formatDateTime } from '@/services/time';
import { DESIGN_VARIANTS } from '@/data/designs';
import { tokens } from '@/theme/tokens';
import type { DesignId } from '@/types';
import { AREAS } from '@/components/layout/nav';
import { DeviceFrame } from '@/features/design/DeviceFrame';
import { buildProposal } from '@/features/requirements/buildProposal';
import { approvalSteps, type ApprovalKey, type ApprovalStep } from './portalSteps';
import { pendingConfirmations } from '@/features/requirements/assignment';
import { downloadRequirementsDoc } from '@/features/requirements/requirementsDoc';

const AREA = AREAS.portal;

/** keepWhenLocked: 準備中でも中身を出す（要件定義書はデモの進め方の案内を出すため）。それ以外は前の節目が終わるまで中身を出さない */
function StepCard({ step, children, action, keepWhenLocked = false }: { step: ApprovalStep; children?: ReactNode; action?: ReactNode; keepWhenLocked?: boolean }) {
  const approved = step.status === 'approved';
  const locked = step.status === 'locked';
  return (
    <Surface id={step.key} padding={{ xs: 2, md: 3 }} sx={{ scrollMarginTop: tokens.layout.topbar + 16, opacity: locked ? 0.8 : 1 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'flex-start', sm: 'center' }} sx={{ mb: children ? 2 : 0 }}>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{
            width: 36, height: 36, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', fontWeight: 700,
            bgcolor: approved ? tokens.color.successSoft : locked ? tokens.color.bgSubtle : AREA.soft,
            color: approved ? tokens.color.success : locked ? tokens.color.faint : AREA.color,
          }}>
            {approved ? <BadgeCheck size={18} /> : locked ? <Lock size={16} /> : step.no}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h4" component="h2">{step.title}</Typography>
            <Typography variant="caption" sx={{ display: 'block' }}>{locked ? step.lockedReason : step.ask}</Typography>
          </Box>
        </Stack>
        {approved ? (
          <StatusPill tone="success" icon={<BadgeCheck size={13} />}>承認済み {formatDateTime(step.approvedAt)}</StatusPill>
        ) : locked ? (
          <StatusPill tone="neutral">準備中</StatusPill>
        ) : action}
      </Stack>
      {(!locked || keepWhenLocked) && children}
    </Surface>
  );
}

function ConfirmDialog({ open, title, body, onClose, onConfirm }: { open: boolean; title: string; body: string; onClose: () => void; onConfirm: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth aria-labelledby="portal-confirm-title">
      <DialogTitle id="portal-confirm-title">{title}</DialogTitle>
      <DialogContent><Typography variant="body2" color="text.secondary">{body}</Typography></DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button variant="outlined" onClick={onClose}>キャンセル</Button>
        <Button variant="contained" onClick={onConfirm}>承認する</Button>
      </DialogActions>
    </Dialog>
  );
}

const CONFIRM: Record<Exclude<ApprovalKey, 'quality'>, { title: string; body: string; done: string }> = {
  requirements: { title: '要件定義書を承認しますか？', body: '承認すると、この内容をもとにサイトマップとデザインの制作に進みます。承認した日時が記録されます。', done: '要件定義書を承認しました' },
  sitemap: { title: 'サイトマップを承認しますか？', body: '承認すると、このページ構成でデザインを進めます。承認した日時が記録されます。', done: 'サイトマップを承認しました' },
  design: { title: 'このデザインで承認しますか？', body: '承認すると、採用したデザインで全ページの制作に進みます。承認後は案を変更できません。', done: 'トップデザインを承認しました' },
};

export default function PortalApprovalsPage() {
  // サイトマップ・デザインの承認は repository の範囲外（live では隠す。§14）なので DemoStore のまま
  const { state, dispatch } = useDemo();
  const { requirements, approvals } = useRepositories();
  const { data: req } = requirements.useCurrent();
  const toast = useToast();
  const navigate = useNavigate();
  const { hash } = useLocation();
  const [confirm, setConfirm] = useState<Exclude<ApprovalKey, 'quality'> | null>(null);
  // 閉じるアニメーションの間も文言を残す（null にすると一瞬空になる）
  const lastConfirm = useRef<Exclude<ApprovalKey, 'quality'>>('requirements');
  if (confirm) lastConfirm.current = confirm;
  const steps = approvalSteps(state);
  const byKey = Object.fromEntries(steps.map((s) => [s.key, s])) as Record<ApprovalKey, ApprovalStep>;
  const pending = pendingConfirmations(req);
  const proposal = useMemo(() => buildProposal(req.answers, req.competitors), [req.answers, req.competitors]);
  const afterPages = state.sitemap.after.nodes;
  const newPages = afterPages.filter((n) => n.data.kind === 'new');

  // ホームの「ご確認をお願いしたいこと」から #sitemap などで来たら、その項目までスクロール
  useEffect(() => {
    if (!hash) return;
    const t = window.setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' }), 60);
    return () => window.clearTimeout(t);
  }, [hash]);

  const approve = () => {
    if (!confirm) return;
    if (confirm === 'requirements') void approvals.approveRequirements(req.projectId, 'client');
    if (confirm === 'sitemap') dispatch({ type: 'approveSitemap', by: 'client' });
    if (confirm === 'design') dispatch({ type: 'approveDesign', by: 'client' });
    toast(CONFIRM[confirm].done);
    setConfirm(null);
  };

  const approveBtn = (key: Exclude<ApprovalKey, 'quality'>, disabled = false) => (
    <Button variant="contained" startIcon={<CheckCircle2 size={16} />} disabled={disabled} onClick={() => setConfirm(key)} sx={{ flexShrink: 0, alignSelf: { xs: 'stretch', sm: 'auto' } }}>
      承認する
    </Button>
  );

  return (
    <>
      <PageHeader
        eyebrow="お客様ポータル"
        icon={<ClipboardCheck size={15} />}
        title="確認・承認"
        description="制作の節目ごとに、内容をご確認のうえ承認をお願いします。承認した日時はアフロの管理画面にも記録されます。"
      />

      <Stack spacing={{ xs: 2, md: 2.5 }}>
        {/* 1. 要件定義書 */}
        <Reveal>
          <StepCard step={byKey.requirements} action={approveBtn('requirements', pending.length > 0)} keepWhenLocked>
            {byKey.requirements.status === 'waiting' && pending.length > 0 && (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} role="status" sx={{ mb: 2, px: 1.5, py: 1, borderRadius: 2, bgcolor: tokens.color.warningSoft }}>
                <Typography variant="caption" sx={{ flex: 1, color: '#8A5402', fontWeight: 650 }}>
                  アフロが回答の内容を確認しています（{pending.length} 問）。確認が終わると承認できます。
                </Typography>
              </Stack>
            )}
            {req.status !== 'draft' && (
              <Button size="small" variant="outlined" startIcon={<Download size={15} />} onClick={() => { downloadRequirementsDoc(state); toast('要件定義書をダウンロードしました'); }} sx={{ mb: 2 }}>
                要件定義書をダウンロード
              </Button>
            )}
            {req.status === 'draft' ? (
              <Typography variant="caption" component="p" sx={{ px: 1.5, py: 1, borderRadius: 2, bgcolor: tokens.color.bgSubtle }}>
                デモ: 管理者画面の「AI Studio」でヒアリングの内容を入力して AI 分析すると、ここに要件定義書が届きます。
              </Typography>
            ) : (
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '200px minmax(0,1fr)' }, gap: 2 }}>
                <Stack direction="row" spacing={2} sx={{ p: 2, borderRadius: 3, bgcolor: tokens.color.surfaceMuted, alignItems: 'center', justifyContent: 'center' }}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="caption">現状</Typography>
                    <Typography sx={{ fontSize: 26, fontWeight: 750, color: tokens.color.muted }}>{proposal.currentScore}</Typography>
                  </Box>
                  <ArrowRight size={18} color={tokens.color.faint} />
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="caption">改善後の見込み</Typography>
                    <Typography sx={{ fontSize: 26, fontWeight: 750, color: AREA.color }}>{proposal.projectedScore}</Typography>
                  </Box>
                </Stack>
                <Stack component="ol" spacing={1} sx={{ m: 0, pl: 2.5 }}>
                  {proposal.points.slice(0, 4).map((pt) => (
                    <li key={pt.id}>
                      <Typography variant="body2" sx={{ fontWeight: 650 }}>{pt.title}</Typography>
                      <Typography variant="caption">{pt.impact}</Typography>
                    </li>
                  ))}
                </Stack>
              </Box>
            )}
          </StepCard>
        </Reveal>

        {/* 2. サイトマップ */}
        <Reveal delay={0.04}>
          <StepCard step={byKey.sitemap} action={approveBtn('sitemap')}>
            <Typography variant="body2" sx={{ mb: 1.5 }}>
              リニューアル後は <b>{afterPages.length}</b> ページの構成です（新しく作るページ <b>{newPages.length}</b>）。
            </Typography>
            <Box component="ul" sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, listStyle: 'none', m: 0, p: 0 }}>
              {afterPages.map((n) => (
                <Box
                  component="li" key={n.id} title={n.data.reason}
                  sx={{
                    px: 1.25, py: 0.5, borderRadius: 2, fontSize: 13, fontWeight: 600,
                    bgcolor: n.data.kind === 'new' ? AREA.soft : tokens.color.bgSubtle, color: n.data.kind === 'new' ? AREA.color : tokens.color.inkSoft,
                  }}
                >
                  {n.data.kind === 'new' && <Sparkles size={12} style={{ marginRight: 4, verticalAlign: '-1px' }} />}
                  {n.data.label}
                </Box>
              ))}
            </Box>
            {newPages.some((n) => n.data.reason) && (
              <Stack spacing={0.75} sx={{ mt: 2 }}>
                {newPages.filter((n) => n.data.reason).slice(0, 3).map((n) => (
                  <Typography key={n.id} variant="caption" sx={{ display: 'block' }}>
                    <b>{n.data.label}</b>: {n.data.reason}
                  </Typography>
                ))}
              </Stack>
            )}
          </StepCard>
        </Reveal>

        {/* 3. トップデザイン */}
        <Reveal delay={0.08}>
          <StepCard step={byKey.design} action={approveBtn('design', !state.design.selected)}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0,1fr))' }, gap: 1.5 }} role="radiogroup" aria-label="採用するデザイン">
              {DESIGN_VARIANTS.map((v) => {
                const selected = state.design.selected === v.id;
                const locked = !!state.design.approvedAt;
                return (
                  <ButtonBase
                    key={v.id}
                    role="radio"
                    aria-checked={selected}
                    disabled={locked && !selected}
                    onClick={() => !locked && dispatch({ type: 'selectDesign', id: v.id as DesignId })}
                    sx={{
                      display: 'block', textAlign: 'left', p: 1, borderRadius: 3,
                      border: `2px solid ${selected ? AREA.color : tokens.color.border}`,
                      '&.Mui-disabled': { opacity: 0.5 },
                    }}
                  >
                    <Box sx={{ position: 'relative', borderRadius: '10px', overflow: 'hidden', bgcolor: tokens.color.bgSubtle }}>
                      <DeviceFrame design={v.id} device="pc" thumbnail viewportHeight={720} />
                      {selected && (
                        <Box sx={{ position: 'absolute', top: 8, right: 8, width: 24, height: 24, borderRadius: '50%', bgcolor: AREA.color, color: '#fff', display: 'grid', placeItems: 'center' }}>
                          <Check size={14} strokeWidth={3} />
                        </Box>
                      )}
                    </Box>
                    <Typography variant="overline" sx={{ display: 'block', mt: 1, color: AREA.color }}>{v.label}</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 650 }}>{v.name}</Typography>
                    <Typography variant="caption">{v.tagline}</Typography>
                  </ButtonBase>
                );
              })}
            </Box>
            {!state.design.selected && <Typography variant="caption" sx={{ display: 'block', mt: 1.5 }}>案を 1 つ選ぶと承認できます。</Typography>}
          </StepCard>
        </Reveal>

        {/* 4. 品質チェック */}
        <Reveal delay={0.12}>
          <StepCard
            step={byKey.quality}
            action={<Button variant="contained" endIcon={<ArrowRight size={16} />} onClick={() => navigate('/portal/quality')} sx={{ flexShrink: 0, alignSelf: { xs: 'stretch', sm: 'auto' } }}>チェックする</Button>}
          >
            {byKey.quality.progress && (
              <Box>
                <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.75 }}>
                  <Typography variant="caption">お客様の確認</Typography>
                  <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 650 }}>{byKey.quality.progress.done} / {byKey.quality.progress.total}</Typography>
                </Stack>
                <Box sx={{ height: 8, borderRadius: 4, bgcolor: tokens.color.bgSubtle, overflow: 'hidden' }}>
                  <Box sx={{ height: '100%', width: `${(byKey.quality.progress.done / byKey.quality.progress.total) * 100}%`, bgcolor: AREA.color, transition: 'width .3s' }} />
                </Box>
              </Box>
            )}
          </StepCard>
        </Reveal>
      </Stack>

      <ConfirmDialog
        open={!!confirm}
        title={CONFIRM[lastConfirm.current].title}
        body={CONFIRM[lastConfirm.current].body}
        onClose={() => setConfirm(null)}
        onConfirm={approve}
      />
    </>
  );
}
