import { Box, Button, ButtonBase, IconButton, LinearProgress, Stack, TextField, Tooltip, Typography, InputAdornment } from '@mui/material';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Check, CornerDownLeft, Globe, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { REQUIREMENT_CATEGORIES, REQUIREMENT_QUESTIONS } from '@/data/requirements';
import { useDemo } from '@/store/DemoStore';
import { Surface } from '@/components/ui';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { tokens } from '@/theme/tokens';
import { TOUCH } from '@/theme/media';
import type { AnswerValue, RequirementQuestion } from '@/types';
import { AnswerInput } from './AnswerInput';
import { hostnameOf } from './buildProposal';
import { ConfirmAnswerButton } from './AnswerStatus';
import { SaveAnswersButton } from './SaveAnswersButton';
import { MAX_COMPETITORS, MAX_URL, isAnswered, validateAnswer, validateUrl } from './validation';

/**
 * 要件ヒアリングの入力（管理者画面）。受託開発では、アフロの担当者がヒアリングで伺った内容を入力する。
 * 主要な質問を 1 問ずつ出し、次へ・戻るで行き来する。入力は自動で保存され、「保存」ですぐ保存もできる。
 */
const STEPS = REQUIREMENT_QUESTIONS.filter((q) => q.featured);

/** 入力するアフロの担当者向けの補足（ヒアリングで伺った内容を入れる） */
function hintOf(stepId: string, answers: Record<string, AnswerValue>): string {
  const url = typeof answers['q-url'] === 'string' ? answers['q-url'] : '';
  const host = url && !validateUrl(url) ? hostnameOf(url) : '';
  switch (stepId) {
    case 'q-url': return 'お客様の現在のサイトの URL。AI 分析でこのサイトを巡回します。';
    case 'q-purpose': return `${host ? `${host} のリニューアルについて、` : ''}ヒアリングで伺ったきっかけを選びます（複数選択できます）。`;
    case 'q-issue': return 'お客様が話した言葉のまま入れると、提案書の「ご回答いただいた課題」にそのまま載ります。';
    case 'q-competitor': return `比較に使う競合サイトを最大 ${MAX_COMPETITORS} つまで。無ければスキップできます。`;
    case 'q-improve': return '特に改善したいポイントを選びます。提案の優先度に反映します。';
    default: return '';
  }
}

const ISSUE_SUGGESTIONS = ['スマホで見づらい', '問い合わせが少ない', '更新が大変', 'デザインが古い', '表示が遅い'];

/** その質問を答え終えたか（競合サイトは任意なので、1 つでも入っていれば回答済み） */
function isDone(q: RequirementQuestion, answers: Record<string, AnswerValue>): boolean {
  return q.id === 'q-competitor' ? isAnswered(answers[q.id]) : !validateAnswer(q, answers[q.id]);
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
  const category = REQUIREMENT_CATEGORIES.find((c) => c.id === q.categoryId);
  const isLast = step === STEPS.length - 1;
  const competitorErrors = competitors.map((u) => validateUrl(u, false));
  const error = q.id === 'q-competitor' ? (competitorErrors.some(Boolean) ? 'invalid' : null) : validateAnswer(q, answers[q.id]);
  const doneCount = STEPS.filter((x) => isDone(x, answers)).length;
  // 先へ飛べるのは、まだ答えていない最初の質問まで（必須の質問を飛ばして分析に進ませない）
  const firstOpen = STEPS.findIndex((x) => x.id !== 'q-competitor' && validateAnswer(x, answers[x.id]));
  const reachable = Math.max(step, firstOpen === -1 ? STEPS.length - 1 : firstOpen);

  const go = (to: number) => {
    setDir(to > step ? 1 : -1);
    setTouched(false);
    setStep(to);
  };

  // 競合サイトの欄は入力途中の値を competitors に持つ。次へ・保存のときに回答として確定する
  const commitCompetitors = () => {
    if (q.id !== 'q-competitor') return;
    const cleaned = competitors.map((u) => u.trim()).filter(Boolean);
    // 形式が正しくない URL は回答として確定しない（次へと同じ扱い。欄にはエラーが出ている）
    if (cleaned.some((u) => validateUrl(u, false))) return;
    dispatch({ type: 'setCompetitors', urls: cleaned });
    // 変えていないときは記録し直さない（入力日時が進まないように）
    const prev = answers['q-competitor'];
    const same = Array.isArray(prev) ? prev.join('\n') === cleaned.join('\n') : cleaned.length === 0 && !prev;
    if (!same) dispatch({ type: 'setAnswer', questionId: 'q-competitor', value: cleaned });
  };

  const next = () => {
    if (error) {
      setTouched(true);
      return;
    }
    commitCompetitors();
    if (isLast) onAnalyze();
    else go(step + 1);
  };

  const setValue = (v: AnswerValue) => dispatch({ type: 'setAnswer', questionId: q.id, value: v });

  return (
    <Surface padding={0} sx={{ overflow: 'hidden' }}>
      {/* 進み具合: 何問目か・答えた数・質問ごとの印（回答済みは緑のチェック） */}
      <Box sx={{ px: { xs: 2, md: 3.5 }, pt: { xs: 2, md: 3 } }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mb: 1.25 }}>
          <Typography variant="overline">質問 {step + 1} / {STEPS.length}</Typography>
          <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums' }}>回答済み <b style={{ color: tokens.color.ink }}>{doneCount}</b> / {STEPS.length}</Typography>
        </Stack>
        <LinearProgress variant="determinate" value={(doneCount / STEPS.length) * 100} aria-label={`ヒアリングの進捗 ${doneCount} / ${STEPS.length} 問 回答済み`} />
        <Stack component="ol" direction="row" spacing={0.75} aria-label="質問の一覧" sx={{ listStyle: 'none', m: 0, p: 0, mt: 1.5 }}>
          {STEPS.map((x, i) => {
            const done = isDone(x, answers);
            const current = i === step;
            return (
              <Box component="li" key={x.id} sx={{ flex: 1, minWidth: 0 }}>
                <ButtonBase
                  onClick={() => go(i)}
                  disabled={current || i > reachable}
                  aria-current={current ? 'step' : undefined}
                  aria-label={`質問 ${i + 1}: ${x.text}（${done ? '回答済み' : '未回答'}）`}
                  sx={{
                    width: '100%', gap: 0.75, px: 0.75, height: 36, [TOUCH]: { height: 44 }, borderRadius: '10px', justifyContent: 'center',
                    border: `1px solid ${current ? tokens.color.primary : tokens.color.border}`,
                    bgcolor: current ? tokens.color.primarySoft : tokens.color.surface,
                    '&.Mui-disabled': { opacity: current ? 1 : 0.5 },
                  }}
                >
                  <Box component="span" sx={{
                    width: 20, height: 20, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700,
                    bgcolor: done ? tokens.color.success : 'transparent', color: done ? '#fff' : current ? tokens.color.primary : tokens.color.muted,
                    border: done ? 'none' : `1.5px solid ${current ? tokens.color.primary : tokens.color.borderStrong}`,
                  }}>
                    {done ? <Check size={12} strokeWidth={3} /> : i + 1}
                  </Box>
                </ButtonBase>
              </Box>
            );
          })}
        </Stack>
      </Box>

      {/* いまの質問と入力欄 */}
      <Box sx={{ px: { xs: 2, md: 3.5 }, py: { xs: 2.5, md: 3.5 }, minHeight: { md: 300 } }}>
        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.div
            key={q.id}
            initial={reduced ? false : { opacity: 0, x: 24 * dir }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, x: -16 * dir }}
            transition={{ duration: tokens.motion.base, ease: tokens.motion.ease }}
          >
            {category && <Typography variant="overline" sx={{ display: 'block', mb: 0.5, color: tokens.color.muted }}>{category.no}. {category.title}</Typography>}
            <Typography variant="h2" component="h2" sx={{ mb: 1 }} id={`wizard-q-${q.id}`}>
              <label htmlFor={`answer-${q.id}`}>{q.text}</label>
            </Typography>
            <Typography variant="body2" sx={{ color: tokens.color.muted, mb: 2.5, maxWidth: 620 }}>{hintOf(q.id, answers)}</Typography>
            <Box sx={{ mb: 1.5, '&:empty': { display: 'none' } }}><ConfirmAnswerButton question={q} /></Box>

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
        sx={{ px: { xs: 2, md: 3.5 }, py: 2, gap: 1, flexWrap: 'wrap', borderTop: `1px solid ${tokens.color.border}`, bgcolor: tokens.color.surfaceMuted }}
      >
        <Button variant="text" startIcon={<ArrowLeft size={16} />} onClick={() => go(step - 1)} disabled={step === 0}>戻る</Button>
        <SaveAnswersButton beforeSave={commitCompetitors} />
        <Box sx={{ flex: 1 }} />
        <Tooltip title={q.kind === 'longtext' ? 'Ctrl / ⌘ + Enter でも進めます' : 'Enter でも進めます'}>
          <Typography variant="caption" sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 0.5 }}>
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
