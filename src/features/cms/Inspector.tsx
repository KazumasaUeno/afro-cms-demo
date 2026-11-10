import { Box, Button, ButtonBase, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { CalendarClock, Globe, ImageIcon, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { CmsPage } from '@/types';
import { useDemo, currentProject } from '@/store/DemoStore';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useToast } from '@/hooks/useToast';
import { tokens } from '@/theme/tokens';
import { formatDateTime } from '@/services/time';
import { AiBadge, StatusPill } from '@/components/ui';
import { SEO_DESC_MAX, SEO_TITLE_MAX, STATUS_META } from './cmsUtils';
import { htmlToText } from './sanitize';
import { ImagePickerDialog } from './ImagePickerDialog';

function Section({ title, icon, children, action }: { title: string; icon: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <Box component="section" aria-label={title} sx={{ p: 2, borderRadius: '16px', bgcolor: tokens.color.surface, border: `1px solid ${tokens.color.border}` }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.75 }}>
        <Box sx={{ color: tokens.color.muted, display: 'flex' }}>{icon}</Box>
        <Typography variant="h6" sx={{ flex: 1 }}>{title}</Typography>
        {action}
      </Stack>
      {children}
    </Box>
  );
}

function Counter({ n, max }: { n: number; max: number }) {
  const over = n > max;
  return (
    <Box component="span" sx={{ color: over ? tokens.color.danger : tokens.color.muted, fontVariantNumeric: 'tabular-nums', fontWeight: over ? 700 : 500 }}>
      {n} / {max}
    </Box>
  );
}

/** 本文から説明文を組み立てる（AI生成のシミュレーション。外部送信なし） */
function draftDescription(page: CmsPage, siteName: string): string {
  const text = htmlToText(page.content);
  const sentences = text.split(/(?<=[。！？])/).map((s) => s.trim()).filter(Boolean);
  let body = '';
  for (const s of sentences) {
    if ((body + s).length > SEO_DESC_MAX - siteName.length - 6) break;
    body += s;
  }
  if (!body) body = text.slice(0, SEO_DESC_MAX - siteName.length - 8) + (text.length > 80 ? '…' : '');
  if (!body) body = `${page.title}のご案内です。`;
  return `${body} | ${siteName}`.slice(0, SEO_DESC_MAX);
}

interface Props {
  draft: CmsPage;
  onChange: (patch: Partial<CmsPage>) => void;
  slugError: string | null;
}

export function Inspector({ draft, onChange, slugError }: Props) {
  const { state } = useDemo();
  const project = currentProject(state);
  const reduced = useReducedMotion();
  const toast = useToast();
  const [typing, setTyping] = useState(false);
  const [cover, setCover] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearInterval(timer.current), []);

  const parentOptions = Array.from(new Set(state.sitemap.after.nodes.map((n) => n.data.path))).sort();
  const meta = STATUS_META[draft.status];

  const generate = () => {
    const target = draftDescription(draft, project.siteName);
    const title = draft.seoTitle || `${draft.title}｜${project.siteName}`.slice(0, SEO_TITLE_MAX);
    window.clearInterval(timer.current);
    if (reduced) {
      onChange({ seoDescription: target, seoTitle: title });
      toast('ディスクリプションを生成しました（シミュレーション）', 'ai');
      return;
    }
    setTyping(true);
    let i = 0;
    onChange({ seoTitle: title, seoDescription: '' });
    timer.current = window.setInterval(() => {
      i += 2;
      onChange({ seoDescription: target.slice(0, i) });
      if (i >= target.length) {
        window.clearInterval(timer.current);
        setTyping(false);
        toast('ディスクリプションを生成しました（シミュレーション）', 'ai');
      }
    }, 24);
  };

  const shownTitle = draft.seoTitle || draft.title;
  const shownDesc = draft.seoDescription || '（ディスクリプション未設定。検索結果には本文の一部が表示されます）';
  const host = project.siteUrl.replace(/^https?:\/\//, '');

  return (
    <Stack spacing={2}>
      <Section title="公開状態" icon={<CalendarClock size={16} />}>
        <Stack spacing={1}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <StatusPill tone={meta.tone}>{meta.label}</StatusPill>
            <Typography variant="caption">更新 {formatDateTime(draft.updatedAt)}</Typography>
          </Stack>
          {draft.status === 'scheduled' && draft.scheduledAt && (
            <Typography variant="body2" sx={{ color: tokens.color.infoInk, fontWeight: 600 }}>{formatDateTime(draft.scheduledAt)} に公開予定</Typography>
          )}
          {draft.publishedAt && <Typography variant="caption">最終公開 {formatDateTime(draft.publishedAt)}</Typography>}
          {draft.status === 'review' && <Typography variant="caption">承認者（顧客）の確認を待っています</Typography>}
        </Stack>
      </Section>

      <Section title="SEO" icon={<Globe size={16} />} action={<AiBadge label="AI生成" />}>
        <Stack spacing={2}>
          <TextField
            label="SEOタイトル"
            size="small"
            value={draft.seoTitle}
            onChange={(e) => onChange({ seoTitle: e.target.value })}
            error={draft.seoTitle.length > SEO_TITLE_MAX}
            helperText={<Stack component="span" direction="row" justifyContent="space-between"><span>検索結果の見出し</span><Counter n={draft.seoTitle.length} max={SEO_TITLE_MAX} /></Stack>}
            FormHelperTextProps={{ component: 'div' } as object}
          />
          <TextField
            label="ディスクリプション"
            size="small"
            multiline
            minRows={3}
            value={draft.seoDescription}
            onChange={(e) => onChange({ seoDescription: e.target.value })}
            error={draft.seoDescription.length > SEO_DESC_MAX}
            disabled={typing}
            helperText={<Stack component="span" direction="row" justifyContent="space-between"><span>120文字以内を推奨</span><Counter n={draft.seoDescription.length} max={SEO_DESC_MAX} /></Stack>}
            FormHelperTextProps={{ component: 'div' } as object}
          />
          <Button
            variant="outlined"
            size="small"
            onClick={generate}
            disabled={typing}
            startIcon={<Sparkles size={15} color={tokens.color.accent} />}
            sx={{ alignSelf: 'flex-start' }}
          >
            {typing ? '本文から生成中…' : 'AIで本文から生成'}
          </Button>

          <Box aria-label="検索結果のプレビュー" sx={{ p: 1.75, borderRadius: '12px', bgcolor: tokens.color.surfaceMuted, border: `1px dashed ${tokens.color.borderStrong}` }}>
            <Typography sx={{ fontSize: 12, fontWeight: 650, color: tokens.color.muted, letterSpacing: '0.06em', mb: 1 }}>検索結果のプレビュー</Typography>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
              <Box sx={{ width: 18, height: 18, borderRadius: '50%', bgcolor: project.accent, flexShrink: 0 }} />
              <Typography sx={{ fontSize: 12, color: '#202124', lineHeight: 1.3, minWidth: 0 }} noWrap>
                {project.siteName}
                <Box component="span" sx={{ display: 'block', color: '#4d5156', fontSize: 12 }}>{host}{draft.slug === '/' ? '' : draft.slug}</Box>
              </Typography>
            </Stack>
            <Typography sx={{ fontSize: 17, color: '#1a0dab', lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {shownTitle.length > SEO_TITLE_MAX ? `${shownTitle.slice(0, SEO_TITLE_MAX)}…` : shownTitle}
            </Typography>
            <Typography sx={{ fontSize: 13, color: '#4d5156', lineHeight: 1.55, mt: 0.25, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {shownDesc}
            </Typography>
          </Box>
        </Stack>
      </Section>

      <Section title="ページ設定" icon={<ImageIcon size={16} />}>
        <Stack spacing={2}>
          <TextField
            label="URL（スラッグ）"
            size="small"
            value={draft.slug}
            onChange={(e) => onChange({ slug: e.target.value.trim() })}
            error={!!slugError}
            helperText={slugError ?? '「/」から始まる半角英小文字'}
            InputProps={{ sx: { fontFamily: tokens.font.mono, fontSize: 13 } }}
            disabled={draft.slug === '/' && draft.id === 'pg1'}
          />
          <TextField
            select
            label="サイトマップ上の挿入位置（親ページ）"
            size="small"
            value={draft.parentPath ?? ''}
            onChange={(e) => onChange({ parentPath: e.target.value || undefined })}
            helperText="承認済みサイトマップ（改善後）から選択"
          >
            <MenuItem value="">（第1階層）</MenuItem>
            {parentOptions.map((p) => <MenuItem key={p} value={p} sx={{ fontFamily: tokens.font.mono, fontSize: 13 }}>{p}</MenuItem>)}
          </TextField>
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>カバー画像</Typography>
            {draft.coverImage ? (
              <Box sx={{ position: 'relative', borderRadius: '12px', overflow: 'hidden' }}>
                <Box component="img" src={draft.coverImage} alt="カバー画像" sx={{ display: 'block', width: '100%', aspectRatio: '16/9', objectFit: 'cover' }} />
                <Stack direction="row" spacing={1} sx={{ position: 'absolute', right: 8, bottom: 8 }}>
                  <Button size="small" variant="outlined" onClick={() => setCover(true)}>変更</Button>
                  <Button size="small" variant="outlined" onClick={() => onChange({ coverImage: undefined })} aria-label="カバー画像を外す" sx={{ minWidth: 32, px: 1 }}><Trash2 size={14} /></Button>
                </Stack>
              </Box>
            ) : (
              <ButtonBase
                onClick={() => setCover(true)}
                sx={{
                  width: '100%', aspectRatio: '16/7', borderRadius: '12px', border: `1.5px dashed ${tokens.color.borderStrong}`,
                  color: tokens.color.muted, flexDirection: 'column', gap: 0.75, fontSize: 13, fontWeight: 600,
                  '&:hover': { borderColor: tokens.color.primary, color: tokens.color.primary, bgcolor: tokens.color.primarySoft },
                }}
              >
                <ImageIcon size={20} />
                素材ライブラリから選ぶ
              </ButtonBase>
            )}
          </Box>
        </Stack>
      </Section>

      <ImagePickerDialog
        open={cover}
        title="カバー画像を選ぶ"
        selected={draft.coverImage}
        onClose={() => setCover(false)}
        onPick={(img) => {
          onChange({ coverImage: img.src });
          setCover(false);
        }}
      />
    </Stack>
  );
}
