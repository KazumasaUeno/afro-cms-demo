/**
 * キャンバスの編集を少し待ってからまとめて書く予約（SitemapView の Editor）。純関数（React を import しない。tests/unit が直接読む）。
 * - schedule: 前の予約を取り消して、最新の書き込みを delayMs 後に 1 回
 * - cancel: 書かずに取り消す（閲覧だけ・ドラッグ中。demo の離れたときもこれ＝従来どおり）
 * - flush: 予約があればすぐ書く（live の切り替え・離れたとき・依頼の前。codex P1: 待ちの編集が失われないように）
 */
export interface PendingSaveTimer { set: (fn: () => void, ms: number) => unknown; clear: (t: unknown) => void }

export function createPendingSave(timer: PendingSaveTimer = {
  set: (fn, ms) => window.setTimeout(fn, ms),
  clear: (t) => window.clearTimeout(t as number),
}) {
  let write: (() => void) | null = null;
  let handle: unknown = null;
  const stop = () => {
    if (handle !== null) timer.clear(handle);
    handle = null;
  };
  const run = () => {
    stop();
    const w = write;
    write = null;
    w?.();
  };
  return {
    schedule(w: () => void, delayMs: number) {
      stop();
      write = w;
      handle = timer.set(run, delayMs);
    },
    cancel() { stop(); write = null; },
    flush: run,
    pending: () => write !== null,
  };
}
