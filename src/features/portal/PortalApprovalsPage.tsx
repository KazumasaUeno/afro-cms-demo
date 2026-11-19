import { Box, Button, ButtonBase, Collapse, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';
import { ArrowLeft, ArrowRight, BadgeCheck, Check, CheckCircle2, ClipboardCheck, Download, ExternalLink, Eye, FileText, Lock, Maximize2, Network, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link as RouterLink, useHref, useLocation, useNavigate } from 'react-router-dom';
import { PageHeader, Reveal, StatusPill, Surface } from '@/components/ui';
import { currentProject, useDemo } from '@/store/DemoStore';
import { isSiteLive } from '@/data/projectContent';
import { useCurrentRequirements, useRepositories } from '@/repositories';
import { useWrite } from '@/hooks/useWrite';
import { useToast } from '@/hooks/useToast';
import { formatDate, formatDateTime } from '@/services/time';
import { ymdToIso } from '@/features/projects/projectForm';
import { offeredVariants } from '@/data/designs';
import { tokens } from '@/theme/tokens';
import type { DesignId } from '@/types';
import { AREAS } from '@/components/layout/nav';
import { DeviceFrame } from '@/features/design/DeviceFrame';
import { personalize, useDesignContext } from '@/features/design/designContext';
import { PageTabs, screenLabelOf } from '@/features/design/DesignStudioPage';
import { buildProposal } from '@/features/requirements/buildProposal';
import { approvalSteps, type ApprovalKey, type ApprovalStep } from './portalSteps';
import { sitemapCreated } from '@/data/sitemap';
import { pendingConfirmations } from '@/features/requirements/assignment';
import { buildRequirementsDocHtml, downloadRequirementsDoc } from '@/features/requirements/requirementsDoc';
import { SitemapViewer } from '@/features/sitemap/SitemapViewer';
import { SitemapDevCommentView } from '@/features/sitemap/DevComment';
import { useProjectRoutes } from '@/features/projects/projectRoutes';

const AREA = AREAS.portal;

/** keepWhenLocked: 準備中でも中身を出す（要件定義書はデモの進め方の案内を出すため）。それ以外は前の節目が終わるまで中身を出さない */
function StepCard({ step, children, action, keepWhenLocked = false }: { step: ApprovalStep; children?: ReactNode; action?: ReactNode; keepWhenLocked?: boolean }) {
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
          <StatusPill tone="success" icon={<BadgeCheck size={13} />}>承認済み {formatDateTime(step.approvedAt)}</StatusPill>
        ) : locked ? (
          <StatusPill tone="neutral">準備中</StatusPill>
        ) : action}
      </Stack>
      {(!locked || keepWhenLocked) && children}
    </Surface>
  );
}

function ConfirmDialog({ open, title, body, onClose, onConfirm }: { open: boolean; title: string; body: string; onClose: () => void; onConfirm: () => void }) {
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

const CONFIRM: Record<Exclude<ApprovalKey, 'quality'>, { title: string; body: string; done: string }> = {
  requirements: { title: '要件定義書を承認しますか？', body: '承認すると、この内容をもとにサイトマップとデザインの制作に進みます。承認した日時が記録されます。', done: '要件定義書を承認しました' },
  sitemap: { title: 'サイトマップを承認しますか？', body: '承認すると、このページ構成でデザインを進めます。承認した日時が記録されます。', done: 'サイトマップを承認しました' },
  design: { title: 'このデザインで承認しますか？', body: '承認すると、採用したデザインで全ページの制作に進みます。承認後は案を変更できません。', done: 'トップデザインを承認しました' },
  schedule: { title: 'このスケジュールで承認しますか？', body: '承認すると、この日程でサイトマップ・デザインの制作に進みます。承認した日時が記録されます。', done: 'スケジュールを承認しました' },
  build: { title: '制作の完了を承認しますか？', body: '承認すると、公開前の品質チェック（納品検収）に進みます。承認した日時が記録されます。', done: '制作の完了を承認しました' },
  release: { title: 'サイトの公開を承認しますか？', body: '承認すると、アフロが公開予定日にサイトを公開します。承認した日時が記録されます。', done: 'サイトの公開を承認しました' },
};

/**
 * preview: 管理者画面・開発者画面から、お客様への画面説明のために同じ画面を見るだけで開く（/client-view/approvals・/dev/client-view/approvals。
 * 0.38.0。2026-11-16 ユーザー指示）。承認・デザインの選択は記録しない（選択はこの画面の中だけの仮の表示）。表示の出し分けで、セキュリティ境界ではない
 */
export default function PortalApprovalsPage({ preview = false }: { preview?: boolean }) {
  // サイトマップ・デザインの承認は repository の範囲外（live では隠す。§14）なので DemoStore のまま
  const { state, dispatch } = useDemo();
  // デザイン案は案件ごと（ポータルは MINAMO COFFEE。0.29.5）
  const designCtx = useDesignContext();
  // 見本で表示する画面（0 = トップ、1 = 主要ページ。デザイン作成画面と同じ 2 画面。2026-11-19）
  const [screenNo, setScreen] = useState(0);
  const screen = Math.min(screenNo, designCtx.pages.length);
  // サイトマップの図（閲覧だけ）を開いているか（0.39.5）
  const [showSitemap, setShowSitemap] = useState(false);
  // 要件定義書の全文を新しいタブで開く（ダウンロードと同じ HTML。中の文字列は esc 済み。0.39.5）
  const openRequirementsDoc = () => {
    const url = URL.createObjectURL(new Blob([buildRequirementsDocHtml(state)], { type: 'text/html;charset=utf-8' }));
    // 'noopener' を付けると戻り値が常に null になり開けたか分からないため、開いた後に opener を外す
    const win = window.open(url, '_blank');
    if (win) win.opener = null;
    else toast('新しいタブを開けませんでした。ブラウザのポップアップの設定をご確認ください（「要件定義書をダウンロード（PDF）」でも全文を見られます）', 'info');
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };
  // 全画面プレビュー（新しいタブ）の URL。basename つきにする（0.39.4）
  const previewBase = useHref('/design-preview');
  const previewHref = (design: string) => `${previewBase}?${new URLSearchParams({ project: designCtx.projectId, design, screen: String(screen) })}`;
  const { approvals } = useRepositories();
  const { data: req } = useCurrentRequirements();
  const toast = useToast();
  const write = useWrite();
  const navigate = useNavigate();
  const { hash } = useLocation();
  const projectRoutes = useProjectRoutes();
  // 説明用の表示でのデザインの仮の選択（保存しない）
  const [previewDesign, setPreviewDesign] = useState<DesignId | null>(null);
  const selectedDesign = preview ? (previewDesign ?? state.design.selected) : state.design.selected;
  // 出す案は A・B・C の 3 つ（2026-11-19 ユーザー指示）
  const portalVariants = offeredVariants(state.design.selected).map((v) => personalize(v, designCtx));
  const fullscreenVariant = portalVariants.find((v) => v.id === selectedDesign) ?? portalVariants[0];
  const [confirm, setConfirm] = useState<Exclude<ApprovalKey, 'quality'> | null>(null);
  // 閉じるアニメーションの間も文言を残す（null にすると一瞬空になる）
  const lastConfirm = useRef<Exclude<ApprovalKey, 'quality'>>('requirements');
  if (confirm) lastConfirm.current = confirm;
  // 要件定義書の段階は repository の値から導く（B0 レビュー Minor。サイトマップ・デザイン・品質は DemoStore のまま）
  const steps = approvalSteps({ ...state, requirements: req });
  const byKey = Object.fromEntries(steps.map((s) => [s.key, s])) as Record<ApprovalKey, ApprovalStep>;
  const pending = pendingConfirmations(req);
  const proposal = useMemo(() => buildProposal(req.answers, req.competitors), [req.answers, req.competitors]);
  const afterPages = state.sitemap.after.nodes;
  const newPages = afterPages.filter((n) => n.data.kind === 'new');

  // ホームの「ご確認をお願いしたいこと」から #sitemap などで来たら、その項目までスクロール
  useEffect(() => {
    if (!hash) return;
    const t = window.setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' }), 60);
    return () => window.clearTimeout(t);
  }, [hash]);

  const approve = () => {
    if (!confirm) return;
    if (preview) {
      toast('説明用の表示のため、承認は記録されません', 'info');
      setConfirm(null);
      return;
    }
    if (confirm === 'requirements') void write(approvals.approveRequirements(req.projectId, 'client'), CONFIRM.requirements.done);
    else {
      if (confirm === 'sitemap') dispatch({ type: 'approveSitemap', by: 'client' });
      if (confirm === 'design') dispatch({ type: 'approveDesign', by: 'client' });
      if (confirm === 'schedule') dispatch({ type: 'approveSchedule', by: 'client' });
      if (confirm === 'build') dispatch({ type: 'approveBuild', by: 'client' });
      if (confirm === 'release') dispatch({ type: 'approveRelease', by: 'client' });
      toast(CONFIRM[confirm].done);
    }
    setConfirm(null);
  };

  const approveBtn = (key: Exclude<ApprovalKey, 'quality'>, disabled = false) => (
    <Button variant="contained" startIcon={<CheckCircle2 size={16} />} disabled={disabled} onClick={() => setConfirm(key)} sx={{ flexShrink: 0, alignSelf: { xs: 'stretch', sm: 'auto' } }}>
      承認する
    </Button>
  );

  return (
    <>
      {preview && (
        <Button component={RouterLink} to={projectRoutes.detail(currentProject(state).id)} size="small" startIcon={<ArrowLeft size={16} />} sx={{ mb: 2, ml: -1 }}>
          プロジェクト詳細
        </Button>
      )}
      {preview && (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} role="note" sx={{ mb: 3, px: 2, py: 1.5, borderRadius: 3, bgcolor: tokens.color.infoSoft, color: tokens.color.infoInk }}>
          <Eye size={18} style={{ flexShrink: 0 }} aria-hidden />
          <Typography variant="body2" sx={{ flex: 1, color: 'inherit', fontWeight: 600 }}>
            お客様ポータルの画面を、説明用に表示しています。承認・デザインの選択をしても記録されません。
          </Typography>
        </Stack>
      )}
      <PageHeader
        eyebrow={preview ? 'お客様ポータル（説明用の表示）' : 'お客様ポータル'}
        icon={<ClipboardCheck size={15} />}
        title="確認・承認"
        description="制作の節目ごとに、内容をご確認のうえ承認をお願いします。承認した日時はアフロの管理画面にも記録されます。"
      />

      <Stack spacing={{ xs: 2, md: 2.5 }}>
        {/* 1. 要件定義書 */}
        <Reveal>
          {/* 準備中の中身はヒアリング前（デモの進め方の案内）だけ出す。AI 分析の後でもアフロが依頼するまでは出さない（2026-11-17 会議） */}
          <StepCard step={byKey.requirements} action={approveBtn('requirements', pending.length > 0)} keepWhenLocked={req.status === 'draft'}>
            {byKey.requirements.status === 'waiting' && pending.length > 0 && (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} role="status" sx={{ mb: 2, px: 1.5, py: 1, borderRadius: 2, bgcolor: tokens.color.warningSoft }}>
                <Typography variant="caption" sx={{ flex: 1, color: tokens.color.warningInk, fontWeight: 650 }}>
                  アフロが回答の内容を確認しています（{pending.length} 問）。確認が終わると承認できます。
                </Typography>
              </Stack>
            )}
            {req.status !== 'draft' && (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }}>
                <Button size="small" variant="outlined" startIcon={<FileText size={15} />} endIcon={<ExternalLink size={14} />} onClick={openRequirementsDoc}>
                  全文を新しいタブで見る
                </Button>
                <Button size="small" variant="outlined" startIcon={<Download size={15} />} onClick={() => void downloadRequirementsDoc(state, toast)}>
                  要件定義書をダウンロード（PDF）
                </Button>
              </Stack>
            )}
            {req.status === 'draft' ? (
              <Typography variant="caption" component="p" sx={{ px: 1.5, py: 1, borderRadius: 2, bgcolor: tokens.color.bgSubtle }}>
                デモ: 管理者画面の「AI Studio」でヒアリングの内容を入力して AI 分析すると、ここに要件定義書が届きます。
              </Typography>
            ) : (
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '200px minmax(0,1fr)' }, gap: 2 }}>
                <Stack direction="row" spacing={2} sx={{ p: 2, borderRadius: 3, bgcolor: tokens.color.surfaceMuted, alignItems: 'center', justifyContent: 'center' }}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="caption">現状</Typography>
                    <Typography sx={{ fontSize: 26, fontWeight: 750, color: tokens.color.muted }}>{proposal.currentScore}</Typography>
                  </Box>
                  <ArrowRight size={18} color={tokens.color.faint} />
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="caption">改善後の見込み</Typography>
                    <Typography sx={{ fontSize: 26, fontWeight: 750, color: AREA.color }}>{proposal.projectedScore}</Typography>
                  </Box>
                </Stack>
                <Stack component="ol" spacing={1} sx={{ m: 0, pl: 2.5 }}>
                  {proposal.points.slice(0, 4).map((pt) => (
                    <li key={pt.id}>
                      <Typography variant="body2" sx={{ fontWeight: 650 }}>{pt.title}</Typography>
                      <Typography variant="caption">{pt.impact}</Typography>
                    </li>
                  ))}
                </Stack>
              </Box>
            )}
          </StepCard>
        </Reveal>

        {/* 2. スケジュール（2026-11-17 ユーザー指示「各段階で最後に承認」） */}
        <Reveal delay={0.02}>
          <StepCard step={byKey.schedule} action={approveBtn('schedule')}>
            {state.schedule && (
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', sm: 'repeat(3, minmax(0,1fr))' }, gap: 1.25 }}>
                {([['制作の完了予定', state.schedule.buildDue], ['納品予定日', state.schedule.deliveryDate], ['公開予定日', state.schedule.releaseDate]] as const).map(([label, ymd]) => (
                  <Box key={label} sx={{ px: 1.75, py: 1.25, borderRadius: 2.5, bgcolor: tokens.color.surfaceMuted }}>
                    <Typography variant="caption" component="p">{label}</Typography>
                    <Typography variant="body1" sx={{ fontWeight: 700 }}>{ymd ? formatDate(ymdToIso(ymd) ?? undefined) : '—'}</Typography>
                  </Box>
                ))}
              </Box>
            )}
          </StepCard>
        </Reveal>

        {/* 3. サイトマップ */}
        <Reveal delay={0.04}>
          <StepCard step={byKey.sitemap} action={approveBtn('sitemap', !sitemapCreated(state.sitemap))}>
            {/* サイトマップは要件定義書の承認のときに作る（0.29.4）。承認前はこの欄ごと隠れるが、念のため未作成でも空の一覧を出さない */}
            {!sitemapCreated(state.sitemap) ? (
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
                  <Box sx={{ mt: 1.5 }}><SitemapViewer sitemap={state.sitemap} /></Box>
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
                {state.sitemap.devComment?.text && <Box sx={{ mt: 2 }}><SitemapDevCommentView comment={state.sitemap.devComment} /></Box>}
              </>
            )}
          </StepCard>
        </Reveal>

        {/* 4. トップデザイン */}
        <Reveal delay={0.08}>
          <StepCard step={byKey.design} action={approveBtn('design', !selectedDesign)}>
            {/* 1. 先にページを選ぶ（2026-11-17 会議: 左上から見るので最初に置く）→ 2. そのページで案を比べる */}
            {designCtx.pages.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <PageTabs ctx={designCtx} value={screen} onChange={setScreen} heading="1. ページを選ぶ" />
              </Box>
            )}
            <Typography variant="overline" component="p" sx={{ color: AREA.color, mb: 1 }}>
              {designCtx.pages.length > 0 ? '2. ' : ''}「{screenLabelOf(designCtx, screen)}」のデザイン案を比べて選ぶ
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: `repeat(${portalVariants.length}, minmax(0,1fr))` }, gap: 1.5 }} role="radiogroup" aria-label="採用するデザイン">
              {portalVariants.map((v) => {
                const selected = selectedDesign === v.id;
                const locked = !!state.design.approvedAt;
                return (
                  <ButtonBase
                    key={v.id}
                    role="radio"
                    aria-checked={selected}
                    disabled={locked && !selected}
                    onClick={() => { if (locked) return; if (preview) setPreviewDesign(v.id as DesignId); else dispatch({ type: 'selectDesign', id: v.id as DesignId }); }}
                    sx={{
                      display: 'block', textAlign: 'left', p: 1, borderRadius: 3, minWidth: 0,
                      border: `2px solid ${selected ? AREA.color : tokens.color.border}`,
                      '&.Mui-disabled': { opacity: 0.5 },
                    }}
                  >
                    <Box sx={{ position: 'relative', borderRadius: '10px', overflow: 'hidden', bgcolor: tokens.color.bgSubtle }}>
                      <DeviceFrame design={v.id} device="pc" screen={screen} thumbnail viewportHeight={720} />
                      {selected && (
                        <Box sx={{ position: 'absolute', top: 8, right: 8, width: 24, height: 24, borderRadius: '50%', bgcolor: AREA.color, color: tokens.color.onSuccess, display: 'grid', placeItems: 'center' }}>
                          <Check size={14} strokeWidth={3} />
                        </Box>
                      )}
                    </Box>
                    <Typography variant="overline" sx={{ display: 'block', mt: 1, color: AREA.color }}>{v.label}</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 650 }}>{v.name}</Typography>
                    <Typography variant="caption">{v.tagline}</Typography>
                  </ButtonBase>
                );
              })}
            </Box>
            {/* 全画面表示はカードの中に隠さず、1 つのボタンにする。何が開くか（案・ページ）をボタンに書く（2026-11-17 会議）。
                案を選ぶ前は Design A を開く（開いた先で案・ページ・端末を切り替えられる） */}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }} sx={{ mt: 2 }}>
              <Button
                component="a"
                href={previewHref(fullscreenVariant.id)}
                target="_blank"
                rel="noopener"
                variant="outlined"
                startIcon={<Maximize2 size={16} />}
                endIcon={<ExternalLink size={14} />}
                sx={{ justifyContent: 'flex-start', textAlign: 'left' }}
              >
                {fullscreenVariant.label}「{fullscreenVariant.name}」の{screenLabelOf(designCtx, screen)}を新しいタブで全画面表示
              </Button>
              <Typography variant="caption">{selectedDesign ? '選んだ案・ページを開きます。' : '案を選ぶと、その案を開きます。'}開いた先でも案・ページ・端末を切り替えられます。</Typography>
            </Stack>
            {!selectedDesign && <Typography variant="caption" sx={{ display: 'block', mt: 1.5 }}>案を 1 つ選ぶと承認できます。</Typography>}
          </StepCard>
        </Reveal>

        {/* 5. 制作の完了（2026-11-17） */}
        <Reveal delay={0.11}>
          <StepCard step={byKey.build} action={approveBtn('build')}>
            <Typography variant="body2" color="text.secondary">
              全ページの制作が{state.design.buildCompletedAt ? `${formatDate(state.design.buildCompletedAt)}に` : ''}完了しました。採用したデザインで仕上げたページをご確認ください。承認すると、公開前の品質チェック（納品検収）に進みます。
            </Typography>
          </StepCard>
        </Reveal>

        {/* 6. 品質チェック */}
        <Reveal delay={0.12}>
          <StepCard
            step={byKey.quality}
            action={<Button variant="contained" endIcon={<ArrowRight size={16} />} onClick={() => (preview ? toast('説明用の表示では、品質チェックの画面は開けません（お客様ポータルで開きます）', 'info') : navigate('/portal/quality'))} sx={{ flexShrink: 0, alignSelf: { xs: 'stretch', sm: 'auto' } }}>チェックする</Button>}
          >
            {byKey.quality.progress && (
              <Box>
                <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.75 }}>
                  <Typography variant="caption">お客様の確認</Typography>
                  <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 650 }}>{byKey.quality.progress.done} / {byKey.quality.progress.total}</Typography>
                </Stack>
                <Box sx={{ height: 8, borderRadius: 4, bgcolor: tokens.color.bgSubtle, overflow: 'hidden' }}>
                  <Box sx={{ height: '100%', width: `${(byKey.quality.progress.done / byKey.quality.progress.total) * 100}%`, bgcolor: AREA.color, transition: 'width .3s' }} />
                </Box>
              </Box>
            )}
          </StepCard>
        </Reveal>

        {/* 7. 公開（リリース。2026-11-17） */}
        <Reveal delay={0.14}>
          <StepCard step={byKey.release} action={approveBtn('release')}>
            <Typography variant="body2" color="text.secondary">
              公開予定日: {state.schedule ? formatDate(ymdToIso(state.schedule.releaseDate) ?? undefined) : '未定'}。承認すると、アフロがサイトを公開します。
            </Typography>
          </StepCard>
        </Reveal>

        {/* 公開後のページ・お知らせの更新の承認（2026-11-18 ユーザー指示「お客様、公開承認は確認・承認の中」。メニューから外し、ここから開く）。サイトの公開後だけ出す */}
        {!preview && isSiteLive(currentProject(state).stage) && (() => {
          const waiting = state.pages.filter((x) => x.status === 'review').length;
          return (
            <Reveal delay={0.16}>
              <Surface>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="h3" component="h2">ページ・お知らせの公開承認</Typography>
                      {waiting > 0 && <StatusPill tone="warning">承認待ち {waiting} 件</StatusPill>}
                    </Stack>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      {waiting > 0 ? 'アフロから公開の承認を依頼された更新があります。変更前と変更後を見比べて、承認するか差し戻してください。' : 'いま承認をお願いしている更新はありません。'}
                    </Typography>
                  </Box>
                  <Button variant={waiting > 0 ? 'contained' : 'outlined'} endIcon={<ArrowRight size={16} />} onClick={() => navigate('/portal/publish')} sx={{ flexShrink: 0, alignSelf: { xs: 'stretch', sm: 'auto' } }}>公開承認を開く</Button>
                </Stack>
              </Surface>
            </Reveal>
          );
        })()}
      </Stack>

      <ConfirmDialog
        open={!!confirm}
        title={CONFIRM[lastConfirm.current].title}
        body={CONFIRM[lastConfirm.current].body}
        onClose={() => setConfirm(null)}
        onConfirm={approve}
      />
    </>
  );
}
