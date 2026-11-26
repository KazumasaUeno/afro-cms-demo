import { Box, Button, Stack, useMediaQuery, useTheme } from '@mui/material';
import { ArrowLeft, ListChecks, Sparkles } from 'lucide-react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { AiBadge, PageHeader, Reveal } from '@/components/ui';
import { RouteLoader } from '@/components/layout/RouteLoader';
import { DATA_MODE, useCurrentRequirements, useRepositories } from '@/repositories';
import { useLiveRoleOptional } from '@/live/session';
import { useWrite } from '@/hooks/useWrite';
import { AnalysisSequence } from './AnalysisSequence';
import { ProposalView } from './ProposalView';
import { HearingEditor } from './HearingEditor';
import { hostnameOf } from './buildProposal';
import { useHearingRoutes } from './hearingRoutes';
import { AI_FLAG_MODE, getAiDraftPort } from './aiDraft/aiDraftPort';
import { AI_DRAFT_COPY, aiCanGenerate, aiPanelVisible } from './aiDraft/aiDraftState';

/** フラグ on の画面の印の説明（事実どおり。DEC lead F4） */
const AI_LIVE_TOOLTIP = 'AI 下書きは外部の AI サービスで作成し、担当者が確認してからお客様に出します。';

type View = 'input' | 'analyzing' | 'result';

/**
 * AI要件定義（/ai-studio）。AI 分析の前はヒアリングの入力画面（1 画面。HearingEditor）、分析後は改善提案書。
 * ヒアリングの入力の正の画面はここ（AI 分析の前）。/ai-studio/hearing は分析前ならここへ転送する。
 * 開発者画面の /dev/hearing（0.25.0）も同じ画面。行き先は useHearingRoutes でいまのエリアの中に保つ。
 */
export default function RequirementsPage() {
  const { requirements } = useRepositories();
  const { data: req, loading } = useCurrentRequirements();
  const write = useWrite();
  const navigate = useNavigate();
  const routes = useHearingRoutes();
  const status = req.status;
  const [analyzing, setAnalyzing] = useState(false);
  // live: AI 分析（＝お客様への確認依頼）はアサインされた開発者だけ（Rules reqUpdateOk）。管理者は回答の入力だけ（§25-1）
  const liveRole = useLiveRoleOptional();
  const canAnalyze = DATA_MODE !== 'live' || liveRole === 'developer';
  const view: View = analyzing ? 'analyzing' : status === 'draft' ? 'input' : 'result';
  const url = req.answers['q-url'];
  // スマホの入力画面は説明・バッジを出さず、質問までの距離を縮める（保存の状態は下のバーに出る）
  const compact = !useMediaQuery(useTheme().breakpoints.up('md')) && view !== 'result';

  // AI 下書き（VITE_FEATURE_AI_REQUIREMENTS。off なら今と同じ。docs/design/AI_REQUIREMENTS_UI.md §1・DEC lead F5）
  // live の開発者が読める案件は memberUids に入っている案件だけ（repositories.tsx の購読条件）＝アサインされた開発者
  const aiRole = liveRole ?? 'client';
  const isAssigned = liveRole === 'developer';
  const aiOn = DATA_MODE === 'live' && !!getAiDraftPort() && aiPanelVisible(AI_FLAG_MODE, aiRole, isAssigned);
  const aiGen = aiOn && aiCanGenerate(AI_FLAG_MODE, aiRole, isAssigned);
  // 要件定義（AI 下書き）は別の画面（0.49.1。routes.doc → src/live/pages/LiveRequirementsPage.tsx）。ここはヒアリングだけ

  // 読み込み中は描画せず、書き込みも呼ばない（repositories/types.ts の決まり）
  if (loading) return <RouteLoader label="ヒアリング" />;

  return (
    <Box>
      {/* 改善提案の表示後にプロジェクト詳細へ戻る導線（0.38.0。2026-11-16 ユーザー指示。プロジェクト詳細の「プロジェクト一覧」と同じ形） */}
      {/* 入力中も戻れるようにした（戻る導線（2026-11-16 ユーザー指示）。入力は自動で保存される）。AI 分析の演出中だけ出さない */}
      {view !== 'analyzing' && (
        <Button component={RouterLink} to={routes.project(req.projectId)} size="small" startIcon={<ArrowLeft size={16} />} sx={{ mb: 2, ml: -1 }}>
          プロジェクト詳細
        </Button>
      )}
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
              <Button variant="outlined" size="small" startIcon={<ListChecks size={15} />} onClick={() => navigate(routes.answers)}>
                {status !== 'approved' ? '回答を見直す' : 'ヒアリングの回答'}
              </Button>
            )}
            {aiOn ? <AiBadge label="AI" tooltip={AI_LIVE_TOOLTIP} /> : <AiBadge />}
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
              void write(requirements.completeAnalysis(req.projectId), '改善提案書ができました', 'ai').then(() => {
                setAnalyzing(false);
                window.scrollTo({ top: 0 });
              });
            }}
          />
        </Reveal>
      ) : aiOn ? (
        <Reveal>
          <HearingEditor
            editable
            analyzeLabel={AI_DRAFT_COPY.goToRequirements}
            onAnalyze={() => navigate(routes.doc, { state: { autoStart: aiGen } })}
          />
        </Reveal>
      ) : (
        <Reveal>
          <HearingEditor
            editable
            onAnalyze={canAnalyze ? () => {
              setAnalyzing(true);
              window.scrollTo({ top: 0 });
            } : undefined}
          />
        </Reveal>
      )}
    </Box>
  );
}
