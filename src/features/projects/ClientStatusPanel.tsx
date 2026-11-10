import { Box, ButtonBase, Stack, Typography } from '@mui/material';
import { ArrowRight, CheckCircle2, Circle, Clock, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDemo } from '@/store/DemoStore';
import { CLIENT_PROJECT_ID } from '@/components/layout/nav';
import { StatusPill, Surface, type PillTone } from '@/components/ui';
import { formatDateTime, relativeTime } from '@/services/time';
import { tokens } from '@/theme/tokens';
import { TOUCH } from '@/theme/media';
import { clientStatus, type ClientApprovalRow } from './clientStatus';

const STATUS: Record<ClientApprovalRow['status'], { label: string; tone: PillTone }> = {
  approved: { label: '承認済み', tone: 'success' },
  waiting: { label: 'お客様の確認待ち', tone: 'warning' },
  locked: { label: '準備中', tone: 'neutral' },
};

/**
 * 管理者画面: お客様の対応状況（承認の有無・公開承認の待ち）。ヒアリングはアフロが入力するので出さない（2026-11-10 決定）。
 * デモのデータは MINAMO COFFEE の 1 案件分だけなので、その案件のときだけ出す。
 * プロジェクト詳細と開発者画面で使う（ホームからは 2026-11-10 に外した）
 */
export function ClientStatusPanel() {
  const { state, dispatch } = useDemo();
  const navigate = useNavigate();
  const project = state.projects.find((p) => p.id === CLIENT_PROJECT_ID);

  if (!project) return null;
  const s = clientStatus(state);

  const go = (to: string) => {
    dispatch({ type: 'setCurrentProject', id: project.id });
    navigate(to);
  };

  return (
    <Surface component="section" aria-labelledby="client-status-title">
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5, flexWrap: 'wrap', rowGap: 0.75 }}>
        <UserRound size={18} color={tokens.color.muted} />
        <Typography id="client-status-title" variant="h5" component="h2" sx={{ flex: 1, minWidth: 0 }}>お客様の対応状況</Typography>
        {s.waitingCount > 0
          ? <StatusPill tone="warning">お客様の対応待ち {s.waitingCount}</StatusPill>
          : <StatusPill tone="success">対応待ちなし</StatusPill>}
      </Stack>
      <Typography variant="caption" sx={{ display: 'block', mb: 2 }}>
        {project.clientName}・最後の操作 {s.lastClientAt ? relativeTime(s.lastClientAt) : 'まだありません'}
      </Typography>

      {/* 承認 */}
      <Box component="ul" aria-label="お客様の承認" sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {s.approvals.map((a) => {
          const st = STATUS[a.status];
          const Icon = a.status === 'approved' ? CheckCircle2 : a.status === 'waiting' ? Clock : Circle;
          const color = a.status === 'approved' ? tokens.color.success : a.status === 'waiting' ? tokens.color.warning : tokens.color.faint;
          const detail = a.status === 'approved'
            ? `${formatDateTime(a.approvedAt)}${a.byAfro === true ? '・アフロが代わりに承認' : a.byAfro === false ? '・お客様が承認' : ''}`
            : a.status === 'locked' ? (a.lockedReason ?? '') : a.progress ? `お客様のチェック ${a.progress.done} / ${a.progress.total} 項目` : '';
          return (
            <Box component="li" key={a.key}>
              <ButtonBase
                onClick={() => go(a.to)}
                aria-label={`${a.title}: ${st.label}${detail ? `（${detail}）` : ''}。開く`}
                sx={{
                  width: '100%', justifyContent: 'flex-start', textAlign: 'left', gap: 1.25, py: 1, px: 1, mx: -1, borderRadius: 2,
                  minHeight: 44, '&:hover': { bgcolor: tokens.color.surfaceMuted }, '&:hover .go': { opacity: 1 },
                }}
              >
                <Icon size={18} color={color} style={{ flexShrink: 0 }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
                    <Typography variant="body2" sx={{ fontWeight: 650 }}>{a.title}</Typography>
                    <StatusPill tone={st.tone} dot={false}>{st.label}</StatusPill>
                  </Stack>
                  {detail && <Typography variant="caption" sx={{ display: 'block', mt: 0.25 }}>{detail}</Typography>}
                </Box>
                <Box className="go" sx={{ display: 'flex', opacity: 0.4, color: tokens.color.muted, flexShrink: 0, [TOUCH]: { opacity: 0.8 } }}><ArrowRight size={16} /></Box>
              </ButtonBase>
            </Box>
          );
        })}
      </Box>

      {/* 公開承認 */}
      <Stack direction="row" spacing={1} alignItems="center" sx={{ pt: 1.5, mt: 1, borderTop: `1px solid ${tokens.color.border}`, flexWrap: 'wrap', rowGap: 0.75 }}>
        <Typography variant="body2" sx={{ fontWeight: 700, flex: 1, minWidth: 0 }}>ページ・お知らせの公開承認</Typography>
        {s.publishWaiting > 0
          ? <StatusPill tone="warning">お客様の承認待ち {s.publishWaiting} 件</StatusPill>
          : <StatusPill tone="success">待ちなし</StatusPill>}
      </Stack>

    </Surface>
  );
}
