import { Box, Button, Stack, Tab, Tabs, Typography } from '@mui/material';
import { ArrowLeft, ArrowRight, FileSearch, ListChecks, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { AiBadge, PageHeader, Reveal, Surface } from '@/components/ui';
import { RouteLoader } from '@/components/layout/RouteLoader';
import { useCurrentRequirements } from '@/repositories';
import { useDemoOptional } from '@/store/DemoStore';
import { tokens } from '@/theme/tokens';
import { ProposalView } from './ProposalView';
import { RequestApprovalButton } from '@/features/portal/RequestApprovalButton';
import { useHearingRoutes } from './hearingRoutes';
import { HearingAnswersSection, NonFunctionalSection, REQ_DOC_SECTIONS as SECTIONS, RequirementsHowTo, ScheduleSection, type ReqDocSectionId as SectionId } from './RequirementsDocSections';


/**
 * 要件定義書の画面（管理者画面 /ai-studio/requirements・開発者画面 /dev/requirements。0.28.0）。
 * プロジェクト詳細の「AI要件定義を開く」の行き先。AI 分析の前は入力画面へ飛ばさず「まだ作成されていません」と入力への入口だけを出し、
 * 分析後は要件定義書を出す（2026-11-12 ユーザー決定）。
 * 2026-11-18 ユーザー指示「要件定義の内容が見れない（作り方がいまいちわかっていない）」: 以前は改善提案だけが画面にあり、
 * ヒアリングの回答・スケジュール・非機能要件はダウンロードした文書にしか無かった。4 つの節をタブで見せ、上につくり方（いまどこか）を出す。
 * 入力の正の画面は従来どおり /ai-studio・/dev/hearing（RequirementsPage）。demo だけ（live の router には足していない）
 */
export default function RequirementsDocPage() {
  const { data: req, loading } = useCurrentRequirements();
  const navigate = useNavigate();
  const routes = useHearingRoutes();
  const demo = useDemoOptional();
  const [section, setSection] = useState<SectionId>('proposal');

  if (loading) return <RouteLoader label="AI要件定義" />;
  const requested = !!demo?.state.approvalRequests?.requirements;

  if (req.status === 'draft') {
    return (
      <Box>
        {/* 戻る導線（2026-11-16 ユーザー指示） */}
        <Button component={RouterLink} to={routes.project(req.projectId)} size="small" startIcon={<ArrowLeft size={16} />} sx={{ mb: 2, ml: -1 }}>
          プロジェクト詳細
        </Button>
        <PageHeader eyebrow="② 要件定義" icon={<Sparkles size={14} />} title="要件定義書" />
        <RequirementsHowTo status={req.status} requested={requested} />
        <Reveal>
          <Surface sx={{ textAlign: 'center', py: { xs: 5, md: 7 }, px: { xs: 2.5, md: 4 }, maxWidth: 600, mx: 'auto' }}>
            <Stack alignItems="center" spacing={1.5}>
              <FileSearch size={36} color={tokens.color.faint} aria-hidden />
              <Typography variant="h3" component="h2">要件定義書はまだ作成されていません</Typography>
              <Typography variant="body2" color="text.secondary">ヒアリングを入力して AI 分析を実行すると、ここに要件定義書（改善提案・ヒアリングの回答・スケジュール・非機能要件）ができます。</Typography>
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
      {/* 改善提案の表示後にプロジェクト詳細へ戻る導線（0.38.0。2026-11-16 ユーザー指示。プロジェクト詳細の「プロジェクト一覧」と同じ形） */}
      <Button component={RouterLink} to={routes.project(req.projectId)} size="small" startIcon={<ArrowLeft size={16} />} sx={{ mb: 2, ml: -1 }}>
        プロジェクト詳細
      </Button>
      <PageHeader
        eyebrow="② 要件定義"
        icon={<Sparkles size={14} />}
        title="要件定義書"
        description="ヒアリングの回答と現行サイトの分析から AI がたたき台を作り、開発担当者が確認してお客様の承認を得ます。下のタブで 4 つの節を確認できます。"
        actions={
          <Stack direction="row" spacing={1} alignItems="center">
            <Button variant="outlined" size="small" startIcon={<ListChecks size={15} />} onClick={() => navigate(routes.answers)}>
              {req.status !== 'approved' ? '回答を見直す' : 'ヒアリングの回答'}
            </Button>
            <AiBadge />
            {/* 内容を確かめてからお客様へ承認を依頼する（2026-11-17 会議。依頼するまでお客様の画面では「準備中」） */}
            <RequestApprovalButton approvalKey="requirements" />
          </Stack>
        }
      />
      <RequirementsHowTo status={req.status} requested={requested} />
      <Tabs value={section} onChange={(_, v: SectionId) => setSection(v)} variant="scrollable" allowScrollButtonsMobile aria-label="要件定義書の節" sx={{ mb: 2.5, borderBottom: `1px solid ${tokens.color.border}` }}>
        {SECTIONS.map((s) => <Tab key={s.id} value={s.id} label={s.label} />)}
      </Tabs>
      {section === 'proposal' && <ProposalView />}
      {section === 'answers' && <HearingAnswersSection req={req} />}
      {section === 'schedule' && <ScheduleSection schedule={demo?.state.schedule} />}
      {section === 'nonfunctional' && <NonFunctionalSection />}
    </Box>
  );
}
