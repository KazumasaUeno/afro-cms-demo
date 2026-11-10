import { Box, Button, ButtonBase, Stack, Typography } from '@mui/material';
import { ArrowRight, MessageSquareText } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader, Reveal, SectionTitle, StatusPill, Surface } from '@/components/ui';
import { useDemo } from '@/store/DemoStore';
import { REQUIREMENT_CATEGORIES, REQUIREMENT_QUESTIONS, TOTAL_REQUIREMENT_QUESTIONS } from '@/data/requirements';
import { formatDateTime } from '@/services/time';
import { tokens } from '@/theme/tokens';
import { TOUCH } from '@/theme/media';
import type { RequirementQuestion, RequirementSession } from '@/types';
import { AnswerInput } from './AnswerInput';
import { AnswerStatus, ConfirmAnswerButton } from './AnswerStatus';
import { CompetitorField } from './CompetitorField';
import { CsvTools } from './CsvTools';
import { SaveAnswersButton } from './SaveAnswersButton';
import { questionStatus } from './assignment';
import { answerText, isAnswered, validateAnswer } from './validation';

/**
 * 管理者画面: ヒアリングの回答の一覧（/ai-studio/hearing）。
 * 受託開発では、アフロの担当者がヒアリングで伺った内容を全問入力する（お客様は入力しない。2026-11-10 決定）。CSV でまとめて入力もできる。
 * 値は store の requirements から毎回導く（専用の状態は持たない）。
 * 要件定義書の承認まで入力できる（AI 分析の後も）。承認後は reducer が変更を受け付けないため閲覧のみ。
 * 分析後に変えた回答は、提案書（回答から毎回作る）にすぐ反映される。
 */

type Filter = 'all' | 'unanswered' | 'answered' | 'pending';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'すべて' },
  { id: 'unanswered', label: '未回答' },
  { id: 'answered', label: '回答済み' },
  // 0.17 までの保存データでお客様が入力した回答だけが対象。無ければボタンを出さない
  { id: 'pending', label: '確認待ち' },
];

function matches(q: RequirementQuestion, req: RequirementSession, f: Filter): boolean {
  const s = questionStatus(q, req);
  switch (f) {
    case 'all': return true;
    case 'answered': return s.state === 'answered' || s.state === 'confirmed';
    case 'unanswered': return s.state === 'unanswered';
    case 'pending': return s.state === 'proxy';
  }
}

function AnswerRow({ q, editable }: { q: RequirementQuestion; editable: boolean }) {
  const { state, dispatch } = useDemo();
  const req = state.requirements;
  const value = req.answers[q.id];
  const s = questionStatus(q, req);
  const answered = isAnswered(value);
  return (
    <Box sx={{ py: 2, borderTop: `1px solid ${tokens.color.border}` }}>
      <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mb: 1 }}>
        <StatusPill tone={q.priority === 'A' ? 'primary' : 'neutral'} dot={false}>{q.priority}</StatusPill>
        <Typography variant="h6" component={editable ? 'label' : 'h3'} htmlFor={editable ? `answer-${q.id}` : undefined} sx={{ flex: 1, minWidth: 0 }}>{q.text}</Typography>
      </Stack>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.25, flexWrap: 'wrap', rowGap: 0.75 }}>
        <AnswerStatus question={q} />
        <ConfirmAnswerButton question={q} />
      </Stack>
      {editable && q.id === 'q-competitor' ? (
        <CompetitorField by="afro" />
      ) : editable ? (
        <AnswerInput
          question={q}
          value={value}
          onChange={(v) => dispatch({ type: 'setAnswer', questionId: q.id, value: v, by: 'afro' })}
          error={answered ? validateAnswer(q, value, false) : null}
        />
      ) : (
        <Typography
          variant="body2"
          sx={{ px: 1.5, py: 1, borderRadius: 2, bgcolor: tokens.color.surfaceMuted, color: answered ? tokens.color.ink : tokens.color.muted, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
        >
          {answered ? answerText(value) : '未回答'}
        </Typography>
      )}
      {answered && s.meta && (
        <Typography variant="caption" sx={{ display: 'block', mt: 0.75 }}>
          入力 {formatDateTime(s.meta.at)}
          {s.meta.confirmedAt ? `・確認 ${formatDateTime(s.meta.confirmedAt)}` : ''}
        </Typography>
      )}
    </Box>
  );
}

export default function HearingAnswersPage() {
  const { state } = useDemo();
  const navigate = useNavigate();
  const req = state.requirements;
  const [filter, setFilter] = useState<Filter>('all');
  // 絞り込みの結果は選んだ時点で固定する（「未回答」で入力した質問が、入力の途中で一覧から消えないように）
  const [picked, setPicked] = useState<string[]>([]);
  // CSV を取り込んだら、入力途中の値を手元に持つ欄（競合サイト）を読み直す
  const [csvVersion, setCsvVersion] = useState(0);
  const project = state.projects.find((p) => p.id === req.projectId);

  const all = REQUIREMENT_QUESTIONS;
  const answeredCount = all.filter((q) => isAnswered(req.answers[q.id])).length;
  const count = (f: Filter) => all.filter((q) => matches(q, req, f)).length;
  const shown = filter === 'all' ? all : all.filter((q) => picked.includes(q.id));
  const pick = (f: Filter) => {
    setFilter(f);
    setPicked(all.filter((q) => matches(q, req, f)).map((q) => q.id));
  };
  // open: AI 分析前。editable: 入力できる（承認まで）
  const open = req.status === 'draft';
  const editable = req.status !== 'approved';

  return (
    <Box>
      <PageHeader
        eyebrow="① 要件定義"
        icon={<MessageSquareText size={14} />}
        title="ヒアリングの回答"
        description={editable
          ? 'ヒアリングで伺った内容を、全問まとめて確認・入力できます。入力は自動で保存されます（「保存」ですぐに保存することもできます）。'
          : 'ヒアリングで伺った内容を、全問まとめて確認できます。'}
        actions={
          <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 1 }}>
            {editable && <SaveAnswersButton />}
            <Button variant="outlined" endIcon={<ArrowRight size={16} />} onClick={() => navigate('/ai-studio')}>
              {open ? 'AI Studio へ（AI 分析）' : '提案書を見る'}
            </Button>
          </Stack>
        }
      />

      <Stack spacing={{ xs: 2, md: 2.5 }}>
        <Reveal>
          <Surface padding={{ xs: 2, md: 3 }}>
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 0.75, mb: 1.5 }}>
              {project && <StatusPill tone="neutral" dot={false}>{project.clientName}</StatusPill>}
              <StatusPill tone={open ? 'warning' : 'success'}>
                {open ? '入力中（AI 分析前）' : req.status === 'approved' ? `要件定義書 承認済み ${formatDateTime(req.approvedAt)}` : `AI 分析済み ${formatDateTime(req.analyzedAt)}・お客様の承認待ち`}
              </StatusPill>
            </Stack>
            <Typography variant="caption" component="p">
              デモに収録した {all.length} 問のうち <b style={{ color: tokens.color.ink }}>{answeredCount} 問</b> 回答済み（資料の 12 項目 81 問に公開・ドメインの 3 問を加えた {REQUIREMENT_CATEGORIES.length} 項目 {TOTAL_REQUIREMENT_QUESTIONS} 問）。
              {open
                ? ''
                : editable
                  ? ' AI 分析の後も、要件定義書の承認まで入力できます。変えた内容は提案書にすぐ反映されます。'
                  : ' 要件定義書を承認済みのため、ここでは閲覧だけできます。'}
            </Typography>
            {editable && (
              <Box sx={{ mt: 2, pt: 2, borderTop: `1px solid ${tokens.color.border}` }}>
                <CsvTools onApplied={() => setCsvVersion((v) => v + 1)} />
              </Box>
            )}
          </Surface>
        </Reveal>

        <Reveal delay={0.04}>
          <Stack direction="row" role="group" aria-label="表示する質問" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
            {FILTERS.filter((f) => f.id !== 'pending' || count('pending') > 0 || filter === 'pending').map((f) => {
              const on = f.id === filter;
              return (
                <ButtonBase
                  key={f.id}
                  aria-pressed={on}
                  onClick={() => pick(f.id)}
                  sx={{
                    gap: 0.75, px: 1.5, height: 34, [TOUCH]: { height: 44 }, borderRadius: '10px', fontSize: 13, fontWeight: 650,
                    color: on ? tokens.color.primary : tokens.color.inkSoft, bgcolor: on ? tokens.color.primarySoft : tokens.color.surface,
                    border: `1px solid ${on ? tokens.color.primary : tokens.color.border}`,
                  }}
                >
                  {f.label}
                  <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums', color: on ? tokens.color.primary : tokens.color.muted }}>{count(f.id)}</Box>
                </ButtonBase>
              );
            })}
          </Stack>
          {filter !== 'all' && (
            <Typography variant="caption" component="p" sx={{ mt: 0.75 }}>
              絞り込みは選んだ時点の結果です（入力しても一覧から消えません）。もう一度押すと最新の状態で絞り込み直します。
            </Typography>
          )}
        </Reveal>

        {shown.length === 0 ? (
          <Surface padding={{ xs: 2, md: 3 }}>
            <Typography variant="body2" color="text.secondary">この条件に当てはまる質問はありません。</Typography>
          </Surface>
        ) : (
          REQUIREMENT_CATEGORIES.map((c) => {
            const qs = shown.filter((q) => q.categoryId === c.id);
            if (!qs.length) return null;
            return (
              <Surface key={c.id} component="section" padding={{ xs: 2, md: 3 }} aria-labelledby={`hearing-cat-${c.id}`}>
                <SectionTitle
                  title={<span id={`hearing-cat-${c.id}`}>{c.no}. {c.title}</span>}
                  sub={<Typography variant="caption">{qs.length} 問</Typography>}
                />
                {qs.map((q) => <AnswerRow key={`${q.id}-${csvVersion}`} q={q} editable={editable} />)}
              </Surface>
            );
          })
        )}
      </Stack>
    </Box>
  );
}
