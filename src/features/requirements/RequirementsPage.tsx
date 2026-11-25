import { Box, Button, Stack, useMediaQuery, useTheme } from '@mui/material';
import { ArrowLeft, ListChecks, Sparkles } from 'lucide-react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useContext, useState } from 'react';
import { AiBadge, PageHeader, Reveal } from '@/components/ui';
import { RouteLoader } from '@/components/layout/RouteLoader';
import { DATA_MODE, useCurrentRequirements, useRepositories } from '@/repositories';
import { LiveSessionContext, useLiveRoleOptional } from '@/live/session';
import { useWrite } from '@/hooks/useWrite';
import { AnalysisSequence } from './AnalysisSequence';
import { ProposalView } from './ProposalView';
import { HearingEditor } from './HearingEditor';
import { hostnameOf } from './buildProposal';
import { useHearingRoutes } from './hearingRoutes';
import { analysisBlockers } from './validation';
import { AI_FLAG_MODE, getAiDraftPort } from './aiDraft/aiDraftPort';
import { AI_DRAFT_COPY, APPROVAL_BLOCK_COPY, aiCanGenerate, aiPanelVisible } from './aiDraft/aiDraftState';
import { useToast } from '@/hooks/useToast';
import { useAiDraft } from './aiDraft/useAiDraft';
import { AiDraftPanel } from './aiDraft/AiDraftPanel';

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
  const toast = useToast();
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
  const uid = useContext(LiveSessionContext)?.uid;
  const aiRole = liveRole ?? 'client';
  const isAssigned = liveRole === 'developer';
  const aiOn = DATA_MODE === 'live' && !!getAiDraftPort() && aiPanelVisible(AI_FLAG_MODE, aiRole, isAssigned);
  const aiGen = aiOn && aiCanGenerate(AI_FLAG_MODE, aiRole, isAssigned);
  const ai = useAiDraft({
    projectId: req.projectId, answers: req.answers, reqStatus: status, role: aiRole, isAssignedDeveloper: isAssigned, uid, flagMode: AI_FLAG_MODE,
    enabled: aiOn && status === 'draft',
  });
  // ヒアリング → 下書き（要件定義）の 2 段。2026-11-25 ユーザー「AI 下書きは不要」で「ヒアリング / AI 下書き」のタブは出さない
  // （タブは live のフラグ on のときだけ出ていたもので、demo は元から出ない）。ヒアリングの「要件定義へ進む」で下書きの面に切り替え、
  // 「ヒアリングに戻る」で戻る。下書きの機能（aiDraft/・Functions・Rules）はそのまま
  const [tab, setTab] = useState<'hearing' | 'ai'>('hearing');
  const [autoStart, setAutoStart] = useState(false);
  const switchTab = (v: 'hearing' | 'ai') => {
    // タブを切り替えるとき、未保存の編集は待たずに送る（§3.3）
    if (tab === 'ai' && ai.save === 'pending') void ai.flush();
    setTab(v);
  };

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
          {tab === 'hearing' ? (
            <HearingEditor
              editable
              analyzeLabel={AI_DRAFT_COPY.generate}
              // 生成できない人（internal の開発者）も、管理者が作った下書きを見られるように面だけ開く
              onAnalyze={() => {
                setTab('ai');
                if (aiGen) setAutoStart(true);
                window.scrollTo({ top: 0 });
              }}
            />
          ) : (
            <Box>
              <Button size="small" startIcon={<ArrowLeft size={16} />} onClick={() => switchTab('hearing')} sx={{ mb: 1.5, ml: -1, minHeight: 44 }}>
                ヒアリングに戻る
              </Button>
              <AiDraftPanel
                ai={ai} role={aiRole} isAssignedDeveloper={isAssigned} reqStatus={status}
                missing={analysisBlockers(req.answers).map((q) => q.text)}
                onMissing={() => switchTab('hearing')}
                autoStart={autoStart}
                onAutoStarted={() => setAutoStart(false)}
                onRequestApproval={async () => {
                  // 保存できなかったら依頼しない（保存の失敗の文言は編集画面の保存の状態に出る。§3.3）
                  if (!(await ai.flush())) {
                    toast(APPROVAL_BLOCK_COPY['save-failed'], 'error');
                    return false;
                  }
                  const ok = await write(requirements.completeAnalysis(req.projectId, { proposal: 'aiDraft' }), AI_DRAFT_COPY.approval.done, 'ai');
                  if (ok) window.scrollTo({ top: 0 });
                  return ok;
                }}
              />
            </Box>
          )}
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
