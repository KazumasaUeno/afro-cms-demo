/**
 * デモの日付を「今日」に合わせ直す（SAFE ASSUMPTION lead 2026-11-24。ユーザーが変える可能性あり）。
 * 初期データの日付は作った日からの相対（daysAgo・daysFromNow）なので、保存したまま日がたつと、人によって予定がずれて見える
 * （11-17 に開いた人と今日開いた人で「今月の納品予定」が違う）。そこで、初期データを作った日（日本時間の yyyy-mm-dd）を
 * seedAnchor として保存し、読み込みのたびに「今日 − seedAnchor」日だけ保存データの日付をすべてずらす。
 * - 初期データの日付も、デモで操作した結果の日付も同じ日数だけずらす（操作は消さない。前後関係も変わらない）
 * - ずらすのは値がちょうど日付（yyyy-mm-dd）か ISO 日時（toISOString の形）の文字列だけ。文章の中の日付は触らない
 * - お客様の回答（answers）とフォームの入力値（values）は入力された内容なのでずらさない
 * - seedAnchor の無い古い保存データは、初期データの最初の履歴（a1。作った 1.5 時間前）から作った日を推定し、無ければ今日とする
 * import は型だけにする（tests/unit から node --experimental-strip-types でそのまま読むため）
 */

const DAY = 86_400_000;
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
/** ずらさないキー（中身は入力された内容） */
const SKIP_KEYS = new Set(['answers', 'values', 'seedAnchor']);

/** 日本時間の日付（yyyy-mm-dd）。homeDues.jstYmd と同じ */
export function jstDay(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

const ymdUtc = (ymd: string) => Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)));

/** a から b までの日数（b が後なら正） */
export const daysBetweenYmd = (a: string, b: string) => Math.round((ymdUtc(b) - ymdUtc(a)) / DAY);

function shiftYmdDays(ymd: string, days: number): string {
  return new Date(ymdUtc(ymd) + days * DAY).toISOString().slice(0, 10);
}

/** 値の中の日付をすべて days 日ずらす（新しい値を返す。元は変えない） */
export function shiftDates<T>(value: T, days: number): T {
  if (days === 0) return value;
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') {
      if (YMD.test(v)) return Number.isNaN(ymdUtc(v)) ? v : shiftYmdDays(v, days);
      if (ISO.test(v)) {
        const t = Date.parse(v);
        return Number.isNaN(t) ? v : new Date(t + days * DAY).toISOString();
      }
      return v;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, SKIP_KEYS.has(k) ? x : walk(x)]));
    }
    return v;
  };
  return walk(value) as T;
}

interface Anchored {
  seedAnchor?: string;
  activities?: { id: string; at: string }[];
}

/** 保存データの初期データを作った日。無ければ最初の履歴（a1 = 作った 1.5 時間前）から推定し、それも無ければ today */
export function anchorOf(state: Anchored, today: string): string {
  if (state.seedAnchor && YMD.test(state.seedAnchor)) return state.seedAnchor;
  const a1 = state.activities?.find((a) => a.id === 'a1');
  const t = a1 ? Date.parse(a1.at) : NaN;
  return Number.isNaN(t) ? today : jstDay(new Date(t + 1.5 * 3_600_000));
}

/** 読み込んだ保存データを今日へ合わせ直す（seedAnchor を today にする） */
export function reanchor<S extends Anchored>(state: S, today: string): S {
  const days = daysBetweenYmd(anchorOf(state, today), today);
  const shifted = shiftDates(state, days);
  return shifted.seedAnchor === today ? shifted : { ...shifted, seedAnchor: today };
}
