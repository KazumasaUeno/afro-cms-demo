import { Box, Button, ButtonBase, Stack, Typography } from '@mui/material';
import { ArrowLeft, CalendarDays, CalendarPlus, Hammer, PackageCheck, Pencil, Rocket, RotateCcw, Save, StickyNote } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { PageHeader, Reveal, Surface } from '@/components/ui';
import { currentProject, useDemo } from '@/store/DemoStore';
import { useToast } from '@/hooks/useToast';
import { useProjectRoutes } from '@/features/projects/projectRoutes';
import { useQualityDevBy } from '@/features/quality/useQualityDevBy';
import { todayYmd, ymdToIso } from '@/features/projects/projectForm';
import { formatDateTime } from '@/services/time';
import { RequestApprovalButton } from '@/features/portal/RequestApprovalButton';
import { daysBetween, scheduleToDraft, validateSchedule, type MilestoneDates, type ScheduleDraft } from '@/data/schedule';
import { tokens } from '@/theme/tokens';
import { ScheduleEditDialog } from './ScheduleEditDialog';
import { WbsSection } from './WbsSection';

/**
 * 制作〜公開のスケジュール（2026-11-17 会議「要件定義のあと、開発担当者がスケジュールを入れる。入れるまで制作へ進めない」）。
 * 入力・保存は開発者画面（/dev/schedule）だけ。管理者画面（/schedule）は見るだけ。
 * 要件定義書の承認の前は入れられない（reducer の saveSchedule でも止めている）。
 * 予定日は 3 枚のカードで見せ、開発者画面はカードを押すと入力画面が開く
 * （2026-11-17 ユーザー指示「カレンダーの表が古いレイアウトなのが嫌だ」。以前の日付の入力欄の並びは外した）
 */

type DateKey = Exclude<keyof ScheduleDraft, 'note'>;

/** 予定日のカード（色はトークンだけ。節目ごとに色を分ける） */
export const MILESTONES: { key: DateKey; label: string; icon: ReactNode; soft: string; ink: string; accent: string }[] = [
  { key: 'buildDue', label: '制作の完了予定', icon: <Hammer size={20} />, soft: tokens.color.primarySoft, ink: tokens.color.onPrimaryContainer, accent: tokens.color.primary },
  { key: 'deliveryDate', label: '納品予定日', icon: <PackageCheck size={20} />, soft: tokens.color.infoSoft, ink: tokens.color.infoInk, accent: tokens.color.info },
  { key: 'releaseDate', label: '公開予定日', icon: <Rocket size={20} />, soft: tokens.color.successSoft, ink: tokens.color.successInk, accent: tokens.color.success },
];

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
/** yyyy-mm-dd → 12月4日(木) */
export function jpDate(ymd: string): string {
  const iso = ymdToIso(ymd);
  if (!iso) return ymd;
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日(${WEEKDAYS[d.getDay()]})`;
}
/** 今日からの残り（あと N 日 / 今日 / N 日過ぎ） */
export function untilText(ymd: string, today: string): string {
  const n = daysBetween(today, ymd);
  return n === 0 ? '今日' : n > 0 ? `あと ${n} 日` : `${-n} 日過ぎ`;
}

export default function SchedulePage() {
  const { state, dispatch } = useDemo();
  const routes = useProjectRoutes();
  const devBy = useQualityDevBy();
  const toast = useToast();
  const project = currentProject(state);
  const saved = state.schedule;
  const approved = state.requirements.status === 'approved';
  const editable = !!devBy && approved;
  const today = todayYmd();
  // 開いている入力画面（出す項目と題名）。key で毎回作り直す
  const [dialog, setDialog] = useState<{ title: string; fields: (keyof ScheduleDraft)[]; key: number } | null>(null);
  const open = (title: string, fields: (keyof ScheduleDraft)[]) => setDialog({ title, fields, key: Date.now() });
  // 予定日の下書き（WBS の ◆ をドラッグして動かす。2026-11-17 ユーザー指示「制作完了、納品、公開もドラッグ移動可能に」）。
  // カードはすぐ下書きを映し、保存は「予定日を保存」（WBS の保存とは別のボタン。押すと saveSchedule）
  const [msDraft, setMsDraft] = useState<MilestoneDates | null>(null);
  const cur: MilestoneDates | undefined = saved
    ? (msDraft ?? { buildDue: saved.buildDue, deliveryDate: saved.deliveryDate, releaseDate: saved.releaseDate })
    : undefined;
  const msDirty = !!saved && !!msDraft
    && (msDraft.buildDue !== saved.buildDue || msDraft.deliveryDate !== saved.deliveryDate || msDraft.releaseDate !== saved.releaseDate);
  /** 保存する形（下書きの予定日＋保存済みのメモ） */
  const draftOf = (): ScheduleDraft => ({ ...scheduleToDraft(saved), ...(cur ? { buildDue: cur.buildDue ?? '', deliveryDate: cur.deliveryDate, releaseDate: cur.releaseDate } : {}) });

  const save = (draft: ScheduleDraft) => {
    dispatch({ type: 'saveSchedule', schedule: draft, devBy });
    toast(saved ? 'スケジュールを変更しました' : 'スケジュールを保存しました。お客様へスケジュールの承認を依頼できます');
    setDialog(null);
    setMsDraft(null);
  };
  const saveMilestones = () => {
    const d = draftOf();
    if (Object.keys(validateSchedule(d)).length > 0) { toast('予定日の順番を確認してください（制作の完了予定 ≦ 納品予定日 ≦ 公開予定日）'); return; }
    save(d);
  };

  const card = (m: (typeof MILESTONES)[number]) => {
    const value = cur?.[m.key];
    const body = (
      <>
        <Box aria-hidden sx={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', bgcolor: tokens.color.surface, color: m.accent }}>
          {m.icon}
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: m.ink }}>{m.label}</Typography>
          <Typography sx={{ fontSize: { xs: 22, md: 24 }, fontWeight: 700, lineHeight: 1.3, fontVariantNumeric: 'tabular-nums', color: value ? m.ink : tokens.color.muted }}>
            {value ? jpDate(value) : '未設定'}
          </Typography>
          <Typography variant="caption" sx={{ color: m.ink, fontWeight: 600 }}>
            {value ? untilText(value, today) : m.key === 'buildDue' ? '任意' : '—'}
          </Typography>
        </Box>
        {editable && <Box aria-hidden sx={{ color: m.ink, alignSelf: 'flex-start', opacity: 0.7 }}><Pencil size={16} /></Box>}
      </>
    );
    const sx = {
      width: '100%', minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', textAlign: 'left', gap: 1.5,
      px: 2, py: 2, minHeight: 104, borderRadius: `${tokens.radius.lg}px`, bgcolor: m.soft,
    } as const;
    return editable ? (
      <ButtonBase
        key={m.key}
        onClick={() => open(`${m.label}を変更`, [m.key])}
        aria-label={`${m.label} ${value ? `${jpDate(value)}・${untilText(value, today)}` : '未設定'}。押すと変更できます`}
        sx={{
          ...sx,
          transition: `box-shadow ${tokens.motion.fast}s, transform ${tokens.motion.fast}s`,
          '&:hover': { boxShadow: tokens.shadow.sm, transform: 'translateY(-1px)' },
          '&:focus-visible': { boxShadow: tokens.shadow.focus },
          '@media (prefers-reduced-motion: reduce)': { transition: 'none', '&:hover': { transform: 'none' } },
        }}
      >
        {body}
      </ButtonBase>
    ) : (
      <Box key={m.key} sx={sx}>{body}</Box>
    );
  };

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
      <Reveal>
        <Surface padding={{ xs: 2, md: 3 }}>
          {!approved ? (
            <Typography variant="body2" role="status" sx={{ color: 'text.secondary' }}>
              要件定義書がお客様に承認されると、スケジュールを入れられます。
            </Typography>
          ) : !saved ? (
            // まだ入れていない: 開発者画面は 1 つのボタンで 3 つの日付とメモをまとめて入れる
            <Stack spacing={1.5} alignItems="flex-start">
              <Box aria-hidden sx={{ width: 40, height: 40, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: tokens.color.primarySoft, color: tokens.color.primary }}>
                <CalendarPlus size={20} />
              </Box>
              <Typography variant="h4" component="h2">まだ予定日が入っていません</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {editable
                  ? '制作の完了予定・納品予定日・公開予定日を入れると、お客様へスケジュールの承認を依頼できます。'
                  : 'スケジュールは開発者画面で開発担当者が入れます（管理者画面は見るだけ）。'}
              </Typography>
              {editable && (
                <Button variant="contained" startIcon={<CalendarPlus size={16} />} onClick={() => open('予定日を入れる', ['buildDue', 'deliveryDate', 'releaseDate', 'note'])}>
                  予定日を入れる
                </Button>
              )}
            </Stack>
          ) : (
            <Stack spacing={2}>
              {!editable && (
                <Typography variant="body2" role="note" sx={{ color: 'text.secondary' }}>
                  スケジュールは開発者画面で開発担当者が変えます（管理者画面は見るだけ）。
                </Typography>
              )}
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', md: 'repeat(3, minmax(0,1fr))' }, gap: 1.5 }}>
                {MILESTONES.map(card)}
              </Box>

              {/* メモ（開発者画面は押すと入力画面） */}
              {(() => {
                const memo = (
                  <>
                    <Box aria-hidden sx={{ color: tokens.color.inkSoft, display: 'inline-flex', mt: 0.25 }}><StickyNote size={16} /></Box>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography variant="caption" sx={{ fontWeight: 600, color: tokens.color.inkSoft }}>メモ</Typography>
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: saved.note ? 'text.primary' : tokens.color.muted }}>
                        {saved.note || (editable ? 'なし（押すと入力できます）' : 'なし')}
                      </Typography>
                    </Box>
                    {editable && <Box aria-hidden sx={{ color: tokens.color.inkSoft, opacity: 0.7 }}><Pencil size={14} /></Box>}
                  </>
                );
                const sx = { width: '100%', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start', textAlign: 'left', gap: 1.25, px: 2, py: 1.25, borderRadius: `${tokens.radius.md}px`, bgcolor: tokens.color.surfaceMuted } as const;
                return editable ? (
                  <ButtonBase onClick={() => open('メモを変更', ['note'])} aria-label={`メモ ${saved.note || 'なし'}。押すと変更できます`} sx={{ ...sx, '&:focus-visible': { boxShadow: tokens.shadow.focus } }}>
                    {memo}
                  </ButtonBase>
                ) : <Box sx={sx}>{memo}</Box>;
              })()}

              {/* WBS の ◆ をドラッグしたときだけ出す（未保存の予定日） */}
              {editable && msDirty && (
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
                  <Button variant="contained" startIcon={<Save size={16} />} onClick={saveMilestones}>予定日を保存</Button>
                  <Typography variant="body2" role="status" sx={{ color: tokens.color.warningInk, fontWeight: 600 }}>未保存の変更があります</Typography>
                  <Button variant="text" startIcon={<RotateCcw size={16} />} onClick={() => setMsDraft(null)}>元に戻す</Button>
                </Stack>
              )}

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between">
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  保存済み {formatDateTime(saved.savedAt)}・{saved.savedBy}
                </Typography>
                {/* 段階の最後のお客様の承認（2026-11-17 ユーザー指示）。保存の後に依頼できる */}
                <RequestApprovalButton approvalKey="schedule" />
              </Stack>
            </Stack>
          )}
        </Surface>
      </Reveal>

      {editable && dialog && (
        <ScheduleEditDialog
          key={dialog.key}
          title={dialog.title}
          fields={dialog.fields}
          initial={draftOf()}
          onClose={() => setDialog(null)}
          onSave={save}
        />
      )}

      {/* 制作〜公開の WBS（2026-11-17 ユーザー指示「作ってみて」）。◆（予定日）は開発者画面でドラッグでき、上のカードに出る */}
      <WbsSection editable={editable} devBy={devBy} ms={cur} onMsChange={editable && saved ? setMsDraft : undefined} />
    </>
  );
}
