import { shiftYmd } from '@/data/schedule';

/**
 * WBS のガントの月の見出し（WbsSection。React に依存しない純関数・単体テストが直接読む）。
 * 見出しは月初の位置（左端から +4px）に置き、先頭と 1 月だけ「年＋月」。
 * 先頭の見出しが次の月の見出しと重なるとき（幅 320 のお客様ポータルで約 16px。QA O-1 2026-11-28）だけ、
 * 先頭を「月」だけに縮め、それでも重なるなら先頭を出さない。どちらも年は次の見出しへ移す。重ならない幅では従来と同じ
 */

export interface MonthLabel { at: number; label: string }

/** 見出しの左の余白（WbsSection の left: m.at + 4）と、次の見出しとのすき間 */
const LEFT = 4;
const GAP = 4;

/**
 * 見出しの幅の見積もり（caption 12px・太字・字間 0.033em）。数字 7.5px・それ以外（年・月）12.5px。
 * 実測: 「2026年11月」が x 170〜240 の 70px（QA O-1）＝ 6×7.5＋2×12.5
 */
export function monthLabelWidth(label: string): number {
  let w = 0;
  for (const ch of label) w += ch >= '0' && ch <= '9' ? 7.5 : 12.5;
  return w;
}

const fits = (label: string, at: number, nextAt: number) => at + LEFT + monthLabelWidth(label) + GAP <= nextAt + LEFT;

/** from から days 日の月の見出し（at は図の左端からの px） */
export function monthLabels(from: string, days: number, dayPx: number): MonthLabel[] {
  const out: (MonthLabel & { y: number; m: number })[] = [];
  for (let i = 0; i < days; i++) {
    const [y, m, d] = shiftYmd(from, i).split('-').map(Number);
    if (i === 0 || d === 1) out.push({ at: i * dayPx, y, m, label: i === 0 || m === 1 ? `${y}年${m}月` : `${m}月` });
  }
  // 最初の 2 つだけ見れば足りる: dayPx は 4 以上（WbsSection）なので 2 つ目以降の見出しは約 112px 離れる
  const [first, next] = out;
  if (first && next && !fits(first.label, first.at, next.at)) {
    // 年は次の見出しへ（1 月は元から年つき）
    next.label = `${next.y}年${next.m}月`;
    const short = `${first.m}月`;
    if (fits(short, first.at, next.at)) first.label = short;
    else out.shift();
  }
  return out.map(({ at, label }) => ({ at, label }));
}
