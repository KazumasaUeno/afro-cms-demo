/**
 * ログアウトの前後で、回答の書き込み待ち（LiveDataProvider の AnswerWrites.timers）を扱う純粋な部分（Firebase を import しない。tests/unit で検査）。
 * - ログアウトの前: 予約中・送信中の書き込みを送り切ってから signOut する（signOut の後に送ると Rules が permission-denied で拒否し、入力が失われる）
 * - アンマウント（ログアウト・無効化による強制ログアウト）: 残った予約を止めて、待っている呼び出し元へ「保存していない」と返す（無音で捨てない）
 */

export interface ScheduledWrite {
  timer: number;
  resolve: () => void;
  reject: (e: unknown) => void;
}

/** オフラインでは Firestore の書き込みがサーバーの応答まで終わらない。ログアウトをいつまでも止めないための上限 */
export const LOGOUT_FLUSH_TIMEOUT_MS = 8000;

export type FlushResult = 'saved' | 'failed' | 'timeout';

/** saveNow（true＝保存済み）を上限つきで待つ。例外も失敗として返す */
export async function flushBeforeSignOut(
  saveNow: () => Promise<boolean>,
  timeoutMs: number = LOGOUT_FLUSH_TIMEOUT_MS,
  setTimer: (fn: () => void, ms: number) => unknown = (fn, ms) => setTimeout(fn, ms),
  clearTimer: (t: unknown) => void = (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
): Promise<FlushResult> {
  let timer: unknown;
  const timeout = new Promise<FlushResult>((resolve) => {
    timer = setTimer(() => resolve('timeout'), timeoutMs);
  });
  const save = saveNow().then((ok): FlushResult => (ok ? 'saved' : 'failed'), (): FlushResult => 'failed');
  try {
    return await Promise.race([save, timeout]);
  } finally {
    clearTimer(timer);
  }
}

export const DISCARDED_ON_SIGN_OUT = 'ログアウトしたため、保存していない入力は保存されませんでした';

/** 予約をすべて止め、待っている呼び出し元へ失敗を返す（useWrite がトーストで知らせる）。止めた件数を返す */
export function cancelScheduledWrites(
  timers: Map<string, ScheduledWrite>,
  clearTimer: (t: number) => void = (t) => clearTimeout(t),
): number {
  const list = [...timers.values()];
  timers.clear();
  for (const t of list) {
    clearTimer(t.timer);
    t.reject(new Error(DISCARDED_ON_SIGN_OUT));
  }
  return list.length;
}
