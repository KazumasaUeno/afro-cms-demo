import { Button, Tooltip } from '@mui/material';
import { ExternalLink } from 'lucide-react';
import { useHref } from 'react-router-dom';
import { currentProject, useDemoOptional } from '@/store/DemoStore';
import { workOf } from '@/store/projectWork';
import { isSiteLive } from '@/data/projectContent';

/**
 * 制作中のサイトを新しいタブで見る（2026-11-18 ユーザー指示「品質チェック中に、制作中のサイトを見れるボタンが欲しい」）。
 * 採用したデザインの全画面プレビュー（/design-preview?mode=site）を開く。表示だけで、チェックは元の画面で行う。
 * 置き場所: 品質チェック（管理者・開発者）・お客様ポータルの品質確認・リリース画面・プロジェクト詳細（同日「プロジェクトに入ったところで見えるように」）・
 * お客様ポータルのホーム（同日「お客さんも見れるように」）。
 * projectId を渡すとその案件（プロジェクト詳細は URL の案件）、省略時は表示中の案件。デザインはその案件の制作データから取る。
 * デザインが未採用なら押せない（採用していない案を「制作中のサイト」として見せない）。デモのデータが無い（live）ときは出さない
 */
export function SitePreviewButton({ checkScreen = '品質チェック', projectId: projectIdProp, size, hideUntilReady }: { checkScreen?: string; projectId?: string; size?: 'small' | 'medium'; /** 採用前は押せないボタンではなく何も出さない（お客様ポータルのホーム） */ hideUntilReady?: boolean }) {
  const demo = useDemoOptional();
  const base = useHref('/design-preview');
  if (!demo) return null;
  const { state } = demo;
  const projectId = projectIdProp ?? currentProject(state).id;
  const design = workOf(state, projectId).design.selected;
  // 公開後（運用・改善の段階）は「公開中のサイト」と呼ぶ（0.46.1。開いた先の見出し・説明も同じ判定。DesignPreviewPage）
  const launched = isSiteLive(state.projects.find((p) => p.id === projectId)?.stage ?? 'hearing');
  if (!design && hideUntilReady) return null;
  const button = (
    <Button
      component="a" href={design ? `${base}?${new URLSearchParams({ project: projectId, design, mode: 'site', check: checkScreen })}` : undefined}
      target="_blank" rel="noopener noreferrer" variant="outlined" size={size} startIcon={<ExternalLink size={16} />} disabled={!design}
      sx={{ flexShrink: 0 }}
    >
      {launched ? '公開中のサイトを見る' : '制作中のサイトを見る'}
    </Button>
  );
  // 押せないボタンにも理由を出す（disabled の要素はマウスの出来事を受けないので span で包む）
  return design ? button : <Tooltip title="デザインが採用されると見られます"><span>{button}</span></Tooltip>;
}

/**
 * デザインがまだ無い案件の「制作中のサイトを見る」（押せない。上の SitePreviewButton の採用前と同じ見た目）。
 * live はデザインのデータを持たない（BACKEND_FIREBASE §14）ので、プロジェクト詳細はこれを出す（2026-11-26 live をデモと同じ見た目に）
 */
export function SitePreviewPendingButton({ size }: { size?: 'small' | 'medium' }) {
  return (
    <Tooltip title="デザインが採用されると見られます">
      <span>
        <Button component="a" target="_blank" rel="noopener noreferrer" variant="outlined" size={size} startIcon={<ExternalLink size={16} />} disabled sx={{ flexShrink: 0 }}>
          制作中のサイトを見る
        </Button>
      </span>
    </Tooltip>
  );
}
