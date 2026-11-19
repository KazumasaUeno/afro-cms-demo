import { Box, Button, FormControlLabel, IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Stack, Switch, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { ArrowRight, Check, ListTodo, MoreHorizontal, Plus } from 'lucide-react';
import { useState } from 'react';
import { MemberAvatar, PageHeader, StatusPill, Surface } from '@/components/ui';
import { useDemo, devState, devProjectsState } from '@/store/DemoStore';
import { useToast } from '@/hooks/useToast';
import { relativeTime } from '@/services/time';
import { memberById } from '@/data/members';
import { DEV_TASK_STATUSES } from '@/data/dev';
import { tokens } from '@/theme/tokens';
import type { DevTask, DevTaskStatus } from '@/types';
import { NEXT_STATUS, TASK_TONE, isTaskAssignee, taskAssignees, taskLabel } from './devUi';
import { useDevUser } from './useDevUser';
import { NewDevTaskDialog, WHOLE_SITE } from './NewDevTaskDialog';

/** 390px の状態タブで 4 等分に収まらない名前だけ短くする（aria-label は正式名） */
const SHORT_LABEL: Partial<Record<DevTaskStatus, string>> = { review: 'レビュー' };

export default function DevTasksPage() {
  const { state, dispatch } = useDemo();
  // ログイン中のメンバー（「自分の担当」「あなた」の判定と、操作の記録に使う）
  const me = useDevUser();
  const toast = useToast();
  const [mineOnly, setMineOnly] = useState(false);
  const [tab, setTab] = useState<DevTaskStatus>('doing');
  const [menu, setMenu] = useState<{ el: HTMLElement; task: DevTask } | null>(null);
  const [adding, setAdding] = useState(false);
  const dev = devState(state);
  const tasks = dev.tasks.filter((t) => !mineOnly || isTaskAssignee(t, me.id));
  // 追加の候補: 対象ページはその案件のタスクのページ、担当はログイン中の人＋その案件の開発担当＋いまの担当
  // 「サイト全体」はダイアログが先頭に固定で出すので、候補からは外す（重複させない）
  const taskPages = [...new Set(dev.tasks.map((t) => t.page))].filter((p) => p !== WHOLE_SITE);
  const projectDevs = Object.entries(devProjectsState(state)).filter(([, ids]) => ids.includes(state.requirements.projectId)).map(([id]) => id);
  const assignable = [...new Set([me.id, ...projectDevs, ...dev.tasks.flatMap(taskAssignees)])];

  const change = (id: string, title: string, status: DevTaskStatus) => {
    dispatch({ type: 'setDevTaskStatus', id, status, by: me.id });
    toast(`「${title}」を${taskLabel(status)}にしました`);
  };

  return (
    <>
      <PageHeader
        eyebrow="開発者画面"
        icon={<ListTodo size={15} />}
        title="構築タスク"
        description="採用デザインをもとに、ページごとに実装します。状態を変えると管理者画面のアクティビティにも記録されます。"
        actions={
          <Stack direction="row" spacing={1.5} alignItems="center" useFlexGap sx={{ flexWrap: 'wrap' }}>
            <FormControlLabel
              control={<Switch checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />}
              label="自分の担当のみ"
              sx={{ mr: 0, minHeight: 44 }}
            />
            <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => setAdding(true)} sx={{ minHeight: 44 }}>タスクを追加</Button>
          </Stack>
        }
      />

      {/* md 未満: 状態タブで 1 列だけ見せる */}
      <ToggleButtonGroup
        value={tab}
        exclusive
        fullWidth
        onChange={(_, v: DevTaskStatus | null) => v && setTab(v)}
        aria-label="表示する状態"
        size="small"
        sx={{ display: { xs: 'flex', md: 'none' }, mb: 2 }}
      >
        {DEV_TASK_STATUSES.map((s) => {
          const n = tasks.filter((t) => t.status === s.id).length;
          return (
            <ToggleButton key={s.id} value={s.id} aria-label={`${s.label} ${n} 件`} sx={{ minHeight: 44, px: 0.5, whiteSpace: 'nowrap' }}>
              {SHORT_LABEL[s.id] ?? s.label}
              <Box component="span" sx={{ ml: 0.5, fontVariantNumeric: 'tabular-nums', color: tokens.color.muted }}>{n}</Box>
            </ToggleButton>
          );
        })}
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
                    // 担当が複数のときはアバターを重ねて並べ、名前は「・」でつなぐ（2026-11-19）
                    const people = taskAssignees(t).map(memberById);
                    const next = NEXT_STATUS[t.status];
                    const workLabel = t.title.startsWith(t.page) ? t.title.slice(t.page.length).replace(/^ページの/, '') : t.title;
                    return (
                      <Surface key={t.id} padding={1.5} data-task={t.id}>
                        <Typography variant="body2" component="h3" sx={{ fontWeight: 650 }}>{t.page}</Typography>
                        <Typography variant="caption" sx={{ display: 'block' }}>{workLabel}</Typography>
                        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 1, minWidth: 0 }}>
                          <Box sx={{ display: 'flex', flexShrink: 0, '& > * + *': { ml: '-6px' } }}>
                            {people.map((p) => <MemberAvatar key={p.id} id={p.id} size={20} />)}
                          </Box>
                          <Typography variant="caption" noWrap sx={{ minWidth: 0 }} title={people.map((p) => p.name).join('・')}>{people.map((p) => p.name).join('・')}</Typography>
                          {people.some((p) => p.id === me.id) && <StatusPill tone="primary" dot={false}>あなた</StatusPill>}
                          <Typography variant="caption" noWrap sx={{ flexShrink: 0 }}>{relativeTime(t.updatedAt)}</Typography>
                        </Stack>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1.5 }}>
                          {next ? (
                            <Button
                              variant="outlined" size="small" endIcon={<ArrowRight size={14} />}
                              sx={{ minHeight: 44, flex: 1, minWidth: 0 }}
                              onClick={() => change(t.id, t.title, next.to)}
                              aria-label={`「${t.page}」: ${next.label}（${taskLabel(next.to)}へ）`}
                            >
                              {next.label}
                            </Button>
                          ) : (
                            <Box sx={{ flex: 1 }} />
                          )}
                          <IconButton
                            aria-label={`「${t.page}」の状態を変更`}
                            aria-haspopup="menu"
                            onClick={(e) => setMenu({ el: e.currentTarget, task: t })}
                            sx={{ width: 44, height: 44, border: `1px solid ${tokens.color.border}`, borderRadius: `${tokens.radius.sm}px`, flexShrink: 0 }}
                          >
                            <MoreHorizontal size={18} />
                          </IconButton>
                        </Stack>
                      </Surface>
                    );
                  })}
                </Stack>
              )}
            </Box>
          );
        })}
      </Box>

      <Menu anchorEl={menu?.el} open={!!menu} onClose={() => setMenu(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
        {DEV_TASK_STATUSES.map((s) => {
          const current = menu?.task.status === s.id;
          return (
            <MenuItem
              key={s.id}
              selected={current}
              sx={{ minHeight: 44 }}
              onClick={() => { if (menu && !current) change(menu.task.id, menu.task.title, s.id); setMenu(null); }}
            >
              <ListItemIcon sx={{ minWidth: 28 }}>{current ? <Check size={16} /> : null}</ListItemIcon>
              <ListItemText>{s.label}</ListItemText>
            </MenuItem>
          );
        })}
      </Menu>

      <NewDevTaskDialog
        open={adding}
        pages={taskPages}
        assigneeIds={assignable}
        onClose={() => setAdding(false)}
        onCreate={(t) => {
          dispatch({ type: 'addDevTask', ...t, by: me.id });
          setAdding(false);
          setTab('todo');
          toast(`「${t.title}」を追加しました`);
        }}
      />
    </>
  );
}
