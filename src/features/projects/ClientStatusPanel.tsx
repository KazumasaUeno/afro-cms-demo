import type { ReactNode } from 'react';
import { Box, Button, ButtonBase, Stack, Typography } from '@mui/material';
import { ArrowRight, BadgeCheck, Clock, Eye, MessageSquare, Send, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { DemoState, ISODate, Project } from '@/types';
import { useDemoOptional } from '@/store/DemoStore';
import { DATA_MODE, useRepositories } from '@/repositories';
import { StatusPill, Surface } from '@/components/ui';
import { relativeTime } from '@/services/time';
import { tokens } from '@/theme/tokens';
import { TOUCH } from '@/theme/media';
import { askTitle, clientStatus } from './clientStatus';
import { useProjectRoutes } from './projectRoutes';

/** 11/12 */
const md = (iso: ISODate) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

/** 動きを減らす設定では動かさない */
const REDUCED = '@media (prefers-reduced-motion: reduce)';

/** 40px の白い丸の印（プロジェクト詳細の「お客様の承認」の欄と同じ形） */
function RoundBadge({ color, bg = tokens.color.surface, children }: { color: string; bg?: string; children: ReactNode }) {
  return (
    <Box aria-hidden sx={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', bgcolor: bg, color }}>
      {children}
    </Box>
  );
}

function SectionLabel({ id, children, count }: { id: string; children: ReactNode; count?: number }) {
  return (
    <Stack direction="row" spacing={0.75} alignItems="baseline" sx={{ mb: 1 }}>
      <Typography id={id} variant="body2" component="h3" sx={{ fontWeight: 700, color: tokens.color.inkSoft }}>{children}</Typography>
      {count !== undefined && count > 0 && (
        <Typography component="span" variant="caption" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: tokens.color.muted }}>{count} 件</Typography>
      )}
    </Stack>
  );
}

/**
 * プロジェクト詳細の「お客様の対応状況」。いまお願いしていること → 済んだこと → 次にお願いすること の順に、
 * 今の状況だけが読めるようにする（先の節目の説明文は出さない。2026-11-12 ユーザー決定）。
 * ヒアリングはアフロが入力するので出さない（2026-11-10 決定）。どの案件でも出す（案件ごとの制作データ。0.29.x）。
 * プロジェクト詳細（管理者画面・開発者画面の両方）で使う。
 * 見た目は上の「制作の8段階」の承認の欄に揃える（お願い中＝warningSoft のカード、済んだこと＝日付つきのタイムライン。0.42.0）。
 */
export function ClientStatusPanel({ project, view }: { project: Project; /** live の案件の state（Firestore の要件・承認から作る。2026-11-26）。省略時は DemoStore */ view?: DemoState }) {
  const demo = useDemoOptional();
  const state = view ?? demo?.state;
  if (!state) throw new Error('ClientStatusPanel needs view or DemoStoreProvider');
  const { projects } = useRepositories();
  const navigate = useNavigate();
  // 行き先はいまのエリアの中（開発者画面に無い画面の行は押せない表示にする。0.26.0）
  const routes = useProjectRoutes();
  const s = clientStatus(state, project);

  const go = (to: string) => {
    projects.select(project.id);
    navigate(to);
  };

  // いまお願いしていること（節目 ＋ 公開承認）
  const asks: { key: string; title: string; requested: string; detail: string; to: string | null }[] = s.waiting.map((a) => {
    const parts: string[] = [];
    if (a.progress) parts.push(`お客様のチェック ${a.progress.done} / ${a.progress.total} 項目`);
    return {
      key: a.key, title: askTitle(a),
      requested: a.requestedAt ? `${md(a.requestedAt)} に依頼${a.key === 'requirements' ? '（AI 分析済み）' : ''}` : '',
      detail: parts.join('・'), to: routes.approval[a.key],
    };
  });
  if (s.publishWaiting > 0) {
    asks.push({ key: 'publish', title: `ページ・お知らせの公開承認 ${s.publishWaiting} 件`, requested: '', detail: '', to: routes.cms });
  }
  const waiting = s.waitingCount > 0;

  return (
    <Surface component="section" aria-labelledby="client-status-title">
      {/* 見出し（状態の色の丸 ＋ 件数） */}
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
        <RoundBadge color={waiting ? tokens.color.warningInk : tokens.color.successInk} bg={waiting ? tokens.color.warningSoft : tokens.color.successSoft}>
          <UserRound size={19} />
        </RoundBadge>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
            <Typography id="client-status-title" variant="h5" component="h2" sx={{ minWidth: 0 }}>お客様の対応状況</Typography>
            {waiting
              ? <StatusPill tone="warning">対応待ち {s.waitingCount}</StatusPill>
              : <StatusPill tone="success">対応待ちなし</StatusPill>}
          </Stack>
          <Typography variant="caption" sx={{ display: 'block', mt: 0.25, overflowWrap: 'anywhere' }}>
            {project.clientName}・最後の操作 {s.lastClientAt ? relativeTime(s.lastClientAt) : 'まだありません'}
          </Typography>
        </Box>
      </Stack>
      {/* お客様への画面説明（承認は記録しない）と相談チャット（0.38.0。2026-11-16 ユーザー指示）。demo だけ（live の router に無い）。
          相談チャットは開発者画面だけ（管理者画面は 2026-11-17 ユーザー指示で外した） */}
      {DATA_MODE === 'demo' && <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2.5 }}>
        <Button size="small" variant="outlined" startIcon={<Eye size={15} />} onClick={() => go(routes.clientApprovals)}>お客様の確認・承認画面を見る</Button>
        {routes.dev && <Button size="small" variant="outlined" startIcon={<MessageSquare size={15} />} onClick={() => go(routes.chat)}>相談チャット</Button>}
      </Stack>}

      {/* いまお願いしていること（warningSoft のカード） */}
      <Box component="section" aria-labelledby="client-status-now" sx={{ mb: 2.5 }}>
        <SectionLabel id="client-status-now" count={asks.length}>いまお願いしていること</SectionLabel>
        {asks.length === 0 ? (
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ px: 2, py: 1.5, borderRadius: 3, bgcolor: tokens.color.surfaceMuted }}>
            <RoundBadge color={tokens.color.successInk}><BadgeCheck size={20} /></RoundBadge>
            <Typography variant="body2" sx={{ color: tokens.color.inkSoft, fontWeight: 600 }}>いまお願いしていることはありません</Typography>
          </Stack>
        ) : (
          <Box component="ul" aria-labelledby="client-status-now" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1 }}>
            {asks.map((a) => {
              const body = (
                <>
                  <RoundBadge color={tokens.color.warningInk}><Clock size={18} /></RoundBadge>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: tokens.color.warningInk, overflowWrap: 'anywhere' }}>{a.title}</Typography>
                    {(a.requested || a.detail) && (
                      <Typography variant="caption" component="p" sx={{ mt: 0.25, color: tokens.color.warningInk, fontVariantNumeric: 'tabular-nums' }}>
                        {a.requested && <Box component="span" sx={{ fontWeight: 750 }}>{a.requested}</Box>}
                        {a.requested && a.detail && '・'}
                        {a.detail}
                      </Typography>
                    )}
                  </Box>
                </>
              );
              const card = { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', textAlign: 'left', gap: 1.5, px: 2, py: 1.5, minHeight: 64, borderRadius: 3, bgcolor: tokens.color.warningSoft, color: tokens.color.warningInk } as const;
              const label = [a.title, a.requested, a.detail].filter(Boolean).join('・');
              return (
                <Box component="li" key={a.key}>
                  {a.to ? (
                    <ButtonBase
                      onClick={() => go(a.to!)}
                      aria-label={`${label}。開く`}
                      sx={{
                        ...card,
                        transition: `box-shadow .2s ${tokens.motion.easeCss}`,
                        '&:hover, &.Mui-focusVisible': { boxShadow: tokens.shadow.sm },
                        '&.Mui-focusVisible': { outline: `2px solid ${tokens.color.warningInk}`, outlineOffset: 2 },
                        '&:hover .go': { opacity: 1, transform: 'translateX(2px)' },
                        [REDUCED]: { transition: 'none', '& .go': { transition: 'none' }, '&:hover .go': { transform: 'none' } },
                      }}
                    >
                      {body}
                      <Stack className="go" direction="row" spacing={0.5} alignItems="center" sx={{ opacity: 0.75, flexShrink: 0, transition: `opacity .2s, transform .2s ${tokens.motion.easeCss}`, [TOUCH]: { opacity: 1 } }}>
                        <Typography variant="caption" sx={{ color: 'inherit', fontWeight: 700 }}>開く</Typography>
                        <ArrowRight size={16} />
                      </Stack>
                    </ButtonBase>
                  ) : (
                    <Box sx={card}>{body}</Box>
                  )}
                </Box>
              );
            })}
          </Box>
        )}
      </Box>

      {/* 済んだこと（縦のタイムライン。日付を successInk で大きく） */}
      <Box component="section" aria-labelledby="client-status-done">
        <SectionLabel id="client-status-done" count={s.done.length}>済んだこと</SectionLabel>
        {s.done.length === 0 ? (
          <Typography variant="body2" sx={{ color: tokens.color.muted, py: 0.5 }}>まだありません</Typography>
        ) : (
          <Box
            component="ol"
            aria-labelledby="client-status-done"
            sx={{
              listStyle: 'none', m: 0, p: 0, position: 'relative',
              // 点をつなぐ縦の線（最初の点の中心〜最後の点の中心）
              '&::before': { content: '""', position: 'absolute', left: 11, top: 18, bottom: 18, width: 2, borderRadius: 1, bgcolor: tokens.color.successLine },
            }}
          >
            {s.done.map((a) => {
              const verb = a.key === 'quality' ? '完了' : '承認';
              return (
                <Box component="li" key={a.key} sx={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 1.5, py: 0.75, minHeight: 36 }}>
                  <Box aria-hidden sx={{ position: 'relative', zIndex: 1, width: 24, height: 24, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', bgcolor: tokens.color.successSoft, color: tokens.color.successInk, boxShadow: `0 0 0 3px ${tokens.color.surface}` }}>
                    <BadgeCheck size={14} />
                  </Box>
                  <Typography variant="body2" sx={{ flex: 1, minWidth: 0, fontWeight: 600, overflowWrap: 'anywhere' }}>{a.title}</Typography>
                  <Typography component="span" sx={{ flexShrink: 0, color: tokens.color.successInk, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    {a.approvedAt && <Box component="span" sx={{ fontSize: 16, fontWeight: 750 }}>{md(a.approvedAt)} </Box>}
                    <Box component="span" sx={{ fontSize: 12, fontWeight: 650 }}>{verb}</Box>
                  </Typography>
                </Box>
              );
            })}
          </Box>
        )}
      </Box>

      {/* 次にお願いすること（タイトルだけ。控えめなチップ） */}
      {s.next && (
        <Box sx={{ pt: 2, mt: 2, borderTop: `1px solid ${tokens.color.border}` }}>
          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, maxWidth: '100%', px: 1.5, py: 0.75, borderRadius: `${tokens.radius.lg}px`, bgcolor: tokens.color.surfaceMuted, color: tokens.color.inkSoft }}>
            <Send size={14} style={{ flexShrink: 0 }} aria-hidden />
            <Typography variant="caption" sx={{ color: 'inherit', minWidth: 0 }}>
              次にお願いすること: <Box component="span" sx={{ fontWeight: 700, color: tokens.color.ink }}>{askTitle(s.next)}</Box>
            </Typography>
          </Box>
        </Box>
      )}
    </Surface>
  );
}
