import { useDemo } from '@/store/DemoStore';
import { useQualityDevBy } from '@/features/quality/useQualityDevBy';
import { SitemapDevCommentPanelView } from './DevCommentView';

/** 読むだけの表示は DevCommentView.tsx（DemoStore を読まない。live・ポータルはそちらを import する） */
export { SitemapDevCommentView } from './DevCommentView';

/**
 * サイトマップの「開発担当者より」の欄（demo の入れ物。LIVE_SITEMAP_IMPL_PLAN P-13）。
 * 書けるのは開発者画面だけ・お客様の承認前だけ（ストア側 setSitemapDevComment でも止めている）。管理者画面と承認後は読むだけ
 */
export function SitemapDevCommentPanel() {
  const { state, dispatch } = useDemo();
  const devBy = useQualityDevBy();
  const locked = !!state.sitemap.approvedAt;
  return (
    <SitemapDevCommentPanelView
      saved={state.sitemap.devComment}
      writable={!!devBy && !locked}
      onSave={(text) => dispatch({ type: 'setSitemapDevComment', text, devBy })}
    />
  );
}
