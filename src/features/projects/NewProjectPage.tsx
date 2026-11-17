import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';
import { ArrowLeft, Copy, FolderPlus, KeyRound } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import type { ClientAccount, Project } from '@/types';
import { useRepositories } from '@/repositories';
import { useWrite } from '@/hooks/useWrite';
import { PageHeader, Reveal, Surface } from '@/components/ui';
import { nowIso } from '@/services/time';
import { tokens } from '@/theme/tokens';
import { TOUCH } from '@/theme/media';
import { useToast } from '@/hooks/useToast';
import { ProjectCard } from './ProjectCard';
import { ProjectFields } from './ProjectFields';
import { emptyProjectDraft, PROJECT_FIELD_ORDER, projectFromDraft, validateClientInfo, validateProject, type ProjectDraft, type ProjectField } from './projectForm';
import { normalizeEmail } from '@/data/users';

/**
 * お客様ポータルの初期パスワード（2026-11-17 会議。デモだけ: ログインはどの値でも通るため保存せず、作成の直後に 1 回だけ表示する）。
 * 紛らわしい文字（0/O・1/l/I）を除いた 12 文字。ログ・記録・保存データには書かない
 */
const PASSWORD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
function initialPassword(length = 12): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => PASSWORD_CHARS[b % PASSWORD_CHARS.length]).join('');
}

/** 作成の前に、お客様の連絡先も含めて検査する（メールは必須。すでにお客様アカウントがあるアドレスは使えない） */
function validateNew(d: ProjectDraft, projects: Parameters<typeof validateProject>[1], accounts: ClientAccount[]) {
  const e = { ...validateProject(d, projects), ...validateClientInfo(d, true) };
  const email = d.clientEmail ? normalizeEmail(d.clientEmail) : '';
  if (!e.clientEmail && email && accounts.some((a) => a.email === email)) e.clientEmail = 'このメールアドレスはすでにお客様として登録されています';
  return e;
}

/** 作成の直後に 1 回だけ出す、お客様ポータルのログイン（閉じたら二度と表示しない） */
function LoginIssuedDialog({ issued, onClose }: { issued: { email: string; password: string } | null; onClose: () => void }) {
  const toast = useToast();
  const copy = () => {
    if (!issued) return;
    // 失敗しても画面に出ているので、手で写せる（パスワードはコンソールにも出さない）
    void navigator.clipboard?.writeText(issued.password).then(() => toast('初期パスワードをコピーしました'), () => toast('コピーできませんでした。画面の文字を写してください'));
  };
  return (
    <Dialog open={!!issued} onClose={(_e, reason) => { if (reason !== 'backdropClick') onClose(); }} maxWidth="xs" fullWidth aria-labelledby="login-issued-title">
      <DialogTitle id="login-issued-title">お客様ポータルのログインを発行しました</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography variant="body2">
            お客様にこのログイン情報をお伝えください。初期パスワードは<b>この画面でだけ</b>表示します。
          </Typography>
          <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr)', columnGap: 2, rowGap: 1, alignItems: 'center' }}>
            <Typography component="dt" variant="caption" sx={{ fontWeight: 600 }}>ログインID</Typography>
            <Typography component="dd" variant="body2" sx={{ m: 0, overflowWrap: 'anywhere' }}>{issued?.email}</Typography>
            <Typography component="dt" variant="caption" sx={{ fontWeight: 600 }}>初期パスワード</Typography>
            <Stack component="dd" direction="row" spacing={1} alignItems="center" sx={{ m: 0, minWidth: 0 }}>
              <Typography variant="body1" sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontWeight: 700, letterSpacing: '0.04em', overflowWrap: 'anywhere' }}>{issued?.password}</Typography>
              <Button size="small" variant="outlined" startIcon={<Copy size={14} />} onClick={copy} sx={{ flexShrink: 0, minHeight: 36, [TOUCH]: { minHeight: 44 } }}>コピー</Button>
            </Stack>
          </Box>
          <Typography variant="caption" component="p" sx={{ color: tokens.color.muted }}>
            デモのため、実際のメール送信・パスワードの保存は行いません（ログイン画面はどの値でもログインできます）。
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button variant="contained" startIcon={<KeyRound size={16} />} onClick={onClose}>伝えたので閉じる</Button>
      </DialogActions>
    </Dialog>
  );
}

function Section({ title, sub, index, children }: { title: string; sub?: string; index: number; children: ReactNode }) {
  return (
    <Reveal delay={index * 0.04}>
      <Surface padding={{ xs: 2, md: 3 }}>
        <Typography variant="h4" component="h2">{title}</Typography>
        {sub && <Typography variant="caption" component="p" sx={{ mt: 0.25 }}>{sub}</Typography>}
        <Stack spacing={2.25} sx={{ mt: 2.25 }}>{children}</Stack>
      </Surface>
    </Reveal>
  );
}

/** 新しいプロジェクト（管理者画面）。入力チェックは reducer と同じ validateProject */
export default function NewProjectPage() {
  const { projects: repo, accounts: accountsRepo } = useRepositories();
  const { data: projects } = repo.useList();
  const { data: accounts } = accountsRepo.useClientAccounts();
  // 担当開発者の候補（2026-11-17 会議。ユーザー管理と同じ人の一覧。無効にした人は除く）
  const { data: people } = accountsRepo.useDevPeople();
  const devOptions = useMemo(() => people.filter((p) => !p.disabled), [people]);
  /** 作成の直後に 1 回だけ出すログイン情報（state だけに持つ。閉じたら消す） */
  const [issued, setIssued] = useState<{ email: string; password: string; projectId: string } | null>(null);
  const currentProjectId = repo.useCurrentId();
  const navigate = useNavigate();
  const toast = useToast();
  const [draft, setDraft] = useState<ProjectDraft>(() => emptyProjectDraft());
  const [submitted, setSubmitted] = useState(false);
  // 作成は確定を待つ（BACKEND_FIREBASE §13.3。待つ間はボタンを止め、二重に作らない）
  const [saving, setSaving] = useState(false);
  const write = useWrite();
  const refs = useRef<Partial<Record<ProjectField, HTMLElement | null>>>({});
  /** 作成を送った時点のプロジェクト id（作成後、これに無い作業中プロジェクトが新しく作ったもの） */
  const before = useRef<Set<string> | null>(null);

  // 「今日以降」の判定は日付で変わるため、作成を押すたびに数え直す（日付をまたいで開いたままでも、画面と保存時の判定をそろえる）
  const [checks, setChecks] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // 作成した後（ログイン発行のダイアログ中）は検査しない（作ったアカウントと重複して「すでに登録」が後ろに出るため。2026-11-17 QA）
  const errors = useMemo(() => (issued ? {} : validateNew(draft, projects, accounts)), [draft, projects, accounts, checks, issued]);
  const set = (patch: Partial<ProjectDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const show = (k: ProjectField) => (submitted ? errors[k] : undefined);

  // id は reducer が作る。作成が反映されたら、作業中になった新しいプロジェクトを開く
  useEffect(() => {
    if (!before.current || before.current.has(currentProjectId)) return;
    if (!projects.some((p) => p.id === currentProjectId)) return;
    before.current = null;
    toast('プロジェクトを作成しました');
    // お客様ポータルのログインを発行したら、初期パスワードを見せてから詳細を開く（2026-11-17 会議）
    const email = draft.clientEmail ? normalizeEmail(draft.clientEmail) : '';
    if (email) setIssued({ email, password: initialPassword(), projectId: currentProjectId });
    else navigate(`/projects/${currentProjectId}`, { replace: true });
  }, [currentProjectId, projects, navigate, toast, draft.clientEmail]);

  const submit = () => {
    setSubmitted(true);
    setChecks((n) => n + 1);
    const fresh = validateNew(draft, projects, accounts);
    const first = PROJECT_FIELD_ORDER.find((k) => fresh[k]);
    if (first) {
      refs.current[first]?.focus();
      return;
    }
    if (saving) return;
    before.current = new Set(projects.map((p) => p.id));
    setSaving(true);
    void write(repo.create(draft)).then((ok) => {
      setSaving(false);
      // 失敗したら作成を待つのをやめる（エラーは useWrite が表示する）。成功は上の effect が開く
      if (!ok) before.current = null;
    });
  };

  // プレビューは入力途中でも崩れないよう、空の項目は仮の文言で埋める
  const preview: Project = {
    id: 'preview',
    ...projectFromDraft(draft),
    clientName: draft.clientName.trim() || 'お客様の会社名',
    siteName: draft.siteName.trim() || 'サイト名',
    siteUrl: draft.siteUrl.trim() || 'https://example.jp',
    industry: draft.industry.trim() || '業種',
    updatedAt: nowIso(),
  };

  return (
    <Box>
      <Button component={RouterLink} to="/projects" size="small" startIcon={<ArrowLeft size={16} />} sx={{ mb: 2, ml: -1 }}>
        プロジェクト一覧
      </Button>
      <PageHeader
        eyebrow="プロジェクト"
        icon={<FolderPlus size={16} />}
        title="新しいプロジェクト"
        description="お客様とサイトの情報を入れて作成します。作成したプロジェクトは「ヒアリング」から始まります。"
      />

      <Box
        component="form"
        noValidate
        aria-label="新しいプロジェクト"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        sx={{
          display: 'grid', gap: { xs: 2, md: 3 }, alignItems: 'start',
          gridTemplateColumns: { xs: 'minmax(0,1fr)', lg: 'minmax(0,1fr) 360px' },
          // スマホで入力欄を拡大させない（iOS は 16px 未満で拡大する）
          [TOUCH]: { '& .MuiInputBase-input': { fontSize: 16 } },
        }}
      >
        <Stack spacing={{ xs: 2, md: 2.5 }} sx={{ minWidth: 0 }}>
          <ProjectFields draft={draft} set={set} show={show} refs={refs} Group={Section} devOptions={devOptions} emailRequired />

          <Stack direction={{ xs: 'column-reverse', sm: 'row' }} spacing={1} justifyContent="flex-end">
            <Button variant="outlined" component={RouterLink} to="/projects">キャンセル</Button>
            <Button type="submit" variant="contained" startIcon={<FolderPlus size={16} />} disabled={saving}>作成する</Button>
          </Stack>
        </Stack>

        <Box component="aside" aria-label="カードのプレビュー" sx={{ position: { lg: 'sticky' }, top: { lg: tokens.layout.topbar + 16 }, minWidth: 0 }}>
          <Typography variant="overline" component="p" sx={{ mb: 1 }}>プレビュー</Typography>
          <ProjectCard p={preview} />
        </Box>
      </Box>
      <LoginIssuedDialog
        issued={issued}
        onClose={() => {
          const id = issued?.projectId;
          setIssued(null);
          if (id) navigate(`/projects/${id}`, { replace: true });
        }}
      />
    </Box>
  );
}
