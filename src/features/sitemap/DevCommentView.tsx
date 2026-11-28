import { Box, Button, Stack, TextField, Typography } from '@mui/material';
import { MessageSquareText, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Surface } from '@/components/ui';
import { useToast } from '@/hooks/useToast';
import { formatDateTime } from '@/services/time';
import { tokens } from '@/theme/tokens';
import type { SitemapState } from '@/types';

const MAX = 500;

/**
 * 開発担当者からのコメント（読むだけ。2026-11-17 会議）。お客様ポータルのサイトマップの承認と、管理者画面のサイトマップで出す。
 * コメントが無ければ何も出さない。DemoStore を読まない（live からも使う。LIVE_SITEMAP_IMPL_PLAN P-13）
 */
export function SitemapDevCommentView({ comment }: { comment: SitemapState['devComment'] }) {
  if (!comment?.text) return null;
  return (
    <Box role="note" sx={{ p: 1.5, borderRadius: 2, bgcolor: tokens.color.infoSoft, color: tokens.color.infoInk }}>
      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.5 }}>
        <MessageSquareText size={15} aria-hidden />
        <Typography variant="body2" sx={{ fontWeight: 700, color: 'inherit' }}>開発担当者より</Typography>
      </Stack>
      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: tokens.color.ink }}>{comment.text}</Typography>
      <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>{comment.by} · {formatDateTime(comment.at)}</Typography>
    </Box>
  );
}

/**
 * サイトマップの「開発担当者より」の欄（2026-11-17 会議: AI の改善理由に加えて、開発者の意図をお客様へ伝えたい）。見た目だけ（DemoStore を読まない）。
 * writable: 書ける（demo は開発者画面・承認前。live は編集できるとき）。書けなければ読むだけ（コメントが無ければ何も出さない）。
 * onSave: 保存（demo は setSitemapDevComment、live は保存のまとめへ）。demo の入れ物は DevComment.tsx の SitemapDevCommentPanel
 */
export function SitemapDevCommentPanelView({ saved, writable, onSave }: { saved: SitemapState['devComment']; writable: boolean; onSave: (text: string) => void }) {
  const toast = useToast();
  const [text, setText] = useState(saved?.text ?? '');
  // 案件の切り替え・保存で、保存済みの値へ戻す
  useEffect(() => setText(saved?.text ?? ''), [saved?.text]);

  if (!writable) {
    if (!saved?.text) return null;
    return <Surface><SitemapDevCommentView comment={saved} /></Surface>;
  }

  const dirty = text.trim() !== (saved?.text ?? '');
  return (
    <Surface>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <MessageSquareText size={16} color={tokens.color.primary} aria-hidden />
        <Typography variant="h5" component="h2">開発担当者より</Typography>
      </Stack>
      <Typography variant="caption" sx={{ display: 'block', mb: 1 }}>AI の改善理由に加えて、構成の意図をお客様へ伝えます。お客様ポータルのサイトマップの承認に表示されます。</Typography>
      <TextField
        fullWidth size="small" multiline minRows={3} label="お客様へのコメント" value={text}
        inputProps={{ maxLength: MAX }} helperText={`${text.length} / ${MAX}`}
        onChange={(e) => setText(e.target.value)}
      />
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1 }}>
        <Typography variant="caption" sx={{ flex: 1, minWidth: 0 }}>
          {saved ? `保存済み: ${saved.by} · ${formatDateTime(saved.at)}` : '未保存'}
        </Typography>
        <Button
          size="small" variant="contained" startIcon={<Save size={15} />} disabled={!dirty}
          onClick={() => { onSave(text); toast(text.trim() ? 'コメントを保存しました' : 'コメントを削除しました'); }}
        >
          保存
        </Button>
      </Stack>
    </Surface>
  );
}
