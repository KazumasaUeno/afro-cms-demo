import { Box, Button, FormControlLabel, Stack, Switch, Typography } from '@mui/material';
import { Download, Mail } from 'lucide-react';
import type { DiagnosisReport } from '@/types';
import { tokens } from '@/theme/tokens';
import { formatDateTime } from '@/services/time';
import { useToast } from '@/hooks/useToast';
import { AiBadge, ProgressRing, StatusPill } from '@/components/ui';
import { TOTAL_DIAGNOSIS_QUESTIONS } from '@/data/insights';
import { reportSendOf } from '@/data/reportSend';
import { useDemo } from '@/store/DemoStore';
import { useProjectRoutes } from '@/features/projects/projectRoutes';
import { useDevUser } from '@/features/dev/useDevUser';
import { useLocation } from 'react-router-dom';
import { areaOf } from '@/components/layout/nav';

export const DISCLAIMER = [
  '本レポートは、公開Webサイトの情報をもとにAIが分析したものです。',
  '実際のアクセス状況、検索流入、問い合わせ率、ユーザー行動などを組み合わせることで、改善施策の優先順位をより具体的に検討できます。',
  '詳細な分析や改善施策の実施をご希望の場合は、お気軽にお問い合わせください。',
];

const PRIORITY = { high: { label: '優先度 高', tone: 'danger' }, medium: { label: '優先度 中', tone: 'warning' }, low: { label: '優先度 低', tone: 'neutral' } } as const;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function download(report: DiagnosisReport, siteName: string) {
  const html = `<!doctype html><html lang="ja"><meta charset="utf-8"><title>AIサイト診断レポート（デモデータ）</title>
<body style="font-family:sans-serif;max-width:760px;margin:40px auto;color:#0f172a;line-height:1.7">
<p style="background:#FEF5E3;padding:8px 12px;border-radius:8px"><b>デモデータ</b>：本ファイルはアフロCMSデモが生成したサンプルであり、実際の診断結果ではありません。</p>
<h1>AIサイト診断レポート 第${report.cycle}回</h1>
<p>${esc(siteName)} ／ ${esc(formatDateTime(report.at))} ／ 全8カテゴリー${TOTAL_DIAGNOSIS_QUESTIONS}問</p>
<h2>総合スコア：${report.score}</h2>
<ul>${report.categories.map((c) => `<li>${esc(c.name)}：${c.score}</li>`).join('')}</ul>
<h2>改善提案</h2>
<ol>${report.findings.map((f) => `<li><b>[${PRIORITY[f.priority].label}] ${esc(f.title)}</b><br>${esc(f.detail)}</li>`).join('')}</ol>
<hr><h3>より詳しい改善分析をご希望の場合</h3><p>${DISCLAIMER.map(esc).join('<br>')}</p>
</body></html>`;
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `afro-cms-report-${report.at.slice(0, 10)}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function DiagnosisReportView({ report, siteName }: { report: DiagnosisReport; siteName: string }) {
  const toast = useToast();
  // 自動送信の設定（0.34.0。以前はこの画面だけの見た目のスイッチで、何も残らなかった）。変えられるのは開発者画面だけ。
  // 管理者画面・お客様ポータルは状態だけ出す
  const { state, dispatch } = useDemo();
  const { dev } = useProjectRoutes();
  const me = useDevUser();
  const auto = reportSendOf(state).enabled;
  const portal = areaOf(useLocation().pathname) === 'portal';
  const sorted = [...report.findings].sort((a, b) => ['high', 'medium', 'low'].indexOf(a.priority) - ['high', 'medium', 'low'].indexOf(b.priority));
  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} alignItems={{ sm: 'center' }}>
        <ProgressRing value={report.score} size={120} stroke={10} color={tokens.color.primary} label="総合スコア">
          <Box sx={{ textAlign: 'center' }}>
            <Typography sx={{ fontSize: 32, fontWeight: 750, lineHeight: 1 }}>{report.score}</Typography>
            <Typography sx={{ fontSize: 12, color: tokens.color.muted }}>/ 100</Typography>
          </Box>
        </ProgressRing>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} sx={{ mb: 1, flexWrap: 'wrap', gap: 1 }}>
            <StatusPill tone="warning" dot={false}>デモデータ</StatusPill>
            <AiBadge />
          </Stack>
          <Typography variant="h3">第{report.cycle}回 AIサイト診断</Typography>
          <Typography variant="caption">{formatDateTime(report.at)} ・ 全8カテゴリー{TOTAL_DIAGNOSIS_QUESTIONS}問</Typography>
        </Box>
      </Stack>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, columnGap: 3, rowGap: 1.25 }}>
        {report.categories.map((c) => (
          <Box key={c.name}>
            <Stack direction="row" justifyContent="space-between"><Typography variant="body2">{c.name}</Typography><Typography variant="body2" sx={{ fontWeight: 700 }}>{c.score}</Typography></Stack>
            <Box sx={{ height: 6, borderRadius: 99, bgcolor: tokens.color.bgSubtle, mt: 0.5 }}>
              <Box sx={{ width: `${c.score}%`, height: '100%', borderRadius: 99, bgcolor: c.score >= 80 ? tokens.color.success : c.score >= 70 ? tokens.color.primary : tokens.color.warning }} />
            </Box>
          </Box>
        ))}
      </Box>

      <Stack spacing={1.25}>
        <Typography variant="h5">改善提案</Typography>
        {sorted.map((f) => (
          <Box key={f.title} sx={{ p: 2, borderRadius: '14px', border: `1px solid ${tokens.color.border}`, bgcolor: tokens.color.surface }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
              <StatusPill tone={PRIORITY[f.priority].tone}>{PRIORITY[f.priority].label}</StatusPill>
              <Typography variant="h6">{f.title}</Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary">{f.detail}</Typography>
          </Box>
        ))}
      </Stack>

      <Box sx={{ p: 2, borderRadius: '14px', bgcolor: tokens.color.surfaceMuted, border: `1px dashed ${tokens.color.borderStrong}` }}>
        <Typography variant="h6" sx={{ mb: 0.5 }}>より詳しい改善分析をご希望の場合</Typography>
        {DISCLAIMER.map((d) => <Typography key={d} variant="body2" color="text.secondary">{d}</Typography>)}
      </Box>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} justifyContent="space-between">
        {dev ? (
          <FormControlLabel
            control={<Switch checked={auto} onChange={(e) => { dispatch({ type: 'setReportSend', enabled: e.target.checked, devBy: me.id }); toast(e.target.checked ? '4か月ごとの自動送信をオンにしました（シミュレーション）' : '自動送信をオフにしました', 'info'); }} />}
            label={<Stack direction="row" spacing={0.75} alignItems="center"><Mail size={15} /><Typography variant="body2">次回から顧客へ自動送信</Typography></Stack>}
          />
        ) : (
          <Stack direction="row" spacing={0.75} alignItems="center">
            <Mail size={15} />
            <Typography variant="body2">{portal ? '診断のたびにメールでお届け（デモ）' : '顧客への自動送信'}</Typography>
            <StatusPill tone={auto ? 'success' : 'neutral'}>{auto ? 'オン' : 'オフ'}</StatusPill>
          </Stack>
        )}
        <Button variant="contained" startIcon={<Download size={16} />} onClick={() => { download(report, siteName); toast('レポートをダウンロードしました'); }}>レポートをダウンロード</Button>
      </Stack>
    </Stack>
  );
}
