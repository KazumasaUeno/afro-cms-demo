import { Box, Button, LinearProgress, Stack, Typography } from '@mui/material';
import { ArrowRight, Palette } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { BuildFlowNav } from '@/components/layout/BuildFlowNav';
import { PageHeader, Reveal, StatusPill, Surface } from '@/components/ui';
import { DESIGN_QUESTIONS } from '@/data/designRequirements';
import { useDemo } from '@/store/DemoStore';
import { formatDateTime } from '@/services/time';
import { tokens } from '@/theme/tokens';
import type { AnswerValue } from '@/types';
import { AnswerInput } from '@/features/requirements/AnswerInput';
import { SaveAnswersButton } from '@/features/requirements/SaveAnswersButton';
import { answerText, isAnswered, validateAnswer } from '@/features/requirements/validation';
import { useProjectRoutes } from '@/features/projects/projectRoutes';
import { DESIGN_REQUIRED, designAnsweredCount, designBlockers } from './designReq';

/**
 * デザイン要件定義（管理者画面 /ai-studio/design/requirements・開発者画面 /dev/design/requirements。0.28.0。2026-11-12 ユーザー決定）。
 * サイトマップの承認の後、デザイン案（3 案）を作る前に、デザイン・ブランドの 6 問を聞く。必須（A）の質問がそろうとデザインスタジオで 3 案を出す。
 * 入力欄・保存の表示はヒアリングと同じ部品（AnswerInput・SaveAnswersButton）。入力は自動で保存される（store が localStorage へ書く）。
 * デザインの採用・承認の後は閲覧だけ（reducer も受け付けない）。demo だけ（live の router には無い）
 */
export default function DesignRequirementsPage() {
  const { state, dispatch, flush } = useDemo();
  const { design: designRoute } = useProjectRoutes();
  const navigate = useNavigate();
  const answers = state.design.answers ?? {};
  const meta = state.design.answerMeta ?? {};
  const editable = !state.design.approvedAt;
  const blockers = designBlockers(answers);
  const requiredDone = DESIGN_REQUIRED.length - blockers.length;
  const ready = blockers.length === 0;
  const answered = designAnsweredCount(answers);
  const setValue = (id: string, v: AnswerValue) => dispatch({ type: 'setDesignAnswer', questionId: id, value: v });

  return (
    <Box>
      <BuildFlowNav />
      <PageHeader
        eyebrow="③ 制作"
        icon={<Palette size={14} />}
        title="デザイン要件定義"
        description={
          editable
            ? 'デザインの好み・ブランドを伺って入力します。必須（A）の質問がそろうと、デザインスタジオで3つのデザイン案を作れます。'
            : 'デザイン案を採用済みのため、閲覧だけできます。'
        }
      />

      <Stack spacing={2.5}>
        <Reveal>
          <Surface padding={{ xs: 2, md: 2.5 }}>
            <Stack direction="row" alignItems="baseline" justifyContent="space-between" spacing={1} sx={{ mb: 0.75 }}>
              <Typography sx={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                必須 {requiredDone} / {DESIGN_REQUIRED.length} 問
              </Typography>
              <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums' }}>回答済み {answered} / {DESIGN_QUESTIONS.length}</Typography>
            </Stack>
            <LinearProgress
              variant="determinate"
              value={(requiredDone / DESIGN_REQUIRED.length) * 100}
              aria-label="デザイン要件定義の必須の質問の進み具合"
              aria-valuetext={`必須 ${requiredDone} / ${DESIGN_REQUIRED.length} 問`}
            />
            {!state.sitemap.approvedAt && editable && (
              <Typography variant="caption" component="p" sx={{ mt: 1.25 }}>サイトマップはまだ承認されていません。入力は先にしておけます。</Typography>
            )}
          </Surface>
        </Reveal>

        <Reveal>
          <Surface padding={0} component="section" aria-labelledby="design-req-title">
            <Box sx={{ px: { xs: 2, md: 3 }, pt: { xs: 2, md: 2.5 }, pb: 1 }}>
              <Typography id="design-req-title" variant="h3" component="h2">デザイン・ブランド</Typography>
              <Stack direction="row" spacing={1.25} alignItems="center" role="group" aria-label="バッジの意味" sx={{ mt: 1, flexWrap: 'wrap', rowGap: 0.5 }}>
                <Stack direction="row" spacing={0.5} alignItems="center"><StatusPill tone="primary" dot={false}>A 必須</StatusPill><Typography variant="caption">デザイン案を作るのに必要</Typography></Stack>
                <Stack direction="row" spacing={0.5} alignItems="center"><StatusPill tone="neutral" dot={false}>B 任意</StatusPill><Typography variant="caption">聞けたら入力</Typography></Stack>
              </Stack>
            </Box>
            <Box component="ol" sx={{ listStyle: 'none', m: 0, px: { xs: 2, md: 3 }, pt: 1.5, pb: 1 }}>
              {DESIGN_QUESTIONS.map((q) => {
                const value = answers[q.id];
                const done = isAnswered(value);
                return (
                  <Box component="li" key={q.id} sx={{ py: { xs: 2, md: 2.5 }, borderTop: `1px solid ${tokens.color.border}`, '&:first-of-type': { borderTop: 'none', pt: 0.5 } }}>
                    <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.75 }}>
                      <StatusPill tone={q.priority === 'A' ? 'primary' : 'neutral'} dot={false}>{q.priority === 'A' ? 'A 必須' : 'B 任意'}</StatusPill>
                      {done && <StatusPill tone="success">回答済み</StatusPill>}
                    </Stack>
                    <Typography variant="h6" component={editable ? 'label' : 'h3'} htmlFor={editable ? `answer-${q.id}` : undefined} sx={{ display: 'block', mb: 1.25 }}>
                      {q.text}
                    </Typography>
                    {editable ? (
                      <AnswerInput question={q} value={value} onChange={(v) => setValue(q.id, v)} error={done ? validateAnswer(q, value, false) : null} />
                    ) : (
                      <Typography variant="body2" sx={{ px: 1.5, py: 1, borderRadius: 2, bgcolor: tokens.color.surfaceMuted, color: done ? tokens.color.ink : tokens.color.muted, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                        {done ? answerText(value) : '未回答'}
                      </Typography>
                    )}
                    {done && meta[q.id] && <Typography variant="caption" sx={{ display: 'block', mt: 0.75 }}>入力 {formatDateTime(meta[q.id].at)}</Typography>}
                  </Box>
                );
              })}
            </Box>
          </Surface>
        </Reveal>

        <Surface padding={{ xs: 2, md: 2.5 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'center' }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              {editable && (
                <SaveAnswersButton
                  source={{ snapshot: JSON.stringify(answers), meta, saveNow: () => Promise.resolve(flush()) }}
                />
              )}
              {!ready && editable && (
                <Typography variant="caption" component="p" sx={{ mt: 1 }}>
                  必須の質問があと {blockers.length} 問あります
                </Typography>
              )}
            </Box>
            <Button variant={ready ? 'contained' : 'outlined'} endIcon={<ArrowRight size={16} />} onClick={() => navigate(designRoute)} sx={{ flexShrink: 0 }}>
              デザインスタジオへ
            </Button>
          </Stack>
        </Surface>
      </Stack>
    </Box>
  );
}
