import { Box, Button, Stack, useMediaQuery, useTheme } from '@mui/material';
import { ListChecks, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { AiBadge, PageHeader, Reveal } from '@/components/ui';
import { useRepositories } from '@/repositories';
import { useToast } from '@/hooks/useToast';
import { AnalysisSequence } from './AnalysisSequence';
import { ProposalView } from './ProposalView';
import { HearingEditor } from './HearingEditor';
import { hostnameOf } from './buildProposal';

type View = 'input' | 'analyzing' | 'result';

/**
 * AI要件定義（/ai-studio）。AI 分析の前はヒアリングの入力画面（1 画面。HearingEditor）、分析後は改善提案書。
 * ヒアリングの入力の正の画面はここ（AI 分析の前）。/ai-studio/hearing は分析前ならここへ転送する。
 */
export default function RequirementsPage() {
  const { requirements } = useRepositories();
  const { data: req } = requirements.useCurrent();
  const toast = useToast();
  const navigate = useNavigate();
  const status = req.status;
  const [analyzing, setAnalyzing] = useState(false);
  const view: View = analyzing ? 'analyzing' : status === 'draft' ? 'input' : 'result';
  const url = req.answers['q-url'];
  // スマホの入力画面は説明・バッジを出さず、質問までの距離を縮める（保存の状態は下のバーに出る）
  const compact = !useMediaQuery(useTheme().breakpoints.up('md')) && view !== 'result';

  return (
    <Box>
      {/* 要件定義の段階では、サイトマップ・デザインの段階ナビを出さない（2026-11-10 決定。承認後は提案書の「サイトマップへ進む」から進む） */}
      <PageHeader
        eyebrow={view === 'result' ? '② 要件定義' : '① ヒアリング'}
        icon={<Sparkles size={14} />}
        title={view === 'result' ? 'AIがまとめた改善提案' : 'ヒアリングの内容を入力する'}
        description={
          view === 'result'
            ? 'ヒアリングの回答と現行サイトの分析から、優先度つきの改善提案（要件定義書）をまとめました。'
            : compact ? undefined
              : 'お客様へのヒアリングで伺った内容を、カテゴリごとに入力します。入力は自動で保存されます。「AI分析に必要」の質問がそろうと AI分析を実行できます。'
        }
        actions={compact ? undefined : (
          <Stack direction="row" spacing={1} alignItems="center">
            {view === 'result' && (
              <Button variant="outlined" size="small" startIcon={<ListChecks size={15} />} onClick={() => navigate('/ai-studio/hearing')}>
                {status !== 'approved' ? '回答を見直す' : 'ヒアリングの回答'}
              </Button>
            )}
            <AiBadge />
          </Stack>
        )}
      />

      {view === 'result' ? (
        <ProposalView />
      ) : view === 'analyzing' ? (
        <Reveal>
          <AnalysisSequence
            hostname={hostnameOf(typeof url === 'string' ? url : '')}
            onDone={() => {
              void requirements.completeAnalysis(req.projectId);
              setAnalyzing(false);
              toast('改善提案書ができました', 'ai');
              window.scrollTo({ top: 0 });
            }}
          />
        </Reveal>
      ) : (
        <Reveal>
          <HearingEditor
            editable
            onAnalyze={() => {
              setAnalyzing(true);
              window.scrollTo({ top: 0 });
            }}
          />
        </Reveal>
      )}
    </Box>
  );
}
