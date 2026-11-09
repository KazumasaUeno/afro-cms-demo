import { Box, Button, ButtonBase, IconButton, InputBase, Stack, Typography } from '@mui/material';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Send, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDemo } from '@/store/DemoStore';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { tokens } from '@/theme/tokens';
import { LANDSCAPE_PHONE, TOUCH } from '@/theme/media';
import { AREAS } from '@/components/layout/nav';
import { AssistantAvatar } from './AssistantAvatar';
import { TOPICS, clientTodos, pageGuide, reply, type AssistantReply } from './answers';

const AREA = AREAS.portal;
const MAX_INPUT = 200;

/** アバターの顔（見た目の正は AssistantAvatar） */
function AssistantFace({ size, talking }: { size: number; talking?: boolean }) {
  return <AssistantAvatar size={size} talking={talking} />;
}

interface Message extends AssistantReply {
  id: number;
  from: 'ai' | 'user';
}

let seq = 0;

/**
 * お客様ポータルの AI アシスタント（案内役）。右下に常駐し、画面ごとの案内と質問への回答をする（シミュレーション）。
 * 非モーダルのパネル（フォーカスを閉じ込めない）。スマホでは画面の大半を覆うが、背後も操作できる前提のデモとして受け入れている
 */
export function PortalAssistant() {
  const { state } = useDemo();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const timer = useRef<number>();
  const guide = pageGuide(pathname, state);
  const todoCount = clientTodos(state).length;

  // 画面を移ったら会話はそのまま、先頭の案内だけ新しい画面のものに変わる（guide は毎回計算）
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (open) inputRef.current?.focus({ preventScroll: true });
  }, [open]);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: reduced ? 'auto' : 'smooth' });
  }, [messages, typing, reduced]);

  const close = () => {
    setOpen(false);
    // 狭い画面では開いている間ボタンを隠しているので、表示されてからフォーカスを戻す
    window.requestAnimationFrame(() => fabRef.current?.focus());
  };

  const ask = (text: string, answer: AssistantReply) => {
    if (typing) return;
    setMessages((m) => [...m, { id: ++seq, from: 'user', text }]);
    setTyping(true);
    // 考えている間（動きを減らす設定では待たせない）
    timer.current = window.setTimeout(() => {
      setMessages((m) => [...m, { id: ++seq, from: 'ai', ...answer }]);
      setTyping(false);
    }, reduced ? 0 : 650);
  };

  const submit = () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    ask(text, reply(text, state));
  };

  const go = (to: string) => {
    navigate(to);
    // スマホでは画面を覆っているので、移動したら閉じる（sm 未満。MUI の既定の区切りと同じ）
    if (window.matchMedia('(max-width: 599.95px)').matches) close();
  };

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            key="panel"
            // 外側は opacity だけ動かす（transform を付けると中の position: fixed の基準がずれる）
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: tokens.motion.fast }}
          >
            <Box
              role="dialog"
              aria-label="AIアシスタント"
              onKeyDown={(e) => { if (e.key === 'Escape') close(); }}
              sx={{
                position: 'fixed', zIndex: 40, display: 'flex', flexDirection: 'column', overflow: 'hidden',
                bgcolor: tokens.color.surface, border: `1px solid ${tokens.color.border}`, boxShadow: tokens.shadow.lg,
                // スマホは下部タブの上いっぱい、PC は右下のパネル
                left: { xs: 8, sm: 'auto' }, right: { xs: 8, sm: 24 },
                bottom: { xs: 'calc(72px + env(safe-area-inset-bottom))', md: 96 },
                width: { sm: 380 }, height: { xs: 'min(560px, calc(100dvh - 160px))', md: 'min(560px, calc(100dvh - 140px))' },
                borderRadius: '20px',
                animation: reduced ? 'none' : `pa-in .24s ${tokens.motion.easeCss}`,
                '@keyframes pa-in': { from: { transform: 'translateY(12px)' }, to: { transform: 'none' } },
                [LANDSCAPE_PHONE]: { bottom: 8, top: 8, height: 'auto' },
              }}
            >
              <Stack direction="row" spacing={1.25} alignItems="center" sx={{ px: 2, py: 1.5, borderBottom: `1px solid ${tokens.color.border}` }}>
                <AssistantFace size={38} talking={typing} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: 15 }}>AIアシスタント</Typography>
                  <Typography variant="caption" sx={{ display: 'block' }}>デモ: 用意した回答を表示します。入力は送信されません</Typography>
                </Box>
                <IconButton aria-label="AIアシスタントを閉じる" onClick={close}><X size={18} /></IconButton>
              </Stack>

              <Box ref={listRef} aria-live="polite" sx={{ flex: 1, overflowY: 'auto', px: 2, py: 2, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                <Bubble from="ai" text={guide.text} action={guide.action} onAction={go} />
                {messages.map((m) => <Bubble key={m.id} from={m.from} text={m.text} action={m.action} onAction={go} />)}
                {typing && (
                  <Box role="status" aria-label="回答を作成中" sx={{ alignSelf: 'flex-start', display: 'flex', gap: 0.5, px: 1.5, py: 1.25, borderRadius: '4px 14px 14px 14px', bgcolor: tokens.color.surfaceMuted }}>
                    {[0, 1, 2].map((i) => (
                      <Box key={i} component="span" sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: tokens.color.faint, animation: reduced ? 'none' : `pa-dot 1s ${i * 0.15}s infinite ease-in-out`, '@keyframes pa-dot': { '0%,80%,100%': { opacity: 0.3 }, '40%': { opacity: 1 } } }} />
                    ))}
                  </Box>
                )}
              </Box>

              <Box sx={{ px: 1.5, pt: 1, pb: 1.5, borderTop: `1px solid ${tokens.color.border}`, bgcolor: tokens.color.surfaceMuted }}>
                <Box sx={{ display: 'flex', gap: 0.75, overflowX: 'auto', pb: 1, mx: -0.5, px: 0.5 }} role="group" aria-label="よくある質問">
                  {TOPICS.map((t) => (
                    <ButtonBase
                      key={t.id}
                      disabled={typing}
                      onClick={() => ask(t.label, t.answer(state))}
                      sx={{ flexShrink: 0, px: 1.25, height: 32, [TOUCH]: { height: 40 }, borderRadius: '16px', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', bgcolor: tokens.color.surface, border: `1px solid ${tokens.color.border}`, color: tokens.color.inkSoft, '&:hover': { borderColor: AREA.color, color: AREA.color } }}
                    >
                      {t.label}
                    </ButtonBase>
                  ))}
                </Box>
                <Box component="form" onSubmit={(e) => { e.preventDefault(); submit(); }} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, pl: 1.5, pr: 0.5, borderRadius: '14px', bgcolor: tokens.color.surface, border: `1px solid ${tokens.color.border}` }}>
                  <InputBase
                    inputRef={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value.slice(0, MAX_INPUT))}
                    placeholder="質問を入力（例: 公開はいつ？）"
                    inputProps={{ 'aria-label': 'AIアシスタントへの質問', maxLength: MAX_INPUT, enterKeyHint: 'send' }}
                    sx={{ flex: 1, fontSize: 16, py: 0.75 }}
                  />
                  <IconButton type="submit" aria-label="送信" disabled={!input.trim() || typing} sx={{ color: AREA.color }}><Send size={18} /></IconButton>
                </Box>
              </Box>
            </Box>
          </motion.div>
        )}
      </AnimatePresence>

      <ButtonBase
        ref={fabRef}
        aria-label={open ? 'AIアシスタントを閉じる' : `AIアシスタントに質問する${todoCount ? `（お願いしたいこと ${todoCount} 件）` : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => (open ? close() : setOpen(true))}
        sx={{
          position: 'fixed', zIndex: 41, right: { xs: 16, md: 24 }, bottom: { xs: 'calc(80px + env(safe-area-inset-bottom))', md: 24 },
          // md 未満と横向きのスマホでは、開いている間はパネルの入力欄と重なるので隠す（閉じるはパネル内のボタン）
          display: { xs: open ? 'none' : 'inline-flex', md: 'inline-flex' },
          [LANDSCAPE_PHONE]: { bottom: 16, ...(open ? { display: 'none' } : {}) },
          width: 56, height: 56, borderRadius: '18px', boxShadow: tokens.shadow.lg, bgcolor: tokens.color.surface,
          transition: `transform .16s ${tokens.motion.easeCss}`, '&:hover': { transform: 'translateY(-2px)' },
        }}
      >
        {open ? <X size={22} /> : <AssistantFace size={44} />}
        {!open && todoCount > 0 && (
          <Box component="span" aria-hidden sx={{ position: 'absolute', top: -4, right: -4, minWidth: 20, height: 20, px: 0.5, borderRadius: '10px', bgcolor: tokens.color.danger, color: '#fff', fontSize: 11.5, fontWeight: 700, display: 'grid', placeItems: 'center', border: `2px solid ${tokens.color.surface}` }}>
            {todoCount}
          </Box>
        )}
      </ButtonBase>
    </>
  );
}

function Bubble({ from, text, action, onAction }: { from: 'ai' | 'user'; text: string; action?: AssistantReply['action']; onAction: (to: string) => void }) {
  const ai = from === 'ai';
  return (
    <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ alignSelf: ai ? 'flex-start' : 'flex-end', maxWidth: '88%' }}>
      {ai && <AssistantFace size={26} />}
      <Box sx={{ minWidth: 0 }}>
        <Typography
          variant="body2"
          sx={{
            px: 1.5, py: 1, whiteSpace: 'pre-line', lineHeight: 1.65,
            borderRadius: ai ? '4px 14px 14px 14px' : '14px 14px 4px 14px',
            bgcolor: ai ? tokens.color.surfaceMuted : AREA.soft, color: tokens.color.ink,
          }}
        >
          {text}
        </Typography>
        {ai && action && (
          <Button size="small" endIcon={<ArrowRight size={14} />} onClick={() => onAction(action.to)} sx={{ mt: 0.5, minHeight: 36, [TOUCH]: { minHeight: 44 } }}>
            {action.label}
          </Button>
        )}
      </Box>
    </Stack>
  );
}
