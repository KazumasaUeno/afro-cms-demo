import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AnswerValue } from '@/types';
import { isEditableV3, type AiDraftDoc, type AnyAiEditable } from '@/types/aiDraft';
import { answersHash } from '@/shared/ai/answersHash';
import { useToast } from '@/hooks/useToast';
import { getAiDraftPort } from './aiDraftPort';
import {
  AI_DRAFT_COPY, AUTOSAVE_DEBOUNCE_MS, aiDraftServerKey, decideResync, deriveAiDraftState, isJobRunning, isNoResponseError, nextRequestId, outcomeOfResponse,
  saveErrorMessage, startErrorMessage, type AiFlagMode, type AiViewerRole, type AutosaveState, type LastRequest, type SaveErrorView,
  type StartErrorView,
} from './aiDraftState';

/**
 * AI 下書きの状態と操作（画面設計 AI_REQUIREMENTS_UI.md §2・§3.3・§4.1。見た目は持たない）。
 * - 購読・生成の開始・編集の保存は aiDraftPort（live だけが登録する）。port が無ければ何もしない
 * - 自動保存: 最後の入力から AUTOSAVE_DEBOUNCE_MS 後に 1 回送る。送信中の入力は応答の後にもう一度送る（同時に 2 本送らない）
 * - requestId: nextRequestId の規則（応答なしの直後の「再試行」だけ同じ ID）
 */

export interface AiDraftHookInput {
  projectId: string;
  answers: Record<string, AnswerValue>;
  reqStatus: 'draft' | 'analyzed' | 'approved';
  role: AiViewerRole;
  isAssignedDeveloper: boolean;
  uid?: string;
  flagMode: AiFlagMode;
  /** false のとき購読しない（パネルを出さないとき） */
  enabled: boolean;
}

export interface GenerateOptions {
  regenerate?: boolean;
  discardEdits?: boolean;
  confirmDiscard?: boolean;
  /** 「再試行」（応答なしの直後だけ同じ requestId） */
  retry?: boolean;
}

/** 生成中の lease 切れを画面に反映する間隔（ms） */
const TICK_MS = 5_000;

/** 編集できる欄だけを取り出す（v3 は doc、v2 は draft。v3 に draft を探さない＝U4 の持ち越し） */
const pickEditable = (src: AnyAiEditable): AnyAiEditable =>
  isEditableV3(src) ? { summary: src.summary, points: src.points, doc: src.doc } : { summary: src.summary, points: src.points, draft: src.draft };
const editableOf = (d: AiDraftDoc | null): AnyAiEditable | null => {
  const src = d?.edited ?? d?.generated;
  return src ? pickEditable(src) : null;
};

export function useAiDraft(i: AiDraftHookInput) {
  const port = getAiDraftPort();
  const toast = useToast();
  const active = i.enabled && !!port && !!i.projectId;
  const [doc, setDoc] = useState<AiDraftDoc | null>(null);
  const [loading, setLoading] = useState(active);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [hashNow, setHashNow] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<StartErrorView | null>(null);
  const lastReq = useRef<LastRequest | null>(null);

  // 購読
  useEffect(() => {
    if (!active || !port) return undefined;
    setLoading(true);
    let alive = true;
    const unsub = port.subscribe(
      i.projectId,
      (d) => { if (alive) { setDoc(d); setLoading(false); setLoadError(null); } },
      (e) => { console.warn('aiDraft snapshot failed', e); if (alive) { setLoadError(e); setLoading(false); } },
    );
    return () => { alive = false; unsub(); };
  }, [active, port, i.projectId]);

  // 回答のハッシュ（answersChanged の判定）
  const answersKey = useMemo(() => JSON.stringify(i.answers), [i.answers]);
  useEffect(() => {
    if (!active) return undefined;
    let alive = true;
    answersHash(i.answers).then((h) => { if (alive) setHashNow(h); }, () => { if (alive) setHashNow(null); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, answersKey]);

  // 生成中だけ時計を進める（lease 切れ → stalled）
  const runningRaw = doc?.job?.state === 'running';
  useEffect(() => {
    if (!runningRaw) return undefined;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(t);
  }, [runningRaw]);

  const view = deriveAiDraftState({
    doc, now, answersHashNow: hashNow, role: i.role, isAssignedDeveloper: i.isAssignedDeveloper, flagMode: i.flagMode, reqStatus: i.reqStatus, uid: i.uid,
  });
  const running = isJobRunning(doc, now);

  // ---------------- 生成の開始（§4.1） ----------------
  const generate = useCallback(async (o: GenerateOptions = {}) => {
    if (!port) return;
    const requestId = nextRequestId(lastReq.current, !!o.retry);
    setStarting(true);
    setStartError(null);
    try {
      const res = await port.request({
        projectId: i.projectId, requestId, regenerate: !!o.regenerate, discardEdits: !!o.discardEdits, confirmDiscard: !!o.confirmDiscard,
      });
      lastReq.current = outcomeOfResponse(requestId);
      if ('reused' in res && res.reused) toast(AI_DRAFT_COPY.reused, 'info');
    } catch (e) {
      console.warn('requestRequirementsDraft failed', e);
      lastReq.current = isNoResponseError(e) ? { requestId, outcome: 'no-response' } : outcomeOfResponse(requestId);
      setStartError(startErrorMessage(e));
    } finally {
      setStarting(false);
    }
  }, [port, i.projectId, toast]);

  // ---------------- 編集と自動保存（§3.3） ----------------
  const [local, setLocal] = useState<AnyAiEditable | null>(null);
  const [save, setSave] = useState<AutosaveState>('idle');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<SaveErrorView | null>(null);
  const latest = useRef<AnyAiEditable | null>(null);
  const version = useRef(0);
  const sentVersion = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef<AutosaveState>('idle');
  const staleByRegen = useRef(false);
  saveRef.current = save;

  // サーバーの値が変わったら（生成の開始・完了・他の人の保存）取り込み直す。判定は decideResync（未保存の変更は黙って捨てない）
  const serverKey = aiDraftServerKey(doc);
  useEffect(() => {
    const d = decideResync({ save: saveRef.current, staleByRegen: staleByRegen.current, jobRunning: doc?.job?.state === 'running' });
    if (d.clearStale) staleByRegen.current = false;
    if (d.clearSaveError) { setSave('idle'); setSaveError(null); }
    if (!d.resync) return;
    const e = editableOf(doc);
    setLocal(e);
    latest.current = e;
    sentVersion.current = version.current; // サーバーの値＝送るものは無い
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverKey]);

  const inFlight = useRef<Promise<boolean> | null>(null);
  const flush = useCallback(async (): Promise<boolean> => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    // 送信中なら同じ結果を待つ（ループが応答の後に version を見てもう一度送る）
    if (inFlight.current) return inFlight.current;
    if (!port || !latest.current) return false;
    if (version.current === sentVersion.current) return true; // 変更なし（もう送ってある・サーバーの値のまま）
    const run = (async () => {
      try {
        for (;;) {
          const v = version.current;
          const body = latest.current as AnyAiEditable;
          setSave('saving');
          await port.saveEdits(i.projectId, body);
          sentVersion.current = v;
          if (version.current === v) break;
        }
        setSave('saved');
        setSavedAt(new Date());
        setSaveError(null);
        return true;
      } catch (e) {
        console.warn('saveAiDraftEdits failed', e);
        const v = saveErrorMessage(e);
        staleByRegen.current = v.offerCopy;
        setSave('failed');
        setSaveError(v);
        return false;
      } finally {
        inFlight.current = null;
      }
    })();
    inFlight.current = run;
    return run;
  }, [port, i.projectId]);
  const flushRef = useRef(flush);
  flushRef.current = flush;

  const update = useCallback((next: AnyAiEditable) => {
    setLocal(next);
    latest.current = next;
    version.current += 1;
    if (!inFlight.current) setSave('pending');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flush(); }, AUTOSAVE_DEBOUNCE_MS);
  }, [flush]);

  /** 「内容を確認した」: generated の 3 欄をそのまま edited へ（ダイアログなしで即時に送る） */
  const confirm = useCallback(async () => {
    const g = doc?.generated;
    if (!g) return false;
    const e = pickEditable(g);
    latest.current = e;
    setLocal(e);
    version.current += 1;
    return flush();
  }, [doc, flush]);

  /** 「変更をコピー」（generation-running のとき。プレーンテキスト） */
  const pendingText = useCallback((): string => {
    const e = latest.current;
    if (!e) return '';
    if (isEditableV3(e)) return [e.summary, '', ...e.points.flatMap((p) => [`■ ${p.title}`, p.detail, p.impact, '']), ...Object.values(e.doc.items).map((it) => it.text).filter(Boolean), ...e.doc.added.flatMap((a) => [`■ ${a.label}`, a.text])].join('\n');
    const d = e.draft;
    return [
      e.summary, '',
      ...e.points.flatMap((p) => [`■ ${p.title}`, p.detail, p.impact, '']),
      d.goal, d.target, d.contents, d.features, d.nonFunctional, d.operation, d.schedule, ...d.openQuestions,
    ].join('\n');
  }, []);

  // 画面を離れるとき: 待っている保存（pending、または送信中に入った次の入力）を即時に送り、タイマーを残さない。
  // 失敗のままならブラウザの確認を出す。flush の作り直しで後片付けが走らないよう ref で呼ぶ（依存なし）
  useEffect(() => () => {
    if (!timer.current) return;
    clearTimeout(timer.current);
    timer.current = null;
    void flushRef.current();
  }, []);
  useEffect(() => {
    if (save !== 'pending' && save !== 'failed' && save !== 'saving') return undefined;
    const h = (ev: BeforeUnloadEvent) => { ev.preventDefault(); ev.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [save]);

  return {
    available: active, loading, loadError, doc, view, running, now,
    generate, starting, startError, clearStartError: () => setStartError(null),
    local, update, flush, confirm, save, savedAt, saveError, pendingText,
  };
}

export type AiDraftHook = ReturnType<typeof useAiDraft>;
