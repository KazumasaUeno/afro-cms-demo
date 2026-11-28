import type { DocumentData } from 'firebase/firestore';
import type { SitemapEdge, SitemapNode, SitemapState } from '@/types';
import { cleanSitemapDiagram, validateSitemapDoc, type SitemapIssue } from '@/shared/ai/sitemapRules';
import { toIso } from './model';

/**
 * live のサイトマップ（LIVE_SITEMAP_DATA §2・LIVE_SITEMAP_IMPL_PLAN §3 U2）の純関数。React・Firebase の実体を import しない（単体テストが直接読む）。
 * 中身の書き込みは callable（saveSitemapEdits・submitSitemap・requestSitemapDraft）だけ。状態だけの遷移（取り下げ・承認・代理・再計画）は Rules＋クライアント TX。
 * 権限の実体は firestore.rules（siteProjOk・siteApprOk）と callable の検査
 */

export type SitemapStatus = 'draft' | 'requested' | 'approved';

/** projects/{pid}.sitemap（要約。状態の正。DATA §2.1）。キー無し＝none */
export interface SitemapSummary {
  status: SitemapStatus;
  revision: number;
  requestedAt?: string;
  contentHash?: string;
  approvedRevision?: number;
  approvedAt?: string;
  approvedBy?: string;
  approvalId?: string;
  approvedVia?: 'proxy';
}

export interface SitemapDiagram { nodes: SitemapNode[]; edges: SitemapEdge[] }
export type SitemapOrigin = 'ai' | 'manual';

/** sitemap/internal（作業中の版。admin・担当だけ。DATA §2.2） */
export interface SitemapInternal {
  before: SitemapDiagram;
  after: SitemapDiagram;
  devComment?: { text: string; at: string; byName: string };
  origin: SitemapOrigin;
  sourceReqRevision?: number;
  editSeq: number;
  updatedAt?: string;
  savedByName: string;
}

/** sitemapVersions/r{N}（お客様に出した版。不変。DATA §2.3） */
export interface SitemapVersion {
  revision: number;
  before: SitemapDiagram;
  after: SitemapDiagram;
  devComment?: { text: string; at: string; byName: string };
  origin: SitemapOrigin;
  contentHash: string;
  submittedAt?: string;
}

/** aiDrafts/sitemap のうち画面が使う値（DATA §7。generated の中身は読まない＝internal に写った後の値を使う） */
export interface SitemapAiDraft {
  running: boolean;
  /** 最後の依頼が失敗した（state failed、または前の成功の後の失敗＝state ready のまま lastError がある） */
  failed: boolean;
  /** 最後の依頼は成功したが、作成中に編集・手で作成されたため internal へ反映しなかった（generated.applied=false） */
  kept: boolean;
  errorCode?: string;
}

const obj = (v: unknown): DocumentData | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as DocumentData) : null);
const int = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

export function sitemapSummaryOf(v: unknown): SitemapSummary | null {
  const s = obj(v);
  if (!s || (s.status !== 'draft' && s.status !== 'requested' && s.status !== 'approved') || !int(s.revision)) return null;
  return {
    status: s.status,
    revision: s.revision,
    ...(toIso(s.requestedAt) ? { requestedAt: toIso(s.requestedAt) } : {}),
    ...(typeof s.contentHash === 'string' ? { contentHash: s.contentHash } : {}),
    ...(int(s.approvedRevision) ? { approvedRevision: s.approvedRevision } : {}),
    ...(toIso(s.approvedAt) ? { approvedAt: toIso(s.approvedAt) } : {}),
    ...(typeof s.approvedBy === 'string' ? { approvedBy: s.approvedBy } : {}),
    ...(typeof s.approvalId === 'string' ? { approvalId: s.approvalId } : {}),
    ...(s.approvedVia === 'proxy' ? { approvedVia: 'proxy' as const } : {}),
  };
}

/** 図（形の壊れたノード・接続は捨てる。表示用。保存の検査は validateSitemapDoc） */
export function diagramOf(v: unknown): SitemapDiagram {
  const d = obj(v);
  const nodes: SitemapNode[] = [];
  for (const n of Array.isArray(d?.nodes) ? d!.nodes : []) {
    const x = obj(n);
    const p = obj(x?.position);
    const data = obj(x?.data);
    if (!x || typeof x.id !== 'string' || !p || typeof p.x !== 'number' || typeof p.y !== 'number' || !data) continue;
    if (typeof data.label !== 'string' || typeof data.path !== 'string') continue;
    const kind = ['home', 'section', 'page', 'cta', 'new'].includes(data.kind) ? data.kind : 'page';
    nodes.push({ id: x.id, position: { x: p.x, y: p.y }, data: { label: data.label, path: data.path, kind, ...(typeof data.reason === 'string' && data.reason ? { reason: data.reason } : {}) } });
  }
  const ids = new Set(nodes.map((n) => n.id));
  const edges: SitemapEdge[] = [];
  for (const e of Array.isArray(d?.edges) ? d!.edges : []) {
    const x = obj(e);
    if (!x || typeof x.id !== 'string' || !ids.has(x.source) || !ids.has(x.target)) continue;
    edges.push({ id: x.id, source: x.source, target: x.target });
  }
  return { nodes, edges };
}

const commentOf = (v: unknown) => {
  const c = obj(v);
  return c && typeof c.text === 'string' && c.text ? { devComment: { text: c.text, at: toIso(c.at) ?? (typeof c.at === 'string' ? c.at : ''), byName: String(c.byName ?? '') } } : {};
};
const originOf = (v: unknown): SitemapOrigin => (v === 'ai' ? 'ai' : 'manual');

export function sitemapInternalDoc(d: DocumentData | null | undefined): SitemapInternal | null {
  if (!d || !int(d.editSeq)) return null;
  return {
    before: diagramOf(d.before), after: diagramOf(d.after), ...commentOf(d.devComment), origin: originOf(d.origin),
    ...(int(d.sourceReqRevision) ? { sourceReqRevision: d.sourceReqRevision } : {}),
    editSeq: d.editSeq, ...(toIso(d.updatedAt) ? { updatedAt: toIso(d.updatedAt) } : {}), savedByName: String(d.savedByName ?? ''),
  };
}

export function sitemapVersionDoc(d: DocumentData | null | undefined): SitemapVersion | null {
  if (!d || !int(d.revision) || d.revision < 1 || typeof d.contentHash !== 'string') return null;
  return {
    revision: d.revision, before: diagramOf(d.before), after: diagramOf(d.after), ...commentOf(d.devComment), origin: originOf(d.origin),
    contentHash: d.contentHash, ...(toIso(d.submittedAt) ? { submittedAt: toIso(d.submittedAt) } : {}),
  };
}

export function sitemapAiDraftOf(d: DocumentData | null | undefined): SitemapAiDraft | null {
  if (!d) return null;
  const job = obj(d.job);
  const err = obj(d.lastError);
  const running = job?.state === 'running';
  // 作り直しの失敗は前の結果を残すため state は ready のまま（sitemapTask.ts）。失敗は lastError でも見る（成功は lastError を消す）
  const failed = !running && (d.state === 'failed' || typeof err?.code === 'string');
  const kept = !running && !failed && d.state === 'ready' && obj(d.generated)?.applied === false;
  return { running, failed, kept, ...(typeof err?.code === 'string' ? { errorCode: err.code } : {}) };
}

/** 「要件定義書の案から作成しました」を出すか。AI が作った版だけ（手で作った版も sourceReqRevision を持つため origin で見る。QA O-1） */
export const sitemapFromRequirements = (internal: Pick<SitemapInternal, 'origin'> | null | undefined) => internal?.origin === 'ai';

/** 承認の記録の ID（DATA §2.4。ID が冪等キー） */
export const sitemapApprovalIdOf = (revision: number, action: 'approve' | 'withdraw' | 'reopen' = 'approve') => `sitemap-r${revision}-${action}`;

/* ---------- お客様の表示（D-4: お客様が読むのは版文書だけ） ---------- */

/** お客様が読む版の番号（依頼中・承認済み → 要約の revision、下書きで承認歴あり → approvedRevision、それ以外 → null＝準備中） */
export function clientVersionToRead(summary: SitemapSummary | null): number | null {
  if (!summary || summary.revision < 1) return null;
  if (summary.status === 'requested' || summary.status === 'approved') return summary.revision;
  return summary.approvedRevision ?? null;
}

export type ClientSitemapView =
  | { kind: 'none' }
  | { kind: 'shown'; status: 'requested' | 'approved' | 'adjusting'; version: SitemapVersion; approvedVia?: 'proxy' };

/** 準備中（none）／依頼中／承認済み／調整中（前回承認版）。読めた版の番号が要約と違えば出さない */
export function clientSitemapView(summary: SitemapSummary | null, version: SitemapVersion | null): ClientSitemapView {
  const rev = clientVersionToRead(summary);
  if (rev === null || !version || version.revision !== rev) return { kind: 'none' };
  const status = summary!.status === 'draft' ? 'adjusting' : summary!.status;
  return { kind: 'shown', status, version, ...(status === 'approved' && summary!.approvedVia === 'proxy' ? { approvedVia: 'proxy' as const } : {}) };
}

/* ---------- 承認の対象（P-3: 表示した版の revision・contentHash） ---------- */

export interface SitemapShown { revision: number; contentHash: string }

export type SitemapConflict = 'revision' | 'changed' | null;

/** 表示した版と TX 内の要約を比べる。版が違う → 'revision'、ハッシュが違う → 'changed'。どちらも承認を送らない（AC-09） */
export function sitemapConflict(shown: SitemapShown, actual: Pick<SitemapSummary, 'revision' | 'contentHash'> | null): SitemapConflict {
  if (!actual || shown.revision !== actual.revision) return 'revision';
  if (!shown.contentHash || shown.contentHash !== actual.contentHash) return 'changed';
  return null;
}

/** 承認の記録（Rules siteApprOk の形。actor は呼び出し側） */
export function sitemapApproveRecord(shown: SitemapShown, proxy: { note: string } | null): Record<string, unknown> {
  return {
    schemaVersion: 1, kind: 'sitemap', action: 'approve', revision: shown.revision, side: proxy ? 'afro' : 'client', contentHash: shown.contentHash,
    ...(proxy ? { proxy: true, note: proxy.note } : {}),
  };
}

/** 二重承認の再送か（scheduleApproveReplay と同じ考え） */
export function sitemapApproveReplay(sum: SitemapSummary | null, shownRevision: number, record: DocumentData | null | undefined, proxy: boolean): 'same' | 'other' | null {
  if (sum?.status !== 'approved' || shownRevision !== sum.revision || sum.approvalId !== sitemapApprovalIdOf(sum.revision)) return null;
  if (!record || record.action !== 'approve' || record.revision !== sum.revision) return null;
  return (record.proxy === true) === proxy ? 'same' : 'other';
}

export const SITEMAP_CONFLICT_TEXT = { save: 'ほかの人が先に保存しました。最新を読み込みました', approve: '内容が変わりました。最新を読み込みました' } as const;

/* ---------- アフロ側の画面の state（SitemapView・ProjectDetailView が読む demo の SitemapState の形） ---------- */

export function liveSitemapState(summary: SitemapSummary | null, internal: SitemapInternal | null, approvedVersion?: SitemapVersion | null): SitemapState {
  const src = internal ?? approvedVersion ?? null;
  const c = src?.devComment;
  return {
    before: src?.before ?? { nodes: [], edges: [] },
    after: src?.after ?? { nodes: [], edges: [] },
    ...(summary?.status === 'approved' && summary.approvedAt ? { approvedAt: summary.approvedAt } : {}),
    ...(c ? { devComment: { text: c.text, at: c.at, by: c.byName } } : {}),
  };
}

/** 編集できるか（OQ-N4: 依頼中は編集不可。承認後も不可。アーカイブ・要件未承認・権限なし・AI 実行中も不可） */
export function sitemapEditable(o: { afro: boolean; archived: boolean; reqApproved: boolean; status: SitemapStatus | null; aiRunning: boolean }): boolean {
  return o.afro && !o.archived && o.reqApproved && o.status === 'draft' && !o.aiRunning;
}

/** 依頼できない理由（null＝依頼できる）。不正なページの件数は validateSitemapDoc と同じ判定（C-04） */
export function sitemapSubmitBlock(doc: { before: SitemapDiagram; after: SitemapDiagram }, scheduleApproved: boolean): string | null {
  if (!scheduleApproved) return 'お客様がスケジュールを承認すると依頼できます';
  const { errors } = validateSitemapDoc({ before: doc.before, after: doc.after });
  const bad = new Set(errors.map((e: SitemapIssue) => `${e.field.split('.')[0]}:${e.nodeId ?? e.field}`)).size;
  if (bad) return `直す必要がある項目が${bad}件あります`;
  const after = doc.after.nodes;
  if (!after.some((n) => n.data.kind === 'home') || after.length < 2) return '改善後の図にトップと1ページ以上を置いてください';
  return null;
}

/* ---------- callable の失敗（PLAN §2 エラーコード） ---------- */

export class SitemapConflictError extends Error {}

export function sitemapCallableError(e: unknown): Error {
  const code = String((e as { code?: string })?.code ?? '').replace(/^functions\//, '');
  const details = (e as { details?: unknown })?.details;
  const d = obj(details);
  if (code === 'aborted') return new SitemapConflictError(SITEMAP_CONFLICT_TEXT.save);
  if (code === 'permission-denied') return new Error('権限がありません（担当が変わった・アーカイブされた可能性があります）');
  if (code === 'resource-exhausted') return new Error('AI の利用回数の上限に達しました。時間をおいて試すか、手で作成してください');
  if (code === 'invalid-argument') return new Error(typeof d?.count === 'number' ? `内容を確認してください（${d.count}件）` : '内容を確認してください');
  if (code === 'failed-precondition') {
    const reason = typeof details === 'string' ? details : String(d?.reason ?? '');
    const T: Record<string, string> = {
      'ai-disabled': 'この案件では AI での作成を使えません。手で作成してください', 'req-not-approved': '要件定義書の承認の後に作成できます',
      'schedule-not-approved': 'お客様がスケジュールを承認すると依頼できます', state: 'いまの状態では操作できません。画面を開き直してください',
      'job-running': 'AI が作成している間は操作できません', archived: 'アーカイブ中の案件は変更できません',
    };
    return new Error(T[reason] ?? 'いまの状態では操作できません。画面を開き直してください');
  }
  return e instanceof Error ? e : new Error('保存できませんでした。接続を確かめてください');
}

/* ---------- 保存のまとめ（AC-17: 1 秒以上まとめる。書き込みは同時に 1 本・最後の値だけ） ---------- */

export interface SaveQueueTimer { set: (fn: () => void, ms: number) => unknown; clear: (t: unknown) => void }

/**
 * push で最新の値を預け、delayMs 何も来なければ 1 回書く。書いている間に来た値は、書き終わってから次の 1 回にまとめる。
 * write は新しい editSeq を返す（次の baseEditSeq）。base() は待ちが無いときの基準（internal.editSeq）
 */
export function createSaveQueue<T>(o: {
  delayMs: number; base: () => number | null; write: (v: T, baseEditSeq: number) => Promise<number>;
  onError: (e: unknown) => void; timer?: SaveQueueTimer;
}) {
  const timer: SaveQueueTimer = o.timer ?? { set: (fn, ms) => setTimeout(fn, ms), clear: (t) => clearTimeout(t as ReturnType<typeof setTimeout>) };
  let pending: { v: T } | null = null;
  let handle: unknown = null;
  let inflight: Promise<void> | null = null;
  let seq: number | null = null;
  const run = (): Promise<void> => {
    handle = null;
    if (!pending || inflight) return inflight ?? Promise.resolve();
    const { v } = pending;
    pending = null;
    const base = seq ?? o.base();
    if (base === null) { o.onError(new Error('サイトマップの記録が読めません')); return Promise.resolve(); }
    inflight = o.write(v, base).then(
      (next) => { seq = next; },
      // 失敗しても seq（最後に書けた editSeq）は残す。書けていない以上サーバーの editSeq は変わらない。競合の後は呼び出し側が reset で戻す（code review Major）
      (e) => { pending = null; o.onError(e); },
    ).finally(() => {
      inflight = null;
      if (pending && handle === null) handle = timer.set(() => { void run(); }, o.delayMs);
    });
    return inflight;
  };
  return {
    push(v: T) {
      pending = { v };
      if (handle !== null) timer.clear(handle);
      handle = inflight ? null : timer.set(() => { void run(); }, o.delayMs);
    },
    /** 待っている値をすぐ書き、書き終わるまで待つ（依頼の前。失敗は onError に出る） */
    async flush(): Promise<void> {
      if (handle !== null) { timer.clear(handle); handle = null; }
      while (inflight || pending) await (inflight ?? run());
    },
    idle: () => !pending && !inflight,
    /** 競合の後など、基準を internal.editSeq に戻す */
    reset() { pending = null; seq = null; if (handle !== null) { timer.clear(handle); handle = null; } },
  };
}

/* ---------- callable の入力・保存の状態（repositories.tsx の hooks が使う。U2） ---------- */

export interface SitemapDraftOptions { regenerate?: boolean; discardEdits?: boolean; confirmDiscard?: boolean }

/** requestSitemapDraft の入力（S-12: 印は真偽値で、真のときだけキーを入れる） */
export function sitemapDraftRequestInput(projectId: string, requestId: string, o: SitemapDraftOptions) {
  return {
    projectId, requestId,
    ...(o.regenerate === true ? { regenerate: true } : {}), ...(o.discardEdits === true ? { discardEdits: true } : {}),
    ...(o.confirmDiscard === true ? { confirmDiscard: true } : {}),
  };
}

/** 保存する中身（saveSitemapEdits op:'save' の before・after・devComment） */
export interface SitemapEdits { before: SitemapDiagram; after: SitemapDiagram; devComment?: { text: string } }

/**
 * saveSitemapEdits op:'save' の入力。図はサーバーの保存の形（cleanDiagram）と同じ項目だけで組み直す。
 * callable の SDK は undefined を null にして送るため、reason: undefined（理由なしのページ）をそのまま渡さない（QA D-1）
 */
export function sitemapSaveInput(projectId: string, baseEditSeq: number, v: SitemapEdits) {
  return {
    projectId, op: 'save' as const, baseEditSeq, before: cleanSitemapDiagram(v.before), after: cleanSitemapDiagram(v.after),
    ...(v.devComment ? { devComment: { text: v.devComment.text } } : {}),
  };
}

/** idle: 待ち・送信中が無い（false の間、画面は手元の値を重ねて出す）。error: 最後の保存の失敗（書ければ消える） */
export interface SitemapSaveStatus { idle: boolean; error: Error | null }

/** liveScheduleUi の SCHEDULE_SAVE_FAILED_BEFORE_SUBMIT と同じ文言（import すると model.ts 経由で循環するので値で持つ） */
export const SITEMAP_SAVE_FAILED_BEFORE_SUBMIT = '直前の保存ができませんでした。内容を確かめて保存してから依頼してください';

/**
 * 1 案件の保存のまとめ（createSaveQueue）＋状態の購読（useSyncExternalStore 向け）。
 * 競合（SitemapConflictError）は基準を戻し、依頼は止めない（画面は最新を読み直す）。それ以外の失敗は、次に書けるまで依頼を止める（pendingSaveFailed と同じ考え）
 */
export function createSitemapSaver(o: { delayMs: number; write: (v: SitemapEdits, baseEditSeq: number) => Promise<number>; timer?: SaveQueueTimer }) {
  let opened: number | null = null;
  let saved: number | null = null;
  let error: Error | null = null;
  let blocking = false;
  let snap: SitemapSaveStatus = { idle: true, error: null };
  const listeners = new Set<() => void>();
  const emit = () => { listeners.forEach((l) => l()); };
  const q = createSaveQueue<SitemapEdits>({
    delayMs: o.delayMs, timer: o.timer,
    // 開いた時点と最後に書けた値の大きい方（手元の値がある間 opened は固定のため、自分の保存の後に古い値へ戻らない）
    base: () => (opened === null ? saved : Math.max(opened, saved ?? -1)),
    write: async (v, base) => {
      try {
        const next = await o.write(v, base);
        saved = next; error = null; blocking = false;
        return next;
      } catch (e) {
        throw sitemapCallableError(e);
      } finally {
        setTimeout(emit, 0);
      }
    },
    onError: (e) => {
      error = e instanceof Error ? e : new Error(String(e));
      if (e instanceof SitemapConflictError) { q.reset(); saved = null; blocking = false; } else blocking = true;
      setTimeout(emit, 0);
    },
  });
  const status = (): SitemapSaveStatus => {
    const idle = q.idle();
    if (snap.idle !== idle || snap.error !== error) snap = { idle, error };
    return snap;
  };
  return {
    push(v: SitemapEdits, openedEditSeq: number) { opened = openedEditSeq; q.push(v); emit(); },
    flush: () => q.flush(),
    status,
    subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
    /** 依頼の前: 待ちを書き切り、失敗が残っていれば止める。返り値は依頼の baseEditSeq */
    async beforeSubmit(openedEditSeq: number): Promise<number> {
      await q.flush();
      emit();
      if (blocking) throw new Error(SITEMAP_SAVE_FAILED_BEFORE_SUBMIT);
      return Math.max(openedEditSeq, saved ?? -1);
    },
    /** 競合の後・依頼の後など、基準を開き直した値に戻す */
    reset() { q.reset(); saved = null; error = null; blocking = false; emit(); },
  };
}

/**
 * 保存のまとめの置き場（部品をまたいで案件ごとに 1 つ）。鍵は利用者＋案件（別の人でログインし直したとき、前の人の基準・失敗・待ちを使わない）。
 * clear はログアウト（LiveDataProvider が外れる）で呼ぶ: 待ちと予約を捨てて空にする（code review Minor）
 */
export function createSaverRegistry<S extends { reset: () => void }>(make: (pid: string) => S) {
  const m = new Map<string, S>();
  return {
    get(uid: string, pid: string): S {
      const k = `${uid}\u0000${pid}`;
      let s = m.get(k);
      if (!s) { s = make(pid); m.set(k, s); }
      return s;
    },
    clear() { m.forEach((s) => s.reset()); m.clear(); },
    size: () => m.size,
  };
}

/** 案件の state に入れるサイトマップ（projectView.ts。要約が無ければ null＝従来の空の値）。依頼中だけ依頼の日時 */
export interface LiveSitemapProjectState { sitemap: SitemapState; requestedAt?: string }

export function liveSitemapProjectState(summary: SitemapSummary | null, internal: SitemapInternal | null, version: SitemapVersion | null): LiveSitemapProjectState | null {
  if (!summary) return null;
  return {
    sitemap: liveSitemapState(summary, internal, version),
    ...(summary.status === 'requested' && summary.requestedAt ? { requestedAt: summary.requestedAt } : {}),
  };
}
