import { Box, Button, ButtonBase, Stack, Typography } from '@mui/material';
import { ArrowRight, CalendarClock, FilePen, FileText, Globe, LayoutDashboard, Megaphone, Rocket, Send, Stamp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { PageStatus } from '@/types';
import { PageHeader, Reveal, SectionTitle, StatusPill, Surface } from '@/components/ui';
import { useDemo, currentProject } from '@/store/DemoStore';
import { formatDateTime, relativeTime } from '@/services/time';
import { tokens } from '@/theme/tokens';
import { STATUS_META, TYPE_LABEL } from '@/features/cms/cmsUtils';
import { AREAS } from '@/components/layout/nav';

const AREA = AREAS.cms;

const STAT: { status: PageStatus; icon: typeof Globe; color: string; soft: string }[] = [
  { status: 'published', icon: Globe, color: tokens.color.success, soft: tokens.color.successSoft },
  { status: 'review', icon: Stamp, color: tokens.color.warning, soft: tokens.color.warningSoft },
  { status: 'scheduled', icon: CalendarClock, color: tokens.color.info, soft: tokens.color.infoSoft },
  { status: 'draft', icon: FilePen, color: tokens.color.muted, soft: tokens.color.bgSubtle },
];

/** 資料「④運用」のワークフロー: 編集者 → 承認依頼 → 承認 → 公開 */
const FLOW = [
  { icon: FilePen, label: '編集', sub: '編集者が下書きを作る' },
  { icon: Send, label: '承認依頼', sub: '内容を確認してもらう' },
  { icon: Stamp, label: '承認', sub: '承認者が確認・差し戻し' },
  { icon: Rocket, label: '公開', sub: '即時 または 予約' },
];

export default function CmsDashboardPage() {
  const { state } = useDemo();
  const navigate = useNavigate();
  const project = currentProject(state);
  const pages = state.pages;
  const count = (s: PageStatus) => pages.filter((p) => p.status === s).length;
  const recent = [...pages].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);
  const scheduled = pages.filter((p) => p.status === 'scheduled').sort((a, b) => (a.scheduledAt ?? '').localeCompare(b.scheduledAt ?? ''));
  const reviewCount = count('review');

  return (
    <>
      <PageHeader
        eyebrow="CMS画面"
        icon={<LayoutDashboard size={15} />}
        title={`${project.clientName} さま`}
        description={`${project.siteName} のページとお知らせを、ここから更新できます。公開はデモ上の状態変更のみで、実際のサイトには反映されません。`}
        actions={
          <>
            <Button variant="outlined" startIcon={<FileText size={16} />} onClick={() => navigate('/cms/pages?new=page')}>ページを作成</Button>
            <Button variant="contained" startIcon={<Megaphone size={16} />} onClick={() => navigate('/cms/pages?new=news')}>お知らせを書く</Button>
          </>
        }
      />

      <Stack spacing={{ xs: 2.5, md: 3 }}>
        {/* 状態ごとの件数 */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0,1fr))', md: 'repeat(4, minmax(0,1fr))' }, gap: { xs: 1.5, md: 2 } }}>
          {STAT.map(({ status, icon: Icon, color, soft }, i) => (
            <Reveal key={status} delay={i * 0.04}>
              <Surface
                interactive
                role="button"
                tabIndex={0}
                aria-label={`${STATUS_META[status].label} ${count(status)}件を見る`}
                onClick={() => navigate(status === 'review' ? '/cms/approvals' : '/cms/pages')}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(status === 'review' ? '/cms/approvals' : '/cms/pages'); } }}
              >
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Box sx={{ width: 30, height: 30, borderRadius: '9px', bgcolor: soft, color, display: 'grid', placeItems: 'center' }}><Icon size={16} /></Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: tokens.color.inkSoft }}>{STATUS_META[status].label}</Typography>
                </Stack>
                <Typography sx={{ mt: 1.5, fontSize: 30, fontWeight: 750, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
                  {count(status)}<Box component="span" sx={{ fontSize: 14, fontWeight: 600, color: tokens.color.muted, ml: 0.5 }}>件</Box>
                </Typography>
              </Surface>
            </Reveal>
          ))}
        </Box>

        {reviewCount > 0 && (
          <Reveal>
            <Surface sx={{ bgcolor: tokens.color.warningSoft, borderColor: 'transparent' }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
                <Stamp size={20} color={tokens.color.warning} />
                <Typography variant="body2" sx={{ flex: 1, fontWeight: 600, color: '#8A5402' }}>
                  承認を待っている更新が {reviewCount} 件あります。内容を確認して、公開するか差し戻してください。
                </Typography>
                <Button variant="contained" color="warning" endIcon={<ArrowRight size={16} />} onClick={() => navigate('/cms/approvals')} sx={{ flexShrink: 0 }}>承認へ進む</Button>
              </Stack>
            </Surface>
          </Reveal>
        )}

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0,1.5fr) minmax(0,1fr)' }, gap: { xs: 2.5, md: 3 }, alignItems: 'start' }}>
          <Surface>
            <SectionTitle title="最近の更新" action={<Button size="small" onClick={() => navigate('/cms/pages')}>すべて見る</Button>} />
            <Stack spacing={0.5}>
              {recent.map((p) => (
                <ButtonBase
                  key={p.id}
                  onClick={() => navigate(`/cms/pages?page=${p.id}`)}
                  sx={{ justifyContent: 'flex-start', gap: 1.5, textAlign: 'left', borderRadius: 2.5, p: 1, mx: -1, '&:hover': { bgcolor: tokens.color.surfaceMuted } }}
                >
                  <Box sx={{ width: 34, height: 34, borderRadius: '10px', bgcolor: tokens.color.bgSubtle, display: 'grid', placeItems: 'center', flexShrink: 0, color: tokens.color.muted }}>
                    {p.type === 'news' ? <Megaphone size={16} /> : <FileText size={16} />}
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 650 }} noWrap>{p.title}</Typography>
                    <Typography variant="caption" noWrap sx={{ display: 'block' }}>{TYPE_LABEL[p.type]}・{relativeTime(p.updatedAt)}に更新</Typography>
                  </Box>
                  <StatusPill tone={STATUS_META[p.status].tone}>{STATUS_META[p.status].label}</StatusPill>
                </ButtonBase>
              ))}
            </Stack>
          </Surface>

          <Stack spacing={{ xs: 2.5, md: 3 }}>
            <Surface>
              <SectionTitle title="公開の予定" icon={<CalendarClock size={18} color={tokens.color.info} />} />
              {scheduled.length === 0 ? (
                <Typography variant="body2" color="text.secondary">予約公開しているページはありません</Typography>
              ) : (
                <Stack spacing={1.25}>
                  {scheduled.map((p) => (
                    <Box key={p.id} sx={{ pl: 1.5, borderLeft: `3px solid ${tokens.color.info}` }}>
                      <Typography variant="body2" sx={{ fontWeight: 650 }} noWrap>{p.title}</Typography>
                      <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatDateTime(p.scheduledAt)} に公開</Typography>
                    </Box>
                  ))}
                </Stack>
              )}
            </Surface>

            <Surface tone="muted">
              <SectionTitle title="公開までの流れ" />
              <Stack component="ol" spacing={1.25} sx={{ listStyle: 'none', m: 0, p: 0 }}>
                {FLOW.map(({ icon: Icon, label, sub }, i) => (
                  <Stack component="li" key={label} direction="row" spacing={1.25} alignItems="center">
                    <Box sx={{ width: 30, height: 30, borderRadius: '50%', bgcolor: AREA.soft, color: AREA.color, display: 'grid', placeItems: 'center', flexShrink: 0 }}><Icon size={15} /></Box>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 650 }}>{i + 1}. {label}</Typography>
                      <Typography variant="caption">{sub}</Typography>
                    </Box>
                  </Stack>
                ))}
              </Stack>
            </Surface>
          </Stack>
        </Box>
      </Stack>
    </>
  );
}
