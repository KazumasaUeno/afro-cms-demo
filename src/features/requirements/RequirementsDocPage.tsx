import { Box, Button, Stack, Typography } from '@mui/material';
import { ArrowRight, FileSearch, ListChecks, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AiBadge, PageHeader, Reveal, Surface } from '@/components/ui';
import { RouteLoader } from '@/components/layout/RouteLoader';
import { useCurrentRequirements } from '@/repositories';
import { tokens } from '@/theme/tokens';
import { ProposalView } from './ProposalView';
import { useHearingRoutes } from './hearingRoutes';

/**
 * 要件定義書の画面（管理者画面 /ai-studio/requirements・開発者画面 /dev/requirements。0.28.0）。
 * プロジェクト詳細の「AI要件定義を開く」の行き先。AI 分析の前は入力画面へ飛ばさず「まだ作成されていません」と入力への入口だけを出し、
 * 分析後は要件定義書（ProposalView。/ai-studio の分析後と同じ部品）を出す（2026-11-12 ユーザー決定）。
 * 入力の正の画面は従来どおり /ai-studio・/dev/hearing（RequirementsPage）。demo だけ（live の router には足していない）
 */
export default function RequirementsDocPage() {
  const { data: req, loading } = useCurrentRequirements();
  const navigate = useNavigate();
  const routes = useHearingRoutes();

  if (loading) return <RouteLoader label="AI要件定義" />;

  if (req.status === 'draft') {
    return (
      <Box>
        <PageHeader eyebrow="② 要件定義" icon={<Sparkles size={14} />} title="要件定義書" />
        <Reveal>
          <Surface sx={{ textAlign: 'center', py: { xs: 5, md: 7 }, px: { xs: 2.5, md: 4 }, maxWidth: 600, mx: 'auto' }}>
            <Stack alignItems="center" spacing={1.5}>
              <FileSearch size={36} color={tokens.color.faint} aria-hidden />
              <Typography variant="h3" component="h2">要件定義書はまだ作成されていません</Typography>
              <Typography variant="body2" color="text.secondary">ヒアリングを入力して AI 分析を実行してください。</Typography>
              <Box sx={{ pt: 1 }}>
                <Button variant="contained" endIcon={<ArrowRight size={16} />} onClick={() => navigate(routes.input)}>ヒアリングを入力する</Button>
              </Box>
            </Stack>
          </Surface>
        </Reveal>
      </Box>
    );
  }

  return (
    <Box>
      <PageHeader
        eyebrow="② 要件定義"
        icon={<Sparkles size={14} />}
        title="AIがまとめた改善提案"
        description="ヒアリングの回答と現行サイトの分析から、優先度つきの改善提案（要件定義書）をまとめました。"
        actions={
          <Stack direction="row" spacing={1} alignItems="center">
            <Button variant="outlined" size="small" startIcon={<ListChecks size={15} />} onClick={() => navigate(routes.answers)}>
              {req.status !== 'approved' ? '回答を見直す' : 'ヒアリングの回答'}
            </Button>
            <AiBadge />
          </Stack>
        }
      />
      <ProposalView />
    </Box>
  );
}
