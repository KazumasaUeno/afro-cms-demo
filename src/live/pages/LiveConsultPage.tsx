import { Alert, Box, Button, Stack, Typography, useMediaQuery, useTheme } from '@mui/material';
import { ArrowLeft, MessageSquare } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { PageHeader, StatusPill, Surface } from '@/components/ui';
import { RouteLoader } from '@/components/layout/RouteLoader';
import { ChatComposer, ChatInboxRow, ChatLog, ChatReadOnlyNote, ChatStatusBadge } from '@/features/chat/ChatParts';
import { relativeTime } from '@/services/time';
import { TOUCH } from '@/theme/media';
import { tokens } from '@/theme/tokens';
import {
  consultBlock, consultPreview, consultRows, consultSide, hasReply, isUnanswered, MESSAGE_PAGE, toChatMessage, unansweredCount,
} from '../consult';
import type { ProjectDoc } from '../model';
import { ConsultError, useLiveConsultActions, useLiveMessages, useLiveProjects } from '../repositories';
import { useLiveSession } from '../session';
import { EmptyState, LoadError } from './shared';

type Mode = 'portal' | 'admin' | 'dev';

/** 個人情報・秘密を書かないお願い（設計 §3 の脅威と対策） */
const PRIVACY_NOTE = 'パスワード・カード番号などは送らないでください。メッセージは編集・削除できません。';

/**
 * live の相談（docs/design/LIVE_DASHBOARD_TASKS_CONSULT.md §1.3・U3）。見た目は demo の ChatPage と同じ（features/chat/ChatParts を再利用）。
 * - お客様（/portal/chat）: 自分の案件の会話 1 本。担当者から返信があれば「返信あり」（最後がアフロ。NC-5）
 * - 開発者（/dev/chat）: 担当の案件の一覧 → 会話。担当の開発者は全員が返信できる（NC-1。demo の「担当ディレクターだけ」とは違う）
 * - 管理者（/chat）: 全案件の一覧 → 会話。見るだけ
 * 未対応＝最後のメッセージがお客様（既読は持たない）。一覧・未対応は案件一覧の consult（追加 Read 0）。メール通知・添付は無い（NC-4・NC-7）。
 * 権限の実体は firestore.rules の consultOk / msgCreateOk（ここは表示の出し分け）。メニューは U4（liveNav.ts。未対応・返信ありの印も案件一覧の consult）
 */
export default function LiveConsultPage() {
  const { account } = useLiveSession();
  const mode: Mode = account.role === 'client' ? 'portal' : account.role === 'developer' ? 'dev' : 'admin';
  const { data: list, loading, error } = useLiveProjects();
  if (loading) return <RouteLoader label="相談" />;
  if (error) return <LoadError what="プロジェクトの一覧" />;
  if (mode === 'portal') return <SingleConsult project={list[0] ?? null} />;
  return <ConsultInbox mode={mode} docs={list} />;
}

/** お客様ポータル: 自分の案件の会話 1 本 */
function SingleConsult({ project }: { project: ProjectDoc | null }) {
  if (!project) return <EmptyState title="ご相談いただける案件はまだありません" body="アフロの担当者からご連絡します。" />;
  const replied = hasReply(project);
  return (
    <Box>
      <PageHeader
        eyebrow="お客様ポータル"
        icon={<MessageSquare size={15} />}
        title="担当者に相談"
        description={`${project.siteName}（${project.clientName}）の制作についてのご質問・ご相談を、アフロの担当者にお送りいただけます。返信はメールではお知らせしません。この画面でご確認ください。`}
      />
      {replied && (
        <Box sx={{ mb: 1.5 }} data-testid="consult-reply-mark">
          <StatusPill tone="info">返信あり</StatusPill>
        </Box>
      )}
      <Surface sx={{ p: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', maxWidth: 820 }}>
        <ConsultThread project={project} mode="portal" logHeight={{ xs: 'calc(100dvh - 500px)', md: 'calc(100dvh - 560px)' }} />
      </Surface>
    </Box>
  );
}

/** 開発者・管理者: 案件の一覧 → 会話（demo の ChatInbox と同じ形。選んだ案件は URL の ?p=） */
function ConsultInbox({ mode, docs }: { mode: 'dev' | 'admin'; docs: readonly ProjectDoc[] }) {
  const { uid, account } = useLiveSession();
  const admin = mode === 'admin';
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up('md'));
  const [params, setParams] = useSearchParams();
  const rows = useMemo(() => consultRows(docs), [docs]);
  const count = unansweredCount(docs, account.role, uid);

  const requested = params.get('p');
  const picked = docs.find((p) => p.id === requested);
  const selected = picked ?? (wide ? rows[0] : undefined);
  const open = (id: string) => setParams((prev) => { const n = new URLSearchParams(prev); n.set('p', id); return n; });
  const back = () => setParams((prev) => { const n = new URLSearchParams(prev); n.delete('p'); return n; });

  const header = (
    <PageHeader
      eyebrow={admin ? '管理者画面' : '開発者画面'}
      icon={<MessageSquare size={15} />}
      title="相談チャット"
      description={admin
        ? `すべてのプロジェクトのお客様からの相談です（見るだけ。返信は各プロジェクトの担当の開発者が開発者画面から行います）。${count > 0 ? `未対応が ${count} 件あります（最後のメッセージがお客様のもの）。` : '未対応はありません。'}`
        : `担当のプロジェクトのお客様からの相談です。担当の開発者は全員が返信できます。${count > 0 ? `未対応が ${count} 件あります（最後のメッセージがお客様のもの）。` : '未対応はありません。'}`}
    />
  );

  if (!docs.length) {
    return (
      <Box>
        {header}
        <Surface sx={{ textAlign: 'center', py: 6 }}>
          <Typography variant="body2" color="text.secondary">{admin ? 'プロジェクトがありません。' : '担当のプロジェクトがありません。'}</Typography>
        </Surface>
      </Box>
    );
  }

  const list = (
    <Box component="nav" aria-label={admin ? 'プロジェクトの相談' : '担当プロジェクトの相談'} sx={{ height: '100%', overflowY: 'auto' }}>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {rows.map((p) => {
          const unanswered = isUnanswered(p);
          const time = p.consult ? relativeTime(p.consult.lastAt) : '';
          return (
            <ChatInboxRow
              key={p.id}
              accent={p.accent}
              clientName={p.clientName}
              siteName={p.siteName}
              time={time}
              preview={consultPreview(p.consult)}
              unanswered={unanswered}
              badge={p.consult ? <ChatStatusBadge unanswered={unanswered} /> : null}
              active={wide && selected?.id === p.id}
              ariaLabel={`${p.clientName}（${p.siteName}）${p.consult ? (unanswered ? '・未対応' : '・対応済み') : '・メッセージなし'}${time ? `・最後のメッセージ ${time}` : ''}`}
              onOpen={() => open(p.id)}
            />
          );
        })}
      </Box>
    </Box>
  );

  if (!wide && selected) {
    return (
      <Box>
        <Button onClick={back} size="small" startIcon={<ArrowLeft size={16} />} sx={{ mb: 1.5, ml: -1, [TOUCH]: { minHeight: 44 } }}>
          相談の一覧{count > 0 ? `（未対応 ${count}）` : ''}
        </Button>
        <Surface sx={{ p: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <ConsultThread key={selected.id} project={selected} mode={mode} logHeight={{ xs: 'calc(100dvh - 400px)' }} />
        </Surface>
      </Box>
    );
  }

  return (
    <Box>
      {header}
      {wide && selected ? (
        <Surface sx={{ p: 0, overflow: 'hidden', display: 'grid', gridTemplateColumns: 'minmax(260px, 340px) 1fr', maxWidth: 1180 }}>
          <Box sx={{ borderRight: `1px solid ${tokens.color.border}`, minWidth: 0, height: 'calc(100dvh - 340px)', minHeight: 440 }}>{list}</Box>
          <Box sx={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <ConsultThread key={selected.id} project={selected} mode={mode} logHeight={{ md: 'calc(100dvh - 340px - 170px)' }} />
          </Box>
        </Surface>
      ) : (
        <Surface sx={{ p: 0, overflow: 'hidden' }}>{list}</Surface>
      )}
    </Box>
  );
}

/** 1 案件の会話（相手の表示・メッセージ・入力） */
function ConsultThread({ project, mode, logHeight }: { project: ProjectDoc; mode: Mode; logHeight: Record<string, string> }) {
  const { uid, account } = useLiveSession();
  const [max, setMax] = useState(MESSAGE_PAGE);
  const q = useLiveMessages(project.id, max);
  const actions = useLiveConsultActions();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // 二重送信の止め（busy は state なので、同じ描画のうちに 2 回押すと両方が通る。ref は即座に変わる）
  const sendingRef = useRef(false);
  const messages = useMemo(() => q.data.map(toChatMessage), [q.data]);
  const side = consultSide(account.role, uid, account.projectId, project);
  const mySide = mode === 'portal' ? 'client' : 'afro';
  // アーカイブ・件数の上限は送る前から分かるので返信欄の代わりに出す（連投の間隔は送ったときに案内する）
  const blocked = side ? consultBlock(project, Number.POSITIVE_INFINITY) : null;
  const total = project.consult?.count ?? 0;
  // 読み足している間（前の会話を出したまま購読し直す。useSnapshot の keep）もボタンを残す（消えると位置がずれる）
  const loadingOlder = q.loading && messages.length > 0;
  const more = total > messages.length && (loadingOlder || messages.length >= max);
  const detailPath = mode === 'dev' ? `/dev/projects/${project.id}` : mode === 'admin' ? `/projects/${project.id}` : null;

  const send = async () => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setBusy(true);
    try {
      await actions.send(project.id, text);
      setText('');
      setError(null);
    } catch (e) {
      // 入力は残す（もう一度送れるように）
      setError(e instanceof ConsultError ? e.message : '送信できませんでした。接続を確かめて、もう一度お試しください');
    } finally {
      sendingRef.current = false;
      setBusy(false);
    }
  };

  return (
    <>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ px: 2, py: 1.5, borderBottom: `1px solid ${tokens.color.border}` }}>
        <MessageSquare size={20} color={tokens.color.muted} aria-hidden />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="body2" component="h2" sx={{ fontWeight: 650 }} noWrap>{mode === 'portal' ? 'アフロ株式会社 担当者' : project.clientName}</Typography>
          <Typography variant="caption" noWrap sx={{ display: 'block' }}>
            {mode === 'portal' ? '制作の担当者（相談の窓口）' : `${project.siteName}${project.archived ? '・アーカイブ済み' : ''}`}
          </Typography>
        </Box>
        {mode !== 'portal' && (
          <>
            {project.consult && <ChatStatusBadge unanswered={isUnanswered(project)} />}
            {detailPath && (
              <Button component={RouterLink} to={detailPath} size="small" sx={{ flexShrink: 0, [TOUCH]: { minHeight: 44 } }}>
                詳細
              </Button>
            )}
          </>
        )}
      </Stack>

      {q.error ? (
        <Box sx={{ p: 2 }}><Alert severity="error">メッセージを読み込めませんでした。接続を確かめて再読み込みしてください。</Alert></Box>
      ) : (
        <ChatLog
          messages={messages}
          loading={q.loading}
          mySide={mySide}
          afroSuffix={mode === 'portal'}
          label={`${project.clientName}との相談のメッセージ`}
          height={logHeight}
          grow={mode !== 'portal'}
          scrollKey={project.id}
          before={more ? (
            <Box sx={{ textAlign: 'center', mb: 1.5 }}>
              <Button size="small" disabled={loadingOlder} onClick={() => setMax((n) => n + MESSAGE_PAGE)} sx={{ [TOUCH]: { minHeight: 44 } }}>
                {loadingOlder ? '読み込んでいます…' : '前のメッセージを読む'}
              </Button>
            </Box>
          ) : undefined}
        />
      )}

      {!side ? (
        <ChatReadOnlyNote>
          {mode === 'admin' ? '返信は担当の開発者が開発者画面から行います（閲覧のみ）' : 'この案件の相談には送信できません（閲覧のみ）'}
        </ChatReadOnlyNote>
      ) : blocked ? (
        <ChatReadOnlyNote>{blocked}</ChatReadOnlyNote>
      ) : (
        <ChatComposer
          text={text}
          onTextChange={(v) => { setText(v); if (error) setError(null); }}
          onSend={() => { void send(); }}
          error={error}
          busy={busy}
          placeholder={mode === 'portal' ? '担当者へのメッセージを入力' : `${project.clientName}への返信を入力`}
          caption={PRIVACY_NOTE}
        />
      )}
    </>
  );
}
