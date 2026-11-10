import { Box, Button, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { Building2, Database, Info, RotateCcw, ShieldCheck, Sparkles, Wind } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import type { DemoState } from '@/types';
import { useDemo } from '@/store/DemoStore';
import { useToast } from '@/hooks/useToast';
import { PageHeader, Reveal, SectionTitle, Surface } from '@/components/ui';
import { ResetDemoDialog } from '@/components/layout/ResetDemoDialog';
import { tokens } from '@/theme/tokens';

const MAX_COMPANY = 40;

function validateCompany(v: string): string | null {
  const t = v.trim();
  if (!t) return '会社名を入力してください';
  if (t.length > MAX_COMPANY) return `${MAX_COMPANY}文字以内で入力してください`;
  if (/[<>]/.test(t)) return '「<」「>」は使えません';
  return null;
}

function Row({ icon, title, description, children }: { icon: ReactNode; title: string; description: ReactNode; children: ReactNode }) {
  return (
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 1.5, md: 4 }} sx={{ py: 2.5, borderTop: `1px solid ${tokens.color.border}`, '&:first-of-type': { borderTop: 'none', pt: 0 } }}>
      <Stack direction="row" spacing={1.5} sx={{ width: { md: 320 }, flexShrink: 0 }}>
        <Box sx={{ width: 36, height: 36, borderRadius: '11px', bgcolor: tokens.color.bgSubtle, color: tokens.color.inkSoft, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{icon}</Box>
        <Box>
          <Typography variant="h5" component="h3">{title}</Typography>
          <Typography variant="caption" sx={{ display: 'block', mt: 0.25 }}>{description}</Typography>
        </Box>
      </Stack>
      <Box sx={{ flex: 1, minWidth: 0 }}>{children}</Box>
    </Stack>
  );
}

/** 設定（デモの設定のみ。認証・権限は本デモの範囲外） */
export default function SettingsPage() {
  const { state, dispatch } = useDemo();
  const toast = useToast();
  const [company, setCompany] = useState(state.settings.companyName);
  const [touched, setTouched] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const error = validateCompany(company);
  const dirty = company.trim() !== state.settings.companyName;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (error) return;
    dispatch({ type: 'updateSettings', patch: { companyName: company.trim() } });
    setCompany(company.trim());
    toast('会社名を保存しました');
  };

  return (
    <Box sx={{ maxWidth: 960 }}>
      <PageHeader title="設定" description="デモ環境の表示と動作を設定します。変更はこのブラウザにだけ保存されます。" />

      <Reveal>
        <Surface padding={{ xs: 2.5, md: 3.5 }} sx={{ mb: 3 }}>
          <SectionTitle title="ワークスペース" />
          <Row icon={<Building2 size={18} />} title="会社名" description="提案書やレポートの発行元として表示します。">
            <Box component="form" onSubmit={submit} noValidate>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'flex-start' }}>
                <TextField
                  fullWidth
                  size="small"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  onBlur={() => setTouched(true)}
                  error={touched && !!error}
                  helperText={touched && error ? error : `${company.trim().length} / ${MAX_COMPANY}文字`}
                  inputProps={{ 'aria-label': '会社名', maxLength: MAX_COMPANY + 10 }}
                />
                <Button type="submit" variant="contained" disabled={!dirty} sx={{ flexShrink: 0 }}>保存</Button>
              </Stack>
            </Box>
          </Row>
          <Row icon={<Wind size={18} />} title="動きを減らす" description="画面の切り替えやAI演出のアニメーションを控えめにします。「システム」は端末の設定に従います。">
            <ToggleButtonGroup
              exclusive
              size="small"
              value={state.settings.reducedMotion}
              onChange={(_, v: DemoState['settings']['reducedMotion'] | null) => {
                if (!v) return;
                dispatch({ type: 'updateSettings', patch: { reducedMotion: v } });
                toast(v === 'on' ? '動きを減らしました' : v === 'off' ? 'アニメーションを有効にしました' : '端末の設定に従います', 'info');
              }}
              aria-label="動きを減らす"
            >
              <ToggleButton value="system">システム</ToggleButton>
              <ToggleButton value="on">減らす</ToggleButton>
              <ToggleButton value="off">減らさない</ToggleButton>
            </ToggleButtonGroup>
          </Row>
        </Surface>
      </Reveal>

      <Reveal delay={0.06}>
        <Surface padding={{ xs: 2.5, md: 3.5 }} sx={{ mb: 3 }}>
          <SectionTitle title="デモデータ" />
          <Row icon={<Database size={18} />} title="保存場所" description="入力・承認・編集の結果は、このブラウザの localStorage に保存されます。サーバーには送信しません。">
            <Typography variant="body2" color="text.secondary">
              別のブラウザや端末には引き継がれません。プライベートモードなど保存できない環境では、ページを再読み込みすると最初の状態に戻ります。
            </Typography>
          </Row>
          <Row icon={<RotateCcw size={18} />} title="デモの初期化" description="商談の前後に、すべての操作を最初の状態に戻します。">
            <Button variant="outlined" color="warning" startIcon={<RotateCcw size={16} />} onClick={() => setResetOpen(true)}>
              デモデータを初期化
            </Button>
          </Row>
        </Surface>
      </Reveal>

      <Reveal delay={0.12}>
        <Surface padding={{ xs: 2.5, md: 3.5 }} tone="muted">
          <SectionTitle title="このデモについて" icon={<Info size={18} color={tokens.color.muted} />} />
          <Stack spacing={2}>
            <Stack direction="row" spacing={1.5}>
              <Sparkles size={18} color={tokens.color.accentInk} style={{ flexShrink: 0, marginTop: 2 }} />
              <Typography variant="body2">
                <b>AI機能はすべてシミュレーションです。</b>要件分析・デザイン生成・サイト診断の結果は事前に用意したデータで、実際のAI生成は行っていません。画面上の「AIシミュレーション」の表示が目印です。
              </Typography>
            </Stack>
            <Stack direction="row" spacing={1.5}>
              <ShieldCheck size={18} color={tokens.color.success} style={{ flexShrink: 0, marginTop: 2 }} />
              <Typography variant="body2">
                <b>外部への送信はありません。</b>入力したURLや文章を外部のAIやサーバーに送ることはありません。公開・予約公開もデモデータ上の状態変更だけです。
              </Typography>
            </Stack>
            <Stack direction="row" spacing={1.5}>
              <Info size={18} color={tokens.color.muted} style={{ flexShrink: 0, marginTop: 2 }} />
              <Typography variant="body2" color="text.secondary">
                顧客名・サイト・担当者・数値はすべて架空のデモデータです。ログイン・権限設定・二段階認証は本番開発で実装する予定の範囲です。
              </Typography>
            </Stack>
          </Stack>
        </Surface>
      </Reveal>

      <ResetDemoDialog open={resetOpen} onClose={() => setResetOpen(false)} onDone={() => setCompany('アフロ株式会社')} />
    </Box>
  );
}
