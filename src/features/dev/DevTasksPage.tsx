import { Box, Button, FormControlLabel, IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Stack, Switch, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { ArrowRight, Check, ListTodo, MoreHorizontal } from 'lucide-react';
import { useState } from 'react';
import { MemberAvatar, PageHeader, StatusPill, Surface } from '@/components/ui';
import { useDemo, devState } from '@/store/DemoStore';
import { useToast } from '@/hooks/useToast';
import { relativeTime } from '@/services/time';
import { memberById } from '@/data/members';
import { DEV_TASK_STATUSES, DEV_USER_ID } from '@/data/dev';
import { tokens } from '@/theme/tokens';
import type { DevTask, DevTaskStatus } from '@/types';
import { NEXT_STATUS, TASK_TONE, taskLabel } from './devUi';

/** 390px の状態タブで 4 等分に収まらない名前だけ短くする（aria-label は正式名） */
const SHORT_LABEL: Partial<Record<DevTaskStatus, string>> = { review: 'レビュー' };

export default function DevTasksPage() {
  const { state, dispatch } = useDemo();
  const toast = useToast();
  const [mineOnly, setMineOnly] = useState(false);
  const [tab, setTab] = useState<DevTaskStatus>('doing');
  const [menu, setMenu] = useState<{ el: HTMLElement; task: DevTask } | null>(null);
  const tasks = devState(state).tasks.filter((t) => !mineOnly || t.assigneeId === DEV_USER_ID);

  const change = (id: string, title: string, status: DevTaskStatus) => {
    dispatch({ type: 'setDevTaskStatus', id, status });
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
          <FormControlLabel
            control={<Switch checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />}
            label="自分の担当のみ"
            sx={{ mr: 0, minHeight: 44 }}
          />
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
                    const m = memberById(t.assigneeId);
                    const next = NEXT_STATUS[t.status];
                    const workLabel = t.title.startsWith(t.page) ? t.title.slice(t.page.length).replace(/^ページの/, '') : t.title;
                    return (
                      <Surface key={t.id} padding={1.5} data-task={t.id}>
                        <Typography variant="body2" component="h3" sx={{ fontWeight: 650 }}>{t.page}</Typography>
                        <Typography variant="caption" sx={{ display: 'block' }}>{workLabel}</Typography>
                        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 1, minWidth: 0 }}>
                          <MemberAvatar id={m.id} size={20} />
                          <Typography variant="caption" noWrap sx={{ minWidth: 0 }}>{m.name}</Typography>
                          {m.id === DEV_USER_ID && <StatusPill tone="primary" dot={false}>あなた</StatusPill>}
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
    </>
  );
}
