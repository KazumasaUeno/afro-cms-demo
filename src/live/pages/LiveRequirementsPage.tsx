import { useEffect, useState, type ReactNode } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';
import { ArrowLeft, ListChecks, Send, Sparkles } from 'lucide-react';
import { Link as RouterLink, Navigate, useBlocker, useLocation, useNavigate } from 'react-router-dom';
import { AiBadge, PageHeader, Reveal, StatusPill, Surface } from '@/components/ui';
import { RouteLoader } from '@/components/layout/RouteLoader';
import { DATA_MODE, useCurrentRequirements, useRepositories } from '@/repositories';
import { useWrite } from '@/hooks/useWrite';
import { useToast } from '@/hooks/useToast';
import { useHearingRoutes } from '@/features/requirements/hearingRoutes';
import { analysisBlockers } from '@/features/requirements/validation';
import { ProposalView } from '@/features/requirements/ProposalView';
import {
  HearingAnswersSection, NonFunctionalSection, ReqDocTabs, RequirementsHowTo, ScheduleSection, type ReqDocSectionId,
} from '@/features/requirements/RequirementsDocSections';
import { AI_FLAG_MODE, getAiDraftPort } from '@/features/requirements/aiDraft/aiDraftPort';
import { AI_DRAFT_COPY, APPROVAL_BLOCK_COPY, aiPanelVisible, LEAVE_COPY, leaveDecision, shouldBlockLeave } from '@/features/requirements/aiDraft/aiDraftState';
import { useAiDraft } from '@/features/requirements/aiDraft/useAiDraft';
import { AiDraftPanel } from '@/features/requirements/aiDraft/AiDraftPanel';
import { isProposalV3 } from '@/types/aiDraft';
import { liveHowToStep, needsResave, saveHoldText } from '@/features/requirements/aiDraft/reqDocView';
import { useLiveSession } from '../session';

/** フラグ on の画面の印の説明（RequirementsPage と同じ。DEC lead F4） */
const AI_LIVE_TOOLTIP = 'AI 下書きは外部の AI サービスで作成し、担当者が確認してからお客様に出します。';

/** demo の RequirementsDocPage の説明（分析後）と同じ文 */
const DOC_DESCRIPTION = 'ヒアリングの回答と現行サイトの分析から AI がたたき台を作り、開発担当者が確認してお客様の承認を得ます。下のタブで 4 つの節を確認できます。';

/**
 * live の要件定義書の画面（管理者 /ai-studio/requirements・開発者 /dev/requirements。HearingGate の中）。
 * 見た目は demo の RequirementsDocPage と同じ骨組み（戻る導線 → PageHeader「要件定義書」→ つくり方 → 4 つのタブ。docs/design/REQDOC_U4_UI.md §3.1・2026-11-26 ユーザー決定）。
 * - draft: 「1. 改善提案」に AI 下書き（未生成・生成中・失敗は demo の空の状態の Surface の中、下書きありは表示／編集）。主操作は PageHeader の右
 * - analyzed・approved: 「1. 改善提案」は保存した提案（ProposalView）。ヒアリングの画面へは転送しない
 * - フラグ off の draft だけ、従来どおりヒアリングの画面へ転送する（AI 下書きを作る手段が無いため）
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
  const [section, setSection] = useState<ReqDocSectionId>('proposal');
  const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null);

  const role = account.role;
  const aiRole = role;
  const isAssigned = role === 'developer';
  const aiOn = DATA_MODE === 'live' && !!getAiDraftPort() && aiPanelVisible(AI_FLAG_MODE, aiRole, isAssigned);
  const ai = useAiDraft({
    projectId: req.projectId, answers: req.answers, reqStatus: status, role: aiRole, isAssignedDeveloper: isAssigned, uid, flagMode: AI_FLAG_MODE,
    enabled: aiOn && !loading && status === 'draft',
  });
  const autoStart = !!(location.state as { autoStart?: boolean } | null)?.autoStart;

  // アプリの中で別の画面へ移るとき（戻る導線・メニュー・ブラウザの戻る。§3.1）: 送れる変更は送り切ってから移る。
  // 送れない（理由・項目名の欠けで止めている／保存に失敗した）・送っても失敗したら「破棄して移動／編集を続ける」を確かめる（黙って捨てない）。
  // 同じ画面の中の URL の変化（autoStart の state を消す replace）は止めない。再読み込み・タブを閉じるのは useAiDraft の beforeunload
  const leaveInput = { save: ai.save, hold: ai.hold };
  const blocker = useBlocker(({ currentLocation, nextLocation }) => currentLocation.pathname !== nextLocation.pathname && shouldBlockLeave(leaveInput));
  const [askLeave, setAskLeave] = useState(false);
  const blocked = blocker.state === 'blocked';
  useEffect(() => {
    if (!blocked) { setAskLeave(false); return undefined; }
    let alive = true;
    const d = leaveDecision(leaveInput);
    if (d === 'go') { blocker.proceed?.(); return undefined; }
    if (d === 'confirm') { setAskLeave(true); return undefined; }
    void ai.flush().then((ok) => {
      if (!alive) return;
      if (ok) blocker.proceed?.();
      else setAskLeave(true);
    });
    return () => { alive = false; };
    // 止めた時点の 1 回だけ判定する（保存の状態の変化で判定し直さない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocked]);

  // 読み込み中は描画せず、書き込みも呼ばない（repositories/types.ts の決まり）
  if (loading) return <RouteLoader label="要件定義書" />;
  if (status === 'draft' && !aiOn) return <Navigate to={routes.input} replace />;

  const hasDraft = status === 'draft' && !ai.loading && !!ai.doc?.generated && ['ready', 'confirmed', 'running'].includes(ai.view.key);
  const step = liveHowToStep(status, hasDraft);
  const answersButton = (
    <Button variant="outlined" size="small" startIcon={<ListChecks size={15} />} component={RouterLink} to={routes.answers}>
      {status !== 'approved' ? '回答を見直す' : 'ヒアリングの回答'}
    </Button>
  );
  const actions: ReactNode = status === 'draft' ? (hasDraft ? (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 1 }}>
      {answersButton}
      <AiBadge label="AI" tooltip={AI_LIVE_TOOLTIP} />
      {/* 主操作（内容を確認した → 承認を依頼する）と保存の状態は AiDraftReviewV3 がここへ描く */}
      <Box ref={setActionsSlot} sx={{ display: 'contents' }} />
    </Stack>
  ) : undefined) : (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 1 }}>
      {answersButton}
      <AiBadge label="AI" tooltip={AI_LIVE_TOOLTIP} />
      {status === 'analyzed' && <StatusPill tone="info" icon={<Send size={13} />}>お客様の承認待ち</StatusPill>}
    </Stack>
  );

  // 未生成・生成中・失敗: demo の空の状態の Surface（RequirementsDocPage の draft と同じ寸法）の中に AI 下書きの面
  const emptyFrame = (body: ReactNode) => (
    <Reveal>
      <Surface sx={{ textAlign: 'center', py: { xs: 5, md: 7 }, px: { xs: 2.5, md: 4 }, maxWidth: 600, mx: 'auto' }}>
        <Stack alignItems="center" spacing={1.5} sx={{ '& > *': { width: '100%' } }}>{body}</Stack>
      </Surface>
    </Reveal>
  );

  return (
    <Box>
      <Button component={RouterLink} to={routes.project(req.projectId)} size="small" startIcon={<ArrowLeft size={16} />} sx={{ mb: 2, ml: -1 }}>
        プロジェクト詳細
      </Button>
      <PageHeader
        eyebrow="② 要件定義"
        icon={<Sparkles size={14} />}
        title="要件定義書"
        description={status === 'draft' && !hasDraft ? undefined : DOC_DESCRIPTION}
        actions={actions}
      />
      <RequirementsHowTo status={status} requested={status === 'analyzed'} current={step} />
      <ReqDocTabs value={section} onChange={setSection} />
      {section === 'proposal' && (status === 'draft' ? (
        <AiDraftPanel
          ai={ai} role={aiRole} isAssignedDeveloper={isAssigned} reqStatus={status}
          missing={analysisBlockers(req.answers).map((q) => q.text)}
          onMissing={() => navigate(routes.input)}
          autoStart={autoStart}
          // 1 回だけ（再読み込み・戻るで再び生成を始めないように state を消す）
          onAutoStarted={() => navigate(location.pathname, { replace: true, state: null })}
          frame={emptyFrame}
          actionsSlot={actionsSlot}
          onRequestApproval={async () => {
            // 提出の前に編集を送り切る。保存できなかったら依頼しない（edited が無い依頼はサーバーが拒否する）
            if (!(await ai.flush())) {
              toast(APPROVAL_BLOCK_COPY['save-failed'], 'error');
              return false;
            }
            // v3: サーバーの submitReady（保存のたびに必須の章を判定）が無い・false なら、今の編集を送り直してから依頼する（Rules が submitReady を提出の条件にする＝U3）
            // 別の版のひな型で判定した submitReady も送り直す（needsResave）
            const g = ai.doc?.generated;
            if (g && isProposalV3(g) && needsResave(ai.doc?.submitReady, g.template?.version ?? '') && !(await ai.resave())) {
              toast(APPROVAL_BLOCK_COPY['save-failed'], 'error');
              return false;
            }
            // 依頼すると status が analyzed になり、この画面のまま保存した提案（ProposalView）を出す
            const ok = await write(requirements.completeAnalysis(req.projectId, { proposal: 'aiDraft' }), AI_DRAFT_COPY.approval.done, 'ai');
            if (ok) window.scrollTo({ top: 0 });
            return ok;
          }}
        />
      ) : <ProposalView />)}
      {section === 'answers' && <HearingAnswersSection req={req} />}
      {/* live に日程は無い（承認後に入力します。RequirementsDocSections の ScheduleSection） */}
      {section === 'schedule' && <ScheduleSection />}
      {section === 'nonfunctional' && <NonFunctionalSection />}
      <Dialog open={blocked && askLeave} onClose={() => blocker.reset?.()} maxWidth="xs" fullWidth aria-labelledby="reqdoc-leave-title">
        <DialogTitle id="reqdoc-leave-title">{LEAVE_COPY.title}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{LEAVE_COPY.body(ai.hold > 0 ? saveHoldText(ai.holdReasons) : ai.save === 'failed' ? (ai.saveError?.message ?? LEAVE_COPY.failed) : LEAVE_COPY.failed)}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => blocker.reset?.()}>{LEAVE_COPY.stay}</Button>
          <Button color="error" onClick={() => { ai.discardPending(); blocker.proceed?.(); }}>{LEAVE_COPY.discard}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
