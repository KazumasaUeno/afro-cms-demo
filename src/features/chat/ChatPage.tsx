import { Box, Button, ButtonBase, IconButton, Stack, TextField, Tooltip, Typography, useMediaQuery, useTheme } from '@mui/material';
import { ArrowLeft, MessageSquare, Send } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link as RouterLink, useLocation, useSearchParams } from 'react-router-dom';
import type { Project } from '@/types';
import { MemberAvatar, PageHeader, Surface } from '@/components/ui';
import { areaOf } from '@/components/layout/nav';
import { currentProject, useDemo } from '@/store/DemoStore';
import { useDevProjects, useDevUser } from '@/features/dev/useDevUser';
import { useProjectRoutes } from '@/features/projects/projectRoutes';
import { memberById } from '@/data/members';
import { CHAT_LIMITS, chatOf, validateChat } from '@/data/chat';
import { formatDateTime, relativeTime } from '@/services/time';
import { TOUCH } from '@/theme/media';
import { tokens } from '@/theme/tokens';
import { unansweredCount, unansweredOf } from './unanswered';

type Mode = 'portal' | 'admin' | 'dev';

/**
 * 担当者への相談チャット（0.38.0。案件ごとに 1 本の会話）。1 つの部品を画面ごとに出し分ける。
 * - お客様ポータル（/portal/chat）: お客様として送る。相手はその案件の担当者。自分の案件の会話 1 本だけ
 * - 開発者画面（/dev/chat）: 担当の案件の一覧（LINE のトーク一覧の形）→ 選んだ案件の会話。ログイン中の開発者の名前で返信する
 *   （2026-11-17 会議: 案件を 3 つ持つと、どこに相談が来たか分からないため。未対応＝最後がお客様のメッセージ。features/chat/unanswered）
 * - 管理者画面（/chat）は 2026-11-17 に外した（ホームへ転送）。mode 'admin' は従来の 1 本の表示のまま残す
 * デモのため、このブラウザの中だけに保存する（data/chat.ts）。表示の出し分けで、セキュリティ境界ではない
 */
export default function ChatPage() {
  const area = areaOf(useLocation().pathname);
  const mode: Mode = area === 'portal' ? 'portal' : area === 'dev' ? 'dev' : 'admin';
  if (mode === 'dev') return <DevChatInbox />;
  return <SingleChat mode={mode} />;
}

/** お客様ポータル（・旧管理者画面）: 表示中の案件の会話 1 本（0.38.0 からの表示） */
function SingleChat({ mode }: { mode: Exclude<Mode, 'dev'> }) {
  const { state } = useDemo();
  const project = currentProject(state);
  const routes = useProjectRoutes();
  const owner = memberById(project.ownerId);
  return (
    <Box>
      {mode !== 'portal' && (
        <Button component={RouterLink} to={routes.detail(project.id)} size="small" startIcon={<ArrowLeft size={16} />} sx={{ mb: 2, ml: -1 }}>
          プロジェクト詳細
        </Button>
      )}
      <PageHeader
        eyebrow={mode === 'portal' ? 'お客様ポータル' : `プロジェクト・${project.siteName}`}
        icon={<MessageSquare size={15} />}
        title={mode === 'portal' ? '担当者に相談' : '相談チャット'}
        description={mode === 'portal'
          ? `制作についてのご質問・ご相談を、担当の${owner.name}にお送りいただけます。`
          : `${project.clientName} からの相談に返信します。お客様ポータルの「担当者に相談」と同じ会話です。`}
      />
      <Surface sx={{ p: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', maxWidth: 820 }}>
        <ChatThread project={project} mode={mode} logHeight={{ xs: 'calc(100dvh - 500px)', md: 'calc(100dvh - 560px)' }} />
      </Surface>
    </Box>
  );
}

/** 一覧の 1 行の材料（最後のメッセージ・未対応） */
function summaryOf(state: Parameters<typeof chatOf>[0], p: Project) {
  const messages = chatOf(state, p.id);
  const last = messages[messages.length - 1];
  return { project: p, last, unanswered: unansweredOf(state, p.id) };
}

/**
 * 開発者画面の相談（2026-11-17 会議）。担当の案件の一覧 → 会話。
 * - md 以上: 左に一覧、右に選んだ案件の会話（未選択なら表示中の案件、担当外なら一覧の先頭）
 * - md 未満: 一覧 → 会話（戻るで一覧へ）
 * 選んだ案件は URL（?p=案件ID）に持つ。表示中の案件（currentProjectId）は切り替えない（ほかの画面の対象が勝手に変わらないように）
 */
function DevChatInbox() {
  const { state } = useDemo();
  const mine = useDevProjects();
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up('md'));
  const [params, setParams] = useSearchParams();

  // 新しい会話が上（LINE と同じ）。時刻が無い案件は一覧の並び順のまま下へ
  const rows = mine
    .map((p) => summaryOf(state, p))
    .sort((a, b) => (b.last?.at ?? '').localeCompare(a.last?.at ?? ''));
  const count = unansweredCount(state, mine.map((p) => p.id));

  const requested = params.get('p');
  const picked = mine.find((p) => p.id === requested);
  const fallback = mine.find((p) => p.id === currentProject(state).id) ?? rows[0]?.project;
  const selected = picked ?? (wide ? fallback : undefined);

  const open = (id: string) => setParams((prev) => { const n = new URLSearchParams(prev); n.set('p', id); return n; });
  const back = () => setParams((prev) => { const n = new URLSearchParams(prev); n.delete('p'); return n; });

  const header = (
    <PageHeader
      eyebrow="開発者画面"
      icon={<MessageSquare size={15} />}
      title="相談チャット"
      description={count > 0
        ? `担当のプロジェクトのお客様からの相談です。未対応が ${count} 件あります（最後のメッセージがお客様のもの）。`
        : '担当のプロジェクトのお客様からの相談です。未対応はありません。'}
    />
  );

  if (!mine.length) {
    return (
      <Box>
        {header}
        <Surface sx={{ textAlign: 'center', py: 6 }}>
          <Typography variant="body2" color="text.secondary">担当のプロジェクトがありません。</Typography>
        </Surface>
      </Box>
    );
  }

  const list = (
    <Box component="nav" aria-label="担当プロジェクトの相談" sx={{ height: '100%', overflowY: 'auto' }}>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {rows.map(({ project: p, last, unanswered }) => {
          const active = wide && selected?.id === p.id;
          return (
            <Box component="li" key={p.id} sx={{ borderBottom: `1px solid ${tokens.color.border}` }}>
              <ButtonBase
                onClick={() => open(p.id)}
                aria-current={active ? 'true' : undefined}
                aria-label={`${p.clientName}（${p.siteName}）${unanswered ? '・未対応' : '・対応済み'}${last ? `・最後のメッセージ ${relativeTime(last.at)}` : ''}`}
                sx={{
                  width: '100%', textAlign: 'left', display: 'flex', alignItems: 'flex-start', gap: 1.5, px: 2, py: 1.5, minHeight: 64,
                  bgcolor: active ? tokens.color.primarySoft : 'transparent',
                  '&:hover': { bgcolor: active ? tokens.color.primarySoft : tokens.color.surfaceMuted },
                  '&.Mui-focusVisible': { outline: `2px solid ${tokens.color.primary}`, outlineOffset: -2 },
                  [TOUCH]: { minHeight: 72 },
                }}
              >
                <Box sx={{ width: 12, height: 12, mt: 0.75, borderRadius: '4px', bgcolor: p.accent, flexShrink: 0 }} aria-hidden />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Stack direction="row" spacing={1} alignItems="baseline">
                    <Typography variant="body2" sx={{ fontWeight: unanswered ? 750 : 650, flex: 1, minWidth: 0 }} noWrap>{p.clientName}</Typography>
                    <Typography variant="caption" sx={{ flexShrink: 0 }}>{last ? relativeTime(last.at) : ''}</Typography>
                  </Stack>
                  <Typography variant="caption" sx={{ display: 'block', color: tokens.color.muted }} noWrap>{p.siteName}</Typography>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.25 }}>
                    <Typography variant="body2" sx={{ flex: 1, minWidth: 0, color: unanswered ? tokens.color.onSurface : tokens.color.muted }} noWrap>
                      {last ? `${last.side === 'afro' ? `${last.author}: ` : ''}${last.text.replace(/\s+/g, ' ')}` : 'まだメッセージはありません'}
                    </Typography>
                    <StatusBadge unanswered={unanswered} />
                  </Stack>
                </Box>
              </ButtonBase>
            </Box>
          );
        })}
      </Box>
    </Box>
  );

  // md 未満で会話を開いているとき: 一覧へ戻る ＋ 会話だけ
  if (!wide && selected) {
    return (
      <Box>
        <Button onClick={back} size="small" startIcon={<ArrowLeft size={16} />} sx={{ mb: 1.5, ml: -1, [TOUCH]: { minHeight: 44 } }}>
          相談の一覧{count > 0 ? `（未対応 ${count}）` : ''}
        </Button>
        <Surface sx={{ p: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <ChatThread key={selected.id} project={selected} mode="dev" logHeight={{ xs: 'calc(100dvh - 400px)' }} />
        </Surface>
      </Box>
    );
  }

  return (
    <Box>
      {header}
      {wide && selected ? (
        <Surface sx={{ p: 0, overflow: 'hidden', display: 'grid', gridTemplateColumns: 'minmax(260px, 340px) 1fr', maxWidth: 1180 }}>
          <Box sx={{ borderRight: `1px solid ${tokens.color.border}`, minWidth: 0, height: 'calc(100dvh - 340px)', minHeight: 440 }}>{list}</Box>
          <Box sx={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <ChatThread key={selected.id} project={selected} mode="dev" logHeight={{ md: 'calc(100dvh - 340px - 170px)' }} />
          </Box>
        </Surface>
      ) : (
        <Surface sx={{ p: 0, overflow: 'hidden' }}>{list}</Surface>
      )}
    </Box>
  );
}

/** 未対応（赤）／対応済み（控えめ） */
function StatusBadge({ unanswered }: { unanswered: boolean }) {
  return unanswered ? (
    <Box component="span" sx={{ flexShrink: 0, px: 1, py: 0.25, borderRadius: 999, bgcolor: tokens.color.danger, color: tokens.color.onDanger, fontSize: 12, fontWeight: 700, lineHeight: 1.5 }}>
      未対応
    </Box>
  ) : (
    <Typography component="span" variant="caption" sx={{ flexShrink: 0, color: tokens.color.muted }}>対応済み</Typography>
  );
}

/**
 * 1 案件の会話（相手の表示・メッセージ・入力）。
 * 開発者画面は送り先の案件を明示して送る（sendChat の projectId。表示中の案件を切り替えないため。2026-11-17 会議）
 */
function ChatThread({ project, mode, logHeight }: { project: Project; mode: Mode; logHeight: Record<string, string> }) {
  const { state, dispatch } = useDemo();
  const routes = useProjectRoutes();
  const me = useDevUser();
  const mySide = mode === 'portal' ? 'client' : 'afro';
  const owner = memberById(project.ownerId);
  const messages = chatOf(state, project.id);
  const unanswered = mode === 'dev' && unansweredOf(state, project.id);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 新しいメッセージが届いたら（送ったら）いちばん下まで送る
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, project.id]);

  const send = () => {
    const err = validateChat(text);
    setError(err);
    if (err) return;
    dispatch({ type: 'sendChat', text, by: mySide, ...(mode === 'dev' ? { devBy: me.id, projectId: project.id } : {}) });
    setText('');
  };

  // Enter で送信、Shift+Enter で改行。日本語の変換中の Enter では送らない
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  const length = text.trim().length;
  const over = length > CHAT_LIMITS.text;

  return (
    <>
      {/* 会話の相手 */}
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ px: 2, py: 1.5, borderBottom: `1px solid ${tokens.color.border}` }}>
        {mode === 'portal' ? <MemberAvatar id={owner.id} size={36} /> : <MessageSquare size={20} color={tokens.color.muted} aria-hidden />}
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="body2" component="h2" sx={{ fontWeight: 650 }} noWrap>{mode === 'portal' ? owner.name : project.clientName}</Typography>
          <Typography variant="caption" noWrap sx={{ display: 'block' }}>
            {mode === 'portal' ? `アフロ株式会社・${owner.role}` : `${project.siteName}・担当 ${owner.name}`}
          </Typography>
        </Box>
        {mode === 'dev' && (
          <>
            <StatusBadge unanswered={unanswered} />
            <Button component={RouterLink} to={routes.detail(project.id)} size="small" sx={{ flexShrink: 0, [TOUCH]: { minHeight: 44 } }}>
              詳細
            </Button>
          </>
        )}
      </Stack>

      {/* メッセージ */}
      <Box
        ref={listRef}
        role="log"
        aria-live="polite"
        aria-label={`${project.clientName}との相談のメッセージ`}
        sx={{ px: { xs: 1.5, sm: 2 }, py: 2, height: logHeight, minHeight: 240, overflowY: 'auto', bgcolor: tokens.color.bg, flex: mode === 'dev' ? 1 : undefined }}
      >
        {messages.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 6 }}>まだメッセージはありません。</Typography>
        ) : (
          <Stack component="ul" spacing={1.5} sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {messages.map((m) => {
              const mine = m.side === mySide;
              return (
                <Box component="li" key={m.id} sx={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start' }}>
                  <Typography variant="caption" sx={{ mb: 0.25, px: 0.5 }}>
                    {m.author}{m.side === 'afro' && mode === 'portal' ? '（アフロ）' : ''}・{formatDateTime(m.at)}
                  </Typography>
                  <Box
                    sx={{
                      maxWidth: { xs: '88%', sm: '72%' }, px: 1.75, py: 1.25, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
                      borderRadius: mine ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                      bgcolor: mine ? tokens.color.primaryContainer : tokens.color.surface,
                      color: mine ? tokens.color.onPrimaryContainer : tokens.color.onSurface,
                      border: mine ? 'none' : `1px solid ${tokens.color.border}`,
                    }}
                  >
                    <Typography variant="body2" sx={{ color: 'inherit', lineHeight: 1.7 }}>{m.text}</Typography>
                  </Box>
                </Box>
              );
            })}
          </Stack>
        )}
      </Box>

      {/* 入力 */}
      <Box sx={{ px: { xs: 1.5, sm: 2 }, py: 1.5, borderTop: `1px solid ${tokens.color.border}` }}>
        <Stack direction="row" spacing={1} alignItems="flex-start">
          <TextField
            value={text}
            onChange={(e) => { setText(e.target.value); if (error) setError(null); }}
            onKeyDown={onKeyDown}
            placeholder={mode === 'portal' ? '担当者へのメッセージを入力' : `${project.clientName}への返信を入力`}
            multiline
            maxRows={5}
            fullWidth
            size="small"
            error={!!error || over}
            helperText={error ?? (over ? `${CHAT_LIMITS.text}文字以内にしてください（いま ${length} 文字）` : 'Enter で送信・Shift+Enter で改行')}
            inputProps={{ 'aria-label': 'メッセージ' }}
          />
          <Tooltip title="送信">
            <span>
              <IconButton onClick={send} disabled={!length || over} aria-label="送信" sx={{ width: 44, height: 44, bgcolor: tokens.color.primary, color: tokens.color.onPrimary, '&:hover': { bgcolor: tokens.color.primaryHover }, '&.Mui-disabled': { bgcolor: tokens.color.bgSubtle } }}>
                <Send size={18} />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
        <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>デモのため、メッセージはこのブラウザの中だけに保存されます（実際には送信されません）。</Typography>
      </Box>
    </>
  );
}
