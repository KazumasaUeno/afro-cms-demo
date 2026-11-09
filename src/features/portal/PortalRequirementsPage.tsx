import { Box, Button, Stack, TextField, Typography } from '@mui/material';
import { ArrowRight, ChevronDown, MessageSquareText } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader, Reveal, SectionTitle, StatusPill, Surface } from '@/components/ui';
import { useDemo } from '@/store/DemoStore';
import { REQUIREMENT_CATEGORIES } from '@/data/requirements';
import { tokens } from '@/theme/tokens';
import { AREAS } from '@/components/layout/nav';
import type { AnswerValue, RequirementQuestion } from '@/types';
import { AnswerInput } from '@/features/requirements/AnswerInput';
import { AnswerOwner, ConfirmAnswerButton } from '@/features/requirements/AnswerOwner';
import { MODE_LABEL, modeOf, pendingConfirmations, questionsFor } from '@/features/requirements/assignment';
import { isAnswered, validateAnswer } from '@/features/requirements/validation';

const AREA = AREAS.portal;

const INTRO: Record<ReturnType<typeof modeOf>, string> = {
  shared: '事業の目的やお好みなど、お客様にしか分からない質問だけをお願いしています。技術や競合の調査はアフロが答えます。',
  client: 'すべての質問にお客様が回答する進め方です。分からない質問は空欄のままで構いません（アフロが補います）。',
  afro: 'アフロの担当者がヒアリングして入力する進め方です。入力された内容はここで確認でき、追記もできます。',
};

function summarize(v: AnswerValue | undefined): string {
  if (Array.isArray(v)) return v.join('、');
  return v ?? '';
}

/**
 * 競合サイトは URL の配列で持つ（ウィザード・提案書と同じ形）。1 行に 1 つ入力してもらう。
 * 入力中の改行が消えないよう、入力欄の文字列は手元に持ち、確定した URL の配列だけを保存する
 */
function CompetitorField() {
  const { state, dispatch } = useDemo();
  const saved = state.requirements.answers['q-competitor'];
  const [raw, setRaw] = useState(() => (Array.isArray(saved) ? saved.join('\n') : ''));
  return (
    <TextField
      id="answer-q-competitor"
      fullWidth
      multiline
      minRows={2}
      value={raw}
      placeholder={'https://competitor.example.jp\n（1 行に 1 つ、最大 3 つ）'}
      helperText="1 行に 1 つ。最大 3 つまで使います"
      inputProps={{ 'aria-label': '意識している競合サイトのURL（1 行に 1 つ）' }}
      onChange={(e) => {
        const v = e.target.value.slice(0, 700);
        setRaw(v);
        const urls = v.split(/\s+/).map((x) => x.trim()).filter(Boolean).slice(0, 3);
        dispatch({ type: 'setAnswer', questionId: 'q-competitor', value: urls, by: 'client' });
      }}
      sx={{ '& .MuiOutlinedInput-root': { fontSize: 16 } }}
    />
  );
}

/** anchor=false は確認待ちの一覧に出す複製（id を重複させない・入力欄を出さない） */
function QuestionBlock({ q, editable, anchor = true }: { q: RequirementQuestion; editable: boolean; anchor?: boolean }) {
  const { state, dispatch } = useDemo();
  const value = state.requirements.answers[q.id];
  const cat = REQUIREMENT_CATEGORIES.find((c) => c.id === q.categoryId);
  return (
    <Box id={anchor ? `q-${q.id}` : undefined} sx={{ py: 2, borderTop: `1px solid ${tokens.color.border}`, scrollMarginTop: tokens.layout.topbar + 16 }}>
      <Typography variant="overline" sx={{ display: 'block', color: tokens.color.muted }}>{cat ? `${cat.no}. ${cat.title}` : ''}</Typography>
      <Typography variant="h6" component={editable && anchor ? 'label' : 'p'} htmlFor={editable && anchor ? `answer-${q.id}` : undefined} sx={{ display: 'block', mb: 1 }}>{q.text}</Typography>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.25, flexWrap: 'wrap', rowGap: 0.75 }}>
        <AnswerOwner question={q} />
        <ConfirmAnswerButton question={q} side="client" />
      </Stack>
      {editable && anchor && q.id === 'q-competitor' ? (
        <CompetitorField />
      ) : editable && anchor ? (
        <AnswerInput
          question={q}
          value={value}
          onChange={(v) => dispatch({ type: 'setAnswer', questionId: q.id, value: v, by: 'client' })}
          error={isAnswered(value) ? validateAnswer(q, value, false) : null}
        />
      ) : (
        <Typography variant="body2" sx={{ px: 1.5, py: 1, borderRadius: 2, bgcolor: tokens.color.surfaceMuted, color: isAnswered(value) ? tokens.color.ink : tokens.color.muted }}>
          {isAnswered(value) ? summarize(value) : '未回答'}
        </Typography>
      )}
    </Box>
  );
}

/** お客様ポータル: 要件ヒアリングへの回答と、アフロが代理入力した回答の確認 */
export default function PortalRequirementsPage() {
  const { state } = useDemo();
  const navigate = useNavigate();
  const req = state.requirements;
  const mode = modeOf(req);
  const editable = req.status === 'draft';
  const mine = questionsFor(req, 'client');
  const afroQs = questionsFor(req, 'afro');
  const done = mine.filter((q) => isAnswered(req.answers[q.id])).length;
  const toConfirm = pendingConfirmations(req, 'client');
  // アフロの担当はお客様にとって任意。共同・アフロ入力のときは畳んでおく
  const [showAfro, setShowAfro] = useState(mode === 'afro');

  return (
    <>
      <PageHeader
        eyebrow="お客様ポータル"
        icon={<MessageSquareText size={15} />}
        title="ヒアリング"
        description="リニューアルの要件を決めるための質問です。入力した内容は自動で保存され、アフロの管理画面にもすぐ反映されます。"
      />

      <Stack spacing={{ xs: 2, md: 2.5 }}>
        <Reveal>
          <Surface padding={{ xs: 2, md: 3 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} sx={{ mb: 1.5 }}>
              <StatusPill tone="info" dot={false}>進め方: {MODE_LABEL[mode].label}</StatusPill>
              <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>{INTRO[mode]}</Typography>
            </Stack>
            {mine.length > 0 && (
              <Box>
                <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.75 }}>
                  <Typography variant="caption">お客様の担当の質問</Typography>
                  <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 650 }}>{done} / {mine.length} 問</Typography>
                </Stack>
                <Box sx={{ height: 8, borderRadius: 4, bgcolor: tokens.color.bgSubtle, overflow: 'hidden' }}>
                  <Box sx={{ height: '100%', width: `${(done / mine.length) * 100}%`, bgcolor: AREA.color, transition: 'width .3s' }} />
                </Box>
              </Box>
            )}
            {!editable && (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} sx={{ mt: 2, px: 1.5, py: 1.25, borderRadius: 2, bgcolor: tokens.color.bgSubtle }}>
                <Typography variant="caption" sx={{ flex: 1 }}>
                  {req.status === 'approved' ? '要件定義書は承認済みです。回答は締め切りました。' : 'アフロが回答をもとに要件定義書を作成しました。回答は締め切り、内容は「確認・承認」でご確認いただけます。'}
                </Typography>
                {req.status === 'analyzed' && (
                  <Button size="small" endIcon={<ArrowRight size={14} />} onClick={() => navigate('/portal/approvals#requirements')}>確認・承認へ</Button>
                )}
              </Stack>
            )}
          </Surface>
        </Reveal>

        {toConfirm.length > 0 && (
          <Reveal delay={0.04}>
            <Surface padding={{ xs: 2, md: 3 }} sx={{ borderLeft: `3px solid ${tokens.color.warning}` }}>
              <SectionTitle title="アフロが代わりに入力した回答" sub={<StatusPill tone="warning">確認待ち {toConfirm.length}</StatusPill>} />
              <Typography variant="caption" component="p" sx={{ mb: 1 }}>
                内容が合っていれば「内容を確認しました」を押してください。違う場合は下の質問で書き直すと、お客様の回答になります。
              </Typography>
              {toConfirm.map((q) => <QuestionBlock key={q.id} q={q} editable={false} anchor={false} />)}
            </Surface>
          </Reveal>
        )}

        {mine.length > 0 && (
          <Reveal delay={0.08}>
            <Surface padding={{ xs: 2, md: 3 }}>
              <SectionTitle title="お客様にお答えいただきたい質問" sub={<Typography variant="caption">{mine.length} 問</Typography>} />
              {mine.map((q) => <QuestionBlock key={q.id} q={q} editable={editable} />)}
            </Surface>
          </Reveal>
        )}

        {afroQs.length > 0 && (
          <Reveal delay={0.12}>
            <Surface padding={{ xs: 2, md: 3 }}>
              <Button
                variant="text"
                onClick={() => setShowAfro((v) => !v)}
                aria-expanded={showAfro}
                aria-controls="portal-afro-questions"
                endIcon={<ChevronDown size={16} style={{ transform: showAfro ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />}
                sx={{ px: 1, ml: -1 }}
              >
                アフロが回答する質問（{afroQs.length} 問）
              </Button>
              <Typography variant="caption" component="p" sx={{ mt: 0.5 }}>
                ご存じのことがあれば追記できます。お客様が入力した内容は、アフロが確認してから使います。
              </Typography>
              {showAfro && (
                <Box id="portal-afro-questions" sx={{ mt: 1 }}>
                  {afroQs.map((q) => <QuestionBlock key={q.id} q={q} editable={editable} />)}
                </Box>
              )}
            </Surface>
          </Reveal>
        )}
      </Stack>
    </>
  );
}
