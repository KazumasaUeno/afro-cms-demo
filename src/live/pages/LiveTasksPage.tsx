import {
  Alert, Box, Button, FormControlLabel, IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Stack, Switch, TextField,
  ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { ArrowRight, Check, ListTodo, MoreHorizontal, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { MemberAvatar, PageHeader, StatusPill, Surface } from '@/components/ui';
import { RouteLoader } from '@/components/layout/RouteLoader';
import { useRepositories } from '@/repositories';
import { useToast } from '@/hooks/useToast';
import { relativeTime } from '@/services/time';
import { DEV_TASK_STATUSES } from '@/data/dev';
import { tokens } from '@/theme/tokens';
import { NEXT_STATUS, TASK_TONE, taskLabel } from '@/features/dev/devUi';
import { NewDevTaskDialog } from '@/features/dev/NewDevTaskDialog';
import type { TaskDoc, TaskStatus } from '../model';
import { useAccountPeople, useLiveCurrentProject, useLiveProjects, useLiveTaskActions, useLiveTasks } from '../repositories';
import { useLiveSession } from '../session';
import { isAssignee, prepareNewTask, taskCounts, taskLimitNote, taskPages, visibleTasks } from '../tasks';
import { EmptyState, LoadError } from './shared';

/** 390px の状態タブで 4 等分に収まらない名前だけ短くする（aria-label は正式名。demo の DevTasksPage と同じ） */
const SHORT_LABEL: Partial<Record<TaskStatus, string>> = { review: 'レビュー' };

/**
 * live の構築タスク（docs/design/LIVE_DASHBOARD_TASKS_CONSULT.md §1.2・U2）。見た目は demo の DevTasksPage と同じ（部品を再利用）。
 * - 対象は表示中の 1 案件（切り替えは既存の select()）。お客様は開けない（ルートと Rules の両方）
 * - 追加・状態の変更は担当の開発者だけ。admin は見るだけ（ボタンを出さない。権限の実体は firestore.rules の taskCreateOk / taskUpdateOk）
 * - 削除は無い（誤登録は「完了」で閉じる）。live にアクティビティは無いので記録しない
 * メニューへの追加は U4（それまでは URL から開く）
 */
export default function LiveTasksPage() {
  const session = useLiveSession();
  const { uid, account } = session;
  const { data: list, loading: listLoading, error: listError } = useLiveProjects();
  const { projects: projectsRepo } = useRepositories();
  const project = useLiveCurrentProject();
  const tasksQ = useLiveTasks(project?.id ?? null);
  const actions = useLiveTaskActions();
  const toast = useToast();
  const [mineOnly, setMineOnly] = useState(false);
  const [tab, setTab] = useState<TaskStatus>('doing');
  const [menu, setMenu] = useState<{ el: HTMLElement; task: TaskDoc } | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  const canEdit = account.role === 'developer' && !!project?.memberUids.includes(uid);
  const all = tasksQ.data;
  const tasks = useMemo(() => visibleTasks(all, uid, mineOnly && canEdit), [all, uid, mineOnly, canEdit]);
  const counts = useMemo(() => taskCounts(tasks), [tasks]);
  const memberUids = project?.memberUids ?? [];
  const peopleIds = useMemo(() => [...new Set([...memberUids, ...all.flatMap((t) => t.assigneeUids)])], [memberUids, all]);
  const people = useAccountPeople(peopleIds);
  const nameOf = (id: string) => (id === uid ? account.name : people[id]?.name ?? '…');
  // 追加の担当の候補: 自分を先頭（既定）に、その案件の担当の開発者
  const assignable = useMemo(() => [...new Set([uid, ...memberUids])].filter((m) => memberUids.includes(m)), [uid, memberUids]);

  if (listLoading) return <RouteLoader label="構築タスク" />;
  if (listError) return <LoadError what="プロジェクトの一覧" />;
  const base = account.role === 'developer' ? '/dev/projects' : '/projects';
  if (!project) return <EmptyState title="プロジェクトがありません" body="構築タスクは、プロジェクトごとに管理します。" action={{ to: base, label: 'プロジェクトの一覧へ' }} />;

  const change = async (t: TaskDoc, status: TaskStatus) => {
    try {
      await actions.setStatus(project.id, t.id, status);
      toast(`「${t.title}」を${taskLabel(status)}にしました`);
    } catch (e) {
      console.warn('task status change failed', { projectId: project.id, taskId: t.id }, e);
      toast('状態を変更できませんでした。接続と担当を確かめて、もう一度お試しください', 'error');
    }
  };
  const limitNote = taskLimitNote(all.length);

  return (
    <>
      <PageHeader
        eyebrow={account.role === 'developer' ? '開発者画面' : '管理者画面'}
        icon={<ListTodo size={15} />}
        title="構築タスク"
        description={canEdit
          ? '採用デザインをもとに、ページごとに実装します。担当の開発者がタスクを追加し、状態を変えます。'
          : 'この案件の構築タスクを確認できます（管理者は見るだけです。追加・状態の変更は担当の開発者が行います）。'}
        actions={
          <Stack direction="row" spacing={1.5} alignItems="center" useFlexGap sx={{ flexWrap: 'wrap' }}>
            {canEdit && (
              <FormControlLabel
                control={<Switch checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />}
                label="自分の担当のみ"
                sx={{ mr: 0, minHeight: 44 }}
              />
            )}
            {canEdit && (
              <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => setAdding(true)} sx={{ minHeight: 44 }}>タスクを追加</Button>
            )}
          </Stack>
        }
      />

      {list.length > 1 && (
        <TextField
          select size="small" label="対象のプロジェクト" value={project.id}
          onChange={(e) => projectsRepo.select(e.target.value)}
          sx={{ mb: 2, minWidth: { xs: '100%', sm: 320 } }}
        >
          {list.map((p) => <MenuItem key={p.id} value={p.id}>{p.siteName}（{p.clientName}）</MenuItem>)}
        </TextField>
      )}
      {list.length <= 1 && (
        <Typography variant="body2" sx={{ mb: 2, fontWeight: 650, overflowWrap: 'anywhere' }}>{project.siteName}（{project.clientName}）</Typography>
      )}

      {limitNote && <Alert severity="info" sx={{ mb: 2 }} data-testid="tasks-limit-note">{limitNote}</Alert>}

      {tasksQ.error ? (
        <LoadError what="構築タスク" />
      ) : tasksQ.loading ? (
        <RouteLoader label="構築タスク" />
      ) : (
        <>
          {/* md 未満: 状態タブで 1 列だけ見せる */}
          <ToggleButtonGroup
            value={tab} exclusive fullWidth size="small" aria-label="表示する状態"
            onChange={(_, v: TaskStatus | null) => v && setTab(v)}
            sx={{ display: { xs: 'flex', md: 'none' }, mb: 2 }}
          >
            {DEV_TASK_STATUSES.map((s) => (
              <ToggleButton key={s.id} value={s.id} aria-label={`${s.label} ${counts[s.id]} 件`} sx={{ minHeight: 44, px: 0.5, whiteSpace: 'nowrap' }}>
                {SHORT_LABEL[s.id] ?? s.label}
                <Box component="span" sx={{ ml: 0.5, fontVariantNumeric: 'tabular-nums', color: tokens.color.muted }}>{counts[s.id]}</Box>
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0,1fr))', lg: 'repeat(4, minmax(0,1fr))' }, gap: 2, alignItems: 'start' }}>
            {DEV_TASK_STATUSES.map((col) => {
              const items = tasks.filter((t) => t.status === col.id);
              return (
                <Box
                  component="section" key={col.id} aria-labelledby={`col-${col.id}`} data-col={col.id}
                  sx={{ display: { xs: tab === col.id ? 'block' : 'none', md: 'block' }, minWidth: 0, bgcolor: tokens.color.surfaceMuted, borderRadius: `${tokens.radius.lg}px`, p: 1.5, border: `1px solid ${tokens.color.border}` }}
                >
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5, px: 0.5 }}>
                    <StatusPill tone={TASK_TONE[col.id]}><span id={`col-${col.id}`}>{col.label}</span></StatusPill>
                    <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums' }}>{items.length} 件</Typography>
                  </Stack>
                  {items.length === 0 ? (
                    <Typography variant="caption" sx={{ display: 'block', px: 0.5, py: 2, textAlign: 'center' }}>{col.label}のタスクはありません</Typography>
                  ) : (
                    <Stack spacing={1}>
                      {items.map((t) => {
                        const next = NEXT_STATUS[t.status];
                        // 担当を外れた人の uid は残る（Orphan）。名前の横に「担当外」と出す（§2.1）
                        const names = t.assigneeUids.map((id) => `${nameOf(id)}${memberUids.includes(id) ? '' : '（担当外）'}`);
                        return (
                          <Surface key={t.id} padding={1.5} data-task={t.id}>
                            <Typography variant="body2" component="h3" sx={{ fontWeight: 650, overflowWrap: 'anywhere' }}>{t.page}</Typography>
                            <Typography variant="caption" sx={{ display: 'block', overflowWrap: 'anywhere' }}>{t.title}</Typography>
                            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 1, minWidth: 0 }}>
                              <Box sx={{ display: 'flex', flexShrink: 0, '& > * + *': { ml: '-6px' } }}>
                                {t.assigneeUids.map((id) => people[id] ? <MemberAvatar key={id} id={id} person={people[id]} size={20} /> : null)}
                              </Box>
                              <Typography variant="caption" noWrap sx={{ minWidth: 0 }} title={names.join('・')}>{names.join('・')}</Typography>
                              {isAssignee(t, uid) && <StatusPill tone="primary" dot={false}>あなた</StatusPill>}
                              <Typography variant="caption" noWrap sx={{ flexShrink: 0 }}>{relativeTime(t.updatedAt)}</Typography>
                            </Stack>
                            {canEdit && (
                              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1.5 }}>
                                {next ? (
                                  <Button
                                    variant="outlined" size="small" endIcon={<ArrowRight size={14} />}
                                    sx={{ minHeight: 44, flex: 1, minWidth: 0 }}
                                    onClick={() => { void change(t, next.to); }}
                                    aria-label={`「${t.page}」: ${next.label}（${taskLabel(next.to)}へ）`}
                                  >
                                    {next.label}
                                  </Button>
                                ) : (
                                  <Box sx={{ flex: 1 }} />
                                )}
                                <IconButton
                                  aria-label={`「${t.page}」の状態を変更`} aria-haspopup="menu"
                                  onClick={(e) => setMenu({ el: e.currentTarget, task: t })}
                                  sx={{ width: 44, height: 44, border: `1px solid ${tokens.color.border}`, borderRadius: `${tokens.radius.sm}px`, flexShrink: 0 }}
                                >
                                  <MoreHorizontal size={18} />
                                </IconButton>
                              </Stack>
                            )}
                          </Surface>
                        );
                      })}
                    </Stack>
                  )}
                </Box>
              );
            })}
          </Box>
        </>
      )}

      <Menu anchorEl={menu?.el} open={!!menu} onClose={() => setMenu(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
        {DEV_TASK_STATUSES.map((s) => {
          const current = menu?.task.status === s.id;
          return (
            <MenuItem
              key={s.id} selected={current} sx={{ minHeight: 44 }}
              onClick={() => { if (menu && !current) void change(menu.task, s.id); setMenu(null); }}
            >
              <ListItemIcon sx={{ minWidth: 28 }}>{current ? <Check size={16} /> : null}</ListItemIcon>
              <ListItemText>{s.label}</ListItemText>
            </MenuItem>
          );
        })}
      </Menu>

      {canEdit && (
        <NewDevTaskDialog
          open={adding}
          pages={taskPages(all)}
          assigneeIds={assignable}
          nameOf={nameOf}
          freePage
          busy={busy}
          onClose={() => { if (!busy) setAdding(false); }}
          onCreate={async (t) => {
            const r = prepareNewTask({ title: t.title, page: t.page, assigneeUids: t.assigneeIds }, memberUids);
            if (!r.ok) {
              toast(r.reason, 'error');
              return;
            }
            setBusy(true);
            try {
              await actions.create(project.id, r.value);
              setAdding(false);
              setTab('todo');
              toast(`「${r.value.title}」を追加しました`);
            } catch (e) {
              // 失敗時はダイアログと入力を残す（もう一度押せる）
              console.warn('task create failed', { projectId: project.id }, e);
              toast('タスクを追加できませんでした。接続と担当を確かめて、もう一度お試しください', 'error');
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </>
  );
}
