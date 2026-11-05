import { Box, ButtonBase, Dialog, DialogContent, DialogTitle, IconButton, Stack, Typography } from '@mui/material';
import { ChevronRight, Layers, X } from 'lucide-react';
import { useState } from 'react';
import { REQUIREMENT_CATEGORIES, REQUIREMENT_QUESTIONS, TOTAL_REQUIREMENT_QUESTIONS } from '@/data/requirements';
import { useDemo } from '@/store/DemoStore';
import { StatusPill, Surface } from '@/components/ui';
import { tokens } from '@/theme/tokens';
import type { RequirementCategory } from '@/types';
import { AnswerInput } from './AnswerInput';
import { isAnswered, validateAnswer } from './validation';

function CategoryDialog({ category, onClose }: { category: RequirementCategory | null; onClose: () => void }) {
  const { state, dispatch } = useDemo();
  const questions = category ? REQUIREMENT_QUESTIONS.filter((q) => q.categoryId === category.id) : [];
  return (
    <Dialog open={!!category} onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="cat-title">
      {category && (
        <>
          <DialogTitle id="cat-title" sx={{ pr: 7 }}>
            <Typography variant="overline" sx={{ display: 'block' }}>カテゴリ {category.no} / 12</Typography>
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
                    <AnswerInput question={q} value={value} onChange={(v) => dispatch({ type: 'setAnswer', questionId: q.id, value: v })}
                      error={isAnswered(value) ? validateAnswer(q, value, false) : null} />
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

/** 「12項目81問」の全体像。答えた数がリアルタイムに増える */
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
        12項目 {TOTAL_REQUIREMENT_QUESTIONS}問のうち <b style={{ color: tokens.color.ink }}>{answeredTotal}問</b> 回答済み。カテゴリから追加で入力できます。
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
              aria-label={`${c.no}. ${c.title}（${done}/${qs.length}問 回答済み）を開く`}
              sx={{ justifyContent: 'flex-start', gap: 1.25, px: 1, py: 0.9, borderRadius: '10px', textAlign: 'left', '&:hover': { bgcolor: tokens.color.bgSubtle }, '&:hover .chev': { opacity: 1, transform: 'translateX(0)' } }}
            >
              <Box sx={{ position: 'relative', width: 22, height: 22, flexShrink: 0 }}>
                <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
                  <circle cx="11" cy="11" r="9" fill="none" stroke={tokens.color.border} strokeWidth="2.5" />
                  <circle cx="11" cy="11" r="9" fill="none" stroke={pct === 1 ? tokens.color.success : tokens.color.primary} strokeWidth="2.5" strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 9} strokeDashoffset={2 * Math.PI * 9 * (1 - pct)} transform="rotate(-90 11 11)" style={{ transition: 'stroke-dashoffset .5s' }} />
                </svg>
              </Box>
              <Typography sx={{ fontSize: 13, fontWeight: 600, flex: 1, minWidth: 0 }} noWrap>
                <Box component="span" sx={{ color: tokens.color.faint, mr: 0.75, fontVariantNumeric: 'tabular-nums' }}>{String(c.no).padStart(2, '0')}</Box>
                {c.title}
              </Typography>
              <Typography sx={{ fontSize: 12, color: tokens.color.muted, fontVariantNumeric: 'tabular-nums' }}>{c.questionCount}問</Typography>
              <ChevronRight className="chev" size={15} color={tokens.color.muted} style={{ opacity: 0.4, transform: 'translateX(-2px)', transition: 'all .16s' }} />
            </ButtonBase>
          );
        })}
      </Stack>
      <CategoryDialog category={open} onClose={() => setOpen(null)} />
    </Surface>
  );
}
