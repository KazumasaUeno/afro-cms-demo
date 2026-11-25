import { Box, ButtonBase, IconButton, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { Send } from 'lucide-react';
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import type { ChatMessage } from '@/types';
import { CHAT_LIMITS } from '@/data/chatLimits';
import { formatDateTime } from '@/services/time';
import { TOUCH } from '@/theme/media';
import { tokens } from '@/theme/tokens';

/**
 * 相談チャットの表示部品（demo の ChatPage と live の LiveConsultPage で共有。2026-11-25 LIVE_DASHBOARD_TASKS_CONSULT U3 で ChatPage から切り出し）。
 * ストア（useDemo / Firestore）に触れない。値と操作はすべて props で受け取る（live から届くモジュールは useDemo を呼ばない。tests/unit/liveNoDemoStore）
 */

/**
 * 未対応（赤）／対応済み（控えめ）／閲覧のみ（2026-11-17）。
 * director: 管理者画面で未対応に添える担当の名前（「未対応・担当 佐倉 美緒」）
 */
export function ChatStatusBadge({ unanswered, readOnly = false, director }: { unanswered: boolean; readOnly?: boolean; director?: string }) {
  if (readOnly) return <Typography component="span" variant="caption" sx={{ flexShrink: 0, color: tokens.color.muted }}>閲覧のみ</Typography>;
  return unanswered ? (
    <Box component="span" sx={{ flexShrink: 0, px: 1, py: 0.25, borderRadius: 999, bgcolor: tokens.color.danger, color: tokens.color.onDanger, fontSize: 12, fontWeight: 700, lineHeight: 1.5, whiteSpace: 'nowrap' }}>
      未対応{director ? `・担当 ${director}` : ''}
    </Box>
  ) : (
    <Typography component="span" variant="caption" sx={{ flexShrink: 0, color: tokens.color.muted }}>対応済み</Typography>
  );
}

/** 相談の一覧の 1 行（LINE のトーク一覧の形）。preview はその行の 3 段目（demo: 最後の本文 ／ live: 最後に送った人） */
export function ChatInboxRow({ accent, clientName, siteName, time, preview, unanswered, badge, active, ariaLabel, onOpen }: {
  accent: string;
  clientName: string;
  siteName: string;
  time: string;
  preview: string;
  unanswered: boolean;
  badge: ReactNode;
  active: boolean;
  ariaLabel: string;
  onOpen: () => void;
}) {
  return (
    <Box component="li" sx={{ borderBottom: `1px solid ${tokens.color.border}` }}>
      <ButtonBase
        onClick={onOpen}
        aria-current={active ? 'true' : undefined}
        aria-label={ariaLabel}
        sx={{
          width: '100%', textAlign: 'left', display: 'flex', alignItems: 'flex-start', gap: 1.5, px: 2, py: 1.5, minHeight: 64,
          bgcolor: active ? tokens.color.primarySoft : 'transparent',
          '&:hover': { bgcolor: active ? tokens.color.primarySoft : tokens.color.surfaceMuted },
          '&.Mui-focusVisible': { outline: `2px solid ${tokens.color.primary}`, outlineOffset: -2 },
          [TOUCH]: { minHeight: 72 },
        }}
      >
        <Box sx={{ width: 12, height: 12, mt: 0.75, borderRadius: '4px', bgcolor: accent, flexShrink: 0 }} aria-hidden />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" spacing={1} alignItems="baseline">
            <Typography variant="body2" sx={{ fontWeight: unanswered ? 750 : 650, flex: 1, minWidth: 0 }} noWrap>{clientName}</Typography>
            <Typography variant="caption" sx={{ flexShrink: 0 }}>{time}</Typography>
          </Stack>
          <Typography variant="caption" sx={{ display: 'block', color: tokens.color.muted }} noWrap>{siteName}</Typography>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.25 }}>
            <Typography variant="body2" sx={{ flex: 1, minWidth: 0, color: unanswered ? tokens.color.onSurface : tokens.color.muted }} noWrap>
              {preview}
            </Typography>
            {badge}
          </Stack>
        </Box>
      </ButtonBase>
    </Box>
  );
}

/**
 * メッセージの一覧（自分の側は右、相手は左）。新しいメッセージが届いたら（送ったら）いちばん下まで送る。
 * afroSuffix: 名前に「（アフロ）」を添える（お客様ポータル）。before: 一覧の先頭に置く要素（live の「さらに読む」）
 */
export function ChatLog({ messages, mySide, afroSuffix, label, height, grow, scrollKey, before }: {
  messages: readonly ChatMessage[];
  mySide: ChatMessage['side'];
  afroSuffix: boolean;
  label: string;
  height: Record<string, string>;
  grow: boolean;
  scrollKey: string;
  before?: ReactNode;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const lastId = messages[messages.length - 1]?.id;
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, lastId, scrollKey]);

  return (
    <Box
      ref={listRef}
      role="log"
      aria-live="polite"
      aria-label={label}
      sx={{ px: { xs: 1.5, sm: 2 }, py: 2, height, minHeight: 240, overflowY: 'auto', bgcolor: tokens.color.bg, flex: grow ? 1 : undefined }}
    >
      {before}
      {messages.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 6 }}>まだメッセージはありません。</Typography>
      ) : (
        <Stack component="ul" spacing={1.5} sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {messages.map((m) => {
            const mine = m.side === mySide;
            return (
              <Box component="li" key={m.id} sx={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start' }}>
                <Typography variant="caption" sx={{ mb: 0.25, px: 0.5 }}>
                  {m.author}{m.side === 'afro' && afroSuffix ? '（アフロ）' : ''}・{formatDateTime(m.at)}
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
  );
}

/** 返信欄の代わりに出す注記（閲覧のみ） */
export function ChatReadOnlyNote({ children }: { children: ReactNode }) {
  return (
    <Box role="note" sx={{ px: { xs: 1.5, sm: 2 }, py: 2, borderTop: `1px solid ${tokens.color.border}`, bgcolor: tokens.color.surfaceMuted }}>
      <Typography variant="body2" sx={{ color: tokens.color.muted }}>{children}</Typography>
    </Box>
  );
}

/**
 * 入力欄と送信ボタン。Enter で送信、Shift+Enter で改行。日本語の変換中の Enter では送らない。
 * busy: 送信中（ボタンを無効にする。live は二重送信を避けるため）。caption: 入力欄の下の注記
 */
export function ChatComposer({ text, onTextChange, onSend, error, placeholder, caption, busy = false }: {
  text: string;
  onTextChange: (v: string) => void;
  onSend: () => void;
  error: string | null;
  placeholder: string;
  caption: ReactNode;
  busy?: boolean;
}) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (!busy) onSend();
    }
  };
  const length = text.trim().length;
  const over = length > CHAT_LIMITS.text;
  return (
    <Box sx={{ px: { xs: 1.5, sm: 2 }, py: 1.5, borderTop: `1px solid ${tokens.color.border}` }}>
      <Stack direction="row" spacing={1} alignItems="flex-start">
        <TextField
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
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
            <IconButton onClick={onSend} disabled={!length || over || busy} aria-label="送信" sx={{ width: 44, height: 44, bgcolor: tokens.color.primary, color: tokens.color.onPrimary, '&:hover': { bgcolor: tokens.color.primaryHover }, '&.Mui-disabled': { bgcolor: tokens.color.bgSubtle } }}>
              <Send size={18} />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>
      <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>{caption}</Typography>
    </Box>
  );
}
