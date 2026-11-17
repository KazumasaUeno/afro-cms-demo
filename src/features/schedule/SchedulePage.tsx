import { Box, Button, Stack, TextField, Typography } from '@mui/material';
import { ArrowLeft, CalendarDays, Save } from 'lucide-react';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { PageHeader, StatusPill, Surface } from '@/components/ui';
import { currentProject, useDemo } from '@/store/DemoStore';
import { useToast } from '@/hooks/useToast';
import { useProjectRoutes } from '@/features/projects/projectRoutes';
import { useQualityDevBy } from '@/features/quality/useQualityDevBy';
import { formatDateTime } from '@/services/time';
import { SCHEDULE_NOTE_MAX, scheduleToDraft, validateSchedule, type ScheduleDraft } from '@/data/schedule';

/**
 * 制作〜公開のスケジュール（2026-11-17 会議「要件定義のあと、開発担当者がスケジュールを入れる。入れるまで制作へ進めない」）。
 * 入力・保存は開発者画面（/dev/schedule）だけ。管理者画面（/schedule）は見るだけ。
 * 要件定義書の承認の前は入れられない（reducer の saveSchedule でも止めている）
 */
export default function SchedulePage() {
  const { state, dispatch } = useDemo();
  const routes = useProjectRoutes();
  const devBy = useQualityDevBy();
  const toast = useToast();
  const project = currentProject(state);
  const saved = state.schedule;
  const [draft, setDraft] = useState<ScheduleDraft>(() => scheduleToDraft(saved));
  const [tried, setTried] = useState(false);
  const errors = validateSchedule(draft);
  const show = (k: keyof ScheduleDraft) => (tried ? errors[k] : undefined);
  const approved = state.requirements.status === 'approved';
  const editable = !!devBy && approved;

  const save = () => {
    setTried(true);
    if (Object.keys(errors).length > 0) return;
    dispatch({ type: 'saveSchedule', schedule: draft, devBy });
    toast(saved ? 'スケジュールを変更しました' : 'スケジュールを保存しました。サイトマップの承認を依頼できます');
  };

  const field = (k: Exclude<keyof ScheduleDraft, 'note'>, label: string, help: string) => (
    <TextField
      fullWidth type="date" label={label} value={draft[k]} disabled={!editable}
      onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
      error={!!show(k)} helperText={show(k) ?? help} InputLabelProps={{ shrink: true }}
    />
  );

  return (
    <>
      <Button component={RouterLink} to={routes.detail(project.id)} size="small" startIcon={<ArrowLeft size={16} />} sx={{ mb: 2, ml: -1 }}>
        プロジェクト詳細
      </Button>
      <PageHeader
        eyebrow="③ スケジュール"
        icon={<CalendarDays size={15} />}
        title="制作〜公開のスケジュール"
        description="要件定義書の承認のあと、開発担当者が制作・納品・公開の予定日を入れます。スケジュールを入れるまで、サイトマップの承認（制作）へ進めません。"
      />
      <Surface padding={{ xs: 2, md: 3 }} sx={{ maxWidth: 720 }}>
        <Stack spacing={2.5}>
          {!approved && (
            <Typography variant="body2" role="status" sx={{ color: 'text.secondary' }}>
              要件定義書がお客様に承認されると、スケジュールを入れられます。
            </Typography>
          )}
          {approved && !devBy && (
            <Typography variant="body2" role="note" sx={{ color: 'text.secondary' }}>
              スケジュールは開発者画面で開発担当者が入れます（管理者画面は見るだけ）。
            </Typography>
          )}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', sm: 'repeat(3, minmax(0,1fr))' }, gap: 2 }}>
            {field('buildDue', '制作の完了予定（任意）', '全ページの構築を終える日')}
            {field('deliveryDate', '納品予定日', '品質管理・納品検収の終了日')}
            {field('releaseDate', '公開予定日', '納品予定日以降')}
          </Box>
          <TextField
            fullWidth multiline minRows={2} label="メモ（任意）" value={draft.note} disabled={!editable}
            onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
            error={!!show('note')} helperText={show('note') ?? `${SCHEDULE_NOTE_MAX}文字以内`}
          />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
            {editable && <Button variant="contained" startIcon={<Save size={16} />} onClick={save}>{saved ? '変更を保存' : '保存する'}</Button>}
            {saved
              ? <StatusPill tone="success">保存済み {formatDateTime(saved.savedAt)}・{saved.savedBy}</StatusPill>
              : <StatusPill tone="warning">未入力</StatusPill>}
          </Stack>
        </Stack>
      </Surface>
    </>
  );
}
