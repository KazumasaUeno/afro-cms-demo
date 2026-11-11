import { TextField } from '@mui/material';
import { useState } from 'react';
import { useRepositories } from '@/repositories';
import type { AnswerSide } from '@/types';
import { MAX_COMPETITORS } from './validation';

/**
 * 競合サイトの回答欄（ヒアリングの入力画面用）。
 * 競合サイトは URL の配列で持つ（提案書と同じ形）。1 行に 1 つ入力してもらう。
 * 入力中の改行が消えないよう、入力欄の文字列は手元に持ち、確定した URL の配列だけを保存する。by は入力した側
 */
export function CompetitorField({ by }: { by: AnswerSide }) {
  const { requirements } = useRepositories();
  const { data: req } = requirements.useCurrent();
  const saved = req.answers['q-competitor'];
  const [raw, setRaw] = useState(() => (Array.isArray(saved) ? saved.join('\n') : ''));
  return (
    <TextField
      id="answer-q-competitor"
      fullWidth
      multiline
      minRows={2}
      value={raw}
      placeholder={`https://competitor.example.jp\n（1 行に 1 つ、最大 ${MAX_COMPETITORS} つ）`}
      helperText={`1 行に 1 つ。最大 ${MAX_COMPETITORS} つまで使います`}
      inputProps={{ 'aria-label': '意識している競合サイトのURL（1 行に 1 つ）' }}
      onChange={(e) => {
        const v = e.target.value.slice(0, 700);
        setRaw(v);
        const urls = v.split(/\s+/).map((x) => x.trim()).filter(Boolean).slice(0, MAX_COMPETITORS);
        void requirements.setAnswer(req.projectId, 'q-competitor', urls, by);
      }}
      sx={{ '& .MuiOutlinedInput-root': { fontSize: 16 } }}
    />
  );
}
