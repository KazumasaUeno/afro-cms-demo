import { Box, Button, ButtonBase, Stack, TextField, Typography } from '@mui/material';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, ArrowLeft, ArrowRight, ChevronRight, Info, KeyRound, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Surface } from '@/components/ui';
import { Logo } from '@/components/layout/Logo';
import { AREA_ORDER, AREAS, type AreaId } from '@/components/layout/nav';
import { currentProject, useDemo } from '@/store/DemoStore';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useToast } from '@/hooks/useToast';
import { LOGIN_PATH, loginArea, logoutArea, safeNext, useSessions } from '@/services/session';
import { tokens } from '@/theme/tokens';
import { isRevoked, loginDenial } from '@/store/access';
import { EMAIL_RE, normalizeEmail } from '@/data/users';

/** 画面に出すデモ用アカウント（実在しない。認証には使わない） */
const DEMO_ACCOUNTS: Record<AreaId, { email: string; name: string }> = {
  admin: { email: 'ueno@afro.example', name: '上野 航（ディレクター）' },
  dev: { email: 'kuroda@afro.example', name: '黒田 蓮（エンジニア）' },
  portal: { email: 'tanaka@minamo-coffee.example', name: 'ミナモ珈琲 担当者' },
};
const DEMO_PASSWORD = 'demo-pass';
const DEMO_CODE = '123456';

const mono = { fontFamily: tokens.font.mono, fontVariantNumeric: 'tabular-nums' } as const;

function DemoNotice() {
  return (
    <Stack direction="row" spacing={1.25} sx={{ p: 1.5, borderRadius: `${tokens.radius.sm}px`, bgcolor: tokens.color.infoSoft, color: tokens.color.inkSoft }}>
      <Info size={18} color={tokens.color.info} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden />
      <Typography variant="body2" sx={{ color: 'inherit' }}>
        <Box component="span" sx={{ fontWeight: 700 }}>デモのため実際の認証は行いません。</Box>
        入力した内容はどこにも送信されず、このブラウザにログイン状態だけを保存します。
      </Typography>
    </Stack>
  );
}

export default function LoginPage({ area: areaId }: { area: AreaId }) {
  const area = AREAS[areaId];
  const AreaIcon = area.icon;
  const account = DEMO_ACCOUNTS[areaId];
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const toast = useToast();
  const reduced = useReducedMotion();
  const { state, dispatch } = useDemo();
  // お客様ポータルは選んでいる案件を表示する（0.30.0）
  const client = currentProject(state);

  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState(account.email);
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [code, setCode] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string; code?: string }>({});
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const movedStep = useRef(false);
  /** ユーザー管理で権限を外されてログアウトしたとき（AreaGuard が ?reason=revoked を付ける） */
  const revoked = params.get('reason') === 'revoked';
  const session = useSessions()[areaId];
  // 権限を外されたセッションはここでログアウトする（照合に当たらない古いセッションは残す）
  useEffect(() => {
    if (session && isRevoked(areaId, session.email, state)) logoutArea(areaId);
  }, [areaId, session, state]);

  // 別のエリアのログイン画面へ移ったら最初からやり直す
  useEffect(() => {
    setStep(1);
    setEmail(account.email);
    setPassword(DEMO_PASSWORD);
    setCode('');
    setErrors({});
    movedStep.current = false;
  }, [account.email]);

  useEffect(() => {
    const prev = document.title;
    document.title = `${area.label}にログイン — アフロCMS`;
    return () => { document.title = prev; };
  }, [area.label]);

  const submitPassword = (e: FormEvent) => {
    e.preventDefault();
    const v = email.trim();
    const next: typeof errors = {};
    if (!v) next.email = 'メールアドレスを入力してください';
    else if (!EMAIL_RE.test(v)) next.email = 'メールアドレスの形式が正しくありません（例: name@example.com）';
    // ユーザー管理の設定と照合する（開発者画面は権限のあるメンバー、お客様ポータルは無効でないお客様だけ。デモのため画面上の照合のみ）
    else next.email = loginDenial(areaId, v, state) ?? undefined;
    if (!password) next.password = 'パスワードを入力してください';
    setErrors(next);
    if (next.email) { emailRef.current?.focus(); return; }
    if (next.password) { passwordRef.current?.focus(); return; }
    setEmail(v);
    setCode('');
    movedStep.current = true;
    setStep(2);
  };

  const submitCode = (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setErrors({ code: '6 桁の数字を入力してください' });
      codeRef.current?.focus();
      return;
    }
    const normalized = normalizeEmail(email);
    // 招待中のお客様は、初めてのログインで「有効」になる
    if (areaId === 'portal') dispatch({ type: 'activateClientAccount', email: normalized });
    loginArea(areaId, normalized);
    navigate(safeNext(areaId, params.get('next')) ?? area.home, { replace: true });
  };

  const others = AREA_ORDER.filter((id) => id !== areaId);
  const stepMotion = reduced
    ? { initial: false as const, animate: { opacity: 1 }, exit: { opacity: 1 }, transition: { duration: 0 } }
    : {
        initial: { opacity: 0, x: step === 2 ? 16 : -16 },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0 },
        transition: { duration: tokens.motion.base, ease: tokens.motion.ease },
      };

  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: tokens.color.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', px: { xs: 2, sm: 3 }, py: { xs: 2.5, md: 5 } }}>
      <Box component="header" sx={{ width: '100%', maxWidth: 1080, display: 'flex', alignItems: 'center', gap: 2, mb: { xs: 3, md: 6 } }}>
        <Logo />
        <Box sx={{ flex: 1 }} />
        <Typography variant="caption" sx={{ display: { xs: 'none', sm: 'block' }, px: 1, py: 0.5, borderRadius: 2, bgcolor: tokens.color.warningSoft, color: tokens.color.warningInk, fontWeight: 600 }}>
          デモ環境 — データはこのブラウザだけに保存
        </Typography>
      </Box>

      <Box component="main" sx={{ width: '100%', maxWidth: 440, minWidth: 0 }}>
        <Surface padding={{ xs: 2.5, sm: 4 }} sx={{ overflow: 'hidden', borderTop: `3px solid ${area.color}`, boxShadow: tokens.shadow.md }}>
          {/* どの立場の画面に入るか */}
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
            <Box sx={{ width: 44, height: 44, borderRadius: `${tokens.radius.sm}px`, bgcolor: area.soft, color: area.color, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <AreaIcon size={22} aria-hidden />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontWeight: 700, fontSize: 16, lineHeight: 1.3 }}>{area.label}</Typography>
              <Typography variant="caption" sx={{ display: 'block' }}>{area.audience}向け</Typography>
            </Box>
          </Stack>
          {areaId === 'portal' && client && (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1.5, px: 1.25, py: 1, borderRadius: `${tokens.radius.sm}px`, border: `1px solid ${tokens.color.border}`, bgcolor: tokens.color.surfaceMuted, minWidth: 0 }}>
              <Box sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: client.accent, flexShrink: 0 }} />
              <Typography variant="body2" noWrap sx={{ fontWeight: 650 }}>{client.siteName}</Typography>
              <Typography variant="caption" noWrap sx={{ minWidth: 0 }}>{client.clientName}</Typography>
            </Stack>
          )}

          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={step} {...stepMotion}>
              <Typography variant="overline" component="p" sx={{ display: 'block', mt: 3 }}>ステップ {step} / 2</Typography>
              <Typography variant="h2" component="h1" sx={{ mt: 0.5 }}>
                {step === 1 ? 'ログイン' : '二段階認証'}
              </Typography>

              {step === 1 ? (
                <Box component="form" noValidate onSubmit={submitPassword} sx={{ mt: 2.5 }}>
                  <Stack spacing={2.25}>
                    {revoked && (
                      <Stack direction="row" spacing={1.25} role="status" sx={{ p: 1.5, borderRadius: `${tokens.radius.sm}px`, bgcolor: tokens.color.warningSoft, color: tokens.color.warningInk }}>
                        <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden />
                        <Typography variant="body2" sx={{ color: 'inherit', fontWeight: 650 }}>
                          {areaId === 'portal' ? 'お客様アカウントが無効になったため、ログアウトしました。' : `${area.label}の権限が外れたため、ログアウトしました。`}
                        </Typography>
                      </Stack>
                    )}
                    <DemoNotice />
                    <TextField
                      label="メールアドレス" type="email" name="email" fullWidth
                      // ステップ 2 から戻ったときだけフォーカスする（初回表示ではキーボードを出さない）
                      autoFocus={movedStep.current}
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); if (errors.email) setErrors((x) => ({ ...x, email: undefined })); }}
                      inputRef={emailRef}
                      error={!!errors.email}
                      helperText={errors.email}
                      inputProps={{ autoComplete: 'username', inputMode: 'email', spellCheck: false, autoCapitalize: 'none' }}
                    />
                    <TextField
                      label="パスワード" type="password" name="password" fullWidth
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); if (errors.password) setErrors((x) => ({ ...x, password: undefined })); }}
                      inputRef={passwordRef}
                      error={!!errors.password}
                      helperText={errors.password ?? 'デモ用。どの値でもログインできます'}
                      inputProps={{ autoComplete: 'current-password' }}
                    />
                    <Button type="submit" variant="contained" size="large" fullWidth endIcon={<ArrowRight size={18} />}>次へ</Button>
                  </Stack>
                  <Box sx={{ mt: 2.5, pt: 2, borderTop: `1px solid ${tokens.color.border}` }}>
                    <Stack direction="row" spacing={0.75} alignItems="center" sx={{ color: tokens.color.inkSoft }}>
                      <KeyRound size={15} aria-hidden />
                      <Typography variant="body2" sx={{ fontWeight: 650, color: 'inherit' }}>デモ用アカウント（入力済み）</Typography>
                    </Stack>
                    <Box component="dl" sx={{ m: 0, mt: 1, display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', columnGap: 1.5, rowGap: 0.5, fontSize: 13 }}>
                      <Box component="dt" sx={{ color: tokens.color.muted }}>利用者</Box>
                      <Box component="dd" sx={{ m: 0, color: tokens.color.ink }}>{account.name}</Box>
                      <Box component="dt" sx={{ color: tokens.color.muted }}>メール</Box>
                      <Box component="dd" sx={{ m: 0, color: tokens.color.ink, overflowWrap: 'anywhere', ...mono }}>{account.email}</Box>
                      <Box component="dt" sx={{ color: tokens.color.muted }}>パスワード</Box>
                      <Box component="dd" sx={{ m: 0, color: tokens.color.ink, ...mono }}>{DEMO_PASSWORD}</Box>
                    </Box>
                  </Box>
                </Box>
              ) : (
                <Box component="form" noValidate onSubmit={submitCode} sx={{ mt: 1.5 }}>
                  <Typography variant="body2" sx={{ color: tokens.color.inkSoft }}>
                    <Box component="span" sx={{ ...mono, overflowWrap: 'anywhere', color: tokens.color.ink }}>{email}</Box> に送った 6 桁の確認コードを入力してください。
                  </Typography>
                  <Stack spacing={2.25} sx={{ mt: 2.5 }}>
                    <Stack direction="row" spacing={1.25} sx={{ p: 1.5, borderRadius: `${tokens.radius.sm}px`, bgcolor: tokens.color.infoSoft, color: tokens.color.inkSoft }}>
                      <ShieldCheck size={18} color={tokens.color.info} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden />
                      <Typography variant="body2" sx={{ color: 'inherit' }}>
                        デモではコードを送信しません。デモ用コード <Box component="span" sx={{ ...mono, fontWeight: 700 }}>{DEMO_CODE}</Box>（どの 6 桁の数字でも通ります）
                      </Typography>
                    </Stack>
                    <TextField
                      label="確認コード（6 桁）" name="code" fullWidth autoFocus
                      value={code}
                      onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); if (errors.code) setErrors({}); }}
                      inputRef={codeRef}
                      error={!!errors.code}
                      helperText={errors.code}
                      placeholder="000000"
                      inputProps={{ autoComplete: 'one-time-code', inputMode: 'numeric', pattern: '[0-9]*', maxLength: 6, sx: { ...mono, fontSize: 20, letterSpacing: '0.3em' } }}
                    />
                    <Button type="submit" variant="contained" size="large" fullWidth>ログイン</Button>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between" spacing={1} sx={{ mt: 1.5 }}>
                    <Button
                      variant="text" startIcon={<ArrowLeft size={16} />} sx={{ minHeight: 44 }}
                      onClick={() => { movedStep.current = true; setErrors({}); setStep(1); }}
                    >
                      戻る
                    </Button>
                    <Button
                      variant="text" sx={{ minHeight: 44 }}
                      onClick={() => toast('確認コードを再送しました（デモのため実際には送信しません）', 'info')}
                    >
                      コードを再送
                    </Button>
                  </Stack>
                </Box>
              )}
            </motion.div>
          </AnimatePresence>
        </Surface>

        {/* ほかの立場の画面へ */}
        <Box component="nav" aria-labelledby="other-logins" sx={{ mt: 3 }}>
          <Typography id="other-logins" variant="overline" component="h2" sx={{ display: 'block', px: 0.5, mb: 1 }}>ほかの画面にログイン</Typography>
          <Stack spacing={1}>
            {others.map((id) => {
              const a = AREAS[id];
              const AIcon = a.icon;
              return (
                <ButtonBase
                  key={id} component={Link} to={LOGIN_PATH[id]}
                  sx={{
                    justifyContent: 'flex-start', gap: 1.5, px: 1.5, minHeight: 52, borderRadius: `${tokens.radius.md}px`, textAlign: 'left',
                    border: `1px solid ${tokens.color.border}`, bgcolor: tokens.color.surface,
                    transition: 'border-color .16s, box-shadow .16s',
                    '&:hover': { borderColor: tokens.color.borderStrong, boxShadow: tokens.shadow.sm },
                  }}
                >
                  <Box sx={{ width: 32, height: 32, borderRadius: '10px', bgcolor: a.soft, color: a.color, display: 'grid', placeItems: 'center', flexShrink: 0 }}><AIcon size={17} aria-hidden /></Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 650 }} noWrap>{a.label}</Typography>
                    <Typography variant="caption" noWrap sx={{ display: 'block' }}>{a.audience}</Typography>
                  </Box>
                  <ChevronRight size={16} color={tokens.color.muted} aria-hidden />
                </ButtonBase>
              );
            })}
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}
