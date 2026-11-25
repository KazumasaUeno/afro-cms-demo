import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  arrayRemove, arrayUnion, collection, deleteField, doc, getDoc, limit, limitToLast, onSnapshot, orderBy, query, runTransaction, serverTimestamp, setDoc,
  Timestamp, updateDoc, where, writeBatch, type DocumentData,
} from 'firebase/firestore';
import { REQUIREMENT_QUESTIONS } from '@/data/requirements';
import { devUserToPerson, type DevPerson } from '@/data/people';
import { normalizeEmail } from '@/data/users';
import { buildProposal } from '@/features/requirements/buildProposal';
import { isAnswered, validateAnswer } from '@/features/requirements/validation';
import { projectFromDraft, siteHost } from '@/features/projects/projectForm';
import type { Query, Repositories } from '@/repositories/types';
import type { AnswerValue, ApprovalLog, ClientAccount, DevUser } from '@/types';
import type { AiDraftDoc, StoredProposal } from '@/types/aiDraft';
import { isJobRunning } from '@/features/requirements/aiDraft/aiDraftState';
import { db } from './firebase';
import {
  clientFromAccount, clientFromInvite, deepIso, devFromAccount, devFromInvite, INVITE_PREFIX, LIST_LIMIT, MAX_MEMBERS, messageDoc, projectDoc, proposalForSave, proposalV2FromDraft, reqDoc, toApprovalLog, toProject,
  taskDoc, toSession, type MessageDoc, type ProjectDoc, type ReqDoc, type TaskDoc, type TaskStatus,
} from './model';
import { TASK_LIMIT, newestTasksInOrder, type NewTaskInput } from './tasks';
import { cleanConsultText, consultBlock, consultSide, seqId, validateConsultText } from './consult';
import { PendingAnswers } from './pendingAnswers';
import { cancelScheduledWrites, type ScheduledWrite } from './pendingWrites';
import type { LiveSession } from './session';
import { useSnapshot } from './useSnapshot';

/**
 * live（Firestore）の repository（BACKEND_FIREBASE §13.2 の 2 段目）。形は repositories/types.ts、権限の実体は firestore.rules。
 * - 読み取り: onSnapshot（useSnapshot）。案件の一覧は LiveDataProvider で 1 つだけ購読する
 * - 回答: 入力が落ち着いてからまとめて 1 回の update（PendingAnswers）。Rules を通らない途中の値は保存しない
 * - 確認依頼・差し戻し・承認: runTransaction（オンライン必須。状態と証跡を同じ書き込みにする。§7）
 */

const ANSWER_DEBOUNCE_MS = 1200;

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
  timers: Map<string, ScheduledWrite>;
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
  // ログアウト（無効化による強制ログアウトを含む）で外れたら、残った予約を止める。signOut の後に送っても Rules が拒否するだけなので、
  // 待っている呼び出し元へ「保存していない」と返す（無音で捨てない）。通常のログアウトは LiveLogoutButton が先に送り切る
  useEffect(() => {
    const writes = writesRef.current!;
    return () => {
      const n = cancelScheduledWrites(writes.timers, (t) => window.clearTimeout(t));
      if (n) console.warn('pending answer writes cancelled on unmount', n);
    };
  }, []);
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

/** 表示中の 1 案件（案件の切り替えは既存の select()。一覧に無ければ null） */
export function useLiveCurrentProject(): ProjectDoc | null {
  const { projects, currentId } = useLiveData();
  return useMemo(() => projects.data.find((p) => p.id === currentId) ?? null, [projects.data, currentId]);
}

/* ---------- 構築タスク（projects/{pid}/tasks。docs/design/LIVE_DASHBOARD_TASKS_CONSULT.md §2.1・U2） ---------- */

const NO_TASKS: TaskDoc[] = [];
const tasksCol = (pid: string) => collection(db, 'projects', pid, 'tasks');

/**
 * 1 案件のタスク（リアルタイム。構築タスク画面とダッシュボードの構築状況が同じ形で購読する。キー t:{pid}）。
 * **新しい順に** TASK_LIMIT 件を取り、画面には古い順で渡す（単一フィールドの並び＝複合 Index 不要。desc も単一フィールドの自動 Index）。
 * 上限を超えたら出なくなるのは最も古いタスク（新しく追加したタスクは必ず出る。2026-11-25 U2 セキュリティレビューの指摘。tasks.ts taskLimitNote）。
 * 「自分の担当のみ」・状態別は画面で絞る。お客様は Rules で読めないので購読しない（null）
 */
export function useLiveTasks(projectId: string | null): Query<TaskDoc[]> {
  const role = useLiveData().session.account.role;
  const key = projectId && role !== 'client' ? `t:${projectId}` : null;
  return useSnapshot<TaskDoc[]>(key, (next, fail) =>
    onSnapshot(query(tasksCol(projectId!), orderBy('createdAt', 'desc'), limit(TASK_LIMIT)), (s) => next(newestTasksInOrder(s.docs.map(taskDoc))), fail), NO_TASKS);
}

/** タスクの追加・状態の変更（担当の開発者だけ。Rules の taskCreateOk / taskUpdateOk と同じ形。削除は無い） */
export function useLiveTaskActions(): {
  create: (projectId: string, input: NewTaskInput) => Promise<void>;
  setStatus: (projectId: string, taskId: string, status: TaskStatus) => Promise<void>;
} {
  const { session } = useLiveData();
  const uid = session.uid;
  const role = session.account.role;
  return useMemo(() => {
    const guard = () => {
      if (role !== 'developer') throw new Error('構築タスクを変更できるのは、担当の開発者だけです');
    };
    return {
      create: async (projectId, input) => {
        guard();
        // 書く値は prepareNewTask（tasks.ts）で検査・trim 済みのもの
        await setDoc(doc(tasksCol(projectId)), {
          schemaVersion: 1, title: input.title, page: input.page, assigneeUids: input.assigneeUids, status: 'todo',
          createdAt: serverTimestamp(), createdBy: uid, ...stamp(uid),
        });
      },
      setStatus: async (projectId, taskId, status) => {
        guard();
        await updateDoc(doc(db, 'projects', projectId, 'tasks', taskId), { status, ...stamp(uid) });
      },
    };
  }, [role, uid]);
}

/* ---------- 相談（projects/{pid}/messages と projects/{pid}.consult。docs/design/LIVE_DASHBOARD_TASKS_CONSULT.md §2.2・U3） ---------- */

const NO_MESSAGES: MessageDoc[] = [];
const msgsCol = (pid: string) => collection(db, 'projects', pid, 'messages');

/**
 * 1 案件の会話（リアルタイム。開いている会話 1 本だけ）。seq の古い順で、新しい方から max 件（orderBy('seq') limitToLast。単一フィールド＝複合 Index 不要）。
 * 「さらに読む」は max を増やして購読し直す（届くまで前の会話を出す。useSnapshot の keep）。一覧・未対応・バッジは案件一覧の consult（追加 Read 0）
 */
export function useLiveMessages(projectId: string | null, max: number): Query<MessageDoc[]> {
  const key = projectId ? `m:${projectId}:${max}` : null;
  return useSnapshot<MessageDoc[]>(key, (next, fail) =>
    onSnapshot(query(msgsCol(projectId!), orderBy('seq'), limitToLast(max)), (s) => next(s.docs.map(messageDoc)), fail), NO_MESSAGES,
    // 件数を増やして購読し直す間は、同じ案件の今の会話を出し続ける（読み込み中に空の表示へ戻さない）
    projectId ? `m:${projectId}` : undefined);
}

/**
 * 相談を 1 件送る（お客様＝自分の案件、担当の開発者＝返信。admin は送れない）。
 * runTransaction: 案件を読む → seq = count + 1 → メッセージの作成と consult の更新を同じ書き込みにする（Rules の consultOk / msgCreateOk が両方の一致を強制）。
 * 同時に送られたら片方が競合でやり直し、次の番号になる。通信が切れて結果が分からないまま再送すると二重になりうる（設計 §2.2。送信中はボタンを無効にする）
 */
export function useLiveConsultActions(): { send: (projectId: string, text: string) => Promise<void> } {
  const { session } = useLiveData();
  return useMemo(() => ({
    send: async (projectId, raw) => {
      // 向きの制御・制御文字を除いてから検査して送る（Rules も同じ文字を拒否する。consult.ts cleanConsultText）
      const text = cleanConsultText(raw);
      const err = validateConsultText(text);
      if (err) throw new ConsultError(err);
      const { uid, account } = session;
      try {
        await runTransaction(db, async (tx) => {
          const ps = await tx.get(projRef(projectId));
          if (!ps.exists()) throw new ConsultError('プロジェクトが見つかりません');
          const p = projectDoc(ps);
          const side = consultSide(account.role, uid, account.projectId, p);
          if (!side) throw new ConsultError('このプロジェクトの相談には送信できません（閲覧のみ）');
          const block = consultBlock(p, Date.now());
          if (block) throw new ConsultError(block);
          const seq = (p.consult?.count ?? 0) + 1;
          tx.set(doc(msgsCol(projectId), seqId(seq)), {
            schemaVersion: 1, seq, text: text.trim(), side, authorUid: uid, authorName: account.name, at: serverTimestamp(),
          });
          // updatedAt は変えない（一覧の並びを相談で動かさない。consultOk は changed().hasOnly(['consult'])）
          tx.update(projRef(projectId), { consult: { count: seq, lastAt: serverTimestamp(), lastSide: side, lastName: account.name } });
        });
      } catch (e) {
        if (e instanceof ConsultError) throw e;
        // Rules の拒否（連投・名前の変更直後・担当を外れた等）。理由はサーバーから分からないので、よくある原因を案内する（ログには残す）
        console.warn('consult send failed', { projectId }, e);
        if (String((e as { code?: string }).code ?? '').endsWith('permission-denied')) {
          throw new ConsultError('送信できませんでした。少し時間をおいてから、もう一度お試しください（続けて送信した・担当が変わった可能性があります）');
        }
        throw e;
      }
    },
  }), [session]);
}

/** 画面にそのまま出せる理由つきの送信エラー */
export class ConsultError extends Error {}

/**
 * 担当の名前（accounts を uid ごとに 1 回 get。最大 20 件）。admin は全員、社内の開発者は社内・協力会社とも、
 * 協力会社の開発者は社内の人と自分だけ読める（firestore.rules accounts の get）。読めない人は「担当者（協力会社）」と出す
 */
export function useAccountPeople(uids: readonly string[]): Record<string, DevPerson> {
  const key = [...new Set(uids)].sort().join(',');
  const [people, setPeople] = useState<Record<string, DevPerson>>({});
  useEffect(() => {
    if (!key) return undefined;
    let alive = true;
    const ids = key.split(',');
    Promise.all(ids.map(async (id): Promise<[string, DevPerson]> => {
      try {
        const s = await getDoc(doc(db, 'accounts', id));
        if (s.exists()) return [id, devUserToPerson(devFromAccount(s))];
      } catch (e) {
        // 権限で読めない（協力会社の開発者から他社の人）のは想定内。それ以外も名前の表示だけなので画面は止めない（ログには残す）
        if (!String((e as { code?: string }).code ?? '').endsWith('permission-denied')) console.warn('account name read failed', id, e);
      }
      return [id, unknownPerson(id)];
    })).then((entries) => { if (alive) setPeople(Object.fromEntries(entries)); });
    return () => { alive = false; };
  }, [key]);
  return people;
}

function unknownPerson(id: string): DevPerson {
  return devUserToPerson({ id, name: '担当者（協力会社）', role: '', email: '', affiliation: 'partner', status: 'active', createdAt: '' });
}

const EMPTY_REQ: ReqDoc | null = null;

const reqRef = (pid: string) => doc(db, 'projects', pid, 'requirements', 'current');
const projRef = (pid: string) => doc(db, 'projects', pid);
const aiDraftRef = (pid: string) => doc(db, 'projects', pid, 'aiDrafts', 'requirements');
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
          // 作れるのは開発者と admin（2026-11-25 ユーザー決定「管理者もプロジェクトを作れるように」）。Rules の projCreateOk と同じ形
          const role = session.account.role;
          if (role !== 'developer' && role !== 'admin') throw new Error('プロジェクトは開発者が作成します');
          // 開発者は自分だけが担当（draft.devIds は使わない）。admin は画面で選んだ開発者の uid（draft.devIds。招待中の人・自分は入れない。
          // 空でもよく、後から「担当を変更」で割り当てる）
          const memberUids = role === 'developer'
            ? [uid]
            : [...new Set(draft.devIds ?? [])].filter((m) => m && m !== uid && !m.startsWith(INVITE_PREFIX));
          if (memberUids.length > MAX_MEMBERS) throw new Error(`担当の開発者は${MAX_MEMBERS}人までです`);
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
            ownerUid: uid, memberUids, requirements: { status: 'draft', revision: 0 }, archived: false,
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
        completeAnalysis: async (projectId, opts) => {
          await flushNow(projectId);
          const fromAi = opts?.proposal === 'aiDraft';
          await runTransaction(db, async (tx) => {
            const ps = await tx.get(projRef(projectId));
            const rs = await tx.get(reqRef(projectId));
            // v2: 下書きも同じ transaction で読む（読んだ後に作り直し・保存が入れば transaction がやり直す）
            const as = fromAi ? await tx.get(aiDraftRef(projectId)) : null;
            if (!ps.exists() || !rs.exists()) throw new Error('案件が見つかりません');
            const p = projectDoc(ps);
            if (p.requirements.status !== 'draft') throw new Error('すでに確認を依頼しています');
            const raw = rs.data() as DocumentData;
            const answers = (raw.answers ?? {}) as Record<string, AnswerValue>;
            const comp = answers['q-competitor'];
            let proposal: StoredProposal;
            if (as) {
              const ai = as.exists() ? (as.data() as DocumentData) : null;
              if (!ai || ai.state !== 'ready' || !ai.generated || !ai.edited) throw new Error('確認済みの AI 下書きがありません');
              // lease 切れの running は止まったもの（承認依頼のボタンの判定 approvalBlock と同じ isJobRunning）
              if (isJobRunning(deepIso(ai) as AiDraftDoc, Date.now())) throw new Error('AI 下書きの生成が終わってから依頼してください');
              // Rules（proposalV2Ok）はマップの等式で比べる: 値を変えずに写す（flags は写さない）
              proposal = proposalV2FromDraft(ai.generated as DocumentData, ai.edited as DocumentData);
            } else {
              proposal = proposalForSave(buildProposal(answers, Array.isArray(comp) ? comp : []));
            }
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
