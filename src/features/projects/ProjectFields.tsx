import { Box, ButtonBase, InputAdornment, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { Check, Globe } from 'lucide-react';
import { useId, useRef, type ComponentType, type KeyboardEvent, type MutableRefObject, type ReactNode } from 'react';
import { MEMBERS } from '@/data/members';
import { MAX_URL } from '@/features/requirements/validation';
import { MemberAvatar } from '@/components/ui';
import { tokens } from '@/theme/tokens';
import { TOUCH } from '@/theme/media';
import { ACCENT_PRESETS, DEFAULT_NEXT_ACTION, INDUSTRY_SUGGESTIONS, PROJECT_LIMITS, todayYmd, type ProjectDraft, type ProjectField } from './projectForm';

export type ProjectFieldRefs = MutableRefObject<Partial<Record<ProjectField, HTMLElement | null>>>;

/** 項目のまとまり（新規作成は Surface の枠、編集のダイアログは見出しだけ）。index は表示の順（0 から） */
export type ProjectFieldGroup = ComponentType<{ title: string; sub?: string; index: number; children: ReactNode }>;

interface Props {
  draft: ProjectDraft;
  set: (patch: Partial<ProjectDraft>) => void;
  /** 表示するエラー（送信前は undefined を返す） */
  show: (k: ProjectField) => string | undefined;
  refs: ProjectFieldRefs;
  Group: ProjectFieldGroup;
  /** ブランド色の候補（編集: 候補に無いいまの色を足す） */
  accents?: { value: string; name: string }[];
  /** 公開予定日の下限（編集: いまの日付が過去ならその日） */
  minLaunchDate?: string;
  /** 次の作業の欄（編集では出さない。段階と同じくデータから導く） */
  withNextAction?: boolean;
}

/** 新しいプロジェクトと、プロジェクトの編集で共通の入力欄（入力チェックは validateProject） */
export function ProjectFields({ draft, set, show, refs, Group, accents = ACCENT_PRESETS, minLaunchDate = todayYmd(), withNextAction = true }: Props) {
  const accentRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const accentLabelId = useId();
  const accentIndex = Math.max(0, accents.findIndex((a) => a.value === draft.accent));
  const onAccentKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + accents.length) % accents.length;
    set({ accent: accents[next].value });
    accentRefs.current[next]?.focus();
  };

  const counter = (k: 'clientName' | 'siteName' | 'industry' | 'nextAction') => `${draft[k].trim().length} / ${PROJECT_LIMITS[k]}文字`;

  return (
    <>
      <Group title="お客様・サイト" index={0}>
        <TextField
          fullWidth required label="お客様の会社名" value={draft.clientName} placeholder="例：株式会社ミナモ珈琲"
          onChange={(e) => set({ clientName: e.target.value })}
          error={!!show('clientName')} helperText={show('clientName') ?? counter('clientName')}
          inputRef={(el: HTMLElement | null) => { refs.current.clientName = el; }}
          inputProps={{ maxLength: PROJECT_LIMITS.clientName + 10, autoComplete: 'organization' }}
        />
        <TextField
          fullWidth required label="サイト名" value={draft.siteName} placeholder="例：MINAMO COFFEE"
          onChange={(e) => set({ siteName: e.target.value })}
          error={!!show('siteName')} helperText={show('siteName') ?? counter('siteName')}
          inputRef={(el: HTMLElement | null) => { refs.current.siteName = el; }}
          inputProps={{ maxLength: PROJECT_LIMITS.siteName + 10, autoComplete: 'off' }}
        />
        <TextField
          fullWidth required label="サイトのURL" type="url" value={draft.siteUrl} placeholder="https://example.jp"
          onChange={(e) => set({ siteUrl: e.target.value })}
          error={!!show('siteUrl')} helperText={show('siteUrl') ?? '公開中・公開予定のサイトのURL'}
          inputRef={(el: HTMLElement | null) => { refs.current.siteUrl = el; }}
          inputProps={{ maxLength: MAX_URL + 20, inputMode: 'url', autoComplete: 'off', spellCheck: false, autoCapitalize: 'none' }}
          InputProps={{ startAdornment: <InputAdornment position="start"><Globe size={18} color={tokens.color.muted} /></InputAdornment> }}
        />
        <Box>
          <TextField
            fullWidth required label="業種" value={draft.industry} placeholder="例：飲食・EC"
            onChange={(e) => set({ industry: e.target.value })}
            error={!!show('industry')} helperText={show('industry') ?? counter('industry')}
            inputRef={(el: HTMLElement | null) => { refs.current.industry = el; }}
            inputProps={{ maxLength: PROJECT_LIMITS.industry + 10, autoComplete: 'off' }}
          />
          <Stack direction="row" sx={{ mt: 1, flexWrap: 'wrap', gap: 0.75 }} role="group" aria-label="業種の候補">
            {INDUSTRY_SUGGESTIONS.map((s) => {
              const active = draft.industry.trim() === s;
              return (
                <ButtonBase
                  key={s}
                  aria-pressed={active}
                  onClick={() => set({ industry: s })}
                  sx={{
                    px: 1.25, height: 30, [TOUCH]: { height: 44 }, borderRadius: '9px', fontSize: 12.5, fontWeight: 600,
                    color: active ? tokens.color.primary : tokens.color.muted,
                    border: `1px ${active ? 'solid' : 'dashed'} ${active ? tokens.color.primary : tokens.color.borderStrong}`,
                    bgcolor: active ? tokens.color.primarySoft : 'transparent',
                    '&:hover': { color: tokens.color.primary, borderColor: tokens.color.primary },
                  }}
                >
                  {active ? s : `+ ${s}`}
                </ButtonBase>
              );
            })}
          </Stack>
        </Box>
      </Group>

      <Group title="担当・予定" index={1}>
        <TextField
          select fullWidth required label="担当ディレクター" value={draft.ownerId}
          onChange={(e) => set({ ownerId: e.target.value })}
          error={!!show('ownerId')} helperText={show('ownerId') ?? 'カードと詳細画面に表示します'}
          inputRef={(el: HTMLElement | null) => { refs.current.ownerId = el; }}
          SelectProps={{
            renderValue: (id) => {
              const m = MEMBERS.find((x) => x.id === id);
              return m ? (
                <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                  <MemberAvatar id={m.id} size={24} />
                  <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{m.name}</Typography>
                  <Typography variant="caption" noWrap>{m.role}</Typography>
                </Stack>
              ) : '';
            },
          }}
        >
          {MEMBERS.map((m) => (
            <MenuItem key={m.id} value={m.id} sx={{ minHeight: 44 }}>
              <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0 }}>
                <MemberAvatar id={m.id} size={28} />
                <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{m.name}</Typography>
                <Typography variant="caption" noWrap>{m.role}</Typography>
              </Stack>
            </MenuItem>
          ))}
        </TextField>
        <TextField
          fullWidth label="公開予定日" type="date" value={draft.launchDate}
          onChange={(e) => set({ launchDate: e.target.value })}
          error={!!show('launchDate')} helperText={show('launchDate') ?? '未定なら空のまま'}
          inputRef={(el: HTMLElement | null) => { refs.current.launchDate = el; }}
          inputProps={{ min: minLaunchDate }}
          InputLabelProps={{ shrink: true }}
        />
        {withNextAction && (
          <TextField
            fullWidth label="次に必要な作業" value={draft.nextAction} placeholder={DEFAULT_NEXT_ACTION}
            onChange={(e) => set({ nextAction: e.target.value })}
            error={!!show('nextAction')} helperText={show('nextAction') ?? `空なら「${DEFAULT_NEXT_ACTION}」（${counter('nextAction')}）`}
            inputRef={(el: HTMLElement | null) => { refs.current.nextAction = el; }}
            inputProps={{ maxLength: PROJECT_LIMITS.nextAction + 10, autoComplete: 'off' }}
          />
        )}
      </Group>

      <Group title="見た目" sub="カードと詳細画面で使うブランド色" index={2}>
        <Box>
          <Typography id={accentLabelId} variant="subtitle2" sx={{ mb: 1 }}>ブランド色</Typography>
          <Stack direction="row" role="radiogroup" aria-labelledby={accentLabelId} sx={{ flexWrap: 'wrap', gap: 1 }}>
            {accents.map((a, i) => {
              const active = draft.accent === a.value;
              return (
                <ButtonBase
                  key={a.value}
                  ref={(el: HTMLButtonElement | null) => {
                    accentRefs.current[i] = el;
                    if (i === accentIndex) refs.current.accent = el;
                  }}
                  role="radio"
                  aria-checked={active}
                  aria-label={a.name}
                  tabIndex={i === accentIndex ? 0 : -1}
                  onClick={() => set({ accent: a.value })}
                  onKeyDown={(e) => onAccentKey(e, i)}
                  sx={{
                    width: 44, height: 44, borderRadius: '12px', bgcolor: a.value, color: '#fff',
                    boxShadow: active ? `0 0 0 2px ${tokens.color.surface}, 0 0 0 4px ${a.value}` : 'none',
                    transition: `box-shadow .16s ${tokens.motion.easeCss}`,
                    '&.Mui-focusVisible': { outline: `2px solid ${tokens.color.ink}`, outlineOffset: 4 },
                  }}
                >
                  {active && <Check size={18} strokeWidth={3} aria-hidden />}
                </ButtonBase>
              );
            })}
          </Stack>
          <Typography variant="caption" component="p" sx={{ mt: 1 }} color={show('accent') ? 'error' : undefined}>
            {show('accent') ?? accents[accentIndex]?.name}
          </Typography>
        </Box>
      </Group>
    </>
  );
}
