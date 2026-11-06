import { Box, FormControlLabel, MenuItem, Stack, Switch, TextField, Typography } from '@mui/material';
import { ListTodo } from 'lucide-react';
import { useState } from 'react';
import { MemberAvatar, PageHeader, StatusPill, Surface } from '@/components/ui';
import { useDemo, devState } from '@/store/DemoStore';
import { useToast } from '@/hooks/useToast';
import { relativeTime } from '@/services/time';
import { memberById } from '@/data/members';
import { DEV_TASK_STATUSES, DEV_USER_ID } from '@/data/dev';
import { tokens } from '@/theme/tokens';
import type { DevTaskStatus } from '@/types';
import { TASK_TONE, taskLabel } from './devUi';

export default function DevTasksPage() {
  const { state, dispatch } = useDemo();
  const toast = useToast();
  const [mineOnly, setMineOnly] = useState(false);
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
            sx={{ mr: 0 }}
          />
        }
      />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0,1fr))', lg: 'repeat(4, minmax(0,1fr))' }, gap: { xs: 2, md: 2 }, alignItems: 'start' }}>
        {DEV_TASK_STATUSES.map((col) => {
          const items = tasks.filter((t) => t.status === col.id);
          return (
            <Box component="section" key={col.id} aria-labelledby={`col-${col.id}`} sx={{ minWidth: 0, bgcolor: tokens.color.surfaceMuted, borderRadius: `${tokens.radius.lg}px`, p: 1.5, border: `1px solid ${tokens.color.border}` }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5, px: 0.5 }}>
                <StatusPill tone={TASK_TONE[col.id]}><span id={`col-${col.id}`}>{col.label}</span></StatusPill>
                <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums' }}>{items.length} 件</Typography>
              </Stack>
              {items.length === 0 ? (
                <Typography variant="caption" sx={{ display: 'block', px: 0.5, py: 2, textAlign: 'center' }}>タスクはありません</Typography>
              ) : (
                <Stack spacing={1}>
                  {items.map((t) => {
                    const m = memberById(t.assigneeId);
                    return (
                      <Surface key={t.id} padding={1.5}>
                        <Typography variant="body2" sx={{ fontWeight: 650 }}>{t.title}</Typography>
                        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.75, minWidth: 0 }}>
                          <MemberAvatar id={m.id} size={20} />
                          <Typography variant="caption" noWrap>{m.name}{m.id === DEV_USER_ID ? '（あなた）' : ''}・{relativeTime(t.updatedAt)}</Typography>
                        </Stack>
                        <TextField
                          select size="small" fullWidth label="状態" value={t.status} sx={{ mt: 1.5 }}
                          onChange={(e) => change(t.id, t.title, e.target.value as DevTaskStatus)}
                          inputProps={{ 'aria-label': `「${t.title}」の状態` }}
                        >
                          {DEV_TASK_STATUSES.map((s) => <MenuItem key={s.id} value={s.id}>{s.label}</MenuItem>)}
                        </TextField>
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
  );
}
