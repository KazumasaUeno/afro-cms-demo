/**
 * デモの日付を「今日」に合わせ直す（SAFE ASSUMPTION lead 2026-11-24。ユーザーが変える可能性あり）。
 * 初期データの日付は作った日からの相対（daysAgo・daysFromNow）なので、保存したまま日がたつと、人によって予定がずれて見える
 * （11-17 に開いた人と今日開いた人で「今月の納品予定」が違う）。そこで、初期データを作った日（日本時間の yyyy-mm-dd）を
 * seedAnchor として保存し、読み込みのたびに「今日 − seedAnchor」日だけ保存データの日付をずらす。
 * - ずらすのは日付の項目（DATE_KEYS・名前が At で終わる項目・承認の依頼 approvalRequests の値）だけで、値がちょうど
 *   日付（yyyy-mm-dd）か ISO 日時（toISOString の形）のとき。文章・名前・メモ・チャットは日付の形でも触らない
 * - 初期データの日付も、デモで入力・操作した日付（日程・掲載期間など）も同じ日数だけずらす（デモの仕様。毎日ずれる。前後関係は変わらない）
 * - お客様の回答（answers）とフォームの入力値（values）は入力された内容なのでずらさない
 * - 素材ドライブの見本（preset のある素材）の createdAt は固定値（data/assets.ts の PRESET_AT）なのでずらさない（保存前の表示とそろえる）
 * - seedAnchor の無い古い保存データは、今日を seedAnchor にするだけでずらさない（古いデータは補う処理がその日の日付で作っているため。推定してずらすと行き過ぎる）
 * import は型だけにする（tests/unit から node --experimental-strip-types でそのまま読むため）。日本時間の今日は homeDues.jstYmd を使う
 */

const DAY = 86_400_000;
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
/** ずらさないキー（中身は入力された内容） */
const SKIP_KEYS = new Set(['answers', 'values', 'seedAnchor']);
/**
 * ずらす日付の項目（types/index.ts の ISODate・yyyy-mm-dd の項目）。名前が At で終わる項目（at・createdAt・startAt など）もずらす。
 * start / end は WBS の yyyy-mm-dd
 */
const DATE_KEYS = new Set(['at', 'start', 'end', 'buildDue', 'deliveryDate', 'releaseDate', 'launchDate']);
/** 値がすべて日付の入れ物（承認の依頼。キーは節目の名前） */
const DATE_RECORD_KEYS = new Set(['approvalRequests']);

const isDateKey = (k: string) => DATE_KEYS.has(k) || /At$/.test(k);

const ymdUtc = (ymd: string) => Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)));

/** 実在する日付の yyyy-mm-dd か（2026-02-30 などは false。日付へ直して戻したときに同じになるか） */
export function isYmd(v: unknown): v is string {
  if (typeof v !== 'string' || !YMD.test(v)) return false;
  const t = ymdUtc(v);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === v;
}

/** a から b までの日数（b が後なら正） */
export const daysBetweenYmd = (a: string, b: string) => Math.round((ymdUtc(b) - ymdUtc(a)) / DAY);

function shiftYmdDays(ymd: string, days: number): string {
  return new Date(ymdUtc(ymd) + days * DAY).toISOString().slice(0, 10);
}

/** 日付の項目の値を days 日ずらす。日付の形でなければそのまま */
function shiftValue(v: unknown, days: number): unknown {
  if (typeof v !== 'string') return v;
  if (YMD.test(v)) return isYmd(v) ? shiftYmdDays(v, days) : v;
  if (ISO.test(v)) {
    const t = Date.parse(v);
    return Number.isNaN(t) ? v : new Date(t + days * DAY).toISOString();
  }
  return v;
}

/** 値の中の日付の項目を days 日ずらす（新しい値を返す。元は変えない） */
export function shiftDates<T>(value: T, days: number): T {
  if (days === 0) return value;
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (!v || typeof v !== 'object') return v;
    const o = v as Record<string, unknown>;
    const preset = typeof o.preset === 'string' && o.preset !== '';
    return Object.fromEntries(
      Object.entries(o).map(([k, x]) => {
        if (SKIP_KEYS.has(k)) return [k, x];
        if (preset && k === 'createdAt') return [k, x];
        if (DATE_RECORD_KEYS.has(k) && x && typeof x === 'object' && !Array.isArray(x)) {
          return [k, Object.fromEntries(Object.entries(x as Record<string, unknown>).map(([rk, rx]) => [rk, shiftValue(rx, days)]))];
        }
        if (typeof x === 'string') return [k, isDateKey(k) ? shiftValue(x, days) : x];
        return [k, walk(x)];
      }),
    );
  };
  return walk(value) as T;
}

interface Anchored {
  seedAnchor?: string;
}

/** 今日へ合わせ直す必要があるか（seedAnchor が今日でない。開いたまま日本時間の 0 時をまたいだときも true） */
export const needsReanchor = (state: Anchored, today: string) => state.seedAnchor !== today;

/**
 * 保存データを今日へ合わせ直す（seedAnchor を today にする）。今日のままなら同じものを返す。
 * seedAnchor の無い（または壊れた）古い保存データは、ずらさずに seedAnchor を today にするだけ
 */
export function reanchor<S extends Anchored>(state: S, today: string): S {
  if (!needsReanchor(state, today)) return state;
  if (!isYmd(state.seedAnchor)) return { ...state, seedAnchor: today };
  const shifted = shiftDates(state, daysBetweenYmd(state.seedAnchor, today));
  return { ...shifted, seedAnchor: today };
}
