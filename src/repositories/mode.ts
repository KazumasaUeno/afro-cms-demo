export type DataMode = 'demo' | 'live';

/**
 * データモード（BACKEND_FIREBASE §13.1 / BACKEND_PLAN C1・C2）。ビルド時に決まり、実行中に切り替えない。
 * `import.meta.env.VITE_DATA_MODE` は vite がビルド時に文字列へ置き換えるので、demo のビルドでは live の分岐が
 * tree-shake で落ちる（demo の dist に Firebase SDK を入れない）。未指定・'live' 以外は demo
 */
export const DATA_MODE: DataMode = import.meta.env.VITE_DATA_MODE === 'live' ? 'live' : 'demo';
