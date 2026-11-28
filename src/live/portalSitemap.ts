import type { ApprovalStep } from '@/features/portal/portalSteps';
import type { LiveScheduleState, ScheduleSummary } from './schedule';
import { liveSitemapProjectState, sitemapConflict, SITEMAP_CONFLICT_TEXT, type ClientSitemapView, type LiveSitemapProjectState, type SitemapShown, type SitemapSummary } from './sitemap';

/**
 * お客様ポータルの確認・承認のサイトマップの区画（LIVE_SITEMAP_IMPL_PLAN U4）の純関数。
 * お客様に見せる値は版文書（sitemapVersions/r{N}）だけから組む（internal・aiDrafts を読まない＝D-4・S-1）。
 * React・Firebase の実体を import しない（tests/unit/livePortalSitemap.test.mjs が直接読む）。権限の実体は firestore.rules（siteApprOk）
 */

/** 区画の state（liveProjectView の site に渡す）。準備中（none）は null＝空のサイトマップ（approvalSteps が準備中にする） */
export function clientSitemapState(cv: ClientSitemapView, summary: SitemapSummary | null): LiveSitemapProjectState | null {
  if (cv.kind !== 'shown') return null;
  return liveSitemapProjectState(summary, null, cv.version);
}

/**
 * サイトマップの段階の前提（approvalSteps はスケジュールの承認でサイトマップを承認待ちにする）。
 * スケジュールを一度承認していれば承認済みとして扱う（LiveSitemapPage の scheduleApproved と同じ判定）。日付は使わない（区画の中身はサイトマップだけ）
 */
export function sitemapGateSchedule(summary: ScheduleSummary | null | undefined): LiveScheduleState | null {
  if (summary?.approvedRevision === undefined) return null;
  return { schedule: { deliveryDate: '', releaseDate: '', savedAt: '', savedBy: '', approvedAt: summary.approvedAt ?? summary.requestedAt ?? '1970-01-01T00:00:00.000Z' } };
}

/** 調整中（承認の後に下書きへ戻った）の案内。前回承認の版を見せる */
export const SITEMAP_ADJUSTING_TEXT = 'アフロがサイトマップを調整しています。調整が終わると、もう一度承認のお願いが届きます。下は前回ご承認いただいた構成です。';

/** 調整中は locked のまま前回承認の版を見せる（keepWhenLocked）。それ以外は approvalSteps の段階のまま */
export function clientSitemapStep(step: ApprovalStep, cv: ClientSitemapView): { step: ApprovalStep; keepWhenLocked?: boolean; approvedLabel: string } {
  const approvedLabel = cv.kind === 'shown' && cv.approvedVia === 'proxy' ? '代理で承認済み' : '承認済み';
  if (cv.kind === 'shown' && cv.status === 'adjusting' && step.status === 'locked') {
    return { step: { ...step, lockedReason: SITEMAP_ADJUSTING_TEXT }, keepWhenLocked: true, approvedLabel };
  }
  return { step, approvedLabel };
}

/** 「承認する」を押した時点の表示（P-3: 表示した版の revision・contentHash）。依頼中でない・アーカイブ中・ハッシュなしは null（押せない） */
export function clientSitemapShown(cv: ClientSitemapView, archived: boolean): SitemapShown | null {
  if (archived || cv.kind !== 'shown' || cv.status !== 'requested' || !cv.version.contentHash) return null;
  return { revision: cv.version.revision, contentHash: cv.version.contentHash };
}

/** 確認の間に版が変わったら送らない（AC-09）。送ってよければ null、変わっていれば「内容が変わりました」 */
export function sitemapApproveBlock(shown: SitemapShown, summary: SitemapSummary | null): string | null {
  return sitemapConflict(shown, summary) ? SITEMAP_CONFLICT_TEXT.approve : null;
}
