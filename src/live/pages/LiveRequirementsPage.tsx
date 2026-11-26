import { Box, Button } from '@mui/material';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AiBadge, PageHeader, Reveal } from '@/components/ui';
import { RouteLoader } from '@/components/layout/RouteLoader';
import { DATA_MODE, useCurrentRequirements, useRepositories } from '@/repositories';
import { useWrite } from '@/hooks/useWrite';
import { useToast } from '@/hooks/useToast';
import { useHearingRoutes } from '@/features/requirements/hearingRoutes';
import { analysisBlockers } from '@/features/requirements/validation';
import { AI_FLAG_MODE, getAiDraftPort } from '@/features/requirements/aiDraft/aiDraftPort';
import { AI_DRAFT_COPY, APPROVAL_BLOCK_COPY, aiPanelVisible } from '@/features/requirements/aiDraft/aiDraftState';
import { useAiDraft } from '@/features/requirements/aiDraft/useAiDraft';
import { AiDraftPanel } from '@/features/requirements/aiDraft/AiDraftPanel';
import { useLiveSession } from '../session';

/** フラグ on の画面の印の説明（RequirementsPage と同じ。DEC lead F4） */
const AI_LIVE_TOOLTIP = 'AI 下書きは外部の AI サービスで作成し、担当者が確認してからお客様に出します。';

/**
 * live の要件定義の画面（0.49.1。管理者 /ai-studio/requirements・開発者 /dev/requirements。HearingGate の中）。
 * 2026-11-25 ユーザー「要件定義へ進むを押してもヒアリングの見出しのまま」で、ヒアリングの画面の中の切り替えから別の画面にした。
 * 中身は AI 下書き（AiDraftPanel / AiDraftEditor）のまま。生成はパネルのボタン、またはヒアリングから来たときに下書きが無ければ自動（location.state.autoStart）。
 * 要件が draft でない（承認依頼の後・承認済み）／フラグ off のときはヒアリングの画面（＝要件定義書の表示。従来どおり）へ転送する
 */
export default function LiveRequirementsPage() {
  const { requirements } = useRepositories();
  const { data: req, loading } = useCurrentRequirements();
  const { uid, account } = useLiveSession();
  const write = useWrite();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const routes = useHearingRoutes();
  const status = req.status;

  const role = account.role;
  const aiRole = role;
  const isAssigned = role === 'developer';
  const aiOn = DATA_MODE === 'live' && !!getAiDraftPort() && aiPanelVisible(AI_FLAG_MODE, aiRole, isAssigned);
  const ai = useAiDraft({
    projectId: req.projectId, answers: req.answers, reqStatus: status, role: aiRole, isAssignedDeveloper: isAssigned, uid, flagMode: AI_FLAG_MODE,
    enabled: aiOn && !loading && status === 'draft',
  });
  const autoStart = !!(location.state as { autoStart?: boolean } | null)?.autoStart;

  const backToHearing = async () => {
    // 画面を移る前に、未保存の編集を待たずに送る（§3.3。外したときの送信は useAiDraft の後片付けにもある）
    if (ai.save === 'pending') await ai.flush();
    navigate(routes.input);
  };

  // 読み込み中は描画せず、書き込みも呼ばない（repositories/types.ts の決まり）
  if (loading) return <RouteLoader label="要件定義" />;
  if (!aiOn || status !== 'draft') return <Navigate to={routes.input} replace />;

  return (
    <Box>
      <Button size="small" startIcon={<ArrowLeft size={16} />} onClick={() => void backToHearing()} sx={{ mb: 2, ml: -1, minHeight: 44 }}>
        ヒアリングに戻る
      </Button>
      <PageHeader
        eyebrow={role === 'developer' ? '開発者画面' : '管理者画面'}
        icon={<Sparkles size={14} />}
        title="要件定義"
        description="ヒアリングの回答から AI が要件定義の下書きを作ります。内容を確認・編集してから、お客様に承認を依頼します。"
        actions={<AiBadge label="AI" tooltip={AI_LIVE_TOOLTIP} />}
      />
      <Reveal>
        <AiDraftPanel
          ai={ai} role={aiRole} isAssignedDeveloper={isAssigned} reqStatus={status}
          missing={analysisBlockers(req.answers).map((q) => q.text)}
          onMissing={() => navigate(routes.input)}
          autoStart={autoStart}
          // 1 回だけ（再読み込み・戻るで再び生成を始めないように state を消す）
          onAutoStarted={() => navigate(location.pathname, { replace: true, state: null })}
          onRequestApproval={async () => {
            // 保存できなかったら依頼しない（保存の失敗の文言は編集画面の保存の状態に出る。§3.3）
            if (!(await ai.flush())) {
              toast(APPROVAL_BLOCK_COPY['save-failed'], 'error');
              return false;
            }
            // 依頼すると status が analyzed になり、この画面はヒアリングの画面（改善提案書の表示）へ転送する
            const ok = await write(requirements.completeAnalysis(req.projectId, { proposal: 'aiDraft' }), AI_DRAFT_COPY.approval.done, 'ai');
            if (ok) window.scrollTo({ top: 0 });
            return ok;
          }}
        />
      </Reveal>
    </Box>
  );
}
