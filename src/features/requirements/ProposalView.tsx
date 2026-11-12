import { Box, Button, Dialog, DialogActions, DialogContent, Stack, Typography } from '@mui/material';
import { ArrowRight, BadgeCheck, CheckCircle2, Download, Globe, Quote, RotateCcw, Send, Target, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { REQUIREMENT_QUESTIONS } from '@/data/requirements';
import { DATA_MODE, useCurrentRequirements, useRepositories } from '@/repositories';
import { useWrite } from '@/hooks/useWrite';
import { AiBadge, CountUp, ProgressRing, Reveal, StatusPill, Surface, type PillTone } from '@/components/ui';
import { useToast } from '@/hooks/useToast';
import { formatDateTime } from '@/services/time';
import { palette, tokens } from '@/theme/tokens';
import type { ProposalPoint } from '@/types';
import { buildProposal } from './buildProposal';
import { isAnswered } from './validation';
import { pendingConfirmations } from './assignment';
import { downloadRequirementsDoc } from './requirementsDoc';
import { useHearingRoutes } from './hearingRoutes';
import { useLiveRoleOptional } from '@/live/session';

const PRIORITY: Record<ProposalPoint['priority'], { label: string; tone: PillTone; color: string }> = {
  high: { label: '優先度 高', tone: 'danger', color: tokens.color.danger },
  medium: { label: '優先度 中', tone: 'warning', color: tokens.color.warning },
  low: { label: '優先度 低', tone: 'neutral', color: tokens.color.faint },
};

/**
 * variant='client'（live のお客様ポータル）: お客様本人の「承認する」だけを出す（§25-2。代理承認は live に無い）。
 * live の開発者: 承認待ちの間だけ「差し戻す」（requirements.reset＝analyzed → draft。回答は残す。§6）。
 * live では保存した提案（req.proposal＝承認の対象と同じ写し）を見せる。無ければ回答から作る（demo は常に回答から作る）
 */
export function ProposalView({ variant = 'staff' }: { variant?: 'staff' | 'client' }) {
  const { requirements, approvals, projects } = useRepositories();
  const { data: req } = useCurrentRequirements();
  const { data: projectList } = projects.useList();
  const navigate = useNavigate();
  // 開発者画面（/dev/hearing）では要件定義書を見るだけ。やり直し・代理承認・サイトマップへ進むは管理者画面だけに出す（0.25.0）
  const { dev } = useHearingRoutes();
  const toast = useToast();
  const write = useWrite();
  // 確認ダイアログ: sendBack＝差し戻す（回答は残す）／ reset＝回答をやり直す（demo だけ。全消去）
  const [confirmReset, setConfirmReset] = useState<false | 'sendBack' | 'reset'>(false);
  const approved = req.status === 'approved';
  const live = DATA_MODE === 'live';
  const role = useLiveRoleOptional();
  const client = variant === 'client';
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [approving, setApproving] = useState(false);
  const proposal = useMemo(() => req.proposal ?? buildProposal(req.answers, req.competitors), [req.proposal, req.answers, req.competitors]);
  // 差し戻し: demo は管理者画面の「差し戻す」（承認待ちの間）と「回答をやり直す」、live はアサインされた開発者の「差し戻す」（承認待ちの間だけ）
  const canReset = live ? role === 'developer' && req.status === 'analyzed' && !client : !approved && !dev;
  const answered = REQUIREMENT_QUESTIONS.filter((q) => isAnswered(req.answers[q.id])).length;
  // 内容の確認待ちの回答（0.17 までの保存データでお客様が入力したもの）が残っている間は承認できない（reducer と同じ条件）
  const pending = pendingConfirmations(req).length;

  return (
    <Stack spacing={2.5}>
      {/* 提案書の表紙 */}
      <Reveal>
        <Surface padding={0} sx={{ overflow: 'hidden' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.4fr 1fr' } }}>
            <Box sx={{ p: { xs: 2.5, md: 4 } }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2, flexWrap: 'wrap', rowGap: 1 }}>
                <AiBadge />
                <Typography variant="caption">作成 {formatDateTime(req.analyzedAt)}</Typography>
              </Stack>
              <Typography variant="overline" sx={{ display: 'block' }}>Renewal Proposal</Typography>
              <Typography variant="h2" component="h2" sx={{ mb: 1 }}>改善提案書</Typography>
              <Stack direction="row" spacing={0.75} alignItems="center" sx={{ color: tokens.color.muted, mb: 2.5 }}>
                <Globe size={15} />
                <Typography variant="body2" sx={{ fontWeight: 600, color: tokens.color.inkSoft }}>{proposal.hostname}</Typography>
                {proposal.competitors.length > 0 && <Typography variant="body2">／ 競合 {proposal.competitors.join('・')}</Typography>}
              </Stack>
              {proposal.issue && (
                <Box sx={{ display: 'flex', gap: 1.25, p: 2, borderRadius: 3, bgcolor: tokens.color.surfaceMuted, border: `1px solid ${tokens.color.border}`, mb: 2 }}>
                  <Quote size={18} color={tokens.color.faint} style={{ flexShrink: 0, marginTop: 2 }} />
                  <Box>
                    <Typography variant="caption" sx={{ display: 'block', mb: 0.25 }}>ご回答いただいた課題</Typography>
                    <Typography variant="body2" sx={{ color: tokens.color.ink }}>{proposal.issue}</Typography>
                  </Box>
                </Box>
              )}
              <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
                {[...proposal.purposes, ...proposal.improves].slice(0, 8).map((t) => (
                  <StatusPill key={t} tone="primary" dot={false} icon={<Target size={12} />}>{t}</StatusPill>
                ))}
              </Stack>
            </Box>
            <Box sx={{ p: { xs: 2.5, md: 4 }, bgcolor: tokens.color.scoreboardBg, color: '#fff', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2.5 }}>
              <Typography variant="overline" sx={{ color: 'rgba(255,255,255,.6)' }}>サイトスコア（AI推定）</Typography>
              <Stack direction="row" spacing={3} alignItems="center">
                <ProgressRing value={proposal.currentScore} size={84} stroke={7} color="#94A3B8" track="rgba(255,255,255,.12)" label="現状スコア">
                  <Box sx={{ textAlign: 'center' }}>
                    <Box sx={{ fontSize: 22, fontWeight: 700 }}><CountUp value={proposal.currentScore} /></Box>
                    <Box sx={{ fontSize: 12, opacity: 0.6, fontWeight: 600 }}>現状</Box>
                  </Box>
                </ProgressRing>
                <ArrowRight size={20} color="rgba(255,255,255,.4)" />
                <ProgressRing value={proposal.projectedScore} size={84} stroke={7} color={palette.light.inversePrimary} track="rgba(255,255,255,.12)" label="改善後の見込みスコア">
                  <Box sx={{ textAlign: 'center' }}>
                    <Box sx={{ fontSize: 22, fontWeight: 700 }}><CountUp value={proposal.projectedScore} duration={1400} /></Box>
                    <Box sx={{ fontSize: 12, opacity: 0.6, fontWeight: 600 }}>改善後</Box>
                  </Box>
                </ProgressRing>
              </Stack>
              <Stack direction="row" spacing={1} alignItems="center">
                <TrendingUp size={16} color="#6EE7B7" />
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,.85)' }}>
                  提案を実施すると <b>+{proposal.projectedScore - proposal.currentScore}pt</b> の改善見込み
                </Typography>
              </Stack>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,.55)' }}>
                ヒアリングの回答 {answered}問から作成。{live ? 'AI による推定値です。' : 'デモ用の推定値です。'}
              </Typography>
            </Box>
          </Box>
        </Surface>
      </Reveal>

      {/* 改善ポイント */}
      <Box>
        <Typography variant="h4" component="h2" sx={{ mb: 1.5 }}>改善ポイントと提案内容</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', xl: 'repeat(3, 1fr)' }, gap: 2 }}>
          {proposal.points.map((p, i) => {
            const pr = PRIORITY[p.priority];
            return (
              <Reveal key={p.id} delay={0.05 + i * 0.06}>
                <Surface sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 1.25, borderTop: `3px solid ${pr.color}` }}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                    <Typography variant="overline" sx={{ color: tokens.color.muted }}>{String(i + 1).padStart(2, '0')} · {p.area}</Typography>
                    <StatusPill tone={pr.tone}>{pr.label}</StatusPill>
                  </Stack>
                  <Typography variant="h4" component="h3">{p.title}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>{p.detail}</Typography>
                  <Stack direction="row" spacing={0.75} alignItems="center" sx={{ pt: 1.25, borderTop: `1px dashed ${tokens.color.border}`, color: tokens.color.success }}>
                    <TrendingUp size={15} />
                    <Typography variant="body2" sx={{ fontWeight: 650, color: 'inherit' }}>{p.impact}</Typography>
                  </Stack>
                </Surface>
              </Reveal>
            );
          })}
        </Box>
      </Box>

      {/* 承認 */}
      <Reveal delay={0.3}>
        <Surface tone="muted">
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="h4" component="h2">要件定義書の承認</Typography>
              <Typography variant="body2" color="text.secondary">
                {client ? '内容をご確認のうえ「承認する」を押してください。承認後に内容を変える場合は、アフロの担当者へご連絡ください。' : '承認されると、この内容をもとにサイトマップとデザイン案の作成に進みます。'}
              </Typography>
              {!approved && !client && (
                <Stack direction="row" spacing={0.75} alignItems="center" role="status" sx={{ mt: 1, color: tokens.color.infoInk }}>
                  <Send size={14} style={{ flexShrink: 0 }} />
                  <Typography variant="caption" sx={{ color: 'inherit', fontWeight: 650 }}>お客様ポータルの「確認・承認」で、お客様に承認を依頼しています</Typography>
                </Stack>
              )}
              {!approved && pending > 0 && (
                <Typography variant="caption" role="status" sx={{ display: 'block', mt: 0.5, color: tokens.color.warningInk, fontWeight: 650 }}>
                  内容の確認が済んでいない回答が {pending} 問あります。「回答の一覧」で確認すると承認できます。
                </Typography>
              )}
            </Box>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ flexWrap: 'wrap' }}>
              {/* 差し戻す（回答を残して入力へ戻す）は demo・live 共通。demo は承認待ちの間だけ（0.29.3） */}
              {canReset && (live || req.status === 'analyzed') && <Button variant="text" startIcon={<RotateCcw size={16} />} onClick={() => setConfirmReset('sendBack')}>差し戻す</Button>}
              {canReset && !live && <Button variant="text" onClick={() => setConfirmReset('reset')}>回答をやり直す</Button>}
              <Button variant="outlined" startIcon={<Download size={16} />} onClick={() => { downloadRequirementsDoc({ requirements: req, projects: projectList }); toast('要件定義書をダウンロードしました'); }}>要件定義書をダウンロード</Button>
              {approved ? (
                <Box
                  role="status"
                  sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, minHeight: 40, borderRadius: 3, bgcolor: tokens.color.successSoft, color: tokens.color.successInk, fontWeight: 650, fontSize: 14 }}
                >
                  <BadgeCheck size={18} /> 承認済み {formatDateTime(req.approvedAt)}
                </Box>
              ) : client ? (
                <Button variant="contained" startIcon={<CheckCircle2 size={16} />} disabled={approving} onClick={() => setConfirmApprove(true)}>
                  承認する
                </Button>
              ) : !dev && !live && (
                <Button variant="outlined" startIcon={<CheckCircle2 size={16} />} disabled={pending > 0} onClick={() => { void write(approvals.approveRequirements(req.projectId), '要件定義書を承認しました'); }}>
                  アフロが代わりに承認
                </Button>
              )}
              {!dev && !live && <Button variant="contained" endIcon={<ArrowRight size={16} />} onClick={() => navigate('/site')}>サイトマップへ進む</Button>}
            </Stack>
          </Stack>
        </Surface>
      </Reveal>

      <Dialog open={confirmReset !== false} onClose={() => setConfirmReset(false)} maxWidth="xs" fullWidth aria-labelledby="req-reset-title">
        <DialogContent sx={{ pt: 3 }}>
          <Typography id="req-reset-title" variant="h3" sx={{ mb: 1 }}>{confirmReset === 'reset' ? '回答をやり直しますか？' : '承認の依頼を差し戻しますか？'}</Typography>
          <Typography variant="body2" color="text.secondary">
            {confirmReset === 'reset' ? 'ヒアリングの回答と提案書が消え、最初の質問に戻ります。' : 'お客様の承認待ちを取り下げ、ヒアリングの入力に戻します。回答は残ります。直した後にもう一度 AI 分析を実行してください。'}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button variant="outlined" onClick={() => setConfirmReset(false)}>キャンセル</Button>
          <Button
            variant="contained"
            onClick={() => {
              const task = confirmReset === 'reset' ? requirements.reset(req.projectId) : (requirements.sendBack ?? requirements.reset)(req.projectId);
              void write(task, confirmReset === 'reset' ? undefined : '承認の依頼を差し戻しました');
              setConfirmReset(false);
            }}
          >
            {confirmReset === 'reset' ? 'やり直す' : '差し戻す'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmApprove} onClose={() => !approving && setConfirmApprove(false)} maxWidth="xs" fullWidth aria-labelledby="req-approve-title">
        <DialogContent sx={{ pt: 3 }}>
          <Typography id="req-approve-title" variant="h3" sx={{ mb: 1 }}>要件定義書を承認しますか？</Typography>
          <Typography variant="body2" color="text.secondary">承認すると、この内容でサイトの制作に進みます。承認の記録（日時・お名前）が残ります。</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button variant="outlined" disabled={approving} onClick={() => setConfirmApprove(false)}>キャンセル</Button>
          <Button
            variant="contained" disabled={approving}
            onClick={() => {
              setApproving(true);
              void write(approvals.approveRequirements(req.projectId, 'client'), '要件定義書を承認しました').then(() => {
                setApproving(false);
                setConfirmApprove(false);
              });
            }}
          >
            {approving ? '承認しています…' : '承認する'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
