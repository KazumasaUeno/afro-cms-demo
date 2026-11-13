import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { CheckCircle2, Eye, GitCompare, Inbox, Megaphone, FileText, Stamp, Undo2 } from 'lucide-react';
import { useState } from 'react';
import type { CmsPage } from '@/types';
import { MemberAvatar, PageHeader, Reveal, SectionTitle, StatusPill, Surface } from '@/components/ui';
import { currentProject, useDemo } from '@/store/DemoStore';
import { isSiteLive } from '@/data/projectContent';
import { SiteNotLive } from '@/features/projects/SiteNotLive';
import { CLIENT_PROJECT_ID } from '@/components/layout/nav';
import { useToast } from '@/hooks/useToast';
import { formatDateTime, relativeTime } from '@/services/time';
import { memberById } from '@/data/members';
import { tokens } from '@/theme/tokens';
import { TYPE_LABEL } from '@/features/cms/cmsUtils';
import { PreviewDialog } from '@/features/cms/PreviewDialog';
import { CompareDialog } from '@/features/cms/CompareDialog';

const COMMENT_MAX = 200;

function RejectDialog({ page, onClose, onConfirm }: { page: CmsPage | null; onClose: () => void; onConfirm: (comment: string) => void }) {
  const [comment, setComment] = useState('');
  const err = comment.length > COMMENT_MAX ? `${COMMENT_MAX}文字以内にしてください` : null;
  return (
    <Dialog open={!!page} onClose={onClose} maxWidth="xs" fullWidth aria-labelledby="reject-title" TransitionProps={{ onExited: () => setComment('') }}>
      <DialogTitle id="reject-title">差し戻す</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>「{page?.title}」を下書きに戻します。直してほしい点を書いておくと、コメントとして最近の動き（アクティビティ）に残ります。</Typography>
        <TextField
          fullWidth multiline minRows={3} label="コメント（任意）" value={comment} onChange={(e) => setComment(e.target.value)}
          error={!!err} helperText={err ?? `${comment.length} / ${COMMENT_MAX}`}
          placeholder="例: 価格表の金額を最新のものに差し替えてください"
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button variant="outlined" onClick={onClose}>キャンセル</Button>
        <Button variant="contained" color="warning" disabled={!!err} onClick={() => onConfirm(comment)}>差し戻す</Button>
      </DialogActions>
    </Dialog>
  );
}

const HEADER = { eyebrow: 'お客様ポータル', title: '公開承認', description: '編集者から承認を依頼された更新です。プレビューと変更点を確認して、公開するか差し戻してください。' };

/** 承認待ちのページは案件ごと（0.30.0）。サイトの公開前の案件は案内だけ出す（2026-11-13 ユーザー指示） */
export default function PublishApprovalsPage() {
  const { state } = useDemo();
  const project = currentProject(state);
  if (!isSiteLive(project.stage)) {
    return (
      <>
        <PageHeader {...HEADER} icon={<Stamp size={15} />} />
        <SiteNotLive icon={<Stamp size={26} />} feature="公開承認" />
      </>
    );
  }
  return <PublishApprovals key={project.id} />;
}

function PublishApprovals() {
  const { state, dispatch } = useDemo();
  const projectId = currentProject(state).id;
  const toast = useToast();
  const [preview, setPreview] = useState<CmsPage | null>(null);
  const [compare, setCompare] = useState<CmsPage | null>(null);
  const [reject, setReject] = useState<CmsPage | null>(null);
  const waiting = state.pages.filter((p) => p.status === 'review').sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  // 承認の記録もこの案件の分だけ（projectId の無い古い記録は MINAMO COFFEE のもの）
  const history = state.approvalLogs.filter((l) => l.target.startsWith('CMS / ') && (l.projectId ?? CLIENT_PROJECT_ID) === projectId).slice(0, 8);

  return (
    <>
      <PageHeader {...HEADER} icon={<Stamp size={15} />} />

      <Stack spacing={{ xs: 2.5, md: 3 }}>
        <Box>
          <SectionTitle title="承認待ち" sub={<StatusPill tone={waiting.length ? 'warning' : 'neutral'}>{waiting.length}件</StatusPill>} />
          {waiting.length === 0 ? (
            <Surface tone="muted" sx={{ textAlign: 'center', py: 5 }}>
              <Inbox size={28} color={tokens.color.faint} />
              <Typography variant="body2" sx={{ mt: 1, fontWeight: 600 }}>承認待ちの更新はありません</Typography>
              <Typography variant="caption">ページ編集で「承認依頼」を押すと、ここに届きます</Typography>
            </Surface>
          ) : (
            <Stack spacing={1.5}>
              {waiting.map((p, i) => {
                const author = memberById(p.authorId);
                return (
                  <Reveal key={p.id} delay={i * 0.04}>
                    <Surface>
                      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
                        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flex: 1, minWidth: 0 }}>
                          <Box sx={{ width: 40, height: 40, borderRadius: '12px', bgcolor: tokens.color.warningSoft, color: tokens.color.warning, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                            {p.type === 'news' ? <Megaphone size={18} /> : <FileText size={18} />}
                          </Box>
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="h6" noWrap>{p.title}</Typography>
                            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.25, minWidth: 0 }}>
                              <MemberAvatar id={author.id} size={18} />
                              <Typography variant="caption" noWrap>
                                {TYPE_LABEL[p.type]}・{author.name}・{relativeTime(p.updatedAt)}に依頼
                              </Typography>
                            </Stack>
                          </Box>
                        </Stack>
                        <Stack direction="row" spacing={1} sx={{ flexShrink: 0, flexWrap: 'wrap', rowGap: 1 }}>
                          <Tooltip title="公開プレビュー"><IconButton aria-label={`「${p.title}」の公開プレビュー`} onClick={() => setPreview(p)} sx={{ border: `1px solid ${tokens.color.border}` }}><Eye size={17} /></IconButton></Tooltip>
                          <Tooltip title="変更前後の比較"><IconButton aria-label={`「${p.title}」の変更前後を比較`} onClick={() => setCompare(p)} sx={{ border: `1px solid ${tokens.color.border}` }}><GitCompare size={17} /></IconButton></Tooltip>
                          <Button variant="outlined" startIcon={<Undo2 size={16} />} onClick={() => setReject(p)} sx={{ flex: { xs: 1, sm: '0 0 auto' } }}>差し戻す</Button>
                          <Button
                            variant="contained" startIcon={<CheckCircle2 size={16} />} sx={{ flex: { xs: 1, sm: '0 0 auto' } }}
                            onClick={() => { dispatch({ type: 'reviewPage', id: p.id, decision: 'approve', by: 'client' }); toast(`「${p.title}」を承認して公開しました（シミュレーション）`); }}
                          >
                            承認して公開
                          </Button>
                        </Stack>
                      </Stack>
                    </Surface>
                  </Reveal>
                );
              })}
            </Stack>
          )}
        </Box>

        <Surface>
          <SectionTitle title="承認の履歴" />
          {history.length === 0 ? (
            <Typography variant="body2" color="text.secondary">まだ履歴はありません</Typography>
          ) : (
            <Stack component="ul" spacing={1.25} sx={{ listStyle: 'none', m: 0, p: 0 }}>
              {history.map((l) => (
                <Stack component="li" key={l.id} direction="row" spacing={1.5} alignItems="baseline">
                  <Typography variant="caption" sx={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums', width: 108 }}>{formatDateTime(l.at)}</Typography>
                  <Typography variant="body2" sx={{ minWidth: 0 }}>
                    <Box component="span" sx={{ fontWeight: 650 }}>{l.target.replace(/^CMS \/ /, '')}</Box> を{l.action}
                    <Box component="span" sx={{ color: tokens.color.muted }}>（{l.actor}）</Box>
                  </Typography>
                </Stack>
              ))}
            </Stack>
          )}
        </Surface>
      </Stack>

      {preview && <PreviewDialog page={preview} open onClose={() => setPreview(null)} />}
      {compare && <CompareDialog page={compare} open onClose={() => setCompare(null)} />}
      <RejectDialog
        page={reject}
        onClose={() => setReject(null)}
        onConfirm={(comment) => {
          if (!reject) return;
          dispatch({ type: 'reviewPage', id: reject.id, decision: 'reject', comment, by: 'client' });
          toast(`「${reject.title}」を差し戻しました`, 'info');
          setReject(null);
        }}
      />
    </>
  );
}
