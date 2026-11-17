import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';
import { FileText, Megaphone } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { CmsPage, PageType } from '@/types';
import { tokens } from '@/theme/tokens';
import { useFullScreenDialog } from '@/hooks/useMediaQueries';
import { nowIso } from '@/services/time';
import { suggestSlug, TITLE_MAX, TYPE_LABEL, validateSlug, validateTitle } from './cmsUtils';
import { NEWS_CATEGORY_DEFAULTS } from './newsCategories';
import { NewsCategoryField } from './NewsCategoryField';

interface Props {
  open: boolean;
  /** 作る種類。押したボタン（「お知らせを作成」「お知らせを書く」など）で決まる */
  initialType: PageType;
  pages: CmsPage[];
  parentOptions: string[];
  onClose: () => void;
  onCreate: (page: CmsPage) => void;
}

/**
 * 新しいページ・お知らせ。
 * 2026-11-17 会議: 「お知らせを作成」を押した後に、もう一度「ページ / お知らせ」を選ぶ欄があって手順が 1 つ多かったので、種類の選択を外した
 * （どの入口も種類が決まった状態で開く。ポータルのホームの「お知らせを書く」も ?new=news でお知らせとして開く）。お知らせはカテゴリーも選ぶ
 */
export function NewPageDialog({ open, initialType, pages, parentOptions, onClose, onCreate }: Props) {
  const fullScreen = useFullScreenDialog();
  const type = initialType;
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [category, setCategory] = useState<string | undefined>(NEWS_CATEGORY_DEFAULTS[0]);
  // カテゴリーの入力欄は開くたびに作り直す（最初の値だけを読むため）
  const [rev, setRev] = useState(0);

  useEffect(() => {
    if (open) {
      setTitle('');
      setSlug(suggestSlug(initialType, ''));
      setSlugTouched(false);
      setSubmitted(false);
      setCategory(NEWS_CATEGORY_DEFAULTS[0]);
      setRev((n) => n + 1);
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
      ...(type === 'news' && category ? { newsCategory: category } : {}),
    });
  };
  const Icon = type === 'news' ? Megaphone : FileText;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth fullScreen={fullScreen} aria-labelledby="new-page-title">
      <DialogTitle id="new-page-title">
        <Stack direction="row" spacing={1} alignItems="center">
          <Icon size={20} color={tokens.color.primary} aria-hidden />
          <span>{TYPE_LABEL[type]}を作成</span>
        </Stack>
        <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
          {type === 'news' ? 'ニュース・キャンペーン・イベントの告知など。作成すると下書きとして本文の編集に進みます。' : 'サービス紹介・会社情報など。作成すると下書きとして本文の編集に進みます。'}
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Box
          component="form"
          id="new-page-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          sx={{ pt: 1 }}
        >
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
            {type === 'news' && <NewsCategoryField key={rev} value={category} pages={pages} onChange={setCategory} />}
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
