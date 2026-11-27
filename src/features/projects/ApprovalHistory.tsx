import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import { Download, History } from 'lucide-react';
import { useState } from 'react';
import { StatusPill, Surface } from '@/components/ui';
import { useRepositories } from '@/repositories';
import { downloadText } from '@/services/download';
import { jstStamp as stamp, toCsv } from '@/services/csv';
import { tokens } from '@/theme/tokens';
import { approvalCsvRows, SIDE_LABEL } from './approvalCsv';

/**
 * 承認の履歴（日時つき）。後で「承認しましたよね」と示せる証跡として、管理者画面（プロジェクト詳細）と開発者画面の両方に出す。
 * 記録は reducer の approval() / live は projects/{id}/approvals が残す（件数で消さない）。データは repository（approvals.useHistory）からだけ読む（DemoStore を直接読まない）。
 */

const SIDE = { client: { label: SIDE_LABEL.client, tone: 'success' }, afro: { label: SIDE_LABEL.afro, tone: 'info' } } as const;
const SHOW = 8;

export function ApprovalHistory({ projectId, siteName }: { projectId: string; siteName: string }) {
  // 依頼の行の補い（demo の approvalRequests）は repository の demo 実装が行う（ここで DemoStore を読まない＝live でも動く。0.47.4）
  // live の読み込み中は data が [] なので「記録なし」と判定しない（repositories/types.ts の決まり）。demo は常に loading: false
  const { data: logs, loading, error } = useRepositories().approvals.useHistory(projectId);
  const ready = !loading && !error;
  const [all, setAll] = useState(false);
  const shown = all ? logs : logs.slice(0, SHOW);

  const download = () => {
    downloadText(`承認履歴_${siteName}.csv`, toCsv(approvalCsvRows(logs)), 'text/csv;charset=utf-8');
  };

  return (
    <Surface component="section" aria-labelledby={`approval-history-${projectId}`}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1, flexWrap: 'wrap', rowGap: 1 }}>
        <History size={18} color={tokens.color.muted} aria-hidden />
        <Typography id={`approval-history-${projectId}`} variant="h5" component="h2" sx={{ flex: 1, minWidth: 0 }}>承認の履歴</Typography>
        {ready && logs.length > 0 && <Button size="small" variant="outlined" startIcon={<Download size={15} />} onClick={download}>CSVで保存</Button>}
      </Stack>
      <Typography variant="caption" component="p" sx={{ mb: 1.5 }}>
        誰が・いつ（日本時間）・何を承認したか（承認の依頼も）を秒まで記録しています{ready && `（${logs.length} 件）`}。後から内容を確認するときの証跡になります。
      </Typography>
      {loading ? (
        <Typography variant="body2" color="text.secondary" role="status" aria-live="polite" sx={{ py: 1 }}>承認の履歴を読み込み中…</Typography>
      ) : error ? (
        <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => window.location.reload()}>再読み込み</Button>}>
          承認の履歴を読み込めませんでした。接続を確かめて再読み込みしてください。
        </Alert>
      ) : logs.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>まだ承認の記録はありません。</Typography>
      ) : (
        <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {shown.map((l) => (
            <Box component="li" key={l.id} sx={{ py: 1, borderTop: `1px solid ${tokens.color.border}`, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '170px minmax(0,1fr)' }, gap: { xs: 0.25, sm: 1.5 } }}>
              <Typography variant="caption" component="time" dateTime={l.at} sx={{ fontVariantNumeric: 'tabular-nums', color: tokens.color.muted }}>{stamp(l.at)}</Typography>
              <Box sx={{ minWidth: 0 }}>
                <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
                  <StatusPill tone={SIDE[l.side].tone} dot={false}>{SIDE[l.side].label}</StatusPill>
                  <Typography variant="body2" sx={{ fontWeight: 650, overflowWrap: 'anywhere' }}>{l.action}</Typography>
                </Stack>
                <Typography variant="caption" sx={{ display: 'block', overflowWrap: 'anywhere' }}>{l.target}・{l.actor}</Typography>
                {/* スケジュールの取り下げ・再計画の理由（live だけ。お客様にも見せる。LIVE_SCHEDULE_PLAN L-8・U4） */}
                {l.note && (
                  <Typography variant="caption" data-testid="approval-note" sx={{ display: 'block', overflowWrap: 'anywhere', color: tokens.color.inkSoft }}>
                    理由：{l.note}
                  </Typography>
                )}
                {/* 代理承認（live だけ。demo の記録は proxy を持たない）: 理由と、依頼と同じ人が承認したことを出す（ADMIN_FULL_RIGHTS_PLAN §7-5） */}
                {l.proxy && (
                  <Typography variant="caption" data-testid="approval-proxy-note" sx={{ display: 'block', overflowWrap: 'anywhere', color: tokens.color.warningInk }}>
                    代理の理由：{l.proxy.note}{l.proxy.sameAsRequester ? '（確認の依頼と同じ人が代理で承認）' : ''}
                  </Typography>
                )}
              </Box>
            </Box>
          ))}
        </Box>
      )}
      {ready && logs.length > SHOW && (
        <Button size="small" onClick={() => setAll((v) => !v)} sx={{ mt: 1 }}>{all ? '最近の 8 件だけ表示' : `すべて表示（${logs.length} 件）`}</Button>
      )}
    </Surface>
  );
}
