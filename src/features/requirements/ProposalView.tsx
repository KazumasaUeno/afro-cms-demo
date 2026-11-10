import { Box, Button, Dialog, DialogActions, DialogContent, Stack, Typography } from '@mui/material';
import { ArrowRight, BadgeCheck, CheckCircle2, Download, Globe, Quote, RotateCcw, Send, Target, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { REQUIREMENT_QUESTIONS, TOTAL_REQUIREMENT_QUESTIONS } from '@/data/requirements';
import { useRepositories } from '@/repositories';
import { AiBadge, CountUp, ProgressRing, Reveal, StatusPill, Surface, type PillTone } from '@/components/ui';
import { useToast } from '@/hooks/useToast';
import { formatDateTime } from '@/services/time';
import { tokens } from '@/theme/tokens';
import type { ProposalPoint } from '@/types';
import { buildProposal } from './buildProposal';
import { isAnswered } from './validation';
import { pendingConfirmations } from './assignment';
import { downloadRequirementsDoc } from './requirementsDoc';

const PRIORITY: Record<ProposalPoint['priority'], { label: string; tone: PillTone; color: string }> = {
  high: { label: '優先度 高', tone: 'danger', color: tokens.color.danger },
  medium: { label: '優先度 中', tone: 'warning', color: tokens.color.warning },
  low: { label: '優先度 低', tone: 'neutral', color: tokens.color.faint },
};

export function ProposalView() {
  const { requirements, approvals, projects } = useRepositories();
  const { data: req } = requirements.useCurrent();
  const { data: projectList } = projects.useList();
  const navigate = useNavigate();
  const toast = useToast();
  const [confirmReset, setConfirmReset] = useState(false);
  const proposal = useMemo(() => buildProposal(req.answers, req.competitors), [req.answers, req.competitors]);
  const answered = REQUIREMENT_QUESTIONS.filter((q) => isAnswered(req.answers[q.id])).length;
  const approved = req.status === 'approved';
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
            <Box sx={{ p: { xs: 2.5, md: 4 }, bgcolor: tokens.color.ink, color: '#fff', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2.5 }}>
              <Typography variant="overline" sx={{ color: 'rgba(255,255,255,.6)' }}>サイトスコア（AI推定）</Typography>
              <Stack direction="row" spacing={3} alignItems="center">
                <ProgressRing value={proposal.currentScore} size={84} stroke={7} color="#94A3B8" track="rgba(255,255,255,.12)" label="現状スコア">
                  <Box sx={{ textAlign: 'center' }}>
                    <Box sx={{ fontSize: 22, fontWeight: 700 }}><CountUp value={proposal.currentScore} /></Box>
                    <Box sx={{ fontSize: 12, opacity: 0.6, fontWeight: 600 }}>現状</Box>
                  </Box>
                </ProgressRing>
                <ArrowRight size={20} color="rgba(255,255,255,.4)" />
                <ProgressRing value={proposal.projectedScore} size={84} stroke={7} color="#8B9DFF" track="rgba(255,255,255,.12)" label="改善後の見込みスコア">
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
                要件 {TOTAL_REQUIREMENT_QUESTIONS}問のうち {answered}問の回答から作成。デモ用の推定値です。
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
              <Typography variant="body2" color="text.secondary">承認されると、この内容をもとにサイトマップとデザイン案の作成に進みます。</Typography>
              {!approved && (
                <Stack direction="row" spacing={0.75} alignItems="center" role="status" sx={{ mt: 1, color: '#0B6699' }}>
                  <Send size={14} style={{ flexShrink: 0 }} />
                  <Typography variant="caption" sx={{ color: 'inherit', fontWeight: 650 }}>お客様ポータルの「確認・承認」で、お客様に承認を依頼しています</Typography>
                </Stack>
              )}
              {!approved && pending > 0 && (
                <Typography variant="caption" role="status" sx={{ display: 'block', mt: 0.5, color: '#8A5402', fontWeight: 650 }}>
                  内容の確認が済んでいない回答が {pending} 問あります。「回答の一覧」で確認すると承認できます。
                </Typography>
              )}
            </Box>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ flexWrap: 'wrap' }}>
              {!approved && <Button variant="text" startIcon={<RotateCcw size={16} />} onClick={() => setConfirmReset(true)}>回答をやり直す</Button>}
              <Button variant="outlined" startIcon={<Download size={16} />} onClick={() => { downloadRequirementsDoc({ requirements: req, projects: projectList }); toast('要件定義書をダウンロードしました'); }}>要件定義書をダウンロード</Button>
              {approved ? (
                <Box
                  role="status"
                  sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, minHeight: 40, borderRadius: 3, bgcolor: tokens.color.successSoft, color: '#08765A', fontWeight: 650, fontSize: 14 }}
                >
                  <BadgeCheck size={18} /> 承認済み {formatDateTime(req.approvedAt)}
                </Box>
              ) : (
                <Button variant="outlined" startIcon={<CheckCircle2 size={16} />} disabled={pending > 0} onClick={() => { void approvals.approveRequirements(req.projectId); toast('要件定義書を承認しました'); }}>
                  アフロが代わりに承認
                </Button>
              )}
              <Button variant="contained" endIcon={<ArrowRight size={16} />} onClick={() => navigate('/site')}>サイトマップへ進む</Button>
            </Stack>
          </Stack>
        </Surface>
      </Reveal>

      <Dialog open={confirmReset} onClose={() => setConfirmReset(false)} maxWidth="xs" fullWidth aria-labelledby="req-reset-title">
        <DialogContent sx={{ pt: 3 }}>
          <Typography id="req-reset-title" variant="h3" sx={{ mb: 1 }}>回答をやり直しますか？</Typography>
          <Typography variant="body2" color="text.secondary">ヒアリングの回答と提案書が消え、最初の質問に戻ります。</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button variant="outlined" onClick={() => setConfirmReset(false)}>キャンセル</Button>
          <Button variant="contained" onClick={() => { void requirements.reset(req.projectId); setConfirmReset(false); }}>やり直す</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
