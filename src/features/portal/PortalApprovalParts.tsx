import { Box, Button, Collapse, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';
import { BadgeCheck, Lock, Network, Sparkles } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { StatusPill, Surface } from '@/components/ui';
import { formatDate, formatDateTime } from '@/services/time';
import { ymdToIso } from '@/features/projects/projectForm';
import { tokens } from '@/theme/tokens';
import { AREAS } from '@/components/layout/nav';
import { sitemapCreated } from '@/data/sitemap';
import { SitemapViewer } from '@/features/sitemap/SitemapViewer';
import { SitemapDevCommentView } from '@/features/sitemap/DevCommentView';
import type { SitemapState } from '@/types';
import type { ApprovalKey, ApprovalStep } from './portalSteps';

/**
 * お客様ポータルの確認・承認の部品（節目のカード・承認の確認・確認の文言）。PortalApprovalsPage.tsx（demo。DemoStore を読む）から
 * そのまま分けた（LIVE_SCHEDULE_PLAN U4: live の確認・承認のスケジュールの区画が同じ部品を使う。live から PortalApprovalsPage を import しない＝liveNoDemoStore）。
 * approvedLabel は live だけ（代理承認の「代理で承認済み」）。渡さなければ demo と同じ「承認済み」
 */

const AREA = AREAS.portal;

/** keepWhenLocked: 準備中でも中身を出す（要件定義書はデモの進め方の案内を出すため）。それ以外は前の節目が終わるまで中身を出さない */
export function StepCard({ step, children, action, keepWhenLocked = false, approvedLabel = '承認済み' }: { step: ApprovalStep; children?: ReactNode; action?: ReactNode; keepWhenLocked?: boolean; approvedLabel?: string }) {
  const approved = step.status === 'approved';
  const locked = step.status === 'locked';
  return (
    <Surface id={step.key} padding={{ xs: 2, md: 3 }} sx={{ scrollMarginTop: tokens.layout.topbar + 16, opacity: locked ? 0.8 : 1 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'flex-start', sm: 'center' }} sx={{ mb: children ? 2 : 0 }}>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{
            width: 36, height: 36, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', fontWeight: 700,
            bgcolor: approved ? tokens.color.successSoft : locked ? tokens.color.bgSubtle : AREA.soft,
            color: approved ? tokens.color.success : locked ? tokens.color.faint : AREA.color,
          }}>
            {approved ? <BadgeCheck size={18} /> : locked ? <Lock size={16} /> : step.no}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h4" component="h2">{step.title}</Typography>
            <Typography variant="caption" sx={{ display: 'block' }}>{locked ? step.lockedReason : step.ask}</Typography>
            {/* アフロが承認を依頼した日時（2026-11-17 会議） */}
            {!locked && !approved && step.requestedAt && (
              <Typography variant="caption" sx={{ display: 'block', color: tokens.color.muted }}>{formatDateTime(step.requestedAt)} に承認のお願いが届きました</Typography>
            )}
          </Box>
        </Stack>
        {approved ? (
          <StatusPill tone="success" icon={<BadgeCheck size={13} />}>{approvedLabel} {formatDateTime(step.approvedAt)}</StatusPill>
        ) : locked ? (
          <StatusPill tone="neutral">準備中</StatusPill>
        ) : action}
      </Stack>
      {(!locked || keepWhenLocked) && children}
    </Surface>
  );
}

export function ConfirmDialog({ open, title, body, onClose, onConfirm }: { open: boolean; title: string; body: string; onClose: () => void; onConfirm: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth aria-labelledby="portal-confirm-title">
      <DialogTitle id="portal-confirm-title">{title}</DialogTitle>
      <DialogContent><Typography variant="body2" color="text.secondary">{body}</Typography></DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button variant="outlined" onClick={onClose}>キャンセル</Button>
        <Button variant="contained" onClick={onConfirm}>承認する</Button>
      </DialogActions>
    </Dialog>
  );
}

export const CONFIRM: Record<Exclude<ApprovalKey, 'quality'>, { title: string; body: string; done: string }> = {
  requirements: { title: '要件定義書を承認しますか？', body: '承認すると、この内容をもとにサイトマップとデザインの制作に進みます。承認した日時が記録されます。', done: '要件定義書を承認しました' },
  sitemap: { title: 'サイトマップを承認しますか？', body: '承認すると、このページ構成でデザインを進めます。承認した日時が記録されます。', done: 'サイトマップを承認しました' },
  design: { title: 'このデザインで承認しますか？', body: '承認すると、採用したデザインで全ページの制作に進みます。承認後は案を変更できません。', done: 'トップデザインを承認しました' },
  schedule: { title: 'このスケジュールで承認しますか？', body: '承認すると、この日程でサイトマップ・デザインの制作に進みます。承認した日時が記録されます。', done: 'スケジュールを承認しました' },
  build: { title: '制作の完了を承認しますか？', body: '承認すると、公開前の品質チェック（納品検収）に進みます。承認した日時が記録されます。', done: '制作の完了を承認しました' },
  release: { title: 'サイトの公開を承認しますか？', body: '承認すると、アフロが公開予定日にサイトを公開します。承認した日時が記録されます。', done: 'サイトの公開を承認しました' },
};

/** スケジュールの節目の中身（予定日 3 つ）。日付は yyyy-mm-dd */
export function ScheduleDateCards({ schedule }: { schedule: { buildDue?: string; deliveryDate: string; releaseDate: string } }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', sm: 'repeat(3, minmax(0,1fr))' }, gap: 1.25 }}>
      {([['制作の完了予定', schedule.buildDue], ['納品予定日', schedule.deliveryDate], ['公開予定日', schedule.releaseDate]] as const).map(([label, ymd]) => (
        <Box key={label} sx={{ px: 1.75, py: 1.25, borderRadius: 2.5, bgcolor: tokens.color.surfaceMuted }}>
          <Typography variant="caption" component="p">{label}</Typography>
          <Typography variant="body1" sx={{ fontWeight: 700 }}>{ymd ? formatDate(ymdToIso(ymd) ?? undefined) : '—'}</Typography>
        </Box>
      ))}
    </Box>
  );
}

/**
 * サイトマップの節目（一覧・図・理由最大 3 件・開発担当者より）。PortalApprovalsPage.tsx の「3. サイトマップ」の区画をそのまま分けた
 * （LIVE_SITEMAP_IMPL_PLAN P-13・U4: live のお客様ポータルが同じ部品を使う。props だけ・DemoStore を読まない）。
 * sitemap: お客様に見せる版（demo は state.sitemap、live は版文書 sitemapVersions/r{N} から作った値）。action は「承認する」のボタン。
 * keepWhenLocked・approvedLabel は live だけ（調整中に前回承認の版を見せる・代理承認の表記）。渡さなければ demo と同じ。
 * 文字列（ページ名・理由・コメント）はテキストとして描画する（HTML として解釈しない。SM-26）
 */
export function SitemapApprovalSection({ step, sitemap, action, keepWhenLocked, approvedLabel }: { step: ApprovalStep; sitemap: SitemapState; action?: ReactNode; keepWhenLocked?: boolean; approvedLabel?: string }) {
  // サイトマップの図（閲覧だけ）を開いているか（0.39.5）
  const [showSitemap, setShowSitemap] = useState(false);
  const afterPages = sitemap.after.nodes;
  const newPages = afterPages.filter((n) => n.data.kind === 'new');
  return (
    <StepCard step={step} action={action} {...(keepWhenLocked !== undefined ? { keepWhenLocked } : {})} {...(approvedLabel !== undefined ? { approvedLabel } : {})}>
      {/* サイトマップは要件定義書の承認のときに作る（0.29.4）。承認前はこの欄ごと隠れるが、念のため未作成でも空の一覧を出さない */}
      {!sitemapCreated(sitemap) ? (
        <Typography variant="body2" color="text.secondary">アフロがサイトマップを作成しています。できあがると、ここでページ構成をご確認いただけます。</Typography>
      ) : (
        <>
          <Typography variant="body2" sx={{ mb: 1.5 }}>
            リニューアル後は <b>{afterPages.length}</b> ページの構成です（新しく作るページ <b>{newPages.length}</b>）。
          </Typography>
          <Box component="ul" sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, listStyle: 'none', m: 0, p: 0 }}>
            {afterPages.map((n) => (
              <Box
                component="li" key={n.id} title={n.data.reason}
                sx={{
                  px: 1.25, py: 0.5, borderRadius: 2, fontSize: 13, fontWeight: 600,
                  bgcolor: n.data.kind === 'new' ? AREA.soft : tokens.color.bgSubtle, color: n.data.kind === 'new' ? AREA.color : tokens.color.inkSoft,
                }}
              >
                {n.data.kind === 'new' && <Sparkles size={12} style={{ marginRight: 4, verticalAlign: '-1px' }} />}
                {n.data.label}
              </Box>
            ))}
          </Box>
          <Button size="small" variant="outlined" startIcon={<Network size={15} />} aria-expanded={showSitemap} onClick={() => setShowSitemap((v) => !v)} sx={{ mt: 2 }}>
            {showSitemap ? 'サイトマップの図を閉じる' : 'サイトマップの図を見る'}
          </Button>
          <Collapse in={showSitemap} unmountOnExit>
            <Box sx={{ mt: 1.5 }}><SitemapViewer sitemap={sitemap} /></Box>
          </Collapse>
          {newPages.some((n) => n.data.reason) && (
            <Stack spacing={0.75} sx={{ mt: 2 }}>
              {newPages.filter((n) => n.data.reason).slice(0, 3).map((n) => (
                <Typography key={n.id} variant="caption" sx={{ display: 'block' }}>
                  <b>{n.data.label}</b>: {n.data.reason}
                </Typography>
              ))}
            </Stack>
          )}
          {/* 開発担当者からのコメント（読むだけ。2026-11-17 会議。AI の改善理由の後に、開発者の意図を出す） */}
          {sitemap.devComment?.text && <Box sx={{ mt: 2 }}><SitemapDevCommentView comment={sitemap.devComment} /></Box>}
        </>
      )}
    </StepCard>
  );
}
