import { createContext, useCallback, useContext, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  arrayRemove, arrayUnion, collection, deleteField, doc, getDoc, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp,
  Timestamp, updateDoc, where, writeBatch, type DocumentData,
} from 'firebase/firestore';
import { REQUIREMENT_QUESTIONS } from '@/data/requirements';
import { devUserToPerson } from '@/data/people';
import { normalizeEmail } from '@/data/users';
import { buildProposal } from '@/features/requirements/buildProposal';
import { isAnswered, validateAnswer } from '@/features/requirements/validation';
import { projectFromDraft, siteHost } from '@/features/projects/projectForm';
import type { Query, Repositories } from '@/repositories/types';
import type { AnswerValue, ApprovalLog, ClientAccount, DevUser } from '@/types';
import { db } from './firebase';
import {
  clientFromAccount, clientFromInvite, devFromAccount, devFromInvite, INVITE_PREFIX, projectDoc, proposalForSave, reqDoc, toApprovalLog, toProject,
  toSession, type ProjectDoc, type ReqDoc,
} from './model';
import { PendingAnswers } from './pendingAnswers';
import type { LiveSession } from './session';
import { useSnapshot } from './useSnapshot';

/**
 * live（Firestore）の repository（BACKEND_FIREBASE §13.2 の 2 段目）。形は repositories/types.ts、権限の実体は firestore.rules。
 * - 読み取り: onSnapshot（useSnapshot）。案件の一覧は LiveDataProvider で 1 つだけ購読する
 * - 回答: 入力が落ち着いてからまとめて 1 回の update（PendingAnswers）。Rules を通らない途中の値は保存しない
 * - 確認依頼・差し戻し・承認: runTransaction（オンライン必須。状態と証跡を同じ書き込みにする。§7）
 */

const ANSWER_DEBOUNCE_MS = 1200;
const LIST_LIMIT = 500;

interface LiveData {
  session: LiveSession;
  projects: Query<ProjectDoc[]>;
  currentId: string;
  select: (id: string) => void;
  pending: PendingAnswers;
  writes: AnswerWrites;
}

/**
 * 回答の書き込みの待ち合わせ（LiveDataProvider が 1 つ持つ。部品ごとに持つと、別の部品の「保存」が他の部品の予約した書き込みを待てない）
 * - timers: 入力が落ち着くのを待っている案件ごとの予約
 * - inflight: 送信中の書き込み（「保存済み」はこれが終わってから出す）
 */
interface AnswerWrites {
  timers: Map<string, { timer: number; resolve: () => void; reject: (e: unknown) => void }>;
  inflight: Set<Promise<void>>;
}

const LiveDataContext = createContext<LiveData | null>(null);

function useLiveData(): LiveData {
  const v = useContext(LiveDataContext);
  if (!v) throw new Error('LiveDataProvider の内側で使う');
  return v;
}

const PROJECT_KEY = 'afro-cms-live:project';

/** 役割ごとの案件の購読（Rules はフィルタではないので、開発者は memberUids の条件を必ず付ける。お客様は自分の 1 件だけ get） */
function useProjectDocs(session: LiveSession): Query<ProjectDoc[]> {
  const { role, projectId } = session.account;
  const key = `${role}:${session.uid}:${projectId ?? ''}`;
  return useSnapshot<ProjectDoc[]>(key, (next, fail) => {
    if (role === 'client') {
      if (!projectId) {
        next([]);
        return () => undefined;
      }
      return onSnapshot(doc(db, 'projects', projectId), (s) => next(s.exists() ? [projectDoc(s)] : []), fail);
    }
    const base = collection(db, 'projects');
    // 新しく更新された順に上限まで（上限を超えた古い案件は出ない。docs/TODO.md）。開発者の条件は firestore.indexes.json の memberUids＋updatedAt
    const newest = [orderBy('updatedAt', 'desc'), limit(LIST_LIMIT)] as const;
    const q = role === 'admin' ? query(base, ...newest) : query(base, where('memberUids', 'array-contains', session.uid), ...newest);
    return onSnapshot(q, (s) => next(s.docs.map(projectDoc)), fail);
  }, NO_PROJECTS);
}
const NO_PROJECTS: ProjectDoc[] = [];

export function LiveDataProvider({ session, children }: { session: LiveSession; children: ReactNode }) {
  const projects = useProjectDocs(session);
  const [chosen, setChosen] = useState<string>(() => {
    try { return window.sessionStorage.getItem(PROJECT_KEY) ?? ''; } catch { return ''; }
  });
  const pendingRef = useRef<PendingAnswers | null>(null);
  pendingRef.current ??= new PendingAnswers();
  const writesRef = useRef<AnswerWrites | null>(null);
  writesRef.current ??= { timers: new Map(), inflight: new Set() };
  const select = useCallback((id: string) => {
    setChosen(id);
    try { window.sessionStorage.setItem(PROJECT_KEY, id); } catch { /* 保存できなくても画面の状態としては選べる */ }
  }, []);
  // お客様は担当の 1 案件だけ。開発者・管理者は選んだ案件が一覧に無ければ（担当を外れた等）先頭の案件
  const currentId = session.account.role === 'client'
    ? session.account.projectId ?? ''
    : projects.data.some((p) => p.id === chosen) ? chosen : projects.data[0]?.id ?? '';
  const value = useMemo<LiveData>(() => ({ session, projects, currentId, select, pending: pendingRef.current!, writes: writesRef.current! }), [session, projects, currentId, select]);
  return <LiveDataContext.Provider value={value}>{children}</LiveDataContext.Provider>;
}

/** 案件の一覧（memberUids などの保存値つき。live の画面だけが使う） */
export function useLiveProjects(): Query<ProjectDoc[]> {
  return useLiveData().projects;
}

const EMPTY_REQ: ReqDoc | null = null;

const reqRef = (pid: string) => doc(db, 'projects', pid, 'requirements', 'current');
const projRef = (pid: string) => doc(db, 'projects', pid);
const apprRef = (pid: string, rev: number, action: 'submit' | 'approve' | 'withdraw') => doc(db, 'projects', pid, 'approvals', `requirements-r${rev}-${action}`);
const stamp = (uid: string) => ({ updatedAt: serverTimestamp(), updatedBy: uid });

type Plan = { kind: 'hold' } | { kind: 'delete' } | { kind: 'write'; value: AnswerValue };

/** 保存してよい値か（Rules の validAnswers と同じ条件を画面の検査で先に見る）。途中の値は保存しない */
function planAnswer(questionId: string, value: AnswerValue): Plan {
  if (!isAnswered(value)) return { kind: 'delete' };
  const q = REQUIREMENT_QUESTIONS.find((x) => x.id === questionId);
  if (!q) return { kind: 'hold' };
  if (questionId === 'q-competitor') {
    const list = (Array.isArray(value) ? value : [value]).map((v) => v.trim()).filter(Boolean);
    if (!list.length) return { kind: 'delete' };
    return list.length <= 3 && list.every((v) => v.length <= 200) ? { kind: 'write', value: list } : { kind: 'hold' };
  }
  return validateAnswer(q, value, false) ? { kind: 'hold' } : { kind: 'write', value };
}

/** 承認の記録を作る人（Rules の actorOk: uid・token のメール・accounts の名前） */
const actor = (s: LiveSession) => ({ actorUid: s.uid, actorName: s.account.name, actorEmail: s.email });

export function useLiveRepositoriesImpl(): Repositories {
  const data = useLiveData();
  const { session, pending, select, writes } = data;
  const uid = session.uid;
  // 書き込みの中で最新の一覧を使う（アサインの差分）
  const projectsRef = useRef(data.projects.data);
  projectsRef.current = data.projects.data;
  const timers = writes.timers;

  return useMemo<Repositories>(() => {
    /** 送信中の書き込みとして登録する（saveNow がどの部品から呼ばれても待てるように） */
    const flush = (pid: string): Promise<void> => {
      const run = write(pid);
      writes.inflight.add(run);
      const done = () => { writes.inflight.delete(run); };
      run.then(done, done);
      return run;
    };

    const write = async (pid: string): Promise<void> => {
      const entries = Object.entries(pending.of(pid));
      const updates: Record<string, unknown> = {};
      const written: Record<string, AnswerValue> = {};
      for (const [qid, value] of entries) {
        const plan = planAnswer(qid, value);
        if (plan.kind === 'hold') continue;
        written[qid] = value;
        if (plan.kind === 'delete') {
          updates[`answers.${qid}`] = deleteField();
          updates[`answerMeta.${qid}`] = deleteField();
        } else {
          updates[`answers.${qid}`] = plan.value;
          updates[`answerMeta.${qid}`] = { by: 'afro', at: serverTimestamp() };
        }
      }
      if (!Object.keys(written).length) return;
      try {
        await updateDoc(reqRef(pid), { ...updates, ...stamp(uid) });
      } finally {
        pending.settle(pid, written);
      }
    };

    /** 入力が落ち着いたら保存する。前の呼び出しの Promise は置き換えた時点で解決する（エラーの表示は最後の 1 回だけ） */
    const schedule = (pid: string): Promise<void> => {
      const prev = timers.get(pid);
      if (prev) {
        window.clearTimeout(prev.timer);
        prev.resolve();
      }
      return new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => {
          timers.delete(pid);
          flush(pid).then(resolve, reject);
        }, ANSWER_DEBOUNCE_MS);
        timers.set(pid, { timer, resolve, reject });
      });
    };

    const flushNow = async (pid: string): Promise<void> => {
      const t = timers.get(pid);
      if (t) {
        window.clearTimeout(t.timer);
        timers.delete(pid);
        try {
          await flush(pid);
          t.resolve();
        } catch (e) {
          t.reject(e);
          throw e;
        }
        return;
      }
      await flush(pid);
    };

    return {
      projects: {
        useList: () => {
          const q = useLiveData().projects;
          const list = useMemo(() => q.data.map(toProject), [q.data]);
          return { data: list, loading: q.loading, error: q.error };
        },
        useCurrentId: () => useLiveData().currentId,
        select,
        create: async (draft) => {
          if (session.account.role !== 'developer') throw new Error('プロジェクトは開発者が作成します');
          const key = siteHost(draft.siteUrl);
          if (!key) throw new Error('URLの形式を確認してください');
          const keyRef = doc(db, 'siteKeys', key);
          if ((await getDoc(keyRef)).exists()) throw new Error('このURLのプロジェクトはすでにあります');
          const p = projectFromDraft(draft);
          const ref = doc(collection(db, 'projects'));
          const batch = writeBatch(db);
          batch.set(ref, {
            schemaVersion: 1, clientName: p.clientName, siteName: p.siteName, siteUrl: p.siteUrl, siteUrlKey: key, industry: p.industry, accent: p.accent,
            ...(p.launchDate ? { launchDate: Timestamp.fromDate(localDate(p.launchDate)) } : {}),
            ownerUid: uid, memberUids: [uid], requirements: { status: 'draft', revision: 0 }, archived: false,
            createdAt: serverTimestamp(), createdBy: uid, ...stamp(uid),
          });
          // URL の重複防止の鍵（同じバッチ。既にあれば Rules が拒否する。§5.4）
          batch.set(keyRef, { projectId: ref.id, createdAt: serverTimestamp() });
          batch.set(reqRef(ref.id), { schemaVersion: 1, mode: 'afro', answers: {}, answerMeta: {}, ...stamp(uid) });
          await batch.commit();
          select(ref.id);
        },
      },

      requirements: {
        useCurrent: (projectId) => {
          const p = useSnapshot<ProjectDoc | null>(projectId ? `p:${projectId}` : null, (next, fail) =>
            onSnapshot(projRef(projectId), (s) => next(s.exists() ? projectDoc(s) : null), fail), null);
          const r = useSnapshot<ReqDoc | null>(projectId ? `r:${projectId}` : null, (next, fail) =>
            onSnapshot(reqRef(projectId), (s) => next(s.exists() ? reqDoc(s) : null), fail), EMPTY_REQ);
          const pend = useLiveData().pending;
          const version = useSyncExternalStore(pend.subscribe, pend.getVersion);
          // eslint-disable-next-line react-hooks/exhaustive-deps
          const overlay = useMemo(() => pend.of(projectId), [pend, projectId, version]);
          const session = useMemo(() => toSession(projectId, p.data, r.data, overlay), [projectId, p.data, r.data, overlay]);
          return { data: session, loading: p.loading || r.loading, error: p.error ?? r.error };
        },
        setAnswer: (projectId, questionId, value) => {
          pending.set(projectId, questionId, value);
          return schedule(projectId);
        },
        setAnswers: async (projectId, entries) => {
          // CSV の取り込みは 1 回の書き込み（値は planCsvImport が検査済み）
          await flushNow(projectId);
          const updates: Record<string, unknown> = {};
          for (const e of entries) {
            const plan = planAnswer(e.questionId, e.value);
            if (plan.kind === 'hold') throw new Error(`保存できない回答があります（${e.questionId}）`);
            updates[`answers.${e.questionId}`] = plan.kind === 'delete' ? deleteField() : plan.value;
            updates[`answerMeta.${e.questionId}`] = plan.kind === 'delete' ? deleteField() : { by: 'afro', at: serverTimestamp() };
          }
          if (!entries.length) return;
          await updateDoc(reqRef(projectId), { ...updates, ...stamp(uid) });
        },
        // mode は afro 固定なので代理回答の確認は起きない（§6）
        confirmAnswer: () => Promise.resolve(),
        completeAnalysis: async (projectId) => {
          await flushNow(projectId);
          await runTransaction(db, async (tx) => {
            const ps = await tx.get(projRef(projectId));
            const rs = await tx.get(reqRef(projectId));
            if (!ps.exists() || !rs.exists()) throw new Error('案件が見つかりません');
            const p = projectDoc(ps);
            if (p.requirements.status !== 'draft') throw new Error('すでに確認を依頼しています');
            const raw = rs.data() as DocumentData;
            const answers = (raw.answers ?? {}) as Record<string, AnswerValue>;
            const comp = answers['q-competitor'];
            const proposal = proposalForSave(buildProposal(answers, Array.isArray(comp) ? comp : []));
            const rev = p.requirements.revision + 1;
            tx.update(reqRef(projectId), { proposal, proposalRevision: rev, ...stamp(uid) });
            tx.set(apprRef(projectId, rev, 'submit'), {
              schemaVersion: 1, kind: 'requirements', action: 'submit', revision: rev, side: 'afro', ...actor(session), at: serverTimestamp(),
              answers: raw.answers ?? {}, proposal,
            });
            tx.update(projRef(projectId), {
              'requirements.status': 'analyzed', 'requirements.revision': rev, 'requirements.analyzedAt': serverTimestamp(), ...stamp(uid),
            });
          });
        },
        // live の「やり直す」は確認依頼の差し戻し（analyzed → draft。回答は残す。§6）
        reset: async (projectId) => {
          await runTransaction(db, async (tx) => {
            const ps = await tx.get(projRef(projectId));
            if (!ps.exists()) throw new Error('案件が見つかりません');
            const p = projectDoc(ps);
            if (p.requirements.status !== 'analyzed') throw new Error('差し戻せるのは、お客様の承認待ちの間だけです');
            tx.set(apprRef(projectId, p.requirements.revision, 'withdraw'), {
              schemaVersion: 1, kind: 'requirements', action: 'withdraw', revision: p.requirements.revision, side: 'afro', ...actor(session), at: serverTimestamp(),
            });
            tx.update(projRef(projectId), { 'requirements.status': 'draft', ...stamp(uid) });
          });
        },
        // 予約中の書き込みを今すぐ送り、送信中のものも含めてすべて終わるのを待つ（どの部品が予約したものでも）
        saveNow: async () => {
          const pids = [...timers.keys()];
          const sending = [...writes.inflight];
          try {
            await Promise.all([...pids.map(flushNow), ...sending]);
            return true;
          } catch (e) {
            console.warn('save failed', e);
            return false;
          }
        },
      },

      approvals: {
        useHistory: (projectId) => useSnapshot<ApprovalLog[]>(projectId ? `a:${projectId}` : null, (next, fail) =>
          onSnapshot(query(collection(db, 'projects', projectId, 'approvals'), orderBy('at', 'desc'), limit(LIST_LIMIT)),
            (s) => next(s.docs.map((d) => toApprovalLog(projectId, d))), fail), NO_LOGS),
        approveRequirements: async (projectId, by) => {
          // live の承認はお客様本人だけ（§25-2・§7.3。代理承認は作らない）
          if (by !== 'client' || session.account.role !== 'client') throw new Error('要件定義書の承認はお客様ご本人だけが行えます');
          let rev = -1;
          try {
            await runTransaction(db, async (tx) => {
              const ps = await tx.get(projRef(projectId));
              if (!ps.exists()) throw new Error('案件が見つかりません');
              const p = projectDoc(ps);
              rev = p.requirements.revision;
              if (p.requirements.status !== 'analyzed') throw new Error('いまは承認できる状態ではありません');
              const ref = apprRef(projectId, rev, 'approve');
              const rs = await tx.get(reqRef(projectId));
              const raw = (rs.data() ?? {}) as DocumentData;
              tx.set(ref, {
                schemaVersion: 1, kind: 'requirements', action: 'approve', revision: rev, side: 'client', ...actor(session), at: serverTimestamp(),
                answers: raw.answers ?? {}, ...(raw.proposal ? { proposal: raw.proposal } : {}),
              });
              tx.update(projRef(projectId), {
                'requirements.status': 'approved', 'requirements.approvedAt': serverTimestamp(), 'requirements.approvedBy': uid,
                'requirements.approvalId': ref.id, ...stamp(uid),
              });
            });
          } catch (e) {
            // 二重承認（2 タブ・再送）は Rules が拒否する。記録が既にあれば承認済みとして扱う（無音にしない。§7.2）
            if (rev >= 0 && String((e as { code?: string }).code ?? '').endsWith('permission-denied')) {
              const existing = await getDoc(apprRef(projectId, rev, 'approve')).catch(() => null);
              if (existing?.exists()) {
                console.warn('approval already exists', { projectId, aid: existing.id });
                return;
              }
            }
            throw e;
          }
        },
      },

      accounts: {
        useClientAccounts: () => useRoleList<ClientAccount>('client', clientFromAccount, clientFromInvite),
        useDevUsers: () => useRoleList<DevUser>('developer', devFromAccount, devFromInvite),
        useDevPeople: () => {
          const q = useRoleList<DevUser>('developer', devFromAccount, devFromInvite);
          const people = useMemo(() => q.data.map(devUserToPerson), [q.data]);
          return { ...q, data: people };
        },
        useDevAccess: () => {
          const q = useRoleList<DevUser>('developer', devFromAccount, devFromInvite);
          const access = useMemo(() => Object.fromEntries(q.data.map((u) => [u.id, u.status === 'active' && !u.id.startsWith(INVITE_PREFIX)])), [q.data]);
          return { ...q, data: access };
        },
        useDevProjects: () => {
          const q = useLiveData().projects;
          const map = useMemo(() => {
            const m: Record<string, string[]> = {};
            for (const p of q.data) for (const u of p.memberUids) (m[u] ??= []).push(p.id);
            return m;
          }, [q.data]);
          return { data: map, loading: q.loading, error: q.error };
        },
        saveClientAccount: async (draft) => {
          if (draft.id) return updateAccountName(draft.id, draft.name, uid);
          const email = normalizeEmail(draft.email);
          const batch = writeBatch(db);
          batch.set(doc(db, 'invites', email), {
            schemaVersion: 1, role: 'client', status: 'invited', name: draft.name.trim(), company: draft.company.trim(), projectId: draft.projectId,
            createdAt: serverTimestamp(), createdBy: uid,
          });
          await batch.commit().catch(inviteError);
        },
        setClientAccountStatus: (id, enabled) => setStatus(id, enabled, uid),
        setDevAccess: (memberId, enabled) => setStatus(memberId, enabled, uid),
        saveDevUser: async (draft) => {
          if (draft.id) return updateAccountName(draft.id, draft.name, uid, draft.role);
          const email = normalizeEmail(draft.email);
          const partner = draft.affiliation === 'partner';
          const batch = writeBatch(db);
          batch.set(doc(db, 'invites', email), {
            schemaVersion: 1, role: 'developer', status: 'invited', name: draft.name.trim(), affiliation: draft.affiliation,
            ...(partner ? { partnerCompany: draft.partnerCompany.trim() } : {}),
            ...(draft.role.trim() ? { devRole: draft.role.trim() } : {}),
            createdAt: serverTimestamp(), createdBy: uid,
          });
          await batch.commit().catch(inviteError);
        },
        setDevUserStatus: (id, enabled) => setStatus(id, enabled, uid),
        setDevProjects: async (memberId, projectIds) => {
          if (memberId.startsWith(INVITE_PREFIX)) throw new Error('招待を受け取った後に担当を割り当てられます');
          const batch = writeBatch(db);
          let n = 0;
          for (const p of projectsRef.current) {
            const want = projectIds.includes(p.id);
            const has = p.memberUids.includes(memberId);
            if (want === has) continue;
            batch.update(projRef(p.id), { memberUids: want ? arrayUnion(memberId) : arrayRemove(memberId), ...stamp(uid) });
            n++;
          }
          if (n) await batch.commit();
        },
      },
    };
  }, [pending, select, session, uid, writes, timers]);
}

const NO_LOGS: ApprovalLog[] = [];

/** "YYYY-MM-DD" をその日の 0 時（端末の時刻）にする。new Date("YYYY-MM-DD") は UTC の 0 時になり、日本では日付は合うが西の時間帯で前日になる */
function localDate(ymd: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(ymd);
}
const NONE: never[] = [];

/** 招待の文書 ID はメール。同じメールの招待が既にあると create が update 扱いになり Rules が拒否する */
function inviteError(e: unknown): never {
  if (String((e as { code?: string }).code ?? '').endsWith('permission-denied')) throw new Error('このメールアドレスは招待済みか、招待できない内容です');
  throw e;
}

async function updateAccountName(id: string, name: string, uid: string, devRole?: string) {
  if (id.startsWith(INVITE_PREFIX)) throw new Error('招待中の内容は変更できません。取り消してから招待し直してください');
  await updateDoc(doc(db, 'accounts', id), { name: name.trim(), ...(devRole?.trim() ? { devRole: devRole.trim() } : {}), ...stamp(uid) });
}

/** 有効／無効（accounts）。招待中の人を「無効」にするのは招待の取り消し（§2.4） */
async function setStatus(id: string, enabled: boolean, uid: string) {
  if (id.startsWith(INVITE_PREFIX)) {
    if (enabled) return;
    await updateDoc(doc(db, 'invites', id.slice(INVITE_PREFIX.length)), { status: 'revoked', revokedAt: serverTimestamp() });
    return;
  }
  await updateDoc(doc(db, 'accounts', id), enabled
    ? { status: 'active', ...stamp(uid) }
    : { status: 'disabled', disabledAt: serverTimestamp(), ...stamp(uid) });
}

/** 管理者のユーザー一覧: その役割の accounts ＋ 招待中（invited）の invites */
function useRoleList<T extends { id: string; email: string }>(
  role: 'client' | 'developer',
  fromAccount: (s: Parameters<typeof clientFromAccount>[0]) => T,
  fromInvite: (s: Parameters<typeof clientFromInvite>[0]) => T,
): Query<T[]> {
  const admin = useLiveData().session.account.role === 'admin';
  const accounts = useSnapshot<T[]>(admin ? `acc:${role}` : null, (next, fail) =>
    onSnapshot(query(collection(db, 'accounts'), where('role', '==', role), limit(LIST_LIMIT)), (s) => next(s.docs.map(fromAccount)), fail), NONE as T[]);
  const invites = useSnapshot<T[]>(admin ? `inv:${role}` : null, (next, fail) =>
    onSnapshot(query(collection(db, 'invites'), where('role', '==', role), where('status', '==', 'invited'), limit(LIST_LIMIT)), (s) => next(s.docs.map(fromInvite)), fail), NONE as T[]);
  const data = useMemo(() => {
    const emails = new Set(accounts.data.map((a) => a.email));
    return [...accounts.data, ...invites.data.filter((i) => !emails.has(i.email))];
  }, [accounts.data, invites.data]);
  return { data, loading: accounts.loading || invites.loading, error: accounts.error ?? invites.error };
}
