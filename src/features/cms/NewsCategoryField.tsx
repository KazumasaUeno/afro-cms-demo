import { Autocomplete, TextField } from '@mui/material';
import { useState } from 'react';
import type { CmsPage } from '@/types';
import { NEWS_CATEGORY_MAX, newsCategoryOptions, normalizeNewsCategory } from './newsCategories';

/**
 * お知らせのカテゴリー（2026-11-17 会議）。既定（お知らせ・キャンペーン・イベント）と使っているカテゴリーから選ぶか、新しい名前を入力して追加する。
 * 作成ダイアログ（NewPageDialog）とエディタの設定（Inspector）で使う。入力欄は呼び出し側の key で作り直す前提（最初の value だけを読む）
 */
export function NewsCategoryField({ value, pages, onChange, size }: { value?: string; pages: CmsPage[]; onChange: (v: string | undefined) => void; size?: 'small' | 'medium' }) {
  const options = newsCategoryOptions(pages);
  // 入力中の文字は手元に持つ（freeSolo は Enter を押さないと値にならないため、入力のたびに整えた値を親へ渡す。空白の途中入力を消さないよう入力欄は整えない）
  const [input, setInput] = useState(value ?? '');
  return (
    <Autocomplete
      freeSolo
      options={options}
      value={value ?? null}
      inputValue={input}
      onInputChange={(_, v) => { setInput(v); onChange(normalizeNewsCategory(v)); }}
      onChange={(_, v) => { const n = normalizeNewsCategory(typeof v === 'string' ? v : null); setInput(n ?? ''); onChange(n); }}
      renderInput={(params) => (
        <TextField
          {...params}
          size={size}
          label="カテゴリー"
          placeholder="選ぶか、新しいカテゴリー名を入力"
          helperText={`一覧から選ぶか、入力して追加できます（${NEWS_CATEGORY_MAX}文字以内）`}
          inputProps={{ ...params.inputProps, maxLength: NEWS_CATEGORY_MAX }}
        />
      )}
    />
  );
}
