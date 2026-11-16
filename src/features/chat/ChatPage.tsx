import { Box, Button, IconButton, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { ArrowLeft, MessageSquare, Send } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { MemberAvatar, PageHeader, Surface } from '@/components/ui';
import { areaOf } from '@/components/layout/nav';
import { currentProject, useDemo } from '@/store/DemoStore';
import { useDevUser } from '@/features/dev/useDevUser';
import { useProjectRoutes } from '@/features/projects/projectRoutes';
import { memberById } from '@/data/members';
import { CHAT_LIMITS, chatOf, validateChat } from '@/data/chat';
import { formatDateTime } from '@/services/time';
import { tokens } from '@/theme/tokens';

type Mode = 'portal' | 'admin' | 'dev';

/**
 * 担当者への相談チャット（0.38.0。案件ごとに 1 本の会話）。1 つの部品を画面ごとに出し分ける。
 * - お客様ポータル（/portal/chat）: お客様として送る。相手はその案件の担当者
 * - 管理者画面（/chat）・開発者画面（/dev/chat）: アフロとして返信する（開発者画面はログイン中の開発者の名前）
 * デモのため、このブラウザの中だけに保存する（data/chat.ts）。表示の出し分けで、セキュリティ境界ではない
 */
export default function ChatPage() {
  const { state, dispatch } = useDemo();
  const project = currentProject(state);
  const routes = useProjectRoutes();
  const me = useDevUser();
  const area = areaOf(useLocation().pathname);
  const mode: Mode = area === 'portal' ? 'portal' : area === 'dev' ? 'dev' : 'admin';
  const mySide = mode === 'portal' ? 'client' : 'afro';
  const owner = memberById(project.ownerId);
  const messages = chatOf(state, project.id);
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
    dispatch({ type: 'sendChat', text, by: mySide, ...(mode === 'dev' ? { devBy: me.id } : {}) });
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
        {/* 会話の相手 */}
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ px: 2, py: 1.5, borderBottom: `1px solid ${tokens.color.border}` }}>
          {mode === 'portal' ? <MemberAvatar id={owner.id} size={36} /> : <MessageSquare size={20} color={tokens.color.muted} aria-hidden />}
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 650 }} noWrap>{mode === 'portal' ? owner.name : project.clientName}</Typography>
            <Typography variant="caption" noWrap>{mode === 'portal' ? `アフロ株式会社・${owner.role}` : `担当 ${owner.name}`}</Typography>
          </Box>
        </Stack>

        {/* メッセージ */}
        <Box
          ref={listRef}
          role="log"
          aria-live="polite"
          aria-label="相談のメッセージ"
          sx={{ px: { xs: 1.5, sm: 2 }, py: 2, height: { xs: 'calc(100dvh - 500px)', md: 'calc(100dvh - 560px)' }, minHeight: 240, overflowY: 'auto', bgcolor: tokens.color.bg }}
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
              placeholder={mode === 'portal' ? '担当者へのメッセージを入力' : 'お客様への返信を入力'}
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
      </Surface>
    </Box>
  );
}
