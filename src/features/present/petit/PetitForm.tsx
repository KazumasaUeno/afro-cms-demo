import { Box, Button, ButtonBase, InputAdornment, Stack, TextField, Typography } from '@mui/material';
import { Globe, Plus, Sparkles } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { PURPOSE_OPTIONS, REQUIREMENT_QUESTIONS } from '@/data/requirements';
import { DESIGN_VARIANTS } from '@/data/designs';
import { ChipSelect } from '@/features/requirements/AnswerInput';
import { MAX_LONGTEXT, MAX_TEXT, MAX_URL } from '@/features/requirements/validation';
import { INDUSTRY_SUGGESTIONS, PROJECT_LIMITS } from '@/features/projects/projectForm';
import { Surface } from '@/components/ui';
import { tokens } from '@/theme/tokens';
import { PETIT_CAPS, petitReady, petitSitemap, type PetitCap, type PetitDirection, type PetitInput } from './petitPlan';

const c = tokens.color;
const question = (id: string) => REQUIREMENT_QUESTIONS.find((q) => q.id === id)!;
const CV_OPTIONS = question('q-cv').options ?? [];

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <Box>
      <Typography component="div" sx={{ fontWeight: 700, fontSize: 14, mb: 0.75 }}>
        {label}{hint && <Box component="span" sx={{ ml: 1, fontWeight: 500, fontSize: 12, color: c.muted }}>{hint}</Box>}
      </Typography>
      {children}
    </Box>
  );
}

/** 1 画面の入力（見込み客の基本 3 項目＋質問 5 つ＋ページ数・デザインの方向） */
export function PetitForm({ value, onChange, onSubmit }: { value: PetitInput; onChange: (v: PetitInput) => void; onSubmit: () => void }) {
  const set = (patch: Partial<PetitInput>) => onChange({ ...value, ...patch });
  const [extra, setExtra] = useState('');
  // 必ず掲載したいページの候補: 業種の見本の第1階層（CTA を除く）＋ 入力済みの自由入力
  const suggestions = useMemo(() => {
    const base = petitSitemap({ ...value, mustPages: [], purposes: [], cv: '', cap: 15 }).pages.filter((p) => p.kind !== 'cta' && p.source === 'industry').map((p) => p.label);
    return [...new Set([...base, ...value.mustPages])];
  }, [value]);
  const addExtra = () => {
    const t = extra.trim().slice(0, 20);
    if (t && !value.mustPages.includes(t)) set({ mustPages: [...value.mustPages, t] });
    setExtra('');
  };
  const ready = petitReady(value);

  return (
    <Box component="form" noValidate onSubmit={(e) => { e.preventDefault(); if (ready) onSubmit(); }} sx={{ maxWidth: 1120, mx: 'auto', width: '100%' }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1.35fr' }, gap: 2.5 }}>
        <Surface padding={{ xs: 2, md: 2.5 }}>
          <Stack spacing={2}>
            <TextField
              label="見込み客名" required value={value.clientName} onChange={(e) => set({ clientName: e.target.value })}
              placeholder="例：さくら歯科クリニック" inputProps={{ maxLength: PROJECT_LIMITS.clientName, autoComplete: 'off' }} fullWidth
            />
            <TextField
              label="現行サイトの URL（任意）" type="url" value={value.siteUrl} onChange={(e) => set({ siteUrl: e.target.value })}
              placeholder="https://example.co.jp" inputProps={{ maxLength: MAX_URL, inputMode: 'url', autoComplete: 'off' }} fullWidth
              InputProps={{ startAdornment: <InputAdornment position="start"><Globe size={16} /></InputAdornment> }}
            />
            <Box>
              <TextField
                label="業種" required value={value.industry} onChange={(e) => set({ industry: e.target.value })}
                placeholder="例：医療" inputProps={{ maxLength: PROJECT_LIMITS.industry, autoComplete: 'off' }} fullWidth
              />
              <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75, mt: 1 }}>
                {INDUSTRY_SUGGESTIONS.map((s) => (
                  <ButtonBase
                    key={s} onClick={() => set({ industry: s })} aria-pressed={value.industry === s}
                    sx={{ minHeight: 44, px: 1.5, borderRadius: 99, fontSize: 13, fontWeight: 600, border: `1px solid ${value.industry === s ? c.primary : c.border}`, bgcolor: value.industry === s ? c.primarySoft : c.surface, color: value.industry === s ? c.primary : c.inkSoft }}
                  >{s}</ButtonBase>
                ))}
              </Stack>
            </Box>
            <Field label="ページ数" hint="トップ＋第1階層">
              <ChipSelect label="第1階層のページ数" options={PETIT_CAPS.map((n) => `${n} ページ`)} value={[`${value.cap} ページ`]} multiple={false}
                onChange={(v) => v[0] && set({ cap: Number.parseInt(v[0], 10) as PetitCap })} />
            </Field>
            <Field label="デザインの方向">
              <ChipSelect label="デザインの方向" options={['おまかせ', ...DESIGN_VARIANTS.map((d) => d.name)]} multiple={false}
                value={[value.direction === 'auto' ? 'おまかせ' : DESIGN_VARIANTS.find((d) => d.id === value.direction)?.name ?? 'おまかせ']}
                onChange={(v) => set({ direction: (DESIGN_VARIANTS.find((d) => d.name === v[0])?.id ?? 'auto') as PetitDirection })} />
            </Field>
          </Stack>
        </Surface>

        <Surface padding={{ xs: 2, md: 2.5 }}>
          <Stack spacing={2}>
            <Field label="1. リニューアルのきっかけ" hint="複数可">
              <ChipSelect label="リニューアルのきっかけ" options={PURPOSE_OPTIONS} value={value.purposes} multiple onChange={(v) => set({ purposes: v })} />
            </Field>
            <TextField label="2. いちばんの課題" value={value.issue} onChange={(e) => set({ issue: e.target.value })} placeholder={question('q-issue').placeholder}
              inputProps={{ maxLength: MAX_LONGTEXT }} fullWidth multiline minRows={1} maxRows={3} />
            <TextField label="3. 主なターゲット" value={value.target} onChange={(e) => set({ target: e.target.value })} placeholder={question('q-target').placeholder}
              inputProps={{ maxLength: MAX_TEXT }} fullWidth />
            <Field label="4. 必ず掲載したいページ" hint="複数可・業種の見本から">
              <ChipSelect label="必ず掲載したいページ" options={suggestions} value={value.mustPages} multiple onChange={(v) => set({ mustPages: v })} />
              <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                <TextField size="small" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="ほかのページ（例：メニュー）" inputProps={{ maxLength: 20, 'aria-label': '掲載したいページを追加' }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addExtra(); } }} sx={{ flex: 1 }} />
                <Button variant="outlined" startIcon={<Plus size={16} />} onClick={addExtra} disabled={!extra.trim()}>追加</Button>
              </Stack>
            </Field>
            <Field label="5. 最も重要なゴール">
              <ChipSelect label="最も重要なゴール" options={CV_OPTIONS} value={value.cv ? [value.cv] : []} multiple={false} onChange={(v) => set({ cv: v[0] === value.cv ? '' : v[0] ?? '' })} />
            </Field>
          </Stack>
        </Surface>
      </Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} justifyContent="flex-end" sx={{ mt: 2.5 }}>
        {!ready && <Typography variant="body2" sx={{ color: c.muted }}>見込み客名と業種を入れると分析できます</Typography>}
        <Button type="submit" variant="contained" size="large" startIcon={<Sparkles size={18} />} disabled={!ready}>AIで要件とデザインをつくる</Button>
      </Stack>
    </Box>
  );
}
