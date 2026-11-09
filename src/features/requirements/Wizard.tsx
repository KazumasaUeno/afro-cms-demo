import { Box, Button, ButtonBase, IconButton, LinearProgress, Stack, TextField, Tooltip, Typography, InputAdornment } from '@mui/material';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ArrowRight, CornerDownLeft, Globe, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { REQUIREMENT_QUESTIONS } from '@/data/requirements';
import { useDemo } from '@/store/DemoStore';
import { AiMark, Surface } from '@/components/ui';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { tokens } from '@/theme/tokens';
import { TOUCH } from '@/theme/media';
import type { AnswerValue } from '@/types';
import { AnswerInput } from './AnswerInput';
import { hostnameOf } from './buildProposal';
import { AnswerOwner, ConfirmAnswerButton } from './AnswerOwner';
import { questionStatus } from './assignment';
import { MAX_COMPETITORS, MAX_URL, validateAnswer, validateUrl } from './validation';

const STEPS = REQUIREMENT_QUESTIONS.filter((q) => q.featured);

/** AI の語りかけ（質問の前置き）。回答内容を少しだけ拾う */
function aiLead(stepId: string, answers: Record<string, AnswerValue>): string {
  const url = typeof answers['q-url'] === 'string' ? answers['q-url'] : '';
  const host = url && !validateUrl(url) ? hostnameOf(url) : '';
  switch (stepId) {
    case 'q-url': return 'こんにちは。リニューアルの要件を一緒に整理しましょう。まずは現在のサイトを教えてください。';
    case 'q-purpose': return host ? `${host} を確認しました。今回リニューアルを考えたきっかけはどれですか？（複数選択できます）` : '今回リニューアルを考えたきっかけはどれですか？';
    case 'q-issue': return 'ありがとうございます。いま一番困っていることを、そのままの言葉で教えてください。';
    case 'q-competitor': return '比較の参考にする競合サイトがあれば教えてください。最大3つまで。無ければスキップできます。';
    case 'q-improve': return '最後に、特に改善したいポイントを選んでください。提案の優先度に反映します。';
    default: return '';
  }
}

const ISSUE_SUGGESTIONS = ['スマホで見づらい', '問い合わせが少ない', '更新が大変', 'デザインが古い', '表示が遅い'];

function summarize(v: AnswerValue | undefined): string {
  if (Array.isArray(v)) return v.length ? v.join('、') : 'スキップ';
  return v && v.trim() ? v : 'スキップ';
}

function CompetitorInput({ urls, onChange, errors, onSubmit }: { urls: string[]; onChange: (u: string[]) => void; errors: (string | null)[]; onSubmit: () => void }) {
  const list = urls.length ? urls : [''];
  return (
    <Stack spacing={1.25}>
      {list.map((u, i) => (
        <Stack key={i} direction="row" spacing={1} alignItems="flex-start">
          <TextField
            fullWidth
            autoFocus={i === list.length - 1}
            value={u}
            type="url"
            inputMode="url"
            placeholder={i === 0 ? 'https://competitor.example.jp' : `競合サイト ${i + 1}`}
            onChange={(e) => onChange(list.map((x, j) => (j === i ? e.target.value.slice(0, MAX_URL + 20) : x)))}
            error={!!errors[i]}
            helperText={errors[i] ?? ' '}
            inputProps={{ 'aria-label': `競合サイトのURL ${i + 1}` }}
            InputProps={{ startAdornment: <InputAdornment position="start"><Globe size={18} color={tokens.color.muted} /></InputAdornment> }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault();
                onSubmit();
              }
            }}
            sx={{ '& .MuiOutlinedInput-root': { fontSize: 16 } }}
          />
          {list.length > 1 && (
            <IconButton aria-label={`競合サイト ${i + 1} を削除`} onClick={() => onChange(list.filter((_, j) => j !== i))} sx={{ mt: 0.5 }}>
              <Trash2 size={17} />
            </IconButton>
          )}
        </Stack>
      ))}
      {list.length < MAX_COMPETITORS && (
        <Button size="small" variant="text" startIcon={<Plus size={16} />} onClick={() => onChange([...list, ''])} sx={{ alignSelf: 'flex-start' }}>
          競合サイトを追加
        </Button>
      )}
    </Stack>
  );
}

export function Wizard({ onAnalyze }: { onAnalyze: () => void }) {
  const { state, dispatch } = useDemo();
  const reduced = useReducedMotion();
  const answers = state.requirements.answers;
  const competitors = state.requirements.competitors;
  // 初回表示時は、まだ答えていない最初の質問から始める
  const [step, setStep] = useState(() => {
    const i = STEPS.findIndex((q) => q.id !== 'q-competitor' && validateAnswer(q, answers[q.id]));
    return i === -1 ? STEPS.length - 1 : i;
  });
  const [touched, setTouched] = useState(false);
  const [dir, setDir] = useState(1);

  const q = STEPS[step];
  const qs = questionStatus(q, state.requirements);
  const isLast = step === STEPS.length - 1;
  const competitorErrors = competitors.map((u) => validateUrl(u, false));
  const error = q.id === 'q-competitor' ? (competitorErrors.some(Boolean) ? 'invalid' : null) : validateAnswer(q, answers[q.id]);

  const go = (to: number) => {
    setDir(to > step ? 1 : -1);
    setTouched(false);
    setStep(to);
  };

  const next = () => {
    if (error) {
      setTouched(true);
      return;
    }
    if (q.id === 'q-competitor') {
      const cleaned = competitors.map((u) => u.trim()).filter(Boolean);
      dispatch({ type: 'setCompetitors', urls: cleaned });
      // 変えていないときは記録し直さない（お客様の回答を代理入力に変えてしまうため）
      const prev = answers['q-competitor'];
      const same = Array.isArray(prev) ? prev.join('\n') === cleaned.join('\n') : cleaned.length === 0 && !prev;
      if (!same) dispatch({ type: 'setAnswer', questionId: 'q-competitor', value: cleaned });
    }
    if (isLast) onAnalyze();
    else go(step + 1);
  };

  const setValue = (v: AnswerValue) => dispatch({ type: 'setAnswer', questionId: q.id, value: v });
  const progress = ((step + (error ? 0 : 1)) / STEPS.length) * 100;

  return (
    <Surface padding={0} sx={{ overflow: 'hidden' }}>
      <Box sx={{ px: { xs: 2, md: 3.5 }, pt: { xs: 2, md: 3 } }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.25 }}>
          <Typography variant="overline">ヒアリング {step + 1} / {STEPS.length}</Typography>
          <Typography variant="caption">約 {Math.max(1, STEPS.length - step)} 分で完了</Typography>
        </Stack>
        <LinearProgress variant="determinate" value={progress} aria-label="ヒアリングの進捗" />
      </Box>

      {/* これまでの回答（チャットの履歴） */}
      {step > 0 && (
        <Stack spacing={1} sx={{ px: { xs: 2, md: 3.5 }, pt: 2.5 }}>
          {STEPS.slice(0, step).map((pq, i) => (
            <Stack key={pq.id} direction="row" justifyContent="flex-end">
              <ButtonBase
                onClick={() => go(i)}
                aria-label={`「${pq.text}」の回答を修正`}
                sx={{
                  maxWidth: '85%', gap: 1, px: 1.5, py: 0.75, borderRadius: '14px 14px 4px 14px', bgcolor: tokens.color.bgSubtle,
                  color: tokens.color.inkSoft, fontSize: 13, textAlign: 'left', '&:hover': { bgcolor: tokens.color.primarySoft }, '&:hover svg': { opacity: 1 },
                  // タッチでは hover が無いので、修正できることを常に見せる
                  [TOUCH]: { minHeight: 44, '& svg': { opacity: '0.8 !important' } },
                }}
              >
                <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {summarize(pq.id === 'q-competitor' ? competitors.filter(Boolean) : answers[pq.id])}
                </Box>
                <Pencil size={12} style={{ opacity: 0.4, flexShrink: 0 }} />
              </ButtonBase>
            </Stack>
          ))}
        </Stack>
      )}

      <Box sx={{ px: { xs: 2, md: 3.5 }, py: { xs: 2.5, md: 3.5 }, minHeight: { md: 360 } }}>
        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.div
            key={q.id}
            initial={reduced ? false : { opacity: 0, x: 24 * dir }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, x: -16 * dir }}
            transition={{ duration: tokens.motion.base, ease: tokens.motion.ease }}
          >
            <Stack direction="row" spacing={1.5} alignItems="flex-start" sx={{ mb: 2.5 }}>
              <AiMark size={34} />
              <Box sx={{ px: 2, py: 1.5, borderRadius: '4px 16px 16px 16px', bgcolor: tokens.color.surfaceMuted, border: `1px solid ${tokens.color.border}`, maxWidth: 560 }}>
                <Typography variant="body2" sx={{ color: tokens.color.inkSoft }}>{aiLead(q.id, answers)}</Typography>
              </Box>
            </Stack>
            <Typography variant="h2" component="h2" sx={{ mb: 1.25 }} id={`wizard-q-${q.id}`}>
              <label htmlFor={`answer-${q.id}`}>{q.text}</label>
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2.5, flexWrap: 'wrap', rowGap: 0.75 }}>
              <AnswerOwner question={q} />
              <ConfirmAnswerButton question={q} side="afro" />
            </Stack>
            {qs.assignee === 'client' && qs.state === 'unanswered' && (
              <Typography variant="caption" component="p" sx={{ mt: -1.5, mb: 2 }}>
                お客様がポータルで回答する質問です。ここで入力すると代理入力になり、お客様の確認が必要になります。
              </Typography>
            )}

            {q.id === 'q-competitor' ? (
              <CompetitorInput urls={competitors} onChange={(u) => dispatch({ type: 'setCompetitors', urls: u })} errors={touched ? competitorErrors : []} onSubmit={next} />
            ) : (
              <AnswerInput question={q} value={answers[q.id]} onChange={setValue} error={touched ? error : null} autoFocus onSubmit={next} />
            )}

            {q.id === 'q-issue' && (
              <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75, mt: 0.5 }}>
                {ISSUE_SUGGESTIONS.map((s) => (
                  <ButtonBase
                    key={s}
                    onClick={() => {
                      const cur = typeof answers['q-issue'] === 'string' ? answers['q-issue'] : '';
                      setValue(cur.includes(s) ? cur : cur ? `${cur}、${s}` : s);
                    }}
                    sx={{ px: 1.25, height: 30, [TOUCH]: { height: 44 }, borderRadius: '9px', fontSize: 12.5, fontWeight: 600, color: tokens.color.muted, border: `1px dashed ${tokens.color.borderStrong}`, '&:hover': { color: tokens.color.primary, borderColor: tokens.color.primary } }}
                  >
                    + {s}
                  </ButtonBase>
                ))}
              </Stack>
            )}
          </motion.div>
        </AnimatePresence>
      </Box>

      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{ px: { xs: 2, md: 3.5 }, py: 2, borderTop: `1px solid ${tokens.color.border}`, bgcolor: tokens.color.surfaceMuted }}
      >
        <Button variant="text" startIcon={<ArrowLeft size={16} />} onClick={() => go(step - 1)} disabled={step === 0}>戻る</Button>
        <Box sx={{ flex: 1 }} />
        <Tooltip title={q.kind === 'longtext' ? 'Ctrl / ⌘ + Enter でも進めます' : 'Enter でも進めます'}>
          <Typography variant="caption" sx={{ display: { xs: 'none', sm: 'flex' }, alignItems: 'center', gap: 0.5 }}>
            <CornerDownLeft size={13} /> {q.kind === 'longtext' ? 'Ctrl+Enter' : 'Enter'}
          </Typography>
        </Tooltip>
        <Button
          variant="contained"
          onClick={next}
          endIcon={isLast ? <Sparkles size={16} /> : <ArrowRight size={16} />}
          sx={isLast ? { background: tokens.aiGradient, '&:hover': { background: tokens.aiGradient, filter: 'brightness(1.06)' } } : undefined}
        >
          {isLast ? 'AI分析を実行' : q.id === 'q-competitor' && competitors.every((u) => !u.trim()) ? 'スキップして次へ' : '次へ'}
        </Button>
      </Stack>
    </Surface>
  );
}
