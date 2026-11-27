import { Button } from '@mui/material';
import { Send } from 'lucide-react';
import { StatusPill } from '@/components/ui';
import { formatDateTime } from '@/services/time';

/**
 * 「承認を依頼する」ボタンと「承認依頼済み」の表示（見た目だけ。DemoStore を読まない）。
 * demo は RequestApprovalButton（DemoStore の状態と操作）、live のスケジュール（src/live/pages/LiveSchedulePage.tsx）はここを直接使う
 * （LIVE_SCHEDULE_PLAN L-13。DOM を同じにするため部品を 1 つにした）
 */
export function ApprovalRequestedPill({ requestedAt }: { requestedAt: string }) {
  return <StatusPill tone="info" icon={<Send size={13} />}>承認依頼済み（{formatDateTime(requestedAt)}）</StatusPill>;
}

/** busy: live の送信中（押せない・文言を変える）。demo は渡さない */
export function RequestApprovalAction({ blockedReason, onClick, busy = false }: { blockedReason?: string; onClick: () => void; busy?: boolean }) {
  return (
    <Button
      variant="contained" startIcon={<Send size={16} />} disabled={!!blockedReason || busy} title={blockedReason}
      onClick={onClick}
    >
      {busy ? '依頼しています…' : '承認を依頼する'}
    </Button>
  );
}
