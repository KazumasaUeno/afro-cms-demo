import { Box, ButtonBase } from '@mui/material';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Circle } from 'lucide-react';
import type { QualityCheck } from '@/types';
import { tokens } from '@/theme/tokens';
import { TOUCH } from '@/theme/media';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { formatDateTime } from '@/services/time';
import { shortStamp, surname } from './qualityStats';

interface Props {
  side: 'afro' | 'client';
  check: QualityCheck | undefined;
  itemText: string;
  onToggle: () => void;
}

const SIDE = {
  afro: { label: 'アフロ', color: tokens.color.primary, soft: tokens.color.primarySoft },
  client: { label: '顧客', color: '#08765A', soft: tokens.color.successSoft },
} as const;

/**
 * 確認ボタン。チェックするとタイムスタンプ表示に変わる（資料: 入力後はタイムスタンプにかわる）。
 * もう一度押すと取り消し。
 */
export function CheckToggle({ side, check, itemText, onToggle }: Props) {
  const reduced = useReducedMotion();
  const at = side === 'afro' ? check?.afroAt : check?.clientAt;
  const by = side === 'afro' ? check?.afroBy : check?.clientBy;
  const s = SIDE[side];
  const checked = !!at;
  return (
    <ButtonBase
      onClick={onToggle}
      aria-pressed={checked}
      aria-label={
        checked
          ? `${s.label}確認済み（${formatDateTime(at)} ${by ?? ''}）。押すと取り消し: ${itemText}`
          : `${s.label}として確認する: ${itemText}`
      }
      title={checked ? `${formatDateTime(at)} ${by ?? ''}（クリックで取り消し）` : undefined}
      sx={{
        position: 'relative', overflow: 'hidden', height: 34, [TOUCH]: { height: 44 }, minWidth: { xs: 0, sm: 132 }, flex: '0 0 auto',
        px: 1.25, borderRadius: '10px', justifyContent: 'flex-start', gap: 0.75, fontSize: 12.5, fontWeight: 600,
        border: `1px solid ${checked ? 'transparent' : tokens.color.border}`,
        bgcolor: checked ? s.soft : tokens.color.surface,
        color: checked ? s.color : tokens.color.muted,
        transition: `background-color .2s ${tokens.motion.easeCss}, border-color .2s, color .2s`,
        '&:hover': { borderColor: checked ? 'transparent' : tokens.color.borderStrong, color: checked ? s.color : tokens.color.ink },
      }}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={checked ? 'on' : 'off'}
          initial={reduced ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }}
          transition={{ duration: 0.16, ease: tokens.motion.ease }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', minWidth: 0 }}
        >
          {checked ? (
            <>
              <Box component="span" sx={{ width: 18, height: 18, borderRadius: '6px', bgcolor: s.color, color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <Check size={12} strokeWidth={3} />
              </Box>
              <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {shortStamp(at!)} {surname(by)}
              </Box>
            </>
          ) : (
            <>
              <Circle size={16} />
              {s.label}確認
            </>
          )}
        </motion.span>
      </AnimatePresence>
    </ButtonBase>
  );
}
