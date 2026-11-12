import { Alert, Box, Button, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { StatusPill, Surface, type PillTone } from '@/components/ui';
import type { ReqStatus } from '../model';

export const REQ_STATUS: Record<ReqStatus, { label: string; tone: PillTone }> = {
  draft: { label: 'ヒアリング入力中', tone: 'neutral' },
  analyzed: { label: 'お客様の承認待ち', tone: 'info' },
  approved: { label: '要件定義書 承認済み', tone: 'success' },
};

export function ReqStatusPill({ status }: { status: ReqStatus }) {
  const s = REQ_STATUS[status];
  return <StatusPill tone={s.tone}>{s.label}</StatusPill>;
}

/** 空・見つからない・読めない、の表示（Error は再読み込みの手段つき） */
export function EmptyState({ title, body, action }: { title: string; body?: ReactNode; action?: { to: string; label: string } }) {
  return (
    <Surface sx={{ textAlign: 'center', py: 5 }}>
      <Typography variant="h4" component="h2" sx={{ mb: 1 }}>{title}</Typography>
      {body && <Typography variant="body2" color="text.secondary" sx={{ mb: action ? 2 : 0 }}>{body}</Typography>}
      {action && <Button variant="contained" component={RouterLink} to={action.to}>{action.label}</Button>}
    </Surface>
  );
}

export function LoadError({ what }: { what: string }) {
  return (
    <Box>
      <Alert
        severity="error"
        action={<Button color="inherit" size="small" onClick={() => window.location.reload()}>再読み込み</Button>}
      >
        {what}を読み込めませんでした。接続を確かめて再読み込みしてください。
      </Alert>
    </Box>
  );
}
