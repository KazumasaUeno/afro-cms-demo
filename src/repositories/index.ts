import { DATA_MODE } from './mode';
import { useDemoRepositories } from './demo';
import type { Repositories } from './types';

export type * from './types';
export { DATA_MODE } from './mode';

/** live（Firestore）の実装は B で入れる。それまでは live のビルドを動かさない（demo のデータへ黙って落とさない） */
function useLiveRepositories(): Repositories {
  throw new Error('VITE_DATA_MODE=live はまだ使えません（BACKEND_PLAN の B で実装する）');
}

/** 画面はこれだけを使う（DemoStore の dispatch を直接呼ばない）。モードはビルド時に決まるので、フックの呼び出し順は変わらない */
export const useRepositories: () => Repositories = DATA_MODE === 'live' ? useLiveRepositories : useDemoRepositories;
