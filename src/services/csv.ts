/**
 * CSV の書き出し（ブラウザの中だけで作る。0.37.0 で承認の履歴 ApprovalHistory から切り出し、フォームの問い合わせでも使う）。
 * Excel で開けるよう BOM 付き UTF-8・CRLF。
 */

/** 秒まで・日本時間で出す（証跡なので分単位に丸めず、見る端末のタイムゾーンで変わらないようにする） */
export const jstStamp = (iso: string): string =>
  new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** Excel で数式として動かないよう、先頭が = + - @ タブ CR の値には ' を付ける */
export const csvCell = (v: string): string => {
  const g = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(g) ? `"${g.replace(/"/g, '""')}"` : g;
};

/** 行の配列を CSV の文字列にする（先頭に BOM） */
export const toCsv = (rows: string[][]): string => `\uFEFF${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
