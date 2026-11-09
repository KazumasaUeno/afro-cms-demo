import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Stack, Switch, Tab, Tabs, Typography } from '@mui/material';
import { Ban, Info, Pencil, Plus, RotateCcw } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ClientAccount } from '@/types';
import { MemberAvatar, PageHeader, Reveal, StatusPill, Surface } from '@/components/ui';
import { clientAccountsState, devAccessState, useDemo } from '@/store/DemoStore';
import { useToast } from '@/hooks/useToast';
import { useSessions } from '@/services/session';
import { formatDate } from '@/services/time';
import { MEMBERS } from '@/data/members';
import { CLIENT_STATUS, normalizeEmail, type ClientAccountDraft } from '@/data/users';
import { tokens } from '@/theme/tokens';
import { ClientAccountDialog } from './ClientAccountDialog';

type TabId = 'clients' | 'dev';

const mono = { fontFamily: tokens.font.mono, overflowWrap: 'anywhere' } as const;

/** デモであることの注記（見た目の制御であって、セキュリティ境界ではない） */
function DemoNote({ children }: { children: ReactNode }) {
  return (
    <Stack direction="row" spacing={1.25} sx={{ p: 1.5, borderRadius: `${tokens.radius.sm}px`, bgcolor: tokens.color.infoSoft, color: tokens.color.inkSoft }}>
      <Info size={18} color={tokens.color.info} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden />
      <Typography variant="body2" sx={{ color: 'inherit' }}>{children}</Typography>
    </Stack>
  );
}

/** お客様の一覧（PC は列、スマホは 1 件ずつ縦に並べる） */
const CLIENT_COLUMNS = { md: 'minmax(0,1.3fr) minmax(0,1.3fr) minmax(0,1fr) 88px 220px' };

function ClientRow({ account, siteName, accent, onEdit, onToggle }: {
  account: ClientAccount; siteName: string; accent: string; onEdit: () => void; onToggle: () => void;
}) {
  const st = CLIENT_STATUS[account.status];
  const disabled = account.status === 'disabled';
  return (
    <Box
      component="li"
      sx={{
        display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', ...CLIENT_COLUMNS }, gap: { xs: 1, md: 2 }, alignItems: 'center',
        px: { xs: 2, md: 2.5 }, py: { xs: 2, md: 1.75 }, borderTop: `1px solid ${tokens.color.border}`, '&:first-of-type': { borderTop: 'none' },
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 700, overflowWrap: 'anywhere', color: disabled ? tokens.color.muted : tokens.color.ink }}>{account.company}</Typography>
        <Typography variant="caption" sx={{ display: 'block', overflowWrap: 'anywhere' }}>担当者: {account.name}</Typography>
      </Box>
      <Typography variant="body2" sx={{ ...mono, fontSize: 13, color: tokens.color.inkSoft, minWidth: 0 }}>{account.email}</Typography>
      <Box sx={{ minWidth: 0 }}>
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
          <Box sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: accent, flexShrink: 0 }} aria-hidden />
          <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{siteName}</Typography>
        </Stack>
        <Typography variant="caption" sx={{ display: 'block' }}>登録 {formatDate(account.createdAt)}</Typography>
      </Box>
      <Box><StatusPill tone={st.tone}>{st.label}</StatusPill></Box>
      <Stack direction="row" sx={{ gap: 1, justifyContent: { md: 'flex-end' }, flexWrap: 'wrap' }}>
        <Button size="small" variant="outlined" startIcon={<Pencil size={14} />} onClick={onEdit} aria-label={`${account.company} ${account.name}の登録内容を編集`}>編集</Button>
        {disabled ? (
          <Button size="small" variant="text" startIcon={<RotateCcw size={14} />} onClick={onToggle} aria-label={`${account.company} ${account.name}を有効に戻す`}>有効に戻す</Button>
        ) : (
          <Button size="small" variant="text" color="error" startIcon={<Ban size={14} />} onClick={onToggle} aria-label={`${account.company} ${account.name}を無効にする`}>無効にする</Button>
        )}
      </Stack>
    </Box>
  );
}

/** 管理者画面: お客様（お客様ポータルにログインできる人）の登録と、開発者画面を開けるメンバーの指定（デモ: 実際の招待・認証は行わない） */
export default function UsersPage() {
  const { state, dispatch } = useDemo();
  const toast = useToast();
  const sessions = useSessions();
  const [params, setParams] = useSearchParams();
  const tab: TabId = params.get('tab') === 'dev' ? 'dev' : 'clients';
  const accounts = clientAccountsState(state);
  const access = devAccessState(state);

  const [editing, setEditing] = useState<ClientAccountDraft | null>(null);
  const [disabling, setDisabling] = useState<ClientAccount | null>(null);
  const [lastDisabling, setLastDisabling] = useState<ClientAccount | null>(null);
  if (disabling && disabling !== lastDisabling) setLastDisabling(disabling);
  const shownDisabling = disabling ?? lastDisabling;

  const count = (s: ClientAccount['status']) => accounts.filter((a) => a.status === s).length;
  const devCount = MEMBERS.filter((m) => access[m.id]).length;
  const devSessionEmail = sessions.dev ? normalizeEmail(sessions.dev.email) : null;
  const projectOf = (id: string) => state.projects.find((p) => p.id === id);

  const openNew = () => {
    const p = state.projects.find((x) => x.id === state.currentProjectId) ?? state.projects[0];
    setEditing({ company: p.clientName, name: '', email: '', projectId: p.id });
  };

  const save = (d: ClientAccountDraft) => {
    const prev = d.id ? accounts.find((a) => a.id === d.id) : undefined;
    dispatch({ type: 'saveClientAccount', account: d });
    setEditing(null);
    if (!prev) toast('招待メールを送信しました（デモ: 実際には送信されません）');
    else if (prev.company !== d.company.trim() || prev.name !== d.name.trim() || prev.email !== normalizeEmail(d.email) || prev.projectId !== d.projectId) toast('登録内容を保存しました');
  };

  const enable = (a: ClientAccount) => {
    dispatch({ type: 'setClientAccountStatus', id: a.id, enabled: true });
    toast(`${a.company} ${a.name}を有効に戻しました`);
  };

  const setDev = (memberId: string, name: string, enabled: boolean) => {
    dispatch({ type: 'setDevAccess', memberId, enabled });
    toast(enabled ? `${name}に開発者画面の権限を追加しました` : `${name}の開発者画面の権限を外しました`, enabled ? 'success' : 'info');
  };

  return (
    <>
      <PageHeader
        title="ユーザー管理"
        description="お客様ポータルにログインできるお客様の登録と、開発者画面を開けるアフロのメンバーを設定します。"
      />

      <Stack spacing={{ xs: 2, md: 2.5 }}>
        <Tabs
          value={tab}
          onChange={(_, v: TabId) => setParams(v === 'dev' ? { tab: 'dev' } : {}, { replace: true })}
          aria-label="ユーザー管理の表示"
          variant="scrollable" allowScrollButtonsMobile={false}
          sx={{ borderBottom: `1px solid ${tokens.color.border}` }}
        >
          <Tab value="clients" label={`お客様 ${accounts.length}`} id="users-tab-clients" aria-controls="users-panel" />
          <Tab value="dev" label={`開発者画面の権限 ${devCount}`} id="users-tab-dev" aria-controls="users-panel" />
        </Tabs>

        <Box id="users-panel" role="tabpanel" aria-labelledby={`users-tab-${tab}`}>
          {tab === 'clients' ? (
            <Stack spacing={2}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
                <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap', flex: 1 }}>
                  <StatusPill tone="success">有効 {count('active')}</StatusPill>
                  <StatusPill tone="info">招待中 {count('invited')}</StatusPill>
                  <StatusPill tone="neutral">無効 {count('disabled')}</StatusPill>
                </Stack>
                <Button variant="contained" startIcon={<Plus size={16} />} onClick={openNew} sx={{ alignSelf: { xs: 'stretch', sm: 'auto' } }}>お客様を登録</Button>
              </Stack>

              <DemoNote>
                登録したお客様は、そのメールアドレスでお客様ポータルにログインできます。無効にしたお客様はログインできなくなり、ログイン中の場合は次に画面を開いたときにログアウトされます。
                <Box component="span" sx={{ display: 'block', mt: 0.5 }}>デモのため、照合はこのブラウザ内の画面上だけで行い、実際の招待メールの送信・認証は行いません。</Box>
              </DemoNote>

              <Reveal>
                <Surface padding={0} sx={{ overflow: 'hidden' }}>
                  {/* 列の見出し（PC のみ。スマホは各行の中に書いてある） */}
                  <Box
                    aria-hidden
                    sx={{
                      display: { xs: 'none', md: 'grid' }, gridTemplateColumns: CLIENT_COLUMNS.md, gap: 2, px: 2.5, py: 1.25,
                      bgcolor: tokens.color.surfaceMuted, borderBottom: `1px solid ${tokens.color.border}`,
                      '& > *': { fontSize: 12, fontWeight: 650, color: tokens.color.muted },
                    }}
                  >
                    <span>会社名・担当者</span><span>メールアドレス</span><span>担当案件・登録日</span><span>状態</span><span />
                  </Box>
                  {accounts.length ? (
                    <Box component="ul" aria-label="お客様の一覧" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                      {accounts.map((a) => {
                        const p = projectOf(a.projectId);
                        return (
                          <ClientRow
                            key={a.id} account={a} siteName={p?.siteName ?? '（案件なし）'} accent={p?.accent ?? tokens.color.faint}
                            onEdit={() => setEditing({ id: a.id, company: a.company, name: a.name, email: a.email, projectId: a.projectId })}
                            onToggle={() => (a.status === 'disabled' ? enable(a) : setDisabling(a))}
                          />
                        );
                      })}
                    </Box>
                  ) : (
                    <Box sx={{ p: { xs: 3, md: 4 }, textAlign: 'center' }}>
                      <Typography variant="h5" component="p">まだお客様が登録されていません</Typography>
                      <Typography variant="body2" sx={{ mt: 0.5, color: tokens.color.muted }}>「お客様を登録」から、お客様ポータルにログインする担当者を追加できます。</Typography>
                    </Box>
                  )}
                </Surface>
              </Reveal>
            </Stack>
          ) : (
            <Stack spacing={2}>
              <DemoNote>
                スイッチをオンにしたメンバーだけが、開発者画面にログインできます。オフにすると、ログイン中の場合は次に開発者画面を開いたときにログアウトされます。
                <Box component="span" sx={{ display: 'block', mt: 0.5 }}>デモのため画面上の制御だけで、セキュリティ上の保護ではありません。</Box>
              </DemoNote>
              <Reveal>
                <Surface padding={0} sx={{ overflow: 'hidden' }}>
                  <Box component="ul" aria-label="アフロのメンバー" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                    {MEMBERS.map((m) => {
                      const on = !!access[m.id];
                      const loggedIn = devSessionEmail === m.email;
                      return (
                        <Stack
                          key={m.id} component="li" direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1, sm: 2 }} alignItems={{ sm: 'center' }}
                          sx={{ px: { xs: 2, md: 2.5 }, py: { xs: 1.75, md: 1.5 }, borderTop: `1px solid ${tokens.color.border}`, '&:first-of-type': { borderTop: 'none' } }}
                        >
                          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flex: 1, minWidth: 0 }}>
                            <MemberAvatar id={m.id} size={36} />
                            <Box sx={{ minWidth: 0 }}>
                              <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
                                <Typography variant="body2" sx={{ fontWeight: 700 }}>{m.name}</Typography>
                                <Typography variant="caption">{m.role}</Typography>
                                {loggedIn && <StatusPill tone="accent" dot={false}>開発者画面にログイン中</StatusPill>}
                              </Stack>
                              <Typography variant="caption" sx={{ display: 'block', ...mono }}>{m.email}</Typography>
                            </Box>
                          </Stack>
                          <FormControlLabel
                            control={<Switch checked={on} onChange={(e) => setDev(m.id, m.name, e.target.checked)} inputProps={{ 'aria-label': `${m.name}が開発者画面を開ける` }} />}
                            label="開発者画面を開ける"
                            sx={{ mr: 0, ml: { xs: 5.5, sm: 0 }, flexShrink: 0, '& .MuiFormControlLabel-label': { fontSize: 13.5, fontWeight: 600, color: on ? tokens.color.ink : tokens.color.muted } }}
                          />
                        </Stack>
                      );
                    })}
                  </Box>
                </Surface>
              </Reveal>
            </Stack>
          )}
        </Box>
      </Stack>

      <ClientAccountDialog draft={editing} accounts={accounts} projects={state.projects} onClose={() => setEditing(null)} onSave={save} />

      <Dialog open={!!disabling} onClose={() => setDisabling(null)} maxWidth="xs" fullWidth aria-labelledby="client-disable-title">
        <DialogTitle id="client-disable-title">{shownDisabling?.company} {shownDisabling?.name}を無効にしますか？</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            お客様ポータルにログインできなくなります。ログイン中の場合は、次に画面を開いたときにログアウトされます。登録内容は残り、あとから「有効に戻す」で戻せます。
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button variant="outlined" onClick={() => setDisabling(null)}>キャンセル</Button>
          <Button
            variant="contained" color="error"
            onClick={() => {
              if (disabling) {
                dispatch({ type: 'setClientAccountStatus', id: disabling.id, enabled: false });
                toast(`${disabling.company} ${disabling.name}を無効にしました`, 'info');
              }
              setDisabling(null);
            }}
          >
            無効にする
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

