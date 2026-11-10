import { Box, ButtonBase, Dialog, DialogContent, DialogTitle, IconButton, Stack, Typography } from '@mui/material';
import { Check, ChevronRight, Layers, X } from 'lucide-react';
import { useState } from 'react';
import { REQUIREMENT_CATEGORIES, REQUIREMENT_QUESTIONS, TOTAL_REQUIREMENT_QUESTIONS } from '@/data/requirements';
import { useDemo } from '@/store/DemoStore';
import { StatusPill, Surface } from '@/components/ui';
import { tokens } from '@/theme/tokens';
import { useFullScreenDialog } from '@/hooks/useMediaQueries';
import { TOUCH } from '@/theme/media';
import type { RequirementCategory } from '@/types';
import { AnswerInput } from './AnswerInput';
import { AnswerStatus, ConfirmAnswerButton } from './AnswerStatus';
import { CompetitorField } from './CompetitorField';
import { isAnswered, validateAnswer } from './validation';

function CategoryDialog({ category, onClose }: { category: RequirementCategory | null; onClose: () => void }) {
  const fullScreen = useFullScreenDialog();
  const { state, dispatch } = useDemo();
  const questions = category ? REQUIREMENT_QUESTIONS.filter((q) => q.categoryId === category.id) : [];
  return (
    <Dialog open={!!category} onClose={onClose} fullWidth maxWidth="sm" fullScreen={fullScreen} aria-labelledby="cat-title">
      {category && (
        <>
          <DialogTitle id="cat-title" sx={{ pr: 7 }}>
            <Typography variant="overline" sx={{ display: 'block' }}>カテゴリ {category.no} / {REQUIREMENT_CATEGORIES.length}</Typography>
            <Typography variant="h3" component="span">{category.title}</Typography>
            <IconButton aria-label="閉じる" onClick={onClose} sx={{ position: 'absolute', right: 12, top: 12 }}><X size={18} /></IconButton>
          </DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
              資料上は {category.questionCount} 問。デモでは代表的な {questions.length} 問を収録しています（入力内容は自動で保存されます）。
            </Typography>
            <Stack spacing={3}>
              {questions.map((q) => {
                const value = state.requirements.answers[q.id];
                return (
                  <Box key={q.id}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                      <StatusPill tone={q.priority === 'A' ? 'primary' : 'neutral'} dot={false}>{q.priority}</StatusPill>
                      <Typography variant="h6" component="label" htmlFor={`answer-${q.id}`}>{q.text}</Typography>
                    </Stack>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.25, flexWrap: 'wrap', rowGap: 0.75 }}>
                      <AnswerStatus question={q} />
                      <ConfirmAnswerButton question={q} />
                    </Stack>
                    {/* 競合サイトは URL の配列で持つ（回答の一覧と同じ欄） */}
                    {q.id === 'q-competitor' ? <CompetitorField by="afro" /> : (
                      <AnswerInput question={q} value={value} onChange={(v) => dispatch({ type: 'setAnswer', questionId: q.id, value: v, by: 'afro' })}
                        error={isAnswered(value) ? validateAnswer(q, value, false) : null} />
                    )}
                  </Box>
                );
              })}
            </Stack>
          </DialogContent>
        </>
      )}
    </Dialog>
  );
}

/** 要件の全体像（資料の 12 項目 81 問＋公開・ドメイン）。答えた数がリアルタイムに増え、答え終えたカテゴリは緑のチェック */
export function CategoryPanel() {
  const { state } = useDemo();
  const [open, setOpen] = useState<RequirementCategory | null>(null);
  const answers = state.requirements.answers;
  const answeredTotal = REQUIREMENT_QUESTIONS.filter((q) => isAnswered(answers[q.id])).length;

  return (
    <Surface padding={{ xs: 2, md: 2.5 }}>
      <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 0.5 }}>
        <Layers size={18} color={tokens.color.primary} />
        <Typography variant="h4" component="h2">要件の全体像</Typography>
      </Stack>
      <Typography variant="caption" sx={{ display: 'block', mb: 2 }}>
        {REQUIREMENT_CATEGORIES.length}項目 {TOTAL_REQUIREMENT_QUESTIONS}問（デモの収録 {REQUIREMENT_QUESTIONS.length}問）のうち <b style={{ color: tokens.color.ink }}>{answeredTotal}問</b> 回答済み。最初の 5 問で提案書のたたき台を作ります。残りは後から追加できます。
      </Typography>
      <Stack spacing={0.5}>
        {REQUIREMENT_CATEGORIES.map((c) => {
          const qs = REQUIREMENT_QUESTIONS.filter((q) => q.categoryId === c.id);
          const done = qs.filter((q) => isAnswered(answers[q.id])).length;
          const pct = qs.length ? done / qs.length : 0;
          return (
            <ButtonBase
              key={c.id}
              onClick={() => setOpen(c)}
              aria-label={`${c.no}. ${c.title}（${done}/${qs.length}問 回答済み${qs.length > 0 && done === qs.length ? '・完了' : ''}）を開く`}
              sx={{ justifyContent: 'flex-start', gap: 1.25, px: 1, py: 0.9, borderRadius: '10px', textAlign: 'left', '&:hover': { bgcolor: tokens.color.bgSubtle }, '&:hover .chev': { opacity: 1, transform: 'translateX(0)' }, [TOUCH]: { minHeight: 44, '& .chev': { opacity: '0.8 !important' } } }}
            >
              <Box sx={{ position: 'relative', width: 22, height: 22, flexShrink: 0 }}>
                {pct === 1 ? (
                  <Box component="span" sx={{ width: 22, height: 22, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: tokens.color.success, color: '#fff' }}>
                    <Check size={13} strokeWidth={3} />
                  </Box>
                ) : (
                  <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
                    <circle cx="11" cy="11" r="9" fill="none" stroke={tokens.color.border} strokeWidth="2.5" />
                    <circle cx="11" cy="11" r="9" fill="none" stroke={tokens.color.primary} strokeWidth="2.5" strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 9} strokeDashoffset={2 * Math.PI * 9 * (1 - pct)} transform="rotate(-90 11 11)" style={{ transition: 'stroke-dashoffset .5s' }} />
                  </svg>
                )}
              </Box>
              <Typography sx={{ fontSize: 13, fontWeight: 600, flex: 1, minWidth: 0, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                <Box component="span" sx={{ color: tokens.color.muted, fontWeight: 700, mr: 0.75, fontVariantNumeric: 'tabular-nums' }}>{String(c.no).padStart(2, '0')}</Box>
                {c.title}
              </Typography>
              <Typography sx={{ fontSize: 12, color: tokens.color.muted, fontVariantNumeric: 'tabular-nums' }}>{done}/{qs.length}</Typography>
              <ChevronRight className="chev" size={15} color={tokens.color.muted} style={{ opacity: 0.4, transform: 'translateX(-2px)', transition: 'all .16s' }} />
            </ButtonBase>
          );
        })}
      </Stack>
      <CategoryDialog category={open} onClose={() => setOpen(null)} />
    </Surface>
  );
}
