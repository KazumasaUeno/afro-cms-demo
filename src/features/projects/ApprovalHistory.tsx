import { Box, Button, Stack, Typography } from '@mui/material';
import { Download, History } from 'lucide-react';
import { useState } from 'react';
import { StatusPill, Surface } from '@/components/ui';
import { useRepositories } from '@/repositories';
import { downloadText } from '@/services/download';
import { jstStamp as stamp, toCsv } from '@/services/csv';
import { tokens } from '@/theme/tokens';

/**
 * 承認の履歴（日時つき）。後で「承認しましたよね」と示せる証跡として、管理者画面（プロジェクト詳細）と開発者画面の両方に出す。
 * 記録は reducer の approval() が残す（件数で消さない）。projectId の無い古い記録は、デモのデータを持つ案件のものとみなす。
 */

const SIDE = { client: { label: 'お客様', tone: 'success' }, afro: { label: 'アフロ', tone: 'info' } } as const;
const SHOW = 8;

export function ApprovalHistory({ projectId, siteName }: { projectId: string; siteName: string }) {
  const { data: logs } = useRepositories().approvals.useHistory(projectId);
  const [all, setAll] = useState(false);
  const shown = all ? logs : logs.slice(0, SHOW);

  const download = () => {
    const rows = [['日時（日本時間）', '立場', '操作した人', '操作', '対象'], ...logs.map((l) => [stamp(l.at), SIDE[l.side].label, l.actor, l.action, l.target])];
    downloadText(`承認履歴_${siteName}.csv`, toCsv(rows), 'text/csv;charset=utf-8');
  };

  return (
    <Surface component="section" aria-labelledby={`approval-history-${projectId}`}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1, flexWrap: 'wrap', rowGap: 1 }}>
        <History size={18} color={tokens.color.muted} aria-hidden />
        <Typography id={`approval-history-${projectId}`} variant="h5" component="h2" sx={{ flex: 1, minWidth: 0 }}>承認の履歴</Typography>
        {logs.length > 0 && <Button size="small" variant="outlined" startIcon={<Download size={15} />} onClick={download}>CSVで保存</Button>}
      </Stack>
      <Typography variant="caption" component="p" sx={{ mb: 1.5 }}>
        誰が・いつ（日本時間）・何を承認したかを秒まで記録しています（{logs.length} 件）。後から内容を確認するときの証跡になります。
      </Typography>
      {logs.length === 0 ? (
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
              </Box>
            </Box>
          ))}
        </Box>
      )}
      {logs.length > SHOW && (
        <Button size="small" onClick={() => setAll((v) => !v)} sx={{ mt: 1 }}>{all ? '最近の 8 件だけ表示' : `すべて表示（${logs.length} 件）`}</Button>
      )}
    </Surface>
  );
}
