import { ButtonBase } from '@mui/material';
import { Check } from 'lucide-react';
import { StatusPill } from '@/components/ui';
import { useRepositories } from '@/repositories';
import { useToast } from '@/hooks/useToast';
import { tokens } from '@/theme/tokens';
import { TOUCH } from '@/theme/media';
import type { RequirementQuestion } from '@/types';
import { questionStatus } from './assignment';

/**
 * 質問ごとの回答の状態（回答済み＝緑のチェック / 未回答）。
 * 受託開発ではアフロが全問を入力するので、担当・分担は出さない（2026-11-10 決定）。
 * 0.17 までの保存データでお客様が入力した回答は、アフロが内容を確認するまで「確認待ち」（承認の条件は reducer と同じ）
 */
export function AnswerStatus({ question }: { question: RequirementQuestion }) {
  const { data: req } = useRepositories().requirements.useCurrent();
  const s = questionStatus(question, req);
  if (s.state === 'unanswered') return <StatusPill tone="neutral">未回答</StatusPill>;
  if (s.state === 'proxy') return <StatusPill tone="warning">内容の確認待ち</StatusPill>;
  return <StatusPill tone="success" icon={<Check size={13} strokeWidth={3} />}>回答済み</StatusPill>;
}

/** 内容の確認ボタン（確認待ちの回答だけに出す。管理者画面から確認する） */
export function ConfirmAnswerButton({ question }: { question: RequirementQuestion }) {
  const { requirements } = useRepositories();
  const { data: req } = requirements.useCurrent();
  const toast = useToast();
  const s = questionStatus(question, req);
  if (s.state !== 'proxy' || s.assignee !== 'afro') return null;
  return (
    <ButtonBase
      onClick={() => { void requirements.confirmAnswer(req.projectId, question.id, 'afro'); toast('回答を確認しました'); }}
      sx={{ px: 1.25, height: 30, [TOUCH]: { height: 44 }, borderRadius: '8px', fontSize: 12.5, fontWeight: 650, color: tokens.color.primary, border: `1px solid ${tokens.color.primary}`, '&:hover': { bgcolor: tokens.color.primarySoft } }}
    >
      内容を確認しました
    </ButtonBase>
  );
}
