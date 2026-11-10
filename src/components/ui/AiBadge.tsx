import { Box, Tooltip } from '@mui/material';
import { Sparkles } from 'lucide-react';
import { tokens } from '@/theme/tokens';

/**
 * AI シミュレーションであることの明示。
 * 本デモの AI 結果はすべて事前に用意したデータであり、外部 API には送信していない。
 */
export function AiBadge({ label = 'AIシミュレーション' }: { label?: string }) {
  return (
    <Tooltip title="デモ用に事前に用意した結果を表示しています。実際のAI生成・外部送信は行っていません。">
      <Box
        component="span"
        tabIndex={0}
        sx={{
          display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 1, height: 24, borderRadius: '8px',
          bgcolor: tokens.color.accentSoft, color: tokens.color.accentInk, fontSize: 12, fontWeight: 650, whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        <Sparkles size={13} />
        {label}
      </Box>
    </Tooltip>
  );
}

/** AI の印として使う小さなアイコンタイル */
export function AiMark({ size = 32 }: { size?: number }) {
  return (
    <Box sx={{ width: size, height: size, borderRadius: `${size / 3.2}px`, background: tokens.aiGradient, display: 'grid', placeItems: 'center', color: '#fff', flexShrink: 0 }}>
      <Sparkles size={size * 0.5} />
    </Box>
  );
}
