import { Box, Button, ButtonBase, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';
import { FileText, Megaphone } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { CmsPage, PageType } from '@/types';
import { tokens } from '@/theme/tokens';
import { nowIso } from '@/services/time';
import { suggestSlug, TITLE_MAX, validateSlug, validateTitle } from './cmsUtils';

interface Props {
  open: boolean;
  initialType: PageType;
  pages: CmsPage[];
  parentOptions: string[];
  onClose: () => void;
  onCreate: (page: CmsPage) => void;
}

export function NewPageDialog({ open, initialType, pages, parentOptions, onClose, onCreate }: Props) {
  const [type, setType] = useState<PageType>(initialType);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (open) {
      setType(initialType);
      setTitle('');
      setSlug(suggestSlug(initialType, ''));
      setSlugTouched(false);
      setSubmitted(false);
    }
  }, [open, initialType]);

  // タイトルの英数字が変わったときだけ再提案（日本語だけのタイトルでは日付ベースで固定）
  const asciiKey = title.replace(/[^a-zA-Z0-9\s]/g, '');
  useEffect(() => {
    if (!slugTouched) setSlug(suggestSlug(type, asciiKey));
  }, [type, asciiKey, slugTouched]);

  const titleErr = validateTitle(title);
  const slugErr = validateSlug(slug, pages);
  const submit = () => {
    setSubmitted(true);
    if (titleErr || slugErr) return;
    const id = `pg-${Date.now().toString(36)}`;
    onCreate({
      id, type, title: title.trim(), slug,
      content: type === 'news' ? '<p></p>' : `<h2>${title.trim().replace(/[<>&"]/g, '')}</h2><p></p>`,
      seoTitle: '', seoDescription: '', status: 'draft', updatedAt: nowIso(), authorId: 'm1',
      parentPath: type === 'news' ? '/journal' : parentOptions[0],
    });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth aria-labelledby="new-page-title">
      <DialogTitle id="new-page-title">新しく作成する</DialogTitle>
      <DialogContent>
        <Box
          component="form"
          id="new-page-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Box role="radiogroup" aria-label="種類" sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mb: 3 }}>
            {([
              { t: 'page' as const, icon: FileText, label: 'ページ', sub: 'サービス紹介・会社情報など' },
              { t: 'news' as const, icon: Megaphone, label: 'お知らせ', sub: 'ニュース・キャンペーン' },
            ]).map(({ t, icon: Icon, label, sub }) => {
              const active = type === t;
              return (
                <ButtonBase
                  key={t}
                  role="radio"
                  aria-checked={active}
                  onClick={() => setType(t)}
                  sx={{
                    flexDirection: 'column', alignItems: 'flex-start', gap: 1, p: 2, borderRadius: '14px', textAlign: 'left',
                    border: `1.5px solid ${active ? tokens.color.primary : tokens.color.border}`,
                    bgcolor: active ? tokens.color.primarySoft : tokens.color.surface, transition: 'all .16s',
                  }}
                >
                  <Icon size={20} color={active ? tokens.color.primary : tokens.color.muted} />
                  <Box>
                    <Typography variant="h5">{label}</Typography>
                    <Typography variant="caption">{sub}</Typography>
                  </Box>
                </ButtonBase>
              );
            })}
          </Box>
          <Stack spacing={2.5}>
            <TextField
              label="タイトル"
              autoFocus
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              error={submitted && !!titleErr}
              helperText={(submitted && titleErr) || `${title.length} / ${TITLE_MAX}`}
              inputProps={{ maxLength: TITLE_MAX + 20 }}
              placeholder={type === 'news' ? '例：冬季限定ブレンド発売のお知らせ' : '例：法人のお客さまへ'}
            />
            <TextField
              label="URL（スラッグ）"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value.trim());
              }}
              error={(submitted || slugTouched) && !!slugErr}
              helperText={((submitted || slugTouched) && slugErr) || '半角英小文字・数字・「-」。「/」から始めます'}
              InputProps={{ sx: { fontFamily: tokens.font.mono, fontSize: 14 } }}
            />
          </Stack>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button variant="outlined" onClick={onClose}>キャンセル</Button>
        <Button variant="contained" type="submit" form="new-page-form">作成して編集する</Button>
      </DialogActions>
    </Dialog>
  );
}
