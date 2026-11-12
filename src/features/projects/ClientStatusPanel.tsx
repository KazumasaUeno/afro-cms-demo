import type { ReactNode } from 'react';
import { Box, ButtonBase, Stack, Typography } from '@mui/material';
import { ArrowRight, CheckCircle2, CircleDot, Clock, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { ISODate, Project } from '@/types';
import { useDemo } from '@/store/DemoStore';
import { useRepositories } from '@/repositories';
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

const ROW = { width: '100%', justifyContent: 'flex-start', textAlign: 'left', gap: 1.25, py: 1, px: 1, mx: -1, borderRadius: 2, minHeight: 44 } as const;

function SectionLabel({ id, icon, children }: { id: string; icon: ReactNode; children: ReactNode }) {
  return (
    <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.5 }}>
      {icon}
      <Typography id={id} variant="body2" component="h3" sx={{ fontWeight: 700 }}>{children}</Typography>
    </Stack>
  );
}

/**
 * プロジェクト詳細の「お客様の対応状況」。いまお願いしていること → 済んだこと → 次にお願いすること の順に、
 * 今の状況だけが読めるようにする（先の節目の説明文は出さない。2026-11-12 ユーザー決定）。
 * ヒアリングはアフロが入力するので出さない（2026-11-10 決定）。どの案件でも出す（案件ごとの制作データ。0.29.x）。
 * プロジェクト詳細（管理者画面・開発者画面の両方）で使う。
 */
export function ClientStatusPanel({ project }: { project: Project }) {
  const { state } = useDemo();
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
  const asks: { key: string; title: string; detail: string; to: string | null }[] = s.waiting.map((a) => {
    const parts: string[] = [];
    if (a.requestedAt) parts.push(`${md(a.requestedAt)} に依頼${a.key === 'requirements' ? '（AI 分析済み）' : ''}`);
    if (a.progress) parts.push(`お客様のチェック ${a.progress.done} / ${a.progress.total} 項目`);
    return { key: a.key, title: askTitle(a), detail: parts.join('・'), to: routes.approval[a.key] };
  });
  if (s.publishWaiting > 0) {
    asks.push({ key: 'publish', title: `ページ・お知らせの公開承認 ${s.publishWaiting} 件`, detail: '', to: routes.cms });
  }

  return (
    <Surface component="section" aria-labelledby="client-status-title">
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5, flexWrap: 'wrap', rowGap: 0.75 }}>
        <UserRound size={18} color={tokens.color.muted} />
        <Typography id="client-status-title" variant="h5" component="h2" sx={{ flex: 1, minWidth: 0 }}>お客様の対応状況</Typography>
        {s.waitingCount > 0
          ? <StatusPill tone="warning">対応待ち {s.waitingCount}</StatusPill>
          : <StatusPill tone="success">対応待ちなし</StatusPill>}
      </Stack>
      <Typography variant="caption" sx={{ display: 'block', mb: 2 }}>
        {project.clientName}・最後の操作 {s.lastClientAt ? relativeTime(s.lastClientAt) : 'まだありません'}
      </Typography>

      {/* いまお願いしていること */}
      <Box component="section" aria-labelledby="client-status-now" sx={{ mb: 2 }}>
        <SectionLabel id="client-status-now" icon={<Clock size={16} color={tokens.color.warning} />}>いまお願いしていること</SectionLabel>
        {asks.length === 0 ? (
          <Typography variant="body2" sx={{ color: tokens.color.muted, py: 1 }}>いまお願いしていることはありません</Typography>
        ) : (
          <Box component="ul" aria-labelledby="client-status-now" sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {asks.map((a) => {
              const body = (
                <>
                  <CircleDot size={16} color={tokens.color.warning} style={{ flexShrink: 0 }} aria-hidden />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 650 }}>{a.title}</Typography>
                    {a.detail && <Typography variant="caption" sx={{ display: 'block', mt: 0.25 }}>{a.detail}</Typography>}
                  </Box>
                </>
              );
              return (
                <Box component="li" key={a.key}>
                  {a.to ? (
                    <ButtonBase
                      onClick={() => go(a.to!)}
                      aria-label={`${a.title}${a.detail ? `（${a.detail}）` : ''}。開く`}
                      sx={{ ...ROW, '&:hover': { bgcolor: tokens.color.surfaceMuted }, '&:hover .go': { opacity: 1 } }}
                    >
                      {body}
                      <Stack className="go" direction="row" spacing={0.5} alignItems="center" sx={{ opacity: 0.6, color: tokens.color.muted, flexShrink: 0, [TOUCH]: { opacity: 0.9 } }}>
                        <Typography variant="caption" sx={{ color: 'inherit', fontWeight: 600 }}>開く</Typography>
                        <ArrowRight size={16} />
                      </Stack>
                    </ButtonBase>
                  ) : (
                    <Box sx={{ ...ROW, display: 'flex', alignItems: 'center' }}>{body}</Box>
                  )}
                </Box>
              );
            })}
          </Box>
        )}
      </Box>

      {/* 済んだこと（1 行ずつ） */}
      <Box component="section" aria-labelledby="client-status-done">
        <SectionLabel id="client-status-done" icon={<CheckCircle2 size={16} color={tokens.color.success} />}>済んだこと</SectionLabel>
        {s.done.length === 0 ? (
          <Typography variant="body2" sx={{ color: tokens.color.muted, py: 0.5 }}>まだありません</Typography>
        ) : (
          <Box component="ul" aria-labelledby="client-status-done" sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {s.done.map((a) => {
              const verb = a.key === 'quality' ? '完了' : '承認';
              return (
                <Box component="li" key={a.key} sx={{ py: 0.5 }}>
                  <Typography variant="body2">
                    {a.title}
                    <Box component="span" sx={{ color: tokens.color.muted, ml: 1 }}>
                      {a.approvedAt ? `${md(a.approvedAt)} ` : ''}{verb}
                    </Box>
                  </Typography>
                </Box>
              );
            })}
          </Box>
        )}
      </Box>

      {/* 次にお願いすること（タイトルだけ） */}
      {s.next && (
        <Typography variant="caption" sx={{ display: 'block', pt: 1.5, mt: 1.5, borderTop: `1px solid ${tokens.color.border}` }}>
          次にお願いすること: <Box component="span" sx={{ fontWeight: 650, color: tokens.color.ink }}>{askTitle(s.next)}</Box>
        </Typography>
      )}
    </Surface>
  );
}
