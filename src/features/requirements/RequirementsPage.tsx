import { Box, Button, Stack } from '@mui/material';
import { ListChecks, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { BuildFlowNav } from '@/components/layout/BuildFlowNav';
import { AiBadge, PageHeader, Reveal } from '@/components/ui';
import { useDemo } from '@/store/DemoStore';
import { useToast } from '@/hooks/useToast';
import { tokens } from '@/theme/tokens';
import { Wizard } from './Wizard';
import { AnalysisSequence } from './AnalysisSequence';
import { ProposalView } from './ProposalView';
import { CategoryPanel } from './CategoryPanel';
import { hostnameOf } from './buildProposal';
import { ModeSwitcher } from './AnswerOwner';

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
      <BuildFlowNav />
      <PageHeader
        eyebrow="① 要件定義"
        icon={<Sparkles size={14} />}
        title={view === 'result' ? 'AIがまとめた改善提案' : 'AIと話しながら、要件を整理する'}
        description={
          view === 'result'
            ? 'ご回答と現行サイトの分析から、優先度つきの改善提案をまとめました。'
            : '長いアンケートの代わりに、AIが1問ずつ質問します。5つの質問に答えるだけで、改善提案書ができあがります。'
        }
        actions={
          <Stack direction="row" spacing={1} alignItems="center">
            <Button variant="outlined" size="small" startIcon={<ListChecks size={15} />} onClick={() => navigate('/ai-studio/hearing')}>{status !== 'approved' ? '回答の一覧・入力' : '回答の一覧'}</Button>
            <AiBadge />
          </Stack>
        }
      />
      <ModeSwitcher />

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
            <Reveal delay={0.08}>
              <CategoryPanel />
            </Reveal>
          </Box>
        </Box>
      )}
    </Box>
  );
}
