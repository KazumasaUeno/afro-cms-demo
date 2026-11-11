import { useProjectRoutes } from '@/features/projects/projectRoutes';
import { useDevUser } from '@/features/dev/useDevUser';

/**
 * 開発者画面（/dev/quality。0.27.0）で操作しているメンバーの id。管理者画面では undefined（確認者は従来どおり）。
 * 値があるときは開発者画面: アフロ側の確認だけを操作でき、顧客側は表示のみ
 */
export function useQualityDevBy(): string | undefined {
  const { dev } = useProjectRoutes();
  const me = useDevUser();
  return dev ? me.id : undefined;
}
