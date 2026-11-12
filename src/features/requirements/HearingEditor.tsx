import { Box, Button, ButtonBase, LinearProgress, Portal, Stack, Switch, Typography, useMediaQuery, useTheme } from '@mui/material';
import { motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Check, FileSpreadsheet, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { REQUIREMENT_CATEGORIES, REQUIREMENT_QUESTIONS } from '@/data/requirements';
import { useCurrentRequirements, useRepositories } from '@/repositories';
import { useWrite } from '@/hooks/useWrite';
import { StatusPill, Surface } from '@/components/ui';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { formatDateTime } from '@/services/time';
import { tokens } from '@/theme/tokens';
import { LANDSCAPE_PHONE, TOUCH } from '@/theme/media';
import type { AnswerValue, RequirementCategory, RequirementQuestion } from '@/types';
import { AnswerInput } from './AnswerInput';
import { AnswerStatus, ConfirmAnswerButton } from './AnswerStatus';
import { CompetitorField } from './CompetitorField';
import { CsvTools } from './CsvTools';
import { SaveAnswersButton } from './SaveAnswersButton';
import { questionStatus } from './assignment';
import { hostnameOf } from './buildProposal';
import { REQUIRED_FOR_ANALYSIS, analysisBlockers, answerText, isAnswered, validateAnswer, validateUrl } from './validation';

/**
 * ヒアリングの入力画面（1 画面。2026-11-11 決定 B）。
 * 左にカテゴリの一覧（スマホは上部の横スクロールのタブ）と進み具合、右にそのカテゴリの質問を順に並べてその場で入力する。
 * 前・次のカテゴリ、「未回答だけ表示」、CSV の一括入力、AI 分析の実行（onAnalyze があるとき）をこの画面にまとめる。
 * 値は store の requirements から毎回導く（専用の状態はカテゴリの選択と絞り込みだけ）。
 * editable=false（要件定義書の承認後）は閲覧のみ。
 */

const questionsOf = (c: RequirementCategory) => REQUIREMENT_QUESTIONS.filter((q) => q.categoryId === c.id);

const ISSUE_SUGGESTIONS = ['スマホで見づらい', '問い合わせが少ない', '更新が大変', 'デザインが古い', '表示が遅い'];

/** 入力するアフロの担当者向けの補足（主要な質問だけ） */
function hintOf(id: string, answers: Record<string, AnswerValue>): string {
  const url = typeof answers['q-url'] === 'string' ? answers['q-url'] : '';
  const host = url && !validateUrl(url) ? hostnameOf(url) : '';
  switch (id) {
    case 'q-url': return 'お客様の現在のサイトの URL。AI 分析でこのサイトを巡回します。';
    case 'q-purpose': return `${host ? `${host} のリニューアルについて、` : ''}ヒアリングで伺ったきっかけを選びます（複数選択できます）。`;
    case 'q-issue': return 'お客様が話した言葉のまま入れると、提案書の「ご回答いただいた課題」にそのまま載ります。';
    case 'q-competitor': return '比較に使う競合サイト。無ければ空欄のままで AI 分析できます。';
    case 'q-improve': return '特に改善したいポイントを選びます。提案の優先度に反映します。';
    default: return '';
  }
}

function competitorError(value: AnswerValue | undefined): string | null {
  if (!Array.isArray(value)) return null;
  const bad = value.find((u) => validateUrl(u, false));
  return bad ? `「${bad}」: ${validateUrl(bad, false)}` : null;
}

/** カテゴリの進み具合の印（答え終えたら緑のチェック、それ以外は進捗リング） */
function CategoryMark({ done, total }: { done: number; total: number }) {
  const pct = total ? done / total : 0;
  if (total > 0 && done === total) {
    return (
      <Box component="span" sx={{ width: 22, height: 22, borderRadius: '50%', display: 'grid', placeItems: 'center', flexShrink: 0, bgcolor: tokens.color.success, color: tokens.color.onSuccess }}>
        <Check size={13} strokeWidth={3} />
      </Box>
    );
  }
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden style={{ flexShrink: 0 }}>
      <circle cx="11" cy="11" r="9" fill="none" stroke={tokens.color.border} strokeWidth="2.5" />
      <circle cx="11" cy="11" r="9" fill="none" stroke={tokens.color.primary} strokeWidth="2.5" strokeLinecap="round"
        strokeDasharray={2 * Math.PI * 9} strokeDashoffset={2 * Math.PI * 9 * (1 - pct)} transform="rotate(-90 11 11)" />
    </svg>
  );
}

/** missing: AI分析を押したのに足りない「AI分析に必要」の質問。入力されると外れる */
function QuestionBlock({ q, editable, missing }: { q: RequirementQuestion; editable: boolean; missing?: boolean }) {
  const { requirements } = useRepositories();
  const { data: req } = useCurrentRequirements();
  const value = req.answers[q.id];
  const answered = isAnswered(value);
  const s = questionStatus(q, req);
  const hint = hintOf(q.id, req.answers);
  const write = useWrite();
  const setValue = (v: AnswerValue) => void write(requirements.setAnswer(req.projectId, q.id, v, 'afro'));
  const compErr = q.id === 'q-competitor' ? competitorError(value) : null;

  return (
    <Box
      component="li"
      data-missing={missing ? 'true' : undefined}
      sx={[
        { py: { xs: 2, md: 2.5 }, borderTop: `1px solid ${tokens.color.border}`, '&:first-of-type': { borderTop: 'none', pt: 0.5 } },
        // 足りない質問は赤い枠と面で示す（色だけに頼らず下に文言も出す）
        !!missing && { px: 1.5, my: 0.5, border: `2px solid ${tokens.color.danger}`, borderRadius: `${tokens.radius.md}px`, bgcolor: tokens.color.dangerSoft, '&:first-of-type': { pt: 1.5, borderTop: `2px solid ${tokens.color.danger}` } },
      ]}
    >
      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.75, flexWrap: 'wrap', rowGap: 0.75 }}>
        <StatusPill tone={q.priority === 'A' ? 'primary' : 'neutral'} dot={false}>{q.priority === 'A' ? 'A 必須' : 'B 任意'}</StatusPill>
        {q.featured && <StatusPill tone="accent" dot={false} icon={<Sparkles size={12} />}>{q.id === 'q-competitor' ? 'AI分析で使用' : 'AI分析に必要'}</StatusPill>}
        <AnswerStatus question={q} />
        <ConfirmAnswerButton question={q} />
      </Stack>
      <Typography variant="h6" component={editable ? 'label' : 'h3'} htmlFor={editable ? `answer-${q.id}` : undefined} sx={{ display: 'block', mb: hint ? 0.5 : 1.25 }}>
        {q.text}
      </Typography>
      {missing && (
        <Typography role="alert" variant="body2" sx={{ color: tokens.color.dangerInk, fontWeight: 700, mb: 1 }}>
          AI分析に必要です。入力してください
        </Typography>
      )}
      {hint && <Typography variant="body2" sx={{ color: tokens.color.muted, mb: 1.25, maxWidth: 640 }}>{hint}</Typography>}

      {!editable ? (
        <Typography variant="body2" sx={{ px: 1.5, py: 1, borderRadius: 2, bgcolor: tokens.color.surfaceMuted, color: answered ? tokens.color.ink : tokens.color.muted, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {answered ? answerText(value) : '未回答'}
        </Typography>
      ) : q.id === 'q-competitor' ? (
        <>
          <CompetitorField by="afro" />
          {compErr && <Typography role="alert" variant="caption" sx={{ display: 'block', mt: 0.5, color: tokens.color.danger, overflowWrap: 'anywhere' }}>{compErr}</Typography>}
        </>
      ) : (
        <AnswerInput question={q} value={value} onChange={setValue} error={answered ? validateAnswer(q, value, false) : null} />
      )}

      {editable && q.id === 'q-issue' && (
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75, mt: 0.25 }}>
          {ISSUE_SUGGESTIONS.map((sug) => (
            <ButtonBase
              key={sug}
              onClick={() => {
                const cur = typeof value === 'string' ? value : '';
                setValue(cur.includes(sug) ? cur : cur ? `${cur}、${sug}` : sug);
              }}
              sx={{ px: 1.25, height: 32, [TOUCH]: { height: 44 }, borderRadius: '9px', fontSize: 12.5, fontWeight: 600, color: tokens.color.muted, border: `1px dashed ${tokens.color.borderStrong}`, '&:hover': { color: tokens.color.primary, borderColor: tokens.color.primary } }}
            >
              + {sug}
            </ButtonBase>
          ))}
        </Stack>
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

interface Props {
  editable: boolean;
  /** AI 分析を実行する（AI 分析の前だけ渡す） */
  onAnalyze?: () => void;
}

export function HearingEditor({ editable, onAnalyze }: Props) {
  const { data: req } = useCurrentRequirements();
  const answers = req.answers;
  const reduced = useReducedMotion();
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up('md'));
  const panelRef = useRef<HTMLHeadingElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  // 下部固定バー（Portal の中身は 1 回あとの描画で付くため、ref ではなく state で受け取る）
  const [bar, setBar] = useState<HTMLDivElement | null>(null);

  // 初めは、まだ答えていない質問がある最初のカテゴリ（AI 分析に必要な質問を優先）
  const [catId, setCatId] = useState(() => {
    const firstKey = REQUIRED_FOR_ANALYSIS.find((q) => validateAnswer(q, answers[q.id]));
    const firstOpen = REQUIREMENT_QUESTIONS.find((q) => !isAnswered(answers[q.id]));
    return (firstKey ?? firstOpen ?? REQUIREMENT_QUESTIONS[0]).categoryId;
  });
  // 「未回答だけ表示」: 押した時点の未回答を固定する（入力した質問が入力の途中で消えないように）
  const [unansweredOnly, setUnansweredOnly] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  // CSV を取り込んだら、入力途中の値を手元に持つ欄（競合サイト）を読み直す
  const [csvVersion, setCsvVersion] = useState(0);

  const isShown = (q: RequirementQuestion) => !unansweredOnly || picked.includes(q.id);
  const navCats = REQUIREMENT_CATEGORIES.filter((c) => questionsOf(c).some(isShown));
  const category = REQUIREMENT_CATEGORIES.find((c) => c.id === catId) ?? REQUIREMENT_CATEGORIES[0];
  const navIndex = navCats.findIndex((c) => c.id === category.id);
  const prevCat = navIndex > 0 ? navCats[navIndex - 1] : navIndex === -1 ? [...navCats].reverse().find((c) => c.no < category.no) : undefined;
  const nextCat = navIndex >= 0 ? navCats[navIndex + 1] : navCats.find((c) => c.no > category.no);
  const shownQs = questionsOf(category).filter(isShown);

  const remaining = REQUIREMENT_QUESTIONS.filter((q) => !isAnswered(answers[q.id])).length;
  const total = REQUIREMENT_QUESTIONS.length;
  const blockers = analysisBlockers(answers);
  const canAnalyze = blockers.length === 0;

  const go = (c: RequirementCategory, focus = true) => {
    setCatId(c.id);
    if (!focus) return;
    // カテゴリを変えたら質問の先頭へ（見出しにフォーカスを移す）
    window.requestAnimationFrame(() => {
      const el = panelRef.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      const top = el.getBoundingClientRect().top + window.scrollY - tokens.layout.topbar - 16;
      if (el.getBoundingClientRect().top < tokens.layout.topbar) window.scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' });
    });
  };

  // スマホのタブ: 選んだカテゴリを見える位置へ
  useEffect(() => {
    const el = tabsRef.current?.querySelector<HTMLElement>(`[data-cat="${category.id}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduced ? 'auto' : 'smooth' });
  }, [category.id, reduced]);

  // スマホの下部固定バーがある間は、トースト（useToast）をバーの上に出す（CSV 取り込みの通知がバーを隠さないように）。
  // バーの上端から画面下端までの距離を --toast-bottom に入れ、バーが消えたら戻す（他の画面の位置は変えない）
  useEffect(() => {
    if (wide || !bar) return;
    const root = document.documentElement;
    const update = () => root.style.setProperty('--toast-bottom', `${Math.max(0, window.innerHeight - bar.getBoundingClientRect().top) + 10}px`);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(bar);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
      root.style.removeProperty('--toast-bottom');
    };
  }, [wide, bar]);

  const toggleUnanswered = (on: boolean) => {
    setUnansweredOnly(on);
    if (!on) return;
    const ids = REQUIREMENT_QUESTIONS.filter((q) => !isAnswered(answers[q.id])).map((q) => q.id);
    setPicked(ids);
    // いまのカテゴリに未回答が無ければ、未回答のある最初のカテゴリへ
    const first = REQUIREMENT_QUESTIONS.find((q) => ids.includes(q.id) && q.categoryId === category.id) ?? REQUIREMENT_QUESTIONS.find((q) => ids.includes(q.id));
    if (first && first.categoryId !== category.id) setCatId(first.categoryId);
  };

  // AI分析は常に押せる。足りない質問があれば実行せず、赤く示して最初の足りない質問のカテゴリへ移る（2026-11-11 ユーザー指示）
  const [attempted, setAttempted] = useState(false);
  const analyze = () => {
    if (canAnalyze) { onAnalyze?.(); return; }
    setAttempted(true);
    const first = blockers[0];
    const c = first && REQUIREMENT_CATEGORIES.find((x) => x.id === first.categoryId);
    if (c) { if (unansweredOnly && !picked.includes(first.id)) setUnansweredOnly(false); go(c); }
  };
  const missingIds = attempted ? new Set(blockers.map((b) => b.id)) : new Set<string>();

  const progress = (
    <Box>
      <Stack direction="row" alignItems="baseline" justifyContent="space-between" spacing={1} sx={{ mb: 0.75 }}>
        <Typography sx={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
          {remaining === 0 ? 'すべて回答済み' : <>残り <Box component="span" sx={{ fontSize: 20 }}>{remaining}</Box> 問</>}
        </Typography>
        <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums' }}>回答済み {total - remaining}</Typography>
      </Stack>
      <LinearProgress variant="determinate" value={((total - remaining) / total) * 100} aria-label="ヒアリングの進み具合" aria-valuetext={remaining === 0 ? 'すべて回答済み' : `残り ${remaining} 問`} />
    </Box>
  );

  const unansweredToggle = (
    <Stack component="label" direction="row" alignItems="center" spacing={0.5} sx={{ cursor: 'pointer', userSelect: 'none', minHeight: 44 }}>
      <Switch size="small" checked={unansweredOnly} onChange={(e) => toggleUnanswered(e.target.checked)} inputProps={{ 'aria-label': '未回答だけ表示' }} />
      <Typography sx={{ fontSize: 13, fontWeight: 600 }}>未回答だけ表示</Typography>
    </Stack>
  );

  const categoryList = (
    <Stack component="ul" spacing={0.25} aria-label="カテゴリ" sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {REQUIREMENT_CATEGORIES.map((c) => {
        const qs = questionsOf(c);
        const done = qs.filter((q) => isAnswered(answers[q.id])).length;
        const current = c.id === category.id;
        const hidden = unansweredOnly && !navCats.includes(c);
        return (
          <Box component="li" key={c.id}>
            <ButtonBase
              onClick={() => go(c)}
              aria-current={current ? 'true' : undefined}
              aria-label={`${c.no}. ${c.title}（${done}/${qs.length} 問 回答済み${done === qs.length ? '・完了' : ''}）`}
              sx={{
                width: '100%', justifyContent: 'flex-start', gap: 1.25, px: 1.25, py: 0.9, minHeight: 40, [TOUCH]: { minHeight: 44 }, borderRadius: '12px', textAlign: 'left',
                bgcolor: current ? tokens.color.secondaryContainer : 'transparent',
                color: current ? tokens.color.onSecondaryContainer : tokens.color.ink,
                opacity: hidden ? 0.6 : 1,
                '&:hover': { bgcolor: current ? tokens.color.secondaryContainer : tokens.color.bgSubtle },
              }}
            >
              <CategoryMark done={done} total={qs.length} />
              <Typography component="span" sx={{ fontSize: 13, fontWeight: current ? 700 : 600, flex: 1, minWidth: 0, lineHeight: 1.4, color: 'inherit' }}>
                <Box component="span" sx={{ fontWeight: 700, mr: 0.75, fontVariantNumeric: 'tabular-nums', opacity: 0.8 }}>{String(c.no).padStart(2, '0')}</Box>
                {c.title}
              </Typography>
              <Typography component="span" sx={{ fontSize: 12, fontWeight: 600, color: 'inherit', fontVariantNumeric: 'tabular-nums' }}>{done}/{qs.length}</Typography>
            </ButtonBase>
          </Box>
        );
      })}
    </Stack>
  );

  const categoryTabs = (
    <Box
      ref={tabsRef}
      role="group"
      aria-label="カテゴリ"
      sx={{ display: 'flex', gap: 0.75, overflowX: 'auto', mx: { xs: -2, sm: -3 }, px: { xs: 2, sm: 3 }, pb: 0.5, scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}
    >
      {REQUIREMENT_CATEGORIES.map((c) => {
        const qs = questionsOf(c);
        const done = qs.filter((q) => isAnswered(answers[q.id])).length;
        const current = c.id === category.id;
        const complete = done === qs.length;
        return (
          <ButtonBase
            key={c.id}
            data-cat={c.id}
            aria-current={current ? 'true' : undefined}
            onClick={() => go(c, false)}
            aria-label={`${c.no}. ${c.title}（${done}/${qs.length} 問 回答済み${complete ? '・完了' : ''}）`}
            sx={{
              flexShrink: 0, gap: 0.75, px: 1.5, height: 44, borderRadius: '12px', fontSize: 13, fontWeight: 650, whiteSpace: 'nowrap',
              border: `1px solid ${current ? tokens.color.primary : tokens.color.border}`,
              bgcolor: current ? tokens.color.secondaryContainer : tokens.color.surface,
              color: current ? tokens.color.onSecondaryContainer : tokens.color.ink,
            }}
          >
            {complete ? <Check size={14} strokeWidth={3} color={tokens.color.success} /> : null}
            {c.no}. {c.title}
            <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, opacity: 0.85 }}>{done}/{qs.length}</Box>
          </ButtonBase>
        );
      })}
    </Box>
  );

  const analysisPanel = onAnalyze && (
    <Surface padding={{ xs: 2, md: 2.5 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
        <Sparkles size={17} color={tokens.color.accent} />
        <Typography variant="h4" component="h2">AI分析</Typography>
      </Stack>
      <Typography variant="caption" component="p" sx={{ mb: 1.5 }}>
        「AI分析に必要」の質問がそろうと、現行サイトを分析して改善提案書（要件定義書）のたたき台を作ります。ほかの質問は後からでも入力できます。
      </Typography>
      <Button
        fullWidth
        variant="contained"
        onClick={analyze}
        endIcon={<Sparkles size={16} />}
        sx={{ background: tokens.aiGradient, color: '#fff', '&:hover': { background: tokens.aiGradient, filter: 'brightness(1.06)' } }}
      >
        AI分析を実行
      </Button>
      {!canAnalyze && (
        <Box sx={{ mt: 1.25 }}>
          <Typography variant="caption" component="p" sx={{ color: attempted ? tokens.color.dangerInk : tokens.color.ink, fontWeight: 600 }}>
            AI分析に必要な質問が {blockers.length} 問残っています
          </Typography>
          <Stack component="ul" sx={{ listStyle: 'none', m: 0, p: 0, mt: 0.5 }}>
            {blockers.map((q) => {
              const c = REQUIREMENT_CATEGORIES.find((x) => x.id === q.categoryId);
              if (!c) return null; // データの不整合でカテゴリが無い質問は一覧に出さない（開く先が無いため）
              return (
                <Box component="li" key={q.id}>
                  <ButtonBase
                    onClick={() => { if (unansweredOnly && !picked.includes(q.id)) setUnansweredOnly(false); go(c); }}
                    sx={{ justifyContent: 'flex-start', textAlign: 'left', width: '100%', py: 0.5, minHeight: 32, [TOUCH]: { minHeight: 44 }, fontSize: 12.5, fontWeight: 600, color: tokens.color.primary, borderRadius: '8px', '&:hover': { textDecoration: 'underline' } }}
                  >
                    {c.no}. {q.text}
                  </ButtonBase>
                </Box>
              );
            })}
          </Stack>
        </Box>
      )}
    </Surface>
  );

  const csvPanel = editable && (
    <Surface padding={{ xs: 2, md: 2.5 }} id="hearing-csv" sx={{ scrollMarginTop: tokens.layout.topbar + 16 }}>
      <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 0.5 }}>
        <FileSpreadsheet size={18} color={tokens.color.primary} />
        <Typography variant="h4" component="h2">CSV でまとめて入力</Typography>
      </Stack>
      <Typography variant="caption" component="p" sx={{ mb: 1.5 }}>ヒアリングシートを Excel で作っている場合は、全問をまとめて取り込めます。</Typography>
      <CsvTools dense={wide} onApplied={() => setCsvVersion((v) => v + 1)} />
    </Surface>
  );

  const navButtons = (
    <>
      <Button variant="text" startIcon={<ArrowLeft size={16} />} onClick={() => prevCat && go(prevCat)} disabled={!prevCat} aria-label={prevCat ? `前のカテゴリ: ${prevCat.title}` : '前のカテゴリ'}>
        {wide ? '前のカテゴリ' : '前へ'}
      </Button>
      <Box sx={{ flex: 1, minWidth: 8, display: 'flex', justifyContent: 'center' }}>
        {editable && <SaveAnswersButton compact={!wide} />}
      </Box>
      <Button variant={nextCat ? 'contained' : 'outlined'} endIcon={<ArrowRight size={16} />} onClick={() => nextCat && go(nextCat)} disabled={!nextCat} aria-label={nextCat ? `次のカテゴリ: ${nextCat.title}` : '次のカテゴリ'}>
        {wide ? '次のカテゴリ' : '次へ'}
      </Button>
      {/* 「次のカテゴリ」の隣にも AI分析を置く（2026-11-11 ユーザー指示）。足りない質問の一覧は右の AI分析の欄に出す */}
      {onAnalyze && (
        <Button
          variant="contained"
          size={wide ? 'medium' : 'small'}
          onClick={analyze}
          endIcon={<Sparkles size={16} />}
          aria-label={canAnalyze ? 'AI分析を実行' : `AI分析を実行（必要な質問があと ${blockers.length} 問。押すと足りない質問を赤く示します）`}
          sx={{ ml: 1, flexShrink: 0, background: tokens.aiGradient, color: '#fff', '&:hover': { background: tokens.aiGradient, filter: 'brightness(1.06)' } }}
        >
          {wide ? 'AI分析を実行' : 'AI分析'}
        </Button>
      )}
    </>
  );

  const questionPanel = (
    <Surface padding={0} component="section" aria-labelledby="hearing-cat-title">
      <Box sx={{ px: { xs: 2, md: 3 }, pt: { xs: 2, md: 2.5 }, pb: 1 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
          <Typography variant="overline" sx={{ color: tokens.color.muted }}>カテゴリ {REQUIREMENT_CATEGORIES.indexOf(category) + 1} / {REQUIREMENT_CATEGORIES.length}</Typography>
          {wide && unansweredToggle}
        </Stack>
        <Typography ref={panelRef} tabIndex={-1} id="hearing-cat-title" variant="h3" component="h2" sx={{ outline: 'none', scrollMarginTop: tokens.layout.topbar + 16 }}>
          {category.title}
        </Typography>
        {/* 凡例（バッジの意味） */}
        {/* A/B はヒアリングで聞く優先度（資料の A/B）。AI分析の条件とは別の印なので、凡例で分けて書く */}
        <Stack direction="row" spacing={1.25} alignItems="center" role="group" aria-label="バッジの意味" sx={{ mt: 1, flexWrap: 'wrap', rowGap: 0.5 }}>
          <Stack direction="row" spacing={0.5} alignItems="center"><StatusPill tone="primary" dot={false}>A 必須</StatusPill><Typography variant="caption">ヒアリングで必ず聞く</Typography></Stack>
          <Stack direction="row" spacing={0.5} alignItems="center"><StatusPill tone="neutral" dot={false}>B 任意</StatusPill><Typography variant="caption">聞けたら入力</Typography></Stack>
          {onAnalyze && <Stack direction="row" spacing={0.5} alignItems="center"><StatusPill tone="accent" dot={false} icon={<Sparkles size={12} />}>AI分析に必要</StatusPill><Typography variant="caption">そろうと AI分析を実行できる（A/B とは別）</Typography></Stack>}
          {onAnalyze && <Stack direction="row" spacing={0.5} alignItems="center"><StatusPill tone="accent" dot={false} icon={<Sparkles size={12} />}>AI分析で使用</StatusPill><Typography variant="caption">空欄でも実行できる。入れると分析に使う</Typography></Stack>}
        </Stack>
      </Box>

      <motion.div
        key={`${category.id}-${csvVersion}`}
        initial={reduced ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: tokens.motion.base, ease: tokens.motion.ease }}
      >
        <Box sx={{ px: { xs: 2, md: 3 }, pt: 1.5, pb: 1 }}>
          {shownQs.length === 0 ? (
            <Typography variant="body2" sx={{ color: tokens.color.muted, py: 2 }}>
              このカテゴリの質問はすべて回答済みです。{nextCat ? '「次」で未回答のあるカテゴリへ進めます。' : ''}
            </Typography>
          ) : (
            <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0 }}>
              {shownQs.map((q) => <QuestionBlock key={q.id} q={q} editable={editable} missing={missingIds.has(q.id)} />)}
            </Box>
          )}
        </Box>
      </motion.div>

      {/* PC: 質問の下に固定（スクロールしても前・次・保存の状態が見える） */}
      {wide && (
        <Stack
          direction="row"
          alignItems="center"
          sx={{
            position: 'sticky', bottom: 0, zIndex: 2, px: 3, py: 1.5, gap: 1, borderTop: `1px solid ${tokens.color.border}`, bgcolor: tokens.color.surfaceMuted,
            borderBottomLeftRadius: `${tokens.radius.lg}px`, borderBottomRightRadius: `${tokens.radius.lg}px`,
          }}
        >
          {navButtons}
        </Stack>
      )}
    </Surface>
  );

  if (wide) {
    return (
      <Box sx={{ display: 'grid', gridTemplateColumns: { md: '260px minmax(0, 1fr)', lg: '300px minmax(0, 1fr)' }, gap: 2.5, alignItems: 'start' }}>
        <Stack spacing={2.5}>
          <Surface padding={2}>
            <Box sx={{ mb: 1.75 }}>{progress}</Box>
            {categoryList}
          </Surface>
          {analysisPanel}
          {csvPanel}
        </Stack>
        {questionPanel}
      </Box>
    );
  }

  // スマホ・タブレット縦: 上に進み具合とカテゴリのタブ、下に前・次と保存の状態を固定
  return (
    <Box>
      <Stack spacing={1.25} sx={{ mb: 2 }}>
        {progress}
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
          {unansweredToggle}
          {csvPanel && (
            <Button size="small" variant="text" startIcon={<FileSpreadsheet size={15} />} onClick={() => document.getElementById('hearing-csv')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' })}>
              CSV
            </Button>
          )}
        </Stack>
        {categoryTabs}
      </Stack>
      <Stack spacing={2}>
        {questionPanel}
        {analysisPanel}
        {csvPanel}
      </Stack>
      {/* 下部タブ（64px）の上に固定するバーの分の余白 */}
      <Box aria-hidden sx={{ height: 64, [LANDSCAPE_PHONE]: { height: 72 } }} />
      {/* 親の Reveal・ページ切り替え（transform）の影響を受けないよう body 直下に出す */}
      <Portal>
      <Stack
        ref={setBar}
        direction="row"
        alignItems="center"
        sx={{
          position: 'fixed', left: 0, right: 0, bottom: 'calc(64px + env(safe-area-inset-bottom))', zIndex: 24, px: 1.5, py: 1, gap: 0.5,
          bgcolor: tokens.color.surfaceContainer, borderTop: `1px solid ${tokens.color.border}`,
          [LANDSCAPE_PHONE]: { bottom: 0, pb: 'calc(8px + env(safe-area-inset-bottom))' },
        }}
      >
        {navButtons}
      </Stack>
      </Portal>
    </Box>
  );
}
