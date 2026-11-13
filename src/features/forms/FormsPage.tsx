import {
  Box, Button, ButtonBase, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, Stack, Switch, Tab, Tabs, Typography,
} from '@mui/material';
import { CheckCircle2, Download, Inbox, Pencil, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { FormDef, FormSubmission } from '@/types';
import { PageHeader, SectionTitle, StatusPill, Surface } from '@/components/ui';
import { areaOf } from '@/components/layout/nav';
import { currentProject, useDemo } from '@/store/DemoStore';
import { isSiteLive } from '@/data/projectContent';
import { SiteNotLive } from '@/features/projects/SiteNotLive';
import { useDevUser } from '@/features/dev/useDevUser';
import { useToast } from '@/hooks/useToast';
import { useFullScreenDialog } from '@/hooks/useMediaQueries';
import { formatDateTime } from '@/services/time';
import { downloadText } from '@/services/download';
import { jstStamp, toCsv } from '@/services/csv';
import { tokens } from '@/theme/tokens';
import { fieldTypeLabel, formsOf, openCount, submissionRows } from '@/data/forms';
import { reportRecipients } from '@/data/reportSend';
import { clientAccountsState } from '@/store/reducer';
import { FormEditorDialog } from './FormEditorDialog';

type Mode = 'dev' | 'portal' | 'admin';

const HEADER: Record<Mode, { eyebrow: string; description: string }> = {
  dev: { eyebrow: '⑤ 運用', description: 'サイトのフォーム（お問い合わせなど）の項目と通知先を管理します。受信した問い合わせへの対応はお客様がポータルで行います。' },
  portal: { eyebrow: 'お客様ポータル', description: 'サイトのフォームから届いた問い合わせを確認し、対応状況を記録します。CSV で保存できます（受信の見本は架空のデータです）。' },
  admin: { eyebrow: 'プロジェクト', description: 'フォームと受信件数の一覧です（管理者画面は見るだけ）。' },
};

/**
 * フォーム管理（0.37.0。案件ごと）。1 つの部品を画面ごとに出し分ける（表示の出し分けで、セキュリティ境界ではない。reducer でも確かめる）。
 * - 開発者画面（/dev/forms）: フォームの作成・編集・受付の停止。問い合わせは見るだけ
 * - お客様ポータル（/portal/forms）: 問い合わせの確認・対応状況・CSV。フォームの定義は見るだけ
 * - 管理者画面（/forms）: フォームと件数だけ
 */
export default function FormsPage() {
  const { state } = useDemo();
  const project = currentProject(state);
  const area = areaOf(useLocation().pathname);
  const mode: Mode = area === 'dev' ? 'dev' : area === 'portal' ? 'portal' : 'admin';
  if (!isSiteLive(project.stage)) {
    return (
      <>
        <PageHeader eyebrow={HEADER[mode].eyebrow} icon={<Inbox size={15} />} title="フォーム" description={HEADER[mode].description} />
        <SiteNotLive icon={<Inbox size={26} />} feature="フォーム" />
      </>
    );
  }
  return <Forms key={project.id} mode={mode} />;
}

function Forms({ mode }: { mode: Mode }) {
  const { state, dispatch } = useDemo();
  const me = useDevUser();
  const toast = useToast();
  const project = currentProject(state);
  const data = formsOf(state);
  const [tab, setTab] = useState(data.forms[0]?.id ?? '');
  const [editing, setEditing] = useState<FormDef | 'new' | null>(null);
  const [detail, setDetail] = useState<FormSubmission | null>(null);
  const form = data.forms.find((f) => f.id === tab) ?? data.forms[0];
  const subs = form ? data.submissions.filter((s) => s.formId === form.id) : [];
  // 未対応を先に、それぞれ新しい順
  const sorted = [...subs].sort((a, b) => (a.status === b.status ? b.at.localeCompare(a.at) : a.status === 'open' ? -1 : 1));
  const defaultRecipients = reportRecipients(clientAccountsState(state), project).flatMap((r) => (r.email ? [r.email] : []));

  const exportCsv = () => {
    if (!form) return;
    downloadText(`問い合わせ_${form.name}_${project.siteName}.csv`, toCsv(submissionRows(form, sorted, jstStamp)), 'text/csv;charset=utf-8');
  };

  return (
    <>
      <PageHeader
        eyebrow={HEADER[mode].eyebrow}
        icon={<Inbox size={15} />}
        title="フォーム"
        description={HEADER[mode].description}
        actions={mode === 'dev' ? <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => setEditing('new')}>新しいフォーム</Button> : undefined}
      />

      {data.forms.length === 0 ? (
        <Surface><Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>フォームがありません。{mode === 'dev' ? '「新しいフォーム」から作成できます。' : ''}</Typography></Surface>
      ) : (
        <>
          <Tabs value={form?.id ?? false} onChange={(_, v: string) => setTab(v)} variant="scrollable" allowScrollButtonsMobile aria-label="フォーム" sx={{ mb: 2 }}>
            {data.forms.map((f) => <Tab key={f.id} value={f.id} label={`${f.name}${openCount(data, f.id) ? `（未対応 ${openCount(data, f.id)}）` : ''}`} />)}
          </Tabs>
          {form && (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', lg: 'minmax(0,1fr) 360px' }, gap: 3, alignItems: 'start' }}>
              <Surface>
                <SectionTitle
                  title={`受信した問い合わせ（${subs.length} 件）`}
                  icon={<Inbox size={18} />}
                  action={mode === 'portal' && subs.length > 0 ? <Button size="small" variant="outlined" startIcon={<Download size={15} />} onClick={exportCsv}>CSVで保存</Button> : undefined}
                />
                {mode === 'admin' ? (
                  <Typography variant="body2" color="text.secondary">未対応 {openCount(data, form.id)} 件・対応済み {subs.length - openCount(data, form.id)} 件（内容はお客様ポータル・開発者画面で確認できます）</Typography>
                ) : sorted.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>まだ問い合わせはありません。</Typography>
                ) : (
                  <Stack component="ul" spacing={1} sx={{ listStyle: 'none', p: 0, m: 0 }}>
                    {sorted.map((s) => {
                      const name = s.values[form.fields[0]?.id] ?? '';
                      const body = form.fields.filter((f) => f.type === 'textarea').map((f) => s.values[f.id]).find(Boolean) ?? '';
                      return (
                        <Box component="li" key={s.id}>
                          <ButtonBase onClick={() => setDetail(s)} sx={{ width: '100%', textAlign: 'left', display: 'block', p: 1.5, borderRadius: '12px', border: `1px solid ${tokens.color.border}`, '&:hover': { bgcolor: tokens.color.surfaceMuted } }}>
                            <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
                              <StatusPill tone={s.status === 'open' ? 'warning' : 'success'}>{s.status === 'open' ? '未対応' : '対応済み'}</StatusPill>
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>{name || '（名前なし）'}</Typography>
                              <Typography variant="caption" sx={{ ml: 'auto !important' }}>{formatDateTime(s.at)}</Typography>
                            </Stack>
                            {body && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflowWrap: 'anywhere' }}>{body}</Typography>}
                          </ButtonBase>
                        </Box>
                      );
                    })}
                  </Stack>
                )}
              </Surface>

              <Surface>
                <SectionTitle
                  title="フォームの設定"
                  action={mode === 'dev' ? <Button size="small" variant="outlined" startIcon={<Pencil size={15} />} onClick={() => setEditing(form)}>編集</Button> : undefined}
                />
                <Stack spacing={1.5}>
                  {mode === 'dev' ? (
                    <FormControlLabel
                      control={<Switch checked={form.enabled} onChange={(e) => { dispatch({ type: 'setFormEnabled', id: form.id, enabled: e.target.checked, devBy: me.id }); toast(e.target.checked ? '受付を再開しました' : '受付を停止しました', 'info'); }} />}
                      label={<Typography variant="body2" sx={{ fontWeight: 600 }}>受け付ける</Typography>}
                    />
                  ) : (
                    <Stack direction="row" spacing={1} alignItems="center"><Typography variant="body2" sx={{ fontWeight: 600 }}>受付</Typography><StatusPill tone={form.enabled ? 'success' : 'neutral'}>{form.enabled ? '受付中' : '停止中'}</StatusPill></Stack>
                  )}
                  <Box>
                    <Typography variant="caption" sx={{ fontWeight: 600 }}>項目</Typography>
                    <Stack component="ol" spacing={0.5} sx={{ pl: 2.5, m: 0, mt: 0.5 }}>
                      {form.fields.map((f) => (
                        <Typography component="li" variant="body2" key={f.id}>
                          {f.label}<Typography component="span" variant="caption">（{fieldTypeLabel(f.type)}{f.required ? '・必須' : ''}{f.options ? `：${f.options.join(' / ')}` : ''}）</Typography>
                        </Typography>
                      ))}
                    </Stack>
                  </Box>
                  <Box>
                    <Typography variant="caption" sx={{ fontWeight: 600 }}>通知先</Typography>
                    {form.recipients.map((r) => <Typography key={r} variant="body2" sx={{ overflowWrap: 'anywhere' }}>{r}</Typography>)}
                    <Typography variant="caption" component="p">デモのため通知のメールは送信されません</Typography>
                  </Box>
                  <Typography variant="caption">最終更新 {formatDateTime(form.updatedAt)}・{form.updatedBy}</Typography>
                </Stack>
              </Surface>
            </Box>
          )}
        </>
      )}

      {editing && (
        <FormEditorDialog
          form={editing === 'new' ? undefined : editing}
          forms={data.forms}
          defaultRecipients={defaultRecipients}
          onClose={() => setEditing(null)}
          onSave={(d) => {
            dispatch({ type: 'saveForm', form: d, devBy: me.id });
            setEditing(null);
            toast(`フォーム「${d.name.trim()}」を保存しました`);
          }}
        />
      )}
      {detail && form && mode !== 'admin' && (
        <SubmissionDialog
          form={form}
          sub={data.submissions.find((s) => s.id === detail.id) ?? detail}
          canHandle={mode === 'portal'}
          onClose={() => setDetail(null)}
          onStatus={(status) => {
            dispatch({ type: 'setSubmissionStatus', id: detail.id, status, by: 'client' });
            toast(status === 'done' ? '対応済みにしました' : '未対応に戻しました', 'info');
          }}
        />
      )}
    </>
  );
}

function SubmissionDialog({ form, sub, canHandle, onClose, onStatus }: { form: FormDef; sub: FormSubmission; canHandle: boolean; onClose: () => void; onStatus: (s: 'open' | 'done') => void }) {
  const fullScreen = useFullScreenDialog();
  const known = new Set(form.fields.map((f) => f.id));
  const removed = Object.entries(sub.values).filter(([k, v]) => !known.has(k) && v);
  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth fullScreen={fullScreen} aria-labelledby="sub-title">
      <DialogTitle id="sub-title" sx={{ pr: 6 }}>
        問い合わせの内容
        <Typography variant="caption" component="p">{form.name}・{formatDateTime(sub.at)} 受信</Typography>
        <IconButton onClick={onClose} aria-label="閉じる" sx={{ position: 'absolute', right: 12, top: 12 }}><X size={18} /></IconButton>
      </DialogTitle>
      <DialogContent>
        <Stack component="dl" spacing={1.5} sx={{ m: 0 }}>
          {form.fields.map((f) => (
            <Box key={f.id}>
              <Typography component="dt" variant="caption" sx={{ fontWeight: 600 }}>{f.label}</Typography>
              <Typography component="dd" variant="body2" sx={{ m: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{sub.values[f.id] || '—'}</Typography>
            </Box>
          ))}
          {removed.map(([k, v]) => (
            <Box key={k}>
              <Typography component="dt" variant="caption" sx={{ fontWeight: 600 }}>（削除した項目）</Typography>
              <Typography component="dd" variant="body2" sx={{ m: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{v}</Typography>
            </Box>
          ))}
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 2.5 }}>
          <StatusPill tone={sub.status === 'open' ? 'warning' : 'success'}>{sub.status === 'open' ? '未対応' : '対応済み'}</StatusPill>
          {sub.handledBy && <Typography variant="caption">{sub.handledBy}・{formatDateTime(sub.handledAt)}</Typography>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
        {canHandle ? (
          sub.status === 'open'
            ? <Button variant="contained" startIcon={<CheckCircle2 size={16} />} onClick={() => onStatus('done')}>対応済みにする</Button>
            : <Button variant="outlined" onClick={() => onStatus('open')}>未対応に戻す</Button>
        ) : (
          <Typography variant="caption" sx={{ mr: 'auto' }}>対応状況はお客様がポータルで記録します</Typography>
        )}
        <Button onClick={onClose}>閉じる</Button>
      </DialogActions>
    </Dialog>
  );
}
