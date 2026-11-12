import { DATA_MODE } from './mode';
import { useDemoRepositories } from './demo';
import type { Repositories } from './types';

export type * from './types';
export { DATA_MODE } from './mode';

/**
 * live（Firestore）の実装は src/live/ の入口が登録する（ここから live を import しない＝demo のビルドに Firebase を入れない。C2）。
 * 登録されていなければ動かさない（demo のデータへ黙って落とさない）
 */
let liveImpl: (() => Repositories) | null = null;
export function registerLiveRepositories(impl: () => Repositories): void {
  liveImpl = impl;
}
function useLiveRepositories(): Repositories {
  if (!liveImpl) throw new Error('live の repository が登録されていません（src/live/main.tsx）');
  return liveImpl();
}

/** 画面はこれだけを使う（DemoStore の dispatch を直接呼ばない）。モードはビルド時に決まるので、フックの呼び出し順は変わらない */
export const useRepositories: () => Repositories = DATA_MODE === 'live' ? useLiveRepositories : useDemoRepositories;

/** いま選んでいる案件の要件（画面の多くはこれを使う。projects.useCurrentId と requirements.useCurrent の組み合わせ） */
export function useCurrentRequirements() {
  const { projects, requirements } = useRepositories();
  return requirements.useCurrent(projects.useCurrentId());
}
