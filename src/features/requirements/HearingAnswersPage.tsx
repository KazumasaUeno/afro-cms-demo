import { Box, Button, Stack } from '@mui/material';
import { ArrowRight, MessageSquareText } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { PageHeader, Reveal, StatusPill } from '@/components/ui';
import { RouteLoader } from '@/components/layout/RouteLoader';
import { DATA_MODE, useCurrentRequirements, useRepositories } from '@/repositories';
import { formatDateTime } from '@/services/time';
import { HearingEditor } from './HearingEditor';
import { useHearingRoutes } from './hearingRoutes';

/**
 * ヒアリングの回答（管理者画面 /ai-studio/hearing・開発者画面 /dev/hearing/answers。0.25.0）。
 * AI 分析の前は入力の正の画面（同じエリアの /ai-studio・/dev/hearing）へ転送する（入力する場所を 1 つにする。2026-11-11 決定 B）。
 * AI 分析の後は同じ入力画面で見直す。要件定義書の承認まで入力でき、変えた回答は提案書（回答から毎回作る）にすぐ反映される。
 * 承認後は reducer が変更を受け付けないため閲覧のみ。
 */
export default function HearingAnswersPage() {
  const { projects } = useRepositories();
  const { data: req, loading } = useCurrentRequirements();
  const { data: projectList } = projects.useList();
  const navigate = useNavigate();
  const routes = useHearingRoutes();
  const project = projectList.find((p) => p.id === req.projectId);
  // live: 回答を変えられるのは draft の間だけ（Rules M-4。承認待ちの間に変えるなら開発者が差し戻す）。demo は承認まで入力できる
  const live = DATA_MODE === 'live';
  const editable = live ? req.status === 'draft' : req.status !== 'approved';

  if (loading) return <RouteLoader label="ヒアリング" />;
  if (req.status === 'draft') return <Navigate to={routes.input} replace />;

  return (
    <Box>
      <PageHeader
        eyebrow="① ヒアリング"
        icon={<MessageSquareText size={14} />}
        title="ヒアリングの回答"
        description={
          <>
            <Box component="span" sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 1 }}>
              {project && <StatusPill tone="neutral" dot={false}>{project.clientName}</StatusPill>}
              <StatusPill tone="success">
                {req.status === 'approved' ? `要件定義書 承認済み ${formatDateTime(req.approvedAt)}` : `AI 分析済み ${formatDateTime(req.analyzedAt)}・お客様の承認待ち`}
              </StatusPill>
            </Box>
            {editable
              ? 'AI 分析の後も、要件定義書の承認まで入力できます。変えた内容は提案書にすぐ反映されます。'
              : live && req.status !== 'approved'
                ? 'お客様の承認待ちのため、閲覧だけできます。回答を直すときは、提案書の「差し戻す」でヒアリングの入力に戻します。'
                : '要件定義書を承認済みのため、閲覧だけできます。'}
          </>
        }
        actions={
          <Stack direction="row" spacing={1} alignItems="center">
            <Button variant="outlined" endIcon={<ArrowRight size={16} />} onClick={() => navigate(routes.input)}>提案書を見る</Button>
          </Stack>
        }
      />
      <Reveal>
        <HearingEditor editable={editable} />
      </Reveal>
    </Box>
  );
}
