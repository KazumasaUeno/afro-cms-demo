import { Box, Button, Stack, Typography } from '@mui/material';
import { FileSpreadsheet, ListChecks, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { AiBadge, PageHeader, Reveal, Surface } from '@/components/ui';
import { useDemo } from '@/store/DemoStore';
import { useToast } from '@/hooks/useToast';
import { tokens } from '@/theme/tokens';
import { Wizard } from './Wizard';
import { AnalysisSequence } from './AnalysisSequence';
import { ProposalView } from './ProposalView';
import { CategoryPanel } from './CategoryPanel';
import { hostnameOf } from './buildProposal';
import { CsvTools } from './CsvTools';

type View = 'wizard' | 'analyzing' | 'result';

export default function RequirementsPage() {
  const { state, dispatch } = useDemo();
  const toast = useToast();
  const navigate = useNavigate();
  const status = state.requirements.status;
  const [analyzing, setAnalyzing] = useState(false);
  const view: View = analyzing ? 'analyzing' : status === 'draft' ? 'wizard' : 'result';
  const url = state.requirements.answers['q-url'];

  return (
    <Box>
      {/* 要件定義の段階では、サイトマップ・デザインの段階ナビを出さない（2026-11-10 決定。承認後は提案書の「サイトマップへ進む」から進む） */}
      <PageHeader
        eyebrow="① 要件定義"
        icon={<Sparkles size={14} />}
        title={view === 'result' ? 'AIがまとめた改善提案' : 'ヒアリングの内容を入力する'}
        description={
          view === 'result'
            ? 'ヒアリングの回答と現行サイトの分析から、優先度つきの改善提案（要件定義書）をまとめました。'
            : 'お客様へのヒアリングで伺った内容を、1問ずつ入力します。主要な5問で改善提案書のたたき台ができます。残りの質問は「回答の一覧・入力」か CSV で入力できます。'
        }
        actions={
          <Stack direction="row" spacing={1} alignItems="center">
            <Button variant="outlined" size="small" startIcon={<ListChecks size={15} />} onClick={() => navigate('/ai-studio/hearing')}>{status !== 'approved' ? '回答の一覧・入力' : '回答の一覧'}</Button>
            <AiBadge />
          </Stack>
        }
      />

      {view === 'result' ? (
        <ProposalView />
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 320px' }, gap: 2.5, alignItems: 'start' }}>
          <Reveal>
            {view === 'analyzing' ? (
              <AnalysisSequence
                hostname={hostnameOf(typeof url === 'string' ? url : '')}
                onDone={() => {
                  dispatch({ type: 'completeAnalysis' });
                  setAnalyzing(false);
                  toast('改善提案書ができました', 'ai');
                  window.scrollTo({ top: 0 });
                }}
              />
            ) : (
              <Wizard onAnalyze={() => setAnalyzing(true)} />
            )}
          </Reveal>
          <Box sx={{ position: { lg: 'sticky' }, top: { lg: tokens.layout.topbar + 24 } }}>
            <Stack spacing={2.5}>
              <Reveal delay={0.08}>
                <CategoryPanel />
              </Reveal>
              {view === 'wizard' && (
                <Reveal delay={0.12}>
                  <Surface padding={{ xs: 2, md: 2.5 }}>
                    <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 0.5 }}>
                      <FileSpreadsheet size={18} color={tokens.color.primary} />
                      <Typography variant="h4" component="h2">CSV でまとめて入力</Typography>
                    </Stack>
                    <Typography variant="caption" component="p" sx={{ mb: 1.5 }}>ヒアリングシートを Excel で作っている場合は、全問をまとめて取り込めます。</Typography>
                    <CsvTools dense />
                  </Surface>
                </Reveal>
              )}
            </Stack>
          </Box>
        </Box>
      )}
    </Box>
  );
}
