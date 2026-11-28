import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button } from '@mui/material';
import { BadgeCheck, CheckCircle2 } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { PageHeader } from '@/components/ui';
import { RouteLoader } from '@/components/layout/RouteLoader';
import { useCurrentRequirements } from '@/repositories';
import { useToast } from '@/hooks/useToast';
import { blankWork } from '@/store/projectWork';
import { ProposalView } from '@/features/requirements/ProposalView';
import { HearingAnswersSection, NonFunctionalSection, ReqDocTabs, ScheduleSection, type ReqDocSectionId } from '@/features/requirements/RequirementsDocSections';
import { ApprovalHistory } from '@/features/projects/ApprovalHistory';
import { approvalSteps } from '@/features/portal/portalSteps';
import { CONFIRM, ConfirmDialog, ScheduleDateCards, SitemapApprovalSection, StepCard } from '@/features/portal/PortalApprovalParts';
import type { RequirementSession } from '@/types';
import { clientScheduleView, type ScheduleCurrent } from '../schedule';
import { clientApprovalShown, clientScheduleState, isPermissionDenied } from '../portalSchedule';
import { toProject, type ProjectDoc } from '../model';
import { useLiveProjects, useLiveSchedule, useLiveScheduleActions, useLiveSitemap, useLiveSitemapActions } from '../repositories';
import { clientSitemapView, type SitemapShown } from '../sitemap';
import { clientSitemapShown, clientSitemapState, clientSitemapStep, LIVE_SITEMAP_CONFIRM_BODY, sitemapApproveBlock, sitemapGateSchedule } from '../portalSitemap';
import { liveProjectView } from '../projectView';
import { EmptyState, LoadError } from './shared';

/**
 * お客様ポータルの確認・承認（live）。担当の 1 案件（accounts.projectId）だけ。
 * 準備中（draft）は内容を見せない。承認待ち・承認済みは保存された要件定義書（承認の対象と同じ写し）を見せる。
 * 要件定義書は開発者の画面と同じ 4 つのタブ（demo の RequirementsDocPage と同じ部品）。「つくり方」は開発者の手順なので出さない（REQDOC_U4_UI.md §3.4）。
 * スケジュールの承認は要件定義書の章（タブの「スケジュール」）とは別の区画（C-05。demo の確認・承認の「2. スケジュール」と同じ部品）。
 * サイトマップの承認はその下（LIVE_SITEMAP_IMPL_PLAN U4。demo の「3. サイトマップ」と同じ部品 SitemapApprovalSection）。承認の履歴はその下
 */
export default function PortalApprovalPage() {
  const { data: list, loading: pLoading, error: pError } = useLiveProjects();
  const { data: req, loading, error } = useCurrentRequirements();
  const project = list[0];
  const [section, setSection] = useState<ReqDocSectionId>('proposal');

  if (pLoading || loading) return <RouteLoader label="確認・承認" />;
  if (pError || error) return <LoadError what="要件定義書" />;
  if (!project) return <EmptyState title="ご確認いただく内容はまだありません" body="アフロの担当者からご連絡します。" />;

  return (
    <Box>
      <PageHeader
        eyebrow="お客様ポータル"
        icon={<BadgeCheck size={14} />}
        title="確認・承認"
        description={`${project.siteName}（${project.clientName}）の要件定義書です。`}
      />
      {req.status === 'draft' ? (
        <EmptyState title="要件定義書を準備しています" body="アフロの担当者がヒアリングの内容をまとめています。準備ができたらここで確認・承認していただけます。" />
      ) : (
        <Box sx={{ display: 'grid', gap: 2.5 }}>
          <Box>
            <ReqDocTabs value={section} onChange={setSection} />
            {section === 'proposal' && <ProposalView variant="client" />}
            {section === 'answers' && <HearingAnswersSection req={req} />}
            {section === 'schedule' && <ScheduleSection />}
            {section === 'nonfunctional' && <NonFunctionalSection />}
          </Box>
          <ScheduleApproval doc={project} req={req} />
          <SitemapApproval doc={project} req={req} />
          <ApprovalHistory projectId={project.id} siteName={project.siteName} />
        </Box>
      )}
    </Box>
  );
}

/**
 * スケジュールの承認の区画（LIVE_SCHEDULE_PLAN U4・C-05・L-18）。段階は demo と同じ approvalSteps の schedule（未作成・再計画中は準備中／依頼中は承認待ち／承認済み）。
 * 承認は「承認する」を押した時点に表示していた版（revision・editSeq・写し）で送る。確認の間に WBS が変わっていれば送らず「内容が変わりました」
 */
function ScheduleApproval({ doc, req }: { doc: ProjectDoc; req: RequirementSession }) {
  const pid = doc.id;
  const toast = useToast();
  const { hash } = useLocation();
  const sch = useLiveSchedule(pid);
  const actions = useLiveScheduleActions(pid);
  const denied = isPermissionDenied(sch.error);
  const cv = useMemo(
    () => (denied ? { kind: 'none' as const } : clientScheduleView(sch.summary, sch.current, sch.approvedCopy)),
    [denied, sch.summary, sch.current, sch.approvedCopy],
  );
  const project = useMemo(() => toProject(doc), [doc]);
  const st = useMemo(() => clientScheduleState(cv, sch.summary), [cv, sch.summary]);
  const view = useMemo(() => liveProjectView(project, req, [], blankWork(pid), st), [project, req, pid, st]);
  const [shown, setShown] = useState<ScheduleCurrent | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  // /portal/approvals#schedule（スケジュールの画面の「スケジュールを承認する」）で区画へ移る（demo の PortalApprovalsPage と同じ）
  const ready = !sch.loading;
  useEffect(() => {
    if (hash !== '#schedule' || !ready) return undefined;
    const t = window.setTimeout(() => document.getElementById('schedule')?.scrollIntoView({ block: 'start' }), 60);
    return () => window.clearTimeout(t);
  }, [hash, ready]);

  if (sch.loading) return null;
  if (sch.error && !denied) return <LoadError what="スケジュール" />;

  const step = approvalSteps(view).find((s) => s.key === 'schedule');
  if (!step) return null;
  const canApprove = !doc.archived && !!clientApprovalShown(sch.summary, sch.current);
  const approve = async () => {
    if (!shown || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await actions.approve(shown);
      toast(CONFIRM.schedule.done);
      setShown(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : '承認できませんでした。接続を確かめてください', 'error');
      setShown(null);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const dates = view.schedule;

  return (
    <>
      <StepCard
        step={step}
        approvedLabel={sch.summary?.approvedVia === 'proxy' ? '代理で承認済み' : '承認済み'}
        action={(
          <Button
            variant="contained" startIcon={<CheckCircle2 size={16} />} disabled={!canApprove || busy}
            onClick={() => setShown(clientApprovalShown(sch.summary, sch.current))}
            sx={{ flexShrink: 0, alignSelf: { xs: 'stretch', sm: 'auto' } }}
          >
            承認する
          </Button>
        )}
      >
        {dates && <ScheduleDateCards schedule={dates} />}
      </StepCard>
      <ConfirmDialog
        open={!!shown && !busy}
        title={CONFIRM.schedule.title}
        body={CONFIRM.schedule.body}
        onClose={() => setShown(null)}
        onConfirm={() => { void approve(); }}
      />
    </>
  );
}

/**
 * サイトマップの承認の区画（LIVE_SITEMAP_IMPL_PLAN U4・P-3・AC-09）。お客様が読むのは版文書だけ（useLiveSitemap の version。internal・aiDrafts を購読しない）。
 * 段階は demo と同じ approvalSteps の sitemap（未作成・下書きは準備中／依頼中は承認待ち／承認済み（代理の表記）／調整中は前回承認の版）。
 * 承認は「承認する」を押した時点に表示していた版（revision・contentHash）で送る。確認の間に版が変わっていれば送らず「内容が変わりました」
 */
function SitemapApproval({ doc, req }: { doc: ProjectDoc; req: RequirementSession }) {
  const pid = doc.id;
  const toast = useToast();
  const { hash } = useLocation();
  const sm = useLiveSitemap(pid);
  const actions = useLiveSitemapActions(pid);
  const denied = isPermissionDenied(sm.error);
  const cv = useMemo(() => (denied ? { kind: 'none' as const } : clientSitemapView(sm.summary, sm.version)), [denied, sm.summary, sm.version]);
  const project = useMemo(() => toProject(doc), [doc]);
  const view = useMemo(
    () => liveProjectView(project, req, [], blankWork(pid), sitemapGateSchedule(doc.schedule), clientSitemapState(cv, sm.summary)),
    [project, req, pid, doc.schedule, cv, sm.summary],
  );
  const [shown, setShown] = useState<SitemapShown | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  // /portal/approvals#sitemap（ホーム・相談の案内）で区画へ移る（demo の PortalApprovalsPage と同じ）
  const ready = !sm.loading;
  useEffect(() => {
    if (hash !== '#sitemap' || !ready) return undefined;
    const t = window.setTimeout(() => document.getElementById('sitemap')?.scrollIntoView({ block: 'start' }), 60);
    return () => window.clearTimeout(t);
  }, [hash, ready]);

  if (sm.loading) return null;
  if (sm.error && !denied) return <LoadError what="サイトマップ" />;

  const base = approvalSteps(view, { designAvailable: false }).find((s) => s.key === 'sitemap');
  if (!base) return null;
  const { step, keepWhenLocked, approvedLabel } = clientSitemapStep(base, cv);
  const canApprove = !!clientSitemapShown(cv, !!doc.archived);
  const approve = async () => {
    if (!shown || busyRef.current) return;
    // 確認の間に版が変わった（取り下げ・依頼し直し）なら送らない（AC-09）
    const block = sitemapApproveBlock(shown, sm.summary);
    if (block) {
      toast(block, 'error');
      setShown(null);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      await actions.approve(shown);
      toast(CONFIRM.sitemap.done);
      setShown(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : '承認できませんでした。接続を確かめてください', 'error');
      setShown(null);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <>
      <SitemapApprovalSection
        step={step}
        sitemap={view.sitemap}
        approvedLabel={approvedLabel}
        {...(keepWhenLocked ? { keepWhenLocked } : {})}
        action={(
          <Button
            variant="contained" startIcon={<CheckCircle2 size={16} />} disabled={!canApprove || busy}
            onClick={() => setShown(clientSitemapShown(cv, !!doc.archived))}
            sx={{ flexShrink: 0, alignSelf: { xs: 'stretch', sm: 'auto' } }}
          >
            承認する
          </Button>
        )}
      />
      <ConfirmDialog
        open={!!shown && !busy}
        title={CONFIRM.sitemap.title}
        body={LIVE_SITEMAP_CONFIRM_BODY}
        onClose={() => setShown(null)}
        onConfirm={() => { void approve(); }}
      />
    </>
  );
}
