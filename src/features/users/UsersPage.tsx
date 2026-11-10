import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Stack, Switch, Tab, Tabs, Typography } from '@mui/material';
import { Ban, FolderKanban, Info, Pencil, Plus, RotateCcw } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ClientAccount } from '@/types';
import { MemberAvatar, PageHeader, Reveal, StatusPill, Surface } from '@/components/ui';
import { useRepositories } from '@/repositories';
import { useToast } from '@/hooks/useToast';
import { useSessions } from '@/services/session';
import { formatDate } from '@/services/time';
import type { DevPerson } from '@/data/people';
import { CLIENT_STATUS, DEV_AFFILIATION, normalizeEmail, type ClientAccountDraft, type DevUserDraft } from '@/data/users';
import { TOUCH } from '@/theme/media';
import { tokens } from '@/theme/tokens';
import { ClientAccountDialog } from './ClientAccountDialog';
import { DevProjectsDialog } from './DevProjectsDialog';
import { DevUserDialog } from './DevUserDialog';

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
  const { accounts: repo, projects: projectsRepo } = useRepositories();
  const toast = useToast();
  const sessions = useSessions();
  const [params, setParams] = useSearchParams();
  const tab: TabId = params.get('tab') === 'dev' ? 'dev' : 'clients';
  const { data: accounts } = repo.useClientAccounts();
  const { data: access } = repo.useDevAccess();
  const { data: devProjects } = repo.useDevProjects();
  const { data: devUsers } = repo.useDevUsers();
  const { data: people } = repo.useDevPeople();
  const { data: projects } = projectsRepo.useList();
  const currentProjectId = projectsRepo.useCurrentId();
  const [assigning, setAssigning] = useState<DevPerson | null>(null);
  const [devEditing, setDevEditing] = useState<DevUserDraft | null>(null);
  const [devDisabling, setDevDisabling] = useState<DevPerson | null>(null);
  const [lastDevDisabling, setLastDevDisabling] = useState<DevPerson | null>(null);
  if (devDisabling && devDisabling !== lastDevDisabling) setLastDevDisabling(devDisabling);
  const shownDevDisabling = devDisabling ?? lastDevDisabling;

  const [editing, setEditing] = useState<ClientAccountDraft | null>(null);
  const [disabling, setDisabling] = useState<ClientAccount | null>(null);
  const [lastDisabling, setLastDisabling] = useState<ClientAccount | null>(null);
  if (disabling && disabling !== lastDisabling) setLastDisabling(disabling);
  const shownDisabling = disabling ?? lastDisabling;

  const count = (s: ClientAccount['status']) => accounts.filter((a) => a.status === s).length;
  // 開発者画面を開ける人（権限オンで、無効にしていない人）
  const devCount = people.filter((m) => access[m.id] && !m.disabled).length;
  const devSessionEmail = sessions.dev ? normalizeEmail(sessions.dev.email) : null;
  const projectOf = (id: string) => projects.find((p) => p.id === id);

  const openNew = () => {
    const p = projects.find((x) => x.id === currentProjectId) ?? projects[0];
    setEditing({ company: p.clientName, name: '', email: '', projectId: p.id });
  };

  const save = (d: ClientAccountDraft) => {
    const prev = d.id ? accounts.find((a) => a.id === d.id) : undefined;
    void repo.saveClientAccount(d);
    setEditing(null);
    if (!prev) toast('招待メールを送信しました（デモ: 実際には送信されません）');
    else if (prev.company !== d.company.trim() || prev.name !== d.name.trim() || prev.email !== normalizeEmail(d.email) || prev.projectId !== d.projectId) toast('登録内容を保存しました');
  };

  const enable = (a: ClientAccount) => {
    void repo.setClientAccountStatus(a.id, true);
    toast(`${a.company} ${a.name}を有効に戻しました`);
  };

  const setDev = (memberId: string, name: string, enabled: boolean) => {
    void repo.setDevAccess(memberId, enabled);
    toast(enabled ? `${name}に開発者画面の権限を追加しました` : `${name}の開発者画面の権限を外しました`, enabled ? 'success' : 'info');
  };

  const saveDevUser = (d: DevUserDraft) => {
    const prev = d.id ? devUsers.find((u) => u.id === d.id) : undefined;
    void repo.saveDevUser(d);
    setDevEditing(null);
    const name = d.name.trim();
    if (!prev) {
      toast(`${name}を開発者として登録しました（開発者画面の権限: オン）`);
      return;
    }
    const company = d.affiliation === 'partner' ? d.partnerCompany.trim() : undefined;
    const changed = prev.name !== name || prev.role !== d.role.trim() || prev.email !== normalizeEmail(d.email) || prev.affiliation !== d.affiliation || prev.partnerCompany !== company;
    if (changed) toast('登録内容を保存しました');
  };

  const editDevUser = (m: DevPerson) => {
    const u = devUsers.find((x) => x.id === m.id);
    if (u) setDevEditing({ id: u.id, name: u.name, role: u.role, email: u.email, affiliation: u.affiliation, partnerCompany: u.partnerCompany ?? '', projectIds: [] });
  };

  const enableDevUser = (m: DevPerson) => {
    void repo.setDevUserStatus(m.id, true);
    toast(`${m.name}を有効に戻しました`);
  };

  const saveDevProjects = (m: DevPerson, projectIds: string[]) => {
    const prev = devProjects[m.id] ?? [];
    const next = projects.filter((p) => projectIds.includes(p.id)).map((p) => p.id);
    void repo.setDevProjects(m.id, projectIds);
    setAssigning(null);
    if (prev.length === next.length && prev.every((id, i) => id === next[i])) return;
    toast(next.length ? `${m.name}の担当プロジェクトを保存しました（${next.length}件）` : `${m.name}の担当プロジェクトをすべて外しました`, next.length ? 'success' : 'info');
  };

  return (
    <>
      <PageHeader
        title="ユーザー管理"
        description="お客様ポータルにログインできるお客様の登録と、開発者画面を開ける開発者（社外のパートナーを含む）の登録・権限・担当プロジェクトを設定します。"
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
          <Tab value="dev" label={`開発者の権限・担当 ${devCount}`} id="users-tab-dev" aria-controls="users-panel" />
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
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
                <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap', flex: 1 }}>
                  <StatusPill tone="success">開発者画面を開ける {devCount}</StatusPill>
                  <StatusPill tone="neutral">登録した開発者 {devUsers.length}</StatusPill>
                </Stack>
                <Button
                  variant="contained" startIcon={<Plus size={16} />} sx={{ alignSelf: { xs: 'stretch', sm: 'auto' } }}
                  onClick={() => setDevEditing({ name: '', role: '', email: '', affiliation: 'internal', partnerCompany: '', projectIds: [] })}
                >
                  開発者を登録
                </Button>
              </Stack>
              <DemoNote>
                スイッチをオンにしたメンバーだけが、開発者画面にログインできます。オフにすると、ログイン中の場合は次に開発者画面を開いたときにログアウトされます。
                <Box component="span" sx={{ display: 'block', mt: 0.5 }}>開発者画面で開けるのは担当プロジェクトだけです。「担当を変更」から選びます。</Box>
                <Box component="span" sx={{ display: 'block', mt: 0.5 }}>社外のパートナーなど新しい開発者は「開発者を登録」から追加します。登録した開発者は編集・無効にできます（はじめからいるアフロのメンバーは変更できません）。</Box>
                <Box component="span" sx={{ display: 'block', mt: 0.5 }}>デモのため画面上の制御だけで、セキュリティ上の保護ではありません。</Box>
              </DemoNote>
              <Reveal>
                <Surface padding={0} sx={{ overflow: 'hidden' }}>
                  <Box component="ul" aria-label="開発者の一覧" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                    {people.map((m) => {
                      const on = !!access[m.id] && !m.disabled;
                      const registered = m.kind === 'registered';
                      const loggedIn = devSessionEmail === m.email;
                      const mine = projects.filter((p) => (devProjects[m.id] ?? []).includes(p.id));
                      return (
                        <Box
                          key={m.id} component="li"
                          sx={{ px: { xs: 2, md: 2.5 }, py: { xs: 1.75, md: 1.5 }, borderTop: `1px solid ${tokens.color.border}`, '&:first-of-type': { borderTop: 'none' } }}
                        >
                          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1, sm: 2 }} alignItems={{ sm: 'center' }}>
                            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flex: 1, minWidth: 0 }}>
                              <MemberAvatar id={m.id} person={m} size={36} />
                              <Box sx={{ minWidth: 0 }}>
                                <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
                                  <Typography variant="body2" sx={{ fontWeight: 700, overflowWrap: 'anywhere', color: m.disabled ? tokens.color.muted : tokens.color.ink }}>{m.name}</Typography>
                                  <Typography variant="caption" sx={{ overflowWrap: 'anywhere' }}>{m.role}</Typography>
                                  {m.affiliation === 'partner' && <StatusPill tone="warning" dot={false}>{DEV_AFFILIATION.partner}</StatusPill>}
                                  {m.disabled && <StatusPill tone="neutral">無効</StatusPill>}
                                  {loggedIn && <StatusPill tone="accent" dot={false}>開発者画面にログイン中</StatusPill>}
                                </Stack>
                                {m.partnerCompany && <Typography variant="caption" sx={{ display: 'block', overflowWrap: 'anywhere' }}>{m.partnerCompany}</Typography>}
                                <Typography variant="caption" sx={{ display: 'block', ...mono }}>{m.email}</Typography>
                              </Box>
                            </Stack>
                            <FormControlLabel
                              disabled={m.disabled}
                              control={<Switch checked={on} onChange={(e) => setDev(m.id, m.name, e.target.checked)} inputProps={{ 'aria-label': `${m.name}が開発者画面を開ける` }} />}
                              label="開発者画面を開ける"
                              sx={{ mr: 0, ml: { xs: 5.5, sm: 0 }, flexShrink: 0, '& .MuiFormControlLabel-label': { fontSize: 13.5, fontWeight: 600, color: on ? tokens.color.ink : tokens.color.muted } }}
                            />
                          </Stack>
                          {/* 担当プロジェクト（権限がオフでも決めておける。オフの間は薄く表示する） */}
                          <Stack
                            direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1, sm: 2 }} alignItems={{ sm: 'center' }}
                            sx={{ mt: 1.25, ml: { xs: 0, sm: 6 }, minWidth: 0 }}
                          >
                            <Box role="group" aria-label={`${m.name}の担当プロジェクト`} sx={{ flex: 1, minWidth: 0 }}>
                              <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap', alignItems: 'center', opacity: on ? 1 : 0.6 }}>
                                <Typography variant="caption" sx={{ fontWeight: 650, color: tokens.color.muted, mr: 0.25 }}>担当プロジェクト</Typography>
                                {mine.length ? mine.map((p) => (
                                  <Box
                                    key={p.id} component="span" data-dev-project={p.id}
                                    sx={{
                                      display: 'inline-flex', alignItems: 'center', gap: 0.75, px: 1, height: 26, maxWidth: '100%', minWidth: 0, borderRadius: '8px',
                                      border: `1px solid ${tokens.color.border}`, bgcolor: tokens.color.surface, fontSize: 12.5, fontWeight: 600, color: tokens.color.inkSoft,
                                    }}
                                  >
                                    <Box component="span" sx={{ width: 8, height: 8, borderRadius: '2px', bgcolor: p.accent, flexShrink: 0 }} aria-hidden />
                                    <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.siteName}</Box>
                                  </Box>
                                )) : <Typography variant="caption" sx={{ color: tokens.color.muted }}>なし</Typography>}
                              </Stack>
                              {!on && mine.length > 0 && (
                                <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: tokens.color.muted }}>{m.disabled ? '無効のため開けません' : '権限がオフのため開けません'}</Typography>
                              )}
                            </Box>
                            <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', flexShrink: 0, alignSelf: { xs: 'flex-start', sm: 'center' } }}>
                              <Button
                                size="small" variant="outlined" startIcon={<FolderKanban size={14} />} onClick={() => setAssigning(m)}
                                aria-label={`${m.name}の担当プロジェクトを変更`}
                                sx={{ [TOUCH]: { minHeight: 44 } }}
                              >
                                担当を変更
                              </Button>
                              {registered && (
                                <>
                                  <Button size="small" variant="outlined" startIcon={<Pencil size={14} />} onClick={() => editDevUser(m)} aria-label={`${m.name}の登録内容を編集`} sx={{ [TOUCH]: { minHeight: 44 } }}>編集</Button>
                                  {m.disabled ? (
                                    <Button size="small" variant="text" startIcon={<RotateCcw size={14} />} onClick={() => enableDevUser(m)} aria-label={`${m.name}を有効に戻す`} sx={{ [TOUCH]: { minHeight: 44 } }}>有効に戻す</Button>
                                  ) : (
                                    <Button size="small" variant="text" color="error" startIcon={<Ban size={14} />} onClick={() => setDevDisabling(m)} aria-label={`${m.name}を無効にする`} sx={{ [TOUCH]: { minHeight: 44 } }}>無効にする</Button>
                                  )}
                                </>
                              )}
                            </Stack>
                          </Stack>
                        </Box>
                      );
                    })}
                  </Box>
                </Surface>
              </Reveal>
            </Stack>
          )}
        </Box>
      </Stack>

      <DevProjectsDialog
        member={assigning} assigned={assigning ? devProjects[assigning.id] ?? [] : []} hasAccess={assigning ? !!access[assigning.id] : false}
        projects={projects} onClose={() => setAssigning(null)} onSave={(ids) => assigning && saveDevProjects(assigning, ids)}
      />

      <DevUserDialog draft={devEditing} devUsers={devUsers} accounts={accounts} projects={projects} onClose={() => setDevEditing(null)} onSave={saveDevUser} />

      <Dialog open={!!devDisabling} onClose={() => setDevDisabling(null)} maxWidth="xs" fullWidth aria-labelledby="dev-disable-title">
        <DialogTitle id="dev-disable-title">{shownDevDisabling?.name}を無効にしますか？</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            開発者画面にログインできなくなります。ログイン中の場合は、次に開発者画面を開いたときにログアウトされます。登録内容と担当プロジェクトは残り、あとから「有効に戻す」で戻せます。
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button variant="outlined" onClick={() => setDevDisabling(null)}>キャンセル</Button>
          <Button
            variant="contained" color="error"
            onClick={() => {
              if (devDisabling) {
                void repo.setDevUserStatus(devDisabling.id, false);
                toast(`${devDisabling.name}を無効にしました`, 'info');
              }
              setDevDisabling(null);
            }}
          >
            無効にする
          </Button>
        </DialogActions>
      </Dialog>

      <ClientAccountDialog draft={editing} accounts={accounts} projects={projects} onClose={() => setEditing(null)} onSave={save} />

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
                void repo.setClientAccountStatus(disabling.id, false);
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

