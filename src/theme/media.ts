/** レスポンシブ用のメディアクエリ（MUI の sx キーとしてそのまま使う） */

/** タッチ操作になる幅（md 未満）とタッチ端末。押せる領域を 44px 以上にする（iOS HIG） */
export const TOUCH = '@media (max-width: 899.95px), (pointer: coarse)';

/** 横向きのスマホ（高さが低い）。下部タブを隠し、キャンバス等の高さを画面に合わせる */
export const LANDSCAPE_PHONE_QUERY = '(orientation: landscape) and (max-height: 500px)';
export const LANDSCAPE_PHONE = `@media ${LANDSCAPE_PHONE_QUERY}`;
