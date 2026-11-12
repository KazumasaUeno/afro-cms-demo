import { Box, Button, Stack, Typography } from '@mui/material';
import { UserPlus, Users } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { PageHeader, StatusPill, Surface } from '@/components/ui';
import { RouteLoader } from '@/components/layout/RouteLoader';
import { useRepositories } from '@/repositories';
import { useWrite } from '@/hooks/useWrite';
import { CLIENT_STATUS, DEV_AFFILIATION, type ClientAccountDraft, type DevUserDraft } from '@/data/users';
import { devUserToPerson, type DevPerson } from '@/data/people';
import { ClientAccountDialog } from '@/features/users/ClientAccountDialog';
import { DevUserDialog } from '@/features/users/DevUserDialog';
import { DevProjectsDialog } from '@/features/users/DevProjectsDialog';
import { tokens } from '@/theme/tokens';
import type { ClientAccount, DevUser } from '@/types';
import { INVITE_PREFIX } from '../model';
import { LoadError } from './shared';

const isInvite = (id: string) => id.startsWith(INVITE_PREFIX);

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
 * - 招待中の人は「招待を取り消す」だけ。開発者の担当は、アカウントができた後に「担当を変更」で割り当てる
 */
export default function LiveUsersPage() {
  const { accounts: repo, projects: projectsRepo } = useRepositories();
  const clients = repo.useClientAccounts();
  const devs = repo.useDevUsers();
  const devProjects = repo.useDevProjects();
  const { data: projects } = projectsRepo.useList();
  const write = useWrite();
  const [clientEditing, setClientEditing] = useState<ClientAccountDraft | null>(null);
  const [devEditing, setDevEditing] = useState<DevUserDraft | null>(null);
  const [assigning, setAssigning] = useState<DevPerson | null>(null);

  if (clients.loading || devs.loading || devProjects.loading) return <RouteLoader label="ユーザー" />;
  if (clients.error || devs.error) return <LoadError what="ユーザーの一覧" />;

  const siteName = (pid: string) => projects.find((p) => p.id === pid)?.siteName ?? '（不明なプロジェクト）';

  const editClient = (a: ClientAccount) => setClientEditing({ id: a.id, company: a.company, name: a.name, email: a.email, projectId: a.projectId });
  const editDev = (u: DevUser) => setDevEditing({ id: u.id, name: u.name, role: u.role, email: u.email, affiliation: u.affiliation, partnerCompany: u.partnerCompany ?? '', projectIds: [] });

  const saveClient = (d: ClientAccountDraft) => {
    void write(repo.saveClientAccount(d), d.id ? '担当者名を変更しました' : `${d.email.trim()} を招待しました`).then((ok) => { if (ok) setClientEditing(null); });
  };
  const saveDev = (d: DevUserDraft) => {
    void write(repo.saveDevUser(d), d.id ? '開発者の情報を変更しました' : `${d.email.trim()} を招待しました`).then((ok) => { if (ok) setDevEditing(null); });
  };

  return (
    <Box>
      <PageHeader
        eyebrow="管理者画面"
        icon={<Users size={14} />}
        title="ユーザー"
        description="お客様と開発者を招待します。招待された人は、招待されたメールアドレスで「初めての方」から登録すると使い始められます。"
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
                    <Button size="small" variant="outlined" onClick={() => { void write(repo.setClientAccountStatus(a.id, false), '招待を取り消しました'); }}>招待を取り消す</Button>
                  ) : (
                    <>
                      <Button size="small" variant="outlined" onClick={() => editClient(a)}>編集</Button>
                      <Button size="small" variant="text" onClick={() => { void write(repo.setClientAccountStatus(a.id, a.status !== 'active'), a.status === 'active' ? '無効にしました' : '有効にしました'); }}>
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
                    <Button size="small" variant="outlined" onClick={() => { void write(repo.setDevUserStatus(u.id, false), '招待を取り消しました'); }}>招待を取り消す</Button>
                  ) : (
                    <>
                      <Button size="small" variant="outlined" onClick={() => setAssigning(devUserToPerson(u))}>担当を変更</Button>
                      <Button size="small" variant="outlined" onClick={() => editDev(u)}>編集</Button>
                      <Button size="small" variant="text" onClick={() => { void write(repo.setDevUserStatus(u.id, u.status !== 'active'), u.status === 'active' ? '無効にしました' : '有効にしました'); }}>
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
