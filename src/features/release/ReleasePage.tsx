import { Box, Button, Stack, Typography } from '@mui/material';
import { ArrowLeft, ArrowRight, CheckCircle2, Circle, Rocket } from 'lucide-react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { PageHeader, SectionTitle, StatusPill, Surface } from '@/components/ui';
import { currentProject, useDemo } from '@/store/DemoStore';
import { useToast } from '@/hooks/useToast';
import { useProjectRoutes } from '@/features/projects/projectRoutes';
import { useQualityDevBy } from '@/features/quality/useQualityDevBy';
import { SitePreviewButton } from '@/features/quality/SitePreviewButton';
import { RequestApprovalButton } from '@/features/portal/RequestApprovalButton';
import { ymdText } from '@/features/requirements/requirementsDoc';
import { formatDateTime } from '@/services/time';
import { tokens } from '@/theme/tokens';
import { workView } from '@/store/projectWork';
import { releaseState } from './releaseState';

/**
 * リリース（公開）の画面（2026-11-18 ユーザー指示「リリース（公開）はリリース画面を表示」。以前はリリースの段階も品質チェックの画面を開いていた）。
 * 管理者画面 /release（見るだけ）・開発者画面 /dev/release（公開の承認の依頼・公開）。
 * 公開の予定日、公開までの条件（誰が何をするか）、制作中のサイトの確認、公開の操作を 1 画面にまとめる。判定は releaseState（品質チェックの画面と共通）
 */
export default function ReleasePage() {
  const { state, dispatch } = useDemo();
  const toast = useToast();
  const devBy = useQualityDevBy();
  const routes = useProjectRoutes();
  const navigate = useNavigate();
  const project = currentProject(state);
  // 表示中の案件の制作データで判定する（制作データの案件とずれても別案件の値を出さない）
  const view = workView(state, project.id);
  const r = releaseState(view);
  const schedule = view.schedule;
  // reducer（launchSite）と同じ条件の canLaunch で先に確かめ、公開できなかったときに「公開しました」と出さない（0.46.1）
  const launch = () => {
    if (!r.canLaunch) {
      toast('公開の条件がそろっていないため、公開できませんでした', 'info');
      return;
    }
    dispatch({ type: 'launchSite', devBy });
    toast('サイトを公開しました。運用の段階へ進みます', 'success');
  };
  const notYet = r.ownerStage !== 'release' && !r.launched;

  const status = r.launched
    ? { tone: 'success' as const, text: '公開済み（運用の段階）' }
    : r.canLaunch ? { tone: 'primary' as const, text: '公開できます' }
    : notYet ? { tone: 'neutral' as const, text: 'リリースの段階の前' }
    : { tone: 'warning' as const, text: '公開の準備中' };

  return (
    <>
      <Button component={RouterLink} to={routes.detail(project.id)} size="small" startIcon={<ArrowLeft size={16} />} sx={{ mb: 2, ml: -1 }}>
        プロジェクト詳細
      </Button>
      <PageHeader
        eyebrow="⑥ リリース（公開）"
        icon={<Rocket size={15} />}
        title="リリース"
        description={devBy
          ? '公開までの条件を確かめ、お客様に公開の承認を依頼して、承認されたらサイトを公開します。'
          : '公開までの条件と進み具合を確認します（管理者画面は見るだけ。公開の操作は開発者画面で行います）。'}
        actions={
          <>
            <SitePreviewButton />
            {/* 納品検収の後、お客様へ公開の承認を依頼する（2026-11-17。品質チェックの画面から移した） */}
            {r.clientCompleted && <RequestApprovalButton approvalKey="release" />}
            {devBy && r.canLaunch && (
              <Button variant="contained" startIcon={<Rocket size={16} />} onClick={launch}>サイトを公開して運用へ進む</Button>
            )}
          </>
        }
      />

      <Stack spacing={{ xs: 2, md: 2.5 }}>
        <Surface>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }} justifyContent="space-between">
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary">{project.siteName}</Typography>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                <StatusPill tone={status.tone}>{status.text}</StatusPill>
              </Stack>
            </Box>
            <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, auto))', columnGap: 3, rowGap: 0.5 }}>
              <Typography component="dt" variant="caption" color="text.secondary">納品予定日</Typography>
              <Typography component="dd" variant="body2" sx={{ m: 0, fontWeight: 650 }}>{schedule ? ymdText(schedule.deliveryDate) : '未入力'}</Typography>
              <Typography component="dt" variant="caption" color="text.secondary">公開予定日</Typography>
              <Typography component="dd" variant="body2" sx={{ m: 0, fontWeight: 650 }}>{schedule ? ymdText(schedule.releaseDate) : '未入力'}</Typography>
            </Box>
          </Stack>
        </Surface>

        <Surface>
          <SectionTitle title="公開までの条件" sub={<Typography variant="caption">{r.conditions.filter((c) => c.done).length} / {r.conditions.length} 済み</Typography>} />
          <Stack component="ol" spacing={0} sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {r.conditions.map((c, i) => (
              <Stack component="li" key={c.label} direction="row" spacing={1.5} alignItems="flex-start" sx={{ py: 1.25, borderTop: i ? `1px solid ${tokens.color.border}` : 'none' }}>
                <Box sx={{ pt: 0.25, color: c.done ? tokens.color.success : tokens.color.faint, flexShrink: 0 }}>
                  {c.done ? <CheckCircle2 size={18} aria-label="済み" /> : <Circle size={18} aria-label="まだ" />}
                </Box>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 650 }}>{c.label}</Typography>
                  <Typography variant="caption" color="text.secondary">{c.done ? (c.at ? `済み（${formatDateTime(c.at)}）` : '済み') : c.todo}</Typography>
                </Box>
              </Stack>
            ))}
          </Stack>
          <Box sx={{ mt: 1.5 }}>
            <Button size="small" endIcon={<ArrowRight size={15} />} onClick={() => navigate(routes.quality)}>品質チェックを開く</Button>
          </Box>
        </Surface>

        {notYet && (
          <Typography variant="body2" color="text.secondary">この案件はまだリリースの段階ではありません。品質管理・納品検収が終わると公開の準備に進みます。</Typography>
        )}
      </Stack>
    </>
  );
}
