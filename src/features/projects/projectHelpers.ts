import type { DemoState, QualityCheck, Stage } from '@/types';
import { QUALITY_ITEMS } from '@/data/quality';
import { STAGES } from '@/data/projects';

/** 各段階から開ける関連画面 */
export const STAGE_LINKS: Record<Stage, { label: string; to: string }[]> = {
  requirements: [{ label: 'AI要件定義を開く', to: '/ai-studio' }],
  build: [
    { label: 'サイトマップ', to: '/site' },
    { label: 'デザインスタジオ', to: '/ai-studio/design' },
  ],
  quality: [{ label: '品質チェック', to: '/quality' }],
  operation: [{ label: 'CMSで更新', to: '/cms' }],
  improvement: [{ label: 'インサイト・改善提案', to: '/insights' }],
};

export const stagePrimaryRoute = (s: Stage): string => STAGE_LINKS[s][0].to;
export const stageLabel = (s: Stage): string => STAGES.find((x) => x.id === s)?.label ?? s;

/** アフロ・顧客の両方が確認した項目の割合（0-100） */
export function qualityCompletion(checks: Record<string, QualityCheck>): { done: number; total: number; percent: number } {
  const total = QUALITY_ITEMS.length;
  const done = QUALITY_ITEMS.filter((i) => checks[i.id]?.afroAt && checks[i.id]?.clientAt).length;
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}

/** 作業中プロジェクトで、次に取るべき行動（制作フローの未承認の最初の段階） */
export function nextBestAction(state: DemoState): { title: string; detail: string; to: string; cta: string } {
  const q = qualityCompletion(state.qualityChecks);
  if (state.requirements.status !== 'approved') {
    return {
      title: 'AI要件定義で、課題と目的を整理しましょう',
      detail: 'URLと課題を入力するだけで、AIが現行サイトを分析し、改善提案書のたたき台を作ります。',
      to: '/ai-studio', cta: 'AI要件定義を始める',
    };
  }
  if (!state.sitemap.approvedAt) {
    return {
      title: '改善後のサイトマップが承認待ちです',
      detail: '問い合わせまでの階層を3→1に短縮した構成案です。理由を確認して承認しましょう。',
      to: '/site', cta: 'サイトマップを確認',
    };
  }
  if (!state.design.approvedAt) {
    return {
      title: 'デザイン案3パターンが揃いました',
      detail: '要件定義から生成したミニマル・クリエイティブ・プレミアムの3案。採用すると全ページ構築へ進めます。',
      to: '/ai-studio/design', cta: 'デザイン案を比較する',
    };
  }
  if (q.percent < 100) {
    return {
      title: `品質チェックは残り ${q.total - q.done} 項目です`,
      detail: 'A区分（機械的に確認できる項目）は一括チェックで一気に進められます。',
      to: '/quality', cta: '品質チェックへ',
    };
  }
  return {
    title: '次回のAIサイト診断を実行できます',
    detail: '公開後4か月ごとの改善診断。8カテゴリー60問でサイトを評価し、改善提案を作ります。',
    to: '/insights', cta: 'インサイトを開く',
  };
}
