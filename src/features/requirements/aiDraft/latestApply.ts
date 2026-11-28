/**
 * 「最新の値に当てる」変更関数（v3 の編集の欄を React.memo で包むための土台。docs/reviews/2026-11-28-reqdoc-edit-freeze.md）。
 * - 欄ごとの onChange が描画時点の文書（edit.local）を閉じ込めると、memo で描き直さなかった欄の onChange が古い文書を基に
 *   全体を作り直し、他の欄の入力を消す。ここでは毎回 ref の最新の文書に fn を当てるので、どの時点で作った onChange でも同じ結果になる
 * - ref は呼び出し側が描画のたびに最新へ合わせる。当てた直後にも進める（次の描画の前に 2 回呼ばれても前の変更を失わない）
 */
export type ApplyEdit<T> = (fn: (cur: T) => T) => void;

export function makeLatestApply<T>(latest: { current: T }, commit: { current: (next: T) => void }): ApplyEdit<T> {
  return (fn) => {
    const next = fn(latest.current);
    latest.current = next;
    commit.current(next);
  };
}
