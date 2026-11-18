import { Box, Stack, Typography } from '@mui/material';
import { Fragment } from 'react';
import { REQUIREMENT_CATEGORIES, REQUIREMENT_QUESTIONS } from '@/data/requirements';
import { SectionTitle, Surface } from '@/components/ui';
import { tokens } from '@/theme/tokens';
import type { ProjectSchedule, RequirementSession } from '@/types';
import { answerText, isAnswered } from './validation';
import { NON_FUNCTIONAL, NON_FUNCTIONAL_NOTE, ymdText } from './requirementsDoc';

/**
 * 要件定義書の 2〜4 節（ヒアリングの回答・スケジュール・非機能要件）を画面で見せる（2026-11-18 ユーザー指示「要件定義の内容が見れない」。
 * 以前はダウンロードした HTML にしか無かった）。中身は requirementsDoc.ts（ダウンロード）と同じ定義を使う
 */

/** 見出しと値の 2 列の表（スマホは縦に積む） */
function KeyValueRows({ rows }: { rows: { k: string; v: React.ReactNode }[] }) {
  return (
    <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0,2fr) minmax(0,3fr)' }, columnGap: 2 }}>
      {rows.map((r, i) => (
        <Fragment key={i}>
          <Box component="dt" sx={{ pt: 1.25, pb: { xs: 0, md: 1.25 }, borderTop: { md: i ? `1px solid ${tokens.color.border}` : 'none' }, color: tokens.color.muted, fontSize: 13, fontWeight: 600 }}>{r.k}</Box>
          <Box component="dd" sx={{ m: 0, py: 1.25, borderTop: { md: i ? `1px solid ${tokens.color.border}` : 'none' }, borderBottom: { xs: `1px solid ${tokens.color.border}`, md: 'none' }, fontSize: 14, whiteSpace: 'pre-wrap', minWidth: 0, overflowWrap: 'anywhere' }}>{r.v}</Box>
        </Fragment>
      ))}
    </Box>
  );
}

const muted = (s: string) => <Typography component="span" variant="body2" color="text.secondary">{s}</Typography>;

export function HearingAnswersSection({ req }: { req: RequirementSession }) {
  return (
    <Stack spacing={2}>
      {REQUIREMENT_CATEGORIES.map((c) => {
        const qs = REQUIREMENT_QUESTIONS.filter((q) => q.categoryId === c.id);
        if (!qs.length) return null;
        const answered = qs.filter((q) => isAnswered(req.answers[q.id])).length;
        return (
          <Surface key={c.id}>
            <SectionTitle title={`${c.no}. ${c.title}`} sub={<Typography variant="caption">回答 {answered} / {qs.length}</Typography>} />
            <KeyValueRows rows={qs.map((q) => ({ k: q.text, v: isAnswered(req.answers[q.id]) ? answerText(req.answers[q.id]) : muted('未回答') }))} />
          </Surface>
        );
      })}
    </Stack>
  );
}

export function ScheduleSection({ schedule }: { schedule?: ProjectSchedule }) {
  return (
    <Surface>
      <SectionTitle title="スケジュール" />
      {schedule ? (
        <>
          <KeyValueRows rows={[
            { k: '制作完了目安', v: schedule.buildDue ? ymdText(schedule.buildDue) : muted('未定') },
            { k: '品質管理・納品検収の終了日（納品予定日）', v: ymdText(schedule.deliveryDate) },
            { k: '公開日（予定）', v: ymdText(schedule.releaseDate) },
            ...(schedule.note ? [{ k: '備考', v: schedule.note }] : []),
          ]} />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>日程は予定です。お客様のご確認・素材のご提供の時期により前後することがあります。</Typography>
        </>
      ) : (
        <Typography variant="body2" color="text.secondary">要件定義書の承認後に、開発担当者が制作〜公開の予定日を入力します。</Typography>
      )}
    </Surface>
  );
}

export function NonFunctionalSection() {
  return (
    <Stack spacing={2}>
      <Box sx={{ p: 1.5, borderRadius: `${tokens.radius.md}px`, bgcolor: tokens.color.surfaceMuted }}>
        <Typography variant="body2" color="text.secondary">{NON_FUNCTIONAL_NOTE}</Typography>
      </Box>
      {NON_FUNCTIONAL.map((g) => (
        <Surface key={g.title}>
          <SectionTitle title={g.title} />
          <KeyValueRows rows={g.rows.map(([k, v]) => ({ k, v }))} />
        </Surface>
      ))}
    </Stack>
  );
}

/**
 * 要件定義書のつくり方（2026-11-18 ユーザー指示「要件定義の作り方がいまいちわかっていない」）。
 * いまどこまで進んでいるかを 4 段で見せる。status: draft＝ヒアリング入力中 / analyzed＝AI のたたき台ができた / approved＝承認済み
 */
export function RequirementsHowTo({ status, requested }: { status: RequirementSession['status']; requested: boolean }) {
  const steps = [
    { title: 'ヒアリングを入力', who: '開発担当者', detail: 'お客様に伺った内容（目的・課題・ターゲット・必要な機能など）を入力します。' },
    { title: 'AI がたたき台を作成', who: 'AI', detail: '回答と現行サイトの分析から、改善提案（要件定義書のたたき台）を作ります。' },
    { title: '内容を確認して承認を依頼', who: '開発担当者', detail: '下の 4 つの節を確認し、必要なら回答を直して作り直します。よければ「承認を依頼する」。' },
    { title: 'お客様が承認', who: 'お客様', detail: '承認されると、スケジュールの入力へ進みます。' },
  ];
  const current = status === 'draft' ? 0 : status === 'approved' ? 4 : requested ? 3 : 2;
  return (
    <Surface sx={{ mb: 3 }}>
      <SectionTitle title="要件定義書のつくり方" />
      <Box component="ol" sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, minmax(0,1fr))' }, gap: 1.5 }}>
        {steps.map((s, i) => {
          const done = i < current;
          const now = i === current;
          return (
            <Box component="li" key={s.title} aria-current={now ? 'step' : undefined} sx={{
              p: 1.5, borderRadius: `${tokens.radius.md}px`, minWidth: 0,
              border: `1px solid ${now ? tokens.color.primary : tokens.color.border}`,
              bgcolor: now ? tokens.color.primaryContainer : done ? tokens.color.surfaceMuted : 'transparent',
            }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Box sx={{ width: 22, height: 22, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0, bgcolor: done || now ? tokens.color.primary : tokens.color.surfaceMuted, color: done || now ? tokens.color.onPrimary : tokens.color.muted }}>{done ? '✓' : i + 1}</Box>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>{s.title}</Typography>
              </Stack>
              <Typography variant="caption" sx={{ display: 'block', mt: 0.75, color: tokens.color.muted }}>{s.who}{now ? '・いまここ' : done ? '・済み' : ''}</Typography>
              <Typography variant="caption" sx={{ display: 'block', mt: 0.25 }}>{s.detail}</Typography>
            </Box>
          );
        })}
      </Box>
    </Surface>
  );
}
