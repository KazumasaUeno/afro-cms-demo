import { useEffect, useState } from 'react';
import { todayYmd } from '@/data/signage';

/**
 * 今日の日付（YYYY-MM-DD）。掲載期間の判定に使う。
 * 画面を開いたまま日付が変わっても期間外のスライドを流し続けないよう、1 分ごとと、タブに戻ったときに確かめる（同じ日なら再描画しない）
 */
export function useToday(active = true): string {
  const [today, setToday] = useState(todayYmd);
  useEffect(() => {
    if (!active) return;
    setToday(todayYmd());
    const check = () => setToday(todayYmd());
    const t = window.setInterval(check, 60_000);
    document.addEventListener('visibilitychange', check);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', check);
    };
  }, [active]);
  return today;
}
