import { Box, Button, Dialog, IconButton, Stack, Typography } from '@mui/material';
import { Pause, Play, WifiOff, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import type { Display, Slide } from '@/types';
import { deliveredSlidesOf, periodState } from '@/data/signage';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { LANDSCAPE_PHONE } from '@/theme/media';
import { tokens } from '@/theme/tokens';
import { EmptyScreen, SlideView } from './SlideView';

const TICK = 100;

/**
 * 端末の再生のプレビュー（シミュレーション）。配信済みの内容を、1 枚ずつ表示秒数で切り替えて繰り返す。
 * 掲載期間外のスライドはとばす。動きを減らす設定ではフェードせずに切り替える。
 */
export function PlayerDialog({ open, display, slides, onClose }: { open: boolean; display: Display | null; slides: Slide[]; onClose: () => void }) {
  const reduced = useReducedMotion();
  const [pos, setPos] = useState({ i: 0, t: 0 });
  const [speed, setSpeed] = useState<1 | 2>(1);
  const [paused, setPaused] = useState(false);

  // 閉じるアニメーションの間は最後の端末のまま表示する
  const [last, setLast] = useState<Display | null>(display);
  if (display && display !== last) setLast(display);
  const shown = display ?? last;

  const delivered = useMemo(() => (shown ? deliveredSlidesOf(shown, slides) : []), [shown, slides]);
  const playlist = useMemo(() => delivered.filter((s) => periodState(s) === 'active'), [delivered]);
  const skipped = delivered.length - playlist.length;

  // 開くたびに最初から
  useEffect(() => {
    if (open) {
      setPos({ i: 0, t: 0 });
      setPaused(false);
    }
  }, [open, display?.id]);

  useEffect(() => {
    if (!open || paused || playlist.length === 0) return;
    const timer = window.setInterval(() => {
      setPos((p) => {
        const cur = playlist[p.i % playlist.length];
        const t = p.t + TICK * speed;
        return t >= cur.durationSec * 1000 ? { i: (p.i + 1) % playlist.length, t: 0 } : { i: p.i, t };
      });
    }, TICK);
    return () => window.clearInterval(timer);
  }, [open, paused, playlist, speed]);

  const index = playlist.length ? pos.i % playlist.length : 0;
  const current = playlist[index];
  const orientation = shown?.orientation ?? 'landscape';
  const ratio = orientation === 'portrait' ? '9 / 16' : '16 / 9';
  const remain = current ? Math.max(0, Math.ceil((current.durationSec * 1000 - pos.t) / 1000 / speed)) : 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen
      aria-labelledby="signage-player-title"
      PaperProps={{ sx: { bgcolor: '#0B0F19', color: '#fff', backgroundImage: 'none' } }}
    >
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ px: { xs: 2, md: 3 }, py: 1.5, [LANDSCAPE_PHONE]: { py: 0.5 } }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography id="signage-player-title" sx={{ fontWeight: 700, fontSize: 15, color: '#fff' }} noWrap>
            {shown ? `「${shown.name}」の再生プレビュー` : '再生プレビュー'}
          </Typography>
          <Typography variant="caption" sx={{ display: 'block', color: 'rgba(255,255,255,.65)' }} noWrap>
            配信済みの内容を再生しています（デモ: 実際の端末には接続していません）
          </Typography>
        </Box>
        <IconButton aria-label="プレビューを閉じる" onClick={onClose} sx={{ color: '#fff', '&:hover': { bgcolor: 'rgba(255,255,255,.1)' } }}><X size={20} /></IconButton>
      </Stack>

      {shown && !shown.online && (
        <Stack direction="row" spacing={1} alignItems="center" role="status" sx={{ mx: { xs: 2, md: 3 }, mb: 1, px: 1.5, py: 0.75, borderRadius: 2, bgcolor: 'rgba(194,120,3,.18)', color: '#FCD9A0', fontSize: 13 }}>
          <WifiOff size={15} style={{ flexShrink: 0 }} />
          <span>この端末はオフラインです。オンラインになると、最新の配信内容が反映されます。</span>
        </Stack>
      )}

      {/* 再生面: 残りの高さ・幅に収まる最大の 16:9 / 9:16 */}
      <Box sx={{ flex: 1, minHeight: 0, px: { xs: 1, md: 3 }, containerType: 'size', display: 'grid', placeItems: 'center' }}>
        <Box sx={{
          position: 'relative', aspectRatio: ratio, borderRadius: '6px', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,.5)',
          width: orientation === 'portrait' ? 'min(100cqw, calc(100cqh * 9 / 16))' : 'min(100cqw, calc(100cqh * 16 / 9))',
        }}>
          {current ? (
            <AnimatePresence initial={false}>
              <motion.div
                key={`${index}-${current.id}`}
                initial={reduced ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0 }}
                transition={{ duration: reduced ? 0 : 0.6, ease: tokens.motion.ease }}
                style={{ position: 'absolute', inset: 0 }}
              >
                <SlideView slide={current} orientation={orientation} />
              </motion.div>
            </AnimatePresence>
          ) : (
            <EmptyScreen orientation={orientation} text={delivered.length ? '掲載期間内のコンテンツがありません' : '配信内容がありません'} sx={{ height: '100%' }} />
          )}
        </Box>
      </Box>

      <Box sx={{ px: { xs: 2, md: 3 }, pt: 1.5, pb: 'max(16px, env(safe-area-inset-bottom))', [LANDSCAPE_PHONE]: { pt: 0.5, pb: 1 } }}>
        <Box
          role="progressbar" aria-label="このスライドの表示時間" aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={current ? Math.round((pos.t / (current.durationSec * 1000)) * 100) : 0}
          sx={{ height: 4, borderRadius: 2, bgcolor: 'rgba(255,255,255,.15)', overflow: 'hidden', mb: 1.25 }}
        >
          <Box sx={{ height: '100%', bgcolor: '#fff', width: current ? `${Math.min(100, (pos.t / (current.durationSec * 1000)) * 100)}%` : 0 }} />
        </Box>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,.75)', fontVariantNumeric: 'tabular-nums', flex: 1, minWidth: 140 }} aria-live="off">
            {current ? `${index + 1} / ${playlist.length} 枚目・あと ${remain} 秒` : '—'}
            {skipped > 0 && `（期間外の ${skipped} 件はとばしています）`}
          </Typography>
          <Button
            size="small" variant="outlined" disabled={!current}
            startIcon={paused ? <Play size={14} /> : <Pause size={14} />}
            onClick={() => setPaused((v) => !v)}
            // テーマの outlined は背景が白なので、暗い背景の上では透明に戻す
            sx={{ color: '#fff', bgcolor: 'transparent', borderColor: 'rgba(255,255,255,.35)', '&:hover': { borderColor: '#fff', bgcolor: 'rgba(255,255,255,.08)' }, '&.Mui-disabled': { color: 'rgba(255,255,255,.35)' } }}
          >
            {paused ? '再生' : '一時停止'}
          </Button>
          <Button
            size="small" variant="outlined" aria-pressed={speed === 2} disabled={!current}
            onClick={() => setSpeed((v) => (v === 1 ? 2 : 1))}
            sx={{ color: '#fff', borderColor: speed === 2 ? '#fff' : 'rgba(255,255,255,.35)', bgcolor: speed === 2 ? 'rgba(255,255,255,.14)' : 'transparent', '&:hover': { borderColor: '#fff', bgcolor: 'rgba(255,255,255,.08)' }, '&.Mui-disabled': { color: 'rgba(255,255,255,.35)' } }}
          >
            2倍速（デモ）
          </Button>
        </Stack>
      </Box>
    </Dialog>
  );
}
