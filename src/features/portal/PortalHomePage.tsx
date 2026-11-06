import { Box, Button, ButtonBase, Stack, Typography } from '@mui/material';
import { ArrowRight, BadgeCheck, CalendarDays, Clock3, House, Lock, MessageSquare, Stamp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { MemberAvatar, PageHeader, ProgressRing, Reveal, SectionTitle, StageTrack, StatusPill, Surface } from '@/components/ui';
import { useDemo, currentProject } from '@/store/DemoStore';
import { useToast } from '@/hooks/useToast';
import { formatDate, formatDateTime, relativeTime } from '@/services/time';
import { memberById } from '@/data/members';
import { STAGES, stageIndex } from '@/data/projects';
import { tokens } from '@/theme/tokens';
import { AREAS } from '@/components/layout/nav';
import { approvalSteps } from './portalSteps';

const AREA = AREAS.portal;

export default function PortalHomePage() {
  const { state } = useDemo();
  const navigate = useNavigate();
  const toast = useToast();
  const project = currentProject(state);
  const owner = memberById(project.ownerId);
  const steps = approvalSteps(state);
  const todo = steps.filter((s) => s.status === 'waiting');
  const cmsReview = state.pages.filter((p) => p.status === 'review').length;
  const stage = STAGES[stageIndex(project.stage)];
  const daysLeft = project.launchDate ? Math.max(0, Math.ceil((new Date(project.launchDate).getTime() - Date.now()) / 86400000)) : null;
  const activities = state.activities.filter((a) => !a.projectId || a.projectId === project.id).slice(0, 6);

  return (
    <>
      <PageHeader
        eyebrow="お客様ポータル"
        icon={<House size={15} />}
        title={`${project.clientName} さま`}
        description="ホームページリニューアルの進み具合と、ご確認をお願いしたいことをまとめています。"
      />

      <Stack spacing={{ xs: 2.5, md: 3 }}>
        {/* 進み具合 */}
        <Reveal>
          <Surface padding={{ xs: 2.5, md: 3.5 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 2.5, md: 4 }} alignItems={{ md: 'center' }}>
              <Stack direction="row" spacing={2} alignItems="center" sx={{ flexShrink: 0 }}>
                <ProgressRing value={project.progress} size={84} stroke={8} color={AREA.color} label={`全体の進み具合 ${project.progress}%`}>
                  <Typography sx={{ fontWeight: 750, fontSize: 20, fontVariantNumeric: 'tabular-nums' }}>{project.progress}%</Typography>
                </ProgressRing>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="overline">現在の段階</Typography>
                  <Typography variant="h3" component="p">{stage.no}. {stage.label}</Typography>
                  <Typography variant="caption" sx={{ display: 'block', maxWidth: 260 }}>{stage.description}</Typography>
                </Box>
              </Stack>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <StageTrack stage={project.stage} />
                <Stack direction="row" spacing={3} sx={{ mt: 2.5, flexWrap: 'wrap', rowGap: 1 }}>
                  <Stack direction="row" spacing={0.75} alignItems="center">
                    <CalendarDays size={16} color={tokens.color.muted} />
                    <Typography variant="body2">公開予定 <b>{project.launchDate ? formatDate(project.launchDate) : '調整中'}</b></Typography>
                  </Stack>
                  {daysLeft !== null && (
                    <Stack direction="row" spacing={0.75} alignItems="center">
                      <Clock3 size={16} color={tokens.color.muted} />
                      <Typography variant="body2">あと <b>{daysLeft}</b> 日</Typography>
                    </Stack>
                  )}
                </Stack>
              </Box>
            </Stack>
          </Surface>
        </Reveal>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0,1.4fr) minmax(0,1fr)' }, gap: { xs: 2.5, md: 3 }, alignItems: 'start' }}>
          {/* お願いしたいこと */}
          <Surface>
            <SectionTitle
              title="ご確認をお願いしたいこと"
              sub={<StatusPill tone={todo.length + (cmsReview ? 1 : 0) ? 'warning' : 'success'}>{todo.length + (cmsReview ? 1 : 0)}件</StatusPill>}
              action={<Button size="small" onClick={() => navigate('/portal/approvals')}>確認・承認へ</Button>}
            />
            <Stack spacing={1}>
              {steps.map((s) => {
                const approved = s.status === 'approved';
                const locked = s.status === 'locked';
                return (
                  <ButtonBase
                    key={s.key}
                    disabled={locked}
                    onClick={() => navigate(s.key === 'quality' ? '/portal/quality' : `/portal/approvals#${s.key}`)}
                    sx={{
                      justifyContent: 'flex-start', gap: 1.5, textAlign: 'left', borderRadius: 3, p: 1.5,
                      border: `1px solid ${s.status === 'waiting' ? tokens.color.border : 'transparent'}`,
                      bgcolor: s.status === 'waiting' ? tokens.color.surface : tokens.color.surfaceMuted,
                      '&:hover': { borderColor: tokens.color.borderStrong },
                    }}
                  >
                    <Box sx={{
                      width: 34, height: 34, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 13,
                      bgcolor: approved ? tokens.color.successSoft : locked ? tokens.color.bgSubtle : tokens.color.warningSoft,
                      color: approved ? tokens.color.success : locked ? tokens.color.faint : tokens.color.warning,
                    }}>
                      {approved ? <BadgeCheck size={17} /> : locked ? <Lock size={15} /> : s.no}
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 650 }}>{s.title}</Typography>
                      <Typography variant="caption" sx={{ display: 'block' }}>
                        {approved ? `承認済み ${formatDateTime(s.approvedAt)}` : locked ? '準備中' : s.progress ? `${s.ask}（${s.progress.done} / ${s.progress.total}）` : s.ask}
                      </Typography>
                    </Box>
                    {s.status === 'waiting' && <ArrowRight size={16} color={tokens.color.muted} />}
                  </ButtonBase>
                );
              })}
              {cmsReview > 0 && (
                <ButtonBase
                  onClick={() => navigate('/cms/approvals')}
                  sx={{ justifyContent: 'flex-start', gap: 1.5, textAlign: 'left', borderRadius: 3, p: 1.5, border: `1px solid ${tokens.color.border}`, '&:hover': { borderColor: tokens.color.borderStrong } }}
                >
                  <Box sx={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', bgcolor: AREAS.cms.soft, color: AREAS.cms.color }}><Stamp size={16} /></Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 650 }}>CMS の公開承認</Typography>
                    <Typography variant="caption" sx={{ display: 'block' }}>承認待ちの更新が {cmsReview} 件あります（CMS画面へ移動）</Typography>
                  </Box>
                  <ArrowRight size={16} color={tokens.color.muted} />
                </ButtonBase>
              )}
            </Stack>
          </Surface>

          <Stack spacing={{ xs: 2.5, md: 3 }}>
            {/* 担当者 */}
            <Surface>
              <SectionTitle title="担当" />
              <Stack direction="row" spacing={1.5} alignItems="center">
                <MemberAvatar id={owner.id} size={44} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body1" sx={{ fontWeight: 650 }}>{owner.name}</Typography>
                  <Typography variant="caption">アフロ株式会社・{owner.role}</Typography>
                </Box>
              </Stack>
              <Button fullWidth variant="outlined" startIcon={<MessageSquare size={16} />} sx={{ mt: 2 }} onClick={() => toast('デモのため、メッセージは送信されません', 'info')}>
                担当者に相談する
              </Button>
            </Surface>

            {/* 最近の動き */}
            <Surface>
              <SectionTitle title="最近の動き" />
              <Stack component="ul" spacing={1.5} sx={{ listStyle: 'none', m: 0, p: 0 }}>
                {activities.map((a) => (
                  <Box component="li" key={a.id} sx={{ pl: 1.5, borderLeft: `2px solid ${a.actor.includes('ミナモ') ? AREA.color : tokens.color.border}` }}>
                    <Typography variant="body2" sx={{ lineHeight: 1.5 }}>{a.text}</Typography>
                    <Typography variant="caption">{a.actor}・{relativeTime(a.at)}</Typography>
                  </Box>
                ))}
              </Stack>
            </Surface>
          </Stack>
        </Box>
      </Stack>
    </>
  );
}
