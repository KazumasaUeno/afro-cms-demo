import { Box, Button, Dialog, DialogActions, DialogContent, Stack, Typography } from '@mui/material';
import { UserPlus, Users } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { PageHeader, StatusPill, Surface } from '@/components/ui';
import { RouteLoader } from '@/components/layout/RouteLoader';
import { useRepositories } from '@/repositories';
import { useWrite } from '@/hooks/useWrite';
import { useToast } from '@/hooks/useToast';
import { CLIENT_STATUS, DEV_AFFILIATION, type ClientAccountDraft, type DevUserDraft } from '@/data/users';
import { devUserToPerson, type DevPerson } from '@/data/people';
import { ClientAccountDialog } from '@/features/users/ClientAccountDialog';
import { DevUserDialog } from '@/features/users/DevUserDialog';
import { DevProjectsDialog } from '@/features/users/DevProjectsDialog';
import { tokens } from '@/theme/tokens';
import type { ClientAccount, DevUser } from '@/types';
import { INVITE_PREFIX } from '../model';
import { provisionErrorKind, provisionInvitee, type InviteAccountResult } from '../invite';
import { LoadError } from './shared';

const isInvite = (id: string) => id.startsWith(INVITE_PREFIX);

/**
 * 初めての招待なのに同じメールのアカウントが既にあった＝本人以外が先に作った可能性がある（security re-audit 2026-11-19 MEDIUM:
 * 先に作った人が確認メールのリンクを本人に押させていると、パスワード設定の前に招待を受け取れてしまう）。
 * 待たずに Console でそのアカウントを消し、「招待メールを送り直す」で作り直してもらう（新しい uid になり、前のログインは使えなくなる）
 */
const existingMessage = (email: string) =>
  `${email.trim()} を招待しましたが、このメールアドレスのアカウントは招待より前からありました（本人以外が作った可能性があります）。すぐに Firebase の管理画面（Authentication）でこのアカウントを削除し、一覧の「招待メールを送り直す」を押してください。アカウントの一覧に同じメールの人が出ていたら、その人を無効にしてください`;
/** 招待は保存できたが、アカウントの作成・メールの送信に失敗した（招待は残るので送り直せる。security LOW） */
const provisionFailedMessage = (email: string) =>
  `${email.trim()} の招待は保存しましたが、パスワード設定のメールを送れませんでした。時間をおいて、一覧の「招待メールを送り直す」を押してください`;
/**
 * アカウント作成・メール送信の失敗の案内（code review 2026-11-20 M2: 取り消し済み・権限なし・時間切れを「時間をおいて」でまとめない）。
 * invited = 招待の保存は済んでいる（初回の招待）。false は送り直し
 */
const provisionErrorMessage = (email: string, e: unknown, invited: boolean): string => {
  const who = email.trim();
  switch (provisionErrorKind(e)) {
    case 'not-invited':
      return `${who} は招待中ではないため、アカウントを作れませんでした（取り消し済みか、受け取り済みです）。一覧を確かめてください`;
    case 'denied':
      return 'アカウントを作る権限がありません。管理者のアカウントでログインし直してください';
    case 'timeout':
      return `${who} のアカウントを作れたか確認できませんでした（時間切れ）。少し待ってから一覧の「招待メールを送り直す」を押してください（作れていればメールだけ送ります）`;
    case 'network':
      return `通信できないため ${who} にメールを送れませんでした。接続を確かめて、一覧の「招待メールを送り直す」を押してください`;
    default:
      return invited ? provisionFailedMessage(email) : `${who} にパスワード設定のメールを送れませんでした。時間をおいてもう一度お試しください`;
  }
};

function Row({ title, sub, pill, children }: { title: string; sub: string; pill: ReactNode; children: ReactNode }) {
  return (
    <Box
      component="li"
      sx={{
        display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { xs: 'stretch', sm: 'center' }, gap: 1.25,
        py: 1.5, borderTop: `1px solid ${tokens.color.outlineVariant}`, '&:first-of-type': { borderTop: 'none' },
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
          <Typography variant="body2" sx={{ fontWeight: 650, overflowWrap: 'anywhere' }}>{title}</Typography>
          {pill}
        </Stack>
        <Typography variant="caption" sx={{ overflowWrap: 'anywhere' }}>{sub}</Typography>
      </Box>
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>{children}</Stack>
    </Box>
  );
}

/**
 * ユーザー（live の管理者画面）。招待（invites）と、受け取り後のアカウント（accounts）。
 * - 追加＝招待（メールアドレスを入れるのは招待のときだけ。登録後のメールは変えられない）
 * - 招待すると、そのメールの Auth アカウントを作り、パスワード設定のメールを送る（src/live/invite.ts。security M1）
 * - 招待中の人は「招待を取り消す」だけ。開発者の担当は、アカウントができた後に「担当を変更」で割り当てる
 */
export default function LiveUsersPage() {
  const { accounts: repo, projects: projectsRepo } = useRepositories();
  const clients = repo.useClientAccounts();
  const devs = repo.useDevUsers();
  const devProjects = repo.useDevProjects();
  const { data: projects } = projectsRepo.useList();
  const write = useWrite();
  const toast = useToast();
  const [clientEditing, setClientEditing] = useState<ClientAccountDraft | null>(null);
  const [devEditing, setDevEditing] = useState<DevUserDraft | null>(null);
  const [assigning, setAssigning] = useState<DevPerson | null>(null);
  // 無効にする前の確認（ログイン中の人もその場でログアウトされるため。有効に戻すのは確認なし）
  const [disabling, setDisabling] = useState<{ id: string; name: string; dev: boolean } | null>(null);
  const [disablingBusy, setDisablingBusy] = useState(false);

  if (clients.loading || devs.loading || devProjects.loading) return <RouteLoader label="ユーザー" />;
  if (clients.error || devs.error) return <LoadError what="ユーザーの一覧" />;

  const siteName = (pid: string) => projects.find((p) => p.id === pid)?.siteName ?? '（不明なプロジェクト）';

  const editClient = (a: ClientAccount) => setClientEditing({ id: a.id, company: a.company, name: a.name, email: a.email, projectId: a.projectId });
  const editDev = (u: DevUser) => setDevEditing({ id: u.id, name: u.name, role: u.role, email: u.email, affiliation: u.affiliation, partnerCompany: u.partnerCompany ?? '', projectIds: [] });

  /**
   * 招待: invites の文書 → Auth のアカウント → パスワード設定メール の順。文書が作れなければ（招待済み等）アカウントもメールも作らない。
   * 文書の後で失敗したら、一覧の「招待メールを送り直す」でやり直せる
   */
  const invite = async (save: Promise<void>, email: string, close: () => void) => {
    if (!(await write(save))) return;
    close();
    let result: InviteAccountResult;
    try {
      result = await provisionInvitee(email);
    } catch (e) {
      console.warn('invite provisioning failed', e);
      toast(provisionErrorMessage(email, e, true), 'error');
      return;
    }
    toast(result === 'existing' ? existingMessage(email) : `${email.trim()} を招待し、パスワード設定のメールを送りました`, result === 'existing' ? 'error' : 'success');
  };
  const resend = async (email: string) => {
    let result: InviteAccountResult;
    try {
      result = await provisionInvitee(email);
    } catch (e) {
      console.warn('invite resend failed', e);
      toast(provisionErrorMessage(email, e, false), 'error');
      return;
    }
    toast(result === 'created' ? `${email} のアカウントを作り、パスワード設定のメールを送りました` : `${email} にパスワード設定のメールを送り直しました`);
  };
  const saveClient = (d: ClientAccountDraft) => {
    if (!d.id) { void invite(repo.saveClientAccount(d), d.email, () => setClientEditing(null)); return; }
    void write(repo.saveClientAccount(d), '担当者名を変更しました').then((ok) => { if (ok) setClientEditing(null); });
  };
  const saveDev = (d: DevUserDraft) => {
    if (!d.id) { void invite(repo.saveDevUser(d), d.email, () => setDevEditing(null)); return; }
    void write(repo.saveDevUser(d), '開発者の情報を変更しました').then((ok) => { if (ok) setDevEditing(null); });
  };

  return (
    <Box>
      <PageHeader
        eyebrow="管理者画面"
        icon={<Users size={14} />}
        title="ユーザー"
        description="お客様と開発者を招待します。招待すると、そのメールアドレスにパスワード設定のメールが届きます。招待された人はメールのリンクでパスワードを決め、ログイン画面からログインします。"
      />
      <Stack spacing={2.5}>
        <Surface component="section" aria-labelledby="live-users-clients">
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1, flexWrap: 'wrap', rowGap: 1 }}>
            <Typography id="live-users-clients" variant="h4" component="h2" sx={{ flex: 1 }}>お客様（{clients.data.length}）</Typography>
            <Button
              variant="contained" size="small" startIcon={<UserPlus size={16} />} disabled={projects.length === 0}
              onClick={() => setClientEditing({ company: '', name: '', email: '', projectId: projects[0]?.id ?? '' })}
            >
              お客様を招待
            </Button>
          </Stack>
          {projects.length === 0 && <Typography variant="caption" component="p">お客様の招待には担当のプロジェクトが必要です。先に開発者がプロジェクトを作成します。</Typography>}
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {clients.data.map((a) => {
              const st = CLIENT_STATUS[a.status];
              return (
                <Row key={a.id} title={`${a.name}（${a.company}）`} sub={`${a.email}・${siteName(a.projectId)}`} pill={<StatusPill tone={st.tone}>{st.label}</StatusPill>}>
                  {isInvite(a.id) ? (
                    <>
                      <Button size="small" variant="outlined" onClick={() => { void resend(a.email); }}>招待メールを送り直す</Button>
                      <Button size="small" variant="text" onClick={() => { void write(repo.setClientAccountStatus(a.id, false), '招待を取り消しました'); }}>招待を取り消す</Button>
                    </>
                  ) : (
                    <>
                      <Button size="small" variant="outlined" onClick={() => editClient(a)}>編集</Button>
                      <Button size="small" variant="text" onClick={() => { if (a.status === 'active') setDisabling({ id: a.id, name: a.name, dev: false }); else void write(repo.setClientAccountStatus(a.id, true), '有効にしました'); }}>
                        {a.status === 'active' ? '無効にする' : '有効にする'}
                      </Button>
                    </>
                  )}
                </Row>
              );
            })}
          </Box>
        </Surface>

        <Surface component="section" aria-labelledby="live-users-devs">
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1, flexWrap: 'wrap', rowGap: 1 }}>
            <Typography id="live-users-devs" variant="h4" component="h2" sx={{ flex: 1 }}>開発者（{devs.data.length}）</Typography>
            <Button
              variant="contained" size="small" startIcon={<UserPlus size={16} />}
              onClick={() => setDevEditing({ name: '', role: '', email: '', affiliation: 'internal', partnerCompany: '', projectIds: [] })}
            >
              開発者を招待
            </Button>
          </Stack>
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {devs.data.map((u) => {
              const invite = isInvite(u.id);
              const assigned = devProjects.data[u.id] ?? [];
              const pill = invite
                ? <StatusPill tone="info">招待中</StatusPill>
                : <StatusPill tone={u.status === 'active' ? 'success' : 'neutral'}>{u.status === 'active' ? '有効' : '無効'}</StatusPill>;
              const sub = [u.email, u.role, u.affiliation === 'partner' ? u.partnerCompany ?? DEV_AFFILIATION.partner : DEV_AFFILIATION.internal, invite ? '' : `担当 ${assigned.length} 件`].filter(Boolean).join('・');
              return (
                <Row key={u.id} title={u.name} sub={sub} pill={pill}>
                  {invite ? (
                    <>
                      <Button size="small" variant="outlined" onClick={() => { void resend(u.email); }}>招待メールを送り直す</Button>
                      <Button size="small" variant="text" onClick={() => { void write(repo.setDevUserStatus(u.id, false), '招待を取り消しました'); }}>招待を取り消す</Button>
                    </>
                  ) : (
                    <>
                      <Button size="small" variant="outlined" onClick={() => setAssigning(devUserToPerson(u))}>担当を変更</Button>
                      <Button size="small" variant="outlined" onClick={() => editDev(u)}>編集</Button>
                      <Button size="small" variant="text" onClick={() => { if (u.status === 'active') setDisabling({ id: u.id, name: u.name, dev: true }); else void write(repo.setDevUserStatus(u.id, true), '有効にしました'); }}>
                        {u.status === 'active' ? '無効にする' : '有効にする'}
                      </Button>
                    </>
                  )}
                </Row>
              );
            })}
          </Box>
        </Surface>
      </Stack>

      <Dialog open={!!disabling} onClose={() => !disablingBusy && setDisabling(null)} maxWidth="xs" fullWidth aria-labelledby="live-disable-title">
        <DialogContent sx={{ pt: 3 }}>
          <Typography id="live-disable-title" variant="h3" sx={{ mb: 1 }}>{disabling?.name ?? ''} さんを無効にしますか？</Typography>
          <Typography variant="body2" color="text.secondary">
            無効にすると、ログインできなくなります。ログイン中の場合も、その場でログアウトされます。あとから「有効にする」で戻せます。
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button variant="outlined" disabled={disablingBusy} onClick={() => setDisabling(null)}>キャンセル</Button>
          <Button
            variant="contained" color="error" disabled={disablingBusy}
            onClick={() => {
              if (!disabling) return;
              setDisablingBusy(true);
              const op = disabling.dev ? repo.setDevUserStatus(disabling.id, false) : repo.setClientAccountStatus(disabling.id, false);
              void write(op, '無効にしました').then(() => {
                setDisablingBusy(false);
                setDisabling(null);
              });
            }}
          >
            {disablingBusy ? '無効にしています…' : '無効にする'}
          </Button>
        </DialogActions>
      </Dialog>

      <ClientAccountDialog draft={clientEditing} accounts={clients.data} projects={projects} onClose={() => setClientEditing(null)} onSave={saveClient} />
      <DevUserDialog draft={devEditing} devUsers={devs.data} accounts={clients.data} projects={[]} onClose={() => setDevEditing(null)} onSave={saveDev} />
      <DevProjectsDialog
        member={assigning}
        assigned={assigning ? devProjects.data[assigning.id] ?? [] : []}
        hasAccess={!!assigning && devs.data.find((u) => u.id === assigning.id)?.status === 'active'}
        projects={projects}
        onClose={() => setAssigning(null)}
        onSave={(ids) => {
          if (!assigning) return;
          void write(repo.setDevProjects(assigning.id, ids), '担当を変更しました').then((ok) => { if (ok) setAssigning(null); });
        }}
      />
    </Box>
  );
}
