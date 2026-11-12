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
 * AI 分析の後は同じ画面で回答を確認する（閲覧のみ。reducer も AI 分析の前しか変更を受け付けない。0.29.2）。
 */
export default function HearingAnswersPage() {
  const { projects } = useRepositories();
  const { data: req, loading } = useCurrentRequirements();
  const { data: projectList } = projects.useList();
  const navigate = useNavigate();
  const routes = useHearingRoutes();
  const project = projectList.find((p) => p.id === req.projectId);
  // 回答を変えられるのは draft（AI 分析の前）の間だけ。分析後の「ヒアリングを確認」は閲覧だけ（demo も live と同じ。2026-11-12 ユーザー指示）。
  // 直すときは提案書から入力に戻す（live: 差し戻す（Rules M-4）／ demo: 回答をやり直す）
  const live = DATA_MODE === 'live';
  const editable = req.status === 'draft';

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
              ? '回答を入力できます。'
              : req.status === 'approved'
                ? '要件定義書を承認済みのため、閲覧だけできます。'
                : live
                  ? 'お客様の承認待ちのため、閲覧だけできます。回答を直すときは、提案書の「差し戻す」でヒアリングの入力に戻します。'
                  : 'AI 分析済みのため、閲覧だけできます。回答を直すときは、提案書の「差し戻す」でヒアリングの入力に戻します（回答は残ります）。'}
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
