import { Box, ButtonBase, InputAdornment, TextField, Typography } from '@mui/material';
import { Check, Globe } from 'lucide-react';
import type { AnswerValue, RequirementQuestion } from '@/types';
import { tokens } from '@/theme/tokens';
import { MAX_LONGTEXT, MAX_TEXT, MAX_URL } from './validation';

interface ChipSelectProps {
  options: string[];
  value: string[];
  multiple: boolean;
  onChange: (v: string[]) => void;
  label: string;
}

/** 選択肢をカード状のチップで選ぶ（チェックボックスを並べない） */
export function ChipSelect({ options, value, multiple, onChange, label }: ChipSelectProps) {
  return (
    <Box role="group" aria-label={label} sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <ButtonBase
            key={o}
            aria-pressed={on}
            onClick={() => onChange(multiple ? (on ? value.filter((x) => x !== o) : [...value, o]) : [o])}
            sx={{
              gap: 0.75, px: 1.75, minHeight: 44, borderRadius: '12px', fontSize: 14, fontWeight: 600,
              border: `1px solid ${on ? tokens.color.primary : tokens.color.border}`,
              bgcolor: on ? tokens.color.primarySoft : tokens.color.surface,
              color: on ? tokens.color.primary : tokens.color.inkSoft,
              boxShadow: on ? `0 0 0 3px ${tokens.color.primarySoft}` : tokens.shadow.xs,
              transition: `all .16s ${tokens.motion.easeCss}`,
              '&:hover': { borderColor: on ? tokens.color.primary : tokens.color.borderStrong, transform: 'translateY(-1px)' },
            }}
          >
            <Box
              component="span"
              sx={{
                width: 18, height: 18, borderRadius: multiple ? '6px' : '50%', display: 'grid', placeItems: 'center', flexShrink: 0,
                border: `1.5px solid ${on ? tokens.color.primary : tokens.color.borderStrong}`, bgcolor: on ? tokens.color.primary : 'transparent', color: '#fff',
              }}
            >
              {on && <Check size={12} strokeWidth={3} />}
            </Box>
            {o}
          </ButtonBase>
        );
      })}
    </Box>
  );
}

interface Props {
  question: RequirementQuestion;
  value: AnswerValue | undefined;
  onChange: (v: AnswerValue) => void;
  error?: string | null;
  autoFocus?: boolean;
  onSubmit?: () => void;
}

/** 質問の種類に応じた入力欄 */
export function AnswerInput({ question: q, value, onChange, error, autoFocus, onSubmit }: Props) {
  const str = typeof value === 'string' ? value : '';
  const arr = Array.isArray(value) ? value : [];
  const inputId = `answer-${q.id}`;

  if (q.kind === 'multi' || q.kind === 'single') {
    return (
      <Box>
        <ChipSelect options={q.options ?? []} value={q.kind === 'single' ? (str ? [str] : []) : arr} multiple={q.kind === 'multi'}
          onChange={(v) => onChange(q.kind === 'single' ? v[0] ?? '' : v)} label={q.text} />
        {error && <Typography role="alert" variant="caption" sx={{ display: 'block', mt: 1, color: tokens.color.danger }}>{error}</Typography>}
      </Box>
    );
  }

  const max = q.kind === 'url' ? MAX_URL : q.kind === 'longtext' ? MAX_LONGTEXT : MAX_TEXT;
  return (
    <TextField
      id={inputId}
      fullWidth
      autoFocus={autoFocus}
      value={str}
      onChange={(e) => onChange(e.target.value.slice(0, max + 20))}
      placeholder={q.placeholder}
      multiline={q.kind === 'longtext'}
      minRows={q.kind === 'longtext' ? 4 : undefined}
      type={q.kind === 'url' ? 'url' : 'text'}
      inputMode={q.kind === 'url' ? 'url' : undefined}
      error={!!error}
      helperText={error ?? (q.kind === 'longtext' ? `${str.length} / ${max}文字` : ' ')}
      inputProps={{ 'aria-label': q.text, autoComplete: q.kind === 'url' ? 'url' : 'off', spellCheck: q.kind !== 'url' }}
      InputProps={q.kind === 'url' ? { startAdornment: <InputAdornment position="start"><Globe size={18} color={tokens.color.muted} /></InputAdornment> } : undefined}
      onKeyDown={(e) => {
        if (!onSubmit || e.nativeEvent.isComposing) return;
        if (q.kind === 'longtext' ? e.key === 'Enter' && (e.metaKey || e.ctrlKey) : e.key === 'Enter') {
          e.preventDefault();
          onSubmit();
        }
      }}
      sx={{ '& .MuiOutlinedInput-root': { fontSize: 16 } }}
    />
  );
}
