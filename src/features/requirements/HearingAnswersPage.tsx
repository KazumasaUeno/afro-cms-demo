import { Box, Button, Stack } from '@mui/material';
import { ArrowRight, MessageSquareText } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { PageHeader, Reveal, StatusPill } from '@/components/ui';
import { useRepositories } from '@/repositories';
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
  const { requirements, projects } = useRepositories();
  const { data: req } = requirements.useCurrent();
  const { data: projectList } = projects.useList();
  const navigate = useNavigate();
  const routes = useHearingRoutes();
  const project = projectList.find((p) => p.id === req.projectId);
  const editable = req.status !== 'approved';

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
