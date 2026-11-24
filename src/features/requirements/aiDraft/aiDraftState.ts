/**
 * AI 下書きの画面の状態と文言（純粋関数だけ。画面設計 docs/design/AI_REQUIREMENTS_UI.md §2・§3.3・§3.4・§4・§5・§6.2）。
 *
 * - React・Firebase・`@/repositories/mode` を import しない（tests/unit/aiDraftState.test.mjs が Node で直接読む。DEC lead F8）
 * - 日時は ISO 文字列（Timestamp → ISO の変換は port 側。src/types/aiDraft.ts と同じ方針）
 * - 状態 8（configChanged）は出さない（DEC lead 2026-11-24 Q-U1。クライアントが今の configHash を知る手段が無い。docs/TODO.md）
 */
import type { AiDraftDoc, AiEditable, AiEvidenceKey } from '@/types/aiDraft';
import { numbersIn } from '@/shared/ai/numbersIn';

/** VITE_FEATURE_AI_REQUIREMENTS の値（既定 off） */
export type AiFlagMode = 'off' | 'internal' | 'on';

/** 未知の値・未設定は off（安全側） */
export function parseAiFlagMode(raw: unknown): AiFlagMode {
  return raw === 'internal' || raw === 'on' ? raw : 'off';
}

export type AiViewerRole = 'admin' | 'developer' | 'client';

/** §2 の状態キー（判定の順は deriveAiDraftState のとおり） */
export type AiDraftStateKey = 'hidden' | 'notDraft' | 'none' | 'running' | 'failed' | 'stalled' | 'ready' | 'confirmed';

export interface AiDraftStateInput {
  /** aiDrafts/requirements（無ければ null） */
  doc: AiDraftDoc | null | undefined;
  /** クライアントの時刻（ms） */
  now: number;
  /** answersHash(今の回答)。未計算なら null（注記を出さない） */
  answersHashNow?: string | null;
  /** 今の設定のハッシュ。Q-U1 が決まるまで渡しても使わない */
  configHashNow?: string | null;
  role: AiViewerRole;
  /** 自分がこの案件にアサインされた開発者か */
  isAssignedDeveloper: boolean;
  flagMode: AiFlagMode;
  reqStatus: 'draft' | 'analyzed' | 'approved';
  /** 自分の uid（他の人が生成を始めたかの判定） */
  uid?: string;
}

export interface AiDraftView {
  key: AiDraftStateKey;
  /** 状態 7: 下書きの後に回答が変わった（ready・confirmed に重ねる） */
  answersChanged: boolean;
  /** 状態 8: Q-U1 により常に false */
  configChanged: false;
  /** 閲覧のみ（管理者。ready・confirmed に重ねる） */
  readOnly: boolean;
  /** 前回の作り直しの失敗（generated があるときだけ。§2 状態 5 の注記の全文） */
  lastErrorNote: string | null;
  /** 生成・再試行・作り直しのボタンを出してよいか（internal は管理者だけ。DEC lead F5） */
  canGenerate: boolean;
  /** 欄を編集できるか（アサインされた開発者・ready/confirmed・生成中でない） */
  canEdit: boolean;
  /** running のとき、job.by が自分以外 */
  startedByOther: boolean;
  /** generated がある（running の下に読み取り専用で残す・作り直しの確認の分岐に使う） */
  hasGenerated: boolean;
  /** edited がある */
  hasEdited: boolean;
}

const ms = (iso: string | undefined): number => (iso ? Date.parse(iso) : NaN);

/** job が running かつ lease 内 */
export function isJobRunning(doc: AiDraftDoc | null | undefined, now: number): boolean {
  const j = doc?.job;
  if (!j || j.state !== 'running') return false;
  const until = ms(j.leaseUntil);
  return Number.isFinite(until) && until > now;
}

/** パネルを描画するか（フラグ・役割。§1 と DEC lead F5） */
export function aiPanelVisible(flagMode: AiFlagMode, role: AiViewerRole, isAssignedDeveloper: boolean): boolean {
  if (flagMode === 'off' || role === 'client') return false;
  return role === 'admin' || (role === 'developer' && isAssignedDeveloper);
}

/** 生成のボタンを出せるか: internal は管理者だけ（allowlist は Functions が判定）／ on は管理者とアサインされた開発者 */
export function aiCanGenerate(flagMode: AiFlagMode, role: AiViewerRole, isAssignedDeveloper: boolean): boolean {
  if (!aiPanelVisible(flagMode, role, isAssignedDeveloper)) return false;
  return role === 'admin' || flagMode === 'on';
}

export function deriveAiDraftState(i: AiDraftStateInput): AiDraftView {
  const doc = i.doc ?? null;
  const hasGenerated = !!doc?.generated;
  const hasEdited = !!doc?.edited;
  const base: AiDraftView = {
    key: 'hidden', answersChanged: false, configChanged: false, readOnly: false, lastErrorNote: null,
    canGenerate: false, canEdit: false, startedByOther: false, hasGenerated, hasEdited,
  };
  if (!aiPanelVisible(i.flagMode, i.role, i.isAssignedDeveloper)) return base;
  if (i.reqStatus !== 'draft') return { ...base, key: 'notDraft' };
  const canGenerate = aiCanGenerate(i.flagMode, i.role, i.isAssignedDeveloper);
  const readOnly = i.role === 'admin';
  if (!doc) return { ...base, key: 'none', canGenerate, readOnly };
  if (doc.job?.state === 'running') {
    if (isJobRunning(doc, i.now)) {
      return { ...base, key: 'running', canGenerate: false, readOnly, startedByOther: !!doc.job.by && doc.job.by !== i.uid };
    }
    return { ...base, key: 'stalled', canGenerate, readOnly };
  }
  if (!hasGenerated) {
    // state=='failed'（文書はあるが下書きが無い）。lastError が無い failed（作成直後の取り残し）も同じ面で再試行させる
    return { ...base, key: 'failed', canGenerate, readOnly };
  }
  const answersChanged = !!i.answersHashNow && !!doc.answersHash && doc.answersHash !== i.answersHashNow;
  const lastErrorNote = doc.lastError ? AI_DRAFT_COPY.regenFailedNote(shortErrorMessage(doc.lastError.code)) : null;
  const canEdit = !readOnly && i.role === 'developer' && i.isAssignedDeveloper;
  return { ...base, key: hasEdited ? 'confirmed' : 'ready', answersChanged, readOnly, lastErrorNote, canGenerate, canEdit };
}

// ---------------- 承認の依頼（§3.4） ----------------

export type AutosaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'failed';

/** 最後の入力から送るまで（ms）。[TARGET] 計画の下限 1 秒以上 */
export const AUTOSAVE_DEBOUNCE_MS = 1500;

export interface ApprovalInput {
  hasEdited: boolean;
  save: AutosaveState;
  running: boolean;
  reqStatus: 'draft' | 'analyzed' | 'approved';
  role: AiViewerRole;
  isAssignedDeveloper: boolean;
}

export type ApprovalBlock = 'not-allowed' | 'not-draft' | 'running' | 'no-edited' | 'saving' | 'save-failed';

/** 押せないときの理由（押せるなら null）。理由の文言は APPROVAL_BLOCK_COPY（not-allowed・not-draft はボタン自体を出さない） */
export function approvalBlock(a: ApprovalInput): ApprovalBlock | null {
  if (a.role !== 'developer' || !a.isAssignedDeveloper) return 'not-allowed';
  if (a.reqStatus !== 'draft') return 'not-draft';
  if (a.running) return 'running';
  if (!a.hasEdited) return 'no-edited';
  if (a.save === 'failed') return 'save-failed';
  if (a.save === 'pending' || a.save === 'saving') return 'saving';
  return null;
}

export function canRequestApproval(a: ApprovalInput): boolean {
  return approvalBlock(a) === null;
}

// ---------------- サーバー値の取り込み（§3.3・§3.5） ----------------

/**
 * 編集欄へ取り込み直す契機の鍵。作り直しの完了では job.requestId が変わらない（functions/src/ai/task.ts は requestId を残して idle にする）ため、
 * job.state・doc.state・lastError.at を含める（running→idle で必ず変わる）。updatedAt は使わない（自分の保存の反映は editedAt で足りる）
 */
export function aiDraftServerKey(doc: AiDraftDoc | null | undefined): string {
  if (!doc) return '';
  return [
    doc.job?.state ?? '', doc.job?.requestId ?? '', doc.state, doc.editedAt ?? '', doc.lastError?.at ?? '',
    doc.generated ? 'g' : '', doc.edited ? 'e' : '',
  ].join('|');
}

export interface ResyncInput {
  save: AutosaveState;
  /** 直前の保存が generation-running で失敗した（§3.3「生成が終わると下書きは新しい内容に置き換わります」） */
  staleByRegen: boolean;
  /** job.state==='running'（lease 切れも含む。結果が書かれるまで置き換えない） */
  jobRunning: boolean;
}

export interface ResyncDecision {
  /** サーバーの edited（無ければ generated）で編集欄を置き換える */
  resync: boolean;
  /** 保存の失敗表示を消して idle に戻す */
  clearSaveError: boolean;
  /** staleByRegen を下ろす */
  clearStale: boolean;
}

/**
 * サーバーの値が変わったときに編集欄を取り込み直すか（aiDraftServerKey が変わったときに呼ぶ）。
 * - 未保存の変更（pending・saving・failed）は黙って捨てない。例外は generation-running で保存できなかった変更で、
 *   生成が終わった時点（成功・失敗とも）でサーバーの内容に置き換える（§3.3 の文言で予告し「変更をコピー」を出している）
 * - 生成が終わったら staleByRegen は必ず下ろす（失敗・入力し直しで立ったまま残らない）
 */
export function decideResync(i: ResyncInput): ResyncDecision {
  const dirty = i.save === 'pending' || i.save === 'saving' || i.save === 'failed';
  if (i.jobRunning) return { resync: !dirty, clearSaveError: false, clearStale: false };
  if (i.staleByRegen && i.save === 'failed') return { resync: true, clearSaveError: true, clearStale: true };
  return { resync: !dirty, clearSaveError: false, clearStale: true };
}

export const APPROVAL_BLOCK_COPY: Record<Exclude<ApprovalBlock, 'not-allowed' | 'not-draft'>, string> = {
  'no-edited': '下書きを直すか「内容を確認した」を押すと、承認を依頼できます。',
  saving: '保存が終わると依頼できます。',
  'save-failed': '保存できていない変更があります。保存してから依頼してください。',
  running: '生成が終わると依頼できます。',
};

// ---------------- requestId の規則（§4.1。request.ts:97-103） ----------------

/** callable の例外の code（`functions/internal` → `internal`） */
export function errorCodeOf(e: unknown): string {
  const c = e && typeof e === 'object' && 'code' in e ? String((e as { code: unknown }).code) : '';
  return c.replace(/^functions\//, '');
}

/**
 * callable の例外の理由（サーバーの `new HttpsError(code, reason)` の reason）。
 * - details に理由があればそれを優先する（文字列、または { reason }）。いまのサーバーは details を付けていない
 * - SDK（firebase/functions v13）は message の末尾に HTTP の状態を付ける（例 "quota-project-day [429]"）ので外す
 */
export function errorReasonOf(e: unknown): string {
  if (!e || typeof e !== 'object') return '';
  const d = 'details' in e ? (e as { details: unknown }).details : undefined;
  if (typeof d === 'string' && d.trim()) return d.trim();
  if (d && typeof d === 'object' && 'reason' in d && typeof (d as { reason: unknown }).reason === 'string') return String((d as { reason: string }).reason).trim();
  const m = 'message' in e ? String((e as { message: unknown }).message) : '';
  return m.replace(/\s*\[\d{3}\]\s*$/, '').trim();
}

const messageOf = errorReasonOf;

/** 応答を受け取れずに終わった（通信エラー・internal・deadline-exceeded）。このときだけ同じ requestId で再試行する */
export function isNoResponseError(e: unknown): boolean {
  const c = errorCodeOf(e);
  return c === '' || c === 'internal' || c === 'deadline-exceeded';
}

/** 直前の押下の結果（requestId の再利用の判定に使う） */
export interface LastRequest {
  requestId: string;
  /** 'no-response' のときだけ次の再試行で同じ requestId を送る */
  outcome: 'no-response' | 'responded';
}

/**
 * 次に送る requestId。`retry` は「再試行」ボタン（応答なしの直後だけ同じ ID）。それ以外の押下・応答があった後は新しい ID。
 * `newId` は crypto.randomUUID（テストで差し替える）
 */
export function nextRequestId(last: LastRequest | null, retry: boolean, newId: () => string = () => globalThis.crypto.randomUUID()): string {
  if (retry && last && last.outcome === 'no-response') return last.requestId;
  return newId();
}

/** 同じ requestId の応答が failed（running のまま lease が切れた）なら stalled を出し、次は新しい ID（last を responded にする） */
export function outcomeOfResponse(requestId: string): LastRequest {
  return { requestId, outcome: 'responded' };
}

// ---------------- 文言（§2・§3・§4・§5） ----------------

/** DRAFT: LEGAL Q-4 の結論で差し替える（【下書きの文言】の接頭辞は差し替えるまで表示したまま。§5） */
export const AI_SEND_NOTICE = {
  button: '【下書きの文言】ヒアリングの回答（個人名・メール・電話・URL の一部を除く）と現行サイトの公開内容を、外部の AI サービス（Anthropic 社・米国。処理は国外）へ送ります。回答に個人名が書かれていると、そのまま送られます。',
  input: '【下書きの文言】この回答は外部の AI へ送られます。個人名・個人の連絡先は書かないでください。',
} as const;

export const AI_DRAFT_COPY = {
  tabHearing: 'ヒアリング',
  tabAi: 'AI 下書き',
  generate: 'AI で下書きを作る',
  none: {
    title: 'AI で下書きを作る',
    body: 'ヒアリングの回答から、改善提案と要件定義書の下書きを作ります。下書きはお客様には見えません。確認・編集してから承認を依頼します。',
    missing: (names: readonly string[]) => `AI 下書きに必要な質問が未回答です: ${names.join('、')}`,
    /** internal で開発者が開いたとき（生成は管理者。DEC lead F5） */
    waitAdmin: 'AI 下書きは管理者が作成します。作成されると、ここで確認・編集できます。',
  },
  running: {
    title: 'AI が下書きを作っています',
    body: 'この順に処理します: 現行サイトを取得 → 基本チェック → 下書きを作成。画面を閉じても生成は続き、終わるとここに表示されます。',
    steps: ['現行サイトを取得', '基本チェック', '下書きを作成'] as const,
    startedAt: (hhmm: string) => `開始 ${hhmm}`,
    byOther: 'ほかのメンバーが生成を始めました。',
    withDraft: '作り直しています。終わるまで編集できません。',
    progressLabel: '生成中',
  },
  failed: {
    title: '下書きを作れませんでした',
    retry: '再試行',
    support: (code: string, anthropicRequestId?: string) => `問い合わせ用: ${code}${anthropicRequestId ? ` / ${anthropicRequestId}` : ''}`,
  },
  stalled: {
    title: '生成が止まりました',
    body: '処理が時間内に終わりませんでした。もう一度押すと作り直せます。',
    action: 'もう一度作る',
  },
  ready: {
    title: 'AI 下書き（未確認）',
    body: '内容を読み、必要なら直してください。直すか「内容を確認した」を押すと、承認を依頼できます。',
    flagged: (n: number) => `入力に無い数字が ${n} 件あります。根拠を確かめてください。`,
    flaggedCleared: '入力に無い数字はすべて見直されました',
    confirm: '内容を確認した',
    confirmWithFlags: '数字を確認して、内容を確認済みにする',
  },
  regenFailedNote: (short: string) => `前回の作り直しは失敗しました（${short}）。表示中の下書きはそのまま使えます。`,
  confirmed: {
    title: 'AI 下書き（確認済み）',
    editedAt: (mdhm: string) => `最終編集 ${mdhm}`,
  },
  answersChanged: {
    body: '回答が下書きの後に変わっています。作り直すか、このまま確認して依頼するかを選んでください。',
    regenerate: '作り直す',
    dismiss: 'このまま進める',
  },
  readOnly: '編集と承認の依頼は、アサインされた開発者が行います。',
  reused: '回答と設定が前回と同じため、前回の下書きを表示しています（回数には数えていません）。',
  flaggedLine: (nums: readonly string[]) => `要確認の数字: ${nums.join('、')}`,
  flaggedSr: '（要確認の数字）',
  autosave: {
    pending: '未保存の変更があります',
    saving: '保存しています…',
    saved: (hhmm: string) => `保存しました ${hhmm}`,
    retry: 'もう一度保存',
    copy: '変更をコピー',
    leaveTitle: '保存できていない変更があります。このページを離れますか？',
    leave: '離れる',
    stay: 'とどまる',
  },
  approval: {
    action: '承認を依頼する',
    title: 'お客様に承認を依頼しますか？',
    body: '確認した下書きを改善提案書として、お客様ポータルに出します。依頼した後は編集・作り直しができません（差し戻すと再開できます）。',
    flagged: (nums: readonly string[]) => `入力に無い数字が残っています: ${nums.join('、')}。根拠を確かめてから依頼してください。`,
    cancel: 'キャンセル',
    busy: '依頼しています…',
    done: 'お客様に承認を依頼しました',
  },
  regenerate: {
    plainTitle: '下書きを作り直しますか？',
    plainBody: '今の下書きは新しい下書きに置き換わります。作り直しは回数に数えます。',
    plainAction: '作り直す',
    discardTitle: '編集を捨てて作り直しますか？',
    discardBody: 'あなたが直した内容は、新しい下書きができた時点で消えます。生成が失敗したときは、今の内容が残ります。作り直しは回数に数えます。',
    discardAction: '編集を捨てて作り直す',
    adminLog: '開発者の編集を捨てた記録（あなたの名前と日時）が残ります。',
    cancel: 'キャンセル',
  },
  v2Badge: 'AI 下書き・担当者確認済み',
} as const;

/** §4.2 生成の結果（aiDrafts.lastError.code）。未知の code は FALLBACK */
const RESULT_ERRORS: Record<string, string> = {
  'ai-config': 'AI の設定に問題があるため作れませんでした。回数は消費していません。管理者に連絡してください。',
  'ai-config-missing': 'AI の設定に問題があるため作れませんでした。回数は消費していません。管理者に連絡してください。',
  'ai-feature-disabled': 'AI 下書きが無効になったため中止しました。回数は消費していません。',
  'ai-precondition-changed': '生成中に回答または案件の状態が変わったため中止しました。回数は消費していません。内容を確かめてから再試行してください。',
  'ai-schema': 'AI の出力が決められた形になっていなかったため、使えませんでした。再試行してください。続くときは管理者に連絡してください。',
  'ai-refusal': 'AI がこの内容での作成を断りました。回答の内容を見直すか、提案を手で作成してください。',
  'ai-max_tokens': '出力が長くなりすぎて途中で止まりました。再試行してください。続くときは長い回答を短くしてください。',
  'ai-rate_limited': 'AI サービスが混み合っているため作れませんでした。時間をおいて再試行してください。',
  'ai-upstream': 'AI サービス側の問題で作れませんでした。時間をおいて再試行してください。',
  'ai-timeout': 'AI の応答が時間内に返らなかったため中止しました。再試行してください。',
  'ai-internal': 'サーバーの処理で問題が起きたため作れませんでした。時間をおいて再試行してください。',
};
const RESULT_FALLBACK = '下書きを作れませんでした。管理者に連絡してください。';

/** §4.2 の文言（状態 3 の本文） */
export function errorMessage(code: string | undefined): string {
  return (code && Object.prototype.hasOwnProperty.call(RESULT_ERRORS, code) ? RESULT_ERRORS[code] : undefined) ?? RESULT_FALLBACK;
}

/** §4.2 の短い理由（状態 5 の注記）: 最初の文（末尾の「。」を除く） */
export function shortErrorMessage(code: string | undefined): string {
  const m = errorMessage(code);
  const i = m.indexOf('。');
  return i >= 0 ? m.slice(0, i) : m;
}

/** 開始の例外の再試行の扱い: none＝出さない／ same＝同じ requestId（応答なし）／ new＝新しい requestId／ dialog＝§3.5 を開く／ answers＝回答後 */
export type StartRetry = 'none' | 'same' | 'new' | 'dialog' | 'answers';

export interface StartErrorView {
  message: string;
  retry: StartRetry;
  /** already-running は状態 2 へ（onSnapshot で切り替わる） */
  toRunning?: boolean;
}

const START_ERRORS: Record<string, StartErrorView> = {
  // Q-U2: 文言だけ出し、v1 の「AI分析を実行」は出さない（DEC lead 2026-11-24）
  'failed-precondition:feature-disabled': { message: 'この案件では AI 下書きを使えません（機能が無効か、対象外の案件です）。', retry: 'none' },
  'failed-precondition:answers-missing': { message: 'AI 下書きに必要な質問が未回答です。', retry: 'answers' },
  'failed-precondition:not-draft': { message: '承認を依頼した後は作り直せません。差し戻すと作り直せます。', retry: 'none' },
  'failed-precondition:edits-exist': { message: '編集した内容があるため、作り直すには編集を捨てる確認が必要です。', retry: 'dialog' },
  'failed-precondition:confirm-discard-required': { message: '編集した内容があるため、作り直すには編集を捨てる確認が必要です。', retry: 'dialog' },
  'aborted:already-running': { message: 'ほかのメンバーが生成中です。終わるとここに表示されます。', retry: 'none', toRunning: true },
  // Q-U5: 残りの回数は出さない。上限に達したときだけ
  'resource-exhausted:quota-project-day': { message: 'この案件で今日使える回数に達しました。明日（日本時間 0 時以降）に使えます。', retry: 'none' },
  'resource-exhausted:quota-user-day': { message: 'あなたが今日使える回数に達しました。明日（日本時間 0 時以降）に使えます。', retry: 'none' },
  'resource-exhausted:quota-project-month': { message: 'この案件で今月使える回数に達しました。来月 1 日（日本時間）から使えます。', retry: 'none' },
  'resource-exhausted:quota-global-month': { message: '今月の AI 下書きの上限に達しました。管理者に相談してください。', retry: 'none' },
};
const START_BY_CODE: Record<string, StartErrorView> = {
  'permission-denied': { message: 'この案件の下書きを作る権限がありません。', retry: 'none' },
  unavailable: { message: '生成を始められませんでした。回数は消費していません。時間をおいて再試行してください。', retry: 'new' },
};
const START_NO_RESPONSE: StartErrorView = { message: '生成を始められたか確認できませんでした。もう一度押してください（同じ依頼として扱うので、二重には数えません）。', retry: 'same' };
const START_FALLBACK: StartErrorView = { message: '生成を始められませんでした。時間をおいて再試行してください。', retry: 'new' };

/** §4.1 requestRequirementsDraft の例外 → 文言と再試行の扱い */
export function startErrorMessage(e: unknown): StartErrorView {
  const code = errorCodeOf(e);
  const hit = START_ERRORS[`${code}:${messageOf(e)}`] ?? START_BY_CODE[code];
  if (hit) return hit;
  if (isNoResponseError(e)) return START_NO_RESPONSE;
  return START_FALLBACK;
}

const SAVE_ERRORS: Record<string, string> = {
  'failed-precondition:generation-running': '作り直しが始まったため、この変更は保存できませんでした。生成が終わると下書きは新しい内容に置き換わります。必要なら「変更をコピー」で控えてください。',
  'failed-precondition:not-draft': '承認を依頼した後のため保存できません。差し戻すと編集できます。',
  'failed-precondition:no-generated': '下書きが見つからないため保存できません。画面を読み込み直してください。',
  'failed-precondition:feature-disabled': 'AI 下書きが無効になったため保存できません。',
};
const SAVE_BY_CODE: Record<string, string> = {
  'invalid-argument': '入力が上限を超えているか、形式が正しくないため保存できませんでした。文字数を確認してください。',
  'permission-denied': 'この案件の下書きを編集する権限がありません。',
};
const SAVE_FALLBACK = '保存できませんでした。通信状態を確認して、もう一度保存してください。';

export interface SaveErrorView {
  message: string;
  /** 「変更をコピー」を出す（generation-running） */
  offerCopy: boolean;
}

/** §3.3 saveAiDraftEdits の例外 → 文言 */
export function saveErrorMessage(e: unknown): SaveErrorView {
  const code = errorCodeOf(e);
  const key = `${code}:${messageOf(e)}`;
  const message = SAVE_ERRORS[key] ?? SAVE_BY_CODE[code] ?? SAVE_FALLBACK;
  return { message, offerCopy: key === 'failed-precondition:generation-running' };
}

// ---------------- 要確認の数字（§3.2） ----------------

/** text に残っている要確認の数字（flags と同じ正規化で一致したもの。重複なし・flags の順） */
export function findFlaggedNumbers(text: string, flags: readonly string[] | undefined): string[] {
  if (!flags?.length || !text) return [];
  const present = new Set(numbersIn(text));
  return [...new Set(flags)].filter((f) => present.has(f));
}

/** 編集できる 3 欄の全文（要確認の数字の件数・コピー用のプレーンテキスト） */
export function editableText(e: AiEditable): string {
  const d = e.draft;
  return [
    e.summary,
    ...e.points.flatMap((p) => [p.title, p.detail, p.impact]),
    d.goal, d.target, d.contents, d.features, d.nonFunctional, d.operation, d.schedule, ...d.openQuestions,
  ].join('\n');
}

/** 今の文にまだ残っている要確認の数字（上部の件数 n＝この長さ） */
export function remainingFlaggedNumbers(e: AiEditable, flags: readonly string[] | undefined): string[] {
  return findFlaggedNumbers(editableText(e), flags);
}

/** 文を「普通の文字」と「要確認の数字」の区間に分ける（プレビューの <mark>。React の文字ノードで描く＝HTML を作らない） */
export function splitFlagged(text: string, flags: readonly string[] | undefined): { text: string; flagged: boolean }[] {
  if (!flags?.length || !text) return [{ text, flagged: false }];
  const set = new Set(flags);
  const out: { text: string; flagged: boolean }[] = [];
  const re = /[0-9０-９]+(?:[.,．，][0-9０-９]+)*/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const n = numbersIn(m[0])[0];
    if (n === undefined || !set.has(n)) continue;
    const at = m.index ?? 0;
    if (at > last) out.push({ text: text.slice(last, at), flagged: false });
    out.push({ text: m[0], flagged: true });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), flagged: false });
  return out.length ? out : [{ text, flagged: false }];
}

// ---------------- 根拠キーの表示名（§6.2） ----------------

export const EVIDENCE_LABELS: Record<AiEvidenceKey, string> = {
  'q-url': '現在のURL', 'q-purpose': 'リニューアルのきっかけ', 'q-issue': '現在の課題', 'q-competitor': '競合サイト',
  'q-improve': '改善したいこと', 'q-keep': '残したい点', 'q-target': 'ターゲット', 'q-strength': '強み',
  'q-market': '競合の良い点', 'q-content': '掲載したいコンテンツ', 'q-feature': '必要な機能', 'q-cv': '重要なコンバージョン',
  'q-seo': '上位表示したいキーワード', 'q-ops': '公開後の更新担当', 'q-schedule': '公開希望時期', 'q-other': 'その他のご要望',
  https: 'HTTPS', viewport: 'スマホ表示の設定', 'title-length': 'ページタイトルの長さ', description: 'ページの説明文',
  'h1-count': '大見出し（h1）の数', 'alt-missing': '画像の代替テキスト', 'page-size': 'ページの容量', 'response-time': '応答時間',
  sitemap: 'サイトマップ', 'structured-data': '構造化データ',
};

/** 未知のキーはそのまま出す（保存値を信用しない） */
export const evidenceLabel = (k: string): string => (EVIDENCE_LABELS as Record<string, string>)[k] ?? k;
