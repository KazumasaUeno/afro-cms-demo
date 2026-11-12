import { useCallback } from 'react';
import { useToast, type Tone } from './useToast';

/**
 * 書き込みの完了とエラーを画面が受ける共通の形（BACKEND_PLAN「B の着手条件」1）。
 * - repository の書き込み（Promise）を待ち、成功したときだけ success を出す。失敗したらエラーのトーストを出し false を返す
 * - demo は dispatch を同期で行ってから解決するので、見た目は従来と同じ（トーストが 1 マイクロタスク遅れるだけ）
 * - live は Rules の拒否（permission-denied）・オフライン（unavailable）などで失敗する
 */
export function useWrite() {
  const toast = useToast();
  return useCallback(
    async (p: Promise<unknown>, success?: string, tone?: Tone): Promise<boolean> => {
      try {
        await p;
        if (success) toast(success, tone);
        return true;
      } catch (e) {
        console.warn('write failed', e);
        toast(writeErrorMessage(e), 'error');
        return false;
      }
    },
    [toast],
  );
}

/** Firebase のエラーは code を持つ（SDK を import しない。demo のビルドに入れないため） */
export function writeErrorMessage(e: unknown): string {
  const code = typeof e === 'object' && e && 'code' in e ? String((e as { code: unknown }).code) : '';
  if (code.endsWith('permission-denied')) return '権限が無いか、いまの状態では変更できないため保存できませんでした';
  if (code.endsWith('unavailable') || code.endsWith('network-request-failed')) return '通信できないため保存できませんでした。接続を確かめてもう一度お試しください';
  if (code.endsWith('already-exists')) return 'すでに登録されています';
  if (e instanceof Error && !code && e.message) return e.message;
  return '保存できませんでした。もう一度お試しください';
}
