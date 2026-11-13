import { Box, Stack, Typography } from '@mui/material';
import { Home, MousePointerClick } from 'lucide-react';
import { StatusPill } from '@/components/ui';
import { tokens } from '@/theme/tokens';
import type { PetitSitemap, PetitSource } from './petitPlan';

const c = tokens.color;
const SOURCE_LABEL: Record<PetitSource, string> = { cta: 'ゴール', must: 'ご要望', purpose: '目的から', industry: '業種の定番', filler: 'AIの提案' };

/** トップ＋第1階層の木（React Flow を使わない軽い表示。タブレットでも 1 画面で見渡せる） */
export function PetitSitemapTree({ sitemap }: { sitemap: PetitSitemap }) {
  return (
    <Box>
      <Box sx={{ p: 2, borderRadius: 3, bgcolor: c.primarySoft, border: `1px solid ${c.primary}`, display: 'flex', gap: 1.5, alignItems: 'center' }}>
        <Home size={20} aria-hidden />
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700 }}>トップ <Box component="span" sx={{ fontWeight: 500, color: c.muted, fontSize: 13 }}>/</Box></Typography>
          <Typography variant="caption" sx={{ display: 'block' }}>{sitemap.homeReason}</Typography>
        </Box>
      </Box>
      <Box component="ol" aria-label="第1階層のページ" sx={{ listStyle: 'none', m: 0, p: 0, pl: { xs: 2, sm: 3 }, borderLeft: `2px solid ${c.border}`, ml: 2.5, mt: 0, pt: 1.5, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' }, gap: 1.25 }}>
        {sitemap.pages.map((p, i) => (
          <Box component="li" key={`${p.path}-${i}`} sx={{ p: 1.5, borderRadius: 2.5, bgcolor: c.surface, border: `1px solid ${p.kind === 'cta' ? c.primary : c.border}`, minWidth: 0 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
              {p.kind === 'cta' && <MousePointerClick size={16} color={c.primary} aria-hidden />}
              <Typography sx={{ fontWeight: 700, fontSize: 15, minWidth: 0, flex: 1 }} noWrap>{i + 1}. {p.label}</Typography>
              <StatusPill tone={p.source === 'must' ? 'primary' : p.source === 'cta' ? 'success' : 'neutral'} dot={false}>{SOURCE_LABEL[p.source]}</StatusPill>
            </Stack>
            <Typography variant="caption" sx={{ display: 'block', color: c.muted, fontFamily: tokens.font.mono }} noWrap>{p.path}</Typography>
            {p.reason && <Typography variant="caption" sx={{ display: 'block', mt: 0.25 }}>{p.reason}</Typography>}
          </Box>
        ))}
      </Box>
      {sitemap.dropped.length > 0 && (
        <Typography variant="body2" sx={{ mt: 2, color: c.muted }}>
          ページ数の上限で外したページ {sitemap.dropped.length} 件：{sitemap.dropped.join('、')}（本契約の要件定義で追加できます）
        </Typography>
      )}
    </Box>
  );
}
