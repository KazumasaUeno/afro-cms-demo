import { useDemo } from '@/store/DemoStore';
import { BuildFlowNavView } from './BuildFlowNavView';

/**
 * 制作フローのナビ（demo の入れ物。DemoStore の値を BuildFlowNavView へ渡すだけ。LIVE_SITEMAP_IMPL_PLAN P-13）。
 * 見た目と行き先は BuildFlowNavView。live は BuildFlowNavView を直接使う（useDemo を呼ばない）
 */
export function BuildFlowNav() {
  const { state } = useDemo();
  return (
    <BuildFlowNavView
      done={{
        requirements: state.requirements.status === 'approved',
        schedule: !!state.schedule,
        sitemap: !!state.sitemap.approvedAt,
        design: !!state.design.approvedAt,
      }}
    />
  );
}
