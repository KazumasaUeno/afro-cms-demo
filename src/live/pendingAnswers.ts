import type { AnswerValue } from '@/types';

/**
 * まだ保存していない回答（キー入力ごとに書き込まないための待ち合わせ。BACKEND_FIREBASE §12 の Write 数）。
 * - 画面には保存済みの回答の上に重ねて見せる（入力中の値が戻らない）
 * - Rules を通らない途中の値（URL の入力途中など）は保存せずにここに残す（invalid）
 * live/repositories.tsx の LiveDataProvider が 1 つ作る（モジュールの変数にしない）
 */
export class PendingAnswers {
  private values = new Map<string, Map<string, AnswerValue>>();
  private listeners = new Set<() => void>();
  private version = 0;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };

  getVersion = () => this.version;

  private emit() {
    this.version++;
    this.listeners.forEach((fn) => fn());
  }

  of(projectId: string): Record<string, AnswerValue> {
    return Object.fromEntries(this.values.get(projectId) ?? []);
  }

  set(projectId: string, questionId: string, value: AnswerValue) {
    const m = this.values.get(projectId) ?? new Map<string, AnswerValue>();
    m.set(questionId, value);
    this.values.set(projectId, m);
    this.emit();
  }

  /** 保存できた（または Rules に拒否されて戻った）値を外す。その間に入力が変わっていたら残す */
  settle(projectId: string, written: Record<string, AnswerValue>) {
    const m = this.values.get(projectId);
    if (!m) return;
    let changed = false;
    for (const [k, v] of Object.entries(written)) {
      if (m.get(k) === v) {
        m.delete(k);
        changed = true;
      }
    }
    if (changed) this.emit();
  }

  clear(projectId: string, questionIds: readonly string[]) {
    const m = this.values.get(projectId);
    if (!m) return;
    questionIds.forEach((q) => m.delete(q));
    this.emit();
  }
}
