import type { ApprovalKey } from '@/types';
import { useDemo } from '@/store/DemoStore';
import { useToast } from '@/hooks/useToast';
import { useQualityDevBy } from '@/features/quality/useQualityDevBy';
import { approvalSteps, canRequestApproval } from './portalSteps';
import { ApprovalRequestedPill, RequestApprovalAction } from './RequestApprovalButtonView';

/**
 * お客様へ承認を依頼するボタン（2026-11-17 会議「アフロの準備ができる前にお客様の画面で承認待ちになる」）。
 * 開発者画面の要件定義書（管理者画面では依頼済みの表示だけ）・サイトマップ・デザイン・品質チェックの画面に置く。
 * - 前の節目が済み、まだ依頼していない: 「承認を依頼する」（blocked のときは押せない。理由は blockedReason）
 * - 依頼済みで未承認: 「承認依頼済み（日時）」
 * - それ以外（承認済み・前の節目が未了）: 何も出さない
 */
export function RequestApprovalButton({ approvalKey, blockedReason }: { approvalKey: ApprovalKey; blockedReason?: string }) {
  const { state, dispatch } = useDemo();
  const devBy = useQualityDevBy();
  const toast = useToast();
  const step = approvalSteps(state).find((s) => s.key === approvalKey);
  if (!step) return null;
  if (step.status === 'waiting' && step.requestedAt) {
    return <ApprovalRequestedPill requestedAt={step.requestedAt} />;
  }
  // 依頼できるのは開発者画面だけ（管理者画面は見るだけ。2026-11-17 レビュー）
  if (!devBy || !canRequestApproval(state, approvalKey)) return null;
  return (
    <RequestApprovalAction
      blockedReason={blockedReason}
      onClick={() => { dispatch({ type: 'requestApproval', key: approvalKey, devBy }); toast('お客様へ承認を依頼しました'); }}
    />
  );
}
