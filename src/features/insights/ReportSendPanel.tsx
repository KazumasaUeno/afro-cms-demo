import { Box, Button, FormControlLabel, Stack, Switch, Typography } from '@mui/material';
import { Mail, Send } from 'lucide-react';
import { currentProject, useDemo } from '@/store/DemoStore';
import { clientAccountsState } from '@/store/reducer';
import { nextDiagnosisAt, reportRecipients, reportSendOf } from '@/data/reportSend';
import { useProjectRoutes } from '@/features/projects/projectRoutes';
import { useDevUser } from '@/features/dev/useDevUser';
import { useToast } from '@/hooks/useToast';
import { formatDate, formatDateTime } from '@/services/time';
import { tokens } from '@/theme/tokens';
import { SectionTitle, StatusPill, Surface } from '@/components/ui';

/**
 * 改善レポートの自動送信（0.34.0。2026-11-13 ユーザー指示）。選んでいる案件の分。
 * 設定とテスト送信は開発者画面だけ（管理者画面は見るだけ）。デモのため実際のメールは送らず、送信の記録だけ残す
 */
export function ReportSendPanel() {
  const { state, dispatch } = useDemo();
  const { dev } = useProjectRoutes();
  const me = useDevUser();
  const toast = useToast();
  const project = currentProject(state);
  const rs = reportSendOf(state);
  const recipients = reportRecipients(clientAccountsState(state), project);
  const registered = recipients.some((r) => r.email);

  return (
    <Surface>
      <SectionTitle title="改善レポートの自動送信" icon={<Mail size={18} />} sub={<Box sx={{ ml: 1 }}><StatusPill tone="warning" dot={false}>デモ・メールは送信されません</StatusPill></Box>} />
      <Stack spacing={2}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} justifyContent="space-between">
          {dev ? (
            <FormControlLabel
              control={<Switch checked={rs.enabled} onChange={(e) => {
                dispatch({ type: 'setReportSend', enabled: e.target.checked, devBy: me.id });
                toast(e.target.checked ? '自動送信をオンにしました（シミュレーション）' : '自動送信をオフにしました', 'info');
              }} />}
              label={<Typography variant="body2" sx={{ fontWeight: 600 }}>診断の後にお客様へ自動送信</Typography>}
            />
          ) : (
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="body2" sx={{ fontWeight: 600 }}>診断の後にお客様へ自動送信</Typography>
              <StatusPill tone={rs.enabled ? 'success' : 'neutral'}>{rs.enabled ? 'オン' : 'オフ'}</StatusPill>
            </Stack>
          )}
          {dev && (
            <Button variant="outlined" size="small" startIcon={<Send size={15} />} sx={{ alignSelf: { xs: 'flex-start', sm: 'center' } }} onClick={() => {
              dispatch({ type: 'testReportSend', devBy: me.id });
              toast('テスト送信を記録しました（メールは送信されません）', 'info');
            }}>
              今すぐテスト送信
            </Button>
          )}
        </Stack>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 600 }}>宛先</Typography>
            {recipients.map((r) => (
              <Typography key={`${r.name}-${r.email ?? ''}`} variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                {r.name}{r.email ? `（${r.email}）` : ''}
              </Typography>
            ))}
            {!registered && <Typography variant="caption" sx={{ display: 'block' }}>お客様アカウントが未登録のため、メールアドレスはありません（ユーザー管理で登録すると入ります）</Typography>}
          </Box>
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 600 }}>次回の送信予定</Typography>
            <Typography variant="body2">
              {rs.enabled ? `${formatDate(nextDiagnosisAt(state.diagnoses))}（次回の AI サイト診断の後）` : 'オフのため送信しません'}
            </Typography>
          </Box>
        </Box>

        <Box>
          <Typography variant="caption" sx={{ fontWeight: 600 }}>送信履歴</Typography>
          {rs.history.length === 0 ? (
            <Typography variant="body2" color="text.secondary">まだ送信の記録はありません。</Typography>
          ) : (
            <Stack component="ul" spacing={0.75} sx={{ listStyle: 'none', m: 0, p: 0, mt: 0.5 }}>
              {rs.history.map((h) => (
                <Stack component="li" key={h.id} direction="row" spacing={1.25} alignItems="center" sx={{ p: 1.25, borderRadius: '12px', border: `1px solid ${tokens.color.border}` }}>
                  <StatusPill tone={h.kind === 'test' ? 'info' : 'success'} dot={false}>{h.kind === 'test' ? 'テスト' : '自動送信'}</StatusPill>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{h.cycle ? `第${h.cycle}回 改善レポート` : '改善レポート'}</Typography>
                    <Typography variant="caption" sx={{ display: 'block', overflowWrap: 'anywhere' }}>
                      {formatDateTime(h.at)}・宛先 {h.recipients.map((r) => r.name).join('・') || 'なし'}{h.kind === 'test' ? `・${h.by}` : ''}
                    </Typography>
                  </Box>
                </Stack>
              ))}
            </Stack>
          )}
        </Box>

        {!dev && <Typography variant="caption">設定とテスト送信は開発者画面のインサイトで行います（この画面は見るだけです）。</Typography>}
      </Stack>
    </Surface>
  );
}
