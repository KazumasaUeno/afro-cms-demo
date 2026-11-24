/**
 * 管理者ホームの予定の集計（制作の完了予定・納品完了予定・公開予定・今月の納品予定）。画面から切り離した純粋関数（2026-11-24 会議の指摘で切り出し）。
 * 日付は yyyy-mm-dd（スケジュールの値）。「今日」「今月」は日本時間（Asia/Tokyo）で決める（端末のタイムゾーンに左右されない）。
 * import は型だけにする（tests/unit から node --experimental-strip-types でそのまま読むため）
 */

export const HOME_TIME_ZONE = 'Asia/Tokyo';

/** 日本時間の今日（yyyy-mm-dd） */
export function jstYmd(now: Date): string {
  // en-CA は yyyy-mm-dd で出る
  return new Intl.DateTimeFormat('en-CA', { timeZone: HOME_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** 集計の入力（案件 1 件。p は画面の案件そのもの） */
export interface DueRow<P> {
  p: P;
  /** 案件の段階（operation・improvement は公開済み） */
  stage: string;
  schedule?: { buildDue?: string; deliveryDate?: string; releaseDate?: string };
  /** 案件の公開予定日（yyyy-mm-dd。Project.launchDate を日付にしたもの）。日程に公開予定日が無いときに使う（カードの releaseDateOf と同じ。2026-11-24） */
  launchDate?: string;
  /** 全ページの構築が完了している */
  buildCompleted: boolean;
  /** お客様の品質チェックの完了（納品検収）がある */
  qualityApproved: boolean;
}

export interface Due<P> { p: P; date: string }
export interface MonthDelivery<P> extends Due<P> { delivered: boolean }

/** サイトを公開済み（運用・改善の段階） */
export const isLaunched = (stage: string) => stage === 'operation' || stage === 'improvement';

/** 納品済み = 納品検収が済んだ、または公開済み */
export const isDelivered = <P>(r: DueRow<P>) => r.qualityApproved || isLaunched(r.stage);

const byDate = <P>(a: Due<P>, b: Due<P>) => a.date.localeCompare(b.date);

function collect<P>(rows: DueRow<P>[], pick: (r: DueRow<P>) => string | undefined): Due<P>[] {
  return rows
    .map((r) => ({ p: r.p, date: pick(r) }))
    .filter((x): x is Due<P> => !!x.date)
    .sort(byDate);
}

/** 制作の完了予定: 日程に制作の完了予定があり、全ページの構築が終わっていない案件。近い順 */
export const buildDues = <P>(rows: DueRow<P>[]) => collect(rows, (r) => (r.buildCompleted ? undefined : r.schedule?.buildDue));

/** 納品完了予定: 日程に納品予定日があり、まだ納品していない案件（期間は問わない。過ぎた日付も数える）。近い順 */
export const deliveryDues = <P>(rows: DueRow<P>[]) => collect(rows, (r) => (isDelivered(r) ? undefined : r.schedule?.deliveryDate));

/**
 * 公開予定: 公開予定日（日程の公開予定日、無ければ案件の公開予定日 launchDate）があり、まだ公開していない案件。近い順。
 * launchDate だけの案件も数える（カードの「公開予定」表示 releaseDateOf と件数をそろえる。SAFE ASSUMPTION lead 2026-11-24）
 */
export const releaseDues = <P>(rows: DueRow<P>[]) => collect(rows, (r) => (isLaunched(r.stage) ? undefined : r.schedule?.releaseDate || r.launchDate));

/**
 * 今月の納品予定: 納品予定日が日本時間の今月（1 日〜末日）の案件。納品済みの案件も含め、delivered で見分ける。
 * まだ納品していない案件を先に（近い順）、納品済みを後に（近い順）並べる（先頭の数件だけ出すときに未納品が隠れないように）
 */
export function monthDeliveries<P>(rows: DueRow<P>[], now: Date): MonthDelivery<P>[] {
  const month = jstYmd(now).slice(0, 7);
  return rows
    .map((r) => ({ p: r.p, date: r.schedule?.deliveryDate, delivered: isDelivered(r) }))
    .filter((x): x is MonthDelivery<P> => !!x.date && x.date.slice(0, 7) === month)
    .sort((a, b) => Number(a.delivered) - Number(b.delivered) || byDate(a, b));
}
