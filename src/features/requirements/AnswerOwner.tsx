import { Box, ButtonBase, Stack, Typography } from '@mui/material';
import { Users } from 'lucide-react';
import { useRef, type KeyboardEvent } from 'react';
import { StatusPill, type PillTone } from '@/components/ui';
import { useDemo } from '@/store/DemoStore';
import { useToast } from '@/hooks/useToast';
import { tokens } from '@/theme/tokens';
import { TOUCH } from '@/theme/media';
import type { AnswerSide, RequirementMode, RequirementQuestion } from '@/types';
import { MODE_LABEL, SIDE_LABEL, modeOf, pendingConfirmations, questionStatus, questionsFor, statusLabel, type AnswerState } from './assignment';
import { isAnswered } from './validation';

const TONE: Record<AnswerState, PillTone> = { unanswered: 'neutral', answered: 'success', proxy: 'warning', confirmed: 'success' };

/** 質問ごとの「担当」と「状態」 */
export function AnswerOwner({ question }: { question: RequirementQuestion }) {
  const { state } = useDemo();
  const s = questionStatus(question, state.requirements);
  return (
    <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
      <StatusPill tone={s.assignee === 'client' ? 'info' : 'primary'} dot={false}>{SIDE_LABEL[s.assignee]}の担当</StatusPill>
      <StatusPill tone={TONE[s.state]}>{statusLabel(s)}</StatusPill>
    </Stack>
  );
}

const MODES: RequirementMode[] = ['shared', 'afro', 'client'];

/** 管理者画面: 回答の分担の切り替えと、お客様側の進み具合 */
export function ModeSwitcher() {
  const { state, dispatch } = useDemo();
  const toast = useToast();
  const req = state.requirements;
  const mode = modeOf(req);
  // 分担を変えられるのは AI 分析前だけ（分析後は回答を締め切っている）
  const locked = req.status !== 'draft';
  const clientQs = questionsFor(req, 'client');
  const clientDone = clientQs.filter((q) => isAnswered(req.answers[q.id])).length;
  const waitingClient = pendingConfirmations(req, 'client').length;
  const waitingAfro = pendingConfirmations(req, 'afro').length;
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const select = (m: RequirementMode) => {
    if (m === mode || locked) return;
    dispatch({ type: 'setRequirementMode', mode: m });
    toast(`回答の分担を「${MODE_LABEL[m].label}」にしました`);
  };

  // ラジオボタンの操作: 矢印キーで選び直す（Tab では選択中の 1 つにだけ止まる）
  const onKeyDown = (e: KeyboardEvent) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    const at = { Home: 0, End: MODES.length - 1 }[e.key];
    if (step === undefined && at === undefined) return;
    e.preventDefault();
    // 押し続けたときの繰り返しでは切り替えない（通知が連続で出るため）
    if (locked || e.repeat) return;
    const next = at ?? (MODES.indexOf(mode) + step! + MODES.length) % MODES.length;
    select(MODES[next]);
    refs.current[next]?.focus();
  };

  return (
    <Box sx={{ p: { xs: 1.75, md: 2 }, mb: 2.5, borderRadius: `${tokens.radius.lg}px`, border: `1px solid ${tokens.color.border}`, bgcolor: tokens.color.surface }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 1.5, md: 2.5 }} alignItems={{ md: 'center' }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0 }}>
          <Users size={17} color={tokens.color.primary} />
          <Typography variant="h6" component="h2" id="req-mode-label">回答の分担</Typography>
        </Stack>
        <Box role="radiogroup" aria-labelledby="req-mode-label" onKeyDown={onKeyDown} sx={{ display: 'flex', p: 0.5, gap: 0.5, borderRadius: '12px', bgcolor: tokens.color.bgSubtle, alignSelf: { xs: 'stretch', md: 'auto' } }}>
          {MODES.map((m, i) => {
            const on = m === mode;
            return (
              <ButtonBase
                key={m}
                ref={(el: HTMLButtonElement | null) => { refs.current[i] = el; }}
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                disabled={locked && !on}
                onClick={() => select(m)}
                sx={{
                  flex: { xs: 1, md: 'none' }, px: 1.5, height: 34, [TOUCH]: { height: 44 }, borderRadius: '9px', fontSize: 13, fontWeight: 650, whiteSpace: 'nowrap',
                  color: on ? tokens.color.ink : tokens.color.muted, bgcolor: on ? tokens.color.surface : 'transparent', boxShadow: on ? tokens.shadow.xs : 'none',
                  '&.Mui-disabled': { opacity: 0.45 },
                }}
              >
                {MODE_LABEL[m].label}{m === 'shared' && <Box component="span" sx={{ ml: 0.5, fontSize: 11, color: tokens.color.faint }}>既定</Box>}
              </ButtonBase>
            );
          })}
        </Box>
        <Typography variant="caption" sx={{ flex: 1, minWidth: 0 }}>{MODE_LABEL[mode].description}</Typography>
      </Stack>
      <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap', rowGap: 0.75 }}>
        <StatusPill tone="info" dot={false}>お客様の担当 {clientDone} / {clientQs.length} 問 回答</StatusPill>
        {waitingClient > 0 && <StatusPill tone="warning">代理入力・お客様の確認待ち {waitingClient}</StatusPill>}
        {waitingAfro > 0 && <StatusPill tone="warning">お客様が代理入力・アフロの確認待ち {waitingAfro}</StatusPill>}
      </Stack>
    </Box>
  );
}

/** 代理入力の確認ボタン。side は確認する側（管理者画面は afro、ポータルは client） */
export function ConfirmAnswerButton({ question, side }: { question: RequirementQuestion; side: AnswerSide }) {
  const { state, dispatch } = useDemo();
  const toast = useToast();
  const s = questionStatus(question, state.requirements);
  if (s.state !== 'proxy' || s.assignee !== side) return null;
  return (
    <ButtonBase
      onClick={() => { dispatch({ type: 'confirmAnswer', questionId: question.id, by: side }); toast('回答を確認しました'); }}
      sx={{ px: 1.25, height: 30, [TOUCH]: { height: 44 }, borderRadius: '8px', fontSize: 12.5, fontWeight: 650, color: tokens.color.primary, border: `1px solid ${tokens.color.primary}`, '&:hover': { bgcolor: tokens.color.primarySoft } }}
    >
      内容を確認しました
    </ButtonBase>
  );
}
