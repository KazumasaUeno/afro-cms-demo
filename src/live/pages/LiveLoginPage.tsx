import { Alert, Box, Button, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Surface } from '@/components/ui';
import { LogoMark } from '@/components/layout/Logo';
import { RouteLoader } from '@/components/layout/RouteLoader';
import { EMAIL_RE } from '@/data/users';
import { useToast } from '@/hooks/useToast';
import { tokens } from '@/theme/tokens';
import { authErrorMessage, useLiveAuth } from '../auth';
import { ROLE_HOME } from '../session';

const MIN_PASSWORD = 8;
const LOGIN_PATHS = ['/login', '/dev/login', '/portal/login'];

/** 戻り先はこのアプリの中のパスだけ（外部 URL・ログイン画面へは戻さない） */
function safeNext(next: string | null): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return null;
  try {
    const url = new URL(next, 'https://app.invalid');
    if (url.origin !== 'https://app.invalid' || LOGIN_PATHS.includes(url.pathname)) return null;
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

function Frame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', px: 2, py: 4, bgcolor: tokens.color.bg }}>
      <Surface padding={{ xs: 2.5, sm: 4 }} sx={{ width: '100%', maxWidth: 420 }}>
        <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 2.5 }}>
          <LogoMark size={32} />
          <Typography variant="h3" component="h1">{title}</Typography>
        </Stack>
        {children}
      </Surface>
    </Box>
  );
}

/**
 * live のログイン（/login・/dev/login・/portal/login は同じ画面。役割は accounts で決まる）。
 * - ログイン ／ 初めての方（招待されたメールで登録 → 確認メール → 受け取り）
 * - 確認待ち: 確認メールの再送・「確認した」・ログアウト
 * - 招待が無い: 案内とログアウト（どのメールが招待済みかを推測させない文言にする）
 */
export default function LiveLoginPage() {
  const auth = useLiveAuth();
  const { state } = auth;
  const [params] = useSearchParams();
  const toast = useToast();
  const [tab, setTab] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>, done?: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
      if (done) toast(done);
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (state.kind === 'loading') return <RouteLoader label="ログイン情報" />;
  if (state.kind === 'active') {
    return <Navigate to={safeNext(params.get('next')) ?? ROLE_HOME[state.session.account.role]} replace />;
  }

  if (state.kind === 'unverified') {
    return (
      <Frame title="メールアドレスの確認">
        <Typography variant="body2" sx={{ mb: 2 }}>
          <b>{state.email}</b> に確認メールを送りました。メールのリンクを開いてから「確認した」を押してください。
        </Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Stack spacing={1}>
          <Button variant="contained" disabled={busy} onClick={() => { void run(auth.recheck); }}>確認した</Button>
          <Button variant="outlined" disabled={busy} onClick={() => { void run(auth.resendVerification, '確認メールを送り直しました'); }}>確認メールを送り直す</Button>
          <Button variant="text" disabled={busy} onClick={() => { void auth.signOut(); }}>ログアウト</Button>
        </Stack>
      </Frame>
    );
  }

  if (state.kind === 'noInvite') {
    return (
      <Frame title="ご利用いただけません">
        <Typography variant="body2" sx={{ mb: 2 }}>
          <b>{state.email}</b> では利用できる招待が見つかりませんでした。招待を受けたメールアドレスで登録しているか確かめ、
          わからない場合はアフロの担当者にお問い合わせください。
        </Typography>
        <Button variant="contained" fullWidth onClick={() => { void auth.signOut(); }}>ログアウト</Button>
      </Frame>
    );
  }

  const signup = tab === 'signup';
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) {
      setError('メールアドレスの形式を確認してください');
      return;
    }
    if (signup) {
      if (password.length < MIN_PASSWORD) {
        setError(`パスワードは ${MIN_PASSWORD} 文字以上で入力してください`);
        return;
      }
      if (password !== confirm) {
        setError('確認用のパスワードが一致しません');
        return;
      }
      void run(() => auth.signUp(email, password));
      return;
    }
    if (!password) {
      setError('パスワードを入力してください');
      return;
    }
    void run(() => auth.signIn(email, password));
  };

  return (
    <Frame title="アフロCMS">
      {state.reason && <Alert severity="warning" sx={{ mb: 2 }}>{state.reason}</Alert>}
      <Tabs value={tab} onChange={(_, v: 'login' | 'signup') => { setTab(v); setError(null); }} variant="fullWidth" sx={{ mb: 2 }}>
        <Tab value="login" label="ログイン" />
        <Tab value="signup" label="初めての方" />
      </Tabs>
      {signup && (
        <Typography variant="caption" component="p" sx={{ mb: 2 }}>
          招待メールを受け取ったメールアドレスで登録してください。確認メールのリンクを開くと、招待を受け取って使い始められます。
        </Typography>
      )}
      <Box component="form" noValidate onSubmit={submit}>
        <Stack spacing={2}>
          <TextField
            label="メールアドレス" type="email" value={email} onChange={(e) => setEmail(e.target.value)} fullWidth required
            inputProps={{ inputMode: 'email', autoComplete: 'email', autoCapitalize: 'none', spellCheck: false }}
          />
          <TextField
            label="パスワード" type="password" value={password} onChange={(e) => setPassword(e.target.value)} fullWidth required
            helperText={signup ? `${MIN_PASSWORD} 文字以上` : undefined}
            inputProps={{ autoComplete: signup ? 'new-password' : 'current-password' }}
          />
          {signup && (
            <TextField
              label="パスワード（確認）" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} fullWidth required
              inputProps={{ autoComplete: 'new-password' }}
            />
          )}
          {error && <Alert severity="error" role="alert">{error}</Alert>}
          <Button type="submit" variant="contained" size="large" disabled={busy}>
            {busy ? '処理しています…' : signup ? '登録して確認メールを送る' : 'ログイン'}
          </Button>
        </Stack>
      </Box>
    </Frame>
  );
}
